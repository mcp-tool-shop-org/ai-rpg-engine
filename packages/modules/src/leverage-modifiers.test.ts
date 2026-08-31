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
import { composeLeverageModifiers, composeTradeModifiers, composeCraftModifiers } from './leverage-modifiers.js';
import {
  resolveSocialAction,
  scaledRumorConfidence,
  BASE_RUMOR_CONFIDENCE,
  type LeverageState,
} from './player-leverage.js';
import { denyRumor, buryRumor, type PlayerRumor } from './player-rumor.js';
import {
  deriveNpcRelationship,
  deriveLoyaltyBreakpoint,
  deriveCooperationTrust,
  districtCooperationBias,
  buildNpcProfile,
} from './npc-agency.js';
import { computeDistrictModifiers } from './district-mood.js';
import { makePressure } from './pressure-system.js';
import { setPartyState, createPartyState, type PartyState } from './companion-core.js';
import { computeItemValue } from './trade-value.js';
import { applyCraftingEfficiency, type CraftingContext } from './crafting-recipes.js';
import { createDistrictEconomy } from './economy-core.js';

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

// --- Slice 2: the rumor bundle ---------------------------------------------

/** A party whose abilities carry rumor reach and rumor suppression. */
function partyWithTalkers(): PartyState {
  const party = createPartyState();
  party.companions.push({
    npcId: 'herald-oris',
    role: 'diplomat',
    joinedAtTick: 0,
    // witness-calming scales spread to 0.7 (a calming presence DAMPENS talk);
    // rumor-suppression adds 0.3 burial strength.
    abilityTags: ['witness-calming', 'rumor-suppression'],
    morale: 70,
    active: true,
  });
  return party;
}

function districtWorld(safety: number, spirit: number): WorldState {
  const world = bareWorld();
  world.modules['district-core'] = {
    districts: {
      'district-a': {
        alertPressure: 100 - safety, rumorDensity: 0, intruderLikelihood: 0,
        surveillance: 100 - spirit, stability: safety / 10, commerce: 50, morale: spirit,
        lastUpdateTick: 0, eventCount: 0,
      },
    },
    definitions: { 'district-a': { id: 'district-a', name: 'A', zoneIds: ['zone-a'], tags: [] } },
    zoneToDistrict: { 'zone-a': 'district-a' },
  };
  return world;
}

describe('AbilityModifiers.rumorSpreadScale x DistrictModifiers.rumorSpreadScale', () => {
  it('CONSEQUENCE: a party that dampens talk seeds a rumor at lower confidence', () => {
    const world = bareWorld();
    const bare = scaledRumorConfidence(composeLeverageModifiers(world, player(world)));
    expect(bare.confidence).toBe(BASE_RUMOR_CONFIDENCE);

    setPartyState(world, partyWithTalkers());
    const damped = scaledRumorConfidence(composeLeverageModifiers(world, player(world)));

    expect(
      damped.confidence,
      'the party carries a rumorSpreadScale and the seeded confidence did not move — still unread',
    ).toBeLessThan(bare.confidence);
  });

  it('the two scales MULTIPLY and ship as ONE attribution naming both', () => {
    // A talkative companion in a gossipy district carries further than either
    // alone. Two separate "rumor spread" lines would describe two systems
    // where the player made one decision.
    const world = districtWorld(5, 5);
    setPartyState(world, partyWithTalkers());
    const composed = composeLeverageModifiers(world, player(world));

    expect(composed.rumorSpreadScale).toBeDefined();
    expect(composed.rumorSpreadScale!.source).toContain('herald-oris');
    expect(composed.rumorSpreadScale!.source).toContain('district-a');

    const { attribution } = scaledRumorConfidence(composed);
    expect(attribution).toHaveLength(1);
    expect(attribution[0].name).toBe('rumorSpreadScale');
    expect(attribution[0].after).toBeGreaterThan(0);
  });

  it('NEGATIVE CONTROL: no party and a neutral district leave the base confidence untouched', () => {
    const world = districtWorld(50, 50);
    const result = scaledRumorConfidence(composeLeverageModifiers(world, player(world)));
    expect(result.confidence).toBe(BASE_RUMOR_CONFIDENCE);
    expect(result.attribution).toEqual([]);
    expect(composeLeverageModifiers(world, player(world)).rumorSpreadScale).toBeUndefined();
  });

  it('confidence stays inside 0..1 however the scales multiply', () => {
    // Confidence is a probability-like quantity everywhere in player-rumor.ts,
    // and two stacking scales above 1 would push it out of range.
    const { confidence } = scaledRumorConfidence({
      rumorSpreadScale: { scale: 99, source: 'absurd' },
    });
    expect(confidence).toBeLessThanOrEqual(1);
    expect(confidence).toBeGreaterThanOrEqual(0);
  });
});

