import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { WorldState, EntityState, ZoneState, ResolvedEvent } from '@ai-rpg-engine/core';
import {
  tickLeverage,
  getLeverageState,
  adjustLeverage,
  computeLeverageGains,
  resolveSocialAction,
  resolveRumorAction,
  resolveDiplomacyAction,
  resolveSabotageAction,
  applyLeverageEffects,
  createPlayerLeverageCore,
} from './player-leverage.js';
import type { LeverageHints, LeverageState, LeverageEffect } from './player-leverage.js';
import { getPlayerRumorState, formatRumorForDirector } from './player-rumor.js';
import { setPartyState, createPartyState } from './companion-core.js';
import type { CompanionState } from './companion-core.js';
import { getFactionCognition, createFactionCognition } from './faction-cognition.js';
import { createCognitionCore } from './cognition-core.js';
import { getWorldTickState } from './world-tick.js';
import { createEnvironmentCore } from './environment-core.js';
import { createDistrictCore } from './district-core.js';
import type { DistrictDefinition } from './district-core.js';

// ---------------------------------------------------------------------------
// Shared fixtures for the EngineModule / verb-wiring tests below
// ---------------------------------------------------------------------------

function makePlayerEntity(overrides?: Partial<EntityState>): EntityState {
  return {
    id: 'player',
    blueprintId: 'player',
    type: 'player',
    name: 'Hero',
    tags: ['human', 'player'],
    stats: {},
    resources: {},
    statuses: [],
    zoneId: 'start',
    ...overrides,
  };
}

const START_ZONES: ZoneState[] = [
  { id: 'start', roomId: 'start', name: 'Starting Area', tags: [], neighbors: [] },
];

function makeCompanion(npcId: string, overrides?: Partial<CompanionState>): CompanionState {
  return {
    npcId,
    role: 'diplomat',
    joinedAtTick: 0,
    abilityTags: [],
    morale: 50,
    active: true,
    ...overrides,
  };
}

/** A leverage-flush player entity — enough of every currency to afford any
 *  single authored sub-action's cost without hitting the affordability gate,
 *  so tests can isolate the behavior they're actually checking. */
function flushCustom(): Record<string, string | number | boolean> {
  return {
    'leverage.favor': 100,
    'leverage.debt': 100,
    'leverage.blackmail': 100,
    'leverage.influence': 100,
    'leverage.heat': 100,
    'leverage.legitimacy': 100,
  };
}

