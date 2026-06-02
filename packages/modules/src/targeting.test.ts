// targeting tests — pure faction predicate + axes-based target resolution.

import { describe, it, expect } from 'vitest';
import type { EntityState, WorldState } from '@ai-rpg-engine/core';
import type { TargetSpec } from '@ai-rpg-engine/content-schema';
import {
  affiliationOf,
  candidateTargets,
  resolveTargets,
  lowestHp,
  highestHp,
  selectRandomN,
  randomSelector,
} from './targeting.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function ent(id: string, overrides: Partial<EntityState> = {}): EntityState {
  return {
    id,
    blueprintId: id,
    type: 'pc',
    name: id,
    tags: [],
    stats: { maxHp: 30 },
    resources: { hp: 30, maxHp: 30 },
    statuses: [],
    zoneId: 'zone-a',
    ...overrides,
  };
}

function world(entities: EntityState[], over: Partial<WorldState['meta']> = {}): WorldState {
  const map: Record<string, EntityState> = {};
  for (const e of entities) map[e.id] = e;
  return {
    meta: {
      worldId: 'w',
      gameId: 'g',
      saveVersion: '1',
      tick: 1,
      seed: 42,
      activeRuleset: 'r',
      activeModules: [],
      idCounter: 0,
      ...over,
    },
    playerId: 'hero',
    locationId: 'zone-a',
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

// ---------------------------------------------------------------------------
// affiliationOf
// ---------------------------------------------------------------------------

describe('affiliationOf', () => {
  it('returns self for the same entity', () => {
    const a = ent('hero');
    expect(affiliationOf(a, a)).toBe('self');
  });

  it('uses faction when both sides carry one (different type, same faction = ally)', () => {
    const hero = ent('hero', { type: 'pc', faction: 'party' });
    const recruit = ent('recruit', { type: 'beast', faction: 'party' });
    expect(affiliationOf(hero, recruit)).toBe('ally');
  });

  it('faction mismatch = enemy even when types match', () => {
    const hero = ent('hero', { type: 'humanoid', faction: 'party' });
    const bandit = ent('bandit', { type: 'humanoid', faction: 'raiders' });
    expect(affiliationOf(hero, bandit)).toBe('enemy');
  });

  it('falls back to type when faction is absent (legacy behavior)', () => {
    const hero = ent('hero', { type: 'pc' });
    const ally = ent('ally', { type: 'pc' });
    const foe = ent('foe', { type: 'npc' });
    expect(affiliationOf(hero, ally)).toBe('ally');
    expect(affiliationOf(hero, foe)).toBe('enemy');
  });
});

// ---------------------------------------------------------------------------
// Heal a wounded ALLY (the core gap)
// ---------------------------------------------------------------------------

describe('resolveTargets — ally healing', () => {
  it('a single-target ally heal can reach a wounded ally (not just self)', () => {
    const healer = ent('healer', { type: 'pc', faction: 'party', resources: { hp: 30, maxHp: 30 } });
    const wounded = ent('fighter', { type: 'pc', faction: 'party', resources: { hp: 5, maxHp: 30 } });
    const enemy = ent('orc', { type: 'npc', faction: 'horde', resources: { hp: 20, maxHp: 20 } });
    const w = world([healer, wounded, enemy]);

    const healSpec: TargetSpec = {
      type: 'single',
      scope: 'single',
      affiliation: 'ally',
      life: 'alive',
      includeSelf: true,
    };

    // With the lowestHp selector, the most-hurt ally is chosen — the wounded fighter,
    // NOT the full-HP healer, and never the enemy.
    const targets = resolveTargets(healSpec, healer, w, { selector: lowestHp });
    expect(targets.map((t) => t.id)).toEqual(['fighter']);
  });

  it('an explicit valid ally target is honored over the selector default', () => {
    const healer = ent('healer', { type: 'pc', faction: 'party' });
    const a = ent('a', { type: 'pc', faction: 'party', resources: { hp: 10, maxHp: 30 } });
    const b = ent('b', { type: 'pc', faction: 'party', resources: { hp: 1, maxHp: 30 } });
    const w = world([healer, a, b]);
    const spec: TargetSpec = { type: 'single', affiliation: 'ally', includeSelf: true };
    const targets = resolveTargets(spec, healer, w, { explicitTargetId: 'a', selector: lowestHp });
    expect(targets.map((t) => t.id)).toEqual(['a']);
  });

  it('an ally spec never selects an enemy', () => {
    const healer = ent('healer', { type: 'pc', faction: 'party' });
    const enemy = ent('orc', { type: 'npc', faction: 'horde', resources: { hp: 1, maxHp: 20 } });
    const w = world([healer, enemy]);
    const spec: TargetSpec = { type: 'single', scope: 'all', affiliation: 'ally', includeSelf: true };
    const targets = resolveTargets(spec, healer, w);
    expect(targets.map((t) => t.id)).toEqual(['healer']);
  });
});

// ---------------------------------------------------------------------------
// Revive — ally + life:dead
// ---------------------------------------------------------------------------

describe('resolveTargets — revive (ally + life:dead)', () => {
  it('targets a dead ally and ignores living ones', () => {
    const cleric = ent('cleric', { type: 'pc', faction: 'party' });
    const fallen = ent('fallen', { type: 'pc', faction: 'party', resources: { hp: 0, maxHp: 30 } });
    const standing = ent('standing', { type: 'pc', faction: 'party', resources: { hp: 30, maxHp: 30 } });
    const w = world([cleric, fallen, standing]);

    const reviveSpec: TargetSpec = {
      type: 'single',
      scope: 'single',
      affiliation: 'ally',
      life: 'dead',
    };
    const targets = resolveTargets(reviveSpec, cleric, w);
    expect(targets.map((t) => t.id)).toEqual(['fallen']);
  });

  it('a dead ally is NOT a candidate for a normal (alive) ally heal', () => {
    const cleric = ent('cleric', { type: 'pc', faction: 'party' });
    const fallen = ent('fallen', { type: 'pc', faction: 'party', resources: { hp: 0, maxHp: 30 } });
    const w = world([cleric, fallen]);
    const aliveAllySpec: TargetSpec = { type: 'single', scope: 'all', affiliation: 'ally', life: 'alive', includeSelf: true };
    const targets = resolveTargets(aliveAllySpec, cleric, w);
    expect(targets.map((t) => t.id)).toEqual(['cleric']);
  });
});

// ---------------------------------------------------------------------------
// Friend/foe AoE — enemy blast spares allies
// ---------------------------------------------------------------------------

describe('resolveTargets — AoE affiliation filter', () => {
  it('an enemy-only AoE spares allies (and the caster)', () => {
    const mage = ent('mage', { type: 'pc', faction: 'party' });
    const ally = ent('ally', { type: 'pc', faction: 'party' });
    const orc1 = ent('orc1', { type: 'npc', faction: 'horde' });
    const orc2 = ent('orc2', { type: 'npc', faction: 'horde' });
    const w = world([mage, ally, orc1, orc2]);

    const enemyAoe: TargetSpec = { type: 'all-enemies', scope: 'all', affiliation: 'enemy', life: 'alive' };
    const targets = resolveTargets(enemyAoe, mage, w);
    expect(targets.map((t) => t.id)).toEqual(['orc1', 'orc2']);
  });

  it('an ally-only AoE buff hits allies + (opt-in) self but no enemies', () => {
    const bard = ent('bard', { type: 'pc', faction: 'party' });
    const ally = ent('ally', { type: 'pc', faction: 'party' });
    const orc = ent('orc', { type: 'npc', faction: 'horde' });
    const w = world([bard, ally, orc]);

    const allyAoe: TargetSpec = { type: 'all-enemies', scope: 'all', affiliation: 'ally', life: 'alive', includeSelf: true };
    const targets = resolveTargets(allyAoe, bard, w);
    expect(targets.map((t) => t.id)).toEqual(['ally', 'bard']);
  });

  it('an any-affiliation AoE hits everyone in zone', () => {
    const caster = ent('caster', { type: 'pc', faction: 'party' });
    const ally = ent('ally', { type: 'pc', faction: 'party' });
    const orc = ent('orc', { type: 'npc', faction: 'horde' });
    const w = world([caster, ally, orc]);
    const anyAoe: TargetSpec = { type: 'all-enemies', scope: 'all', affiliation: 'any', life: 'alive', includeSelf: true };
    const targets = resolveTargets(anyAoe, caster, w);
    expect(targets.map((t) => t.id).sort()).toEqual(['ally', 'caster', 'orc']);
  });
});

// ---------------------------------------------------------------------------
// Back-compat: flat TargetSpec still resolves
// ---------------------------------------------------------------------------

describe('resolveTargets — legacy flat specs', () => {
  it('flat { type: "self" } resolves to the source', () => {
    const a = ent('hero');
    const b = ent('other');
    const w = world([a, b]);
    expect(resolveTargets({ type: 'self' }, a, w).map((t) => t.id)).toEqual(['hero']);
  });

  it('flat { type: "all-enemies" } resolves to enemies only (legacy type heuristic)', () => {
    const hero = ent('hero', { type: 'pc' });
    const ally = ent('ally', { type: 'pc' });
    const foe1 = ent('foe1', { type: 'npc' });
    const foe2 = ent('foe2', { type: 'npc' });
    const w = world([hero, ally, foe1, foe2]);
    const targets = resolveTargets({ type: 'all-enemies' }, hero, w);
    expect(targets.map((t) => t.id)).toEqual(['foe1', 'foe2']);
  });

  it('flat { type: "single", filter: [tag] } honors the tag filter', () => {
    const hero = ent('hero', { type: 'pc' });
    const boss = ent('boss', { type: 'npc', tags: ['boss'] });
    const grunt = ent('grunt', { type: 'npc', tags: ['minion'] });
    const w = world([hero, boss, grunt]);
    // single + enemy (from type) + tag filter 'boss' → only the boss is a candidate.
    const targets = resolveTargets({ type: 'single', filter: ['boss'] }, hero, w);
    expect(targets.map((t) => t.id)).toEqual(['boss']);
  });
});

// ---------------------------------------------------------------------------
// Selectors + determinism
// ---------------------------------------------------------------------------

describe('selectors', () => {
  it('lowestHp picks the most-hurt, tie-broken by lowest id', () => {
    const w = world([
      ent('c', { resources: { hp: 5, maxHp: 30 } }),
      ent('a', { resources: { hp: 5, maxHp: 30 } }),
      ent('b', { resources: { hp: 30, maxHp: 30 } }),
    ]);
    const candidates = Object.values(w.entities);
    expect(lowestHp(candidates, w, candidates[0])!.id).toBe('a');
  });

  it('highestHp picks the healthiest, tie-broken by lowest id', () => {
    const w = world([
      ent('c', { resources: { hp: 30, maxHp: 30 } }),
      ent('a', { resources: { hp: 30, maxHp: 30 } }),
      ent('b', { resources: { hp: 5, maxHp: 30 } }),
    ]);
    const candidates = Object.values(w.entities);
    expect(highestHp(candidates, w, candidates[0])!.id).toBe('a');
  });

  it('selectRandomN is deterministic for the same seed/tick and uses only the seeded RNG', () => {
    const entities = ['e1', 'e2', 'e3', 'e4', 'e5'].map((id) => ent(id));
    const w1 = world(entities, { seed: 7, tick: 3 });
    const w2 = world(entities.map((e) => ({ ...e })), { seed: 7, tick: 3 });
    const a = selectRandomN(Object.values(w1.entities), w1, 2, 'fireball');
    const b = selectRandomN(Object.values(w2.entities), w2, 2, 'fireball');
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
    expect(a.length).toBe(2);
  });

  it('selectRandomN diverges across ticks (consumes world tick into the seed)', () => {
    const entities = ['e1', 'e2', 'e3', 'e4', 'e5'].map((id) => ent(id));
    const t3 = selectRandomN(Object.values(world(entities, { seed: 7, tick: 3 }).entities), world(entities, { seed: 7, tick: 3 }), 1, 's');
    const t9 = selectRandomN(Object.values(world(entities, { seed: 7, tick: 9 }).entities), world(entities, { seed: 7, tick: 9 }), 1, 's');
    // Not a hard guarantee in theory, but with these params the picks differ —
    // proves tick feeds the seed rather than being ignored.
    expect(t3[0].id === t9[0].id).toBe(false);
  });

  it('selectRandomN returns all (id-sorted) when n >= pool size', () => {
    const entities = ['z', 'a', 'm'].map((id) => ent(id));
    const w = world(entities);
    const picked = selectRandomN(Object.values(w.entities), w, 10);
    expect(picked.map((e) => e.id)).toEqual(['a', 'm', 'z']);
  });

  it('randomSelector picks a single deterministic candidate', () => {
    const entities = ['e1', 'e2', 'e3'].map((id) => ent(id));
    const w = world(entities, { seed: 11, tick: 2 });
    const sel = randomSelector('pick');
    const first = sel(Object.values(w.entities), w, entities[0]);
    const again = sel(Object.values(w.entities), w, entities[0]);
    expect(first!.id).toBe(again!.id);
  });
});

// ---------------------------------------------------------------------------
// candidateTargets stability
// ---------------------------------------------------------------------------

describe('candidateTargets', () => {
  it('returns candidates sorted by id regardless of insertion order', () => {
    const hero = ent('hero', { type: 'pc', faction: 'party' });
    const w = world([
      ent('zeta', { type: 'npc', faction: 'foe' }),
      ent('alpha', { type: 'npc', faction: 'foe' }),
      ent('mid', { type: 'npc', faction: 'foe' }),
      hero,
    ]);
    const spec: TargetSpec = { type: 'all-enemies', scope: 'all', affiliation: 'enemy' };
    expect(candidateTargets(spec, hero, w).map((e) => e.id)).toEqual(['alpha', 'mid', 'zeta']);
  });
});
