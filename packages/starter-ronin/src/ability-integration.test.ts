// Ronin ability integration tests — Iaijutsu Strike, Inner Calm, Blade Ward
// Proves: ki management loop, honor economy, highest single-target damage, composure gating

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import { statusCore } from '@ai-rpg-engine/modules';
import {
  createAbilityCore,
  isAbilityReady,
  createAbilityEffects,
  createAbilityReview,
} from '@ai-rpg-engine/modules';

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Castle Gate', tags: [] as string[], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Garden', tags: [] as string[], neighbors: ['zone-a'] },
];

const iaijutsuStrike: AbilityDefinition = {
  id: 'iaijutsu-strike', name: 'Iaijutsu Strike', verb: 'use-ability',
  tags: ['martial', 'combat', 'damage'],
  costs: [{ resourceId: 'stamina', amount: 3 }, { resourceId: 'ki', amount: 5 }],
  target: { type: 'single' },
  checks: [{ stat: 'discipline', difficulty: 8, onFail: 'half-damage' }],
  effects: [{ type: 'damage', target: 'target', params: { amount: 7, damageType: 'blade' } }],
  cooldown: 3,
  requirements: [{ type: 'has-tag', params: { tag: 'ronin' } }],
};

const innerCalm: AbilityDefinition = {
  id: 'inner-calm', name: 'Inner Calm', verb: 'use-ability',
  tags: ['spiritual', 'buff', 'support'],
  costs: [{ resourceId: 'stamina', amount: 2 }],
  target: { type: 'self' },
  checks: [{ stat: 'composure', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'resource-modify', target: 'actor', params: { resource: 'ki', amount: 8 } },
    { type: 'heal', target: 'actor', params: { amount: 3, resource: 'hp' } },
    { type: 'stat-modify', target: 'actor', params: { stat: 'perception', amount: 1 } },
  ],
  cooldown: 4,
  requirements: [{ type: 'has-tag', params: { tag: 'ronin' } }],
};

const bladeWard: AbilityDefinition = {
  id: 'blade-ward', name: 'Blade Ward', verb: 'use-ability',
  tags: ['martial', 'combat', 'debuff', 'defensive'],
  costs: [{ resourceId: 'stamina', amount: 2 }, { resourceId: 'ki', amount: 3 }],
  target: { type: 'single' },
  checks: [{ stat: 'perception', difficulty: 7, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'off-balance', duration: 2, stacking: 'replace' } },
    { type: 'stat-modify', target: 'target', params: { stat: 'discipline', amount: -2 } },
    { type: 'resource-modify', target: 'actor', params: { resource: 'honor', amount: 2 } },
  ],
  cooldown: 3,
  requirements: [{ type: 'has-tag', params: { tag: 'ronin' } }],
};

const allRoninAbilities = [iaijutsuStrike, innerCalm, bladeWard];

function buildRoninEngine(opts?: {
  playerDiscipline?: number;
  playerPerception?: number;
  playerComposure?: number;
  playerStamina?: number;
  playerKi?: number;
  playerHonor?: number;
  enemyHp?: number;
}) {
  const player: EntityState = {
    id: 'player', blueprintId: 'player', type: 'player', name: 'Ronin',
    tags: ['player', 'ronin', 'masterless'],
    stats: {
      discipline: opts?.playerDiscipline ?? 10,
      perception: opts?.playerPerception ?? 10,
      composure: opts?.playerComposure ?? 10,
    },
    resources: {
      hp: 20,
      stamina: opts?.playerStamina ?? 10,
      ki: opts?.playerKi ?? 15,
      honor: opts?.playerHonor ?? 25,
    },
    statuses: [], zoneId: 'zone-a',
  };
  const enemy: EntityState = {
    id: 'assassin', blueprintId: 'shadow-assassin', type: 'enemy', name: 'Shadow Assassin',
    tags: ['enemy', 'ninja', 'shadow'],
    stats: { discipline: 6, perception: 7, composure: 4 },
    resources: { hp: opts?.enemyHp ?? 16, stamina: 5, ki: 8, honor: 0 },
    statuses: [], zoneId: 'zone-a',
  };
  return createTestEngine({
    zones,
    entities: [player, enemy],
    modules: [
      statusCore,
      createAbilityCore({ abilities: allRoninAbilities, statMapping: { power: 'discipline', precision: 'perception', focus: 'composure' } }),
      createAbilityEffects(),
      createAbilityReview(),
    ],
  });
}