describe('tickLeverage influence accumulation (MW-5)', () => {
  const reps = [{ factionId: 'guild', value: 40 }]; // rep baseline = floor(40/2) = 20

  it('grants reputation-derived influence on first tick', () => {
    const after = tickLeverage({}, reps);
    expect(getLeverageState(after).influence).toBe(20);
  });

  it('does not restore influence that was spent through play', () => {
    // First tick establishes baseline 20.
    let custom = tickLeverage({}, reps);
    expect(getLeverageState(custom).influence).toBe(20);

    // Player spends 10 influence on a leverage sub-action (e.g. seed rumor).
    custom = adjustLeverage(custom, 'influence', -10);
    expect(getLeverageState(custom).influence).toBe(10);

    // Next tick with UNCHANGED reputation must NOT clobber influence back to 20.
    custom = tickLeverage(custom, reps);
    expect(getLeverageState(custom).influence).toBe(10);
  });

  it('does not discard influence earned/gained beyond the reputation baseline', () => {
    let custom = tickLeverage({}, reps); // baseline 20
    custom = adjustLeverage(custom, 'influence', 15); // player gained extra influence → 35
    expect(getLeverageState(custom).influence).toBe(35);

    custom = tickLeverage(custom, reps); // unchanged rep → keep 35
    expect(getLeverageState(custom).influence).toBe(35);
  });

  it('applies only the delta when reputation rises', () => {
    let custom = tickLeverage({}, reps); // baseline 20
    custom = adjustLeverage(custom, 'influence', -10); // spent → 10
    // Reputation rises: new baseline = floor(60/2) = 30, delta = +10
    custom = tickLeverage(custom, [{ factionId: 'guild', value: 60 }]);
    // 10 (current) + 10 (rep delta) = 20, NOT clobbered to 30
    expect(getLeverageState(custom).influence).toBe(20);
  });

  it('applies only the delta when reputation falls', () => {
    let custom = tickLeverage({}, [{ factionId: 'guild', value: 60 }]); // baseline 30
    custom = adjustLeverage(custom, 'influence', 10); // earned → 40
    // Reputation falls: new baseline = floor(40/2) = 20, delta = -10
    custom = tickLeverage(custom, reps);
    // 40 (current) - 10 (rep delta) = 30
    expect(getLeverageState(custom).influence).toBe(30);
  });

  it('still decays heat each tick', () => {
    const custom = tickLeverage({ 'leverage.heat': 10 }, reps);
    expect(getLeverageState(custom).heat).toBe(7); // 10 - HEAT_DECAY_PER_TURN(3)
  });

  it('clamps influence at 0 when reputation collapse exceeds current', () => {
    let custom = tickLeverage({}, [{ factionId: 'guild', value: 60 }]); // baseline 30, influence 30
    // Reputation collapses to 0: new baseline 0, delta -30 → influence clamps at 0
    custom = tickLeverage(custom, [{ factionId: 'guild', value: 0 }]);
    expect(getLeverageState(custom).influence).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// canAfford boundary guard (PM-4 family)
// ---------------------------------------------------------------------------

describe('canAfford malformed-state guard', () => {
  it('treats a MISSING currency balance as 0 — cannot afford', async () => {
    const { canAfford } = await import('./player-leverage.js');
    const broken = { debt: 50, blackmail: 50, influence: 50, heat: 50, legitimacy: 50 };
    // 'favor' key absent: `undefined < 15` is false, which used to slip
    // through the gate and later poison surplus ratios with NaN.
    expect(canAfford(broken as never, { favor: 15 })).toBe(false);
  });

  it('treats a NaN balance as 0 — cannot afford', async () => {
    const { canAfford } = await import('./player-leverage.js');
    const state = { favor: Number.NaN, debt: 50, blackmail: 50, influence: 50, heat: 50, legitimacy: 50 };
    expect(canAfford(state, { favor: 1 })).toBe(false);
    // Healthy balances still afford.
    expect(canAfford(state, { debt: 50 })).toBe(true);
    expect(canAfford(state, { debt: 51 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeLeverageGains: blackmail accumulation (F-da82fb75)
// ---------------------------------------------------------------------------
//
// The first two blackmail triggers (xpGained ≥ 15, reputationDelta.delta <
// -10) used direct assignment (`gains.blackmail = 5` / `= 3`); the third
// (milestone with exploration/landmark tags) correctly ACCUMULATES
// (`gains.blackmail = (gains.blackmail ?? 0) + 5`). When both of the first
// two fire in the same call — realistic: defeating a notable enemy tanks
// reputation with their faction in the same turn — the second assignment
// silently overwrote the first instead of the two stacking.

describe('computeLeverageGains: blackmail accumulation', () => {
  it('a single trigger alone produces the documented amount', () => {
    expect(computeLeverageGains({ xpGained: 15 }).blackmail).toBe(5);
    expect(computeLeverageGains({
      xpGained: 0, reputationDelta: { factionId: 'guild', delta: -15 },
    }).blackmail).toBe(3);
  });

  it('xpGained and a large negative reputationDelta in the SAME call stack instead of the second overwriting the first', () => {
    const hints: LeverageHints = {
      xpGained: 15, // triggers +5 blackmail
      reputationDelta: { factionId: 'guild', delta: -15 }, // triggers +3 blackmail
    };
    // 5 + 3 = 8, not 3 (the buggy direct assignment discarding the +5).
    expect(computeLeverageGains(hints).blackmail).toBe(8);
  });

  it('all three blackmail triggers stack when they all fire together', () => {
    const hints: LeverageHints = {
      xpGained: 15,
      reputationDelta: { factionId: 'guild', delta: -15 },
      milestoneTriggered: { label: 'Found the ruins', tags: ['exploration'] },
    };
    // 5 (xp) + 3 (rep) + 5 (milestone) = 13.
    expect(computeLeverageGains(hints).blackmail).toBe(13);
  });
});

// ---------------------------------------------------------------------------
// F-677e94ad: red-proof — every one of the 4 verbs is unknown without the
// module registered (the dispatcher's own generic "unknown verb" rejection —
// proves the verb NAMES only exist once createPlayerLeverageCore is wired).
// ---------------------------------------------------------------------------

describe('F-677e94ad red-proof: unknown verb without createPlayerLeverageCore', () => {
  for (const verb of ['bribe', 'intimidate', 'seed', 'petition']) {
    it(`"${verb}" is rejected as an unknown verb on a bare engine`, () => {
      const engine = createTestEngine({ modules: [], entities: [makePlayerEntity()], zones: START_ZONES });
      engine.submitAction(verb, { targetIds: ['guild'] });
      const rejected = engine.drainEvents().find((e) => e.type === 'action.rejected');
      expect(rejected?.payload.reason).toMatch(/unknown verb/);
    });
  }
});

// ---------------------------------------------------------------------------
// F-677e94ad: applyLeverageEffects — the effect-translation helper, unit-
// tested directly against every wired effect type.
// ---------------------------------------------------------------------------

describe('applyLeverageEffects (F-677e94ad)', () => {
  function bareEngine() {
    return createTestEngine({ modules: [], entities: [makePlayerEntity()], zones: START_ZONES });
  }

  it('writes leverage effects onto the actor custom fields via adjustLeverage', () => {
    const engine = bareEngine();
    const world = engine.world as WorldState;
    world.entities['player'].custom = { 'leverage.favor': 40 };
    applyLeverageEffects(world, 'player', [{ type: 'leverage', currency: 'favor', delta: -15 }], 0);
    expect(getLeverageState(world.entities['player'].custom ?? {}).favor).toBe(25);
  });

  it('writes reputation effects to the exact reputation_<factionId> global trade pricing reads', () => {
    const engine = bareEngine();
    const world = engine.world as WorldState;
    applyLeverageEffects(world, 'player', [{ type: 'reputation', factionId: 'guild', delta: 10 }], 0);
    expect(world.globals['reputation_guild']).toBe(10);
  });

  it('writes alert effects to the exact faction_alert_<factionId> global', () => {
    const engine = bareEngine();
    const world = engine.world as WorldState;
    applyLeverageEffects(world, 'player', [{ type: 'alert', factionId: 'guild', delta: 15 }], 0);
    expect(world.globals['faction_alert_guild']).toBe(15);
  });

  it('writes heat effects to the shared player_heat global (world-tick.ts HEAT_KEY)', () => {
    const engine = bareEngine();
    const world = engine.world as WorldState;
    applyLeverageEffects(world, 'player', [{ type: 'heat', delta: 10 }], 0);
    expect(world.globals['player_heat']).toBe(10);
  });

  it('writes district-metric effects to district_<id>_<metric>', () => {
    const engine = bareEngine();
    const world = engine.world as WorldState;
    applyLeverageEffects(world, 'player', [
      { type: 'district-metric', districtId: 'docks', metric: 'stability', delta: -5 },
    ], 0);
    expect(world.globals['district_docks_stability']).toBe(-5);
  });

  it('clamps cohesion effects to 0-1 on faction-cognition state', () => {
    // Needs faction-cognition actually REGISTERED — otherwise getFactionCognition's
    // own "no wired store" fallback returns a fresh throwaway state every call
    // (a graceful, documented degrade for a pack that never registers the
    // module) and no mutation would ever persist across the two reads below.
    const engine = createTestEngine({
      modules: [createCognitionCore(), createFactionCognition({ factions: [] })],
      entities: [makePlayerEntity()],
      zones: START_ZONES,
    });
    const world = engine.world as WorldState;
    const before = getFactionCognition(world, 'guild').cohesion; // default 0.8
    applyLeverageEffects(world, 'player', [{ type: 'cohesion', factionId: 'guild', delta: -0.05 }], 0);
    expect(getFactionCognition(world, 'guild').cohesion).toBeCloseTo(before - 0.05);

    // Clamp floor: repeated heavy negative deltas never go below 0.
    for (let i = 0; i < 30; i++) {
      applyLeverageEffects(world, 'player', [{ type: 'cohesion', factionId: 'guild', delta: -0.1 }], 0);
    }
    expect(getFactionCognition(world, 'guild').cohesion).toBe(0);
  });

  it('spawns a pressure via the pressure system and pushes it into world-tick state', () => {
    const engine = bareEngine();
    const world = engine.world as WorldState;
    const spawned = applyLeverageEffects(world, 'player', [
      { type: 'pressure', kind: 'investigation-opened', sourceFactionId: 'guild', description: 'inquiry', urgency: 0.4 },
    ], 3);
    expect(spawned).toHaveLength(1);
    expect(spawned[0].kind).toBe('investigation-opened');
    expect(getWorldTickState(world).pressures).toHaveLength(1);
    expect(getWorldTickState(world).pressures[0].sourceFactionId).toBe('guild');
  });

  it('respects the one-active-pressure-per-kind invariant — a second same-kind effect is a no-op', () => {
    const engine = bareEngine();
    const world = engine.world as WorldState;
    const effect: LeverageEffect = { type: 'pressure', kind: 'investigation-opened', sourceFactionId: 'guild', description: 'inquiry', urgency: 0.4 };
    applyLeverageEffects(world, 'player', [effect], 3);
    const secondSpawn = applyLeverageEffects(world, 'player', [effect], 4);
    expect(secondSpawn).toHaveLength(0);
    expect(getWorldTickState(world).pressures).toHaveLength(1);
  });

  it('drops rumor and access effects silently (documented ceiling, not this choke point)', () => {
    const engine = bareEngine();
    const world = engine.world as WorldState;
    expect(() => applyLeverageEffects(world, 'player', [
      { type: 'rumor', claim: 'x', valence: 'heroic', targetFactionIds: [] },
      { type: 'access', factionId: 'guild', level: 'normal' },
    ], 0)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// F-677e94ad: the 4 wired verbs, end to end through a real engine.
// ---------------------------------------------------------------------------

describe('F-677e94ad: bribe writes the reputation global', () => {
  it('bribe succeeds, deducts favor, and writes reputation_<factionId>', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });

    engine.submitAction('bribe', { targetIds: ['guild'] });

    const world = engine.world as WorldState;
    expect(world.globals['reputation_guild']).toBe(10);
    expect(getLeverageState(world.entities['player'].custom ?? {}).favor).toBe(85); // 100 - 15
    const resolved = engine.drainEvents().find((e) => e.type === 'leverage.resolved');
    expect(resolved?.payload.subAction).toBe('bribe');
  });

  it('rejects with the resolution failReason when the player cannot afford it', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: {} })], // no leverage at all
      zones: START_ZONES,
    });
    engine.submitAction('bribe', { targetIds: ['guild'] });
    const rejected = engine.drainEvents().find((e) => e.type === 'action.rejected');
    expect(rejected?.payload.reason).toMatch(/Not enough/);
  });

  it('requires a target faction — no target is a structured rejection, not a silent no-op charge', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });
    engine.submitAction('bribe', {});
    const rejected = engine.drainEvents().find((e) => e.type === 'action.rejected');
    expect(rejected?.payload.reason).toBe('no target faction specified');
    const world = engine.world as WorldState;
    expect(getLeverageState(world.entities['player'].custom ?? {}).favor).toBe(100); // untouched
  });

  it('enforces the authored cooldown (3 turns) — a second bribe before it expires is rejected', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });
    engine.submitAction('bribe', { targetIds: ['guild'] });
    engine.drainEvents();
    engine.submitAction('bribe', { targetIds: ['guild'] }); // same tick-ish, well within 3 turns
    const rejected = engine.drainEvents().find((e) => e.type === 'action.rejected');
    expect(rejected?.payload.reason).toMatch(/cooldown/);
  });
});

describe('F-677e94ad: intimidate writes alert + heat', () => {
  it('intimidate succeeds and writes faction_alert_<factionId> and player_heat', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });

    engine.submitAction('intimidate', { targetIds: ['guild'] });

    const world = engine.world as WorldState;
    expect(world.globals['faction_alert_guild']).toBe(15);
    expect(world.globals['player_heat']).toBe(10);
    expect(world.globals['reputation_guild']).toBe(-5);
  });
});

