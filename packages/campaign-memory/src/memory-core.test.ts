// memory-core proof — the live write side (F-6594b19b).
//
// Pin: a kill in a zone with a second NPC produces a journal row with that
// NPC in witnesses and a non-default relationship on their bank.
// Does not call consolidate (F-c1949ae0 left open).

import { describe, it, expect } from 'vitest';
import { Engine } from '@ai-rpg-engine/core';
import type { EntityState, GameManifest, ZoneState } from '@ai-rpg-engine/core';
import { createDefaultRelationship } from './types.js';
import {
  createCampaignMemoryCore,
  getCampaignJournal,
  getNpcMemory,
  CAMPAIGN_MEMORY_STATE_KEY,
} from './memory-core.js';

const manifest: GameManifest = {
  id: 'memory-proof',
  title: 'Memory Proof',
  version: '0.0.1',
  engineVersion: '0.1.0',
  ruleset: 'minimal',
  modules: ['campaign-memory-core'],
  contentPacks: [],
};

function npc(id: string, name: string, extra: Partial<EntityState> = {}): EntityState {
  return {
    id,
    blueprintId: id,
    type: 'npc',
    name,
    tags: [],
    stats: {},
    resources: { hp: 10, maxHp: 10 },
    statuses: [],
    zoneId: 'market',
    ...extra,
  };
}

function makeEngine(): Engine {
  const engine = new Engine({
    manifest,
    seed: 3,
    modules: [createCampaignMemoryCore()],
  });
  const zone: ZoneState = { id: 'market', roomId: 'market', name: 'Market', tags: [], neighbors: [] };
  engine.store.addZone(zone);
  engine.store.addEntity({
    id: 'player',
    blueprintId: 'player',
    type: 'player',
    name: 'Aldric',
    tags: ['player'],
    stats: {},
    resources: { hp: 20, maxHp: 20 },
    statuses: [],
    zoneId: 'market',
  });
  engine.store.addEntity(npc('merchant', 'Merchant'));
  engine.store.addEntity(npc('guard', 'Guard'));
  engine.store.state.playerId = 'player';
  engine.store.state.locationId = 'market';
  return engine;
}

describe('createCampaignMemoryCore — registration', () => {
  it('registers the persisted namespace default', () => {
    const engine = makeEngine();
    const state = engine.world.modules[CAMPAIGN_MEMORY_STATE_KEY] as { journal: unknown; banks: unknown };
    expect(state.journal).toEqual({ version: 1, records: [] });
    expect(state.banks).toEqual({});
  });
});

describe('F-6594b19b: a witnessed kill journals and moves relationship axes', () => {
  it('records the guard as a witness with a non-default relationship to the player', () => {
    const engine = makeEngine();
    engine.store.recordEvent({
      id: '',
      tick: 4,
      type: 'combat.entity.defeated',
      payload: {
        entityId: 'merchant',
        entityName: 'Merchant',
        defeatedBy: 'player',
        defeatedByName: 'Aldric',
        defeatZoneId: 'market',
        wasInterceptor: false,
      },
    });

    const journal = getCampaignJournal(engine.world);
    expect(journal.size()).toBe(1);
    const row = journal.query({ category: 'kill' })[0];
    expect(row).toBeDefined();
    expect(row!.actorId).toBe('player');
    expect(row!.targetId).toBe('merchant');
    expect(row!.witnesses).toContain('guard');
    expect(row!.witnesses).not.toContain('player');
    expect(row!.witnesses).not.toContain('merchant');

    const guard = getNpcMemory(engine.world, 'guard');
    expect(guard).toBeDefined();
    const rel = guard!.getRelationship('player');
    const defaults = createDefaultRelationship();
    expect(rel).not.toEqual(defaults);
    expect(rel.fear).toBeGreaterThan(defaults.fear);
    expect(rel.trust).toBeLessThan(defaults.trust);
    expect(guard!.recall({ aboutEntity: 'player' }).length).toBeGreaterThan(0);
  });

  it('round-trips journal + banks through Engine.serialize', () => {
    const engine = makeEngine();
    engine.store.recordEvent({
      id: '',
      tick: 4,
      type: 'combat.entity.defeated',
      payload: {
        entityId: 'merchant',
        entityName: 'Merchant',
        defeatedBy: 'player',
        defeatedByName: 'Aldric',
        defeatZoneId: 'market',
        wasInterceptor: false,
      },
    });
    const saved = engine.serialize();
    const restored = Engine.deserialize(saved, {
      modules: [createCampaignMemoryCore()],
    });
    expect(getCampaignJournal(restored.world).size()).toBe(1);
    expect(getNpcMemory(restored.world, 'guard')?.getRelationship('player').fear).toBeGreaterThan(0);
  });

  it('journals a gift with zone witnesses', () => {
    const engine = makeEngine();
    engine.store.recordEvent({
      id: '',
      tick: 8,
      type: 'campaign.gift',
      actorId: 'player',
      payload: { targetId: 'guard', zoneId: 'market' },
    });
    const row = getCampaignJournal(engine.world).query({ category: 'gift' })[0];
    expect(row).toBeDefined();
    expect(row!.witnesses).toContain('merchant');
    const guard = getNpcMemory(engine.world, 'guard');
    expect(guard?.getRelationship('player').trust).toBeGreaterThan(0);
  });
});
