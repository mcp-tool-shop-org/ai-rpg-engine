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

describe('F-3c4931ec: combat.companion.intercepted journals companion-saved-player with the interceptor as actor', () => {
  it('a witnessed intercept journals a non-kill companion-saved-player row with actorId = the interceptor, not the attacker', () => {
    const engine = makeEngine();
    // Shape verified against combat-core.ts:238-252. event.actorId mirrors
    // make-event.ts's action.actorId — the ORIGINAL ATTACKER ('player' here),
    // never the interceptor. If resolveActorTarget fell to the untouched
    // default, actorId would misattribute the save to 'player'.
    engine.store.recordEvent({
      id: '',
      tick: 5,
      type: 'combat.companion.intercepted',
      actorId: 'player',
      payload: {
        interceptorId: 'guard',
        interceptorName: 'Guard',
        targetId: 'merchant',
        targetName: 'Merchant',
        attackerId: 'player',
        damage: 4,
        interceptChance: 30,
        interceptorHpBefore: 10,
        interceptorHpAfter: 6,
        interceptorMaxHp: 10,
      },
    });

    const journal = getCampaignJournal(engine.world);
    expect(journal.query({ category: 'kill' })).toHaveLength(0);
    const row = journal.query({ category: 'companion-saved-player' })[0];
    expect(row).toBeDefined();
    expect(row!.actorId).toBe('guard');
    expect(row!.actorId).not.toBe('player');
    expect(row!.targetId).toBe('merchant');
    expect(row!.zoneId).toBe('market');
    expect(row!.description.toLowerCase()).toContain('intercept');

    // The saved entity (merchant, non-player) gains warmer feelings toward
    // the interceptor via the target-perspective branch (memory-core.ts:390-396).
    const merchant = getNpcMemory(engine.world, 'merchant');
    expect(merchant).toBeDefined();
    const rel = merchant!.getRelationship('guard');
    const defaults = createDefaultRelationship();
    expect(rel.trust).toBeGreaterThan(defaults.trust);
    expect(rel.admiration).toBeGreaterThan(defaults.admiration);
  });
});

describe('F-78337c0e: combat.companion.intercepted witnesses exclude the attacker', () => {
  it('a witnessed intercept moves a genuine bystander toward the interceptor but leaves the attacker untouched', () => {
    // Pin for F-78337c0e: recordLiveEvent's exclude set only ever held
    // actorId (the interceptor) and targetId (the saved entity) — never
    // payload.attackerId. combat-core.ts's ally-selection guard
    // (`e.id !== target.id && e.id !== attacker.id`) guarantees the
    // attacker is a THIRD entity, alive and in the same zone, so they
    // passed zoneOccupants' isAlive filter and landed in `witnesses`
    // alongside any genuine bystander — gaining the same admiring
    // trust/admiration bump for having just been the one dealing the blow.
    const engine = makeEngine();
    engine.store.addEntity(npc('bystander', 'Bystander'));
    engine.store.recordEvent({
      id: '',
      tick: 5,
      type: 'combat.companion.intercepted',
      actorId: 'player',
      payload: {
        interceptorId: 'guard',
        interceptorName: 'Guard',
        targetId: 'merchant',
        targetName: 'Merchant',
        attackerId: 'player',
        damage: 4,
        interceptChance: 30,
        interceptorHpBefore: 10,
        interceptorHpAfter: 6,
        interceptorMaxHp: 10,
      },
    });

    const row = getCampaignJournal(engine.world).query({ category: 'companion-saved-player' })[0];
    expect(row).toBeDefined();
    expect(row!.witnesses).toContain('bystander');
    expect(row!.witnesses).not.toContain('player');

    // A genuine bystander's bank moves toward the interceptor...
    const bystander = getNpcMemory(engine.world, 'bystander');
    expect(bystander).toBeDefined();
    const bystanderRel = bystander!.getRelationship('guard');
    const defaults = createDefaultRelationship();
    expect(bystanderRel.trust).toBeGreaterThan(defaults.trust);
    expect(bystanderRel.admiration).toBeGreaterThan(defaults.admiration);

    // ...but the attacker (payload.attackerId) — whose own blow was just
    // intercepted — must never be counted as an admiring onlooker: no bank
    // is ever opened for them via the witness path.
    expect(getNpcMemory(engine.world, 'player')).toBeUndefined();
  });
});

