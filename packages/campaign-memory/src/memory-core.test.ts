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
  formatNpcAttitudes,
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
    expect(journal.size()).toBe(2); // kill + death (F-34f5622c)
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
    expect(getCampaignJournal(restored.world).size()).toBe(2);
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

describe('F-34f5622c: live engine events journal beyond kill/gift/rescue/betrayal', () => {
  it('a give (item.acquired with fromEntityId) journals a gift row and moves trust', () => {
    const engine = makeEngine();
    engine.store.recordEvent({
      id: '',
      tick: 6,
      type: 'item.acquired',
      actorId: 'guard',
      payload: {
        itemId: 'chapel-lantern',
        entityId: 'guard',
        fromEntityId: 'player',
      },
    });

    const journal = getCampaignJournal(engine.world);
    expect(journal.query({ category: 'kill' })).toHaveLength(0);
    const row = journal.query({ category: 'gift' })[0];
    expect(row).toBeDefined();
    expect(row!.actorId).toBe('player');
    expect(row!.targetId).toBe('guard');
    expect(row!.witnesses).toContain('merchant');

    const guard = getNpcMemory(engine.world, 'guard');
    expect(guard?.getRelationship('player').trust).toBeGreaterThan(0);
  });

  it('combat.entity.defeated journals a death row for the victim', () => {
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
    const death = getCampaignJournal(engine.world).query({ category: 'death' })[0];
    expect(death).toBeDefined();
    expect(death!.targetId).toBe('merchant');
    expect(death!.actorId).toBe('player');
  });

  it('companion.recruited / companion.departed journal companion-* rows', () => {
    const engine = makeEngine();
    engine.store.recordEvent({
      id: '',
      tick: 10,
      type: 'companion.recruited',
      actorId: 'player',
      payload: { npcId: 'guard', npcName: 'Guard', role: 'tank' },
    });
    engine.store.recordEvent({
      id: '',
      tick: 12,
      type: 'companion.departed',
      actorId: 'player',
      payload: { npcId: 'guard', npcName: 'Guard', reason: 'left the party' },
    });
    expect(getCampaignJournal(engine.world).query({ category: 'companion-joined' })[0]?.targetId).toBe('guard');
    expect(getCampaignJournal(engine.world).query({ category: 'companion-departed' })[0]?.targetId).toBe('guard');
  });
});

describe('F-0df0c914: zone-enter and node-unlock journal discovery/action', () => {
  it('a player zone-enter in a populated zone journals a non-kill discovery row with a witness', () => {
    const engine = makeEngine();
    engine.store.addZone({ id: 'chapel', roomId: 'chapel', name: 'Chapel', tags: [], neighbors: [] });
    engine.store.addEntity(npc('priest', 'Priest', { zoneId: 'chapel' }));
    engine.store.recordEvent({
      id: '',
      tick: 3,
      type: 'world.zone.entered',
      actorId: 'player',
      payload: { zoneId: 'chapel', zoneName: 'Chapel' },
    });

    const journal = getCampaignJournal(engine.world);
    expect(journal.query({ category: 'kill' })).toHaveLength(0);
    const row = journal.query({ category: 'discovery' })[0];
    expect(row).toBeDefined();
    expect(row!.actorId).toBe('player');
    expect(row!.zoneId).toBe('chapel');
    expect(row!.witnesses).toContain('priest');
    expect(row!.witnesses).not.toContain('player');
    expect(row!.description).toContain('Chapel');
  });

  it('progression.node.unlocked journals an action row', () => {
    const engine = makeEngine();
    engine.store.recordEvent({
      id: '',
      tick: 5,
      type: 'progression.node.unlocked',
      actorId: 'player',
      payload: { treeId: 'combat-mastery', nodeId: 'toughened' },
    });
    const row = getCampaignJournal(engine.world).query({ category: 'action' })[0];
    expect(row).toBeDefined();
    expect(row!.actorId).toBe('player');
    expect(row!.description).toContain('toughened');
  });
});

