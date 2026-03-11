import { describe, it, expect } from 'vitest';
import { createTestEngine, nextId } from '@ai-rpg-engine/core';
import type { EntityState, ResolvedEvent } from '@ai-rpg-engine/core';
import { createCombatCore, defaultInterceptChance, DEFAULT_STAT_MAPPING } from './combat-core.js';
import { statusCore, hasStatus, applyStatus } from './status-core.js';
import { createEnvironmentCore } from './environment-core.js';
import {
  createEngagementCore,
  withEngagement,
  ENGAGEMENT_STATES,
  isEngaged,
  isProtected,
  isBackline,
  isIsolated,
} from './engagement-core.js';

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [], neighbors: ['zone-a'] },
  { id: 'zone-choke', roomId: 'test', name: 'Chokepoint', tags: ['chokepoint'], neighbors: ['zone-a'] },
];

const makePlayer = (zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

const makeEnemy = (id: string, zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type: 'enemy',
  name: id,
  tags: ['enemy'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 1, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

const makeAlly = (id: string, zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type: 'player',
  name: id,
  tags: ['ally'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

function buildEngine(entities: EntityState[], extraZones?: typeof zones) {
  return createTestEngine({
    modules: [
      statusCore,
      createEngagementCore({ playerId: 'player' }),
      createEnvironmentCore(),
      createCombatCore(withEngagement({})),
    ],
    entities,
    zones: extraZones ?? zones,
  });
}

/** Attack until hit or max attempts */
function attackUntilHit(engine: ReturnType<typeof createTestEngine>, targetId: string, maxTicks = 50): ResolvedEvent[] {
  for (let i = 0; i < maxTicks; i++) {
    engine.world.entities.player.resources.stamina = 5;
    const events = engine.submitAction('attack', { targetIds: [targetId] });
    if (events.some(e => e.type === 'combat.contact.hit')) {
      return events;
    }
  }
  throw new Error(`Failed to hit ${targetId} within ${maxTicks} attempts`);
}

/** Attack until entity defeated */
function killEntity(engine: ReturnType<typeof createTestEngine>, targetId: string, maxTicks = 50): ResolvedEvent[] {
  for (let i = 0; i < maxTicks; i++) {
    engine.world.entities.player.resources.stamina = 5;
    const events = engine.submitAction('attack', { targetIds: [targetId] });
    if (events.some(e => e.type === 'combat.entity.defeated' && e.payload.entityId === targetId)) {
      return events;
    }
  }
  throw new Error(`Failed to defeat ${targetId} within ${maxTicks} ticks`);
}

describe('engagement-core', () => {
  // --- ENGAGED ---

  it('ENGAGED applied on hit — both attacker and target', () => {
    const engine = buildEngine([
      makePlayer('zone-a'),
      makeEnemy('bandit', 'zone-a', { resources: { hp: 50, stamina: 5 } }),
    ]);

    attackUntilHit(engine, 'bandit');

    expect(isEngaged(engine.world.entities.player)).toBe(true);
    expect(isEngaged(engine.world.entities.bandit)).toBe(true);
  });

  it('ENGAGED boosts hit chance on target (+5)', () => {
    // withEngagement adds +5 to hitChance when target is ENGAGED
    const baseFormulas = {
      hitChance: () => 50,
    };
    const wrapped = withEngagement(baseFormulas);
    const engaged: EntityState = {
      id: 'e', blueprintId: 'e', type: 'enemy', name: 'e', tags: [],
      stats: {}, resources: {}, statuses: [{ id: 's1', statusId: ENGAGEMENT_STATES.ENGAGED, stacks: 1, appliedAtTick: 0 }],
    };
    const attacker: EntityState = {
      id: 'a', blueprintId: 'a', type: 'player', name: 'a', tags: [],
      stats: {}, resources: {}, statuses: [],
    };

    const result = wrapped.hitChance!(attacker, engaged, {} as any);
    expect(result).toBe(55); // 50 base + 5 engaged
  });

  it('ENGAGED increases disengage difficulty (-15)', () => {
    const baseFormulas = {
      disengageChance: () => 60,
    };
    const wrapped = withEngagement(baseFormulas);
    const engaged: EntityState = {
      id: 'e', blueprintId: 'e', type: 'player', name: 'e', tags: [],
      stats: {}, resources: {}, statuses: [{ id: 's1', statusId: ENGAGEMENT_STATES.ENGAGED, stacks: 1, appliedAtTick: 0 }],
    };

    const result = wrapped.disengageChance!(engaged, {} as any);
    expect(result).toBe(45); // 60 - 15
  });

  // --- BACKLINE ---

  it('BACKLINE applied for ranged entity on zone entry', () => {
    const engine = buildEngine([
      makePlayer('zone-b', { tags: ['player', 'ranged'] }),
      makeEnemy('bandit', 'zone-a'),
    ]);

    // Move player to zone-a via traversal
    engine.world.entities.player.zoneId = 'zone-a';
    engine.store.emitEvent('world.zone.entered', { entityId: 'player', zoneId: 'zone-a' });

    expect(isBackline(engine.world.entities.player)).toBe(true);
  });

  it('BACKLINE removed when engaged by combat hit', () => {
    const engine = buildEngine([
      makePlayer('zone-a', { tags: ['player', 'ranged'] }),
      makeEnemy('bandit', 'zone-a', { resources: { hp: 50, stamina: 5 } }),
    ]);

    // Manually give player backline status
    engine.world.entities.player.zoneId = 'zone-a';
    engine.store.emitEvent('world.zone.entered', { entityId: 'player', zoneId: 'zone-a' });
    expect(isBackline(engine.world.entities.player)).toBe(true);

    // Attack should engage and remove backline
    attackUntilHit(engine, 'bandit');
    expect(isBackline(engine.world.entities.player)).toBe(false);
    expect(isEngaged(engine.world.entities.player)).toBe(true);
  });

  it('BACKLINE reduces hit chance on target (-10)', () => {
    const baseFormulas = {
      hitChance: () => 50,
    };
    const wrapped = withEngagement(baseFormulas);
    const backline: EntityState = {
      id: 'e', blueprintId: 'e', type: 'enemy', name: 'e', tags: [],
      stats: {}, resources: {}, statuses: [{ id: 's1', statusId: ENGAGEMENT_STATES.BACKLINE, stacks: 1, appliedAtTick: 0 }],
    };
    const attacker: EntityState = {
      id: 'a', blueprintId: 'a', type: 'player', name: 'a', tags: [],
      stats: {}, resources: {}, statuses: [],
    };

    const result = wrapped.hitChance!(attacker, backline, {} as any);
    expect(result).toBe(40); // 50 - 10
  });

  it('BACKLINE boosts disengage chance (+15)', () => {
    const baseFormulas = {
      disengageChance: () => 40,
    };
    const wrapped = withEngagement(baseFormulas);
    const backline: EntityState = {
      id: 'e', blueprintId: 'e', type: 'player', name: 'e', tags: [],
      stats: {}, resources: {}, statuses: [{ id: 's1', statusId: ENGAGEMENT_STATES.BACKLINE, stacks: 1, appliedAtTick: 0 }],
    };

    const result = wrapped.disengageChance!(backline, {} as any);
    expect(result).toBe(55); // 40 + 15
  });

  // --- PROTECTED ---

  it('PROTECTED applied with bodyguard companion in zone', () => {
    const engine = buildEngine([
      makePlayer('zone-a'),
      makeAlly('guard', 'zone-a', { tags: ['ally', 'bodyguard'] }),
      makeEnemy('bandit', 'zone-a', { resources: { hp: 50, stamina: 5 } }),
    ]);

    // Trigger zone evaluation
    engine.store.emitEvent('world.zone.entered', { entityId: 'player', zoneId: 'zone-a' });

    expect(isProtected(engine.world.entities.player)).toBe(true);
  });

  it('PROTECTED removed when protector defeated', () => {
    const engine = buildEngine([
      makePlayer('zone-a'),
      makeAlly('guard', 'zone-a', { tags: ['ally', 'bodyguard'], resources: { hp: 1, stamina: 5 } }),
      makeEnemy('bandit', 'zone-a', { resources: { hp: 50, stamina: 5 } }),
    ]);

    // Set up protection
    engine.store.emitEvent('world.zone.entered', { entityId: 'player', zoneId: 'zone-a' });
    expect(isProtected(engine.world.entities.player)).toBe(true);

    // Defeat the guard
    engine.world.entities.guard.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'guard', entityName: 'guard', defeatedBy: 'bandit',
    });

    expect(isProtected(engine.world.entities.player)).toBe(false);
  });

  it('PROTECTED boosts guard reduction (+0.10)', () => {
    const baseFormulas = {
      guardReduction: () => 0.5,
    };
    const wrapped = withEngagement(baseFormulas);
    const protectedEntity: EntityState = {
      id: 'e', blueprintId: 'e', type: 'player', name: 'e', tags: [],
      stats: {}, resources: {}, statuses: [{ id: 's1', statusId: ENGAGEMENT_STATES.PROTECTED, stacks: 1, appliedAtTick: 0 }],
    };

    const result = wrapped.guardReduction!(protectedEntity, {} as any);
    expect(result).toBeCloseTo(0.6); // 0.5 + 0.10
  });

  it('PROTECTED boosts intercept chance (+15)', () => {
    const baseFormulas = {
      interceptChance: () => 30,
    };
    const wrapped = withEngagement(baseFormulas);
    const protectedTarget: EntityState = {
      id: 'e', blueprintId: 'e', type: 'player', name: 'e', tags: [],
      stats: {}, resources: {}, statuses: [{ id: 's1', statusId: ENGAGEMENT_STATES.PROTECTED, stacks: 1, appliedAtTick: 0 }],
    };
    const ally: EntityState = {
      id: 'a', blueprintId: 'a', type: 'player', name: 'a', tags: [],
      stats: {}, resources: {}, statuses: [],
    };

    const result = wrapped.interceptChance!(ally, protectedTarget, {} as any);
    expect(result).toBe(45); // 30 + 15
  });

  // --- ISOLATED ---

  it('ISOLATED applied when alone in zone', () => {
    const engine = buildEngine([
      makePlayer('zone-a'),
      makeEnemy('bandit', 'zone-b'),
    ]);

    engine.store.emitEvent('world.zone.entered', { entityId: 'player', zoneId: 'zone-a' });
    expect(isIsolated(engine.world.entities.player)).toBe(true);
  });

  it('ISOLATED removed when ally enters zone', () => {
    const engine = buildEngine([
      makePlayer('zone-a'),
      makeAlly('friend', 'zone-b'),
      makeEnemy('bandit', 'zone-b'),
    ]);

    engine.store.emitEvent('world.zone.entered', { entityId: 'player', zoneId: 'zone-a' });
    expect(isIsolated(engine.world.entities.player)).toBe(true);

    // Ally enters the zone
    engine.world.entities.friend.zoneId = 'zone-a';
    engine.store.emitEvent('world.zone.entered', { entityId: 'friend', zoneId: 'zone-a' });
    expect(isIsolated(engine.world.entities.player)).toBe(false);
  });

  it('ISOLATED increases incoming damage (+2)', () => {
    const baseFormulas = {
      damage: () => 5,
    };
    const wrapped = withEngagement(baseFormulas);
    const attacker: EntityState = {
      id: 'a', blueprintId: 'a', type: 'enemy', name: 'a', tags: [],
      stats: {}, resources: {}, statuses: [],
    };
    const isolated: EntityState = {
      id: 'e', blueprintId: 'e', type: 'player', name: 'e', tags: [],
      stats: {}, resources: {}, statuses: [{ id: 's1', statusId: ENGAGEMENT_STATES.ISOLATED, stacks: 1, appliedAtTick: 0 }],
    };

    const result = wrapped.damage!(attacker, isolated, {} as any);
    expect(result).toBe(7); // 5 + 2
  });

  // --- CHOKEPOINT ---

  it('chokepoint zone forces engagement', () => {
    const engine = buildEngine([
      makePlayer('zone-a'),
      makeEnemy('bandit', 'zone-choke'),
    ]);

    engine.world.entities.player.zoneId = 'zone-choke';
    engine.store.emitEvent('world.zone.entered', { entityId: 'player', zoneId: 'zone-choke' });

    expect(isEngaged(engine.world.entities.player)).toBe(true);
    expect(isBackline(engine.world.entities.player)).toBe(false);
  });

  // --- CLAMPING ---

  it('withEngagement clamps values to valid ranges', () => {
    const extremeFormulas = {
      hitChance: () => 100,
      disengageChance: () => 0,
      guardReduction: () => 0.70,
      interceptChance: () => 90,
    };
    const wrapped = withEngagement(extremeFormulas);
    const engaged: EntityState = {
      id: 'e', blueprintId: 'e', type: 'player', name: 'e', tags: [],
      stats: {}, resources: {}, statuses: [
        { id: 's1', statusId: ENGAGEMENT_STATES.ENGAGED, stacks: 1, appliedAtTick: 0 },
        { id: 's2', statusId: ENGAGEMENT_STATES.ISOLATED, stacks: 1, appliedAtTick: 0 },
        { id: 's3', statusId: ENGAGEMENT_STATES.PROTECTED, stacks: 1, appliedAtTick: 0 },
      ],
    };
    const other: EntityState = {
      id: 'o', blueprintId: 'o', type: 'enemy', name: 'o', tags: [],
      stats: {}, resources: {}, statuses: [],
    };

    // hitChance should clamp to 95 max
    expect(wrapped.hitChance!(other, engaged, {} as any)).toBeLessThanOrEqual(95);
    // disengageChance should clamp to 5 min
    expect(wrapped.disengageChance!(engaged, {} as any)).toBeGreaterThanOrEqual(5);
    // guardReduction should clamp to 0.75
    expect(wrapped.guardReduction!(engaged, {} as any)).toBeLessThanOrEqual(0.75);
    // interceptChance should clamp to 90
    expect(wrapped.interceptChance!(other, engaged, {} as any)).toBeLessThanOrEqual(90);
  });

  // --- NO LEAKAGE ---

  it('engagement flags do not exist on fresh entities', () => {
    const engine = buildEngine([
      makePlayer('zone-a'),
      makeEnemy('bandit', 'zone-a', { resources: { hp: 50, stamina: 5 } }),
    ]);

    // Before any combat events, no engagement statuses
    expect(isEngaged(engine.world.entities.player)).toBe(false);
    expect(isProtected(engine.world.entities.player)).toBe(false);
    expect(isBackline(engine.world.entities.player)).toBe(false);
    // Note: isolated might be true since player has no same-type allies,
    // but only after zone entry event fires
    expect(hasStatus(engine.world.entities.player, ENGAGEMENT_STATES.ENGAGED)).toBe(false);
    expect(hasStatus(engine.world.entities.player, ENGAGEMENT_STATES.PROTECTED)).toBe(false);
    expect(hasStatus(engine.world.entities.player, ENGAGEMENT_STATES.BACKLINE)).toBe(false);
  });

  // --- CHOKEPOINT DEPTH ---

  it('chokepoint reduces disengage chance via withEngagement', () => {
    const wrapped = withEngagement({
      disengageChance: () => 60,
    });
    const actor: EntityState = {
      id: 'e', blueprintId: 'e', type: 'player', name: 'e', tags: [],
      stats: {}, resources: {}, statuses: [],
      zoneId: 'zone-choke',
    };
    const world = { zones: { 'zone-choke': { id: 'zone-choke', tags: ['chokepoint'], neighbors: [] } } } as any;

    const result = wrapped.disengageChance!(actor, world);
    expect(result).toBe(50); // 60 - 10 chokepoint
  });

  it('chokepoint disengage penalty stacks with ENGAGED penalty', () => {
    const wrapped = withEngagement({
      disengageChance: () => 60,
    });
    const actor: EntityState = {
      id: 'e', blueprintId: 'e', type: 'player', name: 'e', tags: [],
      stats: {}, resources: {},
      statuses: [{ id: 's1', statusId: ENGAGEMENT_STATES.ENGAGED, stacks: 1, appliedAtTick: 0 }],
      zoneId: 'zone-choke',
    };
    const world = { zones: { 'zone-choke': { id: 'zone-choke', tags: ['chokepoint'], neighbors: [] } } } as any;

    const result = wrapped.disengageChance!(actor, world);
    expect(result).toBe(35); // 60 - 15 engaged - 10 chokepoint
  });

  // --- AMBUSH ENTRY ---

  it('ambush_entry zone applies EXPOSED on entry with enemies present', () => {
    const ambushZones = [
      { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: ['zone-ambush'] },
      { id: 'zone-ambush', roomId: 'test', name: 'Ambush', tags: ['ambush_entry'], neighbors: ['zone-a'] },
    ];
    const engine = buildEngine([
      makePlayer('zone-a'),
      makeEnemy('bandit', 'zone-ambush', { resources: { hp: 50, stamina: 5 } }),
    ], ambushZones);

    // Player walks into ambush zone
    engine.world.entities.player.zoneId = 'zone-ambush';
    engine.store.emitEvent('world.zone.entered', { entityId: 'player', zoneId: 'zone-ambush' });

    expect(hasStatus(engine.world.entities.player, 'combat:exposed')).toBe(true);
  });

  it('ambush_entry zone does NOT apply EXPOSED without enemies', () => {
    const ambushZones = [
      { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: ['zone-ambush'] },
      { id: 'zone-ambush', roomId: 'test', name: 'Ambush', tags: ['ambush_entry'], neighbors: ['zone-a'] },
    ];
    const engine = buildEngine([
      makePlayer('zone-a'),
    ], ambushZones);

    engine.world.entities.player.zoneId = 'zone-ambush';
    engine.store.emitEvent('world.zone.entered', { entityId: 'player', zoneId: 'zone-ambush' });

    expect(hasStatus(engine.world.entities.player, 'combat:exposed')).toBe(false);
  });

  it('ambush_entry emits combat.ambush.triggered event', () => {
    const ambushZones = [
      { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: ['zone-ambush'] },
      { id: 'zone-ambush', roomId: 'test', name: 'Ambush', tags: ['ambush_entry'], neighbors: ['zone-a'] },
    ];
    const engine = buildEngine([
      makePlayer('zone-a'),
      makeEnemy('bandit', 'zone-ambush', { resources: { hp: 50, stamina: 5 } }),
    ], ambushZones);

    const collected: ResolvedEvent[] = [];
    engine.store.events.on('combat.ambush.triggered', (e: ResolvedEvent) => {
      collected.push(e);
    });

    engine.world.entities.player.zoneId = 'zone-ambush';
    engine.store.emitEvent('world.zone.entered', { entityId: 'player', zoneId: 'zone-ambush' });

    expect(collected.length).toBe(1);
    expect(collected[0].payload.entityId).toBe('player');
    expect(collected[0].payload.zoneId).toBe('zone-ambush');
  });

  it('ambush does not double-apply EXPOSED', () => {
    const ambushZones = [
      { id: 'zone-ambush', roomId: 'test', name: 'Ambush', tags: ['ambush_entry'], neighbors: [] },
    ];
    const engine = buildEngine([
      makePlayer('zone-ambush'),
      makeEnemy('bandit', 'zone-ambush', { resources: { hp: 50, stamina: 5 } }),
    ], ambushZones);

    // Manually apply EXPOSED first
    applyStatus(engine.world.entities.player, 'combat:exposed', 0, { duration: 1 });
    expect(hasStatus(engine.world.entities.player, 'combat:exposed')).toBe(true);

    // Entering ambush zone should NOT add a second EXPOSED
    const collected: ResolvedEvent[] = [];
    engine.store.events.on('combat.ambush.triggered', (e: ResolvedEvent) => {
      collected.push(e);
    });
    engine.store.emitEvent('world.zone.entered', { entityId: 'player', zoneId: 'zone-ambush' });

    // No ambush event since already exposed
    expect(collected.length).toBe(0);
  });

  // --- FRONTLINER SCREENING ---

  it('withEngagement sets shouldIntercept for backline targets', () => {
    const wrapped = withEngagement({});
    const backlineTarget: EntityState = {
      id: 'caster', blueprintId: 'caster', type: 'player', name: 'Caster', tags: [],
      stats: {}, resources: {},
      statuses: [{ id: 's1', statusId: ENGAGEMENT_STATES.BACKLINE, stacks: 1, appliedAtTick: 0 }],
    };
    const normalTarget: EntityState = {
      id: 'warrior', blueprintId: 'warrior', type: 'player', name: 'Warrior', tags: [],
      stats: {}, resources: {}, statuses: [],
    };
    const world = { playerId: 'player' } as any;

    expect(wrapped.shouldIntercept!(backlineTarget, world)).toBe(true);
    expect(wrapped.shouldIntercept!(normalTarget, world)).toBe(false);
  });

  // --- EDGE CASES ---

  it('frontliner defeat causes remaining entity to become ISOLATED', () => {
    const engine = buildEngine([
      makePlayer('zone-a'),
      makeAlly('knight', 'zone-a', { tags: ['ally'], resources: { hp: 1, stamina: 5 } }),
      makeEnemy('bandit', 'zone-a', { resources: { hp: 50, stamina: 5 } }),
    ]);

    // Set up: player is not isolated since knight is present
    engine.store.emitEvent('world.zone.entered', { entityId: 'player', zoneId: 'zone-a' });
    expect(isIsolated(engine.world.entities.player)).toBe(false);

    // Knight defeated
    engine.world.entities.knight.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'knight', entityName: 'knight', defeatedBy: 'bandit',
    });

    expect(isIsolated(engine.world.entities.player)).toBe(true);
  });

  it('BACKLINE restored after all enemies in zone defeated', () => {
    const engine = buildEngine([
      makePlayer('zone-a', { tags: ['player', 'ranged'] }),
      makeEnemy('bandit', 'zone-a', { resources: { hp: 50, stamina: 5 } }),
    ]);

    // Manually set up engagement states (avoid relying on hit RNG)
    engine.store.emitEvent('world.zone.entered', { entityId: 'player', zoneId: 'zone-a' });
    expect(isBackline(engine.world.entities.player)).toBe(true);

    // Hit engages the player, removing backline
    attackUntilHit(engine, 'bandit');
    expect(isBackline(engine.world.entities.player)).toBe(false);
    expect(isEngaged(engine.world.entities.player)).toBe(true);

    // Simulate enemy defeat
    engine.world.entities.bandit.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'bandit', entityName: 'bandit', defeatedBy: 'player',
    });

    // With no enemies, ranged entity should revert to BACKLINE
    expect(isBackline(engine.world.entities.player)).toBe(true);
  });

  // --- FRONTLINE COLLAPSE ---

  it('frontline collapse event fires when last ENGAGED ally falls', () => {
    const engine = buildEngine([
      makePlayer('zone-a'),
      makeAlly('knight', 'zone-a', { tags: ['ally'], resources: { hp: 1, stamina: 5 } }),
      makeAlly('caster', 'zone-a', { tags: ['ally', 'ranged'], resources: { hp: 10, stamina: 5 } }),
      makeEnemy('bandit', 'zone-a', { resources: { hp: 50, stamina: 5 } }),
    ]);

    // Set up: knight is ENGAGED (frontliner), caster is BACKLINE
    applyStatus(engine.world.entities.knight, ENGAGEMENT_STATES.ENGAGED, 0);
    applyStatus(engine.world.entities.caster, ENGAGEMENT_STATES.BACKLINE, 0);

    const collapsed: ResolvedEvent[] = [];
    engine.store.events.on('combat.frontline.collapsed', (e: ResolvedEvent) => {
      collapsed.push(e);
    });

    // Knight (last ENGAGED frontliner of type 'player') falls
    engine.world.entities.knight.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'knight', entityName: 'knight', defeatedBy: 'bandit',
    });

    expect(collapsed.length).toBe(1);
    expect(collapsed[0].payload.exposedIds).toContain('caster');
  });

  it('no frontline collapse when non-ENGAGED entity falls', () => {
    const engine = buildEngine([
      makePlayer('zone-a'),
      makeAlly('knight', 'zone-a', { tags: ['ally'], resources: { hp: 1, stamina: 5 } }),
      makeAlly('caster', 'zone-a', { tags: ['ally', 'ranged'], resources: { hp: 10, stamina: 5 } }),
      makeEnemy('bandit', 'zone-a', { resources: { hp: 50, stamina: 5 } }),
    ]);

    // Knight is NOT ENGAGED — just in zone
    applyStatus(engine.world.entities.caster, ENGAGEMENT_STATES.BACKLINE, 0);

    const collapsed: ResolvedEvent[] = [];
    engine.store.events.on('combat.frontline.collapsed', (e: ResolvedEvent) => {
      collapsed.push(e);
    });

    engine.world.entities.knight.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'knight', entityName: 'knight', defeatedBy: 'bandit',
    });

    expect(collapsed.length).toBe(0);
  });

  it('no frontline collapse when other frontliners remain', () => {
    const engine = buildEngine([
      makePlayer('zone-a'),
      makeAlly('knight1', 'zone-a', { tags: ['ally'], resources: { hp: 1, stamina: 5 } }),
      makeAlly('knight2', 'zone-a', { tags: ['ally'], resources: { hp: 10, stamina: 5 } }),
      makeAlly('caster', 'zone-a', { tags: ['ally', 'ranged'], resources: { hp: 10, stamina: 5 } }),
      makeEnemy('bandit', 'zone-a', { resources: { hp: 50, stamina: 5 } }),
    ]);

    // Both knights are ENGAGED, caster is BACKLINE
    applyStatus(engine.world.entities.knight1, ENGAGEMENT_STATES.ENGAGED, 0);
    applyStatus(engine.world.entities.knight2, ENGAGEMENT_STATES.ENGAGED, 0);
    applyStatus(engine.world.entities.caster, ENGAGEMENT_STATES.BACKLINE, 0);

    const collapsed: ResolvedEvent[] = [];
    engine.store.events.on('combat.frontline.collapsed', (e: ResolvedEvent) => {
      collapsed.push(e);
    });

    // knight1 falls, but knight2 remains ENGAGED
    engine.world.entities.knight1.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'knight1', entityName: 'knight1', defeatedBy: 'bandit',
    });

    expect(collapsed.length).toBe(0);
  });

  it('protector entering zone grants PROTECTED to existing allies', () => {
    const engine = buildEngine([
      makePlayer('zone-a'),
      makeAlly('guard', 'zone-b', { tags: ['ally', 'bodyguard'] }),
      makeEnemy('bandit', 'zone-a', { resources: { hp: 50, stamina: 5 } }),
    ]);

    engine.store.emitEvent('world.zone.entered', { entityId: 'player', zoneId: 'zone-a' });
    expect(isProtected(engine.world.entities.player)).toBe(false);

    // Bodyguard enters zone
    engine.world.entities.guard.zoneId = 'zone-a';
    engine.store.emitEvent('world.zone.entered', { entityId: 'guard', zoneId: 'zone-a' });

    expect(isProtected(engine.world.entities.player)).toBe(true);
  });

  // --- EDGE CASES: DEFEAT COMBOS ---

  it('defeat of last frontliner + last ally fires ISOLATED + frontline collapse', () => {
    const engine = buildEngine([
      makePlayer('zone-a', { tags: ['player', 'ranged'] }),
      makeAlly('knight', 'zone-a', { tags: ['ally'], resources: { hp: 1, stamina: 5 } }),
      makeEnemy('bandit', 'zone-a', { resources: { hp: 50, stamina: 5 } }),
    ]);

    // Knight is ENGAGED (frontliner), player is BACKLINE
    applyStatus(engine.world.entities.knight, ENGAGEMENT_STATES.ENGAGED, 0);
    applyStatus(engine.world.entities.player, ENGAGEMENT_STATES.BACKLINE, 0);

    // Set up zone entry so ISOLATED tracking is active
    engine.store.emitEvent('world.zone.entered', { entityId: 'player', zoneId: 'zone-a' });
    expect(isIsolated(engine.world.entities.player)).toBe(false); // knight is ally

    const collapsed: ResolvedEvent[] = [];
    engine.store.events.on('combat.frontline.collapsed', (e: ResolvedEvent) => {
      collapsed.push(e);
    });

    // Knight (last frontliner + last ally) falls
    engine.world.entities.knight.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'knight', entityName: 'knight', defeatedBy: 'bandit',
    });

    // Both ISOLATED and frontline collapse should fire
    expect(isIsolated(engine.world.entities.player)).toBe(true);
    expect(collapsed.length).toBe(1);
    expect(collapsed[0].payload.exposedIds).toContain('player');
  });
});

