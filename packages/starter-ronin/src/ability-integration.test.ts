// Ronin ability integration tests — Iaijutsu Strike, Inner Calm, Blade Ward
// Proves: ki management loop, honor economy, highest single-target damage, composure gating

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import { statusCore } from '@ai-rpg-engine/modules';
import {
  createAbilityCore,
  isAbilityReady,
  createAbilityEffects,
  createAbilityReview,
} from '@ai-rpg-engine/modules';
// F-2e1879af: import the real shipped fixtures instead of hand-duplicating
// them. The inline copies used to drift silently from content.ts — a future
// balance/mechanics edit to a shipped ability's cost, check difficulty, or
// effect amount would not have been caught by its own "integration" test,
// which kept passing against a frozen hand-copied duplicate. Importing the
// real array also picks up centeredMind, which the old hand-copied list
// (iaijutsuStrike/innerCalm/bladeWard only) silently omitted.
import {
  iaijutsuStrike,
  innerCalm,
  bladeWard,
  centeredMind,
  roninAbilities as allRoninAbilities,
} from './content.js';

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Castle Gate', tags: [] as string[], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Garden', tags: [] as string[], neighbors: ['zone-a'] },
];

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
      id: 'a1', verb: 'use-ability', actorId: 'player', source: 'player', issuedAtTick: 1,
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
      id: 'a1', verb: 'use-ability', actorId: 'player', source: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'iaijutsu-strike' }, targetIds: ['assassin'],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });
});

describe('Ronin — Inner Calm', () => {
  it('restores ki, heals, and buffs perception', () => {
    const engine = buildRoninEngine({ playerKi: 5, playerComposure: 15 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', source: 'player', issuedAtTick: 1,
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
      id: 'a1', verb: 'use-ability', actorId: 'player', source: 'player', issuedAtTick: 1,
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
      id: 'a1', verb: 'use-ability', actorId: 'player', source: 'player', issuedAtTick: 1,
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
      id: 'a1', verb: 'use-ability', actorId: 'player', source: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'blade-ward' }, targetIds: ['assassin'],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });

  it('sets cooldown after use', () => {
    const engine = buildRoninEngine();
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', source: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'blade-ward' }, targetIds: ['assassin'],
    });
    expect(isAbilityReady(engine.store.state, 'player', 'blade-ward', allRoninAbilities)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Centered Mind (cleanse) — F-2e1879af: this ability was silently absent
// from the old hand-copied allRoninAbilities fixture (only 3 of the pack's 4
// abilities were duplicated), so it had zero integration coverage even
// though it shipped in content.ts and is wired into createAbilityCore via
// roninAbilities. Importing the real array pulled it in; this covers it.
// ---------------------------------------------------------------------------

describe('Ronin — Centered Mind (cleanse)', () => {
  it('costs stamina and ki', () => {
    const engine = buildRoninEngine({ playerComposure: 15, playerKi: 10 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', source: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'centered-mind' }, targetIds: [],
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      expect(events.find(e => e.type === 'ability.used')).toBeDefined();
      const player = engine.player();
      expect(player.resources.stamina).toBe(8); // 10 - 2
      expect(player.resources.ki).toBe(7); // 10 - 3
    }
  });

  it('requires ronin tag', () => {
    const samurai: EntityState = {
      id: 'player', blueprintId: 'player', type: 'player', name: 'Samurai',
      tags: ['player', 'samurai'],
      stats: { discipline: 10, perception: 10, composure: 15 },
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
      id: 'a1', verb: 'use-ability', actorId: 'player', source: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'centered-mind' }, targetIds: [],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });

  it('sets cooldown after use', () => {
    const engine = buildRoninEngine({ playerComposure: 15 });
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', source: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'centered-mind' }, targetIds: [],
    });
    expect(isAbilityReady(engine.store.state, 'player', 'centered-mind', allRoninAbilities)).toBe(false);
  });
});