describe('AbilityModifiers.rumorSuppressionChance reaches the burial', () => {
  const RUMOR: PlayerRumor = {
    id: 'r1', claim: 'a claim', subjectDescriptor: 'the outsider',
    sourceEvent: 'player-leverage', confidence: 0.9, distortion: 0,
    mutationCount: 0, valence: 'fearsome', spreadTo: [], originTick: 0,
  };

  it('CONSEQUENCE: a suppressive party denies and buries harder', () => {
    expect(denyRumor(RUMOR, 1).confidence).toBeLessThan(denyRumor(RUMOR).confidence);
    expect(buryRumor(RUMOR, 1).confidence).toBeLessThan(buryRumor(RUMOR).confidence);
  });

  it('the composer supplies the strength, named and attributed to the party', () => {
    const world = bareWorld();
    setPartyState(world, partyWithTalkers());
    const suppression = composeLeverageModifiers(world, player(world)).rumorSuppression;
    expect(suppression, 'rumorSuppressionChance never reached the composer').toBeDefined();
    expect(suppression!.strength).toBeGreaterThan(0);
    expect(suppression!.source).toBe('herald-oris');
  });

  it('NEGATIVE CONTROL: strength 0 is byte-identical to the unmodified call', () => {
    // The default-argument path every existing caller takes. If this differed,
    // the change would have silently retuned every rumor in the engine.
    expect(denyRumor(RUMOR, 0)).toEqual(denyRumor(RUMOR));
    expect(buryRumor(RUMOR, 0)).toEqual(buryRumor(RUMOR));
    expect(composeLeverageModifiers(bareWorld(), player(bareWorld())).rumorSuppression).toBeUndefined();
  });
});

// --- Slice 3: the trade bundle ---------------------------------------------

/** A party whose ability grants a flat commerce bonus. */
function partyWithTrader(): PartyState {
  const party = createPartyState();
  party.companions.push({
    npcId: 'factor-sela',
    role: 'smuggler',
    joinedAtTick: 0,
    abilityTags: ['trade-advantage'],
    morale: 70,
    active: true,
  });
  return party;
}

function priceIn(world: WorldState, base = 10): number {
  return computeItemValue(base, 'components', {
    districtEconomy: createDistrictEconomy(),
    playerReputation: 0,
    playerHeat: 0,
    isContraband: false,
    activePressureKinds: [],
    externalModifiers: composeTradeModifiers(world, player(world)),
  }).finalValue;
}

describe('AbilityModifiers.commerceGainBonus reaches the price', () => {
  it('CONSEQUENCE: a trader in the party gets more for the same goods', () => {
    const world = bareWorld();
    const without = priceIn(world);
    setPartyState(world, partyWithTrader());
    expect(
      priceIn(world),
      'the party carries a commerceGainBonus and the sale value did not move — still unread',
    ).toBeGreaterThan(without);
  });

  it('the bonus is FLAT, not a percentage', () => {
    // A percentage would make a trader companion worth nothing on cheap goods
    // and enormous on a relic, which is not what "knows the market" means.
    const world = bareWorld();
    setPartyState(world, partyWithTrader());
    const cheapDelta = priceIn(world, 10) - priceIn(bareWorld(), 10);
    const dearDelta = priceIn(world, 500) - priceIn(bareWorld(), 500);
    expect(cheapDelta).toBe(dearDelta);
  });

  it('NEGATIVE CONTROL: no party composes nothing and prices exactly as before', () => {
    const world = bareWorld();
    expect(composeTradeModifiers(world, player(world))).toBeUndefined();
    const bare = computeItemValue(10, 'components', {
      districtEconomy: createDistrictEconomy(),
      playerReputation: 0, playerHeat: 0, isContraband: false, activePressureKinds: [],
    });
    expect(priceIn(world)).toBe(bare.finalValue);
    expect(bare.modifiers.districtMoodScale).toBeUndefined();
  });
});

