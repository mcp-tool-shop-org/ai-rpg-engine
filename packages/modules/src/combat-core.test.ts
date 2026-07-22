// combat-core tests — effective-stat hook (passive status modifiers reach combat)
//
// Proves capability 1 of the status-system design lock: a +stat buff status
// actually changes a damage result because combat-core reads stats through
// effectiveStat (not raw entity.stats). Back-compat: with no modifiers, damage is
// byte-identical to the pre-change behaviour (raw base stat).

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import { createCombatCore, DEFAULT_STAT_MAPPING, simpleRoll } from './combat-core.js';
import { statusCore, applyStatus } from './status-core.js';
import { registerStatusDefinitions, clearStatusRegistry } from './status-semantics.js';

const makeEntity = (id: string, zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type: 'enemy',
  name: id,
  tags: ['enemy'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 50, maxHp: 50, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

beforeEach(() => {
  clearStatusRegistry();
});

describe('combat-core effective-stat hook', () => {
  it('a +vigor buff increases attack damage vs the unbuffed baseline', () => {
    registerStatusDefinitions([
      {
        id: 'might', name: 'Might', tags: ['buff'], stacking: 'replace',
        modifiers: [{ stat: 'vigor', operation: 'add', value: 4 }],
      },
    ]);

    // Baseline: attacker with vigor 5, no buff. Force a guaranteed hit by giving
    // the attacker overwhelming precision so the deterministic roll always lands.
    const baseAttacker = makeEntity('atk', 'z', { stats: { vigor: 5, instinct: 50, will: 3 } });
    const baseTarget = makeEntity('tgt', 'z');
    const baseEngine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [baseAttacker, baseTarget],
      zones: [{ id: 'z', roomId: 'r', name: 'Z', tags: [], neighbors: [] }],
      playerId: 'atk',
    });
    const baseEvents = baseEngine.submitActionAs('atk', 'attack', { targetIds: ['tgt'] });
    const baseDmg = baseEvents.find(e => e.type === 'combat.damage.applied');
    expect(baseDmg, 'baseline attack should hit').toBeTruthy();
    const baseDamage = baseDmg!.payload.damage as number;
    expect(baseDamage).toBe(5); // raw vigor 5

    // Buffed: same setup, but apply +4 might to the attacker first.
    const buffAttacker = makeEntity('atk', 'z', { stats: { vigor: 5, instinct: 50, will: 3 } });
    const buffTarget = makeEntity('tgt', 'z');
    const buffEngine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [buffAttacker, buffTarget],
      zones: [{ id: 'z', roomId: 'r', name: 'Z', tags: [], neighbors: [] }],
      playerId: 'atk',
    });
    applyStatus(buffEngine.world.entities.atk, 'might', buffEngine.tick, { duration: 10 }, buffEngine.world as never);
    const buffEvents = buffEngine.submitActionAs('atk', 'attack', { targetIds: ['tgt'] });
    const buffDmg = buffEvents.find(e => e.type === 'combat.damage.applied');
    expect(buffDmg, 'buffed attack should hit').toBeTruthy();
    const buffDamage = buffDmg!.payload.damage as number;

    // The buff must change the result: +4 vigor → 9 damage.
    expect(buffDamage).toBe(9);
    expect(buffDamage).toBeGreaterThan(baseDamage);
  });

  it('back-compat: with no status modifiers, damage equals the raw base stat', () => {
    const attacker = makeEntity('atk', 'z', { stats: { vigor: 7, instinct: 50, will: 3 } });
    const target = makeEntity('tgt', 'z');
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [attacker, target],
      zones: [{ id: 'z', roomId: 'r', name: 'Z', tags: [], neighbors: [] }],
      playerId: 'atk',
    });
    const events = engine.submitActionAs('atk', 'attack', { targetIds: ['tgt'] });
    const dmg = events.find(e => e.type === 'combat.damage.applied');
    expect(dmg).toBeTruthy();
    expect(dmg!.payload.damage).toBe(7); // unchanged: raw vigor
  });

  it('a -vigor debuff reduces damage (clamped at the 1 floor)', () => {
    registerStatusDefinitions([
      {
        id: 'weakened', name: 'Weakened', tags: ['debuff'], stacking: 'replace',
        modifiers: [{ stat: 'vigor', operation: 'add', value: -3 }],
      },
    ]);
    const attacker = makeEntity('atk', 'z', { stats: { vigor: 5, instinct: 50, will: 3 } });
    const target = makeEntity('tgt', 'z');
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [attacker, target],
      zones: [{ id: 'z', roomId: 'r', name: 'Z', tags: [], neighbors: [] }],
      playerId: 'atk',
    });
    applyStatus(engine.world.entities.atk, 'weakened', engine.tick, { duration: 10 }, engine.world as never);
    const events = engine.submitActionAs('atk', 'attack', { targetIds: ['tgt'] });
    const dmg = events.find(e => e.type === 'combat.damage.applied');
    expect(dmg).toBeTruthy();
    expect(dmg!.payload.damage).toBe(2); // 5 - 3 = 2
  });

  it('DEFAULT_STAT_MAPPING is still exported and unchanged', () => {
    expect(DEFAULT_STAT_MAPPING).toEqual({ attack: 'vigor', precision: 'instinct', resolve: 'will' });
  });
});

