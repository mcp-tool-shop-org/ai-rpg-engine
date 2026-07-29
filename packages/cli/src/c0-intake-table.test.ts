// c0-intake-table.test.ts — P2 of the C0 Forge↔Engine alignment audit.
//
// The export half of this audit lives in world-forge and answers "what does the
// lane put in the pack?". This half answers the harder question: "what does the
// ENGINE do with what arrives?" — and it answers it by RUNNING things, not by
// diffing types.
//
// Three instruments, in increasing strength:
//
//   1. THE LOADER PROBE — runs the real `loadContentFromFile` on the real
//      exported pack (`__fixtures__/c0-forge-pack.json`, byte-for-byte what
//      world-forge's `exportToEngine` produced) and records, per top-level key,
//      whether the loader validated it, silently preserved it as an unknown
//      key, or errored.
//
//   2. THE DIFFERENTIAL-MUTATION PROBE — boots a real starter pack at a pinned
//      seed, plays N full rounds, and hashes the resulting event stream. Then
//      it re-boots, mutates ONE `ZoneState` field, replays the same rounds at
//      the same seed, and compares. A field whose mutation changes the stream
//      is ALIVE AS RULES. A field whose mutation changes NOTHING is inert —
//      and that is a claim about behaviour, not about grep counts.
//
//      v3.7's tell, taken seriously: a probe whose measurement never moves is
//      probably not measuring. So the probe ships its own calibration — a
//      mutation KNOWN to be live must diverge, and a no-op mutation must not.
//      Both run in this commit.
//
//   3. THE BOOT-GAP PROOF — a test that the loaded pack has no route into a
//      `WorldStore`: the loader's only production caller is the `validate`
//      command, `PackEntry` has no content field, and the external-pack loader
//      requires a JS module exporting `createGame`. Grep evidence PLUS a live
//      demonstration that the loaded pack cannot produce a world.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { loadContentFromFile, zoneDefinitionToState, type ContentPack } from '@ai-rpg-engine/content-schema';
import type { Engine, ZoneState } from '@ai-rpg-engine/core';
import { allPacks, type PackInfo } from './packs.js';
import { runHostileRound } from './bin.js';
import { resolveExternalEntry, loadExternalPack, PackLoadError } from './external-pack.js';
// The SAME player POR-1 / POC-1 / the fallout suites drive. Reused rather than
// approximated: an approximated player was the first draft's whole problem.
import { playerHalfRound } from './packs-opportunity-reachability.test.js';
import { FIXTURE_PACK_PATH, scratchPackPath } from './c0/fixture-path.js';

// --- Pins (PIN_PER_STEP) --------------------------------------------------

/** Every probe in this file boots the same world at the same seed. */
const C0_SEED = 71;
/**
 * POR-1's pinned session length. A short run is a weak instrument: at 12 rounds
 * the player had not yet crossed every zone of the five-zone chapel graph, so
 * fields read only in the zones they had not entered measured as inert.
 */
const C0_ROUNDS = 40;
/**
 * The proof pack: starter-fantasy's world (`chapel-threshold`) — the reference
 * starter, and the one that authors a hazard closure to probe against.
 */
const C0_PACK_ID = 'chapel-threshold';

export { FIXTURE_PACK_PATH } from './c0/fixture-path.js';

// --- Instrument 1: the loader probe --------------------------------------

/**
 * Keys the engine's own `ContentPack` type declares (content-schema/src/refs.ts).
 *
 * ⚠ FLIPPED BY C1/P1 (the pinned-test rule). C0 measured ten declared keys and
 * nine silently-preserved unknown ones. C1 declared four of those nine —
 * `schemaVersion` (a real emitted key that had been sitting in the same bucket
 * as a typo), plus C0's "three cheap wire gaps" `districts`, `buildCatalog` and
 * `progressionTrees`. The finding this list pins did not go away; it got
 * smaller, and the SILENT-PASS test below now measures the remainder.
 */
const ENGINE_DECLARED_KEYS = [
  'entities', 'zones', 'dialogues', 'quests', 'abilities',
  'statuses', 'verbs', 'archetypes', 'backgrounds', 'itemUseEffects',
  // Declared by C1/P1:
  'schemaVersion', 'districts', 'buildCatalog', 'progressionTrees',
  // Declared by C3/P1 — the space vocabulary's first two keys.
  'placements', 'encounterAnchors',
] as const;

/** Keys the loader shape-guard actually checks for array-ness (loader.ts:53). */
const LOADER_SHAPE_CHECKED_KEYS = ['entities', 'zones', 'dialogues', 'quests'] as const;

export type IntakeClass =
  | 'alive-as-rules'
  | 'stored-inert'
  | 'validated-only'
  | 'unknown-key'
  | 'unreachable-from-pack';

// --- Instrument 2: the differential-mutation probe ------------------------

function packOf(id: string): PackInfo {
  const p = allPacks.find((x) => x.meta.id === id);
  if (!p) throw new Error(`pack ${id} not found; have: ${allPacks.map((x) => x.meta.id).join(', ')}`);
  return p;
}

