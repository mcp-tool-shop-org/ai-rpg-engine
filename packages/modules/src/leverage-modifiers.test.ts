// The joint modifier-threading wave (companion-core.ts's own v2.8 deferral),
// tested the way this cycle's thesis demands: a modifier that is computed and
// consumed by nothing is indistinguishable from a modifier that does not
// exist, so every field here gets a CONSEQUENCE test (the modifier is present
// => a number moves) and a NEGATIVE CONTROL (the modifier is absent => the
// baseline is byte-identical).
//
// The negative controls are the load-bearing half. Juul & Begy 2016 (Good
// Feedback for Bad Players?) is why: two mechanically identical builds
// differing only in feedback were rated differently as GAMES, so "the number
// changed" and "the player can tell the number changed" are separate claims
// and both need proving. A consequence test alone would pass on a world where
// the modifier always applies, which is not a modifier at all.

import { describe, it, expect } from 'vitest';
import type { EntityState, WorldState } from '@ai-rpg-engine/core';
import { composeLeverageModifiers } from './leverage-modifiers.js';
import { resolveSocialAction, type LeverageState } from './player-leverage.js';
import { setPartyState, createPartyState, type PartyState } from './companion-core.js';

const PLAYER_ID = 'player';

function bareWorld(): WorldState {
  return {
    meta: {
      worldId: 'w', gameId: 'g', saveVersion: '1.0.0', tick: 0, seed: 1,
      activeRuleset: 'r', activeModules: [], idCounter: 0,
    },
    playerId: PLAYER_ID,
    locationId: 'zone-a',
    entities: {
      [PLAYER_ID]: {
        id: PLAYER_ID, blueprintId: PLAYER_ID, type: 'player', name: 'Player',
        tags: [], stats: {}, resources: {}, statuses: [], zoneId: 'zone-a',
      },
    },
    zones: {}, quests: {}, factions: {}, globals: {}, modules: {}, eventLog: [], pending: [],
  } as unknown as WorldState;
}

function player(world: WorldState): EntityState {
  return world.entities[PLAYER_ID];
}

const RICH: LeverageState = {
  favor: 100, debt: 100, blackmail: 100, influence: 100, heat: 0, legitimacy: 100,
};

/** A party whose abilities grant a leverage-cost discount. */
function partyWithFixer(): PartyState {
  const party = createPartyState();
  party.companions.push({
    npcId: 'smuggler-vale',
    role: 'smuggler',
    joinedAtTick: 0,
    abilityTags: ['intimidation-backup', 'smuggling-contact'],
    morale: 70,
    active: true,
  });
  return party;
}

function costOf(resolution: ReturnType<typeof resolveSocialAction>): number {
  return resolution.effects
    .filter((e): e is Extract<typeof e, { type: 'leverage' }> => e.type === 'leverage')
    .filter((e) => e.delta < 0)
    .reduce((sum, e) => sum + Math.abs(e.delta), 0);
}

function bribe(world: WorldState, external = composeLeverageModifiers(world, player(world), 'guild')) {
  return resolveSocialAction(
    'bribe', 'district-a', 'guild', RICH, 0, undefined, 1, undefined, external,
  );
}

describe('composeLeverageModifiers — both bundles, one seam', () => {
  it('an empty world composes NOTHING, not a bundle of neutral values', () => {
    // The byte-identity contract. If this returned `{ companionDiscount: {
    // amount: 0 } }`, every resolution in every companion-less world would
    // start carrying a `modifiers` array announcing that nothing happened.
    const world = bareWorld();
    expect(composeLeverageModifiers(world, player(world), 'guild')).toEqual({});
  });

  it('a world with no companions and no district resolves byte-identically to no-modifiers', () => {
    const world = bareWorld();
    const composed = bribe(world);
    const bare = resolveSocialAction('bribe', 'district-a', 'guild', RICH, 0, undefined, 1);
    expect(composed).toEqual(bare);
    expect(composed.modifiers).toBeUndefined();
  });
});

