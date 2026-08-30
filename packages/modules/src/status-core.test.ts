// status-core tests — periodic snapshot bookkeeping on apply (design-lock A.2)
//
// Proves applyStatus captures a periodic effect's magnitude as a snapshot at
// apply-tick and records durationTicks into AppliedStatus.data (a ScalarValue
// record), WITHOUT changing the core AppliedStatus type. Back-compat: a plain
// (non-periodic) applyStatus stores no periodic bookkeeping and behaves exactly
// as before.

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, WorldState, EngineModule } from '@ai-rpg-engine/core';
import { statusCore, applyStatus } from './status-core.js';
import { PERIODIC_KEYS, processPeriodicStatuses } from './status-effects.js';
import { registerStatusDefinitions, clearStatusRegistry } from './status-semantics.js';

/** Minimal module exposing a no-op 'wait' verb so an action can resolve a tick
 *  (a resolved action is what drives the periodic pass). */
const waitModule: EngineModule = {
  id: 'wait-test', version: '0.0.0',
  register(ctx) {
    ctx.actions.registerVerb('wait', (action) => [
      { id: '', tick: action.issuedAtTick, type: 'wait.done', actorId: action.actorId, payload: {} },
    ]);
  },
};

function makeEntity(overrides?: Partial<EntityState>): EntityState {
  return {
    id: 'e1', blueprintId: 'e1', type: 'enemy', name: 'E1', tags: [],
    stats: { vigor: 5 }, resources: { hp: 20, maxHp: 20 }, statuses: [],
    ...overrides,
  };
}

function makeWorld(e: EntityState, tick = 3): WorldState {
  return {
    meta: { worldId: 'w', gameId: 'g', saveVersion: '1', tick, seed: 1, activeRuleset: 't', activeModules: [], idCounter: 0 },
    playerId: 'p', locationId: 'z',
    entities: { [e.id]: e },
    zones: {}, quests: {}, factions: {}, globals: {}, modules: {}, eventLog: [], pending: [],
  };
}

describe('applyStatus — periodic snapshot bookkeeping', () => {
  it('snapshots the periodic amount at apply-tick into data.snapshotAmount', () => {
    const e = makeEntity();
    const world = makeWorld(e, 3);
    applyStatus(e, 'burning', 3, {
      duration: 6,
      data: { periodicKind: 'damage', periodTicks: 2, amount: 4 },
    }, world);

    const inst = e.statuses.find(s => s.statusId === 'burning')!;
    expect(inst.data?.[PERIODIC_KEYS.SNAPSHOT]).toBe(4); // captured from amount
    expect(inst.data?.[PERIODIC_KEYS.AMOUNT]).toBe(4);   // original preserved
    expect(inst.appliedAtTick).toBe(3);
  });

  it('records durationTicks into data when a duration is given', () => {
    const e = makeEntity();
    const world = makeWorld(e, 0);
    applyStatus(e, 'burning', 0, {
      duration: 5,
      data: { periodicKind: 'damage', periodTicks: 1, amount: 2 },
    }, world);
    const inst = e.statuses.find(s => s.statusId === 'burning')!;
    expect(inst.data?.[PERIODIC_KEYS.DURATION]).toBe(5);
  });

  it('does not overwrite an explicitly-provided snapshotAmount', () => {
    const e = makeEntity();
    const world = makeWorld(e, 0);
    applyStatus(e, 'burning', 0, {
      duration: 4,
      data: { periodicKind: 'damage', periodTicks: 1, amount: 2, snapshotAmount: 9 },
    }, world);
    const inst = e.statuses.find(s => s.statusId === 'burning')!;
    expect(inst.data?.[PERIODIC_KEYS.SNAPSHOT]).toBe(9); // honored, not clobbered
  });

  it('back-compat: a non-periodic status stores no periodic bookkeeping', () => {
    const e = makeEntity();
    const world = makeWorld(e, 0);
    applyStatus(e, 'guarded', 0, { duration: 2 }, world);
    const inst = e.statuses.find(s => s.statusId === 'guarded')!;
    // No data at all (or no periodic keys) — unchanged from prior behaviour.
    expect(inst.data?.[PERIODIC_KEYS.SNAPSHOT]).toBeUndefined();
    expect(inst.data?.[PERIODIC_KEYS.DURATION]).toBeUndefined();
  });
});

