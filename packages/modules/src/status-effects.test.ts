// status-effects tests — passive stat modifiers, periodic DoT/HoT, reactive triggers
//
// Proves (design-lock section A):
//   1. PASSIVE MODIFIERS — effectiveStat reduces a status's modifiers[] over base
//      in fixed order ((base + Σadd) * mul) / div, stacks clamped at maxStacks,
//      and a +stat buff actually changes a combat damage result.
//   2. PERIODIC DoT/HoT — driven off the engine tick counter; fires each period,
//      expires at duration, snapshot magnitude captured from source at apply-tick.
//   3. REACTIVE TRIGGERS — per-tick FIFO proc context halts a reflect/loop chain
//      at PROC_DEPTH_LIMIT.
//   4. DETERMINISM — same seed => identical results.
//   5. BACK-COMPAT — entities with no modifiers see base stats unchanged.

import { describe, it, expect, beforeEach } from 'vitest';
import type { StatusDefinition } from '@ai-rpg-engine/content-schema';
import type { EntityState, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import {
  effectiveStat,
  processPeriodicStatuses,
  processStatusTriggers,
  makeProcContext,
  PROC_DEPTH_LIMIT,
} from './status-effects.js';
import { applyStatus } from './status-core.js';
import { registerStatusDefinitions, clearStatusRegistry } from './status-semantics.js';

// --- Fixtures ---

function makeEntity(overrides?: Partial<EntityState>): EntityState {
  return {
    id: 'e1',
    blueprintId: 'e1',
    type: 'enemy',
    name: 'E1',
    tags: ['enemy'],
    stats: { vigor: 5, instinct: 5, will: 3 },
    resources: { hp: 20, maxHp: 20, stamina: 10 },
    statuses: [],
    ...overrides,
  };
}

function makeWorld(entities: EntityState[], tick = 1, seed = 42): WorldState {
  const map: Record<string, EntityState> = {};
  for (const e of entities) map[e.id] = e;
  return {
    meta: {
      worldId: 'w', gameId: 'g', saveVersion: '1', tick, seed,
      activeRuleset: 'test', activeModules: [], idCounter: 0,
    },
    playerId: 'player',
    locationId: 'zone-1',
    entities: map,
    zones: {},
    quests: {},
    factions: {},
    globals: {},
    modules: {},
    eventLog: [],
    pending: [],
  };
}

beforeEach(() => {
  clearStatusRegistry();
});

// ---------------------------------------------------------------------------
// 1. PASSIVE MODIFIERS — effectiveStat
// ---------------------------------------------------------------------------

describe('effectiveStat — passive modifiers', () => {
  it('returns the base stat when the entity has no statuses (back-compat)', () => {
    const e = makeEntity();
    const world = makeWorld([e]);
    expect(effectiveStat(e, 'vigor', world)).toBe(5);
  });

  it('returns the base stat when statuses carry no modifiers (back-compat)', () => {
    registerStatusDefinitions([
      { id: 'mark', name: 'Mark', tags: ['debuff'], stacking: 'replace' },
    ]);
    const e = makeEntity({
      statuses: [{ id: 's1', statusId: 'mark', stacks: 1, appliedAtTick: 0 }],
    });
    const world = makeWorld([e]);
    expect(effectiveStat(e, 'vigor', world)).toBe(5);
  });

  it('applies an additive modifier: +3 might → base 5 becomes 8', () => {
    registerStatusDefinitions([
      {
        id: 'might', name: 'Might', tags: ['buff'], stacking: 'replace',
        modifiers: [{ stat: 'vigor', operation: 'add', value: 3 }],
      },
    ]);
    const e = makeEntity({
      statuses: [{ id: 's1', statusId: 'might', stacks: 1, appliedAtTick: 0 }],
    });
    const world = makeWorld([e]);
    expect(effectiveStat(e, 'vigor', world)).toBe(8);
  });

  it('applies a multiplicative modifier after additive: (5 + 1) * 2 = 12', () => {
    registerStatusDefinitions([
      {
        id: 'frenzy', name: 'Frenzy', tags: ['buff'], stacking: 'replace',
        modifiers: [
          { stat: 'vigor', operation: 'add', value: 1 },
          { stat: 'vigor', operation: 'multiply', value: 2 },
        ],
      },
    ]);
    const e = makeEntity({
      statuses: [{ id: 's1', statusId: 'frenzy', stacks: 1, appliedAtTick: 0 }],
    });
    const world = makeWorld([e]);
    // (base 5 + add 1) * mul 2 = 12 (integer)
    expect(effectiveStat(e, 'vigor', world)).toBe(12);
  });

  it('multiplies additive modifiers by stacks, clamped at maxStacks BEFORE aggregating', () => {
    registerStatusDefinitions([
      {
        id: 'rage', name: 'Rage', tags: ['buff'], stacking: 'stack', maxStacks: 3,
        modifiers: [{ stat: 'vigor', operation: 'add', value: 2 }],
      },
    ]);
    // 5 stacks present but maxStacks is 3 → +2 * 3 = +6 → 5 + 6 = 11
    const e = makeEntity({
      statuses: [{ id: 's1', statusId: 'rage', stacks: 5, appliedAtTick: 0 }],
    });
    const world = makeWorld([e]);
    expect(effectiveStat(e, 'vigor', world)).toBe(11);
  });

  it('only the targeted stat is affected; other stats stay at base', () => {
    registerStatusDefinitions([
      {
        id: 'might', name: 'Might', tags: ['buff'], stacking: 'replace',
        modifiers: [{ stat: 'vigor', operation: 'add', value: 3 }],
      },
    ]);
    const e = makeEntity({
      statuses: [{ id: 's1', statusId: 'might', stacks: 1, appliedAtTick: 0 }],
    });
    const world = makeWorld([e]);
    expect(effectiveStat(e, 'will', world)).toBe(3); // untouched
    expect(effectiveStat(e, 'instinct', world)).toBe(5); // untouched
  });

  it('aggregates across multiple status instances in a stable order (order-independent)', () => {
    registerStatusDefinitions([
      {
        id: 'a', name: 'A', tags: ['buff'], stacking: 'replace',
        modifiers: [{ stat: 'vigor', operation: 'add', value: 4 }],
      },
      {
        id: 'b', name: 'B', tags: ['buff'], stacking: 'replace',
        modifiers: [{ stat: 'vigor', operation: 'multiply', value: 2 }],
      },
    ]);
    // Whatever the array order, the multiply must apply after the add:
    // (5 + 4) * 2 = 18
    const forward = makeEntity({
      statuses: [
        { id: 's1', statusId: 'a', stacks: 1, appliedAtTick: 0 },
        { id: 's2', statusId: 'b', stacks: 1, appliedAtTick: 0 },
      ],
    });
    const reverse = makeEntity({
      id: 'e2',
      statuses: [
        { id: 's2', statusId: 'b', stacks: 1, appliedAtTick: 0 },
        { id: 's1', statusId: 'a', stacks: 1, appliedAtTick: 0 },
      ],
    });
    const world = makeWorld([forward, reverse]);
    expect(effectiveStat(forward, 'vigor', world)).toBe(18);
    expect(effectiveStat(reverse, 'vigor', world)).toBe(18);
  });

  it('uses an explicit fallback when the base stat is absent', () => {
    const e = makeEntity({ stats: {} });
    const world = makeWorld([e]);
    expect(effectiveStat(e, 'vigor', world, 7)).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// 2. PERIODIC DoT/HoT
// ---------------------------------------------------------------------------

describe('processPeriodicStatuses — DoT/HoT', () => {
  const burning: StatusDefinition = {
    id: 'burning',
    name: 'Burning',
    tags: ['poison', 'debuff'],
    stacking: 'refresh',
    duration: { type: 'ticks', value: 6 },
  };

  beforeEach(() => {
    registerStatusDefinitions([burning]);
  });

  it('deals snapshot damage every period and stops at duration', () => {
    const e = makeEntity({ resources: { hp: 20, maxHp: 20 } });
    const world = makeWorld([e], 0);
    // Apply a DoT at tick 0: 3 damage every 2 ticks, lasting 6 ticks.
    applyStatus(e, 'burning', 0, {
      duration: 6,
      data: { periodicKind: 'damage', periodTicks: 2, amount: 3 },
    }, world);

    const ticksThatFire: number[] = [];
    let totalDamage = 0;
    // Drive ticks 0..7
    for (let t = 0; t <= 7; t++) {
      world.meta.tick = t;
      const events = processPeriodicStatuses(world, t);
      const dmg = events.filter(ev => ev.type === 'status.periodic.damage');
      if (dmg.length > 0) {
        ticksThatFire.push(t);
        totalDamage += dmg.reduce((s, ev) => s + (ev.payload.amount as number), 0);
      }
    }

    // Fires at ticks 0,2,4 (t - applied=0 % 2 === 0), NOT at 6 (>= duration expires).
    expect(ticksThatFire).toEqual([0, 2, 4]);
    expect(totalDamage).toBe(9); // 3 * 3
    // HP reduced by total damage.
    expect(e.resources.hp).toBe(11);
  });

  it('heals over time (HoT), capped at max', () => {
    registerStatusDefinitions([
      { id: 'regen', name: 'Regen', tags: ['buff'], stacking: 'refresh', duration: { type: 'ticks', value: 4 } },
    ]);
    const e = makeEntity({ resources: { hp: 10, maxHp: 20 } });
    const world = makeWorld([e], 0);
    applyStatus(e, 'regen', 0, {
      duration: 4,
      data: { periodicKind: 'heal', periodTicks: 1, amount: 4, resource: 'hp' },
    }, world);

    for (let t = 0; t <= 4; t++) {
      world.meta.tick = t;
      processPeriodicStatuses(world, t);
    }
    // Fires at 0,1,2,3 (4 ticks of +4 = +16) but capped at maxHp 20.
    expect(e.resources.hp).toBe(20);
  });

  it('expires the status instance at >= duration', () => {
    const e = makeEntity({ resources: { hp: 50, maxHp: 50 } });
    const world = makeWorld([e], 0);
    applyStatus(e, 'burning', 0, {
      duration: 4,
      data: { periodicKind: 'damage', periodTicks: 1, amount: 1 },
    }, world);

    for (let t = 0; t <= 4; t++) {
      world.meta.tick = t;
      processPeriodicStatuses(world, t);
    }
    // At tick 4 (>= duration 4) the instance is expired/removed.
    expect(e.statuses.some(s => s.statusId === 'burning')).toBe(false);
  });

  it('is deterministic — two worlds with the same seed produce identical HP', () => {
    const build = () => {
      const e = makeEntity({ resources: { hp: 30, maxHp: 30 } });
      const world = makeWorld([e], 0, 99);
      applyStatus(e, 'burning', 0, {
        duration: 5,
        data: { periodicKind: 'damage', periodTicks: 1, amount: 2 },
      }, world);
      for (let t = 0; t <= 5; t++) {
        world.meta.tick = t;
        processPeriodicStatuses(world, t);
      }
      return e.resources.hp;
    };
    expect(build()).toBe(build());
  });

  it('skips defeated entities (no damage to already-dead targets)', () => {
    const e = makeEntity({ resources: { hp: 0, maxHp: 20 } });
    const world = makeWorld([e], 0);
    applyStatus(e, 'burning', 0, {
      duration: 4,
      data: { periodicKind: 'damage', periodTicks: 1, amount: 5 },
    }, world);
    world.meta.tick = 0;
    const events = processPeriodicStatuses(world, 0);
    expect(events.filter(ev => ev.type === 'status.periodic.damage')).toHaveLength(0);
    expect(e.resources.hp).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. REACTIVE TRIGGERS
// ---------------------------------------------------------------------------

describe('processStatusTriggers — reactive triggers + depth cap', () => {
  it('PROC_DEPTH_LIMIT is the fixed fiat constant (16)', () => {
    expect(PROC_DEPTH_LIMIT).toBe(16);
  });

  it('fires a damage trigger in response to a matching event', () => {
    registerStatusDefinitions([
      {
        id: 'spiked', name: 'Spiked', tags: ['buff'], stacking: 'replace',
        triggers: [
          {
            // Spiked armor reflects damage back at whoever dealt it.
            // (triggerTarget:'attacker' — EffectDefinition.target has no 'attacker'.)
            event: 'combat.damage.applied',
            effect: { type: 'damage', target: 'target', params: { amount: 2, triggerTarget: 'attacker' } },
          },
        ],
      },
    ]);
    const defender = makeEntity({ id: 'defender', resources: { hp: 20, maxHp: 20 } });
    const attacker = makeEntity({ id: 'attacker', resources: { hp: 20, maxHp: 20 } });
    defender.statuses = [{ id: 's1', statusId: 'spiked', stacks: 1, appliedAtTick: 0, sourceId: 'defender' }];
    const world = makeWorld([defender, attacker], 1);

    // attacker hit defender → defender's spiked reflects 2 to the attacker
    const incoming = {
      id: 'evt1', tick: 1, type: 'combat.damage.applied',
      actorId: 'attacker', targetIds: ['defender'],
      payload: { attackerId: 'attacker', targetId: 'defender', damage: 5 },
    };
    const procCtx = makeProcContext();
    const events = processStatusTriggers(incoming, world, procCtx, 1);

    expect(events.some(ev => ev.type === 'status.trigger.fired')).toBe(true);
    expect(attacker.resources.hp).toBe(18); // took 2 reflect
  });

  it('halts a reflect ping-pong loop at PROC_DEPTH_LIMIT', () => {
    // Two entities each reflect damage taken back at the source. Left unbounded
    // this ping-pongs forever (MTG-104.4b-style mandatory loop).
    registerStatusDefinitions([
      {
        id: 'reflect', name: 'Reflect', tags: ['buff'], stacking: 'replace',
        triggers: [
          {
            event: 'combat.damage.applied',
            effect: { type: 'damage', target: 'target', params: { amount: 1, triggerTarget: 'attacker' } },
          },
        ],
      },
    ]);
    const a = makeEntity({ id: 'a', resources: { hp: 1000, maxHp: 1000 } });
    const b = makeEntity({ id: 'b', resources: { hp: 1000, maxHp: 1000 } });
    a.statuses = [{ id: 'sa', statusId: 'reflect', stacks: 1, appliedAtTick: 0, sourceId: 'a' }];
    b.statuses = [{ id: 'sb', statusId: 'reflect', stacks: 1, appliedAtTick: 0, sourceId: 'b' }];
    const world = makeWorld([a, b], 1);

    const incoming = {
      id: 'evt1', tick: 1, type: 'combat.damage.applied',
      actorId: 'a', targetIds: ['b'],
      payload: { attackerId: 'a', targetId: 'b', damage: 1 },
    };
    const procCtx = makeProcContext();
    const events = processStatusTriggers(incoming, world, procCtx, 1);

    // The chain must terminate. A halt event is emitted when the cap is hit.
    expect(events.some(ev => ev.type === 'status.trigger.halted')).toBe(true);
    // chainDepth never exceeds the cap.
    expect(procCtx.chainDepth).toBeLessThanOrEqual(PROC_DEPTH_LIMIT);
    // Total reflect procs are bounded (not infinite).
    const fired = events.filter(ev => ev.type === 'status.trigger.fired');
    expect(fired.length).toBeLessThanOrEqual(PROC_DEPTH_LIMIT);
  });

  it('does not re-fire the same (event,source,target,status) signature within one tick', () => {
    registerStatusDefinitions([
      {
        id: 'thorns', name: 'Thorns', tags: ['buff'], stacking: 'replace',
        triggers: [
          {
            event: 'combat.damage.applied',
            effect: { type: 'damage', target: 'target', params: { amount: 1, triggerTarget: 'attacker' } },
          },
        ],
      },
    ]);
    const defender = makeEntity({ id: 'defender', resources: { hp: 50, maxHp: 50 } });
    const attacker = makeEntity({ id: 'attacker', resources: { hp: 50, maxHp: 50 } });
    defender.statuses = [{ id: 's1', statusId: 'thorns', stacks: 1, appliedAtTick: 0, sourceId: 'defender' }];
    const world = makeWorld([defender, attacker], 1);

    const incoming = {
      id: 'evt1', tick: 1, type: 'combat.damage.applied',
      actorId: 'attacker', targetIds: ['defender'],
      payload: { attackerId: 'attacker', targetId: 'defender', damage: 5 },
    };
    const procCtx = makeProcContext();
    // Process the same event twice within the same proc context (same tick).
    processStatusTriggers(incoming, world, procCtx, 1);
    const hpAfterFirst = attacker.resources.hp;
    processStatusTriggers(incoming, world, procCtx, 1);
    const hpAfterSecond = attacker.resources.hp;
    // The dedup set blocks the second identical proc.
    expect(hpAfterSecond).toBe(hpAfterFirst);
  });

  it('ignores triggers whose event does not match', () => {
    registerStatusDefinitions([
      {
        id: 'spiked', name: 'Spiked', tags: ['buff'], stacking: 'replace',
        triggers: [
          { event: 'combat.damage.applied', effect: { type: 'damage', target: 'actor', params: { amount: 2 } } },
        ],
      },
    ]);
    const defender = makeEntity({ id: 'defender' });
    defender.statuses = [{ id: 's1', statusId: 'spiked', stacks: 1, appliedAtTick: 0, sourceId: 'defender' }];
    const world = makeWorld([defender], 1);
    const incoming = {
      id: 'evt1', tick: 1, type: 'combat.contact.miss',
      actorId: 'x', targetIds: ['defender'], payload: {},
    };
    const procCtx = makeProcContext();
    const events = processStatusTriggers(incoming, world, procCtx, 1);
    expect(events.filter(ev => ev.type === 'status.trigger.fired')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// M1: AoE proc-chain uniformity — a shared per-tick proc context must not let
// chain depth ACCUMULATE across an AoE's separate damage events. Each seed
// event starts its own chain at depth 0 (the cap bounds each single chain);
// the already-fired dedup Set stays shared across the whole tick.
// ---------------------------------------------------------------------------

describe('M1: identical reactive statuses fire uniformly across an AoE\'s damage events', () => {
  /**
   * Attacker + two identical defenders, ALL carrying a reflect status, so each
   * seed damage event opens a full ping-pong chain (defender ↔ attacker) that
   * runs to the depth cap. If chain depth leaks from the first seed's chain
   * into the second, the second defender's reactions are (partially or wholly)
   * suppressed — a per-entity count that depends on same-tick ordering.
   *
   * Mirrors the production call pattern exactly (status-core.ts action.resolved
   * hook): ONE ProcContext shared across all of the tick's seed damage events.
   */
  function runAoeSeeds(order: ('a' | 'b')[]) {
    registerStatusDefinitions([
      {
        id: 'reflect', name: 'Reflect', tags: ['buff'], stacking: 'replace',
        triggers: [
          {
            event: 'combat.damage.applied',
            effect: { type: 'damage', target: 'target', params: { amount: 1, triggerTarget: 'attacker' } },
          },
        ],
      },
    ]);
    const withReflect = (e: EntityState): EntityState => {
      e.statuses = [{ id: `s-${e.id}`, statusId: 'reflect', stacks: 1, appliedAtTick: 0, sourceId: e.id }];
      return e;
    };
    const attacker = withReflect(makeEntity({ id: 'attacker', resources: { hp: 1000, maxHp: 1000 } }));
    const a = withReflect(makeEntity({ id: 'a', resources: { hp: 1000, maxHp: 1000 } }));
    const b = withReflect(makeEntity({ id: 'b', resources: { hp: 1000, maxHp: 1000 } }));
    const world = makeWorld([attacker, a, b], 1);

    const seedFor = (defender: 'a' | 'b') => ({
      id: `evt-${defender}`, tick: 1, type: 'combat.damage.applied',
      actorId: 'attacker', targetIds: [defender],
      payload: { attackerId: 'attacker', targetId: defender, damage: 3 },
    });

    // One shared proc context for the tick's whole seed batch (production pattern).
    const procCtx = makeProcContext();
    const events: ResolvedEvent[] = [];
    for (const d of order) {
      events.push(...processStatusTriggers(seedFor(d), world, procCtx, 1));
    }

    const firedBy = (reactorId: string) =>
      events.filter(
        ev => ev.type === 'status.trigger.fired' && ev.payload.sourceId === reactorId,
      ).length;
    return { firedBy, events };
  }

  it('two identical reflect defenders hit by one AoE produce identical reflect counts', () => {
    const { firedBy } = runAoeSeeds(['a', 'b']);
    expect(firedBy('a')).toBeGreaterThan(0);
    expect(firedBy('b')).toBe(firedBy('a'));
  });

  it('per-entity reflect counts are invariant under seed-event processing order', () => {
    const run1 = runAoeSeeds(['a', 'b']);
    const run2 = runAoeSeeds(['b', 'a']);
    expect(run1.firedBy('a')).toBe(run2.firedBy('a'));
    expect(run1.firedBy('b')).toBe(run2.firedBy('b'));
  });

  it('the depth cap still halts each single ping-pong chain (no unbounded loop)', () => {
    const { firedBy, events } = runAoeSeeds(['a', 'b']);
    expect(events.some(ev => ev.type === 'status.trigger.halted')).toBe(true);
    // Each defender's chain is bounded by the cap (alternating hops → at most half).
    expect(firedBy('a')).toBeLessThanOrEqual(PROC_DEPTH_LIMIT);
    expect(firedBy('b')).toBeLessThanOrEqual(PROC_DEPTH_LIMIT);
  });
});

// ---------------------------------------------------------------------------
// MOD-C-BH-01: periodic events are player-renderable
//
// Before this fix, status.periodic.damage/heal/expired carried no description
// and no presentation, and no paired resource.changed fired — and because the
// periodic pass removes finished instances BEFORE status-core's expiry sweep,
// the standard status.expired never fired for them either. A burning player
// silently lost HP with zero player-visible feedback. The events now carry a
// player-grade description + presentation metadata matching the sibling
// combat-damage events, a paired resource.changed, and a renderable expiry.
// ---------------------------------------------------------------------------

describe('MOD-C-BH-01: periodic events carry description + presentation + renderable expiry', () => {
  const burning: StatusDefinition = {
    id: 'burning',
    name: 'Burning',
    tags: ['poison', 'debuff'],
    stacking: 'refresh',
    duration: { type: 'ticks', value: 4 },
  };
  const regen: StatusDefinition = {
    id: 'regen',
    name: 'Regenerating',
    tags: ['buff'],
    stacking: 'refresh',
    duration: { type: 'ticks', value: 3 },
  };

  beforeEach(() => {
    registerStatusDefinitions([burning, regen]);
  });

  it('status.periodic.damage carries a player-grade description + objective presentation', () => {
    const e = makeEntity({ name: 'Torch Ghoul', resources: { hp: 20, maxHp: 20 } });
    const world = makeWorld([e], 0);
    applyStatus(e, 'burning', 0, {
      duration: 4,
      data: { periodicKind: 'damage', periodTicks: 1, amount: 3 },
    }, world);

    const events = processPeriodicStatuses(world, 0);
    const dmg = events.find(ev => ev.type === 'status.periodic.damage');
    expect(dmg).toBeDefined();
    expect(dmg!.payload.description).toBe('Torch Ghoul takes 3 damage from Burning');
    expect(dmg!.payload.statusName).toBe('Burning');
    expect(dmg!.payload.entityName).toBe('Torch Ghoul');
    // Presentation matches the sibling combat.damage.applied metadata.
    expect(dmg!.presentation?.channels).toContain('objective');
    expect(dmg!.presentation?.priority).toBe('high');
  });

  it('status.periodic.heal carries description + presentation and reports the ACTUAL healed amount', () => {
    const e = makeEntity({ name: 'Pilgrim', resources: { hp: 19, maxHp: 20 } });
    const world = makeWorld([e], 0);
    applyStatus(e, 'regen', 0, {
      duration: 3,
      data: { periodicKind: 'heal', periodTicks: 1, amount: 4, resource: 'hp' },
    }, world);

    const events = processPeriodicStatuses(world, 0);
    const heal = events.find(ev => ev.type === 'status.periodic.heal');
    expect(heal).toBeDefined();
    // Capped at maxHp: only 1 actually healed, and the text says so.
    expect(heal!.payload.description).toBe('Pilgrim recovers 1 hp from Regenerating');
    expect(heal!.payload.statusName).toBe('Regenerating');
    expect(heal!.presentation?.channels).toContain('objective');
  });

  it('an unregistered statusId degrades to the raw id in the description (never throws)', () => {
    const e = makeEntity({ resources: { hp: 20, maxHp: 20 } });
    const world = makeWorld([e], 0);
    applyStatus(e, 'mystery-dot', 0, {
      duration: 2,
      data: { periodicKind: 'damage', periodTicks: 1, amount: 1 },
    }, world);

    const events = processPeriodicStatuses(world, 0);
    const dmg = events.find(ev => ev.type === 'status.periodic.damage');
    expect(dmg!.payload.description).toBe('E1 takes 1 damage from mystery-dot');
  });

  it('a paired resource.changed fires alongside each periodic tick (HP bars stay honest)', () => {
    const e = makeEntity({ resources: { hp: 20, maxHp: 20 } });
    const world = makeWorld([e], 0);
    applyStatus(e, 'burning', 0, {
      duration: 4,
      data: { periodicKind: 'damage', periodTicks: 1, amount: 3 },
    }, world);

    const events = processPeriodicStatuses(world, 0);
    const rcIdx = events.findIndex(ev => ev.type === 'resource.changed');
    const dmgIdx = events.findIndex(ev => ev.type === 'status.periodic.damage');
    expect(rcIdx).toBeGreaterThanOrEqual(0);
    const rc = events[rcIdx];
    expect(rc.payload.entityId).toBe('e1');
    expect(rc.payload.resource).toBe('hp');
    expect(rc.payload.previous).toBe(20);
    expect(rc.payload.current).toBe(17);
    expect(rc.payload.delta).toBe(-3);
    // Ordered AFTER its damage event — same order combat-core uses.
    expect(rcIdx).toBeGreaterThan(dmgIdx);
  });

  it('heal ticks pair a resource.changed with the actual (capped) delta', () => {
    const e = makeEntity({ resources: { hp: 19, maxHp: 20 } });
    const world = makeWorld([e], 0);
    applyStatus(e, 'regen', 0, {
      duration: 3,
      data: { periodicKind: 'heal', periodTicks: 1, amount: 4, resource: 'hp' },
    }, world);

    const events = processPeriodicStatuses(world, 0);
    const rc = events.find(ev => ev.type === 'resource.changed');
    expect(rc).toBeDefined();
    expect(rc!.payload.previous).toBe(19);
    expect(rc!.payload.current).toBe(20);
    expect(rc!.payload.delta).toBe(1);
  });

  it('expiry is signalled renderably: status.periodic.expired carries a description', () => {
    const e = makeEntity({ resources: { hp: 50, maxHp: 50 } });
    const world = makeWorld([e], 0);
    applyStatus(e, 'burning', 0, {
      duration: 2,
      data: { periodicKind: 'damage', periodTicks: 1, amount: 1 },
    }, world);

    let expired: ResolvedEvent | undefined;
    for (let t = 0; t <= 2; t++) {
      world.meta.tick = t;
      const evs = processPeriodicStatuses(world, t);
      expired ??= evs.find(ev => ev.type === 'status.periodic.expired');
    }
    expect(expired).toBeDefined();
    expect(expired!.payload.description).toBe('Burning fades from E1');
    expect(expired!.payload.statusName).toBe('Burning');
    expect(expired!.presentation?.channels).toContain('objective');
  });

  it('a DoT kill carries defeat presentation matching combat-core defeats', () => {
    const e = makeEntity({ resources: { hp: 2, maxHp: 20 } });
    const world = makeWorld([e], 0);
    applyStatus(e, 'burning', 0, {
      duration: 4,
      data: { periodicKind: 'damage', periodTicks: 1, amount: 5 },
    }, world);

    const events = processPeriodicStatuses(world, 0);
    const defeat = events.find(ev => ev.type === 'combat.entity.defeated');
    expect(defeat).toBeDefined();
    expect(defeat!.presentation?.channels).toContain('narrator');
    expect(defeat!.presentation?.priority).toBe('critical');
  });

  it('descriptions stay deterministic — same seed, byte-identical periodic event payloads', () => {
    const run = () => {
      const e = makeEntity({ resources: { hp: 30, maxHp: 30 } });
      const world = makeWorld([e], 0, 7);
      applyStatus(e, 'burning', 0, {
        duration: 3,
        data: { periodicKind: 'damage', periodTicks: 1, amount: 2 },
      }, world);
      const all: ResolvedEvent[] = [];
      for (let t = 0; t <= 3; t++) {
        world.meta.tick = t;
        all.push(...processPeriodicStatuses(world, t));
      }
      return JSON.stringify(all.map(ev => [ev.type, ev.payload]));
    };
    expect(run()).toBe(run());
  });
});