describe('F-4b375c5d: item.recognized journals item-recognized with a witness', () => {
  it('a player zone-enter that emits item.recognized journals a non-kill item-recognized row with a witness', () => {
    const engine = makeEngine();
    engine.store.addZone({ id: 'chapel', roomId: 'chapel', name: 'Chapel', tags: [], neighbors: [] });
    engine.store.addEntity(npc('priest', 'Priest', { zoneId: 'chapel' }));
    engine.store.recordEvent({
      id: '',
      tick: 3,
      type: 'world.zone.entered',
      actorId: 'player',
      payload: { zoneId: 'chapel', zoneName: 'Chapel', entityId: 'player' },
    });
    engine.store.recordEvent({
      id: '',
      tick: 3,
      type: 'item.recognized',
      actorId: 'player',
      payload: {
        itemId: 'stolen-seal',
        itemName: 'Stolen Seal',
        recognitionType: 'stolen',
        stanceDelta: -1,
        narratorHint: 'the priest clocks the stolen seal',
        factionId: 'chapel',
        zoneId: 'chapel',
      },
    });

    const journal = getCampaignJournal(engine.world);
    expect(journal.query({ category: 'kill' })).toHaveLength(0);
    const row = journal.query({ category: 'item-recognized' })[0];
    expect(row).toBeDefined();
    expect(row!.actorId).toBe('player');
    expect(row!.zoneId).toBe('chapel');
    expect(row!.witnesses).toContain('priest');
    expect(row!.witnesses).not.toContain('player');
    expect(row!.description).toContain('Stolen Seal');

    const priest = getNpcMemory(engine.world, 'priest');
    expect(priest).toBeDefined();
    expect(priest!.getRelationship('player').familiarity).toBeGreaterThan(0);
  });
});

describe('F-385c6d86: leverage.resolved alliance verbs journal alliance', () => {
  it('a successful diplomacy.temporary-alliance in a populated zone journals a non-kill alliance row with a witness', () => {
    const engine = makeEngine();
    engine.store.recordEvent({
      id: '',
      tick: 8,
      type: 'leverage.resolved',
      actorId: 'player',
      payload: {
        verb: 'diplomacy',
        subAction: 'temporary-alliance',
        actorId: 'player',
        targetFactionId: 'market-guild',
        effects: [],
        narratorHint: 'a temporary alliance is struck',
        zoneId: 'market',
      },
    });

    const journal = getCampaignJournal(engine.world);
    expect(journal.query({ category: 'kill' })).toHaveLength(0);
    const row = journal.query({ category: 'alliance' })[0];
    expect(row).toBeDefined();
    expect(row!.actorId).toBe('player');
    expect(row!.targetId).toBe('market-guild');
    expect(row!.witnesses).toContain('merchant');
    expect(row!.witnesses).not.toContain('player');
    expect(row!.description.toLowerCase()).toContain('alliance');

    const merchant = getNpcMemory(engine.world, 'merchant');
    expect(merchant).toBeDefined();
    expect(merchant!.getRelationship('player').trust).toBeGreaterThan(0);
  });

  it('broker-truce and recruit-ally also journal alliance; other subActions do not', () => {
    const engine = makeEngine();
    engine.store.recordEvent({
      id: '',
      tick: 9,
      type: 'leverage.resolved',
      actorId: 'player',
      payload: { verb: 'diplomacy', subAction: 'broker-truce', actorId: 'player', targetFactionId: 'wardens' },
    });
    engine.store.recordEvent({
      id: '',
      tick: 10,
      type: 'leverage.resolved',
      actorId: 'player',
      payload: { verb: 'social', subAction: 'recruit-ally', actorId: 'player', targetId: 'guard' },
    });
    engine.store.recordEvent({
      id: '',
      tick: 11,
      type: 'leverage.resolved',
      actorId: 'player',
      payload: { verb: 'sabotage', subAction: 'sabotage-supply', actorId: 'player', targetFactionId: 'wardens' },
    });

    const alliances = getCampaignJournal(engine.world).query({ category: 'alliance' });
    expect(alliances).toHaveLength(2);
    expect(alliances.map((r) => r.targetId).sort()).toEqual(['guard', 'wardens']);
  });
});

describe('F-d1973aae: NPC attitude copies onto EntityState.relations', () => {
  it('a witnessed kill leaves the witness entity relations non-default without getNpcMemory', () => {
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

    const guard = engine.world.entities['guard'];
    expect(guard.relations).toBeDefined();
    expect(guard.relations!.player).not.toBe(0);
    expect(guard.custom?.['rel.player.fear']).toBeGreaterThan(0);

    const lines = formatNpcAttitudes(engine.world);
    expect(lines.some((line) => line.includes('Guard') && line.includes('Aldric'))).toBe(true);
  });
});
