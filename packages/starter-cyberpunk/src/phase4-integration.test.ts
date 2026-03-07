// Phase 4 integration tests — faction cognition, rumor propagation,
// knowledge decay, and simulation inspector across both starters

import { describe, test, expect } from 'vitest';
import { createTestEngine } from '@signalfire/core';
import {
  createCognitionCore,
  createPerceptionFilter,
  createEnvironmentCore,
  createProgressionCore,
  createFactionCognition,
  createRumorPropagation,
  createSimulationInspector,
  getCognition,
  setBelief,
  getBelief,
  reinforceBelief,
  getFactionCognition,
  factionBelieves,
  getFactionBelief,
  getEntityFaction,
  getRumorLog,
  inspectEntity,
  inspectFaction,
  inspectZone,
  createSnapshot,
  formatEntityInspection,
  setZoneProperty,
} from '@signalfire/modules';
import { combatMasteryTree } from '../../starter-fantasy/src/content.js';
import { netrunningTree } from './content.js';

// --- Shared fixtures ---

function makeFantasyGuard(id: string, zone: string) {
  return {
    id, blueprintId: id, type: 'npc', name: `Guard ${id}`,
    tags: ['enemy', 'undead'],
    stats: { vigor: 5, instinct: 6, will: 3 },
    resources: { hp: 20, stamina: 8 },
    statuses: [],
    zoneId: zone,
    ai: { profileId: 'aggressive', goals: ['guard-crypt'], fears: ['fire'], alertLevel: 0, knowledge: {} },
  };
}

function makeCyberSentry(id: string, zone: string) {
  return {
    id, blueprintId: id, type: 'npc', name: `ICE ${id}`,
    tags: ['enemy', 'ice-agent'],
    stats: { chrome: 6, reflex: 5, netrunning: 3 },
    resources: { hp: 15, ice: 10 },
    statuses: [],
    zoneId: zone,
    ai: { profileId: 'aggressive', goals: ['guard-vault'], fears: [], alertLevel: 0, knowledge: {} },
  };
}

const fantasyPlayer = {
  id: 'player', blueprintId: 'player', type: 'player', name: 'Wanderer',
  tags: ['player'],
  stats: { vigor: 5, instinct: 4, will: 3 },
  resources: { hp: 20, stamina: 8 },
  statuses: [],
  zoneId: 'chapel',
};

const cyberPlayer = {
  id: 'runner', blueprintId: 'runner', type: 'player', name: 'Ghost',
  tags: ['player', 'netrunner'],
  stats: { chrome: 3, reflex: 5, netrunning: 7 },
  resources: { hp: 15, stamina: 6 },
  statuses: [],
  zoneId: 'alley',
};

const fantasyZones = [
  { id: 'chapel', roomId: 'ruins', name: 'Chapel', tags: ['sacred'], neighbors: ['crypt'] },
  { id: 'crypt', roomId: 'ruins', name: 'Crypt', tags: ['cursed'], neighbors: ['chapel'] },
];

const cyberZones = [
  { id: 'alley', roomId: 'block', name: 'Alley', tags: ['exterior'], neighbors: ['server'] },
  { id: 'server', roomId: 'block', name: 'Server Room', tags: ['networked'], neighbors: ['alley', 'vault'] },
  { id: 'vault', roomId: 'block', name: 'Data Vault', tags: ['secure'], neighbors: ['server'] },
];

// --- Fantasy Tests ---