describe('F-908f2341: item.crafted/modified/repaired/salvaged journal item-transformed with a witness', () => {
  it('a successful craft in a populated zone journals a non-kill item-transformed row with a witness', () => {
    const engine = makeEngine();
    engine.store.recordEvent({
      id: '',
      tick: 7,
      type: 'item.crafted',
      actorId: 'guard',
      payload: {
        entityId: 'guard',
        recipeId: 'iron-dagger',
        recipeName: 'Iron Dagger',
        itemId: 'iron-dagger',
        chronicleDetail: 'Forged an iron dagger',
      },
    });

    const journal = getCampaignJournal(engine.world);
    expect(journal.query({ category: 'kill' })).toHaveLength(0);
    const row = journal.query({ category: 'item-transformed' })[0];
    expect(row).toBeDefined();
    expect(row!.actorId).toBe('guard');
    expect(row!.witnesses).toContain('player');
    expect(row!.witnesses).toContain('merchant');
    expect(row!.witnesses).not.toContain('guard');
    expect(row!.data).toMatchObject({ itemId: 'iron-dagger' });
    expect(row!.description.toLowerCase()).toContain('transform');
  });

  it('modified/repaired/salvaged also journal item-transformed', () => {
    const engine = makeEngine();
    const cases: Array<{ type: string; itemId: string }> = [
      { type: 'item.modified', itemId: 'gladius' },
      { type: 'item.repaired', itemId: 'gladius' },
      { type: 'item.salvaged', itemId: 'gladius' },
    ];
    cases.forEach(({ type, itemId }, i) => {
      engine.store.recordEvent({
        id: '',
        tick: 10 + i,
        type,
        actorId: 'player',
        payload: { entityId: 'player', itemId, chronicleDetail: `${type} event` },
      });
    });

    const rows = getCampaignJournal(engine.world).query({ category: 'item-transformed' });
    expect(rows).toHaveLength(3);
  });

  it('a non-player crafter gains no self-directed relationship entry (regression pin)', () => {
    // Left to the untouched default, resolveActorTarget would resolve
    // targetId to entityId (== actorId on all four crafting events), and the
    // target-perspective branch would give a non-player crafter a
    // relationship entry about themselves.
    const engine = makeEngine();
    engine.store.recordEvent({
      id: '',
      tick: 7,
      type: 'item.crafted',
      actorId: 'guard',
      payload: {
        entityId: 'guard',
        recipeId: 'iron-dagger',
        itemId: 'iron-dagger',
        chronicleDetail: 'Forged an iron dagger',
      },
    });

    // No target-perspective bank was ever opened for the crafter themselves.
    expect(getNpcMemory(engine.world, 'guard')).toBeUndefined();
  });
});

