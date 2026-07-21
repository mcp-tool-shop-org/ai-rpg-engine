// world-tick — the round where the world reacts (F-ENG005-heat-pressure-reaction).
//
// defeat-fallout has always ACCRUED the strategic ledger — `player_heat`
// (+5/kill), `district_<id>_safety` (−3/kill), `reputation_<faction>` and
// `faction_alert_<faction>` — and nothing ever read it back. pressure-system
// and pressure-resolution were authored, tested machinery with zero non-test
// callers. This driver is the missing wire, not a new simulation: it READS
// the accrued globals, drives the pressure modules' own semantics, and emits
// player-visible events so the reaction lands in the round's narration.
//
// Engine-level driver, sibling of the CLI's runNpcTurns: engine in, guarded
// (one bad tick logs one bounded line, never kills the session), structured
// results out for tests. Called once per action round, after the NPCs act and
// before the round narrates, so tick events ride the SAME eventLog delta.
//
// Per tick, in order:
//   1. accumulate milestones from the eventLog delta (boss kills feed the
//      genre spawn rules' milestone conditions)
//   2. tickPressures — the module's own lifecycle: timers decrement, expired
//      pressures drop out, hidden pressures surface over time (a surfacing
//      emits `pressure.revealed` — the moment the player learns of it)
//   3. expiries → computeFallout('expired-ignored') — effects applied to the
//      SAME globals defeat-fallout writes; chain pressures spawn 'rumored';
//      `pressure.expired` (+ `pressure.spawned` per chain) emitted
//   4. sustained heat sharpens urgency: at HEAT_ESCALATION_THRESHOLD every
//      active pressure gains HEAT_URGENCY_STEP per tick; a narrator-band
//      crossing (the 0.4/0.7 bands of formatPressureForNarrator) on a visible
//      pressure emits `pressure.escalated`
//   5. heat at HEAT_WAKE_THRESHOLD opens the spawn valve: evaluatePressures
//      runs with inputs derived from the globals (spawns stay scarce — the
//      module's own max-active / min-gap / one-per-kind guards apply)
//   6. sustained quiet cools off: after QUIET_ROUNDS_BEFORE_DECAY consecutive
//      rounds with no new heat, heat decays by HEAT_DECAY_PER_QUIET_TICK per
//      round (the street's memory fades — but not between two swings of the
//      same fight)
//
// Determinism: no randomness anywhere — every branch reads world state, and
// faction/district enumeration is sorted, so same world in ⇒ same events out.
//
// Honest ceilings (documented, not oversights): playerRumors is passed empty —
// rumor-propagation's belief-transport records are a different shape from
// PlayerRumor and inventing valence/spread here would fake a system that
// doesn't exist yet, so the rumor-gated spawn rules stay dormant. Economy
// inputs are omitted until a district-economy store is wired. Fallout rumor /
// title-trigger / economy-shift / spawn-opportunity effects are not applied to
// any store — they ride the `pressure.expired` payload for downstream layers.

import type { Engine, WorldState } from '@ai-rpg-engine/core';
import {
  tickPressures,
  evaluatePressures,
  makePressure,
  type WorldPressure,
  type PressureInputs,
} from './pressure-system.js';
import { computeFallout, type PressureFallout } from './pressure-resolution.js';
import { getDistrictForZone } from './district-core.js';

// ---------------------------------------------------------------------------
// Tuning constants (exported so tests pin the thresholds, not magic numbers)
// ---------------------------------------------------------------------------

/** The global defeat-fallout accrues heat into (+5 per kill by default). */
export const HEAT_KEY = 'player_heat';

/**
 * Heat at which the world starts REACTING (2 kills at the default +5/kill).
 * Below it the tick still runs timers on any active pressures, but no new
 * pressure spawns — the street doesn't organize against a player it has
 * barely noticed. This is what makes heat load-bearing for spawn: reputation
 * and alert shape WHICH pressure spawns; heat decides WHETHER the world is
 * paying attention at all.
 */
export const HEAT_WAKE_THRESHOLD = 10;

/**
 * Heat at which sustained violence sharpens every active pressure (5 kills'
 * worth, undecayed). Each tick at or above this adds HEAT_URGENCY_STEP to
 * every active pressure's urgency (capped at 1).
 */
export const HEAT_ESCALATION_THRESHOLD = 25;

/** Urgency gained per tick while heat is at HEAT_ESCALATION_THRESHOLD+. */
export const HEAT_URGENCY_STEP = 0.05;

