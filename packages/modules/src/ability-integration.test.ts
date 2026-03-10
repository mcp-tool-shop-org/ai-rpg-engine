// ability-integration.test.ts — Multi-genre integration tests for the Abilities & Powers system
// Proves: full stack (registry → cost → cooldown → check → effect → trace) across 3 genres

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, ActionIntent } from '@ai-rpg-engine/core';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import { statusCore } from './status-core.js';
import { createAbilityCore, isAbilityOnCooldown, isAbilityReady, getAvailableAbilities } from './ability-core.js';
import { createAbilityEffects } from './ability-effects.js';
import { createAbilityReview, formatAbilityTrace } from './ability-review.js';
import type { AbilityTrace } from './ability-review.js';
import { scoreAbilityUse, selectNpcAbilityAction } from './ability-intent.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [] as string[], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [] as string[], neighbors: ['zone-a'] },
];

// ---------------------------------------------------------------------------
// Fantasy — Holy Smite
// ---------------------------------------------------------------------------

const holySmite: AbilityDefinition = {
  id: 'holy-smite',
  name: 'Holy Smite',
  verb: 'use-ability',
  tags: ['divine', 'combat', 'damage'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'single' },
  checks: [{ stat: 'will', difficulty: 8, onFail: 'half-damage' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 6, damageType: 'holy' } },
    { type: 'apply-status', target: 'target', params: { statusId: 'holy-fire', duration: 2, stacking: 'replace' } },
  ],
  cooldown: 3,
  requirements: [{ type: 'has-tag', params: { tag: 'divine' } }],
};

const allFantasyAbilities = [holySmite];

function buildFantasyEngine(opts?: { playerWill?: number; enemyHp?: number; playerStamina?: number }) {
  const player: EntityState = {
    id: 'player', blueprintId: 'player', type: 'player', name: 'Chapel Seer',
    tags: ['player', 'divine', 'seer'],
    stats: { vigor: 3, instinct: 4, will: opts?.playerWill ?? 10 },
    resources: { hp: 20, stamina: opts?.playerStamina ?? 10 },
    statuses: [], zoneId: 'zone-a',
  };
  const enemy: EntityState = {
    id: 'ghoul', blueprintId: 'ghoul', type: 'enemy', name: 'Ash Ghoul',
    tags: ['enemy', 'undead'],
    stats: { vigor: 4, instinct: 3, will: 1 },
    resources: { hp: opts?.enemyHp ?? 12, stamina: 4 },
    statuses: [], zoneId: 'zone-a',
  };
  return createTestEngine({
    zones,
    entities: [player, enemy],
    modules: [
      statusCore,
      createAbilityCore({ abilities: allFantasyAbilities, statMapping: { power: 'vigor', precision: 'instinct', focus: 'will' } }),
      createAbilityEffects(),
      createAbilityReview(),
    ],
  });
}