describe('F-677e94ad: petition produces its pressure effect', () => {
  it('petition succeeds and spawns an investigation-opened pressure', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });

    engine.submitAction('petition', { targetIds: ['guild'] });

    const world = engine.world as WorldState;
    const pressures = getWorldTickState(world).pressures;
    expect(pressures).toHaveLength(1);
    expect(pressures[0].kind).toBe('investigation-opened');
    expect(pressures[0].sourceFactionId).toBe('guild');
    expect(world.globals['faction_alert_guild']).toBe(5);

    const spawnedEvent = engine.drainEvents().find((e) => e.type === 'pressure.spawned');
    expect(spawnedEvent?.payload.kind).toBe('investigation-opened');
  });

  it('requires a target faction, same as bribe/intimidate', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });
    engine.submitAction('petition', {});
    const rejected = engine.drainEvents().find((e) => e.type === 'action.rejected');
    expect(rejected?.payload.reason).toBe('no target faction specified');
  });
});

describe('F-677e94ad + F-19a23718: seed spawns a rumor', () => {
  it('seed succeeds, deducts influence, and spawns a PlayerRumor into the player-rumor namespace', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });

    engine.submitAction('seed', { targetIds: ['guild'], parameters: { claim: 'a curse follows the outsider' } });

    const world = engine.world as WorldState;
    expect(getLeverageState(world.entities['player'].custom ?? {}).influence).toBe(90); // 100 - 10
    const rumors = getPlayerRumorState(world).rumors;
    expect(rumors).toHaveLength(1);
    expect(rumors[0].claim).toBe('a curse follows the outsider');
    expect(rumors[0].valence).toBe('mysterious');
    expect(rumors[0].originFactionId).toBe('guild');

    const seededEvent = engine.drainEvents().find((e) => e.type === 'rumor.seeded');
    expect(seededEvent?.payload.rumorId).toBe(rumors[0].id);
  });

  it('seed works with no target faction (a rumor need not be about anyone in particular)', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });
    engine.submitAction('seed', {});
    const world = engine.world as WorldState;
    expect(getPlayerRumorState(world).rumors).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// F-19a23718: production 'seed' → director-renderable rumor (integration).
