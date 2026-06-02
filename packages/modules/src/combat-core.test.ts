// combat-core tests — effective-stat hook (passive status modifiers reach combat)
//
// Proves capability 1 of the status-system design lock: a +stat buff status
// actually changes a damage result because combat-core reads stats through
// effectiveStat (not raw entity.stats). Back-compat: with no modifiers, damage is
// byte-identical to the pre-change behaviour (raw base stat).

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import { createCombatCore, DEFAULT_STAT_MAPPING } from './combat-core.js';
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
