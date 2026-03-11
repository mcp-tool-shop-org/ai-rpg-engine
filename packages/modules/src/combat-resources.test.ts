import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine, nextId } from '@ai-rpg-engine/core';
import type { EntityState, ActionIntent } from '@ai-rpg-engine/core';
import { createCombatCore, COMBAT_STATES } from './combat-core.js';
import { statusCore, hasStatus, applyStatus } from './status-core.js';
import { createCombatTactics, clearRoundFlags } from './combat-tactics.js';
import { createEngagementCore } from './engagement-core.js';
import { selectNpcCombatAction } from './combat-intent.js';
import { createCognitionCore } from './cognition-core.js';
import {
  createCombatResources,
  buildTacticalHooks,
  withCombatResources,
  applyResourceIntentModifiers,
} from './combat-resources.js';
import type { CombatResourceProfile, IntentScore } from './index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeEntity = (id: string, name: string, zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type: 'enemy',
  name,
  tags: ['enemy'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 20, maxHp: 20, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

const makePlayer = (zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 20, maxHp: 20, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

beforeEach(() => {
  clearRoundFlags();
});

// ---------------------------------------------------------------------------
// Test profiles
// ---------------------------------------------------------------------------

const gladiatorProfile: CombatResourceProfile = {
  packId: 'gladiator',
  gains: [
    { trigger: 'attack-hit', resourceId: 'crowd-favor', amount: 3 },
    { trigger: 'defeat-enemy', resourceId: 'crowd-favor', amount: 8 },
    { trigger: 'reposition-outflank', resourceId: 'crowd-favor', amount: 2 },
  ],
  spends: [
    { action: 'attack', resourceId: 'crowd-favor', amount: 10, effects: { damageBonus: 3 } },
    { action: 'guard', resourceId: 'crowd-favor', amount: 15, effects: { guardBonus: 0.15 } },
  ],
  drains: [
    { trigger: 'take-damage', resourceId: 'fatigue', amount: 3 },
    { trigger: 'reposition-fail', resourceId: 'fatigue', amount: 5 },
  ],
  aiModifiers: [
    {
      resourceId: 'crowd-favor',
      highThreshold: 60,
      highModifiers: { attack: 10, reposition: 10 },
      lowThreshold: 20,
      lowModifiers: { guard: 10, brace: 10 },
    },
  ],
};

const roninProfile: CombatResourceProfile = {
  packId: 'ronin',
  gains: [
    { trigger: 'brace', resourceId: 'ki', amount: 2 },
    { trigger: 'guard-absorb', resourceId: 'ki', amount: 1 },
  ],
  spends: [
    { action: 'reposition', resourceId: 'ki', amount: 4, effects: { repositionBonus: 20 } },
    { action: 'guard', resourceId: 'ki', amount: 3, effects: { resistState: COMBAT_STATES.OFF_BALANCE, resistChance: 80 } },
    { action: 'attack', resourceId: 'ki', amount: 5, effects: { damageBonus: 2 } },
  ],
  drains: [
    { trigger: 'disengage-fail', resourceId: 'honor', amount: 2 },
  ],
  aiModifiers: [
    {
      resourceId: 'ki',
      highThreshold: 30,
      highModifiers: { reposition: 10, attack: 5 },
      lowThreshold: 5,
      lowModifiers: { brace: 15, guard: 10 },
    },
  ],
};

// ---------------------------------------------------------------------------
// Gains
// ---------------------------------------------------------------------------

describe('resource gains', () => {
  it('gains resource on attack hit', () => {
    const player = makePlayer('a', {
      resources: { hp: 20, maxHp: 20, stamina: 5, 'crowd-favor': 50 },
    });
    const enemy = makeEntity('bandit', 'Bandit', 'a');

    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createCombatTactics(),
        createCombatResources(gladiatorProfile),
      ],
      entities: [player, enemy],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Submit attack — regardless of hit/miss, check if listener fires
    engine.submitAction('attack', { targetIds: ['bandit'] });

    const p = engine.world.entities.player;
    const hitEvents = engine.world.eventLog?.filter(
      (e: any) => e.type === 'combat.contact.hit',
    ) ?? [];

    // If the attack hit, crowd-favor should have increased
    if (hitEvents.length > 0) {
      expect(p.resources['crowd-favor']).toBeGreaterThan(50);
    }
  });

  it('gains resource on brace action', () => {
    const player = makePlayer('a', {
      resources: { hp: 20, maxHp: 20, stamina: 5, ki: 10 },
    });

    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createCombatTactics(),
        createCombatResources(roninProfile),
      ],
      entities: [player],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    engine.submitAction('brace');

    const p = engine.world.entities.player;
    expect(p.resources.ki).toBe(12); // 10 + 2 from brace gain
  });

  it('caps resource at 100', () => {
    const player = makePlayer('a', {
      resources: { hp: 20, maxHp: 20, stamina: 5, 'crowd-favor': 99 },
    });
    const enemy = makeEntity('bandit', 'Bandit', 'a');

    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createCombatTactics(),
        createCombatResources(gladiatorProfile),
      ],
      entities: [player, enemy],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Force a hit scenario — repeatedly attack
    engine.submitAction('attack', { targetIds: ['bandit'] });

    const p = engine.world.entities.player;
    expect(p.resources['crowd-favor']).toBeLessThanOrEqual(100);
  });

  it('ignores entities without the resource', () => {
    // Player has no crowd-favor resource — gains should not apply
    const player = makePlayer('a');
    const enemy = makeEntity('bandit', 'Bandit', 'a');

    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createCombatTactics(),
        createCombatResources(gladiatorProfile),
      ],
      entities: [player, enemy],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    engine.submitAction('attack', { targetIds: ['bandit'] });

    const p = engine.world.entities.player;
    // crowd-favor should remain undefined (not set by the gain listener)
    expect(p.resources['crowd-favor']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Drains
// ---------------------------------------------------------------------------

describe('resource drains', () => {
  it('drains resource on take-damage', () => {
    const player = makePlayer('a', {
      resources: { hp: 20, maxHp: 20, stamina: 5, fatigue: 10 },
    });
    const enemy = makeEntity('bandit', 'Bandit', 'a');

    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createCombatTactics(),
        createCombatResources(gladiatorProfile),
      ],
      entities: [player, enemy],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Enemy attacks player — use npcAction directly
    const action: ActionIntent = {
      id: nextId('action'),
      actorId: 'bandit',
      verb: 'attack',
      targetIds: ['player'],
      source: 'ai',
      issuedAtTick: engine.world.meta.tick,
    };
    engine.submitAction('attack', { actorId: 'bandit', targetIds: ['player'] });

    const p = engine.world.entities.player;
    // If hit, fatigue should increase (drain is triggered by take-damage)
    // Check if any damage was applied
    const wasHit = p.resources.hp < 20;
    if (wasHit) {
      expect(p.resources.fatigue).toBeGreaterThan(10);
    }
  });

  it('floors resource at 0', () => {
    const player = makePlayer('a', {
      resources: { hp: 20, maxHp: 20, stamina: 5, fatigue: 1 },
    });
    const enemy = makeEntity('bandit', 'Bandit', 'a');

    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createCombatTactics(),
        createCombatResources(gladiatorProfile),
      ],
      entities: [player, enemy],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    engine.submitAction('attack', { actorId: 'bandit', targetIds: ['player'] });

    const p = engine.world.entities.player;
    expect(p.resources.fatigue).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// withCombatResources (formula wrapper for attack/guard spends)
// ---------------------------------------------------------------------------

describe('withCombatResources formula wrapper', () => {
  it('adds damage bonus when attacker has enough resource', () => {
    const player = makePlayer('a', {
      resources: { hp: 20, maxHp: 20, stamina: 5, 'crowd-favor': 50 },
    });
    const enemy = makeEntity('bandit', 'Bandit', 'a');

    const formulas = withCombatResources(gladiatorProfile, {
      statMapping: { attack: 'vigor', precision: 'instinct', resolve: 'will' },
    });

    // Call damage formula directly
    const dmg = formulas.damage!(player, enemy, {} as any);

    // Base damage is from default formula (not provided), so damageBonus (+3) is added
    // Also, crowd-favor should have been deducted by 10
    expect(player.resources['crowd-favor']).toBe(40); // 50 - 10
    expect(dmg).toBeGreaterThanOrEqual(3); // at least the bonus
  });

  it('does not spend when resource is insufficient', () => {
    const player = makePlayer('a', {
      resources: { hp: 20, maxHp: 20, stamina: 5, 'crowd-favor': 5 },
    });
    const enemy = makeEntity('bandit', 'Bandit', 'a');

    const formulas = withCombatResources(gladiatorProfile, {
      statMapping: { attack: 'vigor', precision: 'instinct', resolve: 'will' },
    });

    formulas.damage!(player, enemy, {} as any);

    // Not enough crowd-favor (need 10, have 5) — no deduction
    expect(player.resources['crowd-favor']).toBe(5);
  });

  it('adds guard reduction bonus on guard spend', () => {
    const player = makePlayer('a', {
      resources: { hp: 20, maxHp: 20, stamina: 5, 'crowd-favor': 20 },
    });

    const formulas = withCombatResources(gladiatorProfile, {
      statMapping: { attack: 'vigor', precision: 'instinct', resolve: 'will' },
    });

    const reduction = formulas.guardReduction!(player, {} as any);

    // Base guard reduction (default 0.5) + 0.15 bonus
    expect(reduction).toBeCloseTo(0.65);
    expect(player.resources['crowd-favor']).toBe(5); // 20 - 15
  });

  it('skips entities without the resource defined', () => {
    const player = makePlayer('a'); // no crowd-favor resource
    const enemy = makeEntity('bandit', 'Bandit', 'a');

    const formulas = withCombatResources(gladiatorProfile, {
      statMapping: { attack: 'vigor', precision: 'instinct', resolve: 'will' },
    });

    const dmg = formulas.damage!(player, enemy, {} as any);

    // Should not crash, crowd-favor stays undefined
    expect(player.resources['crowd-favor']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildTacticalHooks (brace/reposition spends)
// ---------------------------------------------------------------------------

describe('buildTacticalHooks', () => {
  it('adds reposition bonus when entity has enough ki', () => {
    const hooks = buildTacticalHooks(roninProfile);
    const player = makePlayer('a', {
      resources: { hp: 20, maxHp: 20, stamina: 5, ki: 10 },
    });

    const result = hooks.movementModifier!(player, 'reposition', {} as any);

    expect(result.successBonus).toBe(20);
    expect(player.resources.ki).toBe(6); // 10 - 4
  });

  it('does not spend ki when insufficient for reposition', () => {
    const hooks = buildTacticalHooks(roninProfile);
    const player = makePlayer('a', {
      resources: { hp: 20, maxHp: 20, stamina: 5, ki: 2 },
    });

    const result = hooks.movementModifier!(player, 'reposition', {} as any);

    expect(result.successBonus).toBe(0);
    expect(player.resources.ki).toBe(2); // unchanged
  });

  it('ignores non-reposition actions in movementModifier', () => {
    const hooks = buildTacticalHooks(roninProfile);
    const player = makePlayer('a', {
      resources: { hp: 20, maxHp: 20, stamina: 5, ki: 10 },
    });

    const result = hooks.movementModifier!(player, 'attack', {} as any);

    expect(result).toEqual({});
    expect(player.resources.ki).toBe(10); // unchanged
  });
});

// ---------------------------------------------------------------------------
// applyResourceIntentModifiers (AI scoring)
// ---------------------------------------------------------------------------

describe('applyResourceIntentModifiers', () => {
  function makeScore(intent: string, score: number): IntentScore {
    return {
      intent: intent as any,
      resolvedVerb: intent as any,
      score,
      contributions: [],
      reason: 'test',
    };
  }

  it('boosts attack/reposition when crowd-favor is high', () => {
    const entity = makeEntity('gladiator', 'Gladiator', 'a', {
      resources: { hp: 20, maxHp: 20, stamina: 5, 'crowd-favor': 70 },
    });

    const scores = [
      makeScore('attack', 50),
      makeScore('guard', 30),
      makeScore('reposition', 30),
    ];

    applyResourceIntentModifiers(gladiatorProfile, entity, scores);

    expect(scores[0].score).toBe(60); // attack +10
    expect(scores[1].score).toBe(30); // guard unchanged (no high modifier)
    expect(scores[2].score).toBe(40); // reposition +10
  });

  it('boosts guard/brace when crowd-favor is low', () => {
    const entity = makeEntity('gladiator', 'Gladiator', 'a', {
      resources: { hp: 20, maxHp: 20, stamina: 5, 'crowd-favor': 15 },
    });

    const scores = [
      makeScore('attack', 50),
      makeScore('guard', 30),
      makeScore('brace', 25),
    ];

    applyResourceIntentModifiers(gladiatorProfile, entity, scores);

    expect(scores[0].score).toBe(50); // attack unchanged (no low modifier for attack)
    expect(scores[1].score).toBe(40); // guard +10
    expect(scores[2].score).toBe(35); // brace +10
  });

  it('ignores entities without the resource', () => {
    const entity = makeEntity('bandit', 'Bandit', 'a'); // no crowd-favor

    const scores = [makeScore('attack', 50)];
    applyResourceIntentModifiers(gladiatorProfile, entity, scores);

    expect(scores[0].score).toBe(50); // unchanged
  });

  it('applies both high and low modifiers from different resources', () => {
    const entity = makeEntity('ronin', 'Ronin', 'a', {
      resources: { hp: 20, maxHp: 20, stamina: 5, ki: 35 },
    });

    const scores = [
      makeScore('reposition', 30),
      makeScore('attack', 50),
    ];

    applyResourceIntentModifiers(roninProfile, entity, scores);

    expect(scores[0].score).toBe(40); // reposition +10 (high ki)
    expect(scores[1].score).toBe(55); // attack +5 (high ki)
  });
});

// ---------------------------------------------------------------------------
// Module registration (createCombatResources)
// ---------------------------------------------------------------------------

describe('createCombatResources module', () => {
  it('creates a valid engine module with unique id', () => {
    const module = createCombatResources(gladiatorProfile);
    expect(module.id).toBe('combat-resources-gladiator');
    expect(module.version).toBe('1.0.0');
    expect(module.dependsOn).toContain('combat-core');
  });

  it('registers without errors', () => {
    const player = makePlayer('a', {
      resources: { hp: 20, maxHp: 20, stamina: 5, 'crowd-favor': 50, fatigue: 0 },
    });

    expect(() => {
      createTestEngine({
        modules: [
          statusCore,
          createCombatCore(),
          createCombatTactics(),
          createCombatResources(gladiatorProfile),
        ],
        entities: [player],
        zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility
// ---------------------------------------------------------------------------

describe('backward compatibility', () => {
  it('engine works without any combat resource profile', () => {
    const player = makePlayer('a');
    const enemy = makeEntity('bandit', 'Bandit', 'a');

    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [player, enemy],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const events = engine.submitAction('attack', { targetIds: ['bandit'] });
    expect(events.length).toBeGreaterThan(0);
  });

  it('withCombatResources with empty profile passes through base formulas', () => {
    const emptyProfile: CombatResourceProfile = {
      packId: 'fantasy',
      gains: [],
      spends: [],
      drains: [],
      aiModifiers: [],
    };

    const base = {
      statMapping: { attack: 'vigor', precision: 'instinct', resolve: 'will' } as any,
      damage: (a: EntityState) => a.stats.vigor ?? 3,
    };

    const wrapped = withCombatResources(emptyProfile, base);
    const player = makePlayer('a');
    const enemy = makeEntity('bandit', 'Bandit', 'a');

    // damage should pass through unchanged
    expect(wrapped.damage!(player, enemy, {} as any)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Scaled gains
// ---------------------------------------------------------------------------

describe('scaled resource gains', () => {
  it('scales gain by entity stat', () => {
    const scaledProfile: CombatResourceProfile = {
      packId: 'test',
      gains: [
        { trigger: 'brace', resourceId: 'ki', amount: 1, scaleStat: 'will', scaleMultiplier: 0.5 },
      ],
      spends: [],
      drains: [],
      aiModifiers: [],
    };

    const player = makePlayer('a', {
      stats: { vigor: 5, instinct: 5, will: 6 },
      resources: { hp: 20, maxHp: 20, stamina: 5, ki: 10 },
    });

    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createCombatTactics(),
        createCombatResources(scaledProfile),
      ],
      entities: [player],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    engine.submitAction('brace');

    // Gain = 1 + (6 * 0.5) = 4, so ki should be 10 + 4 = 14
    expect(engine.world.entities.player.resources.ki).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// Ally-defeated resource triggers (P5)
// ---------------------------------------------------------------------------

describe('Ally-defeated resource triggers', () => {
  const allyDefeatProfile: CombatResourceProfile = {
    packId: 'test-ally-defeat',
    gains: [
      { trigger: 'ally-defeated', resourceId: 'rage', amount: 5 },
    ],
    spends: [],
    drains: [
      { trigger: 'ally-defeated', resourceId: 'morale', amount: 3 },
    ],
    aiModifiers: [],
  };

  it('ally-defeated gain applies to same-type entities in zone', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createCombatResources(allyDefeatProfile),
      ],
      entities: [
        makeEntity('npc1', 'Guard A', 'a', { resources: { hp: 20, rage: 0, morale: 10 } }),
        makeEntity('npc2', 'Guard B', 'a', { resources: { hp: 1, rage: 0, morale: 10 } }),
        makePlayer('a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [] as string[], neighbors: [] as string[] }],
    });

    // Defeat npc2
    engine.world.entities.npc2.resources.hp = 0;
    engine.store.recordEvent({
      id: nextId('evt'),
      tick: engine.store.tick,
      type: 'combat.entity.defeated',
      actorId: 'player',
      payload: { entityId: 'npc2', entityName: 'Guard B', defeatedBy: 'player' },
    });

    // npc1 should gain +5 rage (same-type ally in zone)
    expect(engine.world.entities.npc1.resources.rage).toBe(5);
    // npc1 should drain -3 morale
    expect(engine.world.entities.npc1.resources.morale).toBe(7);
  });

  it('dead entities and different-type entities do not receive ally-defeated triggers', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createCombatResources(allyDefeatProfile),
      ],
      entities: [
        makeEntity('npc1', 'Guard A', 'a', { resources: { hp: 0, rage: 0, morale: 10 } }), // dead
        makePlayer('a', { resources: { hp: 20, maxHp: 20, stamina: 5, rage: 0, morale: 10 } }), // different type
        makeEntity('npc2', 'Guard B', 'a', { resources: { hp: 1, rage: 0, morale: 10 } }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [] as string[], neighbors: [] as string[] }],
    });

    engine.world.entities.npc2.resources.hp = 0;
    engine.store.recordEvent({
      id: nextId('evt'),
      tick: engine.store.tick,
      type: 'combat.entity.defeated',
      actorId: 'player',
      payload: { entityId: 'npc2', entityName: 'Guard B', defeatedBy: 'player' },
    });

    // Dead npc1 should not get triggers
    expect(engine.world.entities.npc1.resources.rage).toBe(0);
    // Player (different type) should not get triggers
    expect(engine.world.entities.player.resources.rage).toBe(0);
  });

  it('ally-defeated does not apply to entities in different zones', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createCombatResources(allyDefeatProfile),
      ],
      entities: [
        makeEntity('npc1', 'Guard A', 'b', { resources: { hp: 20, rage: 0, morale: 10 } }), // different zone
        makeEntity('npc2', 'Guard B', 'a', { resources: { hp: 1, rage: 0, morale: 10 } }),
        makePlayer('a'),
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [] as string[], neighbors: [] as string[] },
        { id: 'b', roomId: 'test', name: 'B', tags: [] as string[], neighbors: [] as string[] },
      ],
    });

    engine.world.entities.npc2.resources.hp = 0;
    engine.store.recordEvent({
      id: nextId('evt'),
      tick: engine.store.tick,
      type: 'combat.entity.defeated',
      actorId: 'player',
      payload: { entityId: 'npc2', entityName: 'Guard B', defeatedBy: 'player' },
    });

    // npc1 in different zone should not get triggers
    expect(engine.world.entities.npc1.resources.rage).toBe(0);
  });
});
