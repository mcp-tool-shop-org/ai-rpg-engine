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
  createBeliefProvenance,
  traceEntityBelief,
  traceFactionBelief,
  traceSubject,
  formatBeliefTrace,
  setBelief,
  getCognition,
} from './index.js';

const manifest: GameManifest = {
  id: 'provenance-test', title: '', version: '0.1.0',
  engineVersion: '0.1.0', ruleset: 'test', modules: [], contentPacks: [],
};

const zones: ZoneState[] = [
  { id: 'hall', roomId: 'r1', name: 'Hall', tags: [], neighbors: ['chamber'], light: 5 },
  { id: 'chamber', roomId: 'r1', name: 'Chamber', tags: [], neighbors: ['hall'], light: 3 },
];

const player: EntityState = {
  id: 'player', blueprintId: 'p', type: 'player', name: 'Player',
  tags: ['player'], stats: { vigor: 5, instinct: 6 }, resources: { hp: 20, stamina: 8 },
  statuses: [], zoneId: 'hall',
};

const guard: EntityState = {
  id: 'guard', blueprintId: 'g', type: 'enemy', name: 'Guard',
  tags: ['enemy'], stats: { vigor: 4, instinct: 5 }, resources: { hp: 15, stamina: 4 },
  statuses: [], zoneId: 'chamber',
  ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
};

function createTestEngine(): Engine {
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
        factions: [{ factionId: 'patrol', entityIds: ['guard'], cohesion: 0.9 }],
      }),
      createRumorPropagation({ propagationDelay: 1 }),
      createBeliefProvenance(),
    ],
  });

  for (const zone of zones) engine.store.addZone(zone);
  engine.store.addEntity({ ...player });
  engine.store.addEntity({ ...guard });
  engine.store.state.playerId = 'player';
  engine.store.state.locationId = 'hall';

  return engine;
}

describe('Belief Provenance', () => {
  it('traces direct perception belief', () => {
    const engine = createTestEngine();

    // Player enters guard's zone → guard perceives player
    engine.submitAction('move', { targetIds: ['chamber'] });

    const trace = traceEntityBelief(engine.world, 'guard', 'player', 'present');
    expect(trace.holder).toEqual({ type: 'entity', id: 'guard' });
    expect(trace.subject).toBe('player');
    expect(trace.key).toBe('present');
    expect(trace.currentValue).toBe(true);
    expect(trace.chain.length).toBeGreaterThan(0);

    // Should have source-event and perceived steps
    const types = trace.chain.map((s) => s.type);
    expect(types).toContain('source-event');
    expect(types).toContain('belief-formed');
  });

  it('traces combat belief through perception', () => {
    const engine = createTestEngine();
    engine.store.state.entities['player'].zoneId = 'chamber';
    engine.store.state.locationId = 'chamber';

    engine.submitAction('attack', { targetIds: ['guard'] });

    const trace = traceEntityBelief(engine.world, 'guard', 'player', 'hostile');
    expect(trace.currentValue).toBe(true);
    expect(trace.currentConfidence).toBeGreaterThan(0);
    expect(trace.chain.some((s) => s.type === 'source-event')).toBe(true);
    expect(trace.chain.some((s) => s.type === 'belief-formed')).toBe(true);
  });

  it('traces faction belief through rumor chain', () => {
    const engine = createTestEngine();
    engine.store.state.entities['player'].zoneId = 'chamber';
    engine.store.state.locationId = 'chamber';

    // Attack guard → guard gets hostile belief → rumor scheduled
    engine.submitAction('attack', { targetIds: ['guard'] });
    // Advance ticks to deliver rumor
    engine.submitAction('faction-tick');
    engine.submitAction('faction-tick');

    const trace = traceFactionBelief(engine.world, 'patrol', 'player', 'hostile');
    expect(trace.holder).toEqual({ type: 'faction', id: 'patrol' });
    expect(trace.currentValue).toBe(true);
    expect(trace.currentConfidence).toBeGreaterThan(0);

    const types = trace.chain.map((s) => s.type);
    expect(types).toContain('rumor-scheduled');
    expect(types).toContain('rumor-delivered');
    expect(types).toContain('faction-belief-updated');
  });

  it('traceSubject finds all beliefs about a subject', () => {
    const engine = createTestEngine();
    engine.store.state.entities['player'].zoneId = 'chamber';
    engine.store.state.locationId = 'chamber';

    engine.submitAction('attack', { targetIds: ['guard'] });
    engine.submitAction('faction-tick');
    engine.submitAction('faction-tick');

    const traces = traceSubject(engine.world, 'player');
    expect(traces.length).toBeGreaterThan(0);

    // Should have both entity and faction traces
    const entityTraces = traces.filter((t) => t.holder.type === 'entity');
    const factionTraces = traces.filter((t) => t.holder.type === 'faction');
    expect(entityTraces.length).toBeGreaterThan(0);
    expect(factionTraces.length).toBeGreaterThan(0);
  });

  it('formatBeliefTrace produces readable output', () => {
    const engine = createTestEngine();
    engine.store.state.entities['player'].zoneId = 'chamber';
    engine.store.state.locationId = 'chamber';

    engine.submitAction('attack', { targetIds: ['guard'] });

    const trace = traceEntityBelief(engine.world, 'guard', 'player', 'hostile');
    const formatted = formatBeliefTrace(trace);

    expect(formatted).toContain('Belief Trace: Entity guard');
    expect(formatted).toContain('Subject: player');
    expect(formatted).toContain('Key: hostile');
    expect(formatted).toContain('Chain:');
    expect(formatted).toContain('EVENT');
  });

  it('handles missing belief gracefully', () => {
    const engine = createTestEngine();
    const trace = traceEntityBelief(engine.world, 'guard', 'nonexistent', 'unknown');

    expect(trace.currentValue).toBeUndefined();
    expect(trace.currentConfidence).toBe(0);
    expect(trace.chain.length).toBe(0);
  });

  it('chain is sorted chronologically', () => {
    const engine = createTestEngine();
    engine.store.state.entities['player'].zoneId = 'chamber';
    engine.store.state.locationId = 'chamber';

    engine.submitAction('attack', { targetIds: ['guard'] });

    const trace = traceEntityBelief(engine.world, 'guard', 'player', 'hostile');
    for (let i = 1; i < trace.chain.length; i++) {
      expect(trace.chain[i].tick).toBeGreaterThanOrEqual(trace.chain[i - 1].tick);
    }
  });
});