describe('DistrictModifiers.tradePriceScale reaches the price', () => {
  function moodWorld(safety: number, spirit: number): WorldState {
    const world = bareWorld();
    world.modules['district-core'] = {
      districts: {
        'district-a': {
          alertPressure: 100 - safety, rumorDensity: 0, intruderLikelihood: 0,
          surveillance: 100 - spirit, stability: safety / 10, commerce: 50, morale: spirit,
          lastUpdateTick: 0, eventCount: 0,
        },
      },
      definitions: { 'district-a': { id: 'district-a', name: 'A', zoneIds: ['zone-a'], tags: [] } },
      zoneToDistrict: { 'zone-a': 'district-a' },
    };
    return world;
  }

  it('CONSEQUENCE: a district in a different MOOD prices the same goods differently', () => {
    // Distinct from `districtProsperity`, which reads the ECONOMY. A ruined
    // quarter can be flush with goods and still price like a place nobody
    // wants to stand in — same DistrictEconomy in both arms here, so the only
    // difference IS the mood.
    const grim = priceIn(moodWorld(5, 5), 100);
    const calm = priceIn(moodWorld(95, 95), 100);
    expect(grim).not.toBe(calm);
  });

  it('ATTRIBUTION: the scale names the district it came from', () => {
    const composed = composeTradeModifiers(moodWorld(5, 5), player(moodWorld(5, 5)));
    expect(composed?.districtMoodScale?.source).toBe('district-a');
  });

  it('NEGATIVE CONTROL: a scale of exactly 1 composes no entry at all', () => {
    const neutral = moodWorld(50, 50);
    const composed = composeTradeModifiers(neutral, player(neutral));
    expect(composed?.districtMoodScale).toBeUndefined();
  });
});

// --- Slice 4: crafting, perception, and the one field left alone -----------

describe('DistrictModifiers.craftingEfficiency reaches the material cost', () => {
  const INPUTS = [
    { category: 'components' as const, quantity: 4 },
    { category: 'fuel' as const, quantity: 2 },
  ];
  const ctx = (scale?: number): CraftingContext => ({
    districtEconomy: createDistrictEconomy(),
    districtId: 'district-a',
    districtTags: [],
    prosperity: 50,
    stability: 50,
    playerHeat: 0,
    isBlackMarket: false,
    ...(scale !== undefined ? { craftingEfficiency: { scale, source: 'district-a' } } : {}),
  });

  it('CONSEQUENCE: an efficient district wastes less stock', () => {
    const efficient = applyCraftingEfficiency(INPUTS, ctx(1.2));
    expect(
      efficient[0].quantity,
      'craftingEfficiency did not reach the material cost — still unread',
    ).toBeLessThan(INPUTS[0].quantity);
  });

  it('and a struggling one wastes more', () => {
    expect(applyCraftingEfficiency(INPUTS, ctx(0.7))[0].quantity).toBeGreaterThan(INPUTS[0].quantity);
  });

  it('never consumes nothing, however efficient the district', () => {
    // Floors at 1 per line: an efficient district uses LESS, not free.
    expect(applyCraftingEfficiency(INPUTS, ctx(99)).every((i) => i.quantity >= 1)).toBe(true);
  });

  it('NEGATIVE CONTROL: absent, or exactly 1, returns the SAME array untouched', () => {
    // Identity, not just equality — proves no allocation and no rounding
    // happens on the path every existing CraftingContext takes.
    expect(applyCraftingEfficiency(INPUTS, ctx())).toBe(INPUTS);
    expect(applyCraftingEfficiency(INPUTS, ctx(1))).toBe(INPUTS);
  });
});