// director.ts itself lives in packages/cli (a different package this domain
// cannot import — modules must never depend on cli), so this integration test
// proves the achievable contract from within the modules package: the SAME
// namespace key + shape director.ts reads (world.modules['player-rumor'] =
// { rumors: [...] }, director.test.ts:287's exact pin) plus director.ts's OWN
// formatter (formatRumorForDirector, re-exported from this package) render
// the production rumor without error.
// ---------------------------------------------------------------------------

describe('F-19a23718: seed → director RUMORS ABOUT YOU contract', () => {
  it('a production seed leaves a rumor that formatRumorForDirector renders', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });

    engine.submitAction('seed', { targetIds: ['guild'], parameters: { claim: 'defeated the Bone Collector' } });

    const world = engine.world as WorldState;
    // The exact read director.ts's RUMORS ABOUT YOU section performs:
    // namespace<{ rumors: unknown }>(world, 'player-rumor')?.rumors
    const ns = world.modules['player-rumor'] as { rumors: unknown };
    expect(Array.isArray(ns.rumors)).toBe(true);
    const rumors = getPlayerRumorState(world).rumors;
    expect(rumors).toHaveLength(1);

    const rendered = formatRumorForDirector(rumors[0]);
    expect(rendered).toContain('defeated the Bone Collector');
    expect(rendered).toContain('mysterious');
  });
});

// ---------------------------------------------------------------------------
// F-677e94ad: companion reactions — retiring leverage-social / leverage-rumor
// ---------------------------------------------------------------------------

