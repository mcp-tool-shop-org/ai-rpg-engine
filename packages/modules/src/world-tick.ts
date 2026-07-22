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
//   0. zone-entry encounter check (encounter-spawn.ts — F-ENG005-encounter-
//      spawn-wiring): the round's player zone entries are read from the SAME
//      eventLog delta discipline as the milestone cursor, and a registered
//      pack's authored encounter tables may spawn a tactical encounter into
//      the entered zone. Runs first so the ambush's narration lands ahead of
//      the strategic pressure beats in the round's delta. Packs that never
//      registered spawn content are a byte-identical no-op.
//   0b. economy tick (F-d0b5edb5): every district economy-core seeded
//      (createEconomyCore, buildWorldStack) ticks once via tickDistrictEconomy,
//      fed by district-core's own live commerce/stability. The write-wire
//      that finally activates director.ts's MARKET OVERVIEW/FACTIONS sections
//      and endgame.ts's merchant-prince arc/collapse trigger — and feeds this
//      round's buildPressureInputs (step 5) below. No-op when the pack never
//      registered economy-core (nothing to tick).
//   0c. district mood transition (F-e5817c7c-adjacent rider): district-mood.ts's
//      computeDistrictMood was fully authored/tested with no memory of the
//      PREVIOUS tone, so a district sliding into 'grim' or blooming into
//      'prosperous' never reached the party — 2 of the REACTION_TABLE's own
//      12 previously-dormant triggers ('district-grim'/'district-prosperous').
//      Tracks the player's CURRENT district's tone round over round (a
//      district the player isn't in shouldn't move their companions) and
//      queues a reaction trigger on a TRANSITION only, never a steady state —
//      same "band crossing, not every increment" discipline step 4's own
//      HEAT_URGENCY_STEP escalation already uses. No-op when there is no
//      district system or the player isn't in one.
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
//   5a. NPC agency tick (v3.0, F-v3-npc-agency): npc-agency.ts's
//      runNpcAgencyTick was fully authored and unit-tested with ZERO
//      production callers — named NPCs never acted, and their goals/
//      relationships/obligations never left memory. Gated on "at least one
//      named NPC exists this round" (SEED-0 identity: a world with none is
//      untouched — no namespace, no events, no state write). When gated
//      open: ticks obligation decay, builds this round's profiles, runs the
//      tick, applies every returned NpcEffect through the SAME application
//      style applyFallout below already uses (addGlobal for reputation/
//      alert, makePressure for chains respecting one-active-per-kind,
//      setPersistedOpportunities for opportunities, setBelief/addMemory for
//      belief/memory, direct zoneId mutation for zone-change, companion-core
//      for morale-on-a-companion and companion-departure, spawnNpcOriginated
//      Rumor for npc-rumor), and persists profiles + last-actions +
//      obligation ledgers to world.modules['npc-agency'] — the shape
//      director.ts's PEOPLE section already reads. See runNpcAgencyStep's
//      own docstring for the full contract and the effects this wave still
//      cannot reach (the standalone 'rumor' NpcEffect — no current producer).
//   5b. opportunity spawn/tick wire (F-ceed887f): opportunity-core.ts's
//      evaluateOpportunities/tickOpportunities were fully authored and unit-
//      tested with ZERO production callers (its own file header: "Pure
//      functions, no module registration") — a world could accrue every
//      signal these rules key off and never once see a contract, bounty, or
//      favor-request appear. Runs every round — UNLIKE pressures, none of the
//      5 live rules key off heat — directly after the pressure lifecycle
//      settles, so linkedPressureId can reference this round's own
//      post-escalation/post-spawn pressure list. Persists
//      world.modules['opportunity-core'] = { opportunities: [...] } — the
//      EXACT shape director.test.ts pins (director.ts's OPPORTUNITIES section
//      needs no edit; it already reads this namespace). The 2 npc-dependent
//      rules (npc-goal, obligation) are now fed REAL npcProfiles/
//      npcObligations — step 5a above (this wave) is the production writer
//      npc-agency.ts never had; before this wave they no-op'd cleanly on the
//      hardcoded-empty inputs this step used to pass.
//   5b-i. opportunity natural-expiry fallout (Phase-9 remediation): mirrors
//      step 3's pressure-expiry block — tickOpportunities' own `expired`
//      array used to be discarded, so every getXFallout function's
//      fully-authored 'expired' case (rep hits, obligations, economy shifts)
//      never ran; an opportunity's deadline was cosmetic. Now computes +
//      applies + ledgers + emits `opportunity.expired` for each, exactly the
//      same four-beat shape as the pressure-expiry block, using the SAME
//      actor identity the resolution verb uses (world.playerId — an
//      opportunity is only ever accepted by the player).
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
// doesn't exist yet, so the rumor-gated spawn rules stay dormant. Step 5a's
// own npc-agency tick passes the SAME undefined playerRumors for the same
// reason. Economy inputs (F-d0b5edb5/F-6008456f): district economies now
// tick every round (step 0b below) and buildPressureInputs sets
// districtEconomies from the same store, so the 4 economy-driven pressure
// kinds (supply-crisis, trade-war, black-market-boom, crafting-shortage) can
// fire for any pack that registers economy-core (buildWorldStack does,
// unconditionally). Fallout rumor / title-trigger / economy-shift /
// spawn-opportunity effects are still not applied to any store — they ride
// the `pressure.expired` payload for downstream layers (a pressure's OWN
// resolution fallout is a separate, still-open wire from the
// district-economy store this file now ticks). The standalone 'rumor'
// NpcEffect (distinct from 'npc-rumor') has no current producer in
// resolveNpcAction and no rumor writer that fits an NPC-sourced generic claim
// without misattributing it as player-initiated (player-rumor.ts's
// spawnIntentionalRumor tags its source as 'player-leverage') — deferred,
// same honest-ceiling posture as the rest of this list.