describe('statusCore module — periodic statuses tick through the engine', () => {
  it('a DoT applied via the engine deals damage as ticks advance and then expires', () => {
    clearStatusRegistry();
    registerStatusDefinitions([
      { id: 'bleed', name: 'Bleed', tags: ['wound', 'debuff'], stacking: 'refresh', duration: { type: 'ticks', value: 4 } },
    ]);
    const hero: EntityState = {
      id: 'hero', blueprintId: 'hero', type: 'player', name: 'Hero', tags: ['player'],
      stats: { vigor: 5 }, resources: { hp: 20, maxHp: 20, stamina: 9 }, statuses: [], zoneId: 'z',
    };
    const engine = createTestEngine({
      modules: [statusCore, waitModule],
      entities: [hero],
      zones: [{ id: 'z', roomId: 'r', name: 'Z', tags: [], neighbors: ['z'] }],
      playerId: 'hero',
    });

    // Apply a bleed at the current tick: 2 dmg/tick for 4 ticks.
    const startTick = engine.tick;
    applyStatus(engine.world.entities.hero, 'bleed', startTick, {
      duration: 4,
      data: { periodicKind: 'damage', periodTicks: 1, amount: 2 },
    }, engine.world as never);
    const hpBefore = engine.world.entities.hero.resources.hp;

    // Drive several no-op actions; each resolved action == one tick, firing the DoT.
    for (let i = 0; i < 6; i++) engine.submitAction('wait');

    const hero2 = engine.world.entities.hero;
    // HP dropped from the DoT (bounded by the 4-tick duration → not a runaway).
    expect(hero2.resources.hp).toBeLessThan(hpBefore);
    // Instance is gone once its duration elapsed.
    expect(hero2.statuses.some(s => s.statusId === 'bleed')).toBe(false);
    // Damage is bounded by duration*amount (no infinite ticking).
    expect(hpBefore - hero2.resources.hp).toBeLessThanOrEqual(4 * 2);
  });
});

// ---------------------------------------------------------------------------
// M5: duration 0 means "expires now", not "permanent"
// ---------------------------------------------------------------------------
// A falsy guard (`options?.duration ? ...`) treated duration:0 like undefined,
// silently making a zero-duration status permanent. 0 and undefined are
// distinct: undefined → permanent (no expiry), 0 → expires at the current tick.

describe('M5: applyStatus duration:0 vs undefined', () => {
  it('duration 0 sets expiresAtTick to the current tick (expires immediately)', () => {
    const e = makeEntity();
    const world = makeWorld(e, 5);
    applyStatus(e, 'stun', 5, { duration: 0 }, world);

    expect(e.statuses).toHaveLength(1);
    expect(e.statuses[0].expiresAtTick).toBe(5);
  });

  it('no duration still means permanent (lock)', () => {
    const e = makeEntity();
    const world = makeWorld(e, 5);
    applyStatus(e, 'brand', 5, {}, world);

    expect(e.statuses[0].expiresAtTick).toBeUndefined();
  });

  it('refresh with duration 0 pulls the expiry to the current tick', () => {
    const e = makeEntity();
    const world = makeWorld(e, 5);
    applyStatus(e, 'ward', 5, { duration: 5 }, world);
    expect(e.statuses[0].expiresAtTick).toBe(10);

    applyStatus(e, 'ward', 6, { stacking: 'refresh', duration: 0 }, world);
    expect(e.statuses[0].expiresAtTick).toBe(6);
  });

  it('stack-at-max refresh with duration 0 pulls the expiry to the current tick', () => {
    const e = makeEntity();
    const world = makeWorld(e, 5);
    applyStatus(e, 'venom', 5, { stacking: 'stack', maxStacks: 1, duration: 5 }, world);
    expect(e.statuses[0].expiresAtTick).toBe(10);

    // Already at max stacks → the "refresh at max" path.
    applyStatus(e, 'venom', 6, { stacking: 'stack', maxStacks: 1, duration: 0 }, world);
    expect(e.statuses[0].expiresAtTick).toBe(6);
  });
});

