// faction-fallback.test.ts — the resolveEntityFaction family (wave-4 stitch).
//
// getEntityFaction reads faction-cognition's membership registry, populated
// ONLY by an explicit createFactionCognition({ factions }) registration that
// ZERO of the 12 shipped starters perform — so every consumer below was
// faction-blind (or worse, inverted) in every shipped pack. These tests author
// the shipped-starter reality on purpose: entity.faction ONLY, no
// createFactionCognition registration anywhere except the one registry-wins
// test. Each test was written RED against the pre-fallback tree.
//
// observer-presentation hostility now routes through affiliationOf
// (F-a07b5524) rather than the module-gated getEntityFaction inequality.
// inspectFaction remains a registry-state inspector (correctly module-gated).
// belief-provenance: unused import removed, no call site.

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import {
  createCognitionCore,
  createPerceptionFilter,
  createEnvironmentCore,
  createFactionCognition,
  createRumorPropagation,
  createDistrictCore,
  createCompanionCore,
  resolveEntityFaction,
  getDistrictState,
  getRumorLog,
  getPartyState,
  composeLeverageModifiers,
  resolveNpcAction,
  inspectEntity,
} from './index.js';
import type { DistrictDefinition } from './index.js';

const zones = [
  { id: 'courtyard', roomId: 'castle', name: 'Courtyard', tags: [], neighbors: ['gatehouse'] },
  { id: 'gatehouse', roomId: 'castle', name: 'Gatehouse', tags: [], neighbors: ['courtyard'] },
];

function npc(id: string, zone: string, faction?: string) {
  return {
    id,
    blueprintId: id,
    type: 'npc',
    name: `NPC ${id}`,
    tags: ['npc'],
    ...(faction ? { faction } : {}),
    stats: { vigor: 5, instinct: 8, will: 4 },
    resources: { hp: 20, stamina: 10 },
    statuses: [],
    zoneId: zone,
    ai: { profileId: 'aggressive', goals: ['guard'], fears: [], alertLevel: 0, knowledge: {} },
  };
}

const player = {
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 7, instinct: 5, will: 5 },
  resources: { hp: 30, stamina: 15 },
  statuses: [],
  zoneId: 'courtyard',
};

const district: DistrictDefinition = {
  id: 'castle-district',
  name: 'Castle District',
  tags: [],
  zoneIds: ['courtyard', 'gatehouse'],
  controllingFaction: 'castle-guard',
} as DistrictDefinition;

describe('resolveEntityFaction (the helper)', () => {
  it('falls back to entity.faction when no registry is populated', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore()],
      entities: [player, npc('guard_1', 'courtyard', 'castle-guard')],
      zones,
      playerId: 'player',
      startZone: 'courtyard',
    });
    expect(resolveEntityFaction(engine.world, 'guard_1')).toBe('castle-guard');
    expect(resolveEntityFaction(engine.world, 'player')).toBeUndefined();
  });

  it('the registry wins over entity.faction when both exist', () => {
    const engine = createTestEngine({
      modules: [
        createCognitionCore(),
        createFactionCognition({ factions: [{ factionId: 'inner-circle', entityIds: ['guard_1'] }] }),
      ],
      entities: [player, npc('guard_1', 'courtyard', 'castle-guard')],
      zones,
      playerId: 'player',
      startZone: 'courtyard',
    });
    expect(resolveEntityFaction(engine.world, 'guard_1')).toBe('inner-circle');
  });
});

describe('district-core × entity.faction (F-family: intruder inversion + dead surveillance)', () => {
  function districtEngine() {
    return createTestEngine({
      modules: [
        createCognitionCore(),
        createEnvironmentCore(),
        createDistrictCore({ districts: [district] }),
      ],
      entities: [
        player,
        npc('guard_1', 'courtyard', 'castle-guard'),
        npc('stranger', 'courtyard', 'gallows-crowd'),
      ],
      zones,
      playerId: 'player',
      startZone: 'courtyard',
    });
  }

  it('a controlling-faction member entering does NOT raise intruder likelihood', () => {
    const engine = districtEngine();
    engine.store.emitEvent('world.zone.entered', { zoneId: 'courtyard' }, { actorId: 'guard_1' });
    const state = getDistrictState(engine.world, 'castle-district');
    expect(state!.intruderLikelihood).toBe(0);
  });

  it('a non-member entering DOES raise intruder likelihood', () => {
    const engine = districtEngine();
    engine.store.emitEvent('world.zone.entered', { zoneId: 'courtyard' }, { actorId: 'stranger' });
    const state = getDistrictState(engine.world, 'castle-district');
    expect(state!.intruderLikelihood).toBe(10);
  });

  it('surveillance counts entity.faction members present in district zones', () => {
    const engine = districtEngine();
    engine.submitAction('district-tick');
    const state = getDistrictState(engine.world, 'castle-district');
    expect(state!.surveillance).toBe(15);
  });
});

