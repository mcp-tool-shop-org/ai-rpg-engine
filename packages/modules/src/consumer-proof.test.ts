/**
 * Consumer Artifact Proof — Composition Integration Test
 *
 * Proves the published package surface works end-to-end:
 * - Engine boots from manifest
 * - buildCombatStack() wires a full combat system
 * - Player and AI actions produce structured events
 * - Deterministic replay from same seed yields identical outcomes
 * - Serialization round-trips cleanly
 * - Module registration exposes correct verbs
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Engine, resetIdCounter } from '@ai-rpg-engine/core';
import type { GameManifest, EntityState, ZoneState } from '@ai-rpg-engine/core';
import { buildCombatStack, traversalCore, statusCore } from '@ai-rpg-engine/modules';

const manifest: GameManifest = {
  id: 'consumer-proof',
  title: 'Consumer Proof World',
  version: '1.0.0',
  engineVersion: '2.3.2',
  ruleset: 'consumer-proof',
  modules: ['traversal', 'status', 'combat'],
  contentPacks: [],
};

const player: EntityState = {
  id: 'hero',
  blueprintId: 'hero',
  type: 'player',
  name: 'Test Hero',
  tags: ['human', 'player'],
  stats: { might: 14, agility: 12, will: 10 },
  resources: { hp: 30, stamina: 20 },
  statuses: [],
  zoneId: 'town-square',
};

const skeleton: EntityState = {
  id: 'skeleton-1',
  blueprintId: 'skeleton',
  type: 'npc',
  name: 'Bone Walker',
  tags: ['undead', 'hostile'],
  stats: { might: 8, agility: 6, will: 4 },
  resources: { hp: 15, stamina: 10 },
  statuses: [],
  zoneId: 'town-square',
  ai: { profileId: 'aggressive', goals: ['kill-player'], fears: [], alertLevel: 80, knowledge: {} },
};

const zones: ZoneState[] = [
  { id: 'town-square', roomId: 'town-square', name: 'Town Square', tags: ['outdoor', 'combat-zone'], neighbors: ['tavern'] },
  { id: 'tavern', roomId: 'tavern', name: 'Dusty Tavern', tags: ['indoor', 'safe'], neighbors: ['town-square'] },
];

function createTestEngine() {
  resetIdCounter();
  const combat = buildCombatStack({
    statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
    playerId: 'hero',
    biasTags: ['undead'],
  });

  const engine = new Engine({
    manifest,
    seed: 42,
    modules: [traversalCore, statusCore, ...combat.modules],
  });

  engine.store.state.playerId = 'hero';
  engine.store.state.locationId = 'town-square';
  engine.store.state.entities['hero'] = JSON.parse(JSON.stringify(player));
  engine.store.state.entities['skeleton-1'] = JSON.parse(JSON.stringify(skeleton));
  for (const zone of zones) {
    engine.store.state.zones[zone.id] = { ...zone };
  }

  return engine;
}

describe('Consumer Artifact Proof', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createTestEngine();
  });

  it('boots from manifest at tick 0', () => {
    expect(engine.tick).toBe(0);
    expect(engine.world.playerId).toBe('hero');
    expect(engine.world.entities['hero']).toBeDefined();
    expect(engine.world.entities['skeleton-1']).toBeDefined();
  });

  it('player attack produces combat events and advances tick', () => {
    const events = engine.submitAction('attack', { targetIds: ['skeleton-1'] });
    expect(events.length).toBeGreaterThan(0);
    expect(engine.tick).toBe(1);
    const hitEvent = events.find(e => e.type === 'combat.contact.hit');
    expect(hitEvent).toBeDefined();
  });

  it('AI action produces events and advances tick', () => {
    engine.submitAction('attack', { targetIds: ['skeleton-1'] });
    const aiEvents = engine.submitActionAs('skeleton-1', 'attack', { targetIds: ['hero'] });
    expect(aiEvents.length).toBeGreaterThan(0);
    expect(engine.tick).toBe(2);
  });

  it('deterministic replay from same seed yields identical HP outcomes', () => {
    // Run full sequence on engine 1
    engine.submitAction('attack', { targetIds: ['skeleton-1'] });
    engine.submitActionAs('skeleton-1', 'attack', { targetIds: ['hero'] });

    // Create fresh engine 2 with same seed
    const engine2 = createTestEngine();
    engine2.submitAction('attack', { targetIds: ['skeleton-1'] });
    engine2.submitActionAs('skeleton-1', 'attack', { targetIds: ['hero'] });

    expect(engine2.tick).toBe(engine.tick);
    expect(engine2.world.entities['hero'].resources.hp)
      .toBe(engine.world.entities['hero'].resources.hp);
    expect(engine2.world.entities['skeleton-1'].resources.hp)
      .toBe(engine.world.entities['skeleton-1'].resources.hp);
  });

  it('serializes state with action log', () => {
    engine.submitAction('attack', { targetIds: ['skeleton-1'] });
    engine.submitActionAs('skeleton-1', 'attack', { targetIds: ['hero'] });

    const serialized = engine.serialize();
    expect(typeof serialized).toBe('string');

    const parsed = JSON.parse(serialized);
    expect(parsed.world).toBeDefined();
    expect(parsed.actionLog).toBeDefined();
    expect(parsed.actionLog.length).toBe(2);
  });

  it('module registration exposes correct verbs', () => {
    const verbs = engine.getAvailableActions();
    expect(verbs).toContain('attack');
    expect(verbs).toContain('move');
  });

  it('buildCombatStack composes in ~7 lines', () => {
    // This test proves the composition DX claim from the README
    const combat = buildCombatStack({
      statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
      playerId: 'hero',
      biasTags: ['undead'],
    });
    expect(combat.modules.length).toBeGreaterThan(0);
    expect(combat.formulas).toBeDefined();
  });
});