/**
 * Play a fixed session and hash everything the world emitted.
 *
 * The hash covers the full event log (type + payload + tick), so ANY behavioural
 * consequence of the mutation shows up — not just the one the prober guessed at.
 * That is the point: a hand-picked assertion can only find the consequence you
 * already believed in.
 *
 * ⚠ THE PLAYER HALF IS LOAD-BEARING, and the first draft of this file omitted
 * it. `runHostileRound` drives NPC turns, companion turns and the world tick —
 * but not the player. With no player actions nothing ever moves, so severing
 * every zone's `neighbors` produced a BYTE-IDENTICAL fingerprint and the probe
 * reported the movement gate dead. That is v3.7's tell exactly: a measurement
 * that changes by zero is usually not a measurement. Same class of error POR-1
 * documents against itself, which is why `playerHalfRound` is exported and
 * reused here instead of re-invented.
 */
export interface Fingerprint {
  /** Number of events the session emitted. */
  events: number;
  /**
   * The SIMULATION's end state — the whole world minus the zone records
   * themselves (which the probe mutates directly) and minus the event log
   * (which is the other tier). A field that moves this changed what the
   * simulation computed: it is alive as rules.
   *
   * An earlier draft used `type|tick` event-sequence hashing for this tier and
   * it was too coarse in the wrong direction: emptying every zone's `tags`
   * changes combat outcomes without changing WHICH event types fire in which
   * order, so `tags` — one of the most-read fields in the engine — measured as
   * presentation-only. Sequence identity is not outcome identity.
   */
  state: string;
  /**
   * `type|tick|payload` over the full event log — what happened AND what was
   * said about it. A field that moves only this is carried into presentation
   * without changing any outcome. `zone.name` is the witness.
   */
  narration: string;
}

function sessionFingerprint(packId: string, mutate?: (engine: Engine) => void): Fingerprint {
  const pack = packOf(packId);
  const engine = pack.createGame(C0_SEED);
  if (mutate) mutate(engine);

  const loaded = { meta: pack.meta, createGame: pack.createGame };
  const visits = new Map<string, number>();
  for (let round = 0; round < C0_ROUNDS; round++) {
    playerHalfRound(engine, round, 'engaged', visits);
    runHostileRound(engine, loaded as never, { log: () => {} });
  }

  const log = (engine.world.eventLog ?? []) as Array<Record<string, unknown>>;
  const narration = createHash('sha256');
  for (const e of log) {
    narration.update(`${String(e.type)}|${String(e.tick)}|${JSON.stringify(e.payload ?? {})}\n`);
  }

  // Everything the simulation computed, minus the two things the probe itself
  // touches or reads separately.
  const { zones: _zones, eventLog: _log, ...simState } = engine.world as unknown as Record<string, unknown>;
  const state = createHash('sha256').update(stableStringify(simState)).digest('hex');

  return {
    events: log.length,
    state: state.slice(0, 16),
    narration: narration.digest('hex').slice(0, 16),
  };
}

/** Key-sorted JSON so object insertion order cannot masquerade as a state change. */
function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_k, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(value as object).sort()) {
        out[k] = (value as Record<string, unknown>)[k];
      }
      return out;
    }
    return value;
  });
}

export type Divergence = 'none' | 'presentation-only' | 'simulation';

function classify(baseline: Fingerprint, mutated: Fingerprint): Divergence {
  if (mutated.state !== baseline.state || mutated.events !== baseline.events) return 'simulation';
  return mutated.narration !== baseline.narration ? 'presentation-only' : 'none';
}

/** One played session per pack, computed once and shared by every probe. */
const CATALOG_BASELINES = new Map<string, Fingerprint>(
  allPacks.map((p) => [p.meta.id, sessionFingerprint(p.meta.id)]),
);

export interface SweepResult {
  simulation: string[];
  presentationOnly: string[];
  none: string[];
}

/**
 * Run one mutation across the WHOLE CATALOG and report which worlds it moved.
 *
 * Catalog-wide is not thoroughness for its own sake — it is the difference
 * between a true verdict and a false one. Probed against `chapel-threshold`
 * alone, clearing every zone's `tags` moves nothing, and this file's first
 * draft was about to record the engine's most-read zone field as inert. Across
 * the catalog the same field moves the simulation in eight of twelve worlds.
 * A single-world probe measures the world, not the engine.
 */
function sweepCatalog(mutate: (z: ZoneState) => void): SweepResult {
  const out: SweepResult = { simulation: [], presentationOnly: [], none: [] };
  for (const pack of allPacks) {
    const baseline = CATALOG_BASELINES.get(pack.meta.id)!;
    const verdict = classify(baseline, sessionFingerprint(pack.meta.id, mutateAllZones(mutate)));
    if (verdict === 'simulation') out.simulation.push(pack.meta.id);
    else if (verdict === 'presentation-only') out.presentationOnly.push(pack.meta.id);
    else out.none.push(pack.meta.id);
  }
  return out;
}

/** Mutate every zone in the booted world, before the first round runs. */
function mutateAllZones(fn: (z: ZoneState) => void): (engine: Engine) => void {
  return (engine) => {
    for (const zone of Object.values(engine.world.zones)) fn(zone as ZoneState);
  };
}

// --- Tests ----------------------------------------------------------------