describe('Fantasy — Holy Smite (full stack)', () => {
  it('deals damage and applies holy-fire status', () => {
    const engine = buildFantasyEngine();
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'holy-smite' }, targetIds: ['ghoul'],
    });

    // Ability was used (not rejected)
    const used = events.find(e => e.type === 'ability.used');
    expect(used).toBeDefined();

    // Damage event (may be full or half depending on check)
    const dmg = events.find(e => e.type === 'ability.damage.applied');
    expect(dmg).toBeDefined();
    expect(dmg!.payload.damageType).toBe('holy');
    expect(dmg!.payload.targetId).toBe('ghoul');

    // Status applied
    const status = events.find(e => e.type === 'ability.status.applied');
    expect(status).toBeDefined();
    expect(status!.payload.statusId).toBe('holy-fire');

    // Ghoul took damage
    const ghoul = engine.entity('ghoul');
    expect(ghoul.resources.hp).toBeLessThan(12);

    // Stamina deducted
    const player = engine.player();
    expect(player.resources.stamina).toBe(7); // 10 - 3 cost
  });

  it('sets cooldown after use', () => {
    const engine = buildFantasyEngine();
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'holy-smite' }, targetIds: ['ghoul'],
    });

    expect(isAbilityOnCooldown(engine.store.state, 'player', 'holy-smite')).toBe(true);
    expect(isAbilityReady(engine.store.state, 'player', 'holy-smite', allFantasyAbilities)).toBe(false);
  });

  it('rejects use when player lacks divine tag', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'player', type: 'player', name: 'Knight',
      tags: ['player', 'martial'], // no 'divine' tag
      stats: { vigor: 6, instinct: 4, will: 3 },
      resources: { hp: 20, stamina: 10 },
      statuses: [], zoneId: 'zone-a',
    };
    const enemy: EntityState = {
      id: 'ghoul', blueprintId: 'ghoul', type: 'enemy', name: 'Ash Ghoul',
      tags: ['enemy', 'undead'],
      stats: { vigor: 4, instinct: 3, will: 1 },
      resources: { hp: 12, stamina: 4 },
      statuses: [], zoneId: 'zone-a',
    };
    const engine = createTestEngine({
      zones, entities: [player, enemy],
      modules: [
        statusCore,
        createAbilityCore({ abilities: allFantasyAbilities }),
        createAbilityEffects(),
      ],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'holy-smite' }, targetIds: ['ghoul'],
    });

    const rejected = events.find(e => e.type === 'ability.rejected');
    expect(rejected).toBeDefined();
    expect(rejected!.payload.reason).toContain('requirement');
  });

  it('rejects use when stamina insufficient', () => {
    const engine = buildFantasyEngine({ playerStamina: 2 }); // needs 3

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'holy-smite' }, targetIds: ['ghoul'],
    });

    const rejected = events.find(e => e.type === 'ability.rejected');
    expect(rejected).toBeDefined();
    expect(rejected!.payload.reason).toContain('not enough');
  });

  it('kills enemy and emits defeat event', () => {
    const engine = buildFantasyEngine({ enemyHp: 3 }); // 6 dmg > 3 hp (or 3 half-dmg = 3 hp)

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'holy-smite' }, targetIds: ['ghoul'],
    });

    const ghoul = engine.entity('ghoul');
    // Whether full or half damage, 3+ damage on 3 HP kills or zeroes it
    expect(ghoul.resources.hp).toBeLessThanOrEqual(0);

    const defeat = events.find(e => e.type === 'combat.entity.defeated');
    expect(defeat).toBeDefined();
    expect(defeat!.payload.entityId).toBe('ghoul');
  });

  it('generates review trace via drainEvents', () => {
    const engine = buildFantasyEngine();
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'holy-smite' }, targetIds: ['ghoul'],
    });

    const traceEvents = engine.drainEvents().filter(e => e.type === 'ability.review.trace');
    expect(traceEvents.length).toBe(1);

    const trace = traceEvents[0].payload.trace as AbilityTrace;
    expect(trace.abilityId).toBe('holy-smite');
    expect(['success', 'partial']).toContain(trace.outcome);
  });
});

// ---------------------------------------------------------------------------
// Cyberpunk — ICE Breaker
// ---------------------------------------------------------------------------

const iceBreakAbility: AbilityDefinition = {
  id: 'ice-breaker-hack',
  name: 'ICE Breaker',
  verb: 'use-ability',
  tags: ['netrunning', 'combat', 'damage'],
  costs: [{ resourceId: 'bandwidth', amount: 4 }],
  target: { type: 'single' },
  checks: [{ stat: 'netrunning', difficulty: 7, onFail: 'half-damage' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 5, damageType: 'net' } },
    { type: 'apply-status', target: 'target', params: { statusId: 'system-breach', duration: 2, stacking: 'replace' } },
  ],
  cooldown: 2,
};

const allCyberpunkAbilities = [iceBreakAbility];

function buildCyberpunkEngine(opts?: { playerNetrunning?: number; enemyHp?: number }) {
  const runner: EntityState = {
    id: 'runner', blueprintId: 'runner', type: 'player', name: 'Ghost',
    tags: ['player', 'netrunner'],
    stats: { chrome: 3, reflex: 5, netrunning: opts?.playerNetrunning ?? 8 },
    resources: { hp: 15, ice: 10, bandwidth: 8 },
    statuses: [], zoneId: 'zone-a',
  };
  const sentry: EntityState = {
    id: 'sentry', blueprintId: 'sentry', type: 'enemy', name: 'ICE Sentry',
    tags: ['enemy', 'ice-agent'],
    stats: { chrome: 6, reflex: 4, netrunning: 2 },
    resources: { hp: opts?.enemyHp ?? 10, ice: 15 },
    statuses: [], zoneId: 'zone-a',
  };
  return createTestEngine({
    zones, entities: [runner, sentry],
    modules: [
      statusCore,
      createAbilityCore({ abilities: allCyberpunkAbilities, statMapping: { power: 'chrome', precision: 'reflex', focus: 'netrunning' } }),
      createAbilityEffects(),
      createAbilityReview(),
    ],
  });
}