describe('composeCraftModifiers (F-88872722)', () => {
  it('emits scale+source only when the district mood is not 1.0', () => {
    const prosperous = districtWorld(80, 80);
    const composed = composeCraftModifiers(prosperous, player(prosperous));
    expect(composed?.scale).toBe(1.2);
    expect(composed?.source).toBe('district-a');
  });

  it('NEGATIVE CONTROL: a scale of exactly 1 composes nothing', () => {
    expect(composeCraftModifiers(districtWorld(50, 50), player(districtWorld(50, 50)))).toBeUndefined();
  });
});

// --- Fixtures for the cooperation seam -------------------------------------
//
// Trust 22 is chosen against the gate, not for flavour: `warn` requires
// trust > 20, so a two-point margin is cleared by a thriving district's bias
// and closed by a grim one's. Anything further from the line would test the
// arithmetic instead of the gate.
const INFORMANT_TRUST = 22;
const INFORMANT_FACTION = 'the-office';

const PRESSURE_ON_THEIR_FACTION = makePressure({
  kind: 'investigation-opened',
  sourceFactionId: INFORMANT_FACTION,
  description: 'their people are being looked at',
  triggeredBy: 'fixture',
  urgency: 0.5,
  visibility: 'known',
  turnsRemaining: 20,
  potentialOutcomes: [],
  tags: [],
  currentTick: 0,
});

function makeNpc(): EntityState {
  return {
    id: 'informant', blueprintId: 'informant', type: 'npc', name: 'The Informant',
    tags: ['named'], stats: {}, resources: { hp: 10 }, statuses: [], zoneId: 'zone-a',
    relations: { 'player-trust': INFORMANT_TRUST },
  } as unknown as EntityState;
}

/**
 * A world with one district around `zone-a`, whose mood is driven by
 * `commerce`. computeDistrictMood derives prosperity as `commerce * 0.6 +
 * stability * 4`, and computeDistrictModifiers turns prosperity into the
 * cooperation bias — so commerce is the one dial that moves this axis.
 */
function worldWithDistrict(commerce: number): WorldState {
  const world = bareWorld();
  world.entities['informant'] = makeNpc();
  world.modules['faction-cognition'] = {
    factionCognition: {},
    membership: { informant: INFORMANT_FACTION },
    factionMembers: { [INFORMANT_FACTION]: ['informant'] },
  };
  world.modules['district-core'] = {
    zoneToDistrict: { 'zone-a': 'the-liberties' },
    districts: {
      'the-liberties': {
        alertPressure: 0, rumorDensity: 0, intruderLikelihood: 0, surveillance: 0,
        stability: 5, commerce, morale: 50, lastUpdateTick: 0, eventCount: 0,
      },
    },
    definitions: {
      'the-liberties': { id: 'the-liberties', name: 'The Liberties', zoneIds: ['zone-a'], tags: [] },
    },
  };
  return world;
}