// ---------------------------------------------------------------------------
// withEngagement PROTECTED stacking on scored formula (P7)
// ---------------------------------------------------------------------------

describe('withEngagement PROTECTED + scored interception', () => {
  it('PROTECTED bonus stacks on scored formula, not flat 30', () => {
    const ally: EntityState = {
      id: 'guard',
      blueprintId: 'guard',
      type: 'player',
      name: 'Guard',
      tags: ['ally', 'role:bodyguard'],
      stats: { vigor: 5, instinct: 5, will: 3 },
      resources: { hp: 20, maxHp: 20, stamina: 5 },
      statuses: [],
      zoneId: 'zone-a',
    };
    const target: EntityState = {
      id: 'player',
      blueprintId: 'player',
      type: 'player',
      name: 'Hero',
      tags: ['player'],
      stats: { vigor: 5, instinct: 5, will: 3 },
      resources: { hp: 20, maxHp: 20, stamina: 5 },
      statuses: [],
      zoneId: 'zone-a',
    };
    applyStatus(target, ENGAGEMENT_STATES.PROTECTED, 0);

    const world = { playerId: 'player', entities: {}, zones: {}, modules: {}, meta: { tick: 1 }, locationId: 'zone-a' } as any;

    // Base scored formula (bodyguard = 31 + 15 role = 46)
    const baseChance = defaultInterceptChance(ally, target, world, DEFAULT_STAT_MAPPING);
    expect(baseChance).toBe(46);

    // withEngagement should add PROTECTED +15 on top of scored formula
    const wrapped = withEngagement({});
    const wrappedChance = wrapped.interceptChance!(ally, target, world);
    // 46 + 15 = 61, clamped to [5, 90]
    expect(wrappedChance).toBe(61);

    // Verify it's NOT flat 30 + 15 = 45
    expect(wrappedChance).not.toBe(45);
  });
});

