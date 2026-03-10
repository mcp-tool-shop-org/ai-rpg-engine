import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import { statusCore, hasStatus } from './status-core.js';
import { createCognitionCore, getCognition } from './cognition-core.js';
import { createCombatCore } from './combat-core.js';
import {
  createCombatRecovery,
  WOUND_STATUSES,
  MORALE_AFTERMATH_STATUSES,
} from './combat-recovery.js';
import type { CombatRecoveryConfig } from './combat-recovery.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: ['safe'] as string[], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [] as string[], neighbors: ['zone-a'] },
];

function makeEntity(id: string, type: string, tags: string[], overrides?: Partial<EntityState>): EntityState {
  return {
    id,
    blueprintId: id,
    type,
    name: id,
    tags,
    stats: { will: 3 },
    resources: { hp: 20, maxHp: 20, stamina: 5, maxStamina: 5 },
    statuses: [],
    zoneId: 'zone-a',
    ...overrides,
  };
}

function buildEngine(entities: EntityState[], config?: CombatRecoveryConfig) {
  return createTestEngine({
    modules: [
      statusCore,
      createCognitionCore(),
      createCombatCore(),
      createCombatRecovery(config),
    ],
    entities,
    zones,
  });
}

// ---------------------------------------------------------------------------
// Group 1: Combat End Detection
// ---------------------------------------------------------------------------

describe('combat-recovery: combat end detection', () => {
  it('aftermath triggers when last enemy defeated', () => {
    const player = makeEntity('player', 'player', ['player']);
    const enemy = makeEntity('enemy1', 'enemy', ['enemy'], {
      resources: { hp: 1, maxHp: 20, stamina: 5, maxStamina: 5 },
    });
    const engine = buildEngine([player, enemy]);
    engine.drainEvents(); // Clear setup events

    // Kill the enemy directly
    engine.store.state.entities.enemy1.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'enemy1',
      entityName: 'enemy1',
      defeatedBy: 'player',
    });

    const events = engine.drainEvents();
    const aftermathStarted = events.find(e => e.type === 'combat.aftermath.started');
    expect(aftermathStarted).toBeDefined();
    expect(aftermathStarted!.payload.zoneId).toBe('zone-a');
  });

  it('aftermath triggers when last enemy flees', () => {
    const player = makeEntity('player', 'player', ['player']);
    const enemy = makeEntity('enemy1', 'enemy', ['enemy']);
    const engine = buildEngine([player, enemy]);
    engine.drainEvents();

    // Enemy disengages — moves to another zone
    engine.store.state.entities.enemy1.zoneId = 'zone-b';
    engine.store.emitEvent('combat.disengage.success', {
      entityId: 'enemy1',
      entityName: 'enemy1',
      fromZoneId: 'zone-a',
      toZoneId: 'zone-b',
    });

    const events = engine.drainEvents();
    const aftermathStarted = events.find(e => e.type === 'combat.aftermath.started');
    expect(aftermathStarted).toBeDefined();
  });

  it('aftermath does not re-trigger in same zone at same tick', () => {
    const player = makeEntity('player', 'player', ['player']);
    const enemy1 = makeEntity('enemy1', 'enemy', ['enemy']);
    const enemy2 = makeEntity('enemy2', 'enemy', ['enemy']);
    const engine = buildEngine([player, enemy1, enemy2]);
    engine.drainEvents();

    // Kill both enemies at the same tick
    engine.store.state.entities.enemy1.resources.hp = 0;
    engine.store.state.entities.enemy2.resources.hp = 0;

    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'enemy1',
      entityName: 'enemy1',
      defeatedBy: 'player',
    });
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'enemy2',
      entityName: 'enemy2',
      defeatedBy: 'player',
    });

    const events = engine.drainEvents();
    const aftermathEvents = events.filter(e => e.type === 'combat.aftermath.started');
    // Should only trigger once despite two defeat events
    expect(aftermathEvents.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Group 2: Wound Application
// ---------------------------------------------------------------------------

describe('combat-recovery: wound application', () => {
  it('HP ratio <= 0.60 applies light wound', () => {
    const player = makeEntity('player', 'player', ['player'], {
      resources: { hp: 12, maxHp: 20, stamina: 5, maxStamina: 5 }, // 0.60 ratio
    });
    const enemy = makeEntity('enemy1', 'enemy', ['enemy']);
    const engine = buildEngine([player, enemy]);
    engine.drainEvents();

    // Kill enemy
    engine.store.state.entities.enemy1.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'enemy1',
      entityName: 'enemy1',
      defeatedBy: 'player',
    });

    const events = engine.drainEvents();
    const injury = events.find(
      e => e.type === 'combat.aftermath.injury' && e.payload.entityId === 'player',
    );
    expect(injury).toBeDefined();
    expect(injury!.payload.severity).toBe('light');
    expect(hasStatus(engine.store.state.entities.player, WOUND_STATUSES.LIGHT)).toBe(true);
  });

  it('HP ratio <= 0.15 applies critical wound (highest severity wins)', () => {
    const player = makeEntity('player', 'player', ['player'], {
      resources: { hp: 3, maxHp: 20, stamina: 5, maxStamina: 5 }, // 0.15 ratio
    });
    const enemy = makeEntity('enemy1', 'enemy', ['enemy']);
    const engine = buildEngine([player, enemy]);
    engine.drainEvents();

    engine.store.state.entities.enemy1.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'enemy1',
      entityName: 'enemy1',
      defeatedBy: 'player',
    });

    const events = engine.drainEvents();
    const injury = events.find(
      e => e.type === 'combat.aftermath.injury' && e.payload.entityId === 'player',
    );
    expect(injury).toBeDefined();
    expect(injury!.payload.severity).toBe('critical');
    expect(hasStatus(engine.store.state.entities.player, WOUND_STATUSES.CRITICAL)).toBe(true);
    // Should NOT also have light or serious
    expect(hasStatus(engine.store.state.entities.player, WOUND_STATUSES.LIGHT)).toBe(false);
    expect(hasStatus(engine.store.state.entities.player, WOUND_STATUSES.SERIOUS)).toBe(false);
  });

  it('dead entities (hp=0) do not receive wounds', () => {
    const player = makeEntity('player', 'player', ['player']);
    const enemy = makeEntity('enemy1', 'enemy', ['enemy']);
    const engine = buildEngine([player, enemy]);
    engine.drainEvents();

    engine.store.state.entities.enemy1.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'enemy1',
      entityName: 'enemy1',
      defeatedBy: 'player',
    });

    const events = engine.drainEvents();
    const enemyInjury = events.find(
      e => e.type === 'combat.aftermath.injury' && e.payload.entityId === 'enemy1',
    );
    // Dead enemy should NOT get a wound
    expect(enemyInjury).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Group 3: Stamina Recovery