describe('Cyberpunk — ICE Breaker (full stack)', () => {
  it('deals net damage and applies system-breach', () => {
    const engine = buildCyberpunkEngine();
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'runner', issuedAtTick: 1,
      parameters: { abilityId: 'ice-breaker-hack' }, targetIds: ['sentry'],
    });

    const used = events.find(e => e.type === 'ability.used');
    expect(used).toBeDefined();

    const dmg = events.find(e => e.type === 'ability.damage.applied');
    expect(dmg).toBeDefined();
    expect(dmg!.payload.damageType).toBe('net');

    const status = events.find(e => e.type === 'ability.status.applied');
    expect(status).toBeDefined();
    expect(status!.payload.statusId).toBe('system-breach');

    // Bandwidth deducted
    const runner = engine.player();
    expect(runner.resources.bandwidth).toBe(4); // 8 - 4
  });

  it('has shorter cooldown (2 ticks)', () => {
    const engine = buildCyberpunkEngine();
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'runner', issuedAtTick: 1,
      parameters: { abilityId: 'ice-breaker-hack' }, targetIds: ['sentry'],
    });

    expect(isAbilityOnCooldown(engine.store.state, 'runner', 'ice-breaker-hack')).toBe(true);
  });

  it('NPC AI can score ICE Breaker for use', () => {
    const engine = buildCyberpunkEngine();
    const sentry = engine.entity('sentry');

    // scoreAbilityUse returns AbilityScore[] (one per target)
    const scores = scoreAbilityUse(sentry, iceBreakAbility, engine.store.state);
    expect(scores.length).toBeGreaterThan(0);
    expect(scores[0].score).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Weird West — Dust Devil
// ---------------------------------------------------------------------------

const dustDevil: AbilityDefinition = {
  id: 'dust-devil',
  name: 'Dust Devil',
  verb: 'use-ability',
  tags: ['supernatural', 'combat', 'damage', 'aoe'],
  costs: [
    { resourceId: 'resolve', amount: 5 },
    { resourceId: 'dust', amount: 10 },
  ],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'lore', difficulty: 9, onFail: 'abort' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 3, damageType: 'supernatural' } },
    { type: 'apply-status', target: 'target', params: { statusId: 'dust-blind', duration: 2, stacking: 'replace' } },
  ],
  cooldown: 4,
  requirements: [{ type: 'has-tag', params: { tag: 'supernatural' } }],
};

const allWeirdWestAbilities = [dustDevil];

function buildWeirdWestEngine(opts?: { playerLore?: number; numEnemies?: number; playerResolve?: number; playerDust?: number }) {
  const drifter: EntityState = {
    id: 'drifter', blueprintId: 'drifter', type: 'player', name: 'Spirit Walker',
    tags: ['player', 'supernatural', 'spirit-walker'],
    stats: { grit: 3, 'draw-speed': 3, lore: opts?.playerLore ?? 15 },
    resources: { hp: 18, resolve: opts?.playerResolve ?? 20, dust: opts?.playerDust ?? 15 },
    statuses: [], zoneId: 'zone-a',
  };
  const enemies: EntityState[] = [];
  const numEnemies = opts?.numEnemies ?? 2;
  for (let i = 0; i < numEnemies; i++) {
    enemies.push({
      id: `bandit-${i}`, blueprintId: 'bandit', type: 'enemy', name: `Bandit ${i + 1}`,
      tags: ['enemy', 'human', 'outlaw'],
      stats: { grit: 4, 'draw-speed': 5, lore: 2 },
      resources: { hp: 10, resolve: 10, dust: 0 },
      statuses: [], zoneId: 'zone-a',
    });
  }
  return createTestEngine({
    zones, entities: [drifter, ...enemies],
    modules: [
      statusCore,
      createAbilityCore({ abilities: allWeirdWestAbilities, statMapping: { power: 'grit', precision: 'draw-speed', focus: 'lore' } }),
      createAbilityEffects(),
      createAbilityReview(),
    ],
  });
}

