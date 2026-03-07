import { describe, it, expect } from 'vitest';
import { Engine } from '@ai-rpg-engine/core';
import type { GameManifest, ZoneState, EntityState } from '@ai-rpg-engine/core';
import {
  traversalCore,
  combatCore,
  createCognitionCore,
  createPerceptionFilter,
  createEnvironmentCore,
  createFactionCognition,
  createRumorPropagation,
  createObserverPresentation,
  presentForObserver,
  presentForAllObservers,
  getDivergences,
  getEventDivergences,
  setBelief,
  getCognition,
} from './index.js';
import type { PresentationRule, ObserverPresentedEvent } from './index.js';

const manifest: GameManifest = {
  id: 'observer-test', title: '', version: '0.1.0',
  engineVersion: '0.1.0', ruleset: 'test', modules: [], contentPacks: [],
};

const zones: ZoneState[] = [
  { id: 'clearing', roomId: 'r1', name: 'Clearing', tags: [], neighbors: ['cave'], light: 7, stability: 5 },
  { id: 'cave', roomId: 'r1', name: 'Dark Cave', tags: [], neighbors: ['clearing'], light: 1, stability: 2 },
];

const player: EntityState = {
  id: 'player', blueprintId: 'p', type: 'player', name: 'Hero',
  tags: ['player'], stats: { vigor: 5, instinct: 5 }, resources: { hp: 20 },
  statuses: [], zoneId: 'clearing',
};

const friendlyNpc: EntityState = {
  id: 'ally', blueprintId: 'a', type: 'npc', name: 'Ally',
  tags: ['npc', 'friendly'], stats: { vigor: 3, instinct: 4 }, resources: { hp: 10 },
  statuses: [], zoneId: 'cave',
  ai: { profileId: 'cautious', goals: [], fears: [], alertLevel: 0, knowledge: {} },
};

const hostileGuard: EntityState = {
  id: 'guard', blueprintId: 'g', type: 'enemy', name: 'Guard',
  tags: ['enemy', 'undead'], stats: { vigor: 4, instinct: 3 }, resources: { hp: 15 },
  statuses: [], zoneId: 'cave',
  ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
};

// Custom presentation rule: undead tag frames all entry as "intrusion"
const undeadRule: PresentationRule = {
  id: 'undead-intrusion',
  eventPatterns: ['world.zone.entered'],
  priority: 10,
  condition: (_event, ctx) => ctx.observer.tags.includes('undead'),
  transform: (event, _ctx) => ({
    ...event,
    payload: {
      ...event.payload,
      _subjectiveDescription: 'the living dare to trespass',
      _undeadView: true,
    },
  }),
};

function createTestEngine(rules?: PresentationRule[]): Engine {
  const engine = new Engine({
    manifest,
    seed: 42,
    modules: [
      traversalCore,
      combatCore,
      createCognitionCore(),
      createPerceptionFilter(),
      createEnvironmentCore(),
      createFactionCognition({
        factions: [
          { factionId: 'crypt-guard', entityIds: ['guard'], cohesion: 0.8 },
        ],
      }),
      createRumorPropagation(),
      createObserverPresentation({ rules }),
    ],
  });

  for (const zone of zones) engine.store.addZone(zone);
  engine.store.addEntity({ ...player });
  engine.store.addEntity({ ...friendlyNpc });
  engine.store.addEntity({ ...hostileGuard });
  engine.store.state.playerId = 'player';
  engine.store.state.locationId = 'clearing';

  return engine;
}