import type { Engine, EngineModule, ResolvedEvent, WorldState } from '@ai-rpg-engine/core';
import {
  tickPressures,
  evaluatePressures,
  makePressure,
  type WorldPressure,
  type PressureInputs,
} from './pressure-system.js';
import { computeFallout, type PressureFallout } from './pressure-resolution.js';
import { getDistrictForZone, getDistrictState, getDistrictDefinition } from './district-core.js';
import { runEncounterSpawnStep, type SpawnedEncounterReport } from './encounter-spawn.js';
import { getEconomyCoreState, setDistrictEconomy, tickDistrictEconomy } from './economy-core.js';
import {
  COMPANION_TAG,
  getPartyState,
  setPartyState,
  getCompanion,
  isCompanion,
  adjustCompanionMorale,
  removeCompanion,
  removeCompanionTags,
  refreshCompanionAbilityStatus,
  syncCompanionCustomFields,
} from './companion-core.js';
import { evaluateCompanionReactions, type ReactionTrigger } from './companion-reactions.js';
import {
  isNamedNpc,
  buildAllNpcProfiles,
  runNpcAgencyTick,
  tickObligations,
  createObligation,
  addObligation,
  getPersistedNpcProfiles,
  getPersistedNpcObligations,
  getPersistedNpcLastActions,
  setPersistedNpcState,
  type LoyaltyBreakpoint,
  type NpcObligationLedger,
} from './npc-agency.js';
import { computeDistrictMood, type DistrictMood } from './district-mood.js';
import {
  evaluateOpportunities,
  tickOpportunities,
  getPersistedOpportunities,
  setPersistedOpportunities,
  makeOpportunity,
  type OpportunityInputs,
  type OpportunityState,
} from './opportunity-core.js';
import {
  computeOpportunityFallout,
  applyOpportunityFallout,
  appendResolvedOpportunity,
  type OpportunityFallout,
} from './opportunity-resolution.js';
import { getLeverageState } from './player-leverage.js';
import { getCognition, setBelief, addMemory } from './cognition-core.js';
import {
  spawnNpcOriginatedRumor,
  propagateRumor,
  getPlayerRumorState,
  setPlayerRumorState,
  type NpcRumorSource,
} from './player-rumor.js';

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

/**
 * Most recent resolved-pressure fallout records kept in persisted state
 * (oldest dropped past the cap). Bounded on purpose: the ledger rides every
 * save, and its consumers are display surfaces — the Director's Ledger
 * PRESSURE FALLOUT section and endgame's resolvedPressures input (declared in
 * ArcInputs, read by no threshold today) — which want the recent history, not
 * an unbounded archive.
 */
export const RESOLVED_PRESSURES_KEPT = 20;

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
  /**
   * Fallout records of pressures that resolved (expired) — most recent
   * RESOLVED_PRESSURES_KEPT, oldest dropped. Read via getResolvedPressures.
   * OPTIONAL because saves written before this field existed persist the
   * namespace without it — the tick lazy-initializes it and every reader
   * tolerates absence (the module ships no migrateState; tolerant readers ARE
   * its drift policy).
   */
  resolvedPressures?: PressureFallout[];
  /**
   * The player's district's mood tone as of the END of the last tick that
   * observed it, keyed by districtId (F-e5817c7c-adjacent rider). Read/written
   * only by step 0c below; a district never yet observed (or a save from
   * before this field existed) is simply absent from the map — the first
   * observation establishes a silent baseline rather than firing a spurious
   * "transition" from nothing. OPTIONAL for the same pre-field-save reason
   * resolvedPressures is.
   */
  districtTones?: Record<string, DistrictMood['tone']>;
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
  /** Encounters spawned by this round's zone entries (encounter-spawn step). */
  encounters: SpawnedEncounterReport[];
  /** Opportunities spawned this round by the opportunity wire (F-ceed887f). */
  opportunitiesSpawned: OpportunityState[];
  /**
   * Fallout of opportunities that expired this round (effects already
   * applied, ledger already appended) — Phase-9 remediation, FIX 2. Mirrors
   * `expired` above, opportunity-side.
   */
  opportunitiesExpired: OpportunityFallout[];
};

// ---------------------------------------------------------------------------
// Module-state access (synthesize-and-attach — same pattern as defeat-fallout)
// ---------------------------------------------------------------------------

const STATE_KEY = 'world-tick';

/**
 * Fresh driver state for the world it joins. `lastEventIndex` baselines to
 * the CURRENT eventLog length (P8-WL-006): on a fresh world the log is empty
 * so the cursor starts at 0 exactly as before, but on a restored pre-v2.7
 * save whose namespace is absent, a 0 cursor made the first tick re-scan the
 * old session's entire log. Nothing historical is re-consumed; the delta
 * discipline starts from "now".
 */
function freshWorldTickState(world: WorldState): WorldTickState {
  return {
    pressures: [],
    lastHeat: 0,
    quietRounds: 0,
    lastEventIndex: world.eventLog.length,
    milestones: [],
    resolvedPressures: [],
    districtTones: {},
  };
}

export function getWorldTickState(world: WorldState): WorldTickState {
  const existing = world.modules[STATE_KEY] as WorldTickState | undefined;
  if (existing) return existing;
  const fresh = freshWorldTickState(world);
  world.modules[STATE_KEY] = fresh;
  return fresh;
}

/**
 * The world-tick driver's EngineModule identity (P8-SP-003). The driver
 * itself stays a per-round function call (runWorldTick — the CLI drives it;
 * registration order can't), but its persisted slice is the most actively
 * evolved state shape in the tree and was invisible to the ENG-009 migration
 * seam: never version-stamped into meta.moduleVersions, never reachable by
 * migrateModuleStates. Registering this module puts the slice in the stamped
 * set, exactly like quest-core/encounter-spawn declare theirs.
 *
 * The namespace default is a FACTORY (NamespaceDefaultsFactory): cursor state
 * must baseline to the eventLog length of the world it joins — 0 at fresh
 * construction (empty log), the full historical length when a legacy save
 * without the namespace is restored and initialized (P8-WL-006). No
 * migrateState hook: present slices load as-is across versions because every
 * reader (the tick, the accessors below) tolerates absent fields.
 */