describe('F-32948b79/F-6a2e9f14: combat.encounter.cleared journals a combat row (wave-2 addendum)', () => {
  it('journals a combat-category row alongside the kill/death rows, not a kill/death row itself (category-mapping)', () => {
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
    // combat.entity.defeated only journals here — it never mutates hp.
    // Zero it to match modules' real ordering (the encounter-cleared check
    // runs after the victim's hp is already 0), so isAlive correctly
    // excludes the (dead) finalOpponent from witnesses below.
    engine.world.entities['merchant'].resources.hp = 0;
    engine.store.recordEvent({
      id: '',
      tick: 4,
      type: 'combat.encounter.cleared',
      actorId: 'player',
      payload: {
        zoneId: 'market',
        outcome: 'victory',
        finalDefeatEventId: 'evt-defeat-1',
        participants: {
          survivors: ['player', 'guard'],
          finalOpponent: { id: 'merchant', name: 'Merchant' },
        },
      },
      tags: ['combat', 'encounter', 'cleared'],
    });

    const journal = getCampaignJournal(engine.world);
    // No-regression: combat.entity.defeated's own kill/death rows are
    // untouched by the new mapping.
    expect(journal.query({ category: 'kill' })).toHaveLength(1);
    expect(journal.query({ category: 'death' })).toHaveLength(1);

    const row = journal.query({ category: 'combat' })[0];
    expect(row).toBeDefined();
    expect(row!.actorId).toBe('player');
    expect(row!.targetId).toBeUndefined();
    expect(row!.zoneId).toBe('market');
    expect(row!.witnesses).toContain('guard');
    expect(row!.witnesses).not.toContain('player');
    expect(row!.witnesses).not.toContain('merchant');
    expect(row!.description).toContain('Merchant');
  });

  it('carries payload.participants (survivors + finalOpponent) onto data, verbatim (attach)', () => {
    const engine = makeEngine();
    const participants = {
      survivors: ['player', 'guard'],
      finalOpponent: { id: 'merchant', name: 'Merchant' },
    };
    engine.store.recordEvent({
      id: '',
      tick: 6,
      type: 'combat.encounter.cleared',
      actorId: 'player',
      payload: {
        zoneId: 'market',
        outcome: 'victory',
        finalDefeatEventId: 'evt-defeat-2',
        participants,
      },
    });

    const row = getCampaignJournal(engine.world).query({ category: 'combat' })[0];
    expect(row).toBeDefined();
    // Carried verbatim off the payload — this module never re-derives
    // clearance (recomputes survivors/finalOpponent) itself.
    // F-860c77bb: stamp data.outcome when present (truthy-gated).
    expect(row!.data).toMatchObject({
      eventType: 'combat.encounter.cleared',
      participants,
      outcome: 'victory',
    });
  });

  it('omits data.participants and falls back to a generic description when the payload carries none (omit)', () => {
    const engine = makeEngine();
    expect(() =>
      engine.store.recordEvent({
        id: '',
        tick: 7,
        type: 'combat.encounter.cleared',
        actorId: 'player',
        payload: {
          zoneId: 'market',
          outcome: 'victory',
          finalDefeatEventId: 'evt-defeat-3',
        },
      }),
    ).not.toThrow();

    const row = getCampaignJournal(engine.world).query({ category: 'combat' })[0];
    expect(row).toBeDefined();
    // Truthy-gated: never a `participants: undefined` key.
    expect(row!.data).not.toHaveProperty('participants');
    expect(row!.data.outcome).toBe('victory');
    expect(row!.description).toBe('Aldric cleared the encounter');
  });
});

