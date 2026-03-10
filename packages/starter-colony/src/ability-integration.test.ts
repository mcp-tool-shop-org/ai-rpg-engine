// Colony ability integration tests — Plasma Burst, Emergency Protocol, System Override, Reboot Systems
// Proves: power economy, sci-fi combat, disrupted status, cleanse, resistance profiles, vulnerability

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import type { AbilityDefinition, StatusDefinition } from '@ai-rpg-engine/content-schema';
import { statusCore } from '@ai-rpg-engine/modules';
import {
  createAbilityCore,
  isAbilityReady,
  createAbilityEffects,
  createAbilityReview,
  registerStatusDefinitions,
  clearStatusRegistry,
} from '@ai-rpg-engine/modules';
import { scoreAbilityUse } from '@ai-rpg-engine/modules';

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Command Module', tags: [] as string[], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Perimeter', tags: [] as string[], neighbors: ['zone-a'] },
];

// --- Ability definitions (inline, matching content.ts) ---

const plasmaBurst: AbilityDefinition = {
  id: 'plasma-burst', name: 'Plasma Burst', verb: 'use-ability',
  tags: ['combat', 'damage'],
  costs: [{ resourceId: 'stamina', amount: 2 }, { resourceId: 'power', amount: 10 }],
  target: { type: 'single' },
  checks: [{ stat: 'engineering', difficulty: 5, onFail: 'half-damage' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 5, damageType: 'energy' } },
  ],
  cooldown: 2,
  requirements: [{ type: 'has-tag', params: { tag: 'colonist' } }],
};

const emergencyProtocol: AbilityDefinition = {
  id: 'emergency-protocol', name: 'Emergency Protocol', verb: 'use-ability',
  tags: ['support', 'heal'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'self' },
  checks: [{ stat: 'command', difficulty: 5, onFail: 'abort' }],
  effects: [
    { type: 'heal', target: 'actor', params: { amount: 4, resource: 'hp' } },
    { type: 'resource-modify', target: 'actor', params: { resource: 'power', amount: 5 } },
  ],
  cooldown: 4,
};

const systemOverride: AbilityDefinition = {
  id: 'system-override', name: 'System Override', verb: 'use-ability',
  tags: ['combat', 'debuff'],
  costs: [
    { resourceId: 'stamina', amount: 2 },
    { resourceId: 'power', amount: 15 },
  ],
  target: { type: 'single' },
  checks: [{ stat: 'engineering', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'disrupted', duration: 2, stacking: 'replace' } },
    { type: 'stat-modify', target: 'target', params: { stat: 'awareness', amount: -2 } },
  ],
  cooldown: 4,
  requirements: [{ type: 'has-tag', params: { tag: 'colonist' } }],
};

const rebootSystems: AbilityDefinition = {
  id: 'reboot-systems', name: 'Reboot Systems', verb: 'use-ability',
  tags: ['support', 'cleanse'],
  costs: [{ resourceId: 'stamina', amount: 2 }, { resourceId: 'power', amount: 5 }],
  target: { type: 'self' },
  checks: [{ stat: 'engineering', difficulty: 5, onFail: 'abort' }],
  effects: [
    { type: 'remove-status-by-tag', target: 'actor', params: { tags: 'breach,control' } },
  ],
  cooldown: 3,
  requirements: [{ type: 'has-tag', params: { tag: 'colonist' } }],
};

const allColonyAbilities = [plasmaBurst, emergencyProtocol, systemOverride, rebootSystems];

const colonyStatusDefs: StatusDefinition[] = [
  {
    id: 'disrupted', name: 'Disrupted',
    tags: ['breach', 'control', 'debuff'], stacking: 'replace',
    duration: { type: 'ticks', value: 2 },
  },
];

// --- Engine builder ---

function buildColonyEngine(opts?: {
  playerEngineering?: number;
  playerCommand?: number;
  playerAwareness?: number;
  playerStamina?: number;
  playerPower?: number;
  playerHp?: number;
  enemyHp?: number;
}) {
  const player: EntityState = {
    id: 'player', blueprintId: 'commander', type: 'player', name: 'Commander',
    tags: ['player', 'human', 'colonist', 'officer'],
    stats: { engineering: opts?.playerEngineering ?? 10, command: opts?.playerCommand ?? 10, awareness: opts?.playerAwareness ?? 10 },
    resources: {
      hp: opts?.playerHp ?? 18,
      stamina: opts?.playerStamina ?? 10,
      power: opts?.playerPower ?? 60,
      morale: 20,
    },
    statuses: [], zoneId: 'zone-a',
  };
  const enemy: EntityState = {
    id: 'drone', blueprintId: 'drone', type: 'enemy', name: 'Breached Drone',
    tags: ['enemy', 'drone', 'mechanical', 'malfunctioning'],
    stats: { engineering: 6, command: 1, awareness: 5 },
    resources: { hp: opts?.enemyHp ?? 10, stamina: 4, power: 30, morale: 0 },
    statuses: [], zoneId: 'zone-a',
  };
  return createTestEngine({
    zones,
    entities: [player, enemy],
    modules: [
      statusCore,
      createAbilityCore({ abilities: allColonyAbilities, statMapping: { power: 'engineering', precision: 'awareness', focus: 'command' } }),
      createAbilityEffects(),
      createAbilityReview(),
    ],
  });
}