describe('Phase 4 — Fantasy integration', () => {
  function createFantasyEngine() {
    return createTestEngine({
      modules: [
        createCognitionCore({ decay: { baseRate: 0.05, pruneThreshold: 0.05, instabilityFactor: 0.5 } }),
        createPerceptionFilter(),
        createEnvironmentCore(),
        createProgressionCore({ trees: [combatMasteryTree], rewards: [] }),
        createFactionCognition({
          factions: [{ factionId: 'crypt-undead', entityIds: ['ghoul_1', 'ghoul_2'], cohesion: 0.7 }],
        }),
        createRumorPropagation({ propagationDelay: 1 }),
        createSimulationInspector(),
      ],
      entities: [
        fantasyPlayer,
        makeFantasyGuard('ghoul_1', 'crypt'),
        makeFantasyGuard('ghoul_2', 'crypt'),
      ],
      zones: fantasyZones,
      playerId: 'player',
      startZone: 'chapel',
    });
  }

  test('combat in crypt generates rumors to crypt-undead faction', () => {
    const engine = createFantasyEngine();
    engine.drainEvents();

    // Move player to crypt
    engine.world.entities['player'].zoneId = 'crypt';

    // Attack ghoul_1
    engine.store.emitEvent('combat.contact.hit', {
      attackerId: 'player',
      targetId: 'ghoul_1',
      damage: 5,
    }, { actorId: 'player', targetIds: ['ghoul_1'] });

    // Rumors should be logged
    const rumors = getRumorLog(engine.world);
    expect(rumors.length).toBeGreaterThan(0);
    expect(rumors[0].targetFactionId).toBe('crypt-undead');
  });

  test('faction belief updates after rumor delivery', () => {
    const engine = createFantasyEngine();
    engine.drainEvents();

    engine.world.entities['player'].zoneId = 'crypt';

    engine.store.emitEvent('combat.contact.hit', {
      attackerId: 'player',
      targetId: 'ghoul_1',
      damage: 5,
    }, { actorId: 'player', targetIds: ['ghoul_1'] });

    // Advance past delay
    engine.submitAction('faction-tick');
    engine.submitAction('faction-tick');

    const factionCog = getFactionCognition(engine.world, 'crypt-undead');
    expect(factionBelieves(factionCog, 'player', 'hostile', true)).toBe(true);
    expect(factionCog.alertLevel).toBeGreaterThan(0);
  });

  test('knowledge decay reduces belief confidence over time', () => {
    const engine = createFantasyEngine();
    const cog = getCognition(engine.world, 'ghoul_1');
    setBelief(cog, 'player', 'hostile', true, 0.9, 'observed', 0);

    // Advance many ticks
    for (let i = 0; i < 10; i++) engine.store.advanceTick();
    engine.submitAction('cognition-tick');

    const belief = getBelief(cog, 'player', 'hostile');
    expect(belief).toBeDefined();
    expect(belief!.confidence).toBeLessThan(0.9);
  });

  test('reinforcing a belief prevents decay', () => {
    const engine = createFantasyEngine();
    const cog = getCognition(engine.world, 'ghoul_1');
    setBelief(cog, 'player', 'hostile', true, 0.8, 'observed', 0);

    for (let i = 0; i < 5; i++) engine.store.advanceTick();
    reinforceBelief(cog, 'player', 'hostile', engine.world.meta.tick);
    engine.store.advanceTick();
    engine.submitAction('cognition-tick');

    const belief = getBelief(cog, 'player', 'hostile');
    // Only 1 tick since reinforcement
    expect(belief!.confidence).toBeGreaterThan(0.7);
  });

  test('simulation inspector works on fantasy world', () => {
    const engine = createFantasyEngine();
    const cog = getCognition(engine.world, 'ghoul_1');
    setBelief(cog, 'player', 'hostile', true, 0.8, 'observed', 0);

    const entityInsp = inspectEntity(engine.world, 'ghoul_1');
    expect(entityInsp).not.toBeNull();
    expect(entityInsp!.faction).toBe('crypt-undead');
    expect(entityInsp!.cognition.beliefs).toHaveLength(1);

    const factionInsp = inspectFaction(engine.world, 'crypt-undead');
    expect(factionInsp).not.toBeNull();
    expect(factionInsp!.members).toContain('ghoul_1');
    expect(factionInsp!.members).toContain('ghoul_2');

    const snapshot = createSnapshot(engine.world);
    expect(Object.keys(snapshot.entities)).toContain('ghoul_1');
    expect(Object.keys(snapshot.factions)).toContain('crypt-undead');
  });
});

// --- Cyberpunk Tests ---