describe('AbilityModifiers.leverageCostDiscount reaches the price', () => {
  it('CONSEQUENCE: a smuggler in the party makes a bribe cost less', () => {
    const world = bareWorld();
    const withoutParty = bribe(world);

    setPartyState(world, partyWithFixer());
    const withParty = bribe(world);

    expect(
      costOf(withParty),
      'the party carries a leverage-cost discount and the bribe cost the same — the modifier is unread',
    ).toBeLessThan(costOf(withoutParty));
  });

  it('ATTRIBUTION: the saving names the modifier, the companion, and the new total', () => {
    // Hicks 2019 (Juicy Game Design): feedback has to be connectable to ONE
    // cause. Sobou 2012 on Suikoden is the same finding as a design failure —
    // a companion whose contribution is anonymous is a roster clone.
    const world = bareWorld();
    setPartyState(world, partyWithFixer());
    const resolution = bribe(world);

    const entry = resolution.modifiers?.find((m) => m.name === 'companionLeverageCostDiscount');
    expect(entry, `no attribution for the discount: ${JSON.stringify(resolution.modifiers)}`).toBeDefined();
    expect(entry!.source).toBe('smuggler-vale');
    expect(entry!.delta).toBeLessThan(0);
    // Slay the Spire's intent display: the number ALREADY recalculated, so a
    // UI never has to redo the arithmetic to show the player what they pay.
    expect(entry!.after).toBe(costOf(resolution));
  });

  it('NEGATIVE CONTROL: dismissing the companion restores the baseline exactly', () => {
    const world = bareWorld();
    const baseline = bribe(world);

    const party = partyWithFixer();
    setPartyState(world, party);
    expect(bribe(world)).not.toEqual(baseline);

    // Not "remove the companion" — DEACTIVATE them. The composer reads
    // `active`, so this proves the gate it actually uses.
    party.companions[0].active = false;
    setPartyState(world, party);
    expect(bribe(world)).toEqual(baseline);
  });
});

describe('DistrictModifiers.leverageCostScale reaches the price', () => {
  // The bundle companion-core called "the identical unwired gap". Composed
  // from the same seam, threaded through the same parameter.
  function worldInDistrict(safety: number): WorldState {
    const world = bareWorld();
    world.modules['district-core'] = {
      districts: {
        'district-a': {
          alertPressure: 100 - safety, rumorDensity: 0, intruderLikelihood: 0,
          surveillance: 0, stability: safety / 10, commerce: 50, morale: 50,
          lastUpdateTick: 0, eventCount: 0,
        },
      },
      definitions: { 'district-a': { id: 'district-a', name: 'A', zoneIds: ['zone-a'], tags: [] } },
      zoneToDistrict: { 'zone-a': 'district-a' },
    };
    return world;
  }

  it('CONSEQUENCE: a dangerous district charges more than a safe one for the same bribe', () => {
    const dangerous = worldInDistrict(5);
    const safe = worldInDistrict(95);
    expect(
      costOf(bribe(dangerous)),
      'the district mood did not reach the price — DistrictModifiers is still unwired',
    ).toBeGreaterThan(costOf(bribe(safe)));
  });

  it('ATTRIBUTION: the scale names the district and the post-scale total', () => {
    const dangerous = worldInDistrict(5);
    const resolution = bribe(dangerous);
    const entry = resolution.modifiers?.find((m) => m.name === 'districtLeverageCostScale');
    expect(entry, `no attribution for the district: ${JSON.stringify(resolution.modifiers)}`).toBeDefined();
    expect(entry!.source).toBe('district-a');
    expect(entry!.scale).toBeGreaterThan(1);
    expect(entry!.after).toBe(costOf(resolution));
  });

  it('NEGATIVE CONTROL: a NEUTRAL district contributes nothing at all', () => {
    // computeDistrictModifiers returns leverageCostScale 1.0 for the middle
    // band, and exactly 1.0 must produce no entry — an attribution saying
    // "this changed nothing" is noise AND breaks byte-identity.
    const neutral = worldInDistrict(50);
    const resolution = bribe(neutral);
    expect(resolution.modifiers).toBeUndefined();
    expect(resolution).toEqual(
      resolveSocialAction('bribe', 'district-a', 'guild', RICH, 0, undefined, 1),
    );
  });

  it('both bundles compose: the district scales the price, then the party discounts it', () => {
    // Order is load-bearing and stated in applyExternalCostModifiers: the
    // district sets what business costs HERE; the party then negotiates a flat
    // amount off that. Scaling a discounted cost would make a smuggler worth less
    // in an expensive district, which is backwards.
    const world = worldInDistrict(5);
    const districtOnly = costOf(bribe(world));

    setPartyState(world, partyWithFixer());
    const both = bribe(world);

    expect(costOf(both)).toBeLessThan(districtOnly);
    expect(both.modifiers?.map((m) => m.name)).toEqual([
      'districtLeverageCostScale',
      'companionLeverageCostDiscount',
    ]);
  });
});