// ---------------------------------------------------------------------------
// F-SEED-combat-rolls-seed-blind — world.meta.seed threads into the roll layer
// as a PURE hash input. Properties pinned here:
//   1. seed omitted === seed 0 === the legacy stream (byte-for-byte), so
//      callers that do not thread a seed keep their historical outcomes;
//   2. same (tick, ids, seed) → same roll, always (stateless, replay-safe);
//   3. the range contract is untouched: integer 1-100 inclusive for any seed;
//   4. different seeds actually diverge, within a small bounded tick window;
//   5. the ATTACK PATH consumes world.meta.seed (integration through a live
//      engine): the emitted roll payload matches simpleRoll(..., meta.seed),
//      and two engines identical except for seed flip a hit/miss outcome at a
//      deterministically-located tick.
// ---------------------------------------------------------------------------
describe('simpleRoll — world-seed threading (F-SEED-combat-rolls-seed-blind)', () => {
  const ID_PAIRS: Array<[string, string]> = [
    ['atk', 'tgt'],
    ['player', 'goblin-1'],
    ['npc-77', 'counter'],
    ['companion', 'resist-off-balance'],
  ];

  it('seed omitted === seed 0: the legacy roll stream is preserved byte-for-byte', () => {
    for (let tick = 0; tick <= 500; tick++) {
      for (const [a, b] of ID_PAIRS) {
        expect(simpleRoll(tick, a, b)).toBe(simpleRoll(tick, a, b, 0));
      }
    }
  });

  it('pure and stateless: same (tick, ids, seed) always yields the same roll', () => {
    for (const seed of [0, 1, 2, 42, 999_983, 2_147_483_647]) {
      for (let tick = 0; tick <= 60; tick++) {
        expect(simpleRoll(tick, 'atk', 'tgt', seed)).toBe(simpleRoll(tick, 'atk', 'tgt', seed));
      }
    }
  });

  it('range preserved: integer 1-100 inclusive across a tick x seed x id sweep', () => {
    for (const seed of [0, 1, 7, 42, 481_913, 2_147_483_647]) {
      for (let tick = 0; tick <= 300; tick++) {
        for (const [a, b] of ID_PAIRS) {
          const r = simpleRoll(tick, a, b, seed);
          expect(Number.isInteger(r)).toBe(true);
          expect(r).toBeGreaterThanOrEqual(1);
          expect(r).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('seeds 1..20 each diverge from seed 0 within 50 ticks (bounded, deterministic)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let divergentTick: number | null = null;
      for (let tick = 1; tick <= 50; tick++) {
        if (simpleRoll(tick, 'atk', 'tgt', seed) !== simpleRoll(tick, 'atk', 'tgt', 0)) {
          divergentTick = tick;
          break;
        }
      }
      expect(divergentTick, `seed ${seed} never diverged from seed 0 within 50 ticks`).not.toBeNull();
    }
  });

  it('pinned: seeds 1 vs 2 differ on the very first tick for atk/tgt', () => {
    expect(simpleRoll(1, 'atk', 'tgt', 1)).not.toBe(simpleRoll(1, 'atk', 'tgt', 2));
  });

  // --- Integration: the attack path reads world.meta.seed -------------------

  function attackEngine(seed: number, tick?: number) {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [makeEntity('atk', 'z'), makeEntity('tgt', 'z')],
      zones: [{ id: 'z', roomId: 'r', name: 'Z', tags: [], neighbors: [] }],
      playerId: 'atk',
      seed,
    });
    // The harness has no tick option — jump the world clock directly (the same
    // idiom other module tests use to test tick-scoped behavior).
    if (tick !== undefined) engine.store.state.meta.tick = tick;
    return engine;
  }

  it('the emitted attack roll equals simpleRoll(tick, attacker, target, world.meta.seed)', () => {
    const engine = attackEngine(5);
    expect(engine.world.meta.seed).toBe(5);
    const tickAtRoll = engine.world.meta.tick; // actions resolve BEFORE advanceTick
    const events = engine.submitActionAs('atk', 'attack', { targetIds: ['tgt'] });
    const contact = events.find(
      (e) => e.type === 'combat.contact.hit' || e.type === 'combat.contact.miss',
    );
    expect(contact, 'attack should emit a hit or miss contact event').toBeTruthy();
    expect(contact!.payload.roll).toBe(simpleRoll(tickAtRoll, 'atk', 'tgt', 5));
  });

  it('two engines identical except seed flip a hit/miss outcome at a bounded, deterministically-located tick', () => {
    // Entities from makeEntity: instinct 5 vs 5 → hitChance 50 + 25 - 15 = 60.
    // Locate (pure function, no engine) a tick where seed 1 and seed 2 land on
    // opposite sides of 60, then prove it through two LIVE engines.
    const HIT_CHANCE = 60;
    let probeTick: number | null = null;
    for (let tick = 1; tick <= 100; tick++) {
      const hits1 = simpleRoll(tick, 'atk', 'tgt', 1) <= HIT_CHANCE;
      const hits2 = simpleRoll(tick, 'atk', 'tgt', 2) <= HIT_CHANCE;
      if (hits1 !== hits2) {
        probeTick = tick;
        break;
      }
    }
    expect(probeTick, 'no hit/miss flip between seeds 1 and 2 within 100 ticks').not.toBeNull();

    const outcome = (seed: number) => {
      const engine = attackEngine(seed, probeTick!);
      const events = engine.submitActionAs('atk', 'attack', { targetIds: ['tgt'] });
      return events.some((e) => e.type === 'combat.contact.hit');
    };
    expect(outcome(1)).not.toBe(outcome(2));
  });

  it('same seed, same script → identical contact outcomes (engine-level replay parity)', () => {
    const run = () => {
      const engine = attackEngine(9);
      const log: string[] = [];
      for (let i = 0; i < 5; i++) {
        const events = engine.submitActionAs('atk', 'attack', { targetIds: ['tgt'] });
        for (const e of events) {
          if (e.type === 'combat.contact.hit' || e.type === 'combat.contact.miss') {
            log.push(`${e.type}:${String(e.payload.roll)}`);
          }
        }
      }
      return log.join('|');
    };
    expect(run()).toBe(run());
  });
});