export function createWorldTick(): EngineModule {
  return {
    id: STATE_KEY,
    version: '1.0.0',

    register(ctx) {
      ctx.persistence.registerNamespace(STATE_KEY, (world: WorldState) =>
        freshWorldTickState(world),
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Read accessors — the stable pressure API for display/scoring surfaces
// (P8-WL-003). world-tick's namespace is the SINGLE source of truth for
// persisted pressures; these accessors are the supported way to read it.
// Intended callers (the CLI converts to these): endgame.ts
// buildEndgameInputs (activePressures + resolvedPressures axes), director.ts
// renderDirectorLedger (ACTIVE PRESSURES + PRESSURE FALLOUT sections), and
// inspect.ts's save report (active-pressure count, absent-vs-zero via
// hasWorldTickState).
//
// Contract, identical for all three:
//   - NON-ATTACHING: pure reads, never synthesize-and-attach — safe on
//     structuredClone'd display worlds (director) and on inspection paths
//     whose promise is "a save taken after rendering is byte-identical to one
//     taken before".
//   - DEFENSIVE: absent namespace, absent field, or a malformed (non-array)
//     value all degrade to [] — engines that never ran a world tick read as
//     "no pressures", never a throw.
//   - Array items are filtered to plain objects (the persisted shapes);
//     callers get the module's own types back without re-narrowing.
// ---------------------------------------------------------------------------

/** Narrow an unknown to an array of plain objects (persisted-state reads). */
function objectArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is T => typeof v === 'object' && v !== null);
}

/** Peek the persisted namespace WITHOUT attaching (see accessor contract). */
function peekState(world: WorldState): WorldTickState | undefined {
  const ns = world.modules[STATE_KEY];
  return typeof ns === 'object' && ns !== null && !Array.isArray(ns)
    ? (ns as WorldTickState)
    : undefined;
}

/**
 * True when this world carries a world-tick namespace at all — the driver has
 * run (or the module initialized it). Lets inspection surfaces distinguish
 * "no pressure system in this world" (hide the line) from "pressure system
 * live, zero active" (render 0), which getActivePressures alone cannot.
 */
export function hasWorldTickState(world: WorldState): boolean {
  return peekState(world) !== undefined;
}

/**
 * Active pressures persisted by the world tick — the array evaluateEndgame's
 * activePressures axis, the Director's ACTIVE PRESSURES section, and
 * inspect-save's pressure count must read. [] when the namespace is absent or
 * malformed. Non-attaching; see the accessor contract above.
 */
export function getActivePressures(world: WorldState): WorldPressure[] {
  return objectArray<WorldPressure>(peekState(world)?.pressures);
}

/**
 * Fallout records of resolved (expired) pressures, most recent last, bounded
 * to RESOLVED_PRESSURES_KEPT by the tick. Feeds the Director's PRESSURE
 * FALLOUT section and endgame's resolvedPressures input. [] when the
 * namespace is absent, predates the field, or is malformed. Non-attaching;
 * see the accessor contract above.
 */
export function getResolvedPressures(world: WorldState): PressureFallout[] {
  return objectArray<PressureFallout>(peekState(world)?.resolvedPressures);
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

/**
 * Tick every district economy-core seeded, once per round (F-d0b5edb5): the
 * write-wire that activates createDistrictEconomy's persisted state. Reads
 * each district's live commerce/stability from district-core's own
 * getDistrictState. Commerce rides district-core's 0-100 gauge directly;
 * stability is scaled ×10 because district-core's own metric is a ~0-10
 * zone-property average (the same units mismatch DISTRICT_STABILITY_BASE's
 * own comment documents for pressure inputs), while tickDistrictEconomy's
 * STABILITY_DRIFT_THRESHOLD (30) and its own tests assume a 0-100 scale —
 * district-core's default (5) lands exactly on economy-core's neutral
 * baseline (50) after the ×10 scale, so an unconfigured district ticks as
 * neutral on both sides. A district absent from district-core (mismatched
 * configs) falls back to the same neutral defaults. No-op when the pack
 * never registered economy-core — getEconomyCoreState degrades to {} (see
 * its own accessor contract).
 */
function tickDistrictEconomies(world: WorldState, currentTick: number): void {
  const { districts } = getEconomyCoreState(world);
  for (const districtId of Object.keys(districts)) {
    const district = getDistrictState(world, districtId);
    const commerce = district?.commerce ?? 50;
    const stability = (district?.stability ?? 5) * 10;
    setDistrictEconomy(
      world,
      districtId,
      tickDistrictEconomy(districts[districtId], commerce, stability, currentTick),
    );
  }
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

// ---------------------------------------------------------------------------
// Companion reactions (F-b595731a) — companion-reactions.ts's
// evaluateCompanionReactions/evaluateDepartureRisk were fully authored and
// unit-tested with ZERO production callers: a recruited companion's morale
// never changed after joining, and departures never fired. This is the
// write-wire, driven from the SAME round-delta discipline collectMilestones
// uses above.
//
// v2.8-shippable cut: 4 of the 16 REACTION_TABLE triggers are wired to a
// real production event/state signal today, via 2 event sources; of those
// 4, only 3 are actually reachable in a played session (F-P9-003: the prior
// "2 of 16" count conflated event sources with trigger keys — 2 sources,
// 4 keys) —
//   - combat.entity.defeated: a hostile going down → 'combat-won'
//     (reachable). An intercepting companion going down ALSO maps to
//     'combat-lost' (reachable — interception keeps the player alive, so
//     the round's world tick still runs). The PLAYER going down maps to
//     that same 'combat-lost' key below, but F-P9-002: that sub-case can
//     never fire in the shipped CLI — runHostileRound's "no tick over a
//     corpse" gate (bin.ts, P8-WL-010) always returns before runWorldTick
//     in the exact round the player is defeated, so this file never scans
//     that round's event-log delta. The code path stays as the honest
//     ceiling it is, not wired away.
//   - pressure.expired: 'resolved-by-player' → 'pressure-resolved-well'
//     (wired but UNREACHABLE today — this file's only computeFallout call
//     site, step 3 below, always passes the literal 'expired-ignored', so
//     resolutionType can never equal 'resolved-by-player' in production);
//     every other resolutionType (today, always that same literal) →
//     'pressure-resolved-badly' (reachable).
// v2.9 (F-e5817c7c-adjacent rider): +2 more, +1 event source —
//   - district-core's live DistrictState, read every tick through district-
//     mood.ts's computeDistrictMood (step 0c above) → 'district-grim' /
//     'district-prosperous' (both reachable) on a tone TRANSITION only,
//     never a steady state. 6 of 16 triggers now wired, via 3 sources.
// The remaining 10 triggers (leverage-*, betrayal-witnessed,
// obligation-betrayed, item-*-recognized) have no production event or
// persisted state to key off yet: player-leverage.ts's resolveSocialAction/
// resolveRumorAction/resolveSabotageAction emit no ResolvedEvents and have no
// production caller; item-recognition's chronicle never reaches the world
// eventLog; npc-agency's obligation ledger IS now persisted (v3.0,
// F-v3-npc-agency's step 5a below writes world.modules['npc-agency'] every
// round a named NPC exists) but nothing in this file's own trigger-collection
// logic yet SCANS it for a 'betrayed' obligation to key 'obligation-betrayed'
// off — the ledger existing is necessary but not sufficient; that specific
// scan is still a distinct, unscoped follow-up. This is an honest ceiling,
// not an oversight — mirrors this file's own documented ceilings in the
// header above — deferred to a follow-up wave explicitly scoped to wire
// those event sources, named here
// so it is not silently dropped.
// ---------------------------------------------------------------------------

/**
 * Map one combat.entity.defeated event onto a companion-reaction trigger.
 * Anything else (a non-hostile bystander, an unrecognized tag set) has no
 * clear reaction and is skipped (undefined).
 */
function combatReactionTrigger(event: ResolvedEvent, world: WorldState): ReactionTrigger | undefined {
  if (event.type !== 'combat.entity.defeated') return undefined;
  const defeatedId = typeof event.payload.entityId === 'string' ? event.payload.entityId : undefined;
  if (!defeatedId) return undefined;
  if (defeatedId === world.playerId) return 'combat-lost';
  const entity = world.entities[defeatedId];
  if (entity?.tags.includes(COMPANION_TAG)) return 'combat-lost';
  if (entity && (entity.tags.includes('enemy') || entity.tags.includes('hostile'))) return 'combat-won';
  return undefined;
}

/** Scan the round's event-log delta [start, end) for combat reaction triggers. */
function collectCombatReactionTriggers(world: WorldState, start: number, end: number): ReactionTrigger[] {
  const triggers: ReactionTrigger[] = [];
  const log = world.eventLog;
  for (let i = start; i < end && i < log.length; i++) {
    const trigger = combatReactionTrigger(log[i], world);
    if (trigger) triggers.push(trigger);
  }
  return triggers;
}

/**
 * Apply every trigger this round produced to the live party: role-based
 * morale deltas (adjustCompanionMorale), and on `reaction.departure`,
 * removeCompanion PLUS the symmetric tag strip (removeCompanionTags) so a
 * companion who leaves stops rendering as one everywhere else. Recomputes
 * the ability-modifier status mirror (F-66cd1cd0) at the end since the
 * active roster may have shrunk. No-op when there is no party or nothing
 * triggered this round — the common case for most rounds.
 *
 * `breakpoints` (optional) forwards to evaluateCompanionReactions' own
 * departure gate (`projectedMorale <= 10 && breakpoint is hostile/wavering`).
 * The real call site below (v3.0, F-v3-npc-agency) now passes the PREVIOUS
 * round's persisted npc-agency breakpoints (getPersistedNpcProfiles) — this
 * round's own fresh profiles aren't computed until step 5a, later in the
 * same tick, so "as of the most recently known state" is the earliest this
 * call site can honestly read. Empty when no named NPC has ever existed
 * (SEED-0) or this is the very first round a named NPC appears. Exported and
 * parameterized (rather than hardcoded) so it stays directly testable with a
 * hand-built map too.
 */
export function applyCompanionReactions(
  engine: Engine,
  world: WorldState,
  triggers: ReactionTrigger[],
  currentTick: number,
  breakpoints?: Map<string, LoyaltyBreakpoint>,
): void {
  if (triggers.length === 0) return;
  let party = getPartyState(world);
  if (party.companions.length === 0) return;

  let changed = false;
  for (const trigger of triggers) {
    const reactions = evaluateCompanionReactions(party.companions, trigger, { tick: currentTick, breakpoints });
    for (const reaction of reactions) {
      const companion = getCompanion(party, reaction.npcId);
      if (!companion) continue;

      party = adjustCompanionMorale(party, reaction.npcId, reaction.moraleDelta);
      changed = true;
      const newMorale = getCompanion(party, reaction.npcId)?.morale ?? 0;
      const entityForSync = world.entities[reaction.npcId];
      // Keep npc-agency's own .custom.companionMorale mirror in sync — its
      // deriveCompanionGoals reads that field directly, not party state.
      if (entityForSync) syncCompanionCustomFields(entityForSync, companion.role, newMorale);
      engine.store.emitEvent('companion.reaction', {
        npcId: reaction.npcId,
        trigger: reaction.trigger,
        moraleDelta: reaction.moraleDelta,
        morale: newMorale,
        narratorHint: reaction.narratorHint,
      }, {
        targetIds: [reaction.npcId],
        presentation: { channels: ['narrator'], priority: 'low' },
      });

      if (reaction.departure) {
        const removal = removeCompanion(party, reaction.npcId);
        party = removal.party;
        const entity = world.entities[reaction.npcId];
        if (entity) removeCompanionTags(entity, companion.role);
        engine.store.emitEvent('companion.departed', {
          npcId: reaction.npcId,
          npcName: entity?.name ?? reaction.npcId,
          role: companion.role,
          reason: reaction.departureReason ?? 'left the party',
        }, {
          targetIds: [reaction.npcId],
          presentation: { channels: ['objective', 'narrator'], priority: 'high' },
        });
      }
    }
  }

  if (!changed) return;
  setPartyState(world, party);

  const player = world.entities[world.playerId];
  if (player) {
    const statusEvent = refreshCompanionAbilityStatus(world, party, player, currentTick);
    if (statusEvent) engine.store.recordEvent(statusEvent);
  }
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

  // District economies (F-6008456f): the SAME store F-d0b5edb5's economy tick
  // persists (world.modules['economy-core'].districts), converted to the Map
  // shape PressureInputs.districtEconomies declares. Empty when the pack never
  // registered economy-core — evaluatePressures' economy branch already
  // guards on `districtEconomies.size === 0` and degrades to null, exactly
  // like every other axis here degrades when its module is absent.
  const districtEconomies = new Map(Object.entries(getEconomyCoreState(world).districts));

  return {
    playerRumors: [], // documented ceiling — see file header
    reputation,
    milestones: state.milestones,
    factionStates,
    districtMetrics,
    districtEconomies,
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
// NPC agency (v3.0 headline wire, F-v3-npc-agency) — see file header step 5a.
// ---------------------------------------------------------------------------

/** Deadline an NPC-bargained opportunity carries (opportunity-core.ts's own
 *  internal DEFAULT_DEADLINE is 12 but not exported — this is an independent,
 *  intentionally-matching constant, not a re-export). */
const NPC_OPPORTUNITY_TURNS_REMAINING = 12;

/** Neutral urgency for an NPC-bargained opportunity — the effect itself
 *  carries no urgency signal to derive a sharper number from. */
const NPC_OPPORTUNITY_URGENCY = 0.5;

const NPC_RUMOR_SOURCES = new Set<NpcRumorSource>([
  'npc-accusation', 'npc-betrayal', 'npc-warning', 'npc-concealment', 'npc-gossip',
]);

/**
 * Gate + drive npc-agency.ts's runNpcAgencyTick for one round, applying every
 * returned NpcEffect and persisting the round's profiles/last-actions/
 * obligation ledgers to world.modules['npc-agency'].
 *
 * SEED-0 IDENTITY (non-negotiable): a world with NO named NPCs must be
 * byte-identical to today — no npc-agency namespace created, no events, no
 * state mutation of any kind. The `namedNpcsPresent` check below is the
 * entire gate; when false this function reads nothing and writes nothing.
 *
 * Effect application mirrors applyFallout above's posture (direct-to-ledger,
 * same stores):
 *   - belief/memory   → setBelief/addMemory (cognition-core.ts, already the
 *     exported writers cognition-core's own internal listeners use)
 *   - morale          → companion-core's adjustCompanionMorale (+ the
 *     .custom mirror) when the entity is a party companion, else direct
 *     CognitionState.morale mutation (the same un-wrappered mutation
 *     cognition-core.ts's own combat listeners use — there is no separate
 *     setter function)
 *   - suspicion       → direct CognitionState.suspicion mutation (ditto)
 *   - reputation/alert → addGlobal, the SAME globals defeat-fallout/
 *     applyFallout accrue into
 *   - zone-change     → direct entity.zoneId mutation (combat-core.ts's
 *     disengage and traversal-core.ts's move handler both do the same; no
 *     dedicated "moveEntity" helper exists to route through instead).
 *     Deliberately scoped to the state change alone — NOT re-emitting
 *     world.zone.entered (which would cascade into cognition-core's
 *     perception listener and encounter-spawn's zone-entry check) is a
 *     boundary this wave draws on purpose, not an oversight.
 *   - pressure        → makePressure + push into `active`, respecting the
 *     one-active-per-kind invariant, + `pressure.spawned` (mirrors
 *     applyFallout's own chain-pressure spawn exactly)
 *   - obligation      → createObligation + addObligation into the ledger
 *     this function persists
 *   - npc-rumor       → player-rumor.ts's spawnNpcOriginatedRumor (+
 *     propagateRumor for any additional targetFactionIds beyond the first)
 *   - companion-departure → companion-core's removeCompanion +
 *     removeCompanionTags + `companion.departed` (mirrors
 *     applyCompanionReactions' own departure handling above exactly)
 *   - spawn-opportunity → a minimal, honestly-scoped OpportunityState via
 *     makeOpportunity (empty rewards/risks — the effect carries no concrete
 *     amounts to invent) appended via setPersistedOpportunities, +
 *     `opportunity.spawned`
 *   - rumor           → DEFERRED. No current producer in resolveNpcAction
 *     (only 'npc-rumor' is ever emitted) and no writer fits an NPC-sourced
 *     generic claim without misattributing it as player-initiated
 *     (spawnIntentionalRumor tags source 'player-leverage'). Honest ceiling.
 *
 * Every resolved NPC action ALSO emits one bounded `npc.action.resolved`
 * event bundling its full effects array (the SAME "embed the array in one
 * event" posture `pressure.expired`/`opportunity.expired` already use,
 * rather than one event per effect) — this is what lets the round's
 * narration draw on narratorHint/dialogueHint.
 */
function runNpcAgencyStep(
  engine: Engine,
  world: WorldState,
  active: WorldPressure[],
  currentTick: number,
  playerDistrictId: string | undefined,
  genre: string,
): void {
  const namedNpcsPresent = Object.values(world.entities).some((e) => isNamedNpc(e, world.playerId));
  if (!namedNpcsPresent) return; // SEED-0 identity — read and write nothing

  // Age the obligation ledgers BEFORE building this round's profiles/goals —
  // the same "age the lifecycle, then evaluate against the aged version"
  // order tickPressures/tickOpportunities already use for their own state.
  const obligationLedgers = new Map<string, NpcObligationLedger>();
  for (const [npcId, ledger] of getPersistedNpcObligations(world)) {
    obligationLedgers.set(npcId, tickObligations(ledger));
  }

  // playerRumors: undefined — the SAME honest ceiling buildPressureInputs'
  // own playerRumors: [] already documents in this file's header.
  const profiles = buildAllNpcProfiles(world, world.playerId, active, undefined, obligationLedgers);
  const results = runNpcAgencyTick(world, world.playerId, active, currentTick, undefined, obligationLedgers);

  // Party state and opportunities are each read once and committed once —
  // the SAME batched-commit shape applyCompanionReactions above uses, so N
  // effects touching companions/opportunities cost one write each, not N.
  let party = getPartyState(world);
  let partyChanged = false;
  let opportunities = getPersistedOpportunities(world);
  let opportunitiesChanged = false;
  const rumorState = getPlayerRumorState(world);
  let rumors = rumorState.rumors;
  let rumorsChanged = false;

  // Fresh per round from the CURRENT active set — step 3's own `activeKinds`
  // (declared far above) stops being updated after step 3's own loop and
  // does not see step 5's heat-wake spawn, so reusing it here would risk a
  // stale one-active-per-kind check.
  const activeKinds = new Set(active.map((p) => p.kind));

  const lastActionsByNpc = new Map(getPersistedNpcLastActions(world).map((r) => [r.action.npcId, r]));

  for (const result of results) {
    const npc = world.entities[result.action.npcId];
    const npcName = npc?.name ?? result.action.npcId;
    const actingProfile = profiles.find((p) => p.npcId === result.action.npcId);

    for (const effect of result.effects) {
      switch (effect.type) {
        case 'belief':
          setBelief(
            getCognition(world, effect.entityId),
            effect.subject, effect.key, effect.value, effect.confidence,
            'npc-agency', currentTick,
          );
          break;

        case 'memory':
          addMemory(world, getCognition(world, effect.entityId), effect.memType, currentTick, effect.data);
          break;

        case 'morale': {
          if (isCompanion(party, effect.entityId)) {
            party = adjustCompanionMorale(party, effect.entityId, effect.delta);
            partyChanged = true;
            const companion = getCompanion(party, effect.entityId);
            const entity = world.entities[effect.entityId];
            if (companion && entity) syncCompanionCustomFields(entity, companion.role, companion.morale);
          } else {
            const cog = getCognition(world, effect.entityId);
            cog.morale = clamp(0, 100, cog.morale + effect.delta);
          }
          break;
        }

        case 'suspicion': {
          const cog = getCognition(world, effect.entityId);
          cog.suspicion = clamp(0, 100, cog.suspicion + effect.delta);
          break;
        }

        case 'reputation':
          addGlobal(world, `reputation_${effect.factionId}`, effect.delta);
          break;

        case 'alert':
          addGlobal(world, `faction_alert_${effect.factionId}`, effect.delta);
          break;

        case 'zone-change':
          if (world.entities[effect.entityId]) {
            world.entities[effect.entityId].zoneId = effect.toZoneId;
          }
          break;

        case 'pressure': {
          if (activeKinds.has(effect.kind)) break; // one active pressure per kind (applyFallout's own invariant)
          const pressure = makePressure(
            {
              kind: effect.kind,
              sourceFactionId: effect.sourceFactionId,
              description: effect.description,
              triggeredBy: `npc-agency:${effect.sourceNpcId ?? result.action.npcId}`,
              urgency: effect.urgency,
              visibility: 'rumored', // mirrors applyFallout's own chain-pressure visibility
              turnsRemaining: CHAIN_TURNS_REMAINING,
              potentialOutcomes: [],
              tags: ['npc-agency'],
              currentTick,
              sourceNpcId: effect.sourceNpcId ?? result.action.npcId,
            },
            world,
          );
          activeKinds.add(pressure.kind);
          active.push(pressure);
          emitPressureEvent(
            engine,
            'pressure.spawned',
            { ...pressurePayload(pressure), triggeredBy: pressure.triggeredBy },
            { hidden: false, priority: 'high' },
          );
          break;
        }

        case 'obligation': {
          const ledger = obligationLedgers.get(effect.npcId) ?? { obligations: [] };
          const obligation = createObligation(
            effect.kind, effect.direction, effect.npcId, effect.counterpartyId,
            effect.magnitude, effect.sourceTag, currentTick, effect.decayTurns,
          );
          obligationLedgers.set(effect.npcId, addObligation(ledger, obligation));
          break;
        }

        case 'npc-rumor': {
          const source = NPC_RUMOR_SOURCES.has(effect.sourceEvent as NpcRumorSource)
            ? (effect.sourceEvent as NpcRumorSource)
            : 'npc-gossip';
          const [firstFactionId, ...restFactionIds] = effect.targetFactionIds;
          const districtId = npc?.zoneId ? getDistrictForZone(world, npc.zoneId) : undefined;
          let rumor = spawnNpcOriginatedRumor(
            effect.claim, effect.valence, source, effect.originNpcId,
            firstFactionId, districtId, currentTick, 0.75, world,
          );
          for (const extraFactionId of restFactionIds) {
            rumor = propagateRumor(rumor, extraFactionId);
          }
          rumors = [...rumors, rumor];
          rumorsChanged = true;
          break;
        }

        case 'rumor':
          // Honest ceiling — see this function's own docstring.
          break;

        case 'companion-departure': {
          const companion = getCompanion(party, effect.npcId);
          if (companion) {
            const removal = removeCompanion(party, effect.npcId);
            party = removal.party;
            partyChanged = true;
            const entity = world.entities[effect.npcId];
            if (entity) removeCompanionTags(entity, companion.role);
            engine.store.emitEvent('companion.departed', {
              npcId: effect.npcId,
              npcName: entity?.name ?? effect.npcId,
              role: companion.role,
              reason: effect.reason,
            }, {
              targetIds: [effect.npcId],
              presentation: { channels: ['objective', 'narrator'], priority: 'high' },
            });
          }
          break;
        }

        case 'spawn-opportunity': {
          const sourceNpcId = effect.targetNpcId ?? result.action.npcId;
          const sourcePairKey = `${effect.kind}:${sourceNpcId}`;
          const livePairConflict = opportunities.some(
            (o) => (o.status === 'available' || o.status === 'accepted')
              && `${o.kind}:${o.sourceNpcId ?? o.sourceFactionId ?? 'none'}` === sourcePairKey,
          );
          if (livePairConflict) break; // mirrors evaluateOpportunities' own dedup guard
          const opportunity = makeOpportunity({
            kind: effect.kind,
            sourceNpcId,
            sourceFactionId: actingProfile?.factionId ?? undefined,
            title: effect.description,
            description: effect.description,
            objectiveDescription: 'Follow up with them directly.',
            linkedDistrictId: playerDistrictId,
            linkedNpcIds: [sourceNpcId],
            urgency: NPC_OPPORTUNITY_URGENCY,
            turnsRemaining: NPC_OPPORTUNITY_TURNS_REMAINING,
            visibility: 'offered',
            rewards: [],
            risks: [],
            genre,
            currentTick,
            tags: ['npc-agency'],
          });
          opportunities = [...opportunities, opportunity];
          opportunitiesChanged = true;
          engine.store.emitEvent('opportunity.spawned', {
            opportunityId: opportunity.id,
            kind: opportunity.kind,
            title: opportunity.title,
            reason: `${npcName} (npc-agency) offered directly`,
            urgency: opportunity.urgency,
          }, { visibility: 'public', presentation: { channels: ['narrator'], priority: 'normal' } });
          break;
        }

        default:
          break; // exhaustive over NpcEffect — a future new variant needs a case added here
      }
    }

    lastActionsByNpc.set(result.action.npcId, result);

    engine.store.emitEvent('npc.action.resolved', {
      npcId: result.action.npcId,
      npcName,
      verb: result.action.verb,
      targetEntityId: result.action.targetEntityId,
      description: result.action.description,
      narratorHint: result.narratorHint,
      dialogueHint: result.dialogueHint,
      effects: result.effects,
    }, {
      actorId: result.action.npcId,
      ...(result.action.targetEntityId ? { targetIds: [result.action.targetEntityId] } : {}),
      visibility: 'public',
      presentation: { channels: ['narrator'], priority: 'normal' },
    });
  }

  if (partyChanged) {
    setPartyState(world, party);
    const player = world.entities[world.playerId];
    if (player) {
      const statusEvent = refreshCompanionAbilityStatus(world, party, player, currentTick);
      if (statusEvent) engine.store.recordEvent(statusEvent);
    }
  }
  if (opportunitiesChanged) setPersistedOpportunities(world, opportunities);
  if (rumorsChanged) setPlayerRumorState(world, { rumors });

  // Prune last-actions to the CURRENT roster (profiles just rebuilt fresh) —
  // bounded to "named NPCs eligible this round", not an ever-growing history
  // of every NPC that ever acted, including ones since dead or unnamed.
  const currentNpcIds = new Set(profiles.map((p) => p.npcId));
  const prunedLastActions = [...lastActionsByNpc.values()].filter((r) => currentNpcIds.has(r.action.npcId));

  setPersistedNpcState(world, profiles, prunedLastActions, obligationLedgers);
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
    return {
      ok: false,
      heat: 0,
      spawned: [],
      revealed: [],
      escalated: [],
      expired: [],
      active: [],
      encounters: [],
      opportunitiesSpawned: [],
      opportunitiesExpired: [],
    };
  }
}

function tickWorld(engine: Engine, genre: string): WorldTickResult {
  const world = engine.store.state;
  const state = getWorldTickState(world);
  const currentTick = engine.tick;
  const heat = num(world.globals[HEAT_KEY]);

  // Companion reactions (F-b595731a): snapshot the round's event-log window
  // BEFORE this tick's own steps (encounter spawn, pressure lifecycle) add
  // anything — the same round-delta collectMilestones scans below, just
  // captured earlier so combat.entity.defeated events from THIS round's
  // player/NPC actions are the only thing in range (world-tick itself never
  // emits that event type, so the exact upper bound is not load-bearing —
  // captured early purely for clarity). Pressure-resolution triggers are
  // collected separately, inline, in step 3 below (the resolutionType is
  // already in hand there — no need to re-scan the log for it).
  const reactionTriggers = collectCombatReactionTriggers(world, state.lastEventIndex, world.eventLog.length);

  // 0. Zone-entry encounter check (F-ENG005-encounter-spawn-wiring) — the
  // tactical layer of the same reaction loop. Runs inside this tick so the
  // round keeps ONE world tick; its `encounter.spawned` event rides the same
  // round delta the narration presents.
  const encounters = runEncounterSpawnStep(engine);

  // 0b. Economy tick (F-d0b5edb5) — see file header. No events emitted (same
  // silent-ledger posture district-core's own decay tick has); the state feeds
  // step 5's buildPressureInputs and director.ts/endgame.ts's own reads.
  tickDistrictEconomies(world, currentTick);

  // Hoisted for steps 0c/3/5b below (was computed fresh at step 3 only,
  // before F-e5817c7c/F-ceed887f needed the same value earlier) — a pure,
  // side-effect-free read, so computing it once and reusing it changes
  // nothing about what step 3 already saw.
  const playerDistrictId = getPlayerDistrictId(world);

  // 0c. District mood transition (F-e5817c7c-adjacent rider) — see file
  // header. Queues onto reactionTriggers (built above); dispatched together
  // with the combat/pressure triggers at step 3c below, so a round with
  // several triggers still fires exactly one applyCompanionReactions call.
  // No-op when there is no district system or the player isn't in a district.
  if (playerDistrictId) {
    const districtState = getDistrictState(world, playerDistrictId);
    if (districtState) {
      const tags = getDistrictDefinition(world, playerDistrictId)?.tags ?? [];
      const tone = computeDistrictMood(districtState, tags).tone;
      const tones = (state.districtTones ??= {});
      const previousTone = tones[playerDistrictId];
      // Only a genuine transition fires — never a steady state, and never
      // the FIRST observation (no prior tone recorded yet: that would fire
      // on a world simply SEEDED already-grim, which never "transitioned"
      // from anything). Establishing the baseline silently on first touch
      // mirrors P8-WL-006's own "a fresh read starts the delta discipline
      // from now, it doesn't re-fire on history" posture.
      if (previousTone !== undefined) {
        if (previousTone !== 'grim' && tone === 'grim') {
          reactionTriggers.push('district-grim');
        } else if (previousTone !== 'prosperous' && tone === 'prosperous') {
          reactionTriggers.push('district-prosperous');
        }
      }
      tones[playerDistrictId] = tone;
    }
  }

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

    // Companion reactions (F-b595731a): 'resolved-by-player' is the one
    // resolutionType that unambiguously means the player actively dealt with
    // the threat; every other value (today, always 'expired-ignored' — this
    // loop is the only computeFallout call site in production and always
    // passes that literal) reads as the world moving on WITHOUT a successful
    // player intervention.
    reactionTriggers.push(
      fallout.resolution.resolutionType === 'resolved-by-player'
        ? 'pressure-resolved-well'
        : 'pressure-resolved-badly',
    );

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

  // 3b. Persist the round's fallout records (P8-WL-003): the resolved-
  // pressure ledger is what the Director's PRESSURE FALLOUT section and
  // endgame's resolvedPressures input read back via getResolvedPressures —
  // until now the records only rode the pressure.expired payload and the
  // tick's return value, so nothing survived the round. Lazy-init because
  // pre-field saves persist the namespace without it; bounded so the ledger
  // never grows a save without limit.
  if (expiredFallouts.length > 0) {
    const ledger = (state.resolvedPressures ??= []);
    ledger.push(...expiredFallouts);
    if (ledger.length > RESOLVED_PRESSURES_KEPT) {
      ledger.splice(0, ledger.length - RESOLVED_PRESSURES_KEPT);
    }
  }

  // 3c. Companion reactions (F-b595731a) — this round's combat outcomes plus
  // this tick's pressure resolutions, now that both are known. Breakpoints
  // (v3.0, F-v3-npc-agency) come from the PREVIOUS round's persisted
  // npc-agency profiles — this round's own fresh profiles aren't computed
  // until step 5a, later in this same tick. Empty when no named NPC has ever
  // existed (SEED-0) or this is the first round one appears.
  const npcBreakpoints = new Map(getPersistedNpcProfiles(world).map((p) => [p.npcId, p.breakpoint]));
  applyCompanionReactions(engine, world, reactionTriggers, currentTick, npcBreakpoints);

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

  // 5a. NPC agency tick (v3.0, F-v3-npc-agency) — see file header + this
  // function's own docstring for the full contract. Runs every round (not
  // heat-gated — a named NPC's own goals key off relationship/pressure/
  // obligation state, not heat), directly after step 5 so an NPC-triggered
  // pressure effect is pushed into `active` in time for step 5b's own
  // buildPressureInputs call to see it. Gated entirely on "at least one
  // named NPC exists" — see runNpcAgencyStep's SEED-0 identity contract.
  runNpcAgencyStep(engine, world, active, currentTick, playerDistrictId, genre);

  // 5b. Opportunity spawn/tick wire (F-ceed887f) — see file header. Runs
  // every round (not heat-gated). Reuses buildPressureInputs' own
  // reputation/factionStates/districtEconomies derivation with a second,
  // pure, side-effect-free call (cheap, and keeps step 5 above completely
  // untouched) so opportunity evaluation never disagrees with the pressure
  // tick about faction standing or district economies. Ticks the persisted
  // set FIRST (timers/visibility/expiry), then evaluates a new spawn against
  // the ticked set's own capacity/interval/pair-conflict guards — the exact
  // order step 2→5 already uses for pressures.
  const oppPressureInputs = buildPressureInputs(world, state, genre, currentTick, active);
  const player = world.entities[world.playerId];
  const playerCustom = (player?.custom ?? {}) as Record<string, string | number | boolean>;
  let playerLeverage = getLeverageState(playerCustom);
  if (typeof playerCustom['leverage.heat'] !== 'number') {
    playerLeverage = { ...playerLeverage, heat };
  }

  const persistedOpportunities = getPersistedOpportunities(world);
  const { active: tickedOpportunities, expired: expiredOpportunities } = tickOpportunities(persistedOpportunities, currentTick);

  // 5b-i. Opportunity natural-expiry fallout (Phase-9 remediation, FIX 2) —
  // mirrors step 3's pressure-expiry block above (computeFallout → applyFallout
  // → ledger → emit), opportunity-side. Every getXFallout function in
  // opportunity-resolution.ts has a fully-authored 'expired' case (rep hits,
  // obligations, economy shifts) that never ran before this — tickOpportunities'
  // own `expired` array used to be destructured away and discarded, so an
  // opportunity's deadline was cosmetic. Same actor identity the resolution
  // verb uses (opportunityHandler passes action.actorId; opportunities are
  // player-scoped — only the player ever accepts one — so world.playerId here
  // is that SAME actor, just reached via the tick instead of a submitted
  // action). Iterates the array in its own stable order — no Math.random, no
  // Date.now, so this stays deterministic same as every other step in this file.
  const opportunityFallouts: OpportunityFallout[] = [];
  for (const opp of expiredOpportunities) {
    const fallout = computeOpportunityFallout(opp, 'expired', {
      currentTick,
      playerDistrictId,
      genre,
    });
    applyOpportunityFallout(world, world.playerId, fallout);
    appendResolvedOpportunity(world, fallout);
    opportunityFallouts.push(fallout);

    engine.store.emitEvent(
      'opportunity.expired',
      {
        opportunityId: opp.id,
        kind: opp.kind,
        title: opp.title,
        summary: fallout.summary,
        resolutionType: fallout.resolution.resolutionType,
        effects: fallout.effects,
        ...(fallout.warnings ? { warnings: fallout.warnings } : {}),
      },
      opp.visibility === 'hidden'
        ? { visibility: 'hidden' }
        : { visibility: 'public', presentation: { channels: ['narrator'], priority: 'normal' } },
    );
  }

  const oppInputs: OpportunityInputs = {
    activeOpportunities: tickedOpportunities,
    activePressures: active,
    // Real reads (v3.0, F-v3-npc-agency): step 5a above just persisted this
    // round's profiles/obligation ledgers to world.modules['npc-agency'] —
    // these are the SAME non-attaching accessors endgame.ts and director.ts
    // read. [] / empty Map on a world with no named NPCs (SEED-0), same as
    // before this wave.
    npcProfiles: getPersistedNpcProfiles(world),
    npcObligations: getPersistedNpcObligations(world),
    factionStates: oppPressureInputs.factionStates,
    playerReputations: oppPressureInputs.reputation,
    playerLeverage,
    districtEconomies: oppPressureInputs.districtEconomies ?? new Map(),
    companions: getPartyState(world).companions,
    playerDistrictId: playerDistrictId ?? '',
    playerLevel: 1, // unread by every authored spawn rule; wire when one reads it (mirrors buildPressureInputs' own ceiling)
    currentTick,
    genre,
    totalTurns: currentTick,
  };
  const oppResult = evaluateOpportunities(oppInputs);
  const opportunitiesSpawned: OpportunityState[] = oppResult ? [oppResult.opportunity] : [];
  const nextOpportunities = oppResult ? [...tickedOpportunities, oppResult.opportunity] : tickedOpportunities;
  setPersistedOpportunities(world, nextOpportunities);
  if (oppResult) {
    engine.store.emitEvent(
      'opportunity.spawned',
      {
        opportunityId: oppResult.opportunity.id,
        kind: oppResult.opportunity.kind,
        title: oppResult.opportunity.title,
        reason: oppResult.reason,
        urgency: oppResult.opportunity.urgency,
      },
      oppResult.opportunity.visibility === 'hidden'
        ? { visibility: 'hidden' }
        : { visibility: 'public', presentation: { channels: ['narrator'], priority: 'normal' } },
    );
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
  return {
    ok: true,
    heat: finalHeat,
    spawned,
    revealed,
    escalated,
    expired: expiredFallouts,
    active,
    encounters,
    opportunitiesSpawned,
    opportunitiesExpired: opportunityFallouts,
  };
}