describe('F-21739f16: companion-joined / alliance journal CompanionState.originFaction', () => {
  function plantCompanionCore(
    engine: Engine,
    companions: Array<Record<string, unknown>>,
  ): void {
    // Duck-type the companion-core namespace (campaign-memory stays
    // modules-import-free). originFaction is a payload/namespace field the
    // modules producer emits; this package only reads it.
    engine.world.modules['companion-core'] = {
      companions,
      maxSize: 3,
      cohesion: 80,
    };
  }

  it('companion.recruited stamps data.originFaction from the payload, never payload.faction', () => {
    const engine = makeEngine();
    engine.world.entities['guard'].faction = 'heroes-guild';
    engine.store.recordEvent({
      id: '',
      tick: 10,
      type: 'companion.recruited',
      actorId: 'player',
      payload: {
        npcId: 'guard',
        npcName: 'Guard',
        role: 'diplomat',
        faction: 'heroes-guild',
        originFaction: 'castle-guard',
      },
    });

    const row = getCampaignJournal(engine.world).query({ category: 'companion-joined' })[0];
    expect(row).toBeDefined();
    expect(row!.targetId).toBe('guard');
    expect(row!.data.originFaction).toBe('castle-guard');
    expect(row!.data.originFaction).not.toBe('heroes-guild');
    expect(row!.data.partyFaction).toBe('heroes-guild');
  });

  it('omits data.originFaction when payload and companion-core both lack it (even if entity.faction is set)', () => {
    const engine = makeEngine();
    engine.world.entities['guard'].faction = 'heroes-guild';
    engine.store.recordEvent({
      id: '',
      tick: 10,
      type: 'companion.recruited',
      actorId: 'player',
      payload: { npcId: 'guard', npcName: 'Guard', role: 'tank', faction: 'heroes-guild' },
    });

    const row = getCampaignJournal(engine.world).query({ category: 'companion-joined' })[0];
    expect(row).toBeDefined();
    expect(row!.data).not.toHaveProperty('originFaction');
    expect(row!.data.partyFaction).toBe('heroes-guild');
  });

  it('falls back to duck-typed companion-core.originFaction when the payload omits it', () => {
    const engine = makeEngine();
    engine.world.entities['guard'].faction = 'heroes-guild';
    plantCompanionCore(engine, [
      {
        npcId: 'guard',
        role: 'diplomat',
        joinedAtTick: 10,
        abilityTags: [],
        morale: 80,
        active: true,
        originFaction: 'castle-guard',
      },
    ]);
    engine.store.recordEvent({
      id: '',
      tick: 10,
      type: 'companion.recruited',
      actorId: 'player',
      payload: { npcId: 'guard', npcName: 'Guard', role: 'diplomat', faction: 'heroes-guild' },
    });

    const row = getCampaignJournal(engine.world).query({ category: 'companion-joined' })[0];
    expect(row).toBeDefined();
    expect(row!.data.originFaction).toBe('castle-guard');
    expect(row!.data.originFaction).not.toBe(engine.world.entities['guard'].faction);
  });

  it('never reads post-recruit entity.faction as originFaction', () => {
    const engine = makeEngine();
    // Home-faction leftover on entity.faction must not become originFaction.
    engine.world.entities['guard'].faction = 'castle-guard';
    plantCompanionCore(engine, [
      {
        npcId: 'guard',
        role: 'diplomat',
        joinedAtTick: 10,
        abilityTags: [],
        morale: 80,
        active: true,
      },
    ]);
    engine.store.recordEvent({
      id: '',
      tick: 10,
      type: 'companion.recruited',
      actorId: 'player',
      payload: { npcId: 'guard', npcName: 'Guard', role: 'diplomat', faction: 'heroes-guild' },
    });

    const row = getCampaignJournal(engine.world).query({ category: 'companion-joined' })[0];
    expect(row).toBeDefined();
    expect(row!.data).not.toHaveProperty('originFaction');
  });

  it('alliance vs a companion originFaction stamps data.factionRouteNpcId', () => {
    const engine = makeEngine();
    engine.world.entities['guard'].faction = 'heroes-guild';
    plantCompanionCore(engine, [
      {
        npcId: 'guard',
        role: 'diplomat',
        joinedAtTick: 10,
        abilityTags: ['faction-route'],
        morale: 80,
        active: true,
        originFaction: 'castle-guard',
      },
    ]);
    engine.store.recordEvent({
      id: '',
      tick: 14,
      type: 'leverage.resolved',
      actorId: 'player',
      payload: {
        verb: 'diplomacy',
        subAction: 'temporary-alliance',
        actorId: 'player',
        targetFactionId: 'castle-guard',
        zoneId: 'market',
      },
    });

    const row = getCampaignJournal(engine.world).query({ category: 'alliance' })[0];
    expect(row).toBeDefined();
    expect(row!.data.originFaction).toBe('castle-guard');
    expect(row!.data.factionRouteNpcId).toBe('guard');
  });

  it('post-recruit entity.faction matching the alliance target does not stamp factionRouteNpcId', () => {
    const engine = makeEngine();
    // Recruit overwrote entity.faction to the party id. Matching that must
    // not count as "the guild they came from listened".
    engine.world.entities['guard'].faction = 'heroes-guild';
    plantCompanionCore(engine, [
      {
        npcId: 'guard',
        role: 'diplomat',
        joinedAtTick: 10,
        abilityTags: ['faction-route'],
        morale: 80,
        active: true,
        originFaction: 'castle-guard',
      },
    ]);
    engine.store.recordEvent({
      id: '',
      tick: 14,
      type: 'leverage.resolved',
      actorId: 'player',
      payload: {
        verb: 'diplomacy',
        subAction: 'temporary-alliance',
        actorId: 'player',
        targetFactionId: 'heroes-guild',
        zoneId: 'market',
      },
    });

    const row = getCampaignJournal(engine.world).query({ category: 'alliance' })[0];
    expect(row).toBeDefined();
    expect(row!.data).not.toHaveProperty('originFaction');
    expect(row!.data).not.toHaveProperty('factionRouteNpcId');
  });

  it('a matching entity.faction without originFaction does not stamp factionRouteNpcId', () => {
    const engine = makeEngine();
    engine.world.entities['guard'].faction = 'castle-guard';
    plantCompanionCore(engine, [
      {
        npcId: 'guard',
        role: 'diplomat',
        joinedAtTick: 10,
        abilityTags: ['faction-route'],
        morale: 80,
        active: true,
      },
    ]);
    engine.store.recordEvent({
      id: '',
      tick: 14,
      type: 'leverage.resolved',
      actorId: 'player',
      payload: {
        verb: 'diplomacy',
        subAction: 'temporary-alliance',
        actorId: 'player',
        targetFactionId: 'castle-guard',
        zoneId: 'market',
      },
    });

    const row = getCampaignJournal(engine.world).query({ category: 'alliance' })[0];
    expect(row).toBeDefined();
    expect(row!.data).not.toHaveProperty('originFaction');
    expect(row!.data).not.toHaveProperty('factionRouteNpcId');
  });
});