// F-09c95e49: refresh / at-max previously only wrote expiresAtTick, so the
// periodic engine (frozen data.durationTicks + original appliedAtTick) ignored
// the recast and a per-turn hazard could not extend a DoT.
describe('F-09c95e49: refresh restarts the periodic clock', () => {
  it('refresh resets appliedAtTick and rewrites data.durationTicks', () => {
    const e = makeEntity();
    const world = makeWorld(e, 0);
    applyStatus(e, 'burning', 0, {
      duration: 4,
      data: { periodicKind: 'damage', periodTicks: 1, amount: 2 },
    }, world);
    expect(e.statuses[0].appliedAtTick).toBe(0);
    expect(e.statuses[0].data?.[PERIODIC_KEYS.DURATION]).toBe(4);

    applyStatus(e, 'burning', 2, {
      stacking: 'refresh',
      duration: 4,
      data: { periodicKind: 'damage', periodTicks: 1, amount: 2 },
    }, world);

    expect(e.statuses).toHaveLength(1);
    expect(e.statuses[0].appliedAtTick).toBe(2);
    expect(e.statuses[0].expiresAtTick).toBe(6);
    expect(e.statuses[0].data?.[PERIODIC_KEYS.DURATION]).toBe(4);
  });

  it('at-max stack fall-through resets appliedAtTick and rewrites data.durationTicks', () => {
    const e = makeEntity();
    const world = makeWorld(e, 0);
    applyStatus(e, 'venom', 0, {
      stacking: 'stack',
      maxStacks: 1,
      duration: 4,
      data: { periodicKind: 'damage', periodTicks: 1, amount: 2 },
    }, world);

    applyStatus(e, 'venom', 2, {
      stacking: 'stack',
      maxStacks: 1,
      duration: 4,
      data: { periodicKind: 'damage', periodTicks: 1, amount: 2 },
    }, world);

    expect(e.statuses).toHaveLength(1);
    expect(e.statuses[0].appliedAtTick).toBe(2);
    expect(e.statuses[0].expiresAtTick).toBe(6);
    expect(e.statuses[0].data?.[PERIODIC_KEYS.DURATION]).toBe(4);
  });

  it('recast a duration:4 burn at elapsed 2 still pulses through original-apply+4', () => {
    const e = makeEntity({ resources: { hp: 50, maxHp: 50 } });
    const world = makeWorld(e, 0);
    applyStatus(e, 'burning', 0, {
      duration: 4,
      data: { periodicKind: 'damage', periodTicks: 1, amount: 1 },
    }, world);

    const ticksThatFire: number[] = [];
    for (let t = 0; t <= 1; t++) {
      world.meta.tick = t;
      const events = processPeriodicStatuses(world, t);
      if (events.some(ev => ev.type === 'status.periodic.damage')) ticksThatFire.push(t);
    }

    applyStatus(e, 'burning', 2, {
      stacking: 'refresh',
      duration: 4,
      data: { periodicKind: 'damage', periodTicks: 1, amount: 1 },
    }, world);

    for (let t = 2; t <= 6; t++) {
      world.meta.tick = t;
      const events = processPeriodicStatuses(world, t);
      if (events.some(ev => ev.type === 'status.periodic.damage')) ticksThatFire.push(t);
    }

    expect(ticksThatFire).toContain(4);
    expect(ticksThatFire).toEqual([0, 1, 2, 3, 4, 5]);
    expect(e.statuses.some(s => s.statusId === 'burning')).toBe(false);
  });
});