/** Heat lost per quiet round once the grace window is spent (floor 0). */
export const HEAT_DECAY_PER_QUIET_TICK = 1;

/**
 * Consecutive quiet rounds before decay starts. Live play showed why this
 * exists: kills take several rounds (misses, movement, a rejected swing), and
 * decaying on EVERY quiet round drained heat faster than a fight could accrue
 * it — the wake threshold became unreachable mid-rampage. The street forgets
 * after things stay calm for a stretch, not between two swings of the same
 * axe.
 */
export const QUIET_ROUNDS_BEFORE_DECAY = 3;

/**
 * districtMetrics.stability derives from the safety global on a 0–100 scale:
 * `clamp(0, 100, base + district_<id>_safety)`. district-core's own stability
 * metric is a ~0–10 zone-property aggregate — feeding it raw into
 * evaluatePressures' `stability < 30` trade-war condition would fire on every
 * district permanently. The safety global (−3/kill, the F-ENG005 unread
 * accrual) is the honest source: at −21 (7 kills in one district) stability
 * crosses under 30 and the district genuinely reads as destabilized.
 */
export const DISTRICT_STABILITY_BASE = 50;

/** Turns a fallout-chained pressure lives (spawn-pressure effects carry none). */
export const CHAIN_TURNS_REMAINING = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UrgencyBand = 'distant' | 'growing' | 'urgent';

/**
 * The same 0.4 / 0.7 bands pressure-system's formatPressureForNarrator uses —
 * escalation events fire on BAND crossings, not every increment, so they stay
 * scarce enough to mean something.
 */
export function urgencyBand(urgency: number): UrgencyBand {
  if (urgency >= 0.7) return 'urgent';
  if (urgency >= 0.4) return 'growing';
  return 'distant';
}

/**
 * Serialized driver state. Rides world.modules like sibling module state
 * (defeat-fallout's violenceHistory precedent) so active pressures, the heat
 * watermark, and the milestone ledger all survive save/reload.
 */
export type WorldTickState = {
  /** Active pressures (the pressure-system lifecycle's working set). */
  pressures: WorldPressure[];
  /** Heat at the end of the previous tick — quiet-round decay detection. */
  lastHeat: number;
  /** Consecutive rounds without new heat — decay starts past the grace window. */
  quietRounds: number;
  /** eventLog scan cursor — milestone accumulation reads only the delta. */
  lastEventIndex: number;
  /** Milestones accumulated from defeat.fallout.milestone events + fallout tags. */
  milestones: Array<{ label: string; tags: string[] }>;
};

export type WorldTickOptions = {
  /** PackMetadata.genres[0] — selects the genre spawn/fallout tables. */
  genre?: string;
  /** Sink for the one bounded line a failed tick logs. Default console.log. */
  log?: (msg: string) => void;
};

/** What one world tick did — returned for tests and optional debug output. */
export type WorldTickResult = {
  /** False when the guarded tick threw (session survived; round's tick lost). */
  ok: boolean;
  /** Heat after this tick (post-decay). */
  heat: number;
  /** Pressures that spawned this tick (evaluate spawns + fallout chains). */
  spawned: WorldPressure[];
  /** Hidden pressures that surfaced this tick (player just learned of them). */
  revealed: WorldPressure[];
  /** Pressures whose urgency crossed a narrator band this tick. */
  escalated: WorldPressure[];
  /** Fallout of pressures that expired this tick (effects already applied). */
  expired: PressureFallout[];
  /** Active pressures after the tick. */
  active: WorldPressure[];
};

// ---------------------------------------------------------------------------
// Module-state access (synthesize-and-attach — same pattern as defeat-fallout)
// ---------------------------------------------------------------------------

const STATE_KEY = 'world-tick';