describe('Observer Presentation', () => {
  it('presents event without rules applied when no conditions match', () => {
    const engine = createTestEngine();
    const events = engine.submitAction('move', { targetIds: ['cave'] });
    const moveEvent = engine.world.eventLog.find((e) => e.type === 'world.zone.entered');
    expect(moveEvent).toBeDefined();

    // The ally in cave has no undead tag, no hostile belief → should get basic presentation
    const presented = presentForObserver(moveEvent!, 'ally', engine.world);
    expect(presented._observerId).toBe('ally');
    // No custom rule matched for ally
    expect(presented._appliedRules.includes('undead-intrusion')).toBe(false);
  });

  it('applies custom rules based on observer tags', () => {
    const engine = createTestEngine([undeadRule]);
    const events = engine.submitAction('move', { targetIds: ['cave'] });
    const moveEvent = engine.world.eventLog.find((e) => e.type === 'world.zone.entered');

    // Guard is undead → should get undead-intrusion framing
    const presented = presentForObserver(moveEvent!, 'guard', engine.world, [undeadRule]);
    expect(presented._appliedRules).toContain('undead-intrusion');
    expect(presented.payload._undeadView).toBe(true);
    expect(presented.payload._subjectiveDescription).toBe('the living dare to trespass');
  });

  it('different observers get different presentations of the same event', () => {
    const engine = createTestEngine([undeadRule]);
    const events = engine.submitAction('move', { targetIds: ['cave'] });
    const moveEvent = engine.world.eventLog.find((e) => e.type === 'world.zone.entered');

    const allyView = presentForObserver(moveEvent!, 'ally', engine.world, [undeadRule]);
    const guardView = presentForObserver(moveEvent!, 'guard', engine.world, [undeadRule]);

    // Guard sees undead framing, ally does not
    expect(guardView.payload._undeadView).toBe(true);
    expect(allyView.payload._undeadView).toBeUndefined();
  });

  it('presentForAllObservers produces one version per AI entity', () => {
    const engine = createTestEngine([undeadRule]);
    engine.submitAction('move', { targetIds: ['cave'] });
    const moveEvent = engine.world.eventLog.find((e) => e.type === 'world.zone.entered');

    const allViews = presentForAllObservers(moveEvent!, engine.world);
    // Two AI entities: ally and guard
    expect(allViews.length).toBe(2);
    const ids = allViews.map((v) => v._observerId);
    expect(ids).toContain('ally');
    expect(ids).toContain('guard');
  });

  it('records divergences when rules are applied', () => {
    const engine = createTestEngine([undeadRule]);
    engine.submitAction('move', { targetIds: ['cave'] });
    const moveEvent = engine.world.eventLog.find((e) => e.type === 'world.zone.entered');

    // This triggers divergence recording
    presentForObserver(moveEvent!, 'guard', engine.world, [undeadRule]);

    const divergences = getDivergences(engine.world);
    expect(divergences.length).toBe(1);
    expect(divergences[0].observerId).toBe('guard');
    expect(divergences[0].appliedRules).toContain('undead-intrusion');
  });

  it('getEventDivergences filters by event', () => {
    const engine = createTestEngine([undeadRule]);
    engine.submitAction('move', { targetIds: ['cave'] });
    const moveEvent = engine.world.eventLog.find((e) => e.type === 'world.zone.entered');

    presentForObserver(moveEvent!, 'guard', engine.world, [undeadRule]);
    presentForObserver(moveEvent!, 'ally', engine.world, [undeadRule]);

    const divergences = getEventDivergences(engine.world, moveEvent!.id);
    // Guard has undead-intrusion applied, ally may have built-in rules
    expect(divergences.some((d) => d.observerId === 'guard')).toBe(true);
  });

  it('built-in hostile-faction-bias rule fires when observer believes actor hostile', () => {
    const engine = createTestEngine();
    // Give guard a hostile belief about the player
    const guardCog = getCognition(engine.world, 'guard');
    setBelief(guardCog, 'player', 'hostile', true, 0.9, 'observed', 0);

    engine.submitAction('move', { targetIds: ['cave'] });
    const moveEvent = engine.world.eventLog.find((e) => e.type === 'world.zone.entered');

    const guardView = presentForObserver(moveEvent!, 'guard', engine.world);
    expect(guardView._appliedRules).toContain('hostile-faction-bias');
    expect(guardView.payload._hostileBias).toBe(true);
  });

  it('handles non-existent observer gracefully', () => {
    const engine = createTestEngine();
    engine.submitAction('move', { targetIds: ['cave'] });
    const moveEvent = engine.world.eventLog.find((e) => e.type === 'world.zone.entered');

    const presented = presentForObserver(moveEvent!, 'nonexistent', engine.world);
    expect(presented._observerId).toBe('nonexistent');
    expect(presented._appliedRules.length).toBe(0);
  });
});