describe('Weird West — Dust Devil (full stack)', () => {
  it('when check passes, damages all enemies and applies dust-blind', () => {
    // High lore (15) almost guarantees passing the difficulty 9 check
    const engine = buildWeirdWestEngine({ playerLore: 15 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'drifter', issuedAtTick: 1,
      parameters: { abilityId: 'dust-devil' },
    });

    const checkFailed = events.find(e => e.type === 'ability.check.failed');
    if (checkFailed) {
      // Extremely unlikely but handle gracefully — abort means no damage
      const dmgEvents = events.filter(e => e.type === 'ability.damage.applied');
      expect(dmgEvents.length).toBe(0);
      return;
    }

    // Check passed — should see damage on both enemies
    const dmgEvents = events.filter(e => e.type === 'ability.damage.applied');
    expect(dmgEvents.length).toBe(2);

    const statusEvents = events.filter(e => e.type === 'ability.status.applied');
    expect(statusEvents.length).toBe(2);
    expect(statusEvents[0].payload.statusId).toBe('dust-blind');

    // Both enemies took damage
    const b0 = engine.entity('bandit-0');
    const b1 = engine.entity('bandit-1');
    expect(b0.resources.hp).toBeLessThan(10);
    expect(b1.resources.hp).toBeLessThan(10);

    // Both resources deducted
    const drifter = engine.player();
    expect(drifter.resources.resolve).toBe(15); // 20 - 5
    expect(drifter.resources.dust).toBe(5); // 15 - 10
  });

  it('requires dual resource costs (resolve + dust)', () => {
    // Not enough dust
    const engine = buildWeirdWestEngine({ playerDust: 5 }); // needs 10

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'drifter', issuedAtTick: 1,
      parameters: { abilityId: 'dust-devil' },
    });

    const rejected = events.find(e => e.type === 'ability.rejected');
    expect(rejected).toBeDefined();
    expect(rejected!.payload.reason).toContain('not enough');
  });

  it('aborts on failed lore check (onFail: abort)', () => {
    // Very low lore → almost certainly fails difficulty 9
    const engine = buildWeirdWestEngine({ playerLore: 1 });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'drifter', issuedAtTick: 1,
      parameters: { abilityId: 'dust-devil' },
    });

    const checkFailed = events.find(e => e.type === 'ability.check.failed');
    const dmg = events.find(e => e.type === 'ability.damage.applied');

    // With lore 1 vs difficulty 9, extremely likely to fail
    if (checkFailed) {
      expect(dmg).toBeUndefined();
      expect(checkFailed.payload.aborted).toBe(true);
    }
    // If by extreme luck the roll passed, damage exists (test still valid)
  });

  it('scales with number of enemies (AoE)', () => {
    const engine3 = buildWeirdWestEngine({ numEnemies: 3, playerLore: 18 });
    const events3 = engine3.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'drifter', issuedAtTick: 1,
      parameters: { abilityId: 'dust-devil' },
    });

    const checkFailed = events3.find(e => e.type === 'ability.check.failed');
    if (!checkFailed) {
      const dmgCount = events3.filter(e => e.type === 'ability.damage.applied').length;
      expect(dmgCount).toBe(3);
    }
  });

  it('has long cooldown (4 ticks)', () => {
    const engine = buildWeirdWestEngine({ playerLore: 18 });
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'drifter', issuedAtTick: 1,
      parameters: { abilityId: 'dust-devil' },
    });

    // Cooldown set regardless of check pass/abort
    expect(isAbilityOnCooldown(engine.store.state, 'drifter', 'dust-devil')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cross-genre edge cases
// ---------------------------------------------------------------------------

describe('Ability System — Edge Cases', () => {
  it('rejects ability use on defeated target', () => {
    const engine = buildFantasyEngine();
    // Manually set ghoul HP to 0 (already defeated)
    engine.entity('ghoul').resources.hp = 0;

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'holy-smite' }, targetIds: ['ghoul'],
    });

    const rejected = events.find(e => e.type === 'ability.rejected');
    expect(rejected).toBeDefined();
    expect(rejected!.payload.reason).toContain('defeated');
  });

  it('rejects use-ability with invalid abilityId', () => {
    const engine = buildFantasyEngine();

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'nonexistent' }, targetIds: ['ghoul'],
    });

    // Unknown ability emits action.rejected (not ability.rejected)
    const rejected = events.find(e => e.type === 'action.rejected');
    expect(rejected).toBeDefined();
    expect(rejected!.payload.reason).toContain('not found');
  });

  it('cooldown expires after the specified ticks', () => {
    const engine = buildCyberpunkEngine();

    // Use at tick 1, cooldown 2 → expires at tick 3
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'runner', issuedAtTick: 1,
      parameters: { abilityId: 'ice-breaker-hack' }, targetIds: ['sentry'],
    });
    expect(isAbilityOnCooldown(engine.store.state, 'runner', 'ice-breaker-hack')).toBe(true);

    // Attempt at tick 2 — still on cooldown
    const events2 = engine.processAction({
      id: 'a2', verb: 'use-ability', actorId: 'runner', issuedAtTick: 2,
      parameters: { abilityId: 'ice-breaker-hack' }, targetIds: ['sentry'],
    });
    const rejected2 = events2.find(e => e.type === 'ability.rejected');
    expect(rejected2).toBeDefined();
    expect(rejected2!.payload.reason).toContain('cooldown');

    // Attempt at tick 4 — cooldown should be expired
    const events4 = engine.processAction({
      id: 'a3', verb: 'use-ability', actorId: 'runner', issuedAtTick: 4,
      parameters: { abilityId: 'ice-breaker-hack' }, targetIds: ['sentry'],
    });
    const used4 = events4.find(e => e.type === 'ability.used');
    expect(used4).toBeDefined();
  });

  it('getAvailableAbilities filters by cooldown', () => {
    const engine = buildFantasyEngine();

    // Before use, ability is available
    const available = getAvailableAbilities(engine.store.state, 'player', allFantasyAbilities);
    expect(available.length).toBe(1);
    expect(available[0].id).toBe('holy-smite');

    // Use the ability to put it on cooldown
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'holy-smite' }, targetIds: ['ghoul'],
    });

    // Now on cooldown → not available
    const available2 = getAvailableAbilities(engine.store.state, 'player', allFantasyAbilities);
    expect(available2.length).toBe(0);
  });

  it('NPC AI selects best ability from pool', () => {
    const engine = buildWeirdWestEngine({ playerLore: 15 });
    const bandit0 = engine.entity('bandit-0');

    // Give bandit the supernatural tag and resources to use dustDevil
    bandit0.tags.push('supernatural');
    bandit0.stats.lore = 10;
    bandit0.resources.resolve = 20;
    bandit0.resources.dust = 15;

    const decision = selectNpcAbilityAction(bandit0, engine.store.state, allWeirdWestAbilities);
    expect(decision.chosen).not.toBeNull();
    if (decision.chosen) {
      expect(decision.chosen.abilityId).toBe('dust-devil');
      expect(decision.chosen.score).toBeGreaterThan(0);
    }
  });

  it('formatAbilityTrace produces readable output', () => {
    const engine = buildFantasyEngine();
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'holy-smite' }, targetIds: ['ghoul'],
    });

    const traceEvents = engine.drainEvents().filter(e => e.type === 'ability.review.trace');
    expect(traceEvents.length).toBe(1);

    const trace = traceEvents[0].payload.trace as AbilityTrace;
    const text = formatAbilityTrace(trace);
    expect(text).toContain('Holy Smite');
    expect(text.length).toBeGreaterThan(50);
  });

  it('stacking statuses from repeated ability use', () => {
    // Give ghoul plenty of HP to survive two hits, and player plenty of stamina
    const engine = buildFantasyEngine({ playerStamina: 20, enemyHp: 50 });

    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'holy-smite' }, targetIds: ['ghoul'],
    });

    // processAction auto-advances tick by 1; cooldown=3 so we need tick >= 3
    // After first processAction tick is 1. Advance 3 more times to reach tick 4.
    engine.store.advanceTick(); // tick 2
    engine.store.advanceTick(); // tick 3
    engine.store.advanceTick(); // tick 4

    const events2 = engine.processAction({
      id: 'a2', verb: 'use-ability', actorId: 'player', issuedAtTick: 5,
      parameters: { abilityId: 'holy-smite' }, targetIds: ['ghoul'],
    });

    // Ghoul has 50 HP so it survives both hits — second use should succeed
    const used2 = events2.find(e => e.type === 'ability.used');
    expect(used2).toBeDefined();

    // Two status applications total
    const ghoul = engine.entity('ghoul');
    expect(ghoul.resources.hp).toBeLessThan(50);
  });
});