describe('Phase 4 — Cyberpunk integration', () => {
  function createCyberEngine() {
    return createTestEngine({
      modules: [
        createCognitionCore({ decay: { baseRate: 0.03, pruneThreshold: 0.05, instabilityFactor: 0.8 } }),
        createPerceptionFilter({ perceptionStat: 'reflex', senseStats: { network: 'netrunning' } }),
        createEnvironmentCore(),
        createProgressionCore({ trees: [netrunningTree], rewards: [] }),
        createFactionCognition({
          factions: [{ factionId: 'vault-ice', entityIds: ['sentry_1', 'sentry_2'], cohesion: 0.95 }],
        }),
        createRumorPropagation({ propagationDelay: 1, distortionPerHop: 0.03 }),
        createSimulationInspector(),
      ],
      entities: [
        cyberPlayer,
        makeCyberSentry('sentry_1', 'vault'),
        makeCyberSentry('sentry_2', 'server'),
      ],
      zones: cyberZones,
      playerId: 'runner',
      startZone: 'alley',
    });
  }

  test('ICE faction receives rumor from sentry', () => {
    const engine = createCyberEngine();
    engine.drainEvents();

    engine.world.entities['runner'].zoneId = 'vault';

    engine.store.emitEvent('combat.contact.hit', {
      attackerId: 'runner',
      targetId: 'sentry_1',
      damage: 4,
    }, { actorId: 'runner', targetIds: ['sentry_1'] });

    engine.submitAction('faction-tick');
    engine.submitAction('faction-tick');

    const factionCog = getFactionCognition(engine.world, 'vault-ice');
    expect(factionBelieves(factionCog, 'runner', 'hostile', true)).toBe(true);
    // High cohesion (0.95) means confidence stays high
    const belief = getFactionBelief(factionCog, 'runner', 'hostile');
    expect(belief!.confidence).toBeGreaterThan(0.5);
  });

  test('environmental noise increases rumor distortion', () => {
    const engine = createCyberEngine();
    engine.drainEvents();

    // Make vault very noisy
    setZoneProperty(engine.world, 'vault', 'noise', 10);
    engine.world.entities['runner'].zoneId = 'vault';

    engine.store.emitEvent('combat.contact.hit', {
      attackerId: 'runner',
      targetId: 'sentry_1',
      damage: 4,
    }, { actorId: 'runner', targetIds: ['sentry_1'] });

    const rumors = getRumorLog(engine.world);
    const rumorDistortion = rumors[0]?.distortion ?? 0;
    // Distortion should be higher than base (0.03) due to noise
    expect(rumorDistortion).toBeGreaterThan(0.03);
  });

  test('knowledge decay is faster in unstable environments', () => {
    const engine = createCyberEngine();
    const cog = getCognition(engine.world, 'sentry_1');
    setBelief(cog, 'runner', 'hostile', true, 0.8, 'observed', 0);

    // Make environment unstable
    setZoneProperty(engine.world, 'vault', 'noise', 8);

    for (let i = 0; i < 5; i++) engine.store.advanceTick();
    engine.submitAction('cognition-tick');

    const belief = getBelief(cog, 'runner', 'hostile');
    expect(belief).toBeDefined();
    // Should decay faster with instability
    expect(belief!.confidence).toBeLessThan(0.7);
  });

  test('cyberpunk inspector shows faction and beliefs', () => {
    const engine = createCyberEngine();
    const cog = getCognition(engine.world, 'sentry_1');
    setBelief(cog, 'runner', 'hostile', true, 0.9, 'observed', 0);

    const text = formatEntityInspection(inspectEntity(engine.world, 'sentry_1')!);
    expect(text).toContain('vault-ice');
    expect(text).toContain('hostile');
  });
});

// --- Cross-genre portability ---

describe('Phase 4 — Portability', () => {
  test('both starters have all Phase 4 modules loaded', () => {
    const fantasyEngine = createTestEngine({
      modules: [
        createCognitionCore(),
        createPerceptionFilter(),
        createEnvironmentCore(),
        createFactionCognition({ factions: [{ factionId: 'f1', entityIds: [] }] }),
        createRumorPropagation(),
        createSimulationInspector(),
      ],
      entities: [fantasyPlayer],
      zones: fantasyZones,
      playerId: 'player',
    });

    const cyberEngine = createTestEngine({
      modules: [
        createCognitionCore(),
        createPerceptionFilter({ perceptionStat: 'reflex' }),
        createEnvironmentCore(),
        createFactionCognition({ factions: [{ factionId: 'f1', entityIds: [] }] }),
        createRumorPropagation(),
        createSimulationInspector(),
      ],
      entities: [cyberPlayer],
      zones: cyberZones,
      playerId: 'runner',
    });

    // Both have faction-cognition
    expect(fantasyEngine.world.modules['faction-cognition']).toBeDefined();
    expect(cyberEngine.world.modules['faction-cognition']).toBeDefined();

    // Both have rumor-propagation
    expect(fantasyEngine.world.modules['rumor-propagation']).toBeDefined();
    expect(cyberEngine.world.modules['rumor-propagation']).toBeDefined();

    // Both have inspector
    expect(fantasyEngine.moduleManager.getInspectors().length).toBeGreaterThan(0);
    expect(cyberEngine.moduleManager.getInspectors().length).toBeGreaterThan(0);
  });
});