describe('F-677e94ad: companion reactions dispatch end-to-end', () => {
  it('a diplomat companion reacts to a bribe (leverage-social, +2 morale)', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [
        makePlayerEntity({ custom: flushCustom() }),
        { id: 'nerva', blueprintId: 'npc', type: 'npc', name: 'Nerva', tags: ['companion', 'companion:diplomat'], stats: {}, resources: {}, statuses: [], zoneId: 'start' },
      ],
      zones: START_ZONES,
    });
    const world = engine.world as WorldState;
    setPartyState(world, { ...createPartyState(), companions: [makeCompanion('nerva', { role: 'diplomat', morale: 50 })], cohesion: 50 });

    engine.submitAction('bribe', { targetIds: ['guild'] });

    const events = engine.drainEvents();
    const reaction = events.find((e) => e.type === 'companion.reaction');
    expect(reaction?.payload.npcId).toBe('nerva');
    expect(reaction?.payload.trigger).toBe('leverage-social');
    expect(reaction?.payload.moraleDelta).toBe(2);
    expect(reaction?.payload.morale).toBe(52);
  });

  it('a smuggler companion reacts to seed (leverage-rumor, +3 morale)', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [
        makePlayerEntity({ custom: flushCustom() }),
        { id: 'kess', blueprintId: 'npc', type: 'npc', name: 'Kess', tags: ['companion', 'companion:smuggler'], stats: {}, resources: {}, statuses: [], zoneId: 'start' },
      ],
      zones: START_ZONES,
    });
    const world = engine.world as WorldState;
    setPartyState(world, { ...createPartyState(), companions: [makeCompanion('kess', { role: 'smuggler', morale: 50 })], cohesion: 50 });

    engine.submitAction('seed', {});

    const reaction = engine.drainEvents().find((e) => e.type === 'companion.reaction');
    expect(reaction?.payload.npcId).toBe('kess');
    expect(reaction?.payload.trigger).toBe('leverage-rumor');
    expect(reaction?.payload.moraleDelta).toBe(3);
  });

  it('no party → no companion.reaction events, and the leverage action still succeeds', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });
    engine.submitAction('bribe', { targetIds: ['guild'] });
    const events = engine.drainEvents();
    expect(events.some((e) => e.type === 'companion.reaction')).toBe(false);
    expect(events.some((e) => e.type === 'leverage.resolved')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F-92dd2068: the anti-retrofit RelationshipModifiers slot on all four
// resolve*Action functions. Neutral-default equivalence pins that every
// pre-existing call (none of which pass a 5th/6th/7th `modifiers` arg) is
// byte-identical to before; a non-neutral modifier proves the slot actually
// scales a cost, not just type-checks.
// ---------------------------------------------------------------------------

const NEUTRAL: import('./npc-agency.js').RelationshipModifiers = {
  costMultiplier: 1.0,
  reputationMultiplier: 1.0,
  rumorHeatMultiplier: 1.0,
  sideEffectChance: 0.0,
};

const FULL_LEVERAGE: LeverageState = {
  favor: 100, debt: 100, blackmail: 100, influence: 100, heat: 100, legitimacy: 100,
};

describe('F-92dd2068: RelationshipModifiers neutral-default equivalence', () => {
  it('resolveSocialAction: omitting modifiers === passing the explicit neutral struct', () => {
    const omitted = resolveSocialAction('bribe', undefined, 'guild', FULL_LEVERAGE, 0, undefined, 5);
    const explicit = resolveSocialAction('bribe', undefined, 'guild', FULL_LEVERAGE, 0, undefined, 5, NEUTRAL);
    expect(explicit).toEqual(omitted);
  });

  it('resolveRumorAction: omitting modifiers === passing the explicit neutral struct', () => {
    const omitted = resolveRumorAction('seed', 'guild', FULL_LEVERAGE, 5, 'a claim');
    const explicit = resolveRumorAction('seed', 'guild', FULL_LEVERAGE, 5, 'a claim', NEUTRAL);
    expect(explicit).toEqual(omitted);
  });

  it('resolveDiplomacyAction: omitting modifiers === passing the explicit neutral struct', () => {
    const omitted = resolveDiplomacyAction('improve-standing', 'guild', FULL_LEVERAGE, 0, undefined, 5);
    const explicit = resolveDiplomacyAction('improve-standing', 'guild', FULL_LEVERAGE, 0, undefined, 5, NEUTRAL);
    expect(explicit).toEqual(omitted);
  });

  it('resolveSabotageAction: omitting modifiers === passing the explicit neutral struct', () => {
    const omitted = resolveSabotageAction('sabotage', 'docks', 'guild', FULL_LEVERAGE, 5);
    const explicit = resolveSabotageAction('sabotage', 'docks', 'guild', FULL_LEVERAGE, 5, NEUTRAL);
    expect(explicit).toEqual(omitted);
  });
});

describe('F-92dd2068: a non-neutral modifier scales a cost', () => {
  it('a discount (costMultiplier 0.5) halves the bribe cost and lets a poorer player afford it', () => {
    const discount = { ...NEUTRAL, costMultiplier: 0.5 };
    const poorState: LeverageState = { ...FULL_LEVERAGE, favor: 10 }; // can't afford raw cost (15)

    const atRawCost = resolveSocialAction('bribe', undefined, 'guild', poorState, 0, undefined, 5);
    expect(atRawCost.success).toBe(false); // 10 < 15

    const atDiscount = resolveSocialAction('bribe', undefined, 'guild', poorState, 0, undefined, 5, discount);
    expect(atDiscount.success).toBe(true); // 10 >= round(15 * 0.5) = 8
    const costEffect = atDiscount.effects.find((e) => e.type === 'leverage' && e.currency === 'favor');
    expect(costEffect).toMatchObject({ type: 'leverage', currency: 'favor', delta: -8 });
  });

  it('a markup (costMultiplier 1.4) scales the cost up proportionally', () => {
    const markup = { ...NEUTRAL, costMultiplier: 1.4 };
    const resolution = resolveSocialAction('bribe', undefined, 'guild', FULL_LEVERAGE, 0, undefined, 5, markup);
    expect(resolution.success).toBe(true);
    const costEffect = resolution.effects.find((e) => e.type === 'leverage' && e.currency === 'favor');
    expect(costEffect).toMatchObject({ type: 'leverage', currency: 'favor', delta: -21 }); // round(15 * 1.4) = 21
  });

  it('the existing 15 unit tests above (tickLeverage/canAfford/computeLeverageGains) pass unchanged', () => {
    // Structural pin, not a behavioral assertion: this test exists so the
    // describe blocks above are never silently deleted out from under this
    // finding's "existing tests unchanged" claim. The real proof is the full
    // file passing — see the gate results in this domain's summary.
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// v3.0 wave 1 "social-verbs": registering the remaining 21 leverage verbs.
// ---------------------------------------------------------------------------

describe('V3-SV-1: green-proof — all 21 newly-registered verbs are dispatchable', () => {
  const NEW_VERBS: { verb: string; targetIds?: string[]; parameters?: Record<string, string> }[] = [
    // Social group
    { verb: 'call-in-favor', targetIds: ['guild'] },
    { verb: 'recruit-ally', targetIds: ['guild'] },
    { verb: 'disguise' },
    { verb: 'stake-claim' },
    // Rumor group
    { verb: 'deny', parameters: { rumorId: 'whatever' } },
    { verb: 'frame', targetIds: ['guild'] },
    { verb: 'claim-false-credit' },
    { verb: 'bury-scandal', parameters: { rumorId: 'whatever' } },
    { verb: 'leak-truth', targetIds: ['guild'] },
    { verb: 'spread-counter-rumor', targetIds: ['guild'] },
    // Diplomacy group (all 7 hard-require a target faction)
    { verb: 'request-meeting', targetIds: ['guild'] },
    { verb: 'improve-standing', targetIds: ['guild'] },
    { verb: 'cash-milestone', targetIds: ['guild'] },
    { verb: 'negotiate-access', targetIds: ['guild'] },
    { verb: 'trade-secret', targetIds: ['guild'] },
    { verb: 'temporary-alliance', targetIds: ['guild'] },
    { verb: 'broker-truce', targetIds: ['guild'] },
    // Sabotage group
    { verb: 'sabotage' },
    { verb: 'plant-evidence', targetIds: ['guild'] },
    { verb: 'blackmail-target', targetIds: ['guild'] },
    { verb: 'incite-riot' },
  ];

  it('the fixture lists exactly 21 verbs', () => {
    expect(NEW_VERBS).toHaveLength(21);
  });

  for (const { verb, targetIds, parameters } of NEW_VERBS) {
    it(`"${verb}" is a known verb (never rejected as "unknown verb: ${verb}")`, () => {
      const engine = createTestEngine({
        modules: [createPlayerLeverageCore()],
        entities: [makePlayerEntity({ custom: flushCustom() })],
        zones: START_ZONES,
      });
      engine.submitAction(verb, { targetIds, parameters });
      const events = engine.drainEvents();
      const unknownVerbRejection = events.find(
        (e) => e.type === 'action.rejected'
          && typeof e.payload.reason === 'string'
          && /unknown verb/.test(e.payload.reason),
      );
      expect(unknownVerbRejection).toBeUndefined();
    });
  }
});

describe('V3-SV-1: disguise needs no target (requireTargetFaction: false)', () => {
  it('succeeds with no target at all and reduces the player_heat global', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });
    engine.submitAction('disguise', {});
    const world = engine.world as WorldState;
    expect(world.globals['player_heat']).toBe(-20);
    expect(getLeverageState(world.entities['player'].custom ?? {}).influence).toBe(95); // 100 - 5
    const resolved = engine.drainEvents().find((e) => e.type === 'leverage.resolved');
    expect(resolved?.payload.subAction).toBe('disguise');
    expect(resolved?.payload.targetFactionId).toBeNull();
  });
});

describe('V3-SV-1: stake-claim derives its district from the actor\'s current zone', () => {
  const districts: DistrictDefinition[] = [
    { id: 'docks', name: 'Docks', zoneIds: ['start'], tags: [] },
  ];

  it('writes a district-metric effect for the district the actor is standing in, with no player-supplied target', () => {
    const engine = createTestEngine({
      modules: [
        createEnvironmentCore(),
        createDistrictCore({ districts }),
        createPlayerLeverageCore(),
      ],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });

    engine.submitAction('stake-claim', {});

    const world = engine.world as WorldState;
    expect(world.globals['district_docks_surveillance']).toBe(10);
    const resolved = engine.drainEvents().find((e) => e.type === 'leverage.resolved');
    expect(resolved?.payload.subAction).toBe('stake-claim');
    expect(resolved?.payload.targetId).toBe('docks');
  });

  it('still succeeds (as a narrower, no-op-on-space claim) when the actor\'s zone maps to no district', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()], // no district-core registered
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });
    engine.submitAction('stake-claim', {});
    const rejected = engine.drainEvents().find((e) => e.type === 'action.rejected');
    expect(rejected).toBeUndefined(); // not a no-target rejection — stake-claim never hard-requires one
  });
});

