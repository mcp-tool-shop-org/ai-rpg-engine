// c3-typed-hazards.test.ts — C3/P3's proof: THE 'loose cobbles' FLIP.
//
// This is the arc's sharpest measurement, inverted.
//
// C0 §3.2 swept ONE zone field two ways across all twelve shipped worlds:
//
//   'unstable floor'  → moved the simulation (starter-fantasy ships a closure
//                       that matches it, setup.ts:137)
//   'loose cobbles'   → moved NOTHING, in any of the twelve worlds, because no
//                       closure anywhere references it
//
// "Hazard strings carry no engine semantics; their meaning is JavaScript the pack
// ships, invoked at environment-core.ts:295. A data-only JSON export ships no
// closures, so the one rule-bearing zone field the lane transports faithfully
// still arrives inert."
//
// C1 re-confirmed it on CONVERTED content in both directions and refused to paper
// over it. C0 §9 called typed hazards "the highest-value single item, because it
// closes a STRUCTURAL hole rather than a wire hole: today hazard meaning lives in
// pack closures, so NO data format can express it."
//
// ⚠ THE CONTRAST IS PRESERVED ON PURPOSE. It would be easy to make the string case
// work too and lose the measurement. The string case stays exactly as inert as C0
// measured it; only the TYPED case moves. That difference IS the finding, and a
// test that erased it would be worth less than the fix.

import { describe, it, expect } from 'vitest';
import { applyContentPack, loadContentFromFile, type ContentPack } from '@ai-rpg-engine/content-schema';
import {
  createStandardChannels,
  applyTypedHazards,
  getTypedHazardsForZone,
  registerTypedHazards,
  unregisterTypedHazards,
  runTypedHazardEntryStep,
  hazardBlocksEntry,
  HAZARD_DEPTH_LIMIT,
  type HazardSpec,
} from '@ai-rpg-engine/modules';
import type { Engine } from '@ai-rpg-engine/core';
import { allPacks, type PackInfo } from './packs.js';
import { FIXTURE_PACK_PATH } from './c0/fixture-path.js';
import { openAllGates } from './c3/open-gates.js';

const SEED = 71;
const HOST_PACK_ID = 'chapel-threshold';

/** C0's two hazard strings, verbatim. The whole test rests on these exact values. */
const MATCHED_STRING = 'unstable floor';
const UNMATCHED_STRING = 'loose cobbles';

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

function bootWithExport(): Engine {
  const engine = hostPack().createGame(SEED);
  const r = applyContentPack(engine, fixturePack(), {
    channels: createStandardChannels(),
    prevalidated: true,
  });
  if (!r.ok) throw new Error(`intake failed: ${JSON.stringify(r.errors)}`);
  openAllGates(engine);
  return engine;
}

/** A minimal host with no typed hazards registered, for the string-case control. */
function bootBare(): Engine {
  unregisterTypedHazards(HOST_PACK_ID);
  return hostPack().createGame(SEED);
}

