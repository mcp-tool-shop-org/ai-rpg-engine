// c1-intake-boot.test.ts — P1's proof: the C0 fixture pack BOOTS.
//
// C0's headline was that the Forge→Engine content path is a validator, not a
// loader: `ai-rpg-engine validate` printed a report and exited, and 0 of 12
// exported keys reached a runtime (docs/c0-alignment/REPORT.md §1, §3).
//
// This file answers that with the strongest instrument C0 built, re-pointed at
// converted content. It does NOT assert that the converter ran. It plays a real
// session — the CLI's own round loop, at C0's pinned seed and round count — in a
// world whose zones arrived through `applyContentPack` from the byte-identical
// world-forge export, and then MEASURES whether those zones bear rules, by
// mutating one field at a time and comparing session fingerprints.
//
// The distinction matters. "The zone is in world.zones" is a storage claim.
// "Changing this zone's `light` changes what the simulation computes" is a
// behaviour claim, and it is the only one that answers C1's definition of real:
// reaches a runtime.
//
// The code host is starter-fantasy. That is not a workaround — it is the boot
// contract this cycle decided on evidence (CONTRACT.md §2, RG-C1 Lane 1): a pack
// is a FUNCTION, `createGame` supplies modules/ruleset/closures, and the wire
// carries declarative content into the world that code builds.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import {
  applyContentPack,
  loadContentFromFile,
  type ContentPack,
} from '@ai-rpg-engine/content-schema';
import { createStandardChannels } from '@ai-rpg-engine/modules';
import type { Engine, ZoneState } from '@ai-rpg-engine/core';
import { allPacks, type PackInfo } from './packs.js';
import { runHostileRound } from './bin.js';
import { playerHalfRound } from './packs-opportunity-reachability.test.js';
import { FIXTURE_PACK_PATH } from './c0/fixture-path.js';

// --- Pins (PIN_PER_STEP) — C0's, unchanged, so the two cycles are comparable --

const C1_SEED = 71;
const C1_ROUNDS = 40;
/** The code host. starter-fantasy is C0's proof pack too. */
const HOST_PACK_ID = 'chapel-threshold';
/** The three zones world-forge exported, in the order the fixture carries them. */
const CONVERTED_ZONE_IDS = ['zone-surface-yard', 'zone-under-vault', 'zone-sky-gantry'] as const;

function hostPack(): PackInfo {
  const p = allPacks.find((x) => x.meta.id === HOST_PACK_ID);
  if (!p) throw new Error(`pack ${HOST_PACK_ID} not found`);
  return p;
}

function fixturePack(): ContentPack {
  const r = loadContentFromFile(FIXTURE_PACK_PATH);
  if (!r.ok) throw new Error(`fixture pack failed to load: ${r.summary}`);
  return r.pack;
}

// --- The session instrument (C0's, re-pointed at converted content) ---------

interface Fingerprint {
  events: number;
  state: string;
  narration: string;
}

/** Key-sorted JSON so insertion order cannot masquerade as a state change. */
function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_k, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(value as object).sort()) out[k] = (value as Record<string, unknown>)[k];
      return out;
    }
    return value;
  });
}

/**
 * Boot the host pack, apply the forge export, stand the player in a CONVERTED
 * zone, and play `C1_ROUNDS` rounds of the CLI's own loop.
 *
 * `mutate` runs after intake and before the first round — the same hook C0 used,
 * so a field's aliveness is measured the same way in both cycles.
 */
function convertedSessionFingerprint(mutate?: (engine: Engine) => void): Fingerprint {
  const pack = hostPack();
  const engine = pack.createGame(C1_SEED);

  const result = applyContentPack(engine, fixturePack(), {
    channels: createStandardChannels(),
    prevalidated: true,
  });
  if (!result.ok) throw new Error(`intake failed: ${JSON.stringify(result.errors)}`);

  // Stand the player in a converted zone. `playerHalfRound` walks toward the
  // least-visited exit, so from here the session traverses the exported graph
  // (yard ↔ undervault ↔ gantry) rather than the host pack's own rooms.
  const player = engine.store.getEntity(engine.world.playerId);
  if (!player) throw new Error('host pack has no player entity');
  engine.store.addEntity({ ...player, zoneId: CONVERTED_ZONE_IDS[0] });

  if (mutate) mutate(engine);

  const loaded = { meta: pack.meta, createGame: pack.createGame };
  const visits = new Map<string, number>();
  for (let round = 0; round < C1_ROUNDS; round++) {
    playerHalfRound(engine, round, 'engaged', visits);
    runHostileRound(engine, loaded as never, { log: () => {} });
  }

  const log = (engine.world.eventLog ?? []) as Array<Record<string, unknown>>;
  const narration = createHash('sha256');
  for (const e of log) {
    narration.update(`${String(e.type)}|${String(e.tick)}|${JSON.stringify(e.payload ?? {})}\n`);
  }
  const { zones: _zones, eventLog: _log, ...simState } = engine.world as unknown as Record<string, unknown>;

  return {
    events: log.length,
    state: createHash('sha256').update(stableStringify(simState)).digest('hex').slice(0, 16),
    narration: narration.digest('hex').slice(0, 16),
  };
}