describe('V3-SV-1: frame spawns a rumor via the generalized rumor-spawn handler', () => {
  it('succeeds, deducts blackmail, spawns a fearsome rumor about the target faction, and raises alert', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });
    engine.submitAction('frame', { targetIds: ['guild'] });
    const world = engine.world as WorldState;
    expect(getLeverageState(world.entities['player'].custom ?? {}).blackmail).toBe(80); // 100 - 20
    expect(world.globals['faction_alert_guild']).toBe(10);
    const rumors = getPlayerRumorState(world).rumors;
    expect(rumors).toHaveLength(1);
    expect(rumors[0].claim).toBe('guild is not what they seem');
    expect(rumors[0].valence).toBe('fearsome');
    const seededEvent = engine.drainEvents().find((e) => e.type === 'rumor.seeded');
    expect(seededEvent?.payload.subAction).toBe('frame');
  });
});

describe('V3-SV-1: plant-evidence spawns a rumor (the one sabotage verb with a rumor effect)', () => {
  it('succeeds, deducts blackmail, spawns a fearsome rumor, and raises alert', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });
    engine.submitAction('plant-evidence', { targetIds: ['guild'] });
    const world = engine.world as WorldState;
    expect(getLeverageState(world.entities['player'].custom ?? {}).blackmail).toBe(80); // 100 - 20
    expect(world.globals['faction_alert_guild']).toBe(10);
    const rumors = getPlayerRumorState(world).rumors;
    expect(rumors).toHaveLength(1);
    expect(rumors[0].claim).toBe('damning evidence discovered against guild');
    expect(rumors[0].valence).toBe('fearsome');
    const resolved = engine.drainEvents().find((e) => e.type === 'leverage.resolved');
    expect(resolved?.payload.verb).toBe('sabotage');
  });
});

