// world-tick (F-ENG005) — the wire between defeat-fallout's accrued ledger
// (player_heat / district safety / reputation / faction alert) and the
// pressure lifecycle. These tests pin the tick semantics:
//   - heat is load-bearing: below HEAT_WAKE_THRESHOLD nothing spawns even
//     when reputation/alert would qualify
//   - at the wake threshold the AUTHORED spawn conditions pick the pressure
//     (investigation at rep −30/alert 40, bounty at −50/60 — pressure-system's
//     own thresholds, unchanged)
//   - hidden pressures surface over time and the reveal is the player-visible
//     debut; sustained heat sharpens urgency across narrator bands; expiry
//     applies fallout to the SAME globals and mints chains; quiet rounds decay
//     heat
//   - deterministic: same world in, same events out
//   - guarded: a poisoned state loses one tick, never the session

import { describe, it, expect, vi } from 'vitest';
import { createTestEngine, Engine } from '@ai-rpg-engine/core';
import type { EntityState, ResolvedEvent } from '@ai-rpg-engine/core';
import type { PressureFallout } from './pressure-resolution.js';
import { statusCore } from './status-core.js';
import { createCombatCore } from './combat-core.js';
import { createEnvironmentCore } from './environment-core.js';
import { createDistrictCore, getDistrictState } from './district-core.js';
import { createDefeatFallout } from './defeat-fallout.js';
import { traversalCore } from './traversal-core.js';
import { createEncounterSpawn, unregisterEncounterSpawnContent } from './encounter-spawn.js';
import { makePressure } from './pressure-system.js';
import {
  createEconomyCore,
  getSupplyLevel,
  getDistrictEconomy,
  tickDistrictEconomy,
  type EconomyCoreState,
} from './economy-core.js';
import {
  getPersistedOpportunities,
  setPersistedOpportunities,
  formatOpportunityListForDirector,
  type OpportunityState,
} from './opportunity-core.js';
import {
  runWorldTick,
  buildPressureInputs,
  getWorldTickState,
  createWorldTick,
  hasWorldTickState,
  getActivePressures,
  getResolvedPressures,
  applyCompanionReactions,
  HEAT_KEY,
  HEAT_WAKE_THRESHOLD,
  HEAT_ESCALATION_THRESHOLD,
  QUIET_ROUNDS_BEFORE_DECAY,
  DISTRICT_STABILITY_BASE,
  CHAIN_TURNS_REMAINING,
  RESOLVED_PRESSURES_KEPT,
  type WorldTickState,
} from './world-tick.js';
import {
  createCompanionCore,
  getPartyState,
  setPartyState,
  syncCompanionCustomFields,
  COMPANION_TAG,
  companionRoleTag,
  type CompanionState,
} from './companion-core.js';
import { createCognitionCore } from './cognition-core.js';
import { createFactionCognition } from './faction-cognition.js';
import {
  getPersistedNpcProfiles,
  getPersistedNpcObligations,
  type LoyaltyBreakpoint,
} from './npc-agency.js';
import { MORALE_FLOOR_FALLBACK } from './companion-reactions.js';
import { getLeverageState } from './player-leverage.js';
import { createProgressionCore, addCurrency } from './progression-core.js';

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [], neighbors: ['zone-a'] },
];

const districts = [{ id: 'district-1', name: 'Market', zoneIds: ['zone-a'], tags: [] }];

const makePlayer = (overrides?: Partial<EntityState>): EntityState => ({
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId: 'zone-a',
  ...overrides,
});

const makeEnemy = (id: string, overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type: 'enemy',
  name: id,
  tags: ['enemy'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 1, stamina: 5 },
  statuses: [],
  zoneId: 'zone-a',
  ...overrides,
});

/** Bare engine — pressure state and globals are injected directly. */
function makeBareEngine(globals: Record<string, string | number | boolean> = {}, seed = 1) {
  return createTestEngine({
    modules: [],
    entities: [makePlayer()],
    zones,
    globals,
    seed,
  });
}

/** Full stack — real combat kills feed real defeat-fallout accrual. */
function makeCombatEngine() {
  return createTestEngine({
    modules: [
      statusCore,
      createCombatCore(),
      createEnvironmentCore(),
      createDistrictCore({ districts }),
      createDefeatFallout({
        factions: [{ factionId: 'watch', entityIds: ['w1', 'w2', 'w3'] }],
        playerId: 'player',
      }),
    ],
    entities: [makePlayer(), makeEnemy('w1'), makeEnemy('w2'), makeEnemy('w3')],
    zones,
  });
}

function killEntity(engine: ReturnType<typeof createTestEngine>, targetId: string): void {
  for (let i = 0; i < 50; i++) {
    engine.world.entities.player.resources.stamina = 5;
    const events = engine.submitAction('attack', { targetIds: [targetId] });
    if (events.some((e) => e.type === 'combat.entity.defeated' && e.payload.entityId === targetId)) {
      return;
    }
  }
  throw new Error(`Failed to defeat ${targetId}`);
}

/** Combat + companion-core, for companion-reaction wiring tests (F-b595731a). */
function makeCompanionEngine() {
  return createTestEngine({
    modules: [statusCore, createCombatCore(), createCompanionCore()],
    entities: [
      makePlayer(),
      makeEnemy('w1', { resources: { hp: 1, stamina: 5 } }),
      {
        id: 'mira', blueprintId: 'mira', type: 'npc', name: 'Mira',
        tags: ['npc', 'recruitable', 'fighter'], stats: {}, resources: { hp: 10 }, statuses: [], zoneId: 'zone-a',
      },
    ],
    zones,
  });
}

function partyCompanions(engine: ReturnType<typeof createTestEngine>): CompanionState[] {
  return getPartyState(engine.world).companions;
}

function pressureEvents(engine: ReturnType<typeof createTestEngine>): ResolvedEvent[] {
  return engine.world.eventLog.filter((e) => e.type.startsWith('pressure.'));
}

describe('world-tick — heat gates the spawn valve', () => {
  it('below HEAT_WAKE_THRESHOLD nothing spawns even when rep/alert qualify', () => {
    const engine = makeBareEngine({
      reputation_watch: -50,
      faction_alert_watch: 60,
      [HEAT_KEY]: HEAT_WAKE_THRESHOLD - 1,
    });

    const result = runWorldTick(engine);

    expect(result.ok).toBe(true);
    expect(result.spawned).toEqual([]);
    expect(result.active).toEqual([]);
    expect(pressureEvents(engine)).toEqual([]);
  });

  it('at the wake threshold the authored conditions spawn (investigation, hidden — no presentation)', () => {
    const engine = makeBareEngine({
      reputation_watch: -30,
      faction_alert_watch: 40,
      [HEAT_KEY]: HEAT_WAKE_THRESHOLD,
    });

    const result = runWorldTick(engine);

    expect(result.spawned).toHaveLength(1);
    expect(result.spawned[0].kind).toBe('investigation-opened');
    expect(result.spawned[0].visibility).toBe('hidden');

    const events = pressureEvents(engine);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('pressure.spawned');
    expect(events[0].payload.visibility).toBe('hidden');
    // Hidden spawns are simulation record only: event-level hidden, no
    // presentation block — they must not tint the round's tone.
    expect(events[0].visibility).toBe('hidden');
    expect(events[0].presentation).toBeUndefined();
  });

  it('a visible spawn (bounty) carries the narrator presentation block', () => {
    const engine = makeBareEngine({
      reputation_watch: -50,
      faction_alert_watch: 60,
      [HEAT_KEY]: HEAT_WAKE_THRESHOLD,
    });

    const result = runWorldTick(engine);

    expect(result.spawned[0].kind).toBe('bounty-issued');
    expect(result.spawned[0].visibility).toBe('rumored');

    const [event] = pressureEvents(engine);
    expect(event.visibility).toBe('public');
    expect(event.presentation).toEqual({ channels: ['narrator'], priority: 'high' });
    expect(event.payload.description).toBe('watch has placed a bounty on the player');
  });

  it('scarcity holds: an active pressure blocks an immediate second spawn', () => {
    const engine = makeBareEngine({
      reputation_watch: -50,
      faction_alert_watch: 60,
      [HEAT_KEY]: HEAT_WAKE_THRESHOLD,
    });

    expect(runWorldTick(engine).spawned).toHaveLength(1);
    const again = runWorldTick(engine);
    expect(again.spawned).toEqual([]);
    expect(again.active).toHaveLength(1);
  });
});

describe('world-tick — real kills drive the loop end-to-end', () => {
  it('three faction kills accrue heat/rep/alert and the next tick opens an investigation', () => {
    const engine = makeCombatEngine();

    killEntity(engine, 'w1');
    // Two kills: heat 10, rep −20, alert 30 — the world is awake but the
    // authored investigation condition (−30/40) is not yet met.
    killEntity(engine, 'w2');
    const early = runWorldTick(engine);
    expect(early.spawned).toEqual([]);

    killEntity(engine, 'w3');
    expect(engine.world.globals[HEAT_KEY]).toBe(15);
    expect(engine.world.globals['reputation_watch']).toBe(-30);
    expect(engine.world.globals['faction_alert_watch']).toBe(45);

    const result = runWorldTick(engine);
    expect(result.spawned).toHaveLength(1);
    expect(result.spawned[0].kind).toBe('investigation-opened');
    expect(result.spawned[0].sourceFactionId).toBe('watch');
  });
});

describe('world-tick — hidden pressures surface over time', () => {
  it('a hidden investigation reveals once age crosses the visibility ladder', () => {
    const engine = makeBareEngine({
      reputation_watch: -30,
      faction_alert_watch: 40,
      [HEAT_KEY]: HEAT_WAKE_THRESHOLD,
    });

    runWorldTick(engine); // spawns hidden at the current tick

    // Age the pressure past VISIBILITY_ESCALATION_TICKS (3).
    for (let i = 0; i < 3; i++) engine.store.advanceTick();
    const result = runWorldTick(engine);

    expect(result.revealed).toHaveLength(1);
    expect(result.revealed[0].visibility).toBe('rumored');

    const reveals = pressureEvents(engine).filter((e) => e.type === 'pressure.revealed');
    expect(reveals).toHaveLength(1);
    expect(reveals[0].presentation).toEqual({ channels: ['narrator'], priority: 'high' });

    // The reveal is a one-time debut — the next tick does not repeat it.
    const after = runWorldTick(engine);
    expect(after.revealed).toEqual([]);
  });
});

