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
import { createDistrictCore } from './district-core.js';
import { createDefeatFallout } from './defeat-fallout.js';
import { traversalCore } from './traversal-core.js';
import { createEncounterSpawn, unregisterEncounterSpawnContent } from './encounter-spawn.js';
import { makePressure } from './pressure-system.js';
import {
  runWorldTick,
  buildPressureInputs,
  getWorldTickState,
  createWorldTick,
  hasWorldTickState,
  getActivePressures,
  getResolvedPressures,
  HEAT_KEY,
  HEAT_WAKE_THRESHOLD,
  HEAT_ESCALATION_THRESHOLD,
  QUIET_ROUNDS_BEFORE_DECAY,
  DISTRICT_STABILITY_BASE,
  CHAIN_TURNS_REMAINING,
  RESOLVED_PRESSURES_KEPT,
  type WorldTickState,
} from './world-tick.js';

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