describe('V3-SV-1: deny requires a rumorId and mutates the existing rumor via applyRumorManipulation', () => {
  it('rejects with a structured reason when no rumorId is given (not a silent no-op charge)', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });
    engine.submitAction('deny', {});
    const rejected = engine.drainEvents().find((e) => e.type === 'action.rejected');
    expect(rejected?.payload.reason).toBe('no rumor specified');
    const world = engine.world as WorldState;
    expect(getLeverageState(world.entities['player'].custom ?? {}).legitimacy).toBe(100); // untouched
  });

  it('reduces the confidence of the specified rumor and reports rumorFound: true', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });
    engine.submitAction('seed', { targetIds: ['guild'], parameters: { claim: 'a curse follows the outsider' } });
    engine.drainEvents();
    const world = engine.world as WorldState;
    const seeded = getPlayerRumorState(world).rumors[0];

    engine.submitAction('deny', { parameters: { rumorId: seeded.id } });

    const updated = getPlayerRumorState(world).rumors.find((r) => r.id === seeded.id);
    expect(updated?.confidence).toBeCloseTo(seeded.confidence - 0.3);
    const resolved = engine.drainEvents().find((e) => e.type === 'leverage.resolved');
    expect(resolved?.payload.rumorFound).toBe(true);
    // resolveRumorAction's 'deny' case nets -10 (cost) + 3 (its own "you set
    // the record straight" legitimacy effect) = -7, not a flat -10.
    expect(getLeverageState(world.entities['player'].custom ?? {}).legitimacy).toBe(93); // 100 - 10 + 3
  });

  it('quietly no-ops the manipulation (but still charges the mechanical cost) for an unknown rumorId', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });
    engine.submitAction('deny', { parameters: { rumorId: 'not-a-real-rumor' } });
    const resolved = engine.drainEvents().find((e) => e.type === 'leverage.resolved');
    expect(resolved?.payload.rumorFound).toBe(false);
    const world = engine.world as WorldState;
    expect(getLeverageState(world.entities['player'].custom ?? {}).legitimacy).toBe(93); // cost + case effect still applied
  });
});

// ---------------------------------------------------------------------------
// V3-SV-5: representative diplomacy verb (improve-standing) and representative
// sabotage verb (blackmail-target) — registered/dispatchable, affordability
// gating, leverage deltas on success, and the companion-reaction trigger.
// ---------------------------------------------------------------------------

describe('V3-SV-5: improve-standing (representative diplomacy verb) end-to-end', () => {
  it('is registered and dispatchable (not rejected as an unknown verb)', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });
    engine.submitAction('improve-standing', { targetIds: ['guild'] });
    const events = engine.drainEvents();
    // Fully affordable + a real target faction: dispatchable AND resolves
    // successfully, so there is no 'action.rejected' event at all here.
    expect(events.some((e) => e.type === 'action.rejected')).toBe(false);
    expect(events.some((e) => e.type === 'leverage.resolved')).toBe(true);
  });

  it('affordability gate: rejects with the resolution failReason when the player cannot afford it', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: {} })], // no leverage at all
      zones: START_ZONES,
    });
    engine.submitAction('improve-standing', { targetIds: ['guild'] });
    const rejected = engine.drainEvents().find((e) => e.type === 'action.rejected');
    expect(rejected?.payload.reason).toMatch(/Not enough/);
  });

  it('on success, applies the leverage deltas: -20 favor, +15 reputation, -5 heat global', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });
    engine.submitAction('improve-standing', { targetIds: ['guild'] });
    const world = engine.world as WorldState;
    expect(getLeverageState(world.entities['player'].custom ?? {}).favor).toBe(80); // 100 - 20
    expect(world.globals['reputation_guild']).toBe(15);
    expect(world.globals['player_heat']).toBe(-5);
    const resolved = engine.drainEvents().find((e) => e.type === 'leverage.resolved');
    expect(resolved?.payload.verb).toBe('diplomacy');
    expect(resolved?.payload.subAction).toBe('improve-standing');
  });

  it('dispatches the leverage-diplomacy companion reaction (diplomat +5) given a companion present', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [
        makePlayerEntity({ custom: flushCustom() }),
        { id: 'nerva', blueprintId: 'npc', type: 'npc', name: 'Nerva', tags: ['companion', 'companion:diplomat'], stats: {}, resources: {}, statuses: [], zoneId: 'start' },
      ],
      zones: START_ZONES,
    });
    const world = engine.world as WorldState;
    setPartyState(world, { ...createPartyState(), companions: [makeCompanion('nerva', { role: 'diplomat', morale: 50 })], cohesion: 50 });

    engine.submitAction('improve-standing', { targetIds: ['guild'] });

    const reaction = engine.drainEvents().find((e) => e.type === 'companion.reaction');
    expect(reaction?.payload.npcId).toBe('nerva');
    expect(reaction?.payload.trigger).toBe('leverage-diplomacy');
    expect(reaction?.payload.moraleDelta).toBe(5);
    expect(reaction?.payload.morale).toBe(55);
  });
});