/** Mutate only the zones that ARRIVED FROM THE EXPORT — never the host's own. */
function mutateConvertedZones(fn: (z: ZoneState) => void): (engine: Engine) => void {
  return (engine) => {
    for (const id of CONVERTED_ZONE_IDS) {
      const z = engine.world.zones[id] as ZoneState | undefined;
      if (!z) throw new Error(`converted zone ${id} missing — intake did not run`);
      fn(z);
    }
  };
}

type Divergence = 'none' | 'presentation-only' | 'simulation';
function classify(base: Fingerprint, mutated: Fingerprint): Divergence {
  if (mutated.state !== base.state || mutated.events !== base.events) return 'simulation';
  return mutated.narration !== base.narration ? 'presentation-only' : 'none';
}

const BASELINE = convertedSessionFingerprint();

// --- Instrument 1: the pack reaches a world ---------------------------------

describe('C1/P1 — the exported pack reaches a running world', () => {
  const pack = hostPack();

  it('the fixture is still the byte-identical export C0 committed', () => {
    // Guards against this proof drifting onto a hand-tuned pack that boots.
    const raw = JSON.parse(fs.readFileSync(FIXTURE_PACK_PATH, 'utf-8')) as Record<string, unknown>;
    expect(Object.keys(raw)).toEqual([
      'schemaVersion', 'entities', 'zones', 'districts', 'dialogues', 'items',
      'playerTemplate', 'buildCatalog', 'progressionTrees',
      'encounterAnchors', 'factionPresences', 'pressureHotspots',
    ]);
  });

  it('CLOSES C0 §3.3: a converter exists and produces storable zones', () => {
    // C0's pinned finding read: "no ZoneDefinition → ZoneState converter exists
    // to bridge the gap ... ZoneState demands roomId; ZoneDefinition has no such
    // field, so no exported pack can produce a storable zone without a converter
    // inventing one — and no converter exists." One exists now, and this is the
    // same structural check with the verdict flipped.
    const engine = pack.createGame(C1_SEED);
    const before = Object.keys(engine.world.zones).length;

    const r = applyContentPack(engine, fixturePack(), { channels: createStandardChannels(), prevalidated: true });

    expect(r.ok).toBe(true);
    expect(r.applied.zones).toBe(3);
    expect(Object.keys(engine.world.zones).length).toBe(before + 3);

    for (const id of CONVERTED_ZONE_IDS) {
      const z = engine.world.zones[id] as ZoneState;
      expect(z, `${id} should be in the world`).toBeDefined();
      // The derived field the store requires and the definition never had.
      expect(typeof z.roomId).toBe('string');
      expect(z.roomId.length).toBeGreaterThan(0);
    }
  });

  it('CLOSES a wire gap: districts reach district-core state, not a slot nothing reads', () => {
    const engine = pack.createGame(C1_SEED);
    const r = applyContentPack(engine, fixturePack(), { channels: createStandardChannels(), prevalidated: true });

    expect(r.applied.districts).toBe(2);
    const state = engine.world.modules['district-core'] as {
      definitions: Record<string, unknown>;
      districts: Record<string, { commerce: number }>;
      zoneToDistrict: Record<string, string>;
    };
    expect(state.definitions['district-harbourside']).toBeDefined();
    // The authored baseMetric survived into live district state — the one lever
    // of the living economy C0 found carried lossless (REPORT §4's bright line).
    expect(state.districts['district-harbourside'].commerce).toBe(55);
    expect(state.zoneToDistrict['zone-surface-yard']).toBe('district-harbourside');
  });

  it('reports the two session-scoped keys instead of pretending it applied them', () => {
    const engine = pack.createGame(C1_SEED);
    const r = applyContentPack(engine, fixturePack(), { channels: createStandardChannels(), prevalidated: true });
    const scoped = r.dropped.filter((d) => d.reason === 'session-scoped').map((d) => d.path).sort();
    expect(scoped).toEqual(['pack.buildCatalog', 'pack.progressionTrees']);
  });

  it('a played session runs to completion in the converted world', () => {
    expect(BASELINE.events).toBeGreaterThan(0);
    expect(BASELINE.state).toMatch(/^[0-9a-f]{16}$/);
  });

  it('the player actually walks the exported graph — not just stands in it', () => {
    // A session that never leaves the first zone would make every neighbour-
    // dependent measurement below meaningless. This is the same class of error
    // C0's ledger entry 1 records: the probe that drove no player.
    const engine = hostPack().createGame(C1_SEED);
    applyContentPack(engine, fixturePack(), { channels: createStandardChannels(), prevalidated: true });
    const player = engine.store.getEntity(engine.world.playerId)!;
    engine.store.addEntity({ ...player, zoneId: CONVERTED_ZONE_IDS[0] });

    const loaded = { meta: hostPack().meta, createGame: hostPack().createGame };
    const visits = new Map<string, number>();
    for (let round = 0; round < C1_ROUNDS; round++) {
      playerHalfRound(engine, round, 'engaged', visits);
      runHostileRound(engine, loaded as never, { log: () => {} });
    }

    const visitedConverted = [...visits.keys()].filter((z) =>
      (CONVERTED_ZONE_IDS as readonly string[]).includes(z),
    );
    // ALL THREE, not "more than one". The weaker assertion was what I first
    // wrote, and it would have let the report cite a visit distribution no
    // committed test backed — a number true when I measured it by hand and
    // unguarded thereafter. If a claim is worth putting in the report it is
    // worth pinning here.
    expect(visitedConverted.sort()).toEqual([...CONVERTED_ZONE_IDS].sort());
    for (const id of CONVERTED_ZONE_IDS) {
      expect(visits.get(id) ?? 0, `${id} should be entered more than once`).toBeGreaterThan(1);
    }
  });
});