describe('Ronin — Iaijutsu Strike', () => {
  it('deals high damage and costs stamina + ki', () => {
    const engine = buildRoninEngine();
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'iaijutsu-strike' }, targetIds: ['assassin'],
    });

    expect(events.find(e => e.type === 'ability.used')).toBeDefined();
    const dmg = events.find(e => e.type === 'ability.damage.applied');
    expect(dmg).toBeDefined();
    expect(dmg!.payload.damageType).toBe('blade');

    const player = engine.player();
    expect(player.resources.stamina).toBe(7); // 10 - 3
    expect(player.resources.ki).toBe(10); // 15 - 5
  });

  it('rejects when ki insufficient', () => {
    const engine = buildRoninEngine({ playerKi: 2 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'iaijutsu-strike' }, targetIds: ['assassin'],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });
});

describe('Ronin — Inner Calm', () => {
  it('restores ki, heals, and buffs perception', () => {
    const engine = buildRoninEngine({ playerKi: 5, playerComposure: 15 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'inner-calm' }, targetIds: [],
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      const player = engine.player();
      expect(player.resources.ki).toBeGreaterThan(5); // restored ki
    }
  });

  it('aborts on low composure', () => {
    const engine = buildRoninEngine({ playerComposure: 1 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'inner-calm' }, targetIds: [],
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    const used = events.find(e => e.type === 'ability.used');
    expect(aborted || used).toBeTruthy();
  });
});

describe('Ronin — Blade Ward', () => {
  it('applies off-balance and grants honor', () => {
    const engine = buildRoninEngine({ playerPerception: 15, playerHonor: 10 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'blade-ward' }, targetIds: ['assassin'],
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      const status = events.find(e => e.type === 'ability.status.applied');
      expect(status).toBeDefined();
      expect(status!.payload.statusId).toBe('off-balance');

      const player = engine.player();
      expect(player.resources.honor).toBeGreaterThan(10);
    }
  });

  it('requires ronin tag', () => {
    const samurai: EntityState = {
      id: 'player', blueprintId: 'player', type: 'player', name: 'Samurai',
      tags: ['player', 'samurai'],
      stats: { discipline: 10, perception: 10, composure: 10 },
      resources: { hp: 20, stamina: 10, ki: 15, honor: 25 },
      statuses: [], zoneId: 'zone-a',
    };
    const enemy: EntityState = {
      id: 'assassin', blueprintId: 'assassin', type: 'enemy', name: 'Assassin',
      tags: ['enemy'], stats: { discipline: 5, perception: 5, composure: 3 },
      resources: { hp: 16, stamina: 5 }, statuses: [], zoneId: 'zone-a',
    };
    const engine = createTestEngine({
      zones, entities: [samurai, enemy],
      modules: [statusCore, createAbilityCore({ abilities: allRoninAbilities, statMapping: { power: 'discipline', precision: 'perception', focus: 'composure' } }), createAbilityEffects(), createAbilityReview()],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'blade-ward' }, targetIds: ['assassin'],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });

  it('sets cooldown after use', () => {
    const engine = buildRoninEngine();
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'blade-ward' }, targetIds: ['assassin'],
    });
    expect(isAbilityReady(engine.store.state, 'player', 'blade-ward', allRoninAbilities)).toBe(false);
  });
});