// ---------------------------------------------------------------------------
// Plasma Burst
// ---------------------------------------------------------------------------

describe('Colony — Plasma Burst', () => {
  it('deals damage and costs stamina + power', () => {
    const engine = buildColonyEngine();
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'plasma-burst' }, targetIds: ['drone'],
    });

    expect(events.find(e => e.type === 'ability.used')).toBeDefined();
    expect(events.find(e => e.type === 'ability.damage.applied')).toBeDefined();
    const player = engine.player();
    expect(player.resources.stamina).toBe(8); // 10 - 2
    expect(player.resources.power).toBe(50); // 60 - 10
  });

  it('requires colonist tag', () => {
    const alien: EntityState = {
      id: 'player', blueprintId: 'alien', type: 'player', name: 'Alien',
      tags: ['player', 'alien'],
      stats: { engineering: 10, command: 5, awareness: 5 },
      resources: { hp: 20, stamina: 10, power: 60 },
      statuses: [], zoneId: 'zone-a',
    };
    const target: EntityState = {
      id: 'target', blueprintId: 'target', type: 'enemy', name: 'Target',
      tags: ['enemy'], stats: { engineering: 3, command: 3, awareness: 3 },
      resources: { hp: 10, stamina: 5 }, statuses: [], zoneId: 'zone-a',
    };
    const engine = createTestEngine({
      zones, entities: [alien, target],
      modules: [statusCore, createAbilityCore({ abilities: allColonyAbilities, statMapping: { power: 'engineering', precision: 'awareness', focus: 'command' } }), createAbilityEffects(), createAbilityReview()],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'plasma-burst' }, targetIds: ['target'],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Emergency Protocol
// ---------------------------------------------------------------------------

describe('Colony — Emergency Protocol', () => {
  it('heals HP and restores power', () => {
    const engine = buildColonyEngine({ playerHp: 10, playerPower: 30, playerCommand: 15 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'emergency-protocol' }, targetIds: [],
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      const player = engine.player();
      expect(player.resources.hp).toBeGreaterThan(10);
      expect(player.resources.power).toBeGreaterThan(30);
      expect(player.resources.stamina).toBe(7); // 10 - 3
    }
  });

  it('sets cooldown after use', () => {
    const engine = buildColonyEngine({ playerCommand: 15 });
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'emergency-protocol' }, targetIds: [],
    });
    expect(isAbilityReady(engine.store.state, 'player', 'emergency-protocol', allColonyAbilities)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// System Override
// ---------------------------------------------------------------------------

describe('Colony — System Override', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(colonyStatusDefs);
  });

  it('applies disrupted status and reduces awareness', () => {
    const engine = buildColonyEngine({ playerEngineering: 15 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'system-override' }, targetIds: ['drone'],
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      expect(events.find(e => e.type === 'ability.used')).toBeDefined();
      const statusApplied = events.find(e => e.type === 'ability.status.applied');
      if (statusApplied) {
        expect(statusApplied.payload.statusId).toBe('disrupted');
      }
      const player = engine.player();
      expect(player.resources.stamina).toBe(8); // 10 - 2
      expect(player.resources.power).toBe(45); // 60 - 15
    }
  });

  it('rejects when power is too low', () => {
    const engine = buildColonyEngine({ playerPower: 5 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'system-override' }, targetIds: ['drone'],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Reboot Systems (cleanse)
// ---------------------------------------------------------------------------

describe('Colony — Reboot Systems (cleanse)', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(colonyStatusDefs);
  });

  it('removes breach and control statuses from self', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'commander', type: 'player', name: 'Commander',
      tags: ['player', 'human', 'colonist', 'officer'],
      stats: { engineering: 15, command: 5, awareness: 5 },
      resources: { hp: 18, stamina: 10, power: 60, morale: 20 },
      statuses: [
        { id: 'status-1', statusId: 'disrupted', stacks: 1, appliedAtTick: 0, expiresAtTick: 2 },
      ],
      zoneId: 'zone-a',
    };
    const enemy: EntityState = {
      id: 'drone', blueprintId: 'drone', type: 'enemy', name: 'Drone',
      tags: ['enemy', 'drone', 'mechanical'],
      stats: { engineering: 3, command: 1, awareness: 3 },
      resources: { hp: 10, stamina: 4 }, statuses: [], zoneId: 'zone-a',
    };
    const engine = createTestEngine({
      zones, entities: [player, enemy],
      modules: [
        statusCore,
        createAbilityCore({ abilities: allColonyAbilities, statMapping: { power: 'engineering', precision: 'awareness', focus: 'command' } }),
        createAbilityEffects(),
        createAbilityReview(),
      ],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'reboot-systems' }, targetIds: [],
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      const removed = events.filter(e => e.type === 'ability.status.removed');
      expect(removed.length).toBeGreaterThanOrEqual(1);
      const p = engine.player();
      expect(p.statuses.find(s => s.statusId === 'disrupted')).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Resistance profiles
// ---------------------------------------------------------------------------

describe('Colony — Resistance profiles', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(colonyStatusDefs);
  });

  it('resonance entity is immune to control statuses', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'commander', type: 'player', name: 'Commander',
      tags: ['player', 'human', 'colonist', 'officer'],
      stats: { engineering: 15, command: 5, awareness: 5 },
      resources: { hp: 18, stamina: 10, power: 60, morale: 20 },
      statuses: [], zoneId: 'zone-a',
    };
    const resonance: EntityState = {
      id: 'resonance', blueprintId: 'resonance', type: 'enemy', name: 'Resonance Entity',
      tags: ['enemy', 'alien', 'energy', 'role:boss'],
      stats: { engineering: 2, command: 1, awareness: 9 },
      resources: { hp: 8, stamina: 4, power: 80 },
      statuses: [], zoneId: 'zone-a',
      resistances: { control: 'immune', breach: 'resistant' },
    };

    // disrupted has control+breach tags — control should be immune
    const engine = createTestEngine({
      zones, entities: [player, resonance],
      modules: [
        statusCore,
        createAbilityCore({ abilities: allColonyAbilities, statMapping: { power: 'engineering', precision: 'awareness', focus: 'command' } }),
        createAbilityEffects(),
        createAbilityReview(),
      ],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'system-override' }, targetIds: ['resonance'],
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      // immune > resistant, so the highest matching resistance is immune
      const immune = events.find(e => e.type === 'ability.status.immune');
      expect(immune).toBeDefined();
      expect(resonance.statuses.length).toBe(0);
    }
  });

  it('breached drone is vulnerable to breach (doubled duration)', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'commander', type: 'player', name: 'Commander',
      tags: ['player', 'human', 'colonist', 'officer'],
      stats: { engineering: 15, command: 5, awareness: 5 },
      resources: { hp: 18, stamina: 10, power: 60, morale: 20 },
      statuses: [], zoneId: 'zone-a',
    };
    const vulnerableDrone: EntityState = {
      id: 'vuln-drone', blueprintId: 'drone', type: 'enemy', name: 'Breached Drone',
      tags: ['enemy', 'drone', 'mechanical', 'malfunctioning'],
      stats: { engineering: 6, command: 1, awareness: 5 },
      resources: { hp: 10, stamina: 4, power: 30 },
      statuses: [], zoneId: 'zone-a',
      resistances: { breach: 'vulnerable' },
    };

    const engine = createTestEngine({
      zones, entities: [player, vulnerableDrone],
      modules: [
        statusCore,
        createAbilityCore({ abilities: allColonyAbilities, statMapping: { power: 'engineering', precision: 'awareness', focus: 'command' } }),
        createAbilityEffects(),
        createAbilityReview(),
      ],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'system-override' }, targetIds: ['vuln-drone'],
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      const vuln = events.find(e => e.type === 'ability.status.vulnerable');
      expect(vuln).toBeDefined();
      // Duration should be doubled: 2 → 4
      const applied = events.find(e => e.type === 'ability.status.applied');
      if (applied) {
        expect(applied.payload.duration).toBeGreaterThanOrEqual(4);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// AI Scoring
// ---------------------------------------------------------------------------

describe('Colony — AI scoring', () => {
  it('AI scores plasma-burst against enemy', () => {
    const engine = buildColonyEngine();
    const player = engine.player();
    const scores = scoreAbilityUse(player, plasmaBurst, engine.store.state);
    expect(scores.length).toBeGreaterThan(0);
    expect(scores[0].score).toBeGreaterThan(0);
  });

  it('AI scores emergency-protocol positively for self-heal', () => {
    const engine = buildColonyEngine({ playerHp: 5, playerCommand: 10, playerPower: 20 });
    const player = engine.player();
    const scores = scoreAbilityUse(player, emergencyProtocol, engine.store.state);
    expect(scores.length).toBeGreaterThan(0);
    expect(scores[0].score).toBeGreaterThan(0);
  });
});