describe('C0/P2 — instrument 1: the real loader on the real exported pack', () => {
  const result = loadContentFromFile(FIXTURE_PACK_PATH);
  const raw = JSON.parse(fs.readFileSync(FIXTURE_PACK_PATH, 'utf-8')) as Record<string, unknown>;

  it('the fixture on disk is the pack world-forge actually emitted', () => {
    // Guards against this fixture drifting into a hand-tuned pack that passes.
    // ⚠ `placements` added by C3/P1, in the position the exporter emits it
    // (immediately after `entities`, because it is about them).
    expect(Object.keys(raw)).toEqual([
      'schemaVersion', 'entities', 'placements', 'zones', 'districts', 'dialogues', 'items',
      'playerTemplate', 'buildCatalog', 'progressionTrees',
      'encounterAnchors', 'factionPresences', 'pressureHotspots',
    ]);
  });

  it('loads with ok:true — a 2.x-shaped pack passes today\'s validators', () => {
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('the summary counts only the four keys the loader knows about', () => {
    // 3 entities, 3 zones, 1 dialogue, 0 quests — of TWELVE top-level keys.
    expect(result.summary).toBe('Content loaded: 3 entities, 3 zones, 1 dialogues, 0 quests');
  });

  it('SILENT PASS: the remaining unknown keys are preserved and never mentioned', () => {
    // ⚠ FLIPPED TWICE. C0 asserted nine silently-preserved unknown keys; C1/P1
    // declared four, leaving five; C3/P1 declares `encounterAnchors`, leaving
    // FOUR. The silent-pass BEHAVIOUR is still here and still pinned — declaring
    // a key stops it being unknown, it does not make the loader loud. Making it
    // loud is the key-allowlist gate (C1/P2), asserted in `c1-gate.test.ts`.
    //
    // ⚠ AND THIS PIN IS DEFINED BY SUBTRACTION, which C1's ledger entry 4 names
    // as a shape that drifts: the subject is "exported keys minus declared keys",
    // so it moves whenever EITHER side moves. That is tolerable here only because
    // the expected list is written out literally below — a subtraction pin with a
    // computed expectation would pass no matter what happened.
    const exported = Object.keys(raw);
    const unknown = exported.filter(
      (k) => !(ENGINE_DECLARED_KEYS as readonly string[]).includes(k),
    );
    expect(unknown.sort()).toEqual([
      'factionPresences', 'items', 'playerTemplate', 'pressureHotspots',
    ]);

    // Each one survives the load untouched…
    const loadedPack = result.pack as unknown as Record<string, unknown>;
    for (const k of unknown) {
      expect(loadedPack[k], `${k} should be preserved verbatim`).toEqual(raw[k]);
    }
    // …and none of them appears anywhere in the report the user reads.
    for (const k of unknown) {
      expect(result.summary).not.toContain(k);
    }
    expect(result.advisories).toEqual([]);
  });

  it('SILENT PASS, second axis: a pure nonsense key loads just as clean', () => {
    // The instrument's own negative control for "unknown-key". If a garbage key
    // is indistinguishable from `districts`, then "the loader accepted it" is
    // not evidence the engine understands it.
    const tmp = scratchPackPath('nonsense-key');
    fs.writeFileSync(tmp, JSON.stringify({ ...raw, thisKeyIsNotAThing: [{ id: 'x' }] }), 'utf-8');
    try {
      const r = loadContentFromFile(tmp);
      expect(r.ok).toBe(true);
      expect(r.errors).toEqual([]);
      expect(r.summary).toBe(result.summary); // byte-identical report
      expect((r.pack as unknown as Record<string, unknown>).thisKeyIsNotAThing).toBeDefined();
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });

  it('RED: the loader DOES reject a malformed pack, so ok:true means something', () => {
    const tmp = scratchPackPath('malformed');
    fs.writeFileSync(tmp, JSON.stringify({ ...raw, zones: [{ name: 'no id' }] }), 'utf-8');
    try {
      const r = loadContentFromFile(tmp);
      expect(r.ok).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });

  it('CLOSED BY C1/P2: all TWELVE refs-iterated keys are shape-guarded, none raw-throws', () => {
    // ⚠ FLIPPED BY C1/P2. C0 asserted the opposite and pinned it by asserting the
    // throw: the shape guard covered four keys — entities, zones, dialogues,
    // quests — while `validateRefs` went on to do `pack.abilities?.map(...)` on
    // six MORE, so a non-array in any of those six escaped as a raw TypeError,
    // straight past the boundary discipline loader.ts's own docstring promises
    // ("never a raw fs throw", "the caller never sees a raw SyntaxError").
    //
    // The guard list is now the iteration list. This test walks ALL TWELVE and
    // requires a structured error from every one — so the finding cannot
    // half-regress by someone adding an iterated key without a guard.
    //
    // ⚠ AND C3/P1 IS THE FIRST TIME THAT MATTERED. It added exactly such a pair:
    // `placements` and `encounterAnchors` are both iterated by `validateRefs`
    // (placement entity/zone resolution, anchor zone/enemy resolution), so both
    // joined the guard list in the same commit as their iteration. This test is
    // what would have caught it had they not.
    const tmp = scratchPackPath('badshape');
    const REFS_ITERATED_KEYS = [
      'entities', 'zones', 'dialogues', 'quests', 'abilities',
      'statuses', 'verbs', 'archetypes', 'backgrounds', 'itemUseEffects',
      // C3/P1:
      'placements', 'encounterAnchors',
    ] as const;

    // The four that were always guarded are still guarded…
    expect(LOADER_SHAPE_CHECKED_KEYS.every((k) => (REFS_ITERATED_KEYS as readonly string[]).includes(k))).toBe(true);

    // …and every one of the ten now fails structurally rather than throwing.
    for (const key of REFS_ITERATED_KEYS) {
      fs.writeFileSync(tmp, JSON.stringify({ ...raw, [key]: 'not-an-array' }), 'utf-8');
      try {
        let threw: unknown;
        let r!: ReturnType<typeof loadContentFromFile>;
        try {
          r = loadContentFromFile(tmp);
        } catch (e) {
          threw = e;
        }
        expect(threw, `${key} must not raw-throw`).toBeUndefined();
        expect(r.ok, `${key} must be refused`).toBe(false);
        expect(
          r.errors.some((e) => e.path === `pack.${key}`),
          `${key} must produce a structured pack.${key} error, got: ${JSON.stringify(r.errors)}`,
        ).toBe(true);
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    }
  });

  it('zone excess properties are accepted without comment', () => {
    // validateZoneDefinition (validate.ts:397) has no excess-property rejection,
    // so a zone carrying the whole dropped 2.5D vocabulary would load clean —
    // which is why the export lane dropping it produces no error anywhere.
    const tmp = scratchPackPath('excess');
    const zones = (raw.zones as Record<string, unknown>[]).map((z) => ({
      ...z,
      elevation: 42,
      stratumId: 'stratum-sky',
      entryGate: { conditions: ['item:rope'], mode: 'hard' },
      hazardRefs: ['hazard-void-drop'],
      physicsMode: 'zero-g',
    }));
    fs.writeFileSync(tmp, JSON.stringify({ ...raw, zones }), 'utf-8');
    try {
      const r = loadContentFromFile(tmp);
      expect(r.ok).toBe(true);
      expect(r.errors).toEqual([]);
      // Preserved, undeclared, unread.
      expect((r.pack.zones as unknown as Record<string, unknown>[])[0].elevation).toBe(42);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });
});

describe('C0/P2 — instrument 2 calibration (both directions, this commit)', () => {
  const baseline = CATALOG_BASELINES.get(C0_PACK_ID)!;

  it('the session is deterministic: two unmutated runs fingerprint identically', () => {
    expect(sessionFingerprint(C0_PACK_ID)).toEqual(baseline);
    // A thin session cannot discriminate. The first draft of this probe scored
    // THIRTEEN events across 12 rounds because it never drove the player half
    // of the round; a real played session is two orders of magnitude busier.
    expect(baseline.events).toBeGreaterThan(100);
  });

  it('every pack in the catalog plays a non-trivial session', () => {
    // A pack whose baseline is empty contributes a free "same" to every sweep
    // below, silently diluting the counts.
    for (const [id, fp] of CATALOG_BASELINES) {
      expect(fp.events, `${id} played an empty session`).toBeGreaterThan(50);
    }
  });

  it('GREEN calibration: a mutation known to be live moves the SIMULATION needle', () => {
    // Emptying every zone neighbour list severs the movement graph. If this
    // does not diverge, the probe is not measuring and every inert verdict
    // below is worthless.
    const severed = sessionFingerprint(C0_PACK_ID, mutateAllZones((z) => { z.neighbors = []; }));
    expect(classify(baseline, severed)).toBe('simulation');
  });

  it('RED calibration: a no-op mutation moves NEITHER needle', () => {
    // Re-assigning identical values must be invisible. Without this, "diverged"
    // could just mean "touching a zone perturbs the run".
    const noop = sessionFingerprint(C0_PACK_ID, mutateAllZones((z) => { z.tags = [...z.tags]; }));
    expect(classify(baseline, noop)).toBe('none');
  });

  it('CALIBRATION: the two tiers are genuinely separable', () => {
    // If nothing ever lands in `presentation-only`, the second tier is
    // decoration and the instrument is really single-tier. `zone.name` is the
    // witness: it rides along in event payloads and changes no rule.
    const renamed = sessionFingerprint(C0_PACK_ID, mutateAllZones((z) => { z.name = `C0 ${z.name}`; }));
    expect(classify(baseline, renamed)).toBe('presentation-only');
  });
});

/**
 * The measured intake table for `ZoneState`, swept across all twelve shipped
 * worlds. Every verdict came off the probe; the source citations say WHERE to
 * look, the measurement says what it MEANT in played sessions.
 */
export const ZONE_FIELD_VERDICTS: Array<{
  field: keyof ZoneState;
  label: string;
  mutate: (z: ZoneState) => void;
  /** How many of the twelve worlds this mutation must move, at minimum. */
  minSimulationPacks: number;
  intakeClass: IntakeClass;
  note: string;
}> = [
  {
    field: 'neighbors',
    label: 'sever the movement graph',
    mutate: (z) => { z.neighbors = []; },
    minSimulationPacks: 10,
    intakeClass: 'alive-as-rules',
    note: 'The movement gate (modules/src/traversal-core.ts:46) and the most consequential zone field in the engine.',
  },
  {
    field: 'tags',
    label: 'add the safe-zone tag',
    mutate: (z) => { z.tags = [...z.tags, 'safe']; },
    minSimulationPacks: 6,
    intakeClass: 'alive-as-rules',
    note: 'Read by encounter-spawn validZoneTags, chokepoint/ambush selection (combat-core.ts:514, engagement-core.ts:240-422), and combat-recovery safe-zone (default safeZoneTags is [safe], combat-recovery.ts:197).',
  },
  {
    field: 'light',
    label: 'drop every zone to pitch dark',
    mutate: (z) => { z.light = 0; },
    minSimulationPacks: 1,
    intakeClass: 'alive-as-rules',
    note: 'Perception threshold (perception-filter.ts:336-337).',
  },
  {
    field: 'noise',
    label: 'raise ambient noise to maximum',
    mutate: (z) => { z.noise = 10; },
    minSimulationPacks: 1,
    intakeClass: 'alive-as-rules',
    note: 'Hearing threshold (perception-filter.ts:342-343). Note cognition-core.ts:1172 reads only the DYNAMIC override, not this authored base.',
  },
  {
    field: 'hazards',
    label: 'add a hazard string the pack code matches',
    mutate: (z) => { z.hazards = [...(z.hazards ?? []), 'unstable floor']; },
    minSimulationPacks: 1,
    intakeClass: 'alive-as-rules',
    note: 'ALIVE ONLY VIA PACK CODE — see the hazard-pair probe below. The string itself carries no engine semantics.',
  },
  {
    field: 'roomId',
    label: 'rewrite every room id',
    mutate: (z) => { z.roomId = 'c0-rewritten'; },
    minSimulationPacks: 0,
    intakeClass: 'stored-inert',
    note: 'Required by ZoneState, written by all twelve starters, read by nothing but its own declaration and two test files.',
  },
  {
    field: 'stability',
    label: 'set stability on every zone',
    mutate: (z) => { z.stability = 1; },
    minSimulationPacks: 1,
    intakeClass: 'unreachable-from-pack',
    note: 'THE SHARPEST ROW IN THIS TABLE, and a correction to my own first classification: `stability` is genuinely ALIVE — district-core.ts:348 aggregates it into district stability, rumor-propagation.ts:226 gates rumour spread on it, cognition-core.ts:1173 and observer-presentation.ts:395 read it — and it is simultaneously UNAUTHORABLE, because `ZoneDefinition` has no such field. A live rule input no content pack can reach. I filed it as inert on the strength of it sitting next to `authority` in the type; the catalog sweep moved four worlds and refused the claim.',
  },
  {
    field: 'authority',
    label: 'set authority on every zone',
    mutate: (z) => { z.authority = { 'c0-probe': 99 }; },
    minSimulationPacks: 0,
    intakeClass: 'unreachable-from-pack',
    note: 'Zero readers repo-wide AND absent from ZoneDefinition — unauthorable and unread. The contrast with `stability`, which sits on the adjacent line of the same type and is alive in four worlds, is why this table is measured rather than read off the source.',
  },
  {
    field: 'interactables',
    label: 'replace every interactable',
    mutate: (z) => { z.interactables = ['c0-probe-object']; },
    minSimulationPacks: 0,
    intakeClass: 'stored-inert',
    note: 'Rendered at terminal-ui/src/renderer.ts:725-729 and nowhere else. Measured MORE inert than expected: it does not reach the event log either, so it is read only when a human is looking at a rendered screen.',
  },
  {
    field: 'name',
    label: 'rename every zone',
    mutate: (z) => { z.name = `C0 ${z.name}`; },
    minSimulationPacks: 0,
    intakeClass: 'stored-inert',
    note: 'Display data that rides in event payloads. The witness for the presentation tier.',
  },
];

/** Filled by the sweep below; consumed by the artifact writer. */
export const ZONE_SWEEP_RESULTS = new Map<string, SweepResult>();

describe('C0/P2 — instrument 2: what the engine does with each ZoneState field, across all 12 worlds', () => {
  for (const row of ZONE_FIELD_VERDICTS) {
    it(`${row.field} — ${row.label} → ${row.intakeClass}`, () => {
      const sweep = sweepCatalog(row.mutate);
      ZONE_SWEEP_RESULTS.set(row.field as string, sweep);
      expect(
        sweep.simulation.length,
        `${row.note} | moved simulation in: [${sweep.simulation.join(' ')}]`,
      ).toBeGreaterThanOrEqual(row.minSimulationPacks);
      if (row.minSimulationPacks === 0) {
        // An inert claim is only worth making if it can fail, so assert it
        // exactly: zero worlds, not "few".
        expect(sweep.simulation, `${row.field} must move NO world simulation`).toEqual([]);
      }
    });
  }

  it('THE HAZARD PAIR: the same field, one string meaningful and one inert', () => {
    // The sharpest single measurement in this audit. Two mutations of the SAME
    // field, differing only in which string is added:
    //
    //   'unstable floor'  — starter-fantasy ships a closure that matches it
    //                       (setup.ts:137), so it changes the simulation.
    //   'loose cobbles'   — no closure anywhere mentions it, so it changes
    //                       nothing in any of the twelve worlds.
    //
    // Hazard strings carry NO engine semantics. Their meaning is supplied by
    // JavaScript the pack ships (environment-core.ts:295 calls
    // `hazard.condition(zone, entity, world)`). A world-forge export is
    // data-only JSON and ships no closures, so every hazard it carries is
    // necessarily of the second kind — the one zone field the lane transports
    // faithfully still arrives inert.
    const meaningful = sweepCatalog((z) => { z.hazards = [...(z.hazards ?? []), 'unstable floor']; });
    const inert = sweepCatalog((z) => { z.hazards = [...(z.hazards ?? []), 'loose cobbles']; });
    expect(meaningful.simulation.length).toBeGreaterThan(0);
    expect(inert.simulation).toEqual([]);
  });

  it('read-by-a-rule is not the same claim as consequential-in-this-world', () => {
    // CLEARING every zone tag moves only a couple of the twelve worlds, while
    // ADDING the one tag combat-recovery gates on moves most of them. Both are
    // true of the same field. Recorded because it bounds what every
    // alive-as-rules verdict here means: the reader is real, the consequence is
    // world-dependent — and a single-world probe gets this backwards. Against
    // `chapel-threshold` alone, NEITHER tag mutation moves anything, and this
    // file's first draft was about to file the engine's most-read zone field
    // as inert on that evidence.
    const cleared = sweepCatalog((z) => { z.tags = []; });
    const addedSafe = sweepCatalog((z) => { z.tags = [...z.tags, 'safe']; });
    expect(addedSafe.simulation.length).toBeGreaterThan(cleared.simulation.length);
    expect(cleared.simulation.length).toBeGreaterThan(0);
    expect(cleared.simulation).not.toContain(C0_PACK_ID);
  });
});

describe('C0/P2 — instrument 3: the boot gap, proven mechanically', () => {
  it('a loaded ContentPack exposes no createGame and no world', () => {
    const r = loadContentFromFile(FIXTURE_PACK_PATH);
    expect(r.ok).toBe(true);
    const asAny = r.pack as unknown as Record<string, unknown>;
    expect(asAny.createGame).toBeUndefined();
    expect(asAny.world).toBeUndefined();
    // LoadFromFileResult carries a report, not a runtime.
    expect(Object.keys(r).sort()).toEqual(['advisories', 'errors', 'ok', 'pack', 'summary']);
  });

  it('the external-pack loader REFUSES a content-pack JSON', async () => {
    // `ai-rpg-engine run <path>` is the only route a user has for external
    // content, and it wants a JS module exporting createGame — not a pack file.
    // The path RESOLVES (so this is not a file-not-found artefact) and then the
    // contract check rejects it.
    expect(resolveExternalEntry(FIXTURE_PACK_PATH)).toBe(FIXTURE_PACK_PATH);

    let caught: unknown;
    try {
      await loadExternalPack(FIXTURE_PACK_PATH);
    } catch (e) {
      caught = e;
    }
    expect(caught, 'a content pack must not load as a runnable pack').toBeInstanceOf(PackLoadError);
    const err = caught as PackLoadError;
    expect(err.hint).toContain('createGame');
  });

  it('CLOSED BY C1/P1: a ZoneDefinition → ZoneState converter now bridges the gap', () => {
    // ⚠ FLIPPED BY C1/P1 (the pinned-test rule: closing a finding without
    // flipping its pin in the same commit is a defect, not a green).
    //
    // C0 asserted the opposite — "no exported pack can produce a storable zone
    // without a converter inventing one, and no converter exists." The type
    // mismatch it rests on is unchanged and still asserted below: `ZoneState`
    // demands `roomId`, `ZoneDefinition` still has no such field. What changed
    // is that a converter now DERIVES it (zone id), so the gap is bridged rather
    // than closed by a schema change.
    //
    // The behavioural proof — that converted zones bear rules in a played
    // session — lives in c1-intake-boot.test.ts. This stays a structural pin.
    const r = loadContentFromFile(FIXTURE_PACK_PATH);
    const zoneDef = (r.pack.zones ?? [])[0] as unknown as Record<string, unknown>;
    expect(zoneDef).toBeDefined();
    expect(zoneDef.roomId, 'the definition still has no roomId — that has not changed').toBeUndefined();

    // The converter supplies it, and produces a zone the store accepts.
    const converted = zoneDefinitionToState(r.pack.zones![0]);
    expect(typeof converted.roomId).toBe('string');
    expect(converted.roomId.length).toBeGreaterThan(0);

    const engine = packOf(C0_PACK_ID).createGame(C0_SEED);
    engine.store.addZone(converted);
    const stored = engine.world.zones[converted.id] as ZoneState;
    expect(stored).toBeDefined();
    expect(stored.roomId).toBe(converted.roomId);

    // …and a code-authored zone still looks the same way, for contrast.
    const live = Object.values(engine.world.zones)[0] as ZoneState;
    expect(typeof live.roomId).toBe('string');
    expect(live.roomId.length).toBeGreaterThan(0);
  });

  it('every shipped pack builds its world in CODE, never from a pack file', () => {
    // If any pack loaded content from JSON, this audit's headline would be
    // wrong. Boot all of them and confirm each produced zones anyway.
    for (const pack of allPacks) {
      const engine = pack.createGame(C0_SEED);
      const zoneCount = Object.keys(engine.world.zones).length;
      expect(zoneCount, `${pack.meta.id} should author zones in code`).toBeGreaterThan(0);
    }
  });
});

/** Re-exported so the intake-table artifact writer can reuse the same pins. */
export const C0_PINS = { seed: C0_SEED, rounds: C0_ROUNDS, packId: C0_PACK_ID };
export type { ContentPack };

// --- The machine-readable intake artifact ---------------------------------

/**
 * Intake classes for the twelve keys world-forge actually exports.
 *
 * Note what is NOT in this list: `alive-as-rules`. No exported key can earn it,
 * because no route exists from a loaded pack into a `WorldStore` (instrument 3).
 * The best any pack key achieves today is `validated-only`.
 */
const EXPORTED_KEY_CLASSES: Array<{ key: string; class: IntakeClass; note: string }> = [
  { key: 'schemaVersion', class: 'unknown-key', note: 'Not declared by the engine ContentPack type; preserved, never read.' },
  { key: 'entities', class: 'validated-only', note: 'Declared, shape-guarded, per-element validated by validateEntityBlueprint, cross-ref checked. Reaches no runtime.' },
  // ⚠ C3/P1. `placements` is the only key in this table whose class is
  // `alive-as-rules` — it writes EntityState.zoneId, which every zone-scoped
  // reader in the engine consults. The rest of this table is a C0 snapshot and
  // stays one (the classes here describe what the C0 audit measured); this row
  // is added because completeness is asserted against the fixture's key list on
  // line 734, so a new exported key MUST get a row or the artifact test fails.
  // That coupling is deliberate and it worked.
  { key: 'placements', class: 'alive-as-rules', note: 'C3/P1: declared, shape-guarded, per-element validated by validateEntityPlacementRecord, and ROUTED — applyContentPack writes EntityState.zoneId from it. Closes C0 §2\'s single most consequential drop.' },
  { key: 'zones', class: 'validated-only', note: 'Declared, shape-guarded, per-element validated by validateZoneDefinition (which does no excess-property rejection). Reaches no runtime; no ZoneDefinition-to-ZoneState converter exists.' },
  { key: 'districts', class: 'unknown-key', note: 'NOT declared by the engine ContentPack type — yet DistrictDefinition is a real engine type with a live district-core behind it. The data arrives in a shape the engine understands, in a slot nothing reads.' },
  { key: 'dialogues', class: 'validated-only', note: 'Declared, shape-guarded, per-element validated. Reaches no runtime.' },
  { key: 'items', class: 'unknown-key', note: 'NOT declared by the engine ContentPack type. ItemDefinition is a real equipment-package type; the pack key is not.' },
  { key: 'playerTemplate', class: 'unknown-key', note: 'NOT declared, and zero hits for `playerTemplate` anywhere in the engine repo.' },
  { key: 'buildCatalog', class: 'unknown-key', note: 'NOT declared by ContentPack, though `buildCatalog` is a live engine concept — fed through PackInfo, in code, by every starter.' },
  { key: 'progressionTrees', class: 'unknown-key', note: 'NOT declared by ContentPack, though ProgressionTreeDefinition is a content-schema type and PackInfo carries progressionTrees in code.' },
  // ⚠ C3/P1 FLIPPED THIS ROW. C0's note — "Zero hits repo-wide. Dead on
  // arrival." — was accurate and is now false: the key is declared, and an
  // intake channel registers it into `encounter-spawn`'s own content registry,
  // so an anchor produces real spawns off the module's existing deterministic
  // roll. It is `alive-as-rules` on the strength of a played session, not on the
  // strength of being declared — which is the distinction C1's `light` finding
  // was about.
  { key: 'encounterAnchors', class: 'alive-as-rules', note: 'C3/P1: declared and ROUTED into encounter-spawn\'s registry (was "zero hits repo-wide, dead on arrival"). Contributes per-zone spawn tables plus two axes the module had no expression for: probability and cooldownTurns.' },
  { key: 'factionPresences', class: 'unknown-key', note: 'Zero hits repo-wide for the plural pack key. (The singular `factionPresence` appears as a local in district-core and as a DERIVED field in strategic-map — unrelated, and a trap for a naive grep.)' },
  { key: 'pressureHotspots', class: 'unknown-key', note: 'Zero hits repo-wide. Dead on arrival.' },
];

/**
 * `ZoneDefinition` fields, classified against `ZoneState` and its readers.
 *
 * READ THE HYPOTHETICAL CAREFULLY: no converter turns a `ZoneDefinition` into a
 * `ZoneState`, so nothing here describes what an exported pack does today. It
 * describes what each field WOULD be worth if C1/C3 built the intake seam. The
 * aliveness verdicts are measured on `ZoneState`, which the starters author in
 * code.
 */
const ZONE_DEFINITION_FIELD_CLASSES: Array<{ field: string; class: IntakeClass; note: string }> = [
  { field: 'id', class: 'alive-as-rules', note: 'Identity; every zone lookup keys on it.' },
  { field: 'name', class: 'stored-inert', note: 'Presentation only — measured: moves narration, never simulation.' },
  { field: 'tags', class: 'alive-as-rules', note: 'Measured live in 8 of 12 worlds via the safe-zone gate.' },
  { field: 'description', class: 'validated-only', note: 'TextBlock array; consumed by the renderer, no rule reads it.' },
  { field: 'neighbors', class: 'alive-as-rules', note: 'Measured live in 11 of 12 worlds. The movement gate.' },
  { field: 'light', class: 'alive-as-rules', note: 'Measured live. Perception threshold.' },
  { field: 'noise', class: 'alive-as-rules', note: 'Measured live. Hearing threshold.' },
  { field: 'hazards', class: 'alive-as-rules', note: 'Live ONLY where pack CODE supplies a matching closure. A data-only pack ships none, so exported hazards would arrive inert even if a converter existed.' },
  { field: 'interactables', class: 'stored-inert', note: 'Measured: moves neither simulation nor event log. Renderer-only.' },
  { field: 'entities', class: 'unreachable-from-pack', note: 'Declared on ZoneDefinition, never emitted by the export lane, and ZoneState has no matching field.' },
  { field: 'exits', class: 'validated-only', note: 'ConditionSpec is validated (validate.ts:258-267) and evaluated NOWHERE. ZoneState has no exits field at all; traversal gates on neighbors only.' },
];

/** ZoneState fields with no ZoneDefinition counterpart — unauthorable by construction. */
const ZONE_STATE_ONLY_FIELDS = ['roomId', 'stability', 'authority'] as const;

describe('C0/P2 — the machine-readable intake artifact', () => {
  it('writes docs/c0-alignment/intake-table.json', () => {
    const raw = JSON.parse(fs.readFileSync(FIXTURE_PACK_PATH, 'utf-8')) as Record<string, unknown>;
    const load = loadContentFromFile(FIXTURE_PACK_PATH);

    // Completeness: every exported key has exactly one row, and vice versa.
    expect(EXPORTED_KEY_CLASSES.map((r) => r.key).sort()).toEqual(Object.keys(raw).sort());

    const artifact = {
      audit: 'C0 — Engine intake truth table',
      direction: 'exported ContentPack -> engine runtime',
      generatedBy: 'packages/cli/src/c0-intake-table.test.ts',
      pins: {
        seed: C0_SEED,
        rounds: C0_ROUNDS,
        calibrationPack: C0_PACK_ID,
        packsSwept: allPacks.length,
      },
      loaderVerdict: {
        ok: load.ok,
        errors: load.errors,
        advisories: load.advisories,
        summary: load.summary,
        comment:
          'A pack the exporter stamps engineVersion 2.0.0 loads clean against the 3.8.0 validators, and the report the user reads mentions four of its twelve keys.',
      },
      bootGap: {
        loaderProductionCallSites: ['packages/cli/src/validate.ts:18,63'],
        packEntryHasContentField: false,
        zoneDefinitionToZoneStateConverter: null,
        externalPackContract: 'a JS module exporting createGame(seed?) — not a content-pack JSON',
        comment:
          'The exported pack has exactly one consumer in the engine: a command that prints a report and exits.',
      },
      exportedKeys: EXPORTED_KEY_CLASSES,
      zoneDefinitionFields: ZONE_DEFINITION_FIELD_CLASSES,
      zoneStateOnlyFields: ZONE_STATE_ONLY_FIELDS,
      zoneStateMeasurements: ZONE_FIELD_VERDICTS.map((row) => {
        const sweep = ZONE_SWEEP_RESULTS.get(row.field as string);
        return {
          field: row.field,
          probe: row.label,
          intakeClass: row.intakeClass,
          movedSimulationIn: sweep?.simulation ?? [],
          movedNarrationOnlyIn: sweep?.presentationOnly ?? [],
          unmovedIn: sweep?.none ?? [],
          note: row.note,
        };
      }),
      tally: {
        exportedKeys: EXPORTED_KEY_CLASSES.reduce<Record<string, number>>((acc, r) => {
          acc[r.class] = (acc[r.class] ?? 0) + 1;
          return acc;
        }, {}),
        zoneDefinitionFields: ZONE_DEFINITION_FIELD_CLASSES.reduce<Record<string, number>>((acc, r) => {
          acc[r.class] = (acc[r.class] ?? 0) + 1;
          return acc;
        }, {}),
      },
    };

    // The sweep map must have been populated by the suite above; an empty map
    // would produce a table of blanks that still looks complete.
    const everyPackAccountedFor = artifact.zoneStateMeasurements.every(
      (m) =>
        m.movedSimulationIn.length + m.movedNarrationOnlyIn.length + m.unmovedIn.length ===
        allPacks.length,
    );
    expect(everyPackAccountedFor, 'sweep results missing — the artifact would be blanks').toBe(true);

    const outDir = path.resolve(import.meta.dirname, '../../../docs/c0-alignment');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, 'intake-table.json'),
      `${JSON.stringify(artifact, null, 2)}\n`,
      'utf-8',
    );
  });
});
