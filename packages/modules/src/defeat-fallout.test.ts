import { describe, it, expect } from 'vitest';
import { createTestEngine, nextId } from '@ai-rpg-engine/core';
import type { EntityState, ResolvedEvent } from '@ai-rpg-engine/core';
import { createCombatCore } from './combat-core.js';
import { statusCore } from './status-core.js';
import { createEnvironmentCore } from './environment-core.js';
import { createDistrictCore, getDistrictForZone } from './district-core.js';
import { createDefeatFallout } from './defeat-fallout.js';

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [], neighbors: ['zone-a'] },
];

const districts = [
  { id: 'district-1', name: 'Market', zoneIds: ['zone-a'], tags: [] },
  { id: 'district-2', name: 'Docks', zoneIds: ['zone-b'], tags: [] },
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

/** Keep attacking until entity is defeated or max ticks reached */
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

describe('defeat-fallout', () => {
  const factions = [
    { factionId: 'bandits', entityIds: ['bandit'] },
  ];

  it('faction member defeat decreases reputation', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createEnvironmentCore(),
        createDistrictCore({ districts }),
        createDefeatFallout({ factions, playerId: 'player' }),
      ],
      entities: [makePlayer('zone-a'), makeEnemy('bandit', 'zone-a')],
      zones,
    });

    killEntity(engine, 'bandit');

    expect(engine.world.globals['reputation_bandits']).toBe(-10);
  });

  it('faction member defeat raises alert', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createEnvironmentCore(),
        createDistrictCore({ districts }),
        createDefeatFallout({ factions, playerId: 'player' }),
      ],
      entities: [makePlayer('zone-a'), makeEnemy('bandit', 'zone-a')],
      zones,
    });

    killEntity(engine, 'bandit');

    expect(engine.world.globals['faction_alert_bandits']).toBe(15);
  });

  it('boss defeat doubles reputation/alert penalties and emits milestone', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createEnvironmentCore(),
        createDistrictCore({ districts }),
        createDefeatFallout({ factions: [{ factionId: 'bandits', entityIds: ['boss-bandit'] }], playerId: 'player' }),
      ],
      entities: [
        makePlayer('zone-a'),
        makeEnemy('boss-bandit', 'zone-a', { tags: ['enemy', 'boss'], name: 'Bandit King' }),
      ],
      zones,
    });

    const allEvents: ResolvedEvent[] = [];
    engine.store.events.onAny(e => allEvents.push(e));

    killEntity(engine, 'boss-bandit');

    expect(engine.world.globals['reputation_bandits']).toBe(-25);
    expect(engine.world.globals['faction_alert_bandits']).toBe(30);
    expect(allEvents.some(e => e.type === 'defeat.fallout.milestone')).toBe(true);
  });

  it('heat increases on kill', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createEnvironmentCore(),
        createDistrictCore({ districts }),
        createDefeatFallout({ factions, playerId: 'player' }),
      ],
      entities: [makePlayer('zone-a'), makeEnemy('bandit', 'zone-a')],
      zones,
    });

    killEntity(engine, 'bandit');

    expect(engine.world.globals['player_heat']).toBe(5);
  });

  it('district safety decreases on kill', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createEnvironmentCore(),
        createDistrictCore({ districts }),
        createDefeatFallout({ factions, playerId: 'player' }),
      ],
      entities: [makePlayer('zone-a'), makeEnemy('bandit', 'zone-a')],
      zones,
    });

    killEntity(engine, 'bandit');

    expect(engine.world.globals['district_district-1_safety']).toBe(-3);
  });

  it('violence escalation fires after threshold kills', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createEnvironmentCore(),
        createDistrictCore({ districts }),
        createDefeatFallout({
          factions: [{ factionId: 'gang', entityIds: ['thug1', 'thug2', 'thug3'] }],
          playerId: 'player',
          violenceThreshold: 3,
          violenceWindow: 100,
        }),
      ],
      entities: [
        makePlayer('zone-a'),
        makeEnemy('thug1', 'zone-a'),
        makeEnemy('thug2', 'zone-a'),
        makeEnemy('thug3', 'zone-a'),
      ],
      zones,
    });

    const allEvents: ResolvedEvent[] = [];
    engine.store.events.onAny(e => allEvents.push(e));

    // Kill 3 enemies in the same district
    killEntity(engine, 'thug1');
    engine.world.entities.thug2.resources.hp = 1;
    killEntity(engine, 'thug2');
    engine.world.entities.thug3.resources.hp = 1;
    killEntity(engine, 'thug3');

    const escalation = allEvents.filter(e => e.type === 'defeat.region.violence-escalated');
    expect(escalation.length).toBeGreaterThanOrEqual(1);
    expect(engine.world.globals['district_district-1_tension']).toBe('tense');
  });

  it('player defeated emits combat-lost companion event', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createEnvironmentCore(),
        createDistrictCore({ districts }),
        createDefeatFallout({ factions, playerId: 'player' }),
      ],
      entities: [
        makePlayer('zone-a', { resources: { hp: 1, stamina: 5 } }),
        makeEnemy('bandit', 'zone-a', { resources: { hp: 50, stamina: 5 }, stats: { vigor: 10, instinct: 10, will: 5 } }),
      ],
      zones,
    });

    const allEvents: ResolvedEvent[] = [];
    engine.store.events.onAny(e => allEvents.push(e));

    // Let the enemy attack the player
    for (let i = 0; i < 50; i++) {
      engine.world.entities.bandit.resources.stamina = 5;
      const action = {
        id: nextId('action'),
        actorId: 'bandit',
        verb: 'attack',
        targetIds: ['player'],
        source: 'ai' as const,
        issuedAtTick: engine.tick,
      };
      engine.processAction(action);
      if (engine.world.entities.player.resources.hp <= 0) break;
    }

    if (engine.world.entities.player.resources.hp <= 0) {
      const companionEvent = allEvents.find(
        e => e.type === 'defeat.fallout.companion' && e.payload.trigger === 'combat-lost'
      );
      expect(companionEvent).toBeTruthy();
      const chronicleEvent = allEvents.find(
        e => e.type === 'defeat.fallout.chronicle' && e.payload.category === 'death'
      );
      expect(chronicleEvent).toBeTruthy();
    }
  });

  it('chronicle event emitted with correct data', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createEnvironmentCore(),
        createDistrictCore({ districts }),
        createDefeatFallout({ factions, playerId: 'player' }),
      ],
      entities: [makePlayer('zone-a'), makeEnemy('bandit', 'zone-a', { name: 'Bandit Scum' })],
      zones,
    });

    const allEvents: ResolvedEvent[] = [];
    engine.store.events.onAny(e => allEvents.push(e));

    killEntity(engine, 'bandit');

    const chronicle = allEvents.find(e => e.type === 'defeat.fallout.chronicle' && e.payload.category === 'kill');
    expect(chronicle).toBeTruthy();
    expect(chronicle!.payload.actorId).toBe('player');
    expect(chronicle!.payload.targetId).toBe('bandit');
    expect(chronicle!.payload.factionId).toBe('bandits');
    expect(chronicle!.payload.significance).toBe(0.7); // faction member
  });

  it('rumor event emitted with claim and valence', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createEnvironmentCore(),
        createDistrictCore({ districts }),
        createDefeatFallout({ factions, playerId: 'player' }),
      ],
      entities: [makePlayer('zone-a'), makeEnemy('bandit', 'zone-a')],
      zones,
    });

    const allEvents: ResolvedEvent[] = [];
    engine.store.events.onAny(e => allEvents.push(e));

    killEntity(engine, 'bandit');

    const rumor = allEvents.find(e => e.type === 'defeat.fallout.rumor');
    expect(rumor).toBeTruthy();
    expect(rumor!.payload.valence).toBe('fearsome');
    expect(typeof rumor!.payload.claim).toBe('string');
  });

  it('no fallout for non-player kills', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createEnvironmentCore(),
        createDistrictCore({ districts }),
        createDefeatFallout({ factions, playerId: 'player' }),
      ],
      entities: [
        makePlayer('zone-b'),
        makeEnemy('bandit', 'zone-a'),
        makeEnemy('rival', 'zone-a', { resources: { hp: 50, stamina: 5 }, stats: { vigor: 10, instinct: 10, will: 5 } }),
      ],
      zones,
    });

    const allEvents: ResolvedEvent[] = [];
    engine.store.events.onAny(e => allEvents.push(e));

    // NPC attacks NPC
    for (let i = 0; i < 50; i++) {
      engine.world.entities.rival.resources.stamina = 5;
      engine.world.entities.bandit.resources.hp = 1;
      const action = {
        id: nextId('action'),
        actorId: 'rival',
        verb: 'attack',
        targetIds: ['bandit'],
        source: 'ai' as const,
        issuedAtTick: engine.tick,
      };
      engine.processAction(action);
      if (engine.world.entities.bandit.resources.hp <= 0) break;
    }

    const falloutEvents = allEvents.filter(e => e.type.startsWith('defeat.fallout.'));
    expect(falloutEvents.length).toBe(0);
  });

  it('unknown faction entity — no reputation change but heat still fires', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createEnvironmentCore(),
        createDistrictCore({ districts }),
        createDefeatFallout({ factions: [], playerId: 'player' }),
      ],
      entities: [makePlayer('zone-a'), makeEnemy('loner', 'zone-a')],
      zones,
    });

    killEntity(engine, 'loner');

    // No reputation key should exist
    const repKeys = Object.keys(engine.world.globals).filter(k => k.startsWith('reputation_'));
    expect(repKeys.length).toBe(0);
    // Heat still fires
    expect(engine.world.globals['player_heat']).toBe(5);
  });

  it('determinism — same seed and actions produce same fallout', () => {
    function runScenario(seed: number) {
      const engine = createTestEngine({
        seed,
        modules: [
          statusCore,
          createCombatCore(),
          createEnvironmentCore(),
        createDistrictCore({ districts }),
          createDefeatFallout({ factions, playerId: 'player' }),
        ],
        entities: [makePlayer('zone-a'), makeEnemy('bandit', 'zone-a')],
        zones,
      });

      killEntity(engine, 'bandit');
      return { ...engine.world.globals };
    }

    const run1 = runScenario(99);
    const run2 = runScenario(99);
    expect(run1).toEqual(run2);
  });
});