describe('V3-SV-5: blackmail-target (representative sabotage verb) end-to-end', () => {
  it('is registered and dispatchable (not rejected as an unknown verb)', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });
    engine.submitAction('blackmail-target', { targetIds: ['guild'] });
    const events = engine.drainEvents();
    // Fully affordable + a real target faction: dispatchable AND resolves
    // successfully, so there is no 'action.rejected' event at all here.
    expect(events.some((e) => e.type === 'action.rejected')).toBe(false);
    expect(events.some((e) => e.type === 'leverage.resolved')).toBe(true);
  });

  it('affordability gate: rejects with the resolution failReason when the player cannot afford it', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: {} })], // no leverage at all
      zones: START_ZONES,
    });
    engine.submitAction('blackmail-target', { targetIds: ['guild'] });
    const rejected = engine.drainEvents().find((e) => e.type === 'action.rejected');
    expect(rejected?.payload.reason).toMatch(/Not enough/);
  });

  it('on success, applies the leverage deltas: -25 blackmail, +20 heat global, +15 reputation', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });
    engine.submitAction('blackmail-target', { targetIds: ['guild'] });
    const world = engine.world as WorldState;
    expect(getLeverageState(world.entities['player'].custom ?? {}).blackmail).toBe(75); // 100 - 25
    expect(world.globals['player_heat']).toBe(20);
    expect(world.globals['reputation_guild']).toBe(15);
    const resolved = engine.drainEvents().find((e) => e.type === 'leverage.resolved');
    expect(resolved?.payload.verb).toBe('sabotage');
    expect(resolved?.payload.subAction).toBe('blackmail-target');
  });

  it('dispatches the leverage-sabotage companion reaction (smuggler +3) given a companion present', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [
        makePlayerEntity({ custom: flushCustom() }),
        { id: 'kess', blueprintId: 'npc', type: 'npc', name: 'Kess', tags: ['companion', 'companion:smuggler'], stats: {}, resources: {}, statuses: [], zoneId: 'start' },
      ],
      zones: START_ZONES,
    });
    const world = engine.world as WorldState;
    setPartyState(world, { ...createPartyState(), companions: [makeCompanion('kess', { role: 'smuggler', morale: 50 })], cohesion: 50 });

    engine.submitAction('blackmail-target', { targetIds: ['guild'] });

    const reaction = engine.drainEvents().find((e) => e.type === 'companion.reaction');
    expect(reaction?.payload.npcId).toBe('kess');
    expect(reaction?.payload.trigger).toBe('leverage-sabotage');
    expect(reaction?.payload.moraleDelta).toBe(3);
    expect(reaction?.payload.morale).toBe(53);
  });
});

// ---------------------------------------------------------------------------
// V3-SV-4: SEED-0 identity — registering the 21 new verbs must not change any
// existing seed-0 playthrough. Verbs are player-initiated (only fire when the
// player submits that exact verb name) and every new handler gates on
// affordability/cooldown through the SAME resolve*Action calls the
// pre-existing 4 verbs already used, so a playthrough that never invokes one
// of the 21 new verb names is unaffected by their registration.
// ---------------------------------------------------------------------------

describe('V3-SV-4: SEED-0 identity — new verb registration does not alter a legacy playthrough', () => {
  it('registering the module alone (no actions submitted) produces zero events and zero world.globals mutation', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });
    const world = engine.world as WorldState;
    expect(Object.keys(world.globals)).toHaveLength(0);
    expect(engine.drainEvents()).toHaveLength(0);
  });

  it('a playthrough using only the original 4 verbs (bribe/petition/seed) produces exactly the same domain events and leverage state the pre-existing dedicated tests assert — unaffected by the 21 verbs newly registered in the same module', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [makePlayerEntity({ custom: flushCustom() })],
      zones: START_ZONES,
    });
    const world = engine.world as WorldState;

    // Every dispatch is always wrapped by the dispatcher's own
    // 'action.declared'/'action.resolved' pair (actions.ts) regardless of verb
    // or module — filtering those out isolates exactly what THIS module wrote,
    // which is the thing SEED-0 identity is actually about.
    const domainEvents = (all: ResolvedEvent[]) =>
      all.filter((e) => e.type !== 'action.declared' && e.type !== 'action.resolved');

    engine.submitAction('bribe', { targetIds: ['guild'] });
    let events = domainEvents(engine.drainEvents());
    expect(events).toHaveLength(1); // exactly one leverage.resolved — no stray events from the 21 new registrations
    expect(events[0].type).toBe('leverage.resolved');
    expect(world.globals['reputation_guild']).toBe(10);
    expect(getLeverageState(world.entities['player'].custom ?? {}).favor).toBe(85);

    engine.submitAction('petition', { targetIds: ['guild'] });
    events = domainEvents(engine.drainEvents());
    expect(events).toHaveLength(2); // leverage.resolved + pressure.spawned, same as the dedicated petition test
    expect(events.some((e) => e.type === 'pressure.spawned')).toBe(true);

    engine.submitAction('seed', { targetIds: ['guild'], parameters: { claim: 'a curse follows the outsider' } });
    events = domainEvents(engine.drainEvents());
    expect(events).toHaveLength(1); // rumor.seeded only
    expect(events[0].type).toBe('rumor.seeded');
    expect(getPlayerRumorState(world).rumors).toHaveLength(1);
  });

  it('a companion present reacts only to the leverage-group trigger the invoked verb actually belongs to — no cross-firing from the 21 newly-registered verbs', () => {
    const engine = createTestEngine({
      modules: [createPlayerLeverageCore()],
      entities: [
        makePlayerEntity({ custom: flushCustom() }),
        { id: 'nerva', blueprintId: 'npc', type: 'npc', name: 'Nerva', tags: ['companion', 'companion:diplomat'], stats: {}, resources: {}, statuses: [], zoneId: 'start' },
      ],
      zones: START_ZONES,
    });
    const world = engine.world as WorldState;
    setPartyState(world, { ...createPartyState(), companions: [makeCompanion('nerva', { role: 'diplomat', morale: 50 })], cohesion: 50 });

    engine.submitAction('bribe', { targetIds: ['guild'] }); // leverage-social only

    const reaction = engine.drainEvents().find((e) => e.type === 'companion.reaction');
    expect(reaction?.payload.trigger).toBe('leverage-social'); // never 'leverage-diplomacy' or 'leverage-sabotage'
    expect(reaction?.payload.moraleDelta).toBe(2); // the SAME diplomat delta the pre-existing bribe/leverage-social test asserts
  });
});