describe('world-tick — sustained heat sharpens urgency', () => {
  function withActivePressure(urgency: number, heat: number) {
    const engine = makeBareEngine({ [HEAT_KEY]: heat });
    const state = getWorldTickState(engine.store.state);
    state.pressures = [
      makePressure({
        kind: 'bounty-issued',
        sourceFactionId: 'watch',
        description: 'watch has placed a bounty on the player',
        triggeredBy: 'test',
        urgency,
        visibility: 'rumored',
        turnsRemaining: 10,
        potentialOutcomes: [],
        tags: ['hostile'],
        currentTick: 0,
      }),
    ];
    return engine;
  }

  it('below HEAT_ESCALATION_THRESHOLD urgency stays put', () => {
    const engine = withActivePressure(0.35, HEAT_ESCALATION_THRESHOLD - 1);
    const result = runWorldTick(engine);
    expect(result.active[0].urgency).toBe(0.35);
    expect(result.escalated).toEqual([]);
  });

  it('at the threshold urgency steps up and a band crossing emits (distant → growing)', () => {
    const engine = withActivePressure(0.35, HEAT_ESCALATION_THRESHOLD);
    const result = runWorldTick(engine);

    expect(result.active[0].urgency).toBe(0.4);
    expect(result.escalated).toHaveLength(1);

    const [event] = pressureEvents(engine).filter((e) => e.type === 'pressure.escalated');
    expect(event.payload.band).toBe('growing');
    expect(event.presentation).toEqual({ channels: ['narrator'], priority: 'normal' });
  });

  it('crossing into urgent flags the event high-priority', () => {
    const engine = withActivePressure(0.65, HEAT_ESCALATION_THRESHOLD);
    const result = runWorldTick(engine);

    expect(result.active[0].urgency).toBe(0.7);
    const [event] = pressureEvents(engine).filter((e) => e.type === 'pressure.escalated');
    expect(event.payload.band).toBe('urgent');
    expect(event.presentation).toEqual({ channels: ['narrator'], priority: 'high' });
  });

  it('within-band steps stay silent (no event spam every tick)', () => {
    const engine = withActivePressure(0.45, HEAT_ESCALATION_THRESHOLD);
    const result = runWorldTick(engine);
    expect(result.active[0].urgency).toBe(0.5);
    expect(result.escalated).toEqual([]);
    expect(pressureEvents(engine).filter((e) => e.type === 'pressure.escalated')).toEqual([]);
  });
});

describe('world-tick — expiry applies fallout to the shared ledger', () => {
  it('an expired bounty hits rep/alert and chains a revenge attempt', () => {
    const engine = makeBareEngine({
      reputation_watch: -60,
      faction_alert_watch: 60,
      [HEAT_KEY]: 0, // isolate: expiry fallout owes no heat gate
    });
    const state = getWorldTickState(engine.store.state);
    state.pressures = [
      makePressure({
        kind: 'bounty-issued',
        sourceFactionId: 'watch',
        description: 'watch has placed a bounty on the player',
        triggeredBy: 'test',
        urgency: 0.7,
        visibility: 'rumored',
        turnsRemaining: 0, // expires on entry to this tick
        potentialOutcomes: [],
        tags: ['hostile'],
        currentTick: 0,
      }),
    ];

    const result = runWorldTick(engine);

    // Fallout (pressure-resolution's authored expired-ignored table for
    // bounty-issued): rep −10, alert +10, chain revenge-attempt.
    expect(result.expired).toHaveLength(1);
    expect(engine.world.globals['reputation_watch']).toBe(-70);
    expect(engine.world.globals['faction_alert_watch']).toBe(70);

    expect(result.spawned).toHaveLength(1);
    const chain = result.spawned[0];
    expect(chain.kind).toBe('revenge-attempt');
    expect(chain.visibility).toBe('rumored');
    expect(chain.turnsRemaining).toBe(CHAIN_TURNS_REMAINING);
    expect(chain.chainedFrom).toBeDefined();

    const events = pressureEvents(engine);
    const expired = events.find((e) => e.type === 'pressure.expired');
    expect(expired?.payload.summary).toBe('bounty issued expired without resolution');
    expect(expired?.presentation).toEqual({ channels: ['narrator'], priority: 'normal' });
    const chained = events.find((e) => e.type === 'pressure.spawned');
    expect(chained?.payload.chainedFrom).toBe(chain.chainedFrom);
    expect(chained?.presentation).toEqual({ channels: ['narrator'], priority: 'high' });
  });

  it('a hidden pressure expires silently — no presentation, event stays hidden', () => {
    const engine = makeBareEngine({ [HEAT_KEY]: 0 });
    const state = getWorldTickState(engine.store.state);
    state.pressures = [
      makePressure({
        kind: 'investigation-opened',
        sourceFactionId: 'watch',
        description: 'watch has opened an investigation',
        triggeredBy: 'test',
        urgency: 0.4,
        visibility: 'hidden',
        turnsRemaining: 0,
        potentialOutcomes: [],
        tags: ['probe'],
        currentTick: 0,
      }),
    ];

    runWorldTick(engine);

    const expired = pressureEvents(engine).find((e) => e.type === 'pressure.expired');
    expect(expired?.visibility).toBe('hidden');
    expect(expired?.presentation).toBeUndefined();
  });
});

describe('world-tick — heat decays only after sustained quiet', () => {
  it('a fight rhythm holds heat; decay starts past the grace window and a new kill resets it', () => {
    const engine = makeBareEngine({ [HEAT_KEY]: 20 });

    // First tick: heat rose since the (zero) watermark — violent round.
    expect(runWorldTick(engine).heat).toBe(20);
    // Quiet rounds inside the grace window (misses, movement) hold heat.
    for (let i = 1; i < QUIET_ROUNDS_BEFORE_DECAY; i++) {
      expect(runWorldTick(engine).heat).toBe(20);
    }
    // The grace is spent — sustained quiet starts cooling off.
    expect(runWorldTick(engine).heat).toBe(19);
    expect(engine.world.globals[HEAT_KEY]).toBe(19);
    expect(runWorldTick(engine).heat).toBe(18);

    // A new kill's worth of heat lands — the streak resets, decay pauses.
    engine.store.state.globals[HEAT_KEY] = 25;
    expect(runWorldTick(engine).heat).toBe(25);
    expect(runWorldTick(engine).heat).toBe(25); // quiet again, but inside grace
  });

  it('a world with no heat never gains the global', () => {
    const engine = makeBareEngine();
    runWorldTick(engine);
    expect(HEAT_KEY in engine.world.globals).toBe(false);
  });
});