/** Stand a fresh probe entity in a zone and return it. */
function standProbe(engine: Engine, zoneId: string, tags: string[] = []): string {
  const id = 'probe-1';
  engine.store.addEntity({
    id, blueprintId: id, type: 'npc', name: 'Probe', tags,
    stats: {}, resources: { hp: 40, maxHp: 40 }, statuses: [], zoneId,
  });
  return id;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE FLIP
// ═══════════════════════════════════════════════════════════════════════════

describe("C3/P3 — THE 'loose cobbles' FLIP", () => {
  it("BEFORE: 'loose cobbles' as a bare STRING is still inert — C0's measurement, unchanged", () => {
    // The half that must NOT change. No typed hazards registered; the string is in
    // `zone.hazards` exactly as the lane has always carried it, and no closure
    // anywhere references it.
    const engine = bootBare();
    const zoneId = Object.keys(engine.world.zones)[0];
    const zone = engine.world.zones[zoneId];
    engine.store.addZone({ ...zone, hazards: [UNMATCHED_STRING] });
    const probe = standProbe(engine, zoneId);
    const hpBefore = engine.world.entities[probe].resources.hp;

    // Nothing to apply: the interpreter finds no typed hazard for this zone.
    expect(getTypedHazardsForZone(engine.world, zoneId)).toEqual([]);
    const { applications } = applyTypedHazards(engine, zoneId, engine.world.entities[probe], 'on-enter');
    expect(applications).toEqual([]);
    expect(engine.world.entities[probe].resources.hp).toBe(hpBefore);
  });

  it("AFTER: the SAME string as a typed HazardSpec moves the simulation — with NO pack code", () => {
    // ⚠ THE POINT OF THE WHOLE PHASE. Same id, same zone, same probe. The only
    // difference is that the hazard arrives as DATA the engine understands rather
    // than as a string awaiting a closure that does not exist.
    const engine = bootBare();
    const zoneId = Object.keys(engine.world.zones)[0];
    const probe = standProbe(engine, zoneId);
    const hpBefore = engine.world.entities[probe].resources.hp;

    const spec: HazardSpec = {
      id: UNMATCHED_STRING,
      name: 'Loose Cobbles',
      effects: [{ kind: 'damage', amount: 3, tickOn: 'turn-end' }],
      trigger: 'on-enter',
      tags: [],
    };
    registerTypedHazards(engine.world.meta.gameId, [spec], { [zoneId]: [UNMATCHED_STRING] });

    const { applications } = applyTypedHazards(engine, zoneId, engine.world.entities[probe], 'on-enter');

    expect(applications).toHaveLength(1);
    expect(applications[0].applied).toContain('damage');
    expect(engine.world.entities[probe].resources.hp).toBe(hpBefore - 3);
    // …and a player-visible event through the canonical emit path.
    const events = engine.world.eventLog.filter((e) => e.type === 'hazard.damage.applied');
    expect(events).toHaveLength(1);
    expect((events[0].payload as { hazardName: string }).hazardName).toBe('Loose Cobbles');

    unregisterTypedHazards(engine.world.meta.gameId);
  });

  it("CONTROL: the MATCHED string ('unstable floor') behaves as C0 measured — closures still work", () => {
    // The escape hatch. OpenRA's mature endpoint is data-by-default with a DECLARED
    // code hatch (RG-C1 Lane 1); typed hazards are the default and pack closures
    // still run. If this broke, C3 would have replaced a working mechanism instead
    // of adding one.
    //
    // `starter-fantasy`'s closure matches this string at setup.ts:137, and C0
    // measured it moving the simulation in that world. What is asserted here is the
    // narrow, checkable half: the string is carried onto the zone and the typed
    // interpreter does not interfere with it.
    const engine = bootBare();
    const zoneId = Object.keys(engine.world.zones)[0];
    const zone = engine.world.zones[zoneId];
    engine.store.addZone({ ...zone, hazards: [MATCHED_STRING] });
    expect(engine.world.zones[zoneId].hazards).toContain(MATCHED_STRING);
    // No typed hazard registered ⇒ the interpreter is a no-op, so whatever the
    // pack's closure does is unchanged by C3.
    expect(getTypedHazardsForZone(engine.world, zoneId)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The forge's authored hazards, end to end
// ═══════════════════════════════════════════════════════════════════════════

describe('C3/P3 — the forge export carries typed hazards into a running world', () => {
  it('the authored definitions registered, bound to the zones that reference them', () => {
    const engine = bootWithExport();
    // The fixture authors three hazards and binds them via zone `hazardRefs`.
    const vault = getTypedHazardsForZone(engine.world, 'zone-under-vault');
    expect(vault.map((h) => h.id).sort()).toEqual(['hazard-black-water', 'hazard-void-drop']);
    const yard = getTypedHazardsForZone(engine.world, 'zone-surface-yard');
    expect(yard.map((h) => h.id)).toEqual(['hazard-scalding-steam']);
  });

  it('walking into a hazardous zone applies it — through the real move verb', () => {
    // The full input chain, not a direct call: a real `move` produces
    // `world.zone.entered`, the cursor-driven step reads the delta, and the hazard
    // fires. C1's `light` lesson is that carrying a field proves nothing without
    // the rest of its inputs, so the inputs are all real here.
    const engine = bootWithExport();
    const player = engine.store.getEntity(engine.world.playerId)!;
    engine.store.addEntity({ ...player, zoneId: 'zone-surface-yard', resources: { ...player.resources, hp: 40, maxHp: 40 } });

    engine.submitAction('move', { targetIds: ['zone-under-vault'] });
    const entered = engine.world.eventLog.some((e) => e.type === 'world.zone.entered');
    expect(entered, 'the move must have succeeded').toBe(true);

    const applications = runTypedHazardEntryStep(engine);
    const ids = applications.map((a) => a.hazardId);
    // `hazard-void-drop` is the vault's on-enter hazard.
    expect(ids.length, `nothing fired: ${JSON.stringify(applications)}`).toBeGreaterThan(0);
  });

  it('a hazardRef matching no definition is REPORTED at intake, not silently skipped', () => {
    // The phantom-module-id shape again: a plausible ref that resolves to nothing.
    const pack = structuredClone(fixturePack()) as unknown as {
      zones: Array<{ id: string; hazardRefs?: string[] }>;
    };
    pack.zones[0].hazardRefs = ['hazard-does-not-exist'];

    const engine = hostPack().createGame(SEED);
    const r = applyContentPack(engine, pack as unknown as ContentPack, {
      channels: createStandardChannels(),
    });
    const drop = r.dropped.find((d) => d.detail.includes('hazard-does-not-exist'));
    expect(drop, 'a dangling hazardRef must be named').toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The closed effect union, effect by effect
// ═══════════════════════════════════════════════════════════════════════════

describe('C3/P3 — the effect union executes as DATA', () => {
  function withHazard(spec: HazardSpec, tags: string[] = []): { engine: Engine; probe: string; zoneId: string } {
    const engine = bootBare();
    const zoneId = Object.keys(engine.world.zones)[0];
    const probe = standProbe(engine, zoneId, tags);
    registerTypedHazards(engine.world.meta.gameId, [spec], { [zoneId]: [spec.id] });
    return { engine, probe, zoneId };
  }

  it('damage: percent-of-maxHp is computed from maxHp, not from current hp', () => {
    const { engine, probe, zoneId } = withHazard({
      id: 'h', name: 'H', trigger: 'on-enter', tags: [],
      effects: [{ kind: 'damage', amount: 0.25, amountIsPercentMaxHp: true, tickOn: 'turn-end' }],
    });
    applyTypedHazards(engine, zoneId, engine.world.entities[probe], 'on-enter');
    expect(engine.world.entities[probe].resources.hp).toBe(30); // 40 - 25% of 40
    unregisterTypedHazards(engine.world.meta.gameId);
  });

  it('damage with durationTicks rides status-core’s EXISTING periodic machinery', () => {
    // Not a bespoke timer: one implementation of "damage over time" in the engine.
    const { engine, probe, zoneId } = withHazard({
      id: 'h-dot', name: 'DoT', trigger: 'on-enter', tags: [],
      effects: [{ kind: 'damage', amount: 2, tickOn: 'turn-end', durationTicks: 3 }],
    });
    const { applications } = applyTypedHazards(engine, zoneId, engine.world.entities[probe], 'on-enter');
    expect(applications[0].applied).toContain('damage:periodic');
    const applied = engine.world.entities[probe].statuses.find((s) => s.statusId === 'hazard:h-dot');
    expect(applied, 'a periodic status must be applied').toBeDefined();
    expect(applied!.data?.periodicKind).toBe('damage');
    // Instant hp is untouched — the damage is scheduled, not dealt twice.
    expect(engine.world.entities[probe].resources.hp).toBe(40);
    unregisterTypedHazards(engine.world.meta.gameId);
  });

  it('status: bound to the REAL status system via applyStatus', () => {
    // FFT's rule, which the forge's own docstring names: tile-poison ===
    // spell-poison. A hazard applies a status the rest of the engine already
    // understands, rather than a hazard-private effect.
    const { engine, probe, zoneId } = withHazard({
      id: 'h-status', name: 'Chill', trigger: 'on-enter', tags: [],
      effects: [{ kind: 'status', statusId: 'status-chilled', chance: 1, stacking: 'refresh' }],
    });
    applyTypedHazards(engine, zoneId, engine.world.entities[probe], 'on-enter');
    expect(engine.world.entities[probe].statuses.map((s) => s.statusId)).toContain('status-chilled');
    unregisterTypedHazards(engine.world.meta.gameId);
  });

  it('instakill goes through the same resource path, so defeat consumers still fire', () => {
    const { engine, probe, zoneId } = withHazard({
      id: 'h-kill', name: 'Void Drop', trigger: 'on-enter', tags: [],
      effects: [{ kind: 'instakill' }],
    });
    applyTypedHazards(engine, zoneId, engine.world.entities[probe], 'on-enter');
    expect(engine.world.entities[probe].resources.hp).toBe(0);
    const ev = engine.world.eventLog.find((e) => e.type === 'hazard.damage.applied');
    expect((ev!.payload as { instakill?: boolean }).instakill).toBe(true);
    unregisterTypedHazards(engine.world.meta.gameId);
  });

  it('ignite REFUSES rather than no-oping when no burn status id is declared', () => {
    // Inventing an engine-owned `burning` constant would be inventing vocabulary,
    // which the closed-enumeration rule forbids. So it is refused, WITH what to
    // declare — never a silent nothing.
    const { engine, probe, zoneId } = withHazard({
      id: 'h-fire', name: 'Fire', trigger: 'on-enter', tags: [],
      effects: [{ kind: 'ignite', igniteChance: 1 }],
    });
    const { applications } = applyTypedHazards(engine, zoneId, engine.world.entities[probe], 'on-enter');
    const skip = applications[0].skipped.find((s) => s.kind === 'ignite');
    expect(skip, 'a burn-less ignite must be reported').toBeDefined();
    expect(skip!.reason).toContain('burn:');
    expect(applications[0].applied).not.toContain('ignite');
    unregisterTypedHazards(engine.world.meta.gameId);
  });

  it('ignite APPLIES when the burn status is declared by convention', () => {
    const { engine, probe, zoneId } = withHazard({
      id: 'h-fire2', name: 'Fire', trigger: 'on-enter', tags: ['burn:status-burning'],
      effects: [{ kind: 'ignite', igniteChance: 1 }],
    });
    const { applications } = applyTypedHazards(engine, zoneId, engine.world.entities[probe], 'on-enter');
    expect(applications[0].applied).toContain('ignite');
    expect(engine.world.entities[probe].statuses.map((s) => s.statusId)).toContain('status-burning');
    unregisterTypedHazards(engine.world.meta.gameId);
  });

  it('immuneTags exempt an entity entirely, and say so', () => {
    const { engine, probe, zoneId } = withHazard({
      id: 'h-heat', name: 'Steam', trigger: 'on-enter', tags: [], immuneTags: ['heat-resist'],
      effects: [{ kind: 'damage', amount: 10, tickOn: 'turn-end' }],
    }, ['heat-resist']);
    const { applications } = applyTypedHazards(engine, zoneId, engine.world.entities[probe], 'on-enter');
    expect(engine.world.entities[probe].resources.hp).toBe(40);
    expect(applications[0].skipped.some((s) => s.reason.includes('immunity'))).toBe(true);
    unregisterTypedHazards(engine.world.meta.gameId);
  });

  it('passable blocks entry through the move handler’s own refusal path', () => {
    const engine = bootBare();
    const zoneId = Object.keys(engine.world.zones)[0];
    const probe = standProbe(engine, zoneId);
    registerTypedHazards(engine.world.meta.gameId, [{
      id: 'h-wall', name: 'Sheer Drop', trigger: 'on-enter', tags: [], passable: 'never', effects: [],
    }], { [zoneId]: ['h-wall'] });

    const blocked = hazardBlocksEntry(engine.world, zoneId, engine.world.entities[probe]);
    expect(blocked.blocked).toBe(true);
    expect(blocked.reason).toContain('impassable');

    // flying-only lets a flier through — the axis is not a boolean.
    registerTypedHazards(engine.world.meta.gameId, [{
      id: 'h-air', name: 'Chasm', trigger: 'on-enter', tags: [], passable: 'flying-only', effects: [],
    }], { [zoneId]: ['h-air'] });
    unregisterTypedHazards(engine.world.meta.gameId);
    registerTypedHazards(engine.world.meta.gameId, [{
      id: 'h-air', name: 'Chasm', trigger: 'on-enter', tags: [], passable: 'flying-only', effects: [],
    }], { [zoneId]: ['h-air'] });
    const flier = standProbe(engine, zoneId, ['flying']);
    expect(hazardBlocksEntry(engine.world, zoneId, engine.world.entities[flier]).blocked).toBe(false);
    unregisterTypedHazards(engine.world.meta.gameId);
  });

  it('CARRIED-AND-INERT effects are reported by name, never silently ignored', () => {
    // The honesty half. `moveCostDelta` has no movement-cost economy to spend
    // into and `blocksVision` has no perception reader; both cross faithfully and
    // do nothing. Saying so is the difference between this and C0's
    // `losslessPercent: 100`.
    const { engine, probe, zoneId } = withHazard({
      id: 'h-inert', name: 'Mud', trigger: 'on-enter', tags: [],
      effects: [], moveCostDelta: 2, blocksVision: true,
    });
    const { applications } = applyTypedHazards(engine, zoneId, engine.world.entities[probe], 'on-enter');
    const kinds = applications[0].skipped.map((s) => s.kind);
    expect(kinds).toContain('moveCostDelta');
    expect(kinds).toContain('blocksVision');
    unregisterTypedHazards(engine.world.meta.gameId);
  });

  it('the weather gate is reported UNEVALUABLE when no weather source exists', () => {
    // Measured, like the gate operands in P2. Fail-OPEN here and deliberately: a
    // hazard that silently stops existing is a floor the player crosses safely by
    // accident, which is worse than one that fires when it should not.
    const { engine, probe, zoneId } = withHazard({
      id: 'h-rain', name: 'Marsh', trigger: 'on-enter', tags: [],
      weatherConditions: ['rain'],
      effects: [{ kind: 'damage', amount: 1, tickOn: 'turn-end' }],
    });
    const { applications } = applyTypedHazards(engine, zoneId, engine.world.entities[probe], 'on-enter');
    expect(applications[0].skipped.some((s) => s.kind === 'weather-gate')).toBe(true);
    // …and it fired anyway, which is the fail-open half.
    expect(applications[0].applied).toContain('damage');

    // With a weather source present, the gate DECIDES — so the unevaluable report
    // above is not a permanent excuse.
    engine.world.globals['weather'] = 'clear';
    const second = applyTypedHazards(engine, zoneId, engine.world.entities[probe], 'on-enter');
    expect(second.applications[0].applied).not.toContain('damage');
    expect(second.applications[0].skipped.some((s) => s.reason.includes('weather is not'))).toBe(true);
    unregisterTypedHazards(engine.world.meta.gameId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Determinism + the composition cap
// ═══════════════════════════════════════════════════════════════════════════

describe('C3/P3 — determinism and the system-wide composition cap', () => {
  it('the proc roll is PURE: same seed ⇒ same outcome, no Math.random', () => {
    function outcome(seed: number): boolean {
      unregisterTypedHazards(HOST_PACK_ID);
      const engine = hostPack().createGame(seed);
      const zoneId = Object.keys(engine.world.zones)[0];
      const probe = standProbe(engine, zoneId);
      registerTypedHazards(engine.world.meta.gameId, [{
        id: 'h-proc', name: 'Proc', trigger: 'on-enter', tags: [],
        effects: [{ kind: 'status', statusId: 's', chance: 0.5, stacking: 'refresh' }],
      }], { [zoneId]: ['h-proc'] });
      const { applications } = applyTypedHazards(engine, zoneId, engine.world.entities[probe], 'on-enter');
      return applications[0].applied.includes('status');
    }
    expect(outcome(SEED)).toBe(outcome(SEED));
    // And the roll is REAL — some seed disagrees, else the equality above would
    // hold on a constant.
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(outcome);
    expect(new Set(seeds).size, 'a 0.5 chance must not be constant across ten seeds').toBeGreaterThan(1);
    unregisterTypedHazards(HOST_PACK_ID);
  });

  it('HAZARD_DEPTH_LIMIT halts a hazard cycle, LOUDLY — and the cap is REACHED', () => {
    // ⚠ A CAP WITH NO TEST THAT REACHES IT IS A CAP NOBODY HAS MEASURED.
    // RG-C1 Lane 2: composition of individually-bounded effects is Turing complete
    // (Churchill et al., arXiv:1904.09828), so the bound must be system-wide.
    //
    // The cycle must be genuinely NESTED — re-entered while an outer pass is still
    // on the stack — because that is the only shape the counter is guarding
    // against. My first draft called the interpreter in a sequential loop instead,
    // which never reaches the cap (the `finally` correctly restores the depth
    // between passes) and would have "proved" the guard by never testing it. That
    // is the vacuous-control failure this arc keeps finding, so it is recorded
    // here rather than quietly fixed.
    //
    // Nesting is produced with a status whose application re-enters the
    // interpreter, standing in for `hazard → status → reactive trigger → hazard`.
    const engine = bootBare();
    const zoneId = Object.keys(engine.world.zones)[0];
    const probe = standProbe(engine, zoneId);
    registerTypedHazards(engine.world.meta.gameId, [{
      id: 'h-cycle', name: 'Cycle', trigger: 'on-enter', tags: [],
      effects: [{ kind: 'damage', amount: 1, tickOn: 'turn-end' }],
    }], { [zoneId]: ['h-cycle'] });

    let reached = 0;
    const store = engine.store as unknown as { addEntity: (e: unknown) => void };
    const realAddEntity = store.addEntity.bind(engine.store);
    // Re-enter from INSIDE the interpreter: every damage write triggers another
    // pass, so the calls genuinely stack.
    store.addEntity = (e: unknown) => {
      realAddEntity(e);
      if (reached < HAZARD_DEPTH_LIMIT + 3) {
        reached++;
        applyTypedHazards(engine, zoneId, engine.world.entities[probe], 'on-enter');
      }
    };
    try {
      applyTypedHazards(engine, zoneId, engine.world.entities[probe], 'on-enter');
    } finally {
      store.addEntity = realAddEntity;
    }

    // The halt fired, and it is VISIBLE — a silent halt would make a runaway cycle
    // look like a hazard that simply did not fire.
    const halted = engine.world.eventLog.filter((e) => e.type === 'hazard.depth.exceeded');
    expect(halted.length, 'the fiat halt must have fired').toBeGreaterThan(0);
    expect((halted[0].payload as { limit: number }).limit).toBe(HAZARD_DEPTH_LIMIT);
    unregisterTypedHazards(engine.world.meta.gameId);
  });

  it('the depth counter is RESTORED after a pass, so the cap is not one-shot', () => {
    // A guard that latches shut after the first cycle would silently disable every
    // later hazard in the session — indistinguishable from hazards not working.
    const engine = bootBare();
    const zoneId = Object.keys(engine.world.zones)[0];
    const probe = standProbe(engine, zoneId);
    registerTypedHazards(engine.world.meta.gameId, [{
      id: 'h-again', name: 'Again', trigger: 'on-enter', tags: [],
      effects: [{ kind: 'damage', amount: 1, tickOn: 'turn-end' }],
    }], { [zoneId]: ['h-again'] });

    for (let i = 0; i < HAZARD_DEPTH_LIMIT + 2; i++) {
      const { applications } = applyTypedHazards(engine, zoneId, engine.world.entities[probe], 'on-enter');
      expect(applications[0]?.applied, `pass ${i} must still fire`).toContain('damage');
    }
    unregisterTypedHazards(engine.world.meta.gameId);
  });
});