describe('DistrictModifiers.npcCooperationBias — threaded at CHECK TIME (v3.8)', () => {
  // The v3.7 note asked for this test to be deleted "in the SAME commit, with
  // the departure question answered — not quietly updated". The question is
  // answered below and the pin STAYS, because it never guarded "is this field
  // threaded" — it guarded "does it go into DERIVATION", which remains the
  // wrong answer. What changed is that the right answer now exists beside it.

  it('deriveNpcRelationship still takes exactly three arguments', () => {
    // The DECISION, unchanged: the bias must not become part of the stored
    // relationship. That is the path that runs trust → breakpoint → the
    // companion departure rule, and a district's mood must not be able to end
    // a companionship.
    expect(deriveNpcRelationship.length).toBe(3);
  });

  it('CONSEQUENCE: a grim district lowers the trust a cooperation check sees', () => {
    // computeDistrictModifiers derives the bias from prosperity — below 50 it
    // goes negative. The check surface is `deriveNpcGoals`, which reads trust
    // fresh every round to decide whether an NPC warns you, conceals from you,
    // or lies. That IS the cooperation check the field's own documentation
    // names, and it was sitting here the whole time.
    const grim = computeDistrictModifiers({
      tone: 'grim', safety: 20, prosperity: 10, spirit: 20, descriptor: 'grim',
    });
    expect(grim.npcCooperationBias).toBeLessThan(0);

    const rel = { trust: 25, fear: 10, greed: 30, loyalty: 60 };
    expect(deriveCooperationTrust(rel, grim.npcCooperationBias)).toBeLessThan(rel.trust);

    // …and a thriving one raises it, so the axis moves in both directions.
    const thriving = computeDistrictModifiers({
      tone: 'prosperous', safety: 80, prosperity: 90, spirit: 80, descriptor: 'prosperous',
    });
    expect(thriving.npcCooperationBias).toBeGreaterThan(0);
    expect(deriveCooperationTrust(rel, thriving.npcCooperationBias)).toBeGreaterThan(rel.trust);
  });

  it('CONSEQUENCE: it flips a real goal gate, on a real profile', () => {
    // Not the arithmetic — the behaviour. `warn` requires trust > 20; a trust
    // of 22 clears it in a neutral district and fails it in a grim one, and
    // nothing else about the NPC changes.
    const warnsIn = (prosperity: number): boolean => {
      const world = worldWithDistrict(prosperity);
      const profile = buildNpcProfile(world, 'informant', PLAYER_ID, [PRESSURE_ON_THEIR_FACTION]);
      return profile.goals.some((g) => g.verb === 'warn');
    };
    expect(warnsIn(60), 'the control arm does not warn — this test is not reading the gate').toBe(true);
    expect(warnsIn(5), 'a grim district did not close the cooperation gate').toBe(false);
  });

  it('NEGATIVE CONTROL: the STORED relationship never sees the bias', () => {
    // The whole seam, asserted directly. Everything departure-shaped reads
    // `profile.relationship` and `profile.breakpoint`; both must be identical
    // to what the unbiased derivation produces, in a district whose bias is
    // provably non-zero.
    const world = worldWithDistrict(5);
    const entity = world.entities['informant'];
    expect(districtCooperationBias(world, entity), 'the control district has no bias to hide').not.toBe(0);

    const profile = buildNpcProfile(world, 'informant', PLAYER_ID, [PRESSURE_ON_THEIR_FACTION]);
    const unbiased = deriveNpcRelationship(world, 'informant', PLAYER_ID);
    expect(profile.relationship).toEqual(unbiased);
    expect(profile.breakpoint).toBe(deriveLoyaltyBreakpoint(unbiased, undefined, PLAYER_ID));
  });

  it('NEGATIVE CONTROL: the grimmest district cannot push a breakpoint toward departure', () => {
    // The v3.7 failure, aimed at directly. companion-reactions' departure rule
    // fires on `breakpoint === 'hostile'` (and 'wavering' at low morale), and
    // `hostile` needs trust <= -30. An NPC sitting at trust -25 is two points
    // clear of it and nine points inside the grimmest district's bias — so if
    // the bias reached the breakpoint at all, this NPC would flip. It does not
    // reach it, because the breakpoint is derived before the bias exists.
    const world = worldWithDistrict(0);
    // Prosperity is `commerce * 0.6 + stability * 4`, so the fixture's default
    // stability of 5 still floors the bias at -6. Zero both for the extreme.
    (world.modules['district-core'] as { districts: Record<string, { stability: number }> })
      .districts['the-liberties'].stability = 0;
    world.entities['informant'].relations = { 'player-trust': -25 };
    expect(districtCooperationBias(world, world.entities['informant'])).toBeLessThanOrEqual(-10);

    const profile = buildNpcProfile(world, 'informant', PLAYER_ID, []);
    expect(profile.relationship.trust).toBe(-25);
    expect(
      profile.breakpoint,
      'the district mood reached the breakpoint — this is the v3.7 desertion bug returning',
    ).not.toBe('hostile');
  });

  it('NEGATIVE CONTROL: a world with no district system takes the identical path', () => {
    // `bias === 0` returns the ORIGINAL relationship object rather than a
    // copy, so a world without districts is not merely equivalent to one
    // before this wire — it is the same object graph.
    const world = bareWorld();
    world.entities['informant'] = makeNpc();
    expect(districtCooperationBias(world, world.entities['informant'])).toBe(0);
    const profile = buildNpcProfile(world, 'informant', PLAYER_ID, []);
    expect(profile.relationship).toEqual(deriveNpcRelationship(world, 'informant', PLAYER_ID));
  });
});