// ---------------------------------------------------------------------------

describe('combat-recovery: stamina recovery', () => {
  it('stamina regens each tick, capped at max', () => {
    const player = makeEntity('player', 'player', ['player'], {
      resources: { hp: 20, maxHp: 20, stamina: 2, maxStamina: 5 },
    });
    const engine = buildEngine([player]);
    engine.drainEvents();

    // Emit action.resolved directly to trigger regen without verb stamina cost
    engine.store.emitEvent('action.resolved', { verb: 'wait', actorId: 'player', eventCount: 0 });
    expect(engine.store.state.entities.player.resources.stamina).toBe(3); // 2 + 1

    engine.store.emitEvent('action.resolved', { verb: 'wait', actorId: 'player', eventCount: 0 });
    expect(engine.store.state.entities.player.resources.stamina).toBe(4);

    engine.store.emitEvent('action.resolved', { verb: 'wait', actorId: 'player', eventCount: 0 });
    expect(engine.store.state.entities.player.resources.stamina).toBe(5);

    // Should not exceed max
    engine.store.emitEvent('action.resolved', { verb: 'wait', actorId: 'player', eventCount: 0 });
    expect(engine.store.state.entities.player.resources.stamina).toBe(5);
  });

  it('stamina-tick events emitted with correct values', () => {
    const player = makeEntity('player', 'player', ['player'], {
      resources: { hp: 20, maxHp: 20, stamina: 3, maxStamina: 5 },
    });
    const engine = buildEngine([player]);
    engine.drainEvents();

    engine.store.emitEvent('action.resolved', { verb: 'wait', actorId: 'player', eventCount: 0 });
    const events = engine.drainEvents();

    const staminaTick = events.find(e => e.type === 'combat.aftermath.stamina-tick');
    expect(staminaTick).toBeDefined();
    expect(staminaTick!.payload.entityId).toBe('player');
    expect(staminaTick!.payload.prevStamina).toBe(3);
    expect(staminaTick!.payload.currentStamina).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Group 4: HP Recovery
// ---------------------------------------------------------------------------

describe('combat-recovery: HP recovery', () => {
  it('HP recovers in safe zones', () => {
    const player = makeEntity('player', 'player', ['player'], {
      resources: { hp: 15, maxHp: 20, stamina: 5, maxStamina: 5 },
    });
    const enemy = makeEntity('enemy1', 'enemy', ['enemy']);
    const engine = buildEngine([player, enemy]);
    engine.drainEvents();

    // Trigger aftermath first (to register recovery entry)
    engine.store.state.entities.enemy1.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'enemy1',
      entityName: 'enemy1',
      defeatedBy: 'player',
    });
    engine.drainEvents();

    // zone-a has 'safe' tag — HP should regen
    engine.submitAction('guard', {});
    expect(engine.store.state.entities.player.resources.hp).toBe(16);

    engine.submitAction('guard', {});
    expect(engine.store.state.entities.player.resources.hp).toBe(17);
  });

  it('HP does NOT recover in unsafe zones (default)', () => {
    const player = makeEntity('player', 'player', ['player'], {
      resources: { hp: 15, maxHp: 20, stamina: 5, maxStamina: 5 },
      zoneId: 'zone-b', // unsafe zone
    });
    const enemy = makeEntity('enemy1', 'enemy', ['enemy'], { zoneId: 'zone-b' });
    const engine = buildEngine([player, enemy]);
    engine.drainEvents();

    // Trigger aftermath
    engine.store.state.entities.enemy1.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'enemy1',
      entityName: 'enemy1',
      defeatedBy: 'player',
    });
    engine.drainEvents();

    // zone-b has no 'safe' tag — HP should NOT regen
    engine.submitAction('guard', {});
    expect(engine.store.state.entities.player.resources.hp).toBe(15);
  });

  it('recovery-complete emitted when fully healed', () => {
    const player = makeEntity('player', 'player', ['player'], {
      resources: { hp: 19, maxHp: 20, stamina: 5, maxStamina: 5 },
    });
    const enemy = makeEntity('enemy1', 'enemy', ['enemy']);
    const engine = buildEngine([player, enemy]);
    engine.drainEvents();

    // Trigger aftermath
    engine.store.state.entities.enemy1.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'enemy1',
      entityName: 'enemy1',
      defeatedBy: 'player',
    });
    engine.drainEvents();

    // One tick should heal to 20/20 and complete recovery
    engine.submitAction('guard', {});
    const events = engine.drainEvents();

    const complete = events.find(e => e.type === 'combat.aftermath.recovery-complete');
    expect(complete).toBeDefined();
    expect(complete!.payload.entityId).toBe('player');
    expect(engine.store.state.entities.player.resources.hp).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Group 5: Morale Aftermath
// ---------------------------------------------------------------------------

describe('combat-recovery: morale aftermath', () => {
  it('morale <= 29 applies morale:shaken status', () => {
    const player = makeEntity('player', 'player', ['player']);
    const npc = makeEntity('npc-ally', 'enemy', ['enemy'], {
      ai: { profile: 'aggressive' },
      resources: { hp: 20, maxHp: 20, stamina: 5, maxStamina: 5 },
    } as Partial<EntityState>);
    const enemy = makeEntity('enemy1', 'enemy', ['enemy']);
    const engine = buildEngine([player, npc, enemy]);

    // Set NPC morale very low
    const cog = getCognition(engine.store.state, 'npc-ally');
    cog.morale = 20;

    engine.drainEvents();

    // Kill the actual enemy to trigger aftermath
    // But npc-ally is also tagged 'enemy' — let's use a non-enemy ally instead
    // Actually npc-ally is also an enemy so it counts. Let's make npc-ally a friendly type
    // Hmm, the clearance check looks for 'enemy' tags. Let's adjust:
    // npc-ally has 'enemy' tag so it's counted as a living enemy. Let's kill it too.
    // Actually for this test, let's just put npc-ally as 'npc' type without 'enemy' tag.
    engine.store.state.entities['npc-ally'].tags = ['npc'];

    engine.store.state.entities.enemy1.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'enemy1',
      entityName: 'enemy1',
      defeatedBy: 'player',
    });

    const events = engine.drainEvents();
    const moraleEvent = events.find(
      e => e.type === 'combat.aftermath.morale' && e.payload.entityId === 'npc-ally',
    );
    expect(moraleEvent).toBeDefined();
    expect(moraleEvent!.payload.tier).toBe('shaken');
    expect(hasStatus(engine.store.state.entities['npc-ally'], MORALE_AFTERMATH_STATUSES.SHAKEN)).toBe(true);
  });

  it('morale >= 70 applies morale:emboldened status', () => {
    const player = makeEntity('player', 'player', ['player']);
    const npc = makeEntity('npc-ally', 'npc', ['npc'], {
      ai: { profile: 'aggressive' },
      resources: { hp: 20, maxHp: 20, stamina: 5, maxStamina: 5 },
    } as Partial<EntityState>);
    const enemy = makeEntity('enemy1', 'enemy', ['enemy']);
    const engine = buildEngine([player, npc, enemy]);

    // Default morale is 70 — exactly at threshold
    const cog = getCognition(engine.store.state, 'npc-ally');
    cog.morale = 85;

    engine.drainEvents();

    engine.store.state.entities.enemy1.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'enemy1',
      entityName: 'enemy1',
      defeatedBy: 'player',
    });

    const events = engine.drainEvents();
    const moraleEvent = events.find(
      e => e.type === 'combat.aftermath.morale' && e.payload.entityId === 'npc-ally',
    );
    expect(moraleEvent).toBeDefined();
    expect(moraleEvent!.payload.tier).toBe('emboldened');
    expect(hasStatus(engine.store.state.entities['npc-ally'], MORALE_AFTERMATH_STATUSES.EMBOLDENED)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Group 6: Narrative Events
// ---------------------------------------------------------------------------

describe('combat-recovery: narrative events', () => {
  it('combat.aftermath.injury emitted per wound', () => {
    const player = makeEntity('player', 'player', ['player'], {
      resources: { hp: 6, maxHp: 20, stamina: 5, maxStamina: 5 }, // 0.30 → serious
    });
    const ally = makeEntity('ally', 'npc', ['npc'], {
      resources: { hp: 2, maxHp: 20, stamina: 5, maxStamina: 5 }, // 0.10 → critical
    });
    const enemy = makeEntity('enemy1', 'enemy', ['enemy']);
    const engine = buildEngine([player, ally, enemy]);
    engine.drainEvents();

    engine.store.state.entities.enemy1.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'enemy1',
      entityName: 'enemy1',
      defeatedBy: 'player',
    });

    const events = engine.drainEvents();
    const injuries = events.filter(e => e.type === 'combat.aftermath.injury');

    // Both player and ally should have injuries
    expect(injuries.length).toBe(2);

    const playerInjury = injuries.find(e => e.payload.entityId === 'player');
    const allyInjury = injuries.find(e => e.payload.entityId === 'ally');

    expect(playerInjury!.payload.severity).toBe('serious');
    expect(allyInjury!.payload.severity).toBe('critical');
  });

  it('combat.aftermath.summary contains full report', () => {
    const player = makeEntity('player', 'player', ['player'], {
      resources: { hp: 10, maxHp: 20, stamina: 5, maxStamina: 5 },
    });
    const enemy = makeEntity('enemy1', 'enemy', ['enemy']);
    const engine = buildEngine([player, enemy]);
    engine.drainEvents();

    engine.store.state.entities.enemy1.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'enemy1',
      entityName: 'enemy1',
      defeatedBy: 'player',
    });

    const events = engine.drainEvents();
    const summary = events.find(e => e.type === 'combat.aftermath.summary');
    expect(summary).toBeDefined();

    const payload = summary!.payload;
    expect(payload.zoneId).toBe('zone-a');

    const casualties = payload.casualties as Array<{ entityId: string }>;
    expect(casualties.length).toBe(1);
    expect(casualties[0].entityId).toBe('enemy1');

    const survivors = payload.survivors as Array<{ entityId: string; hpRatio: number }>;
    expect(survivors.length).toBe(1);
    expect(survivors[0].entityId).toBe('player');
    expect(survivors[0].hpRatio).toBe(0.5);
  });
});