export function getWorldTickState(world: WorldState): WorldTickState {
  const existing = world.modules[STATE_KEY] as WorldTickState | undefined;
  if (existing) return existing;
  const fresh: WorldTickState = {
    pressures: [],
    lastHeat: 0,
    quietRounds: 0,
    lastEventIndex: 0,
    milestones: [],
  };
  world.modules[STATE_KEY] = fresh;
  return fresh;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function addGlobal(world: WorldState, key: string, delta: number): void {
  world.globals[key] = num(world.globals[key]) + delta;
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Round to 2 decimals — keeps repeated +0.05 steps landing ON the band edges. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function getPlayerDistrictId(world: WorldState): string | undefined {
  const player = world.entities[world.playerId];
  const zoneId = player?.zoneId ?? world.locationId;
  return zoneId ? getDistrictForZone(world, zoneId) : undefined;
}

/** Accumulate milestones from the eventLog delta since the last tick. */
function collectMilestones(world: WorldState, state: WorldTickState): void {
  const log = world.eventLog;
  for (let i = state.lastEventIndex; i < log.length; i++) {
    const event = log[i];
    if (event.type !== 'defeat.fallout.milestone') continue;
    const label = typeof event.payload.label === 'string' ? event.payload.label : 'milestone';
    const tags = Array.isArray(event.payload.tags)
      ? (event.payload.tags as unknown[]).filter((t): t is string => typeof t === 'string')
      : [];
    state.milestones.push({ label, tags });
  }
  state.lastEventIndex = log.length;
}

type FactionCognitionCarrier = {
  factionCognition?: Record<string, { alertLevel?: number; cohesion?: number }>;
};

type DistrictCoreCarrier = {
  districts?: Record<string, { alertPressure?: number; rumorDensity?: number }>;
};

/**
 * Derive PressureInputs from world state. Sorted enumeration everywhere so the
 * "first matching rule wins" scan inside evaluatePressures is byte-stable.
 *
 * Reputation merges the authored baseline (world.factions[id].reputation) with
 * the accrued delta (`reputation_<id>` global — defeat-fallout's ledger).
 * Alert takes the max of the combat channel (`faction_alert_<id>` global) and
 * the rumor channel (faction-cognition's alertLevel) — the world reacts to
 * whichever is hotter. Cohesion comes from faction-cognition (its own 0.8
 * default when absent).
 */
export function buildPressureInputs(
  world: WorldState,
  state: WorldTickState,
  genre: string,
  currentTick: number,
  activePressures: WorldPressure[],
): PressureInputs {
  const globals = world.globals;
  const cog =
    (world.modules['faction-cognition'] as FactionCognitionCarrier | undefined)
      ?.factionCognition ?? {};

  const factionIds = new Set<string>();
  for (const key of Object.keys(globals)) {
    if (key.startsWith('reputation_')) factionIds.add(key.slice('reputation_'.length));
    else if (key.startsWith('faction_alert_')) factionIds.add(key.slice('faction_alert_'.length));
  }
  for (const id of Object.keys(world.factions ?? {})) factionIds.add(id);
  for (const id of Object.keys(cog)) factionIds.add(id);

  const reputation: PressureInputs['reputation'] = [];
  const factionStates: PressureInputs['factionStates'] = {};
  for (const factionId of [...factionIds].sort()) {
    const base = world.factions?.[factionId]?.reputation ?? 0;
    reputation.push({ factionId, value: base + num(globals[`reputation_${factionId}`]) });
    factionStates[factionId] = {
      alertLevel: Math.max(num(globals[`faction_alert_${factionId}`]), cog[factionId]?.alertLevel ?? 0),
      cohesion: cog[factionId]?.cohesion ?? 0.8,
    };
  }

  const dc = (world.modules['district-core'] as DistrictCoreCarrier | undefined)?.districts ?? {};
  const districtIds = new Set<string>(Object.keys(dc));
  for (const key of Object.keys(globals)) {
    const match = /^district_(.+)_safety$/.exec(key);
    if (match) districtIds.add(match[1]);
  }
  const districtMetrics: NonNullable<PressureInputs['districtMetrics']> = {};
  for (const districtId of [...districtIds].sort()) {
    districtMetrics[districtId] = {
      alertPressure: num(dc[districtId]?.alertPressure),
      rumorDensity: num(dc[districtId]?.rumorDensity),
      stability: clamp(0, 100, DISTRICT_STABILITY_BASE + num(globals[`district_${districtId}_safety`])),
    };
  }

  return {
    playerRumors: [], // documented ceiling — see file header
    reputation,
    milestones: state.milestones,
    factionStates,
    districtMetrics,
    playerLevel: 1, // unread by every authored spawn rule; wire when one reads it
    totalTurns: currentTick,
    activePressures,
    genre,
    currentTick,
  };
}

// ---------------------------------------------------------------------------
// Event emission — the canonical store.emitEvent choke point (deterministic
// ids, live eventLog, bus fan-out), same authority defeat-fallout's emits
// reach via ctx.events.emit → store.recordEvent.
// ---------------------------------------------------------------------------

function emitPressureEvent(
  engine: Engine,
  type: string,
  payload: Record<string, unknown>,
  opts: { hidden: boolean; priority: 'normal' | 'high' },
): void {
  engine.store.emitEvent(
    type,
    payload,
    opts.hidden
      ? // The world knows; the player doesn't. Recorded for the simulation
        // record (chronicle, director, inspector) but carries no presentation
        // block — it must not tint the round's tone — and the renderer
        // returns null for it.
        { visibility: 'hidden' }
      : {
          visibility: 'public',
          presentation: { channels: ['narrator'], priority: opts.priority },
        },
  );
}

function pressurePayload(pressure: WorldPressure): Record<string, unknown> {
  return {
    pressureId: pressure.id,
    kind: pressure.kind,
    description: pressure.description,
    urgency: pressure.urgency,
    visibility: pressure.visibility,
    sourceFactionId: pressure.sourceFactionId,
  };
}

// ---------------------------------------------------------------------------
// Fallout application
// ---------------------------------------------------------------------------

/**
 * Apply an expired pressure's fallout to the same ledger defeat-fallout
 * accrues into, and mint any chain pressures. Chains spawn 'rumored' (fallout
 * is word getting around by nature) and respect the system's one-active-per-
 * kind invariant. Effects with no wired store (rumor, title-trigger,
 * economy-shift, spawn-opportunity) are carried by the pressure.expired
 * payload instead — see file header.
 */
function applyFallout(
  world: WorldState,
  state: WorldTickState,
  fallout: PressureFallout,
  currentTick: number,
): WorldPressure[] {
  const chains: WorldPressure[] = [];
  for (const effect of fallout.effects) {
    switch (effect.type) {
      case 'reputation':
        addGlobal(world, `reputation_${effect.factionId}`, effect.delta);
        break;
      case 'alert':
        addGlobal(world, `faction_alert_${effect.factionId}`, effect.delta);
        break;
      case 'district':
        // Same key family defeat-fallout writes (district_<id>_safety).
        addGlobal(world, `district_${effect.districtId}_${effect.metric}`, effect.delta);
        break;
      case 'milestone-tag':
        // Feeds back into the genre spawn rules' milestone conditions.
        state.milestones.push({
          label: `pressure:${fallout.resolution.pressureKind}`,
          tags: [effect.tag],
        });
        break;
      case 'spawn-pressure': {
        const chain = makePressure(
          {
            kind: effect.kind,
            sourceFactionId: effect.sourceFactionId,
            description: effect.description,
            triggeredBy: `chain:${fallout.resolution.pressureId}`,
            urgency: effect.urgency,
            visibility: 'rumored',
            turnsRemaining: CHAIN_TURNS_REMAINING,
            potentialOutcomes: [],
            tags: effect.tags,
            currentTick,
          },
          world,
        );
        chain.chainedFrom = fallout.resolution.pressureId;
        chains.push(chain);
        break;
      }
      default:
        break; // rides the pressure.expired payload
    }
  }
  return chains;
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

/**
 * Run one world tick: the accrued heat/safety/reputation/alert ledger drives
 * the pressure lifecycle, and every player-visible transition lands in the
 * eventLog with a presentation block so the round's narration counts it.
 *
 * Guarded like runNpcTurns: any throw logs ONE bounded line and returns
 * `ok: false` — a buggy tick loses one round of world reaction, never the
 * session. (A mid-tick throw may leave that round's fallout partially
 * applied — the same partial-round contract NPC turns already have.)
 */
export function runWorldTick(engine: Engine, opts: WorldTickOptions = {}): WorldTickResult {
  const log = opts.log ?? console.log;
  try {
    return tickWorld(engine, opts.genre ?? '');
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    let line = raw.replace(/\s+/g, ' ').trim();
    if (!line) line = 'unknown error';
    if (line.length > 200) line = line.slice(0, 199) + '…';
    log(`  (the world's pressures slip out of focus this round: ${line})`);
    return { ok: false, heat: 0, spawned: [], revealed: [], escalated: [], expired: [], active: [] };
  }
}

function tickWorld(engine: Engine, genre: string): WorldTickResult {
  const world = engine.store.state;
  const state = getWorldTickState(world);
  const currentTick = engine.tick;
  const heat = num(world.globals[HEAT_KEY]);

  // 1. Milestones from the delta (before we append our own events).
  collectMilestones(world, state);

  // 2. The module's own lifecycle: timers, expiry, visibility surfacing.
  const prevById = new Map(state.pressures.map((p) => [p.id, p]));
  const { active, expired } = tickPressures(state.pressures, currentTick);

  const revealed: WorldPressure[] = [];
  for (const pressure of active) {
    const prev = prevById.get(pressure.id);
    if (prev && prev.visibility === 'hidden' && pressure.visibility !== 'hidden') {
      revealed.push(pressure);
      emitPressureEvent(engine, 'pressure.revealed', pressurePayload(pressure), {
        hidden: false,
        priority: 'high',
      });
    }
  }

  // 3. Expiries → fallout → ledger + chains.
  const spawned: WorldPressure[] = [];
  const expiredFallouts: PressureFallout[] = [];
  const playerDistrictId = getPlayerDistrictId(world);
  const activeKinds = new Set(active.map((p) => p.kind));
  for (const pressure of expired) {
    const fallout = computeFallout(pressure, 'expired-ignored', genre, {
      resolvedBy: 'expiry',
      currentTick,
      playerDistrictId,
      resolutionVisibility: pressure.visibility,
    });
    const chains = applyFallout(world, state, fallout, currentTick);
    expiredFallouts.push(fallout);

    const wasHidden = pressure.visibility === 'hidden';
    emitPressureEvent(
      engine,
      'pressure.expired',
      {
        ...pressurePayload(pressure),
        summary: fallout.summary,
        resolutionType: fallout.resolution.resolutionType,
        effects: fallout.effects,
        ...(fallout.warnings ? { warnings: fallout.warnings } : {}),
      },
      { hidden: wasHidden, priority: 'normal' },
    );

    for (const chain of chains) {
      if (activeKinds.has(chain.kind)) continue; // one active pressure per kind
      activeKinds.add(chain.kind);
      active.push(chain);
      spawned.push(chain);
      emitPressureEvent(
        engine,
        'pressure.spawned',
        { ...pressurePayload(chain), triggeredBy: chain.triggeredBy, chainedFrom: chain.chainedFrom },
        { hidden: false, priority: 'high' },
      );
    }
  }

  // 4. Sustained heat sharpens what's already in motion.
  const escalated: WorldPressure[] = [];
  if (heat >= HEAT_ESCALATION_THRESHOLD) {
    for (const pressure of active) {
      const before = urgencyBand(pressure.urgency);
      pressure.urgency = Math.min(1, round2(pressure.urgency + HEAT_URGENCY_STEP));
      const after = urgencyBand(pressure.urgency);
      if (after !== before && pressure.visibility !== 'hidden') {
        escalated.push(pressure);
        emitPressureEvent(
          engine,
          'pressure.escalated',
          { ...pressurePayload(pressure), band: after, heat },
          { hidden: false, priority: after === 'urgent' ? 'high' : 'normal' },
        );
      }
    }
  }

  // 5. Heat opens the spawn valve; the authored conditions pick the pressure.
  if (heat >= HEAT_WAKE_THRESHOLD) {
    const result = evaluatePressures(buildPressureInputs(world, state, genre, currentTick, active));
    if (result) {
      active.push(result.pressure);
      spawned.push(result.pressure);
      emitPressureEvent(
        engine,
        'pressure.spawned',
        {
          ...pressurePayload(result.pressure),
          triggeredBy: result.pressure.triggeredBy,
          reason: result.reason,
        },
        { hidden: result.pressure.visibility === 'hidden', priority: 'high' },
      );
    }
  }

  // 6. Sustained quiet cools off. A fight's own rhythm (misses, movement, a
  // rejected swing) must not bleed heat between kills — decay starts only
  // after QUIET_ROUNDS_BEFORE_DECAY consecutive rounds with no new heat. Heat
  // is written back only when it actually decays — a world where heat never
  // accrued never gains the key.
  let finalHeat = heat;
  if (heat > state.lastHeat) {
    state.quietRounds = 0;
  } else {
    state.quietRounds = num(state.quietRounds) + 1;
    if (heat > 0 && state.quietRounds >= QUIET_ROUNDS_BEFORE_DECAY) {
      finalHeat = Math.max(0, heat - HEAT_DECAY_PER_QUIET_TICK);
      world.globals[HEAT_KEY] = finalHeat;
    }
  }
  state.lastHeat = finalHeat;

  state.pressures = active;
  return { ok: true, heat: finalHeat, spawned, revealed, escalated, expired: expiredFallouts, active };
}