describe('F-860c77bb: combat.encounter.cleared retreat skip and outcome stamp', () => {
  const participants = {
    survivors: ['player', 'guard'],
    finalOpponent: { id: 'merchant', name: 'Merchant' },
  };

  it('outcome:retreat produces no combat row and opens no witness banks', () => {
    const engine = makeEngine();
    engine.store.recordEvent({
      id: '',
      tick: 6,
      type: 'combat.encounter.cleared',
      actorId: 'player',
      payload: {
        zoneId: 'market',
        outcome: 'retreat',
        participants,
      },
    });

    const journal = getCampaignJournal(engine.world);
    expect(journal.query({ category: 'combat' })).toHaveLength(0);
    expect(journal.size()).toBe(0);
    // Relationship-effects never run — no NpcMemoryBank for zone witnesses.
    expect(getNpcMemory(engine.world, 'guard')).toBeUndefined();
    expect(getNpcMemory(engine.world, 'merchant')).toBeUndefined();
  });

  it('omitted outcome still journals a combat row (legacy hosts)', () => {
    const engine = makeEngine();
    engine.store.recordEvent({
      id: '',
      tick: 7,
      type: 'combat.encounter.cleared',
      actorId: 'player',
      payload: {
        zoneId: 'market',
        participants,
      },
    });

    const row = getCampaignJournal(engine.world).query({ category: 'combat' })[0];
    expect(row).toBeDefined();
    expect(row!.data).not.toHaveProperty('outcome');
    expect(row!.description).toContain('cleared the encounter');
    expect(getNpcMemory(engine.world, 'guard')).toBeDefined();
  });
});