// --- Instrument 2: converted zones BEAR RULES -------------------------------

describe('C1/P1 — the alive-as-rules fields fire on CONVERTED content', () => {
  // C0's catalog sweep measured these four alive on zones the starters author in
  // CODE: light 12/12, noise 12/12, neighbors 11/12, tags 8+3/12. The open
  // question C0 could not answer was whether a zone that arrived through the
  // export lane would carry the same weight. It does, and this measures it.

  it('light — MEASURED INERT on converted content (and my hypothesis was refuted)', () => {
    // ⚠ This assertion is the opposite of what I wrote first, and chasing it was
    // the most useful hour of the phase.
    //
    // C0 measured `light` alive in 12 of 12 worlds, so I asserted 'simulation'
    // and got 'none'. I then hypothesised the cause: `light`'s reader
    // (runPerceptionCheck, perception-filter.ts:323) reads `observer.zoneId`,
    // and the exported pack's entities carry NO zoneId at all — verified
    // directly on the fixture, all three entities lack the field, because
    // EntityBlueprint has no location field (C0 REPORT §2). So, I reasoned,
    // nobody stands in a converted zone and nobody's light is ever read.
    //
    // THAT HYPOTHESIS IS REFUTED. Placing an AI observer in a converted zone
    // does not make light alive; neither does a CONTROLLED placement that
    // re-pins the observer to the player's zone every round for all 40 rounds
    // (the sim relocates NPCs, so a one-shot placement is not a placement — that
    // was the second wrong version). Both measured 'none'.
    //
    // What is MEASURED, and all this test claims: on this converted subgraph the
    // field is inert, across every variant tried. The reader is reached only
    // through perception layers this content never triggers — the session emits
    // zero perception events start to finish. Carrying a field is necessary and
    // not sufficient: a rule needs the REST of its inputs present, and the
    // exported vocabulary supplies none of them (no placement, no AI profiles,
    // no perception-layer config). That is a C3 finding, stated as measured
    // rather than dressed up as a wire success.
    const v = classify(BASELINE, convertedSessionFingerprint(mutateConvertedZones((z) => { z.light = 0; })));
    expect(v).toBe('none');
  });

  it('CONTROL for the above: the fingerprint machinery CAN see light', () => {
    // Without this, "light is inert on converted zones" is indistinguishable
    // from "this probe is blind to light", and the finding above would be worth
    // nothing.
    //
    // ⚠ The first version of this control was itself wrong, and is the third
    // mistake this one field produced. It darkened the HOST pack's zones inside
    // the CONVERTED session — but in that session the player is relocated into
    // the three-zone exported subgraph and never returns, so nothing exercises
    // any zone's light, host or converted. It measured 'none' and would have
    // "proved" the probe blind.
    //
    // The valid control reproduces C0's own session shape: the host pack played
    // its own way, no intake, no relocation, every zone darkened. Same hashing,
    // same seed, same round count. It moves — so the machinery sees the field,
    // and the finding above is about the content, not the instrument.
    const pack = hostPack();
    const hostSession = (mutate?: (e: Engine) => void): Fingerprint => {
      const engine = pack.createGame(C1_SEED);
      if (mutate) mutate(engine);
      const loaded = { meta: pack.meta, createGame: pack.createGame };
      const visits = new Map<string, number>();
      for (let round = 0; round < C1_ROUNDS; round++) {
        playerHalfRound(engine, round, 'engaged', visits);
        runHostileRound(engine, loaded as never, { log: () => {} });
      }
      const log = (engine.world.eventLog ?? []) as Array<Record<string, unknown>>;
      const narration = createHash('sha256');
      for (const e of log) narration.update(`${String(e.type)}|${String(e.tick)}|${JSON.stringify(e.payload ?? {})}\n`);
      const { zones: _z, eventLog: _l, ...sim } = engine.world as unknown as Record<string, unknown>;
      return {
        events: log.length,
        state: createHash('sha256').update(stableStringify(sim)).digest('hex').slice(0, 16),
        narration: narration.digest('hex').slice(0, 16),
      };
    };

    const base = hostSession();
    const dark = hostSession((engine) => {
      for (const z of Object.values(engine.world.zones)) (z as ZoneState).light = 0;
    });
    expect(classify(base, dark)).toBe('simulation');
  });

  it('noise — same', () => {
    const v = classify(BASELINE, convertedSessionFingerprint(mutateConvertedZones((z) => { z.noise = 10; })));
    expect(v).toBe('simulation');
  });

  it('neighbors — severing the exported graph changes the session', () => {
    const v = classify(BASELINE, convertedSessionFingerprint(mutateConvertedZones((z) => { z.neighbors = []; })));
    expect(v).toBe('simulation');
  });

  it('tags — the safe-zone tag lands as a rule on converted zones', () => {
    const v = classify(BASELINE, convertedSessionFingerprint(mutateConvertedZones((z) => {
      z.tags = z.tags.filter((t) => t !== 'safe').concat('safe');
      if (z.id === 'zone-under-vault') z.tags = ['safe'];
    })));
    expect(v).not.toBe('none');
  });

  it('RED CONTROL: a no-op mutation on the same zones changes NOTHING', () => {
    // Without this the four assertions above prove only that the harness is
    // noisy. v3.7's tell, and C0's: a measurement that always moves is not a
    // measurement either.
    const v = classify(BASELINE, convertedSessionFingerprint(mutateConvertedZones((z) => {
      z.tags = [...z.tags];
      z.neighbors = [...z.neighbors];
    })));
    expect(v).toBe('none');
  });

  it('RED CONTROL: an inert field stays inert on converted zones too', () => {
    // `interactables` measured 0/12 in C0. If the harness reported it alive, the
    // instrument would be measuring the intake rather than the field.
    const v = classify(BASELINE, convertedSessionFingerprint(mutateConvertedZones((z) => {
      z.interactables = ['a wholly invented lever'];
    })));
    expect(v).toBe('none');
  });

  it('HONEST NEGATIVE: a hazard string no pack closure matches is still inert', () => {
    // Carried faithfully, and provably worth nothing without pack code — C0's
    // sharpest measurement, re-confirmed on converted content. This is the
    // finding typed hazards (C3) exist to fix; C1 does not paper over it.
    const v = classify(BASELINE, convertedSessionFingerprint(mutateConvertedZones((z) => {
      z.hazards = ['loose cobbles'];
    })));
    expect(v).toBe('none');
  });

  it('and the SAME field with a string the host pack DOES close over is alive', () => {
    // The other half of the pair. starter-fantasy's closure matches 'unstable
    // floor' at setup.ts:137. Same field, same converted zones, different string:
    // the difference is pack code, exactly as C0 measured.
    const v = classify(BASELINE, convertedSessionFingerprint(mutateConvertedZones((z) => {
      z.hazards = ['unstable floor'];
    })));
    expect(v).toBe('simulation');
  });
});

// --- Determinism ------------------------------------------------------------

describe('C1/P1 — intake is deterministic', () => {
  it('two identical intake runs at the same seed fingerprint identically', () => {
    expect(convertedSessionFingerprint()).toEqual(BASELINE);
  });

  it('applying the same pack twice is idempotent in world state', () => {
    const engine = hostPack().createGame(C1_SEED);
    applyContentPack(engine, fixturePack(), { channels: createStandardChannels(), prevalidated: true });
    const once = stableStringify(engine.world.zones);
    applyContentPack(engine, fixturePack(), { channels: createStandardChannels(), prevalidated: true });
    expect(stableStringify(engine.world.zones)).toBe(once);
  });
});