describe('rumor-propagation × entity.faction (the dead loop)', () => {
  it('with faction-cognition registered but EMPTY, entity.faction still propagates a faction rumor', () => {
    const engine = createTestEngine({
      modules: [
        createCognitionCore(),
        createPerceptionFilter(),
        createEnvironmentCore(),
        createFactionCognition({ factions: [] }),
        createRumorPropagation({ propagationDelay: 2 }),
      ],
      entities: [player, npc('guard_1', 'courtyard', 'castle-guard')],
      zones,
      playerId: 'player',
      startZone: 'courtyard',
    });
    engine.drainEvents();
    engine.store.emitEvent('combat.contact.hit', {
      attackerId: 'player',
      targetId: 'guard_1',
      damage: 5,
    }, { actorId: 'player', targetIds: ['guard_1'] });

    const rumors = getRumorLog(engine.world);
    expect(rumors.length).toBeGreaterThan(0);
    expect(rumors[0].targetFactionId).toBe('castle-guard');
  });

  it('F-7911928d: rumor-propagation registers WITHOUT faction-cognition and still keys off entity.faction', () => {
    const engine = createTestEngine({
      modules: [
        createCognitionCore(),
        createPerceptionFilter(),
        createEnvironmentCore(),
        createRumorPropagation({ propagationDelay: 2 }),
      ],
      entities: [player, npc('guard_1', 'courtyard', 'castle-guard')],
      zones,
      playerId: 'player',
      startZone: 'courtyard',
    });
    engine.drainEvents();
    engine.store.emitEvent('combat.contact.hit', {
      attackerId: 'player',
      targetId: 'guard_1',
      damage: 5,
    }, { actorId: 'player', targetIds: ['guard_1'] });

    const rumors = getRumorLog(engine.world);
    expect(rumors.length).toBeGreaterThan(0);
    expect(rumors[0].targetFactionId).toBe('castle-guard');
  });
});

describe('npc-agency × entity.faction (accuse reputation effects)', () => {
  it("an accuse action's faction effects key off the NPC's entity.faction", () => {
    const engine = createTestEngine({
      modules: [createCognitionCore()],
      entities: [player, npc('guard_1', 'courtyard', 'castle-guard')],
      zones,
      playerId: 'player',
      startZone: 'courtyard',
    });
    const result = resolveNpcAction(
      { npcId: 'guard_1', verb: 'accuse', targetEntityId: 'player', description: 'points at the intruder' },
      engine.world,
    );
    const rep = result.effects.find((e) => e.type === 'reputation');
    expect(rep).toBeDefined();
    expect((rep as { factionId: string }).factionId).toBe('castle-guard');
  });
});

describe('leverage-modifiers × originFaction (companion faction-route bonus, F-14feff64)', () => {
  it("a faction-route companion's originFaction (the guild they came from) yields the reputation bonus, not the shared party faction", () => {
    const engine = createTestEngine({
      modules: [createCognitionCore(), createCompanionCore()],
      entities: [
        { ...player, faction: 'heroes-guild' },
        { ...npc('emissary', 'courtyard', 'castle-guard'), tags: ['npc', 'recruitable'] },
      ],
      zones,
      playerId: 'player',
      startZone: 'courtyard',
    });
    engine.submitAction('recruit', { targetIds: ['emissary'] });
    const party = getPartyState(engine.world);
    expect(party.companions).toHaveLength(1);
    expect(engine.world.entities['emissary'].faction).toBe('heroes-guild');
    expect(party.companions[0].originFaction).toBe('castle-guard');
    const raw = engine.world.modules['companion-core'] as { companions: Array<{ abilityTags: string[] }> };
    raw.companions[0].abilityTags = ['faction-route'];

    const home = composeLeverageModifiers(engine.world, engine.world.entities['player'], 'castle-guard');
    expect(home.companionReputationBonus?.amount).toBe(10);
    const partyFaction = composeLeverageModifiers(engine.world, engine.world.entities['player'], 'heroes-guild');
    expect(partyFaction.companionReputationBonus).toBeUndefined();
  });
});

describe('simulation-inspector × entity.faction', () => {
  it('inspectEntity reports the entity.faction instead of undefined', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore()],
      entities: [player, npc('guard_1', 'courtyard', 'castle-guard')],
      zones,
      playerId: 'player',
      startZone: 'courtyard',
    });
    const inspection = inspectEntity(engine.world, 'guard_1');
    expect(inspection?.faction).toBe('castle-guard');
  });
});