describe('world-tick — determinism', () => {
  it('same world in, same events out — byte-identical across instances', () => {
    const run = () => {
      const engine = makeBareEngine(
        { reputation_watch: -50, faction_alert_watch: 60, [HEAT_KEY]: 30 },
        7,
      );
      runWorldTick(engine); // spawn
      engine.store.advanceTick();
      runWorldTick(engine); // escalate step
      engine.store.advanceTick();
      runWorldTick(engine);
      return {
        events: pressureEvents(engine).map((e) => ({ id: e.id, type: e.type, payload: e.payload })),
        state: JSON.parse(JSON.stringify(getWorldTickState(engine.store.state))),
      };
    };

    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('world-tick — guarded like the NPC round', () => {
  it('a poisoned state loses the tick, logs one bounded line, and never throws', () => {
    const engine = makeBareEngine({ [HEAT_KEY]: 20 });
    engine.store.state.modules['world-tick'] = { pressures: 42 }; // for..of throws
    const log = vi.fn();

    const result = runWorldTick(engine, { log });

    expect(result.ok).toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][0]);
    expect(line).toContain('pressures slip out of focus');
    expect(line.length).toBeLessThan(260);
    expect(line).not.toContain('\n');
  });
});

describe('world-tick — the encounter spawn step rides the ONE world tick (F-ENG005-encounter-spawn-wiring)', () => {
  it('a registered pack spawns from a zone entry inside runWorldTick, in the same round delta', () => {
    const engine = createTestEngine({
      modules: [
        traversalCore,
        createEncounterSpawn({
          gameId: 'test-harness',
          encounters: [
            {
              id: 'street-trouble',
              name: 'Street Trouble',
              participants: [{ entityId: 'tough' }],
              composition: 'patrol',
              validZoneIds: ['zone-b'],
            },
          ],
          entityTemplates: [makeEnemy('tough', { zoneId: 'zone-b' })],
          zoneTables: { 'zone-b': ['street-trouble'] },
        }),
      ],
      entities: [makePlayer()],
      zones,
      startZone: 'zone-a',
      seed: 3,
    });

    // Bounded walk under the deterministic seed (chance is capped below 1).
    for (let i = 0; i < 30; i++) {
      const logLenBefore = engine.world.eventLog.length;
      engine.submitAction('move', { targetIds: [i % 2 === 0 ? 'zone-b' : 'zone-a'] });
      const result = runWorldTick(engine);
      expect(result.ok).toBe(true);
      if (result.encounters.length > 0) {
        // The spawn event and the zone entry share ONE round delta — the
        // narration layer presents exactly this slice.
        const delta = engine.world.eventLog.slice(logLenBefore);
        expect(delta.some((e) => e.type === 'world.zone.entered')).toBe(true);
        expect(delta.some((e) => e.type === 'encounter.spawned')).toBe(true);
        expect(result.encounters[0].encounterId).toBe('street-trouble');
        unregisterEncounterSpawnContent('test-harness');
        return;
      }
    }
    unregisterEncounterSpawnContent('test-harness');
    throw new Error('no spawn within 30 rounds');
  });

  it('without registered content the tick result carries encounters: [] (no-op path)', () => {
    unregisterEncounterSpawnContent('test-harness');
    const engine = makeBareEngine();
    const result = runWorldTick(engine);
    expect(result.ok).toBe(true);
    expect(result.encounters).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Economy tick (F-d0b5edb5) — the write-wire. Before this, a played round
// never created OR ticked world.modules['economy-core']: createDistrictEconomy
// and tickDistrictEconomy had zero callers outside economy-core's own test
// file.
// ---------------------------------------------------------------------------
describe('world-tick — economy tick (F-d0b5edb5)', () => {
  /** Economy-aware engine: district-core + economy-core + world-tick, same district roster. */
  function makeEconomyEngine(tags: string[] = []) {
    return createTestEngine({
      modules: [
        createEnvironmentCore(),
        createDistrictCore({ districts: [{ id: 'district-1', name: 'Market', zoneIds: ['zone-a'], tags }] }),
        createEconomyCore({ districts: [{ id: 'district-1', tags }] }),
        createWorldTick(),
      ],
      entities: [makePlayer()],
      zones,
    });
  }

  it('a played round creates AND ticks world.modules[\'economy-core\'].districts', () => {
    const engine = makeEconomyEngine();

    // Created at construction (before any tick runs).
    const seeded = engine.world.modules['economy-core'] as EconomyCoreState;
    expect(seeded.districts['district-1']).toBeDefined();
    expect(seeded.districts['district-1'].lastUpdateTick).toBe(0);

    // Push the district off baseline so the tick's baseline-seeking decay is observable.
    seeded.districts['district-1'].supplies.food.level = 20;

    const result = runWorldTick(engine, { genre: 'fantasy' });
    expect(result.ok).toBe(true);

    const ticked = getDistrictEconomy(engine.world, 'district-1')!;
    // Ticked this round (lastUpdateTick advances from 0), and baseline-seeking
    // decay moved food back toward 50 from the 20 we forced it to.
    expect(ticked.lastUpdateTick).toBe(engine.tick);
    expect(getSupplyLevel(ticked, 'food')).toBeGreaterThan(20);
  });

  it('reads commerce verbatim and stability ×10 from district-core\'s live getDistrictState', () => {
    // district-core's own stability metric is a ~0-10 zone-property average
    // (this file's own DISTRICT_STABILITY_BASE comment documents the same
    // units mismatch for pressure inputs), while tickDistrictEconomy's
    // STABILITY_DRIFT_THRESHOLD (30) assumes 0-100 — the tick step scales by
    // ×10. Proven structurally: the tick's own output must equal an
    // independent call to tickDistrictEconomy with commerce read verbatim and
    // stability pre-scaled, not just "some value changed".
    const engine = makeEconomyEngine();
    const districtState = getDistrictState(engine.world, 'district-1')!;
    districtState.commerce = 90;
    districtState.stability = 7;

    const before = getDistrictEconomy(engine.world, 'district-1')!;
    const expected = tickDistrictEconomy(before, 90, 70, engine.tick);

    runWorldTick(engine, { genre: 'fantasy' });

    expect(getDistrictEconomy(engine.world, 'district-1')).toEqual(expected);
  });

  it('is a no-op when the pack never registered economy-core (nothing to tick, no throw)', () => {
    const engine = makeBareEngine();
    expect(engine.world.modules['economy-core']).toBeUndefined();
    const result = runWorldTick(engine);
    expect(result.ok).toBe(true);
    expect(engine.world.modules['economy-core']).toBeUndefined();
  });
});

describe('buildPressureInputs — the globals-to-inputs mapping', () => {
  it('derives reputation/alert/cohesion and safety-based district stability', () => {
    const engine = makeBareEngine({
      reputation_guild: -20,
      faction_alert_guild: 30,
      district_old_town_safety: -21,
    });
    const world = engine.store.state;
    const inputs = buildPressureInputs(world, getWorldTickState(world), 'fantasy', 5, []);

    expect(inputs.reputation).toEqual([{ factionId: 'guild', value: -20 }]);
    expect(inputs.factionStates.guild).toEqual({ alertLevel: 30, cohesion: 0.8 });
    // Underscored district ids parse intact, and stability derives from the
    // safety global on the 0–100 scale (50 + (−21) = 29 — genuinely shaky).
    expect(inputs.districtMetrics?.['old_town']).toEqual({
      alertPressure: 0,
      rumorDensity: 0,
      stability: DISTRICT_STABILITY_BASE - 21,
    });
    expect(inputs.genre).toBe('fantasy');
    expect(inputs.currentTick).toBe(5);
    expect(inputs.playerRumors).toEqual([]);
  });

  it('sets districtEconomies from world.modules[\'economy-core\'] (F-6008456f)', () => {
    const engine = createTestEngine({
      modules: [createEconomyCore({ districts: [{ id: 'district-1', tags: [] }] })],
      entities: [makePlayer()],
      zones,
    });
    const world = engine.world;
    const inputs = buildPressureInputs(world, getWorldTickState(world), 'fantasy', 5, []);

    expect(inputs.districtEconomies).toBeInstanceOf(Map);
    expect(inputs.districtEconomies?.size).toBe(1);
    expect(inputs.districtEconomies?.get('district-1')).toEqual(
      (engine.world.modules['economy-core'] as EconomyCoreState).districts['district-1'],
    );
  });

  it('degrades to an empty Map when the pack never registered economy-core', () => {
    const engine = makeBareEngine();
    const world = engine.store.state;
    const inputs = buildPressureInputs(world, getWorldTickState(world), 'fantasy', 5, []);
    expect(inputs.districtEconomies).toEqual(new Map());
  });
});

// ---------------------------------------------------------------------------
// F-6008456f, the RED-PROOF: the 4 economy-driven pressure kinds were fully
// authored in pressure-system.ts/pressure-resolution.ts but could never fire
// — evaluateEconomyRules' own guard (`if (!districtEconomies ||
// districtEconomies.size === 0) return null`) was permanently tripped because
// buildPressureInputs never set the field at all. This test proves it can
// fire now that economy-core is wired and buildPressureInputs threads it
// through — and the companion test proves it still can't with economy-core
// absent (the exact pre-fix condition), so the contrast is the RED-PROOF.
// ---------------------------------------------------------------------------
describe('world-tick — an economy pressure can fire once districtEconomies is present (F-6008456f)', () => {
  it('supply-crisis spawns when a district has a critically low essential supply', () => {
    const engine = createTestEngine({
      modules: [
        createEnvironmentCore(),
        createDistrictCore({ districts: [{ id: 'district-1', name: 'Market', zoneIds: ['zone-a'], tags: [] }] }),
        createEconomyCore({ districts: [{ id: 'district-1', tags: [] }] }),
        createWorldTick(),
      ],
      entities: [makePlayer()],
      zones,
      globals: { [HEAT_KEY]: HEAT_WAKE_THRESHOLD }, // opens the spawn valve; no reputation/rumors set, so universal rules stay silent
    });

    const seeded = engine.world.modules['economy-core'] as EconomyCoreState;
    seeded.districts['district-1'].supplies.food.level = 5; // below the 15 threshold

    const result = runWorldTick(engine, { genre: 'fantasy' });

    expect(result.ok).toBe(true);
    expect(result.spawned.some((p) => p.kind === 'supply-crisis')).toBe(true);
    expect(pressureEvents(engine).some((e) => e.type === 'pressure.spawned' && e.payload.kind === 'supply-crisis')).toBe(true);
  });

  it('the SAME low-supply scenario spawns nothing when economy-core is not registered (the pre-fix condition)', () => {
    const engine = makeBareEngine({ [HEAT_KEY]: HEAT_WAKE_THRESHOLD });
    // No economy-core module at all — world.modules['economy-core'] never
    // exists, so buildPressureInputs' districtEconomies is an empty Map and
    // evaluateEconomyRules' guard returns null every time (dead code path).
    const result = runWorldTick(engine, { genre: 'fantasy' });

    expect(result.ok).toBe(true);
    expect(result.spawned.some((p) => p.kind === 'supply-crisis')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Module identity + the version-stamped seam (P8-SP-003)
// ---------------------------------------------------------------------------

describe('world-tick — module identity enters the migration seam (P8-SP-003)', () => {
  it('createWorldTick carries the id/version contract the sibling modules declare', () => {
    const mod = createWorldTick();
    expect(mod.id).toBe('world-tick');
    expect(mod.version).toBe('1.0.0');
  });

  it('a registered engine version-stamps the slice and initializes the namespace at construction (fresh pin: cursor 0)', () => {
    const engine = createTestEngine({
      modules: [createWorldTick()],
      entities: [makePlayer()],
      zones,
    });
    expect(engine.world.meta.moduleVersions?.['world-tick']).toBe('1.0.0');
    // The factory namespace default ran against the empty construction-time
    // log — the cursor starts at 0, byte-for-byte the old fresh shape plus
    // the (empty) resolved ledger.
    const state = engine.world.modules['world-tick'] as WorldTickState;
    expect(state.lastEventIndex).toBe(0);
    expect(state.pressures).toEqual([]);
    expect(state.milestones).toEqual([]);
  });

  it('a legacy save restored through the seam baselines the cursor to the historical log length (Engine.deserialize path)', () => {
    // Simulate a pre-v2.7 save: a session with history whose save carries NO
    // world-tick namespace and no version stamp for it (the driver was not a
    // module when the save was written).
    const engine = createTestEngine({
      modules: [createWorldTick()],
      entities: [makePlayer()],
      zones,
    });
    engine.store.emitEvent('defeat.fallout.milestone', {
      label: 'old-session boss',
      tags: ['boss-kill'],
    });
    const save = JSON.parse(engine.serialize()) as {
      world: { state: { modules: Record<string, unknown>; meta: { moduleVersions?: Record<string, string> } } };
    };
    delete save.world.state.modules['world-tick'];
    delete save.world.state.meta.moduleVersions?.['world-tick'];

    const restored = Engine.deserialize(JSON.stringify(save), { modules: [createWorldTick()] });
    expect(restored.world.eventLog.length).toBeGreaterThan(0);
    const state = restored.world.modules['world-tick'] as WorldTickState;
    // The factory default received the RESTORED world (P8-WL-006): the cursor
    // baselines to the historical log length, not 0 — the first tick of the
    // resumed session re-consumes nothing.
    expect(state.lastEventIndex).toBe(restored.world.eventLog.length);
    // And the ENG-009 re-stamp covers the slice from here on.
    expect(restored.world.meta.moduleVersions?.['world-tick']).toBe('1.0.0');
  });
});

// ---------------------------------------------------------------------------
// Legacy saves do not re-consume history (P8-WL-006 — the getter path)
// ---------------------------------------------------------------------------

describe('world-tick — legacy saves do not re-consume history (P8-WL-006)', () => {
  it('fresh world pin: the cursor attaches at 0 (empty log) and round events are consumed', () => {
    const engine = makeBareEngine();
    // First touch happens against an empty log — the delta discipline starts
    // at 0 exactly as before the fix.
    expect(getWorldTickState(engine.store.state).lastEventIndex).toBe(0);
    engine.store.emitEvent('defeat.fallout.milestone', { label: 'fresh boss', tags: ['boss-kill'] });
    runWorldTick(engine);
    const state = getWorldTickState(engine.store.state);
    expect(state.milestones.map((m) => m.label)).toContain('fresh boss');
    expect(state.lastEventIndex).toBe(engine.world.eventLog.length);
  });

  it('RED-PROOF legacy Continue: absent namespace + historical log ⇒ the cursor attaches at the log END; old milestones are NOT re-collected', () => {
    const engine = makeBareEngine();
    engine.store.emitEvent('defeat.fallout.milestone', {
      label: 'historical boss',
      tags: ['boss-kill'],
    });
    // The pre-v2.7 save shape on the shipped Continue path: full log, no
    // world-tick namespace (nothing initializes namespaces on that path).
    expect(engine.world.modules['world-tick']).toBeUndefined();

    const result = runWorldTick(engine); // first tick of the resumed session
    expect(result.ok).toBe(true);
    const state = getWorldTickState(engine.store.state);
    // Pre-fix: fresh state initialized lastEventIndex 0 and this scan
    // re-collected 'historical boss' — this assertion is the red proof.
    expect(state.milestones).toEqual([]);
    expect(state.lastEventIndex).toBe(engine.world.eventLog.length);
  });
});

// ---------------------------------------------------------------------------
// The stable pressure read API (P8-WL-003) — single source of truth under
// world.modules['world-tick']; the CLI's endgame/director/inspect surfaces
// build on these accessors instead of the phantom 'pressure-system' namespace
// nothing ever wrote.
// ---------------------------------------------------------------------------

describe('world-tick — the stable pressure read API (P8-WL-003)', () => {
  const expiringBounty = () =>
    makePressure({
      kind: 'bounty-issued',
      sourceFactionId: 'watch',
      description: 'watch has placed a bounty on the player',
      triggeredBy: 'test',
      urgency: 0.7,
      visibility: 'rumored',
      turnsRemaining: 0, // expires on entry to the next tick
      potentialOutcomes: [],
      tags: ['hostile'],
      currentTick: 0,
    });

  it('absent namespace: accessors return empty/false and NEVER attach (display-world safe)', () => {
    const engine = makeBareEngine();
    const world = engine.store.state;
    expect(hasWorldTickState(world)).toBe(false);
    expect(getActivePressures(world)).toEqual([]);
    expect(getResolvedPressures(world)).toEqual([]);
    // Non-attaching: the reads left nothing behind — a save taken after an
    // inspection render stays byte-identical to one taken before.
    expect(world.modules['world-tick']).toBeUndefined();
  });

  it('getActivePressures reads the live working set the tick persists (no mirror namespace)', () => {
    const engine = makeBareEngine({
      reputation_watch: -50,
      faction_alert_watch: 60,
      [HEAT_KEY]: HEAT_WAKE_THRESHOLD,
    });
    const result = runWorldTick(engine);
    expect(result.spawned).toHaveLength(1);

    const world = engine.store.state;
    expect(hasWorldTickState(world)).toBe(true);
    const active = getActivePressures(world);
    expect(active).toHaveLength(1);
    expect(active[0].kind).toBe('bounty-issued');
    // The records the tick returned ARE the records the accessor reads —
    // world.modules['world-tick'] is the single source of truth.
    expect(active).toEqual(result.active);
    // And nothing ever writes the phantom namespace the CLI used to read.
    expect(world.modules['pressure-system']).toBeUndefined();
  });

  it('getResolvedPressures returns the persisted fallout ledger, and it rides the save round-trip', () => {
    const engine = makeBareEngine({ reputation_watch: -60, faction_alert_watch: 60, [HEAT_KEY]: 0 });
    getWorldTickState(engine.store.state).pressures = [expiringBounty()];

    const result = runWorldTick(engine);
    expect(result.expired).toHaveLength(1);

    const resolved = getResolvedPressures(engine.store.state);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].resolution.pressureKind).toBe('bounty-issued');
    expect(resolved[0].summary).toBe('bounty issued expired without resolution');

    // The ledger rides world.modules like the rest of the slice.
    const reloaded = JSON.parse(engine.store.serialize()) as {
      state: { modules: { 'world-tick': WorldTickState } };
    };
    expect(reloaded.state.modules['world-tick'].resolvedPressures).toHaveLength(1);
  });

  it('legacy slice without the ledger field: readers tolerate, the tick lazy-initializes', () => {
    const engine = makeBareEngine({ [HEAT_KEY]: 0 });
    const state = getWorldTickState(engine.store.state);
    delete state.resolvedPressures; // the pre-field persisted shape
    expect(getResolvedPressures(engine.store.state)).toEqual([]);

    state.pressures = [expiringBounty()];
    runWorldTick(engine);
    expect(getResolvedPressures(engine.store.state)).toHaveLength(1);
  });

  it(`the ledger is bounded: the ${RESOLVED_PRESSURES_KEPT} most recent records, oldest dropped`, () => {
    const engine = makeBareEngine({ [HEAT_KEY]: 0 });
    const state = getWorldTickState(engine.store.state);
    // Pre-fill a full ledger (synthetic records — the bound is mechanical).
    state.resolvedPressures = Array.from(
      { length: RESOLVED_PRESSURES_KEPT },
      (_, i) => ({ summary: `old-${i}` }) as PressureFallout,
    );
    state.pressures = [expiringBounty()];
    runWorldTick(engine);

    const resolved = getResolvedPressures(engine.store.state);
    expect(resolved).toHaveLength(RESOLVED_PRESSURES_KEPT);
    expect(resolved[0]).toEqual({ summary: 'old-1' }); // oldest dropped
    expect(resolved[resolved.length - 1].resolution?.pressureKind).toBe('bounty-issued');
  });

  it('malformed namespace values degrade to empty, never throw', () => {
    const engine = makeBareEngine();
    const world = engine.store.state;
    world.modules['world-tick'] = {
      pressures: 'not-an-array',
      resolvedPressures: 42,
    } as unknown as WorldTickState;
    expect(hasWorldTickState(world)).toBe(true);
    expect(getActivePressures(world)).toEqual([]);
    expect(getResolvedPressures(world)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Companion reactions wired into the round (F-b595731a) — RED-PROOF:
// evaluateCompanionReactions/evaluateDepartureRisk were fully authored and
// unit-tested (companion-reactions.test.ts) with ZERO production callers —
// grep confirmed both names appeared only in their own test file. A
// recruited companion's morale never changed after joining; departures never
// fired. These tests exercise the REAL round driver (runWorldTick), not the
// pure evaluator directly.
// ---------------------------------------------------------------------------

describe('world-tick — companion reactions (F-b595731a)', () => {
  it('combat-won: a hostile defeated by the player raises a fighter companion\'s morale', () => {
    const engine = makeCompanionEngine();
    getWorldTickState(engine.store.state); // prime the cursor at 0 (P8-WL-006 idiom) BEFORE any actions
    engine.submitAction('recruit', { targetIds: ['mira'] });
    const before = partyCompanions(engine).find((c) => c.npcId === 'mira')!.morale;
    expect(before).toBe(60); // recruitHandler's starting morale

    killEntity(engine, 'w1'); // combat.entity.defeated, entityId: 'w1' (hostile)
    runWorldTick(engine);

    const after = partyCompanions(engine).find((c) => c.npcId === 'mira')!.morale;
    expect(after).toBe(before + 3); // REACTION_TABLE['combat-won'].fighter === 3
  });

  it('combat-lost: the PLAYER going down lowers a fighter companion\'s morale', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCompanionCore()],
      entities: [
        makePlayer({ resources: { hp: 1, stamina: 5 } }),
        makeEnemy('brute', { stats: { vigor: 50, instinct: 50, will: 3 } }),
        {
          id: 'mira', blueprintId: 'mira', type: 'npc', name: 'Mira',
          tags: ['npc', 'recruitable', 'fighter'], stats: {}, resources: { hp: 10 }, statuses: [], zoneId: 'zone-a',
        },
      ],
      zones,
      seed: 3,
    });
    getWorldTickState(engine.store.state); // prime BEFORE any actions
    engine.submitAction('recruit', { targetIds: ['mira'] });
    const before = partyCompanions(engine).find((c) => c.npcId === 'mira')!.morale;

    // Force the player down directly — the exact combat path to defeat is
    // not the point under test; the reaction to a downed PLAYER is.
    engine.world.entities.player.resources.hp = 0;
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'player', entityName: 'Hero', defeatedBy: 'brute', defeatZoneId: 'zone-a',
    });
    runWorldTick(engine);

    const after = partyCompanions(engine).find((c) => c.npcId === 'mira')!.morale;
    expect(after).toBe(before - 2); // REACTION_TABLE['combat-lost'].fighter === -2
  });

  it('combat-lost: an intercepting companion going down ALSO lowers party morale (not just the player\'s own defeat)', () => {
    const engine = makeCompanionEngine();
    getWorldTickState(engine.store.state);
    engine.submitAction('recruit', { targetIds: ['mira'] });
    const before = partyCompanions(engine).find((c) => c.npcId === 'mira')!.morale;

    // Mira herself is tagged 'companion' by the recruit — a defeat event
    // naming her (as if she had just intercepted and fallen) must ALSO read
    // as combat-lost, not just a downed player.
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'mira', entityName: 'Mira', defeatedBy: 'w1', defeatZoneId: 'zone-a', wasInterceptor: true,
    });
    runWorldTick(engine);

    const after = partyCompanions(engine).find((c) => c.npcId === 'mira')!.morale;
    expect(after).toBe(before - 2);
  });

  it('pressure-resolved-badly: an ignored (expired) pressure lowers morale for a susceptible role', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCompanionCore()],
      entities: [
        makePlayer(),
        {
          id: 'sable', blueprintId: 'sable', type: 'npc', name: 'Sable',
          tags: ['npc', 'recruitable', 'diplomat'], stats: {}, resources: { hp: 10 }, statuses: [], zoneId: 'zone-a',
        },
      ],
      zones,
    });
    getWorldTickState(engine.store.state); // prime — see P8-WL-006 idiom above
    engine.submitAction('recruit', { targetIds: ['sable'] });
    const before = partyCompanions(engine).find((c) => c.npcId === 'sable')!.morale;

    getWorldTickState(engine.store.state).pressures = [makePressure({
      kind: 'bounty-issued',
      sourceFactionId: 'watch',
      description: 'watch has placed a bounty on the player',
      triggeredBy: 'test',
      urgency: 0.7,
      visibility: 'rumored',
      turnsRemaining: 0, // expires on entry to the next tick
      potentialOutcomes: [],
      tags: ['hostile'],
      currentTick: 0,
    })];
    const result = runWorldTick(engine);
    expect(result.expired).toHaveLength(1); // sanity: the pressure really did expire this tick

    const after = partyCompanions(engine).find((c) => c.npcId === 'sable')!.morale;
    // REACTION_TABLE['pressure-resolved-badly'].diplomat === -3. Every
    // production computeFallout call is 'expired-ignored' today (world-tick
    // never calls it with any other resolutionType — see this file's own
    // header) — this pins that reality to 'badly', not 'well'.
    expect(after).toBe(before - 3);
  });

  it('applyCompanionReactions: no-op (no crash, no morale change) when the party is empty', () => {
    const engine = makeCompanionEngine();
    expect(() => applyCompanionReactions(engine, engine.world, ['combat-won'], 5)).not.toThrow();
    expect(partyCompanions(engine)).toHaveLength(0);
  });

  it('departure: removeCompanion + the symmetric tag strip + a companion.departed event fire when a reaction carries departure:true', () => {
    const engine = makeCompanionEngine();
    engine.submitAction('recruit', { targetIds: ['mira'] });

    // Force morale to the departure-eligible band directly (party-state is
    // plain data — this is the same "seed the scenario" idiom the pressure
    // test above uses for its own trigger condition).
    const lowMorale = { ...getPartyState(engine.world) };
    lowMorale.companions = lowMorale.companions.map((c) => ({ ...c, morale: 12 }));
    setPartyState(engine.world, lowMorale);

    const breakpoints = new Map<string, LoyaltyBreakpoint>([['mira', 'hostile']]);
    applyCompanionReactions(engine, engine.world, ['betrayal-witnessed'], 9, breakpoints);
    // REACTION_TABLE['betrayal-witnessed'].fighter === -5 → 12 - 5 = 7 <= 10,
    // breakpoint hostile → evaluateCompanionReactions marks departure:true.

    expect(partyCompanions(engine)).toHaveLength(0); // removeCompanion ran
    expect(engine.world.entities.mira.tags).not.toContain(COMPANION_TAG);
    expect(engine.world.entities.mira.tags).not.toContain(companionRoleTag('fighter'));
    const departedEvent = engine.world.eventLog.find((e) => e.type === 'companion.departed');
    expect(departedEvent).toBeDefined();
    expect(departedEvent?.payload.npcId).toBe('mira');
    expect(departedEvent?.payload.reason).toBe('lost all faith in you');
    // The ability-modifier mirror (F-66cd1cd0) recomputed too — an empty
    // party carries no hpRecoveryBonus, so any prior status is cleared.
    expect(engine.world.entities.player.statuses).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Morale-floor departure fallback (V3R-PARTY-2b, Phase-9 party-departure
  // remediation) — the SAME end-to-end pipeline as the 'departure:' test
  // directly above (removeCompanion, the symmetric tag strip, the
  // companion.departed event, the ability-modifier mirror), but exercised
  // with NO breakpoints map at all — the exact call shape
  // player-leverage.ts's dispatchLeverageCompanionReactions uses in
  // production, and the shape world-tick.ts's own real call site falls back
  // to before the sibling living-npcs domain populates npc-agency profiles.
  // ---------------------------------------------------------------------------

  it('V3R-PARTY-2b: the morale-floor fallback departs a companion end-to-end when NO breakpoints are known at all', () => {
    const engine = makeCompanionEngine();
    engine.submitAction('recruit', { targetIds: ['mira'] });

    // Force morale so obligation-betrayed's fighter delta (-8) lands the
    // projected morale EXACTLY on MORALE_FLOOR_FALLBACK.
    const lowMorale = { ...getPartyState(engine.world) };
    lowMorale.companions = lowMorale.companions.map((c) => ({ ...c, morale: MORALE_FLOOR_FALLBACK + 8 }));
    setPartyState(engine.world, lowMorale);

    // No breakpoints argument at all. Before V3R-PARTY-2b, departure could
    // NEVER fire from this call shape no matter how low morale fell.
    applyCompanionReactions(engine, engine.world, ['obligation-betrayed'], 9);

    expect(partyCompanions(engine)).toHaveLength(0); // removeCompanion ran via the fallback
    expect(engine.world.entities.mira.tags).not.toContain(COMPANION_TAG);
    expect(engine.world.entities.mira.tags).not.toContain(companionRoleTag('fighter'));
    const departedEvent = engine.world.eventLog.find((e) => e.type === 'companion.departed');
    expect(departedEvent).toBeDefined();
    expect(departedEvent?.payload.npcId).toBe('mira');
    expect(departedEvent?.payload.reason).toBe('has hit their breaking point');
  });

  it('V3R-PARTY-2b: one point above the morale floor with no breakpoints known, the companion stays — the fallback does not fire early', () => {
    const engine = makeCompanionEngine();
    engine.submitAction('recruit', { targetIds: ['mira'] });

    const lowMorale = { ...getPartyState(engine.world) };
    lowMorale.companions = lowMorale.companions.map((c) => ({ ...c, morale: MORALE_FLOOR_FALLBACK + 9 }));
    setPartyState(engine.world, lowMorale);

    applyCompanionReactions(engine, engine.world, ['obligation-betrayed'], 9);

    expect(partyCompanions(engine)).toHaveLength(1);
    expect(engine.world.eventLog.some((e) => e.type === 'companion.departed')).toBe(false);
  });

  it('companion.reaction events carry the trigger, morale delta, and narrator hint for narration/observability', () => {
    const engine = makeCompanionEngine();
    getWorldTickState(engine.store.state);
    engine.submitAction('recruit', { targetIds: ['mira'] });
    killEntity(engine, 'w1');
    runWorldTick(engine);

    const reactionEvent = engine.world.eventLog.find((e) => e.type === 'companion.reaction');
    expect(reactionEvent).toBeDefined();
    expect(reactionEvent?.payload).toMatchObject({ npcId: 'mira', trigger: 'combat-won', moraleDelta: 3 });
    expect(typeof reactionEvent?.payload.narratorHint).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Opportunity spawn/tick wire (F-ceed887f) — the RED-PROOF: opportunity-
// core.ts's evaluateOpportunities/tickOpportunities were fully authored and
// unit-tested (opportunity-core.test.ts) with ZERO production callers (its
// own file header: "Pure functions, no module registration"). Before this
// wire, world.modules['opportunity-core'] never existed in a played round no
// matter how much qualifying pressure/scarcity/faction/companion/district
// state accrued.
// ---------------------------------------------------------------------------
describe('world-tick — opportunity spawn/tick wire (F-ceed887f)', () => {
  /** District + economy + world-tick, same roster shape as makeEconomyEngine. */
  function makeOpportunityEngine() {
    const engine = createTestEngine({
      modules: [
        createEnvironmentCore(),
        createDistrictCore({ districts: [{ id: 'district-1', name: 'Market', zoneIds: ['zone-a'], tags: [] }] }),
        createEconomyCore({ districts: [{ id: 'district-1', tags: [] }] }),
        createWorldTick(),
      ],
      entities: [makePlayer()],
      zones,
    });
    // createDistrictEconomy() with no genre defaults EVERY category
    // (including contraband) to BASELINE (50) — isBlackMarketCondition's own
    // first check is `contraband.level > 30`, so an "untouched" district
    // reads as black-market-active from construction, independent of
    // anything this wave touches (economy-core.ts is out of domain).
    // Neutralize it so a genuinely quiet baseline is available to tests that
    // want one; scarcify() below deliberately re-trips it (ANY category < 20
    // ALSO satisfies isBlackMarketCondition) — a scarce district legitimately
    // ALSO reading as black-market-active is honest simulation behavior, not
    // a bug, and is why the scarcity test below accepts either resulting kind.
    const econ = engine.world.modules['economy-core'] as EconomyCoreState;
    econ.districts['district-1'].supplies.contraband.level = 25;
    return engine;
  }

  function scarcify(engine: ReturnType<typeof createTestEngine>, category: 'medicine' | 'weapons' | 'ammunition' | 'food' | 'fuel' | 'luxuries' | 'components', level = 5): void {
    const econ = engine.world.modules['economy-core'] as EconomyCoreState;
    econ.districts['district-1'].supplies[category].level = level;
  }

  it('RED-PROOF: the namespace is absent before any tick runs', () => {
    const engine = makeOpportunityEngine();
    expect(engine.world.modules['opportunity-core']).toBeUndefined();
  });

  it("a played round creates world.modules['opportunity-core'] in the EXACT shape director.test.ts pins, even with nothing to spawn", () => {
    const engine = makeOpportunityEngine();
    const result = runWorldTick(engine, { genre: 'fantasy' });
    expect(result.ok).toBe(true);
    expect(engine.world.modules['opportunity-core']).toEqual({ opportunities: [] });
  });

  it('qualifying scarcity state spawns a district-economy-driven opportunity through the REAL tick (not a hand fixture)', () => {
    const engine = makeOpportunityEngine();
    scarcify(engine, 'medicine'); // < 20 qualifies BOTH evaluateScarcityOpportunities (supply-run)
    // AND evaluateDistrictOpportunities' black-market branch (investigation) —
    // isBlackMarketCondition trips on ANY category < 20, not just contraband.
    // Both are correct, live-state-driven outcomes; scoreCandidate picks the
    // higher scorer. This proves the wire reads live economy state end to
    // end, not which specific rule happens to win the score.

    const result = runWorldTick(engine, { genre: 'fantasy' });

    expect(result.ok).toBe(true);
    expect(result.opportunitiesSpawned).toHaveLength(1);
    expect(['supply-run', 'investigation']).toContain(result.opportunitiesSpawned[0].kind);

    const persisted = getPersistedOpportunities(engine.world);
    expect(persisted).toHaveLength(1);
    expect(persisted).toEqual(result.opportunitiesSpawned);

    // 'opportunity.spawned' rides the SAME round-narration discipline pressures use.
    const event = engine.world.eventLog.find((e) => e.type === 'opportunity.spawned');
    expect(event).toBeDefined();
    expect(event?.payload.kind).toBe(result.opportunitiesSpawned[0].kind);
  });

  it("capacity/interval/pair-conflict guards hold under repeated ticks — never exceeds the module's own cap, no duplicate live (kind, source) pairs", () => {
    const engine = makeOpportunityEngine();
    // Persistently scarce across every category the rule scans — a worst-case
    // stress where every round is a qualifying round.
    for (const cat of ['medicine', 'weapons', 'ammunition', 'food', 'fuel', 'luxuries', 'components'] as const) {
      scarcify(engine, cat, 2);
    }

    for (let i = 0; i < 40; i++) {
      engine.store.advanceTick();
      const result = runWorldTick(engine, { genre: 'fantasy' });
      expect(result.ok).toBe(true);
    }

    const persisted = getPersistedOpportunities(engine.world);
    const live = persisted.filter((o) => o.status === 'available' || o.status === 'accepted');
    expect(live.length).toBeLessThanOrEqual(5); // MAX_ACTIVE_OPPORTUNITIES (opportunity-core.ts's own cap)
    const pairs = new Set(live.map((o) => `${o.kind}:${o.sourceNpcId ?? o.sourceFactionId ?? 'none'}`));
    expect(pairs.size).toBe(live.length); // no duplicate live (kind, source) pairs
  });

  it('the 2 npc-dependent rules (npc-goal, obligation) no-op cleanly through the wire — hardcoded-empty npcProfiles/npcObligations never spawn an NPC-sourced opportunity', () => {
    // Scarcity is ALSO present so we know the tick is doing real work — the
    // absence of npc-sourced kinds specifically proves the hardcoded-empty
    // ceiling, not "nothing ever spawns". opportunity-core.test.ts's own
    // 'spawns contract from NPC bargain goal' / 'spawns favor-request from
    // obligation' tests prove these SAME rules fire correctly when fed real
    // npcProfiles/npcObligations directly — this proves the production wire
    // has none to feed them yet (v3.0 honest ceiling).
    const engine = makeOpportunityEngine();
    scarcify(engine, 'medicine');

    for (let i = 0; i < 10; i++) {
      engine.store.advanceTick();
      runWorldTick(engine, { genre: 'fantasy' });
    }

    const persisted = getPersistedOpportunities(engine.world);
    expect(persisted.length).toBeGreaterThan(0); // the tick DID spawn something (scarcity)
    expect(persisted.every((o) => o.sourceNpcId === undefined)).toBe(true);
  });

  it('a terminal-status opportunity self-prunes from the ticked set the round after (tickOpportunities\' own contract — no manual cleanup needed)', () => {
    const engine = makeOpportunityEngine();
    scarcify(engine, 'medicine');
    runWorldTick(engine, { genre: 'fantasy' });
    const spawned = getPersistedOpportunities(engine.world)[0];
    expect(spawned).toBeDefined();

    // Simulate a resolution verb marking it terminal (F-f3f2a84c territory,
    // proven directly in opportunity-resolution.test.ts) — here we only prove
    // world-tick's OWN tick step naturally drops a terminal-status entry.
    setPersistedOpportunities(engine.world, [{ ...spawned, status: 'completed' }]);
    engine.store.advanceTick();
    runWorldTick(engine, { genre: 'fantasy' });

    const after = getPersistedOpportunities(engine.world);
    expect(after.find((o) => o.id === spawned.id)).toBeUndefined();
  });

  it("integration: director's OPPORTUNITIES section renders correctly from a PRODUCTION-ticked world (not a hand fixture) — the section itself needs no edit", () => {
    const engine = makeOpportunityEngine();
    scarcify(engine, 'medicine');
    const result = runWorldTick(engine, { genre: 'fantasy' });
    expect(result.opportunitiesSpawned).toHaveLength(1);

    // The EXACT read director.ts's OPPORTUNITIES section performs:
    // `oppNs?.opportunities ?? oppNs?.activeOpportunities`.
    const oppNs = engine.world.modules['opportunity-core'] as { opportunities: OpportunityState[] };
    const rendered = formatOpportunityListForDirector(oppNs.opportunities);
    expect(rendered).toContain('=== OPPORTUNITIES ===');
    expect(rendered).toContain('AVAILABLE:');
    expect(rendered).toContain(oppNs.opportunities[0].kind.toUpperCase());
  });

  it('is a no-op-safe, silent write when nothing spawns — no opportunity.spawned event fires', () => {
    const engine = makeOpportunityEngine();
    const result = runWorldTick(engine, { genre: 'fantasy' });
    expect(result.opportunitiesSpawned).toEqual([]);
    expect(engine.world.eventLog.find((e) => e.type === 'opportunity.spawned')).toBeUndefined();
  });

  it('is deterministic — same world in, same persisted opportunities out, across independent instances', () => {
    const run = () => {
      const engine = makeOpportunityEngine();
      scarcify(engine, 'medicine');
      runWorldTick(engine, { genre: 'fantasy' });
      engine.store.advanceTick();
      runWorldTick(engine, { genre: 'fantasy' });
      return JSON.parse(JSON.stringify(getPersistedOpportunities(engine.world)));
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// Opportunity natural-expiry fallout (Phase-9 remediation, FIX 2) — mirrors
// the pressure-expiry block ("world-tick — expiry applies fallout to the
// shared ledger" above). Every getXFallout function in opportunity-
// resolution.ts has a fully-authored 'expired' case (rep hits, obligations,
// economy shifts), but the tick used to discard tickOpportunities' own
// `expired` array entirely — an opportunity's deadline was cosmetic.
// ---------------------------------------------------------------------------
describe('world-tick — opportunity expiry fallout wire (Phase-9 remediation FIX 2)', () => {
  it('RED-PROOF: an opportunity ticked to turnsRemaining 0 applies its authored "expired" fallout and emits opportunity.expired (today it applies nothing)', () => {
    const engine = makeBareEngine();
    setPersistedOpportunities(engine.world, [
      {
        id: 'opp-contract-guild-0',
        kind: 'contract',
        status: 'accepted',
        sourceFactionId: 'guild',
        title: 'Test Contract',
        description: 'A test.',
        objectiveDescription: 'Do something.',
        linkedRumorIds: [],
        linkedNpcIds: [],
        tags: [],
        rewards: [],
        risks: [],
        visibility: 'known',
        urgency: 0.5,
        turnsRemaining: 0, // expires on entry to this tick
        createdAtTick: 0,
        genre: 'fantasy',
      },
    ]);

    const result = runWorldTick(engine, { genre: 'fantasy' });

    // getContractFallout's 'expired' case: -3 rep with the source faction —
    // the SAME global the pressure-expiry block above writes.
    expect(engine.world.globals['reputation_guild']).toBe(-3);

    expect(result.opportunitiesExpired).toHaveLength(1);
    expect(result.opportunitiesExpired[0].resolution).toMatchObject({
      opportunityId: 'opp-contract-guild-0',
      resolutionType: 'expired',
    });

    const event = engine.world.eventLog.find((e) => e.type === 'opportunity.expired');
    expect(event).toBeDefined();
    expect(event?.payload.opportunityId).toBe('opp-contract-guild-0');
    expect(event?.presentation).toEqual({ channels: ['narrator'], priority: 'normal' });

    // Gone from the persisted (still-active) set — tickOpportunities' own
    // contract, unaffected by this fix.
    expect(getPersistedOpportunities(engine.world).find((o) => o.id === 'opp-contract-guild-0')).toBeUndefined();

    // The resolved-opportunity ledger (opportunity-resolution.ts's OWN
    // getResolvedOpportunities/RESOLVED_OPPORTUNITIES_KEPT contract) gets the
    // SAME record — the identical ledger the 'opportunity' verb appends to.
    const ns = engine.world.modules['opportunity-core'] as { resolvedOpportunities?: unknown[] };
    expect(ns.resolvedOpportunities).toHaveLength(1);
  });

  it('a hidden opportunity expires silently — no presentation, event stays hidden (mirrors the pressure-expiry test above)', () => {
    const engine = makeBareEngine();
    setPersistedOpportunities(engine.world, [
      {
        id: 'opp-bounty-guild-0',
        kind: 'bounty',
        status: 'accepted',
        sourceFactionId: 'guild',
        title: 'Hidden bounty',
        description: 'A test.',
        objectiveDescription: 'Do something.',
        linkedRumorIds: [],
        linkedNpcIds: [],
        tags: [],
        rewards: [],
        risks: [],
        visibility: 'hidden',
        urgency: 0.5,
        turnsRemaining: 0,
        createdAtTick: 0,
        genre: 'fantasy',
      },
    ]);

    runWorldTick(engine, { genre: 'fantasy' });

    const event = engine.world.eventLog.find((e) => e.type === 'opportunity.expired');
    expect(event?.visibility).toBe('hidden');
    expect(event?.presentation).toBeUndefined();
  });

  it('no expired opportunities this tick: opportunitiesExpired is [] and no event fires (no regression to the common case)', () => {
    const engine = makeBareEngine();
    setPersistedOpportunities(engine.world, [
      {
        id: 'opp-still-active',
        kind: 'contract',
        status: 'accepted',
        sourceFactionId: 'guild',
        title: 'Still active',
        description: 'A test.',
        objectiveDescription: 'Do something.',
        linkedRumorIds: [],
        linkedNpcIds: [],
        tags: [],
        rewards: [],
        risks: [],
        visibility: 'known',
        urgency: 0.5,
        turnsRemaining: 5,
        createdAtTick: 0,
        genre: 'fantasy',
      },
    ]);

    const result = runWorldTick(engine, { genre: 'fantasy' });
    expect(result.opportunitiesExpired).toEqual([]);
    expect(engine.world.eventLog.find((e) => e.type === 'opportunity.expired')).toBeUndefined();
  });

  it('is deterministic — same world in, same expiry fallout + events out, across independent instances', () => {
    const seedExpiring = (engine: ReturnType<typeof createTestEngine>) =>
      setPersistedOpportunities(engine.world, [
        {
          id: 'opp-det-0', kind: 'faction-job', status: 'accepted', sourceFactionId: 'guild',
          title: 'Det', description: '', objectiveDescription: '', linkedRumorIds: [], linkedNpcIds: [],
          tags: [], rewards: [], risks: [], visibility: 'known', urgency: 0.5, turnsRemaining: 0,
          createdAtTick: 0, genre: 'fantasy',
        },
      ]);
    const run = () => {
      const engine = makeBareEngine();
      seedExpiring(engine);
      const result = runWorldTick(engine, { genre: 'fantasy' });
      return {
        opportunitiesExpired: result.opportunitiesExpired,
        globals: engine.world.globals,
        resolved: (engine.world.modules['opportunity-core'] as { resolvedOpportunities?: unknown[] }).resolvedOpportunities,
      };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// District mood transitions (F-e5817c7c-adjacent rider) — the RED-PROOF:
// district-mood.ts's computeDistrictMood was fully authored/tested with no
// memory of the PREVIOUS tone anywhere in the engine, so a district sliding
// into 'grim' or blooming into 'prosperous' never reached the party — 2 of
// companion-reactions.ts's own REACTION_TABLE triggers ('district-grim' /
// 'district-prosperous') never fired in a played session.
// ---------------------------------------------------------------------------
describe('world-tick — district mood transitions (F-e5817c7c-adjacent rider)', () => {
  function makeDistrictMoodEngine() {
    return createTestEngine({
      modules: [
        createEnvironmentCore(),
        createDistrictCore({ districts: [{ id: 'district-1', name: 'Market', zoneIds: ['zone-a'], tags: [] }] }),
        createCompanionCore(),
        createWorldTick(),
      ],
      entities: [
        makePlayer(),
        {
          id: 'mira', blueprintId: 'mira', type: 'npc', name: 'Mira',
          tags: ['npc', 'recruitable', 'diplomat'], stats: {}, resources: { hp: 10 }, statuses: [], zoneId: 'zone-a',
        },
      ],
      zones,
    });
  }

  function forceGrim(engine: ReturnType<typeof createTestEngine>): void {
    const s = getDistrictState(engine.world, 'district-1')!;
    s.alertPressure = 100;
    s.surveillance = 100;
    s.stability = 0;
    s.commerce = 0;
    s.morale = 0;
  }

  function forceProsperous(engine: ReturnType<typeof createTestEngine>): void {
    const s = getDistrictState(engine.world, 'district-1')!;
    s.alertPressure = 0;
    s.surveillance = 0;
    s.stability = 10;
    s.commerce = 100;
    s.morale = 100;
  }

  it('a transition into grim fires district-grim EXACTLY ONCE — a steady grim state the round after fires nothing more', () => {
    const engine = makeDistrictMoodEngine();
    engine.submitAction('recruit', { targetIds: ['mira'] });
    const before = partyCompanions(engine).find((c) => c.npcId === 'mira')!.morale;

    // Round 1: default (not-grim) metrics — establishes the baseline tone silently.
    runWorldTick(engine);
    expect(partyCompanions(engine).find((c) => c.npcId === 'mira')!.morale).toBe(before);
    expect(engine.world.eventLog.find((e) => e.type === 'companion.reaction')).toBeUndefined();

    // Round 2: force grim — a genuine transition.
    forceGrim(engine);
    engine.store.advanceTick();
    runWorldTick(engine);
    const afterTransition = partyCompanions(engine).find((c) => c.npcId === 'mira')!.morale;
    expect(afterTransition).toBe(before - 2); // REACTION_TABLE['district-grim'].diplomat === -2
    const reactionEvents1 = engine.world.eventLog.filter((e) => e.type === 'companion.reaction');
    expect(reactionEvents1).toHaveLength(1);

    // Round 3: STILL grim (steady state) — no additional fire.
    engine.store.advanceTick();
    runWorldTick(engine);
    expect(partyCompanions(engine).find((c) => c.npcId === 'mira')!.morale).toBe(afterTransition);
    const reactionEvents2 = engine.world.eventLog.filter((e) => e.type === 'companion.reaction');
    expect(reactionEvents2).toHaveLength(1); // still exactly one, from round 2 — round 3 added none
  });

  it('a transition into prosperous fires district-prosperous', () => {
    const engine = makeDistrictMoodEngine();
    engine.submitAction('recruit', { targetIds: ['mira'] });
    const before = partyCompanions(engine).find((c) => c.npcId === 'mira')!.morale;
    runWorldTick(engine); // baseline (default metrics are not prosperous)

    forceProsperous(engine);
    engine.store.advanceTick();
    runWorldTick(engine);

    const after = partyCompanions(engine).find((c) => c.npcId === 'mira')!.morale;
    expect(after).toBe(before + 2); // REACTION_TABLE['district-prosperous'].diplomat === 2
  });

  it('empty party: the transition still ticks cleanly — no throw, no companion.reaction event', () => {
    const engine = createTestEngine({
      modules: [
        createEnvironmentCore(),
        createDistrictCore({ districts: [{ id: 'district-1', name: 'Market', zoneIds: ['zone-a'], tags: [] }] }),
        createCompanionCore(),
        createWorldTick(),
      ],
      entities: [makePlayer()],
      zones,
    });
    runWorldTick(engine); // baseline
    forceGrim(engine);
    engine.store.advanceTick();

    expect(() => runWorldTick(engine)).not.toThrow();
    expect(engine.world.eventLog.find((e) => e.type === 'companion.reaction')).toBeUndefined();
  });

  it('no district system: the step no-ops (no throw, no districtTones written)', () => {
    const engine = makeBareEngine();
    const result = runWorldTick(engine);
    expect(result.ok).toBe(true);
    expect(getWorldTickState(engine.store.state).districtTones).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// NPC agency wire (v3.0, F-v3-npc-agency) — npc-agency.ts's runNpcAgencyTick
// was fully authored and unit-tested with ZERO production callers before this
// wave. These tests prove the wire, not the domain logic (goal derivation,
// breakpoint gating, effect payload shape) — that is npc-agency.test.ts's own
// job and stays untouched here.
// ---------------------------------------------------------------------------
describe('world-tick — NPC agency wire (v3.0, F-v3-npc-agency)', () => {
  const makeNamedNpc = (
    id: string,
    name: string,
    zoneId: string,
    overrides?: Partial<EntityState>,
  ): EntityState => ({
    id,
    blueprintId: id,
    type: 'npc',
    name,
    tags: ['npc'],
    stats: { vigor: 5, instinct: 5, will: 3 },
    resources: { hp: 20, stamina: 5 },
    statuses: [],
    zoneId,
    ai: { profileId: 'cautious', goals: [], fears: [], alertLevel: 0, knowledge: {} },
    ...overrides,
  });

  function makeNpcAgencyEngine(npc: EntityState) {
    return createTestEngine({
      modules: [createCognitionCore(), createFactionCognition({ factions: [] }), createCompanionCore(), createWorldTick()],
      entities: [makePlayer(), npc],
      zones,
    });
  }

  // SEED-0 IDENTITY (non-negotiable) — a world with NO named NPCs must be
  // byte-identical to today: no npc-agency namespace created, no events, no
  // tick-count change, across a round.
  it('SEED-0 IDENTITY: a world with no named NPCs is untouched by the npc-agency step — no namespace, no npc events, no tick-count change', () => {
    const engine = makeBareEngine(); // only the player entity — isNamedNpc excludes it
    expect(engine.world.modules['npc-agency']).toBeUndefined();
    const beforeTick = engine.world.meta.tick;

    const result = runWorldTick(engine, { genre: 'fantasy' });
    expect(result.ok).toBe(true);

    // No npc-agency namespace was created by this round.
    expect(engine.world.modules['npc-agency']).toBeUndefined();
    expect(getPersistedNpcProfiles(engine.world)).toEqual([]);
    expect(getPersistedNpcObligations(engine.world)).toEqual(new Map());

    // No npc-agency-originated events landed in the log.
    expect(engine.world.eventLog.some((e) => e.type.startsWith('npc.'))).toBe(false);

    // The tick driver itself never advances world.meta.tick (advanceTick is a
    // separate, explicit call the CLI's round loop makes) — unaffected by
    // this feature either way, asserted per the task's own wording.
    expect(engine.world.meta.tick).toBe(beforeTick);

    // A second round changes nothing further attributable to npc-agency —
    // re-run and confirm the namespace is STILL absent.
    runWorldTick(engine, { genre: 'fantasy' });
    expect(engine.world.modules['npc-agency']).toBeUndefined();

  });

  it('a world with a named NPC gets a real npc-agency namespace after one round, in the shape director.ts/endgame.ts read', () => {
    const engine = makeNpcAgencyEngine(makeNamedNpc('elder-vane', 'Elder Vane', 'zone-a'));
    expect(engine.world.modules['npc-agency']).toBeUndefined();

    const result = runWorldTick(engine, { genre: 'fantasy' });
    expect(result.ok).toBe(true);

    const profiles = getPersistedNpcProfiles(engine.world);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].npcId).toBe('elder-vane');
    expect(profiles[0].name).toBe('Elder Vane');

    // The exact namespace shape director.ts's PEOPLE section and endgame.ts's
    // buildEndgameInputs both read directly.
    const ns = engine.world.modules['npc-agency'] as {
      profiles: unknown;
      lastActions: unknown;
      obligationLedgers: unknown;
    };
    expect(Array.isArray(ns.profiles)).toBe(true);
    expect(Array.isArray(ns.lastActions)).toBe(true);
    expect(typeof ns.obligationLedgers).toBe('object');
    expect(getPersistedNpcObligations(engine.world)).toEqual(new Map());
  });

  it('the LAST named NPC dying drops named-NPC presence to zero — the gate skips the whole step, so the prior round\'s profile is left as-is (the gate is "at least one this round", not "keep the ledger in lockstep with the roster")', () => {
    const engine = makeNpcAgencyEngine(makeNamedNpc('elder-vane', 'Elder Vane', 'zone-a'));
    runWorldTick(engine, { genre: 'fantasy' });
    expect(getPersistedNpcProfiles(engine.world)).toHaveLength(1);
    const before = getPersistedNpcProfiles(engine.world);

    engine.world.entities['elder-vane'].resources.hp = 0;
    engine.store.advanceTick();
    const result = runWorldTick(engine, { genre: 'fantasy' });

    // No throw, and the namespace is untouched by this round (the gate's own
    // contract: "at least one named NPC exists THIS round" is now false, so
    // the ENTIRE step — persistence write included — is skipped, exactly
    // the same gate that keeps a world that never had a named NPC from ever
    // seeing the namespace at all).
    expect(result.ok).toBe(true);
    expect(getPersistedNpcProfiles(engine.world)).toEqual(before);
  });

  it('an NPC action that fires resolves through the wire — narrates via npc.action.resolved, and lastActions carries it', () => {
    // A companion synced to critically low morale (< 10) reliably produces a
    // single, unambiguous top-priority goal (abandon @ 0.95) — every other
    // deriveNpcGoals condition needs trust/greed/loyalty/fear signals this
    // fixture's neutral defaults never satisfy, so this is deterministic
    // ONE-candidate selection, not a race between competing goals.
    const npc = makeNamedNpc('mira', 'Mira', 'zone-a', { tags: ['npc', 'companion'] });
    const engine = makeNpcAgencyEngine(npc);
    // Two mirrors, deliberately both seeded: deriveCompanionGoals reads
    // entity.custom.companionMorale directly (npc-agency's own documented
    // design — "read from custom field set by product layer"), so
    // syncCompanionCustomFields alone makes 'abandon' the derived goal; but
    // the companion-departure EFFECT handler looks her up via
    // getCompanion(party, npcId) — a real party seat is required for the
    // removal (and its companion.departed event) to actually happen, exactly
    // as it should for an NPC nobody ever recruited.
    syncCompanionCustomFields(engine.world.entities.mira, 'fighter', 5);
    setPartyState(engine.world, {
      companions: [{ npcId: 'mira', role: 'fighter', joinedAtTick: 0, abilityTags: [], morale: 5, active: true }],
      maxSize: 3,
      cohesion: 5,
    });

    let resolved: ResolvedEvent | undefined;
    for (let i = 0; i < 30 && !resolved; i++) {
      if (i > 0) engine.store.advanceTick();
      runWorldTick(engine, { genre: 'fantasy' });
      resolved = engine.world.eventLog.find((e) => e.type === 'npc.action.resolved');
    }

    expect(resolved).toBeDefined();
    expect(resolved!.payload.npcId).toBe('mira');
    expect(resolved!.payload.verb).toBe('abandon');
    expect(resolved!.visibility).toBe('public');
    expect(resolved!.presentation).toEqual({ channels: ['narrator'], priority: 'normal' });

    // companion-departure effect (the 'abandon' verb's own resolution) ran
    // through the SAME companion-core path applyCompanionReactions' own
    // departure handling uses — Mira actually left the party.
    expect(engine.world.eventLog.some((e) => e.type === 'companion.departed' && e.payload.npcId === 'mira')).toBe(true);
    expect(getPartyState(engine.world).companions.find((c) => c.npcId === 'mira')).toBeUndefined();
  });

  it('is deterministic — same world in, same npc-agency namespace out, across independent instances', () => {
    const run = () => {
      const engine = makeNpcAgencyEngine(makeNamedNpc('elder-vane', 'Elder Vane', 'zone-a'));
      runWorldTick(engine, { genre: 'fantasy' });
      engine.store.advanceTick();
      runWorldTick(engine, { genre: 'fantasy' });
      return JSON.parse(JSON.stringify(engine.world.modules['npc-agency']));
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// Leverage income wire (v3.0 wave 2, "leverage-income", step 5a2) —
// player-leverage.ts's tickLeverage/computeLeverageGains were fully authored
// and unit-tested with ZERO production callers before this wave; opportunity
// completion was the sole leverage-earning path. These tests pin the wire,
// not the pure functions themselves (already covered end-to-end in
// player-leverage.test.ts's own 'tickLeverage influence accumulation (MW-5)'
// and 'computeLeverageGains: blackmail accumulation' suites).
// ---------------------------------------------------------------------------

describe('world-tick — leverage income wire (v3.0 wave 2, "leverage-income")', () => {
  function leverageOf(engine: ReturnType<typeof createTestEngine>) {
    return getLeverageState(
      (engine.world.entities.player.custom ?? {}) as Record<string, string | number | boolean>,
    );
  }

  it('heat decays per round once the leverage step is active (pre-existing leverage.* state is itself an activity trigger)', () => {
    const engine = createTestEngine({
      modules: [],
      entities: [makePlayer({ custom: { 'leverage.heat': 10 } })],
      zones,
    });
    const result = runWorldTick(engine, { genre: 'fantasy' });
    expect(result.ok).toBe(true);
    expect(leverageOf(engine).heat).toBe(7); // 10 - HEAT_DECAY_PER_TURN(3), player-leverage.ts's own constant
  });

  it('influence seeds from reputation on the first active round', () => {
    const engine = makeBareEngine({ reputation_guild: 40 }); // rep 40 → floor(40/2) = 20
    const result = runWorldTick(engine, { genre: 'fantasy' });
    expect(result.ok).toBe(true);
    expect(leverageOf(engine).influence).toBe(20);
  });

  it('a NEW milestone grants its gain exactly ONCE — not re-granted the next round (the cursor works)', () => {
    const engine = makeBareEngine();
    // Force the world-tick namespace to baseline its eventLog cursor at the
    // CURRENT (empty) log BEFORE the milestone event exists — mirroring the
    // suite's own 'fresh world pin' test above. Without this, the milestone
    // emitted below would land before world-tick's first-ever touch and read
    // as "historical" (P8-WL-006's own documented behavior — see this file's
    // 'RED-PROOF legacy Continue' test), never collected as NEW.
    getWorldTickState(engine.world);
    engine.store.emitEvent('defeat.fallout.milestone', { label: 'found the ruins', tags: ['boss-kill'] });

    const first = runWorldTick(engine, { genre: 'fantasy' });
    expect(first.ok).toBe(true);
    expect(leverageOf(engine).legitimacy).toBe(5); // milestone → legitimacy +5

    // A second round with NO new milestone must not re-grant it.
    engine.store.advanceTick();
    const second = runWorldTick(engine, { genre: 'fantasy' });
    expect(second.ok).toBe(true);
    expect(leverageOf(engine).legitimacy).toBe(5); // unchanged, not 10

    // A third round confirms it stays put, not just "one extra grant then stops".
    engine.store.advanceTick();
    runWorldTick(engine, { genre: 'fantasy' });
    expect(leverageOf(engine).legitimacy).toBe(5);
  });

  it('two NEW milestones in the SAME round each grant their own gain (not collapsed into one)', () => {
    const engine = makeBareEngine();
    getWorldTickState(engine.world); // baseline the cursor before emitting — see comment above
    engine.store.emitEvent('defeat.fallout.milestone', { label: 'found the ruins', tags: ['exploration'] });
    engine.store.emitEvent('defeat.fallout.milestone', { label: 'found the landmark', tags: ['landmark'] });

    runWorldTick(engine, { genre: 'fantasy' });
    // legitimacy: 5 + 5 = 10; blackmail: 5 (exploration) + 5 (landmark) = 10 —
    // each milestone computed via its OWN computeLeverageGains call, summed.
    expect(leverageOf(engine).legitimacy).toBe(10);
    expect(leverageOf(engine).blackmail).toBe(10);
  });

  it('an xp gain of 15+ grants blackmail, and is not re-granted next round without further xp gain', () => {
    const engine = createTestEngine({
      modules: [createProgressionCore()],
      entities: [makePlayer()],
      zones,
    });
    addCurrency(engine.world, 'player', 'xp', 20, engine.tick);

    const first = runWorldTick(engine, { genre: 'fantasy' });
    expect(first.ok).toBe(true);
    expect(leverageOf(engine).blackmail).toBe(5); // xpGained 20 >= 15 → +5

    // No further xp gained this round — must not re-grant.
    engine.store.advanceTick();
    const second = runWorldTick(engine, { genre: 'fantasy' });
    expect(second.ok).toBe(true);
    expect(leverageOf(engine).blackmail).toBe(5);

    // Another xp gain of 15+ grants again (a fresh delta, not a repeat).
    addCurrency(engine.world, 'player', 'xp', 15, engine.tick);
    engine.store.advanceTick();
    runWorldTick(engine, { genre: 'fantasy' });
    expect(leverageOf(engine).blackmail).toBe(10);
  });

  // -------------------------------------------------------------------------
  // SEED-0 IDENTITY (non-negotiable) — a legacy world that never engaged the
  // social layer (no reputation, no milestones, no xp gain, no
  // player-resolved pressure) must be byte-identical: no leverage.* key
  // written where none existed, no eventLog/tick change, and — a stricter bar
  // than playerCustom alone — the WorldTickState's own new bookkeeping
  // fields (leverageMilestoneCursor/lastXp) never get created either.
  // -------------------------------------------------------------------------
  it('SEED-0 IDENTITY: a world that never engages the social layer is untouched by the leverage-income step across several rounds', () => {
    const engine = makeBareEngine(); // no reputation globals, no milestones, no progression-core → xp always 0
    expect(engine.world.entities.player.custom).toBeUndefined();
    const beforeTick = engine.world.meta.tick;

    for (let i = 0; i < 5; i++) {
      if (i > 0) engine.store.advanceTick();
      const result = runWorldTick(engine, { genre: 'fantasy' });
      expect(result.ok).toBe(true);

      // No leverage.* key ever appears on the player entity.
      expect(engine.world.entities.player.custom).toBeUndefined();

      // The world-tick module's OWN new tracking fields never get created —
      // their mere presence (even at 0) would itself be an observable diff.
      const wtState = engine.world.modules['world-tick'] as WorldTickState;
      expect(wtState.leverageMilestoneCursor).toBeUndefined();
      expect(wtState.lastXp).toBeUndefined();
    }

    // No leverage-attributable event ever landed in the log.
    expect(engine.world.eventLog.some((e) => e.type.startsWith('leverage.'))).toBe(false);

    // world.meta.tick advanced by EXACTLY the 4 explicit advanceTick() calls
    // this test's own loop made (i = 1..4) — runWorldTick itself never
    // advances it (mirroring the npc-agency SEED-0 test's identical
    // assertion, adapted here for a multi-round loop instead of a single
    // no-advance round).
    expect(engine.world.meta.tick).toBe(beforeTick + 4);
  });

  it('SEED-0 IDENTITY: a world with pre-existing OTHER custom fields (but no leverage engagement) gains no leverage.* keys either', () => {
    const engine = createTestEngine({
      modules: [],
      entities: [makePlayer({ custom: { companionRole: 'fighter', companionMorale: 50 } })],
      zones,
    });
    runWorldTick(engine, { genre: 'fantasy' });
    runWorldTick(engine, { genre: 'fantasy' });
    expect(engine.world.entities.player.custom).toEqual({ companionRole: 'fighter', companionMorale: 50 });
  });

  it('is deterministic — same world in, same leverage state out, across independent instances', () => {
    const run = () => {
      const engine = makeBareEngine({ reputation_guild: 40 });
      engine.store.emitEvent('defeat.fallout.milestone', { label: 'found the ruins', tags: ['exploration'] });
      runWorldTick(engine, { genre: 'fantasy' });
      engine.store.advanceTick();
      runWorldTick(engine, { genre: 'fantasy' });
      return JSON.parse(JSON.stringify(engine.world.entities.player.custom));
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
