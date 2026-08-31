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
//   5a2. leverage income (v3.0 wave 2, "leverage-income"): player-leverage.ts's
//      tickLeverage/computeLeverageGains were fully authored and unit-tested
//      with ZERO production callers — heat never decayed, the reputation-
//      derived influence floor never reconciled, and passive gains (xp/
//      milestone/pressure-resolution → leverage currency) never accrued;
//      opportunity completion (5b below, a separate write-wire) was the SOLE
//      leverage-earning path. Runs directly after step 5a and BEFORE step
//      5b's own getLeverageState read, so the opportunity rules see this
//      round's ticked/gained leverage rather than last round's stale
//      snapshot. SEED-0 identity (a world that never engaged the social
//      layer — no reputation, no new milestones, no xp gain, no player-
//      resolved pressure, no pre-existing leverage.* key — reads nothing and
//      writes nothing) mirrors step 5a's own gate exactly. See
//      runLeverageIncomeStep's own docstring for the full contract.
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
//   7. move advisor (F-7a056689): compose AdvisorInputs from the already-
//      persisted ledgers (buildStrategicMap for the two view arrays) and
//      persist recommendMoves' MoveRecommendation on world.modules['move-advisor'].
//      SEED-0: a world with no leverage keys, no active pressures, and no
//      factions writes nothing.
//
// Determinism: no randomness anywhere — every branch reads world state, and
// faction/district enumeration is sorted, so same world in ⇒ same events out.
//
// Honest ceilings (documented, not oversights): playerRumors is the live
// getPlayerRumorState(world).rumors ledger — the same PlayerRumor[] evaluatePressures
// and buildNpcProfile already consume (revenge-attempt / navy-bounty / camp-panic,
// NPC knownRumors). Economy inputs (F-d0b5edb5/F-6008456f): district economies now
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
// same honest-ceiling posture as the rest of this list. Step 5a2's leverage-
// income wire (v3.0 wave 2) feeds computeLeverageGains' reputationDelta
// hint axis via lastReputation (rep-gain → favor / large-rep-loss →
// blackmail) alongside xp/milestone/pressure-resolution (F-9b836ed9). Its
// pressure-resolution axis reads THIS TICK's resolved-by-player fallouts
// from state.resolvedPressures (resolvePressureByPlayer — the
// `resolve-pressure` verb and the opportunity-complete mapping), not the
// expiry ledger, which still always stamps 'expired-ignored'. Step 5a1
// wires faction-agency the same way step 5a wired npc-agency; SEED-0: a
// world with no factions is untouched.

import type { ActionIntent, Engine, EngineModule, ResolvedEvent, WorldState } from '@ai-rpg-engine/core';
import {
  tickPressures,
  evaluatePressures,
  makePressure,
  type WorldPressure,
  type PressureInputs,
  type PressureKind,
} from './pressure-system.js';
import { computeFallout, type PressureFallout } from './pressure-resolution.js';
import { grantTitleToEntity } from './player-titles.js';
import { NPC_RUMOR_CONFIDENCE, CHAINED_OPPORTUNITY_URGENCY } from './opportunity-resolution.js';
import { getDistrictForZone, getDistrictState, getDistrictDefinition, modifyDistrictMetric, type DistrictMetrics } from './district-core.js';
import { makeEvent } from './make-event.js';
import { getFactionCognition } from './faction-cognition.js';
import {
  runFactionAgencyTick,
  buildFactionProfile,
  getPersistedFactionLastActions,
  getPersistedFactionMemberCounts,
  setPersistedFactionState,
  type FactionActionResult,
  type FactionActionVerb,
  type FactionProfile,
} from './faction-agency.js';
import { runEncounterSpawnStep, type SpawnedEncounterReport } from './encounter-spawn.js';
import { runTypedHazardStep, runTypedHazardEntryStep } from './hazard-interpreter.js';
import { processPeriodicStatuses } from './status-effects.js';
import { runZoneStateStep } from './zone-state.js';
import { getEconomyCoreState, setDistrictEconomy, tickDistrictEconomy, getDistrictEconomy, applyEconomyShift, type SupplyCategory } from './economy-core.js';
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
  resolveNpcAction,
  tickObligations,
  createObligation,
  addObligation,
  getPersistedNpcProfiles,
  getPersistedNpcObligations,
  getPersistedNpcLastActions,
  getPersistedNpcChains,
  setPersistedNpcState,
  computeNpcRecapEntries,
  evaluateConsequenceChainTrigger,
  buildConsequenceChain,
  tickConsequenceChain,
  shouldResolveChainStep,
  resolveConsequenceChainStep,
  type LoyaltyBreakpoint,
  type NpcObligationLedger,
  type ConsequenceChain,
} from './npc-agency.js';
import { computeDistrictMood, computeDistrictModifiers, type DistrictMood } from './district-mood.js';
import {
  evaluateOpportunities,
  tickOpportunities,
  getPersistedOpportunities,
  setPersistedOpportunities,
  makeOpportunity,
  deadlineFor,
  MAX_ACTIVE_OPPORTUNITIES,
  type OpportunityInputs,
  type OpportunityState,
} from './opportunity-core.js';
import {
  computeOpportunityFallout,
  applyOpportunityFallout,
  appendResolvedOpportunity,
  getResolvedOpportunities,
  type OpportunityFallout,
} from './opportunity-resolution.js';
import {
  getLeverageState,
  tickLeverage,
  computeLeverageGains,
  applyLeverageDeltas,
  type LeverageCurrency,
} from './player-leverage.js';
import { getCurrency } from './progression-core.js';
import { buildStrategicMap, formatStrategicMapForPlayer } from './strategic-map.js';
import { recommendMoves, setPersistedMoveRecommendation } from './move-advisor.js';
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
   * Tick of the last opportunity SPAWN, so the min-interval guard survives the
   * offer being resolved and removed from the live list. OPTIONAL for the same
   * reason `resolvedPressures` is: saves written before it existed simply lack
   * it, and an absent value means "no spawn yet", which is the correct reading
   * for both a fresh world and a legacy save.
   */
  lastOpportunitySpawnTick?: number;
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
  /**
   * Count of `milestones` entries already fed to computeLeverageGains by the
   * leverage-income step (v3.0 wave 2, step 5a2 below) — a cursor into the
   * SAME ever-growing, never-cleared array collectMilestones/applyFallout's
   * milestone-tag effect push into, exactly like lastEventIndex is a cursor
   * into the eventLog. Only `milestones.slice(cursor)` counts as NEW each
   * round; without it, a milestone would re-grant its leverage gain on every
   * subsequent tick forever. OPTIONAL and lazily written — SEED-0 IDENTITY:
   * a world that never triggers the leverage-income step (see
   * runLeverageIncomeStep's own gate) never gains this key at all, not even
   * at 0 — this is a stricter posture than resolvedPressures?/districtTones?
   * (which freshWorldTickState seeds unconditionally) because THIS field's
   * mere presence would itself be an observable side effect the SEED-0
   * contract forbids for an otherwise-untouched world.
   */
  leverageMilestoneCursor?: number;
  /**
   * The player's 'xp' progression-core currency balance as of the end of the
   * previous tick this step ran — the SAME tick-over-tick delta pattern
   * lastHeat already uses, read via progression-core's getCurrency. Feeds
   * computeLeverageGains' xpGained hint. OPTIONAL/lazily-written for the
   * identical SEED-0 reason leverageMilestoneCursor documents above.
   */
  lastXp?: number;
  /**
   * Per-faction reputation snapshot as of the end of the previous tick this
   * step ran — the SAME tick-over-tick delta pattern lastXp uses. Feeds
   * computeLeverageGains' reputationDelta hint (largest-magnitude faction
   * delta this round). OPTIONAL/lazily-written for the identical SEED-0
   * reason lastXp documents above (F-9b836ed9).
   */
  lastReputation?: Record<string, number>;
  /**
   * resolvedAtTick of the last player-resolved pressure already fed to
   * computeLeverageGains' pressureResolution axis (F-bdd030b2). The
   * resolvedPressures ledger is append-only (bounded) and a later quiet
   * tick would otherwise re-find the same record. OPTIONAL/lazily-written
   * for the identical SEED-0 reason lastXp documents above.
   */
  leveragePressureResolutionTick?: number;
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
      // F-04dece4f: the player resolve op. Expiry still passes
      // 'expired-ignored'; this verb is the live 'resolved-by-player' path
      // that earns pressure titles (bounty-survivor and siblings).
      ctx.actions.registerVerb('resolve-pressure', (action, world) =>
        resolvePressureHandler(action, world),
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

/**
 * Milestones this world has accumulated — boss kills scraped off the event log
 * (collectMilestones), pressure fallout's `milestone-tag` effect, and (v3.8)
 * opportunity fallout's. Most recent last, never cleared.
 *
 * NEW IN v3.8 and the reason it exists: the milestone ledger had real writers
 * and real INTERNAL readers (the genre spawn rules' milestone conditions,
 * runLeverageIncomeStep's cursor) but no public accessor, so no consumer
 * outside this file could tell whether an announced milestone had been
 * recorded. A consequence with no public read API is indistinguishable from a
 * consequence that was never written (FSA-1). Non-attaching; same contract as
 * getActivePressures/getResolvedPressures above.
 */
export function getWorldMilestones(world: WorldState): Array<{ label: string; tags: string[] }> {
  return objectArray<{ label: string; tags: string[] }>(peekState(world)?.milestones);
}

/**
 * Record one milestone against this world.
 *
 * The SHARED writer for both fallout appliers. `applyFallout` below (pressure
 * side) has pushed straight into `state.milestones` since v2.x; opportunity
 * fallout announced `milestone-tag` and wrote nothing, because
 * opportunity-resolution.ts lives in another file and this array had no
 * exported writer to reach. That asymmetry — same effect type, same
 * vocabulary, one path recording and one path forgetting — is the whole shape
 * FSA-1 was built to find.
 *
 * Attaches the namespace, deliberately: a milestone exists only because
 * something happened, so a world that gains one is a world that changed. The
 * SEED-0 contract is about worlds where NOTHING happened, and this is never
 * called on one.
 */
export function recordMilestone(world: WorldState, label: string, tags: string[]): void {
  getWorldTickState(world).milestones.push({ label, tags });
}

/**
 * Add `pressure` to this world's live pressure list, honouring the
 * one-active-per-kind invariant every other spawner holds. Returns true when
 * it landed, false when a pressure of that kind was already live.
 *
 * ⚠ THE SUBTLETY THIS FUNCTION EXISTS FOR. `tickWorld` derives its round's
 * `active` array from `tickPressures(state.pressures, …)` — a NEW array — and
 * reassigns `state.pressures = active` at the very END of the round. Anything
 * written into the namespace's array in between is therefore DISCARDED, which
 * is why opportunity fallout's `spawn-pressure` sink cannot simply push
 * through getActivePressures. Mutating the array `state.pressures` currently
 * holds is correct OUTSIDE a tick (the verb path, where that array is the
 * live one); INSIDE a tick it would vanish.
 *
 * So the write goes to BOTH: the persisted array, and — when a tick is
 * mid-round — the working array it will persist. `runningPressures` below is
 * how the tick lends its working array to this function for the duration of
 * its own round; outside a tick it is undefined and only the persisted array
 * is touched.
 */
export function pushActivePressure(world: WorldState, pressure: WorldPressure): boolean {
  const persisted = getWorldTickState(world);
  const working = runningPressures.get(world);
  const target = working ?? persisted.pressures;
  if (target.some((p) => p.kind === pressure.kind)) return false;
  target.push(pressure);
  // Keep the namespace in step when a tick is running, so a read taken
  // between now and the end of the round sees the same world the tick does.
  if (working && persisted.pressures !== working) {
    if (!persisted.pressures.some((p) => p.kind === pressure.kind)) persisted.pressures.push(pressure);
  }
  return true;
}

/**
 * The working pressure array of an in-flight `tickWorld`, per world.
 *
 * A WeakMap keyed on the world rather than a module-global single slot: two
 * engines can tick in the same process (every test file does), and a shared
 * slot would let one world's fallout push a pressure into another's round.
 * Cleared in a `finally` so a throwing tick cannot leave a stale array behind
 * for the verb path to write into.
 */
const runningPressures = new WeakMap<WorldState, WorldPressure[]>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function addGlobal(world: WorldState, key: string, delta: number): void {
  world.globals[key] = num(world.globals[key]) + delta;
}

const DISTRICT_LIVE_METRICS = new Set<keyof DistrictMetrics>([
  'alertPressure', 'rumorDensity', 'intruderLikelihood', 'surveillance',
  'stability', 'commerce', 'morale',
]);

/**
 * Route a district / district-metric fallout effect to the store that actually
 * has a reader (F-59e9be66).
 *
 * `stability` (and the alias `safety`) land on `district_<id>_safety` — the
 * key family defeat-fallout writes and the one buildPressureInputs / encounter-
 * spawn already read. Interpolating an unbound metric name into that family
 * (`district_<id>_commerce`, `district_<id>_surveillance`) was a ghost write:
 * nothing consumed it.
 *
 * commerce / surveillance / morale / alertPressure / rumorDensity /
 * intruderLikelihood go through modifyDistrictMetric onto district-core's
 * live DistrictState. `stability` is NOT also written there: district-core's
 * own stability is a ~0–10 zone-property aggregate, a different scale from
 * the 0–100 safety-derived figure evaluatePressures consumes.
 */
export function applyDistrictMetricEffect(
  world: WorldState,
  districtId: string,
  metric: string,
  delta: number,
): void {
  if (metric === 'stability' || metric === 'safety') {
    addGlobal(world, `district_${districtId}_safety`, delta);
    return;
  }
  if (DISTRICT_LIVE_METRICS.has(metric as keyof DistrictMetrics)) {
    modifyDistrictMetric(world, districtId, metric as keyof DistrictMetrics, delta);
  }
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Round to 2 decimals — keeps repeated +0.05 steps landing ON the band edges. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}


/**
 * The player district's own contribution to how hard a new pressure lands
 * (DistrictModifiers.pressureUrgencyBias). 0 when the pack ships no districts,
 * when the player is in none, or when the mood is neutral — so a world that
 * never engages the district layer spawns pressures at exactly their authored
 * urgency, as before.
 */
function districtPressureUrgencyBias(world: WorldState, districtId: string | undefined): number {
  if (!districtId) return 0;
  const state = getDistrictState(world, districtId);
  if (!state) return 0;
  const tags = getDistrictDefinition(world, districtId)?.tags ?? [];
  return computeDistrictModifiers(computeDistrictMood(state, tags)).pressureUrgencyBias;
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
//   - pressure.expired / expiry loop → 'pressure-resolved-badly'
//     (reachable; the loop always stamps 'expired-ignored').
//     'pressure-resolved-well' is dispatched from resolvePressureByPlayer
//     (the `resolve-pressure` verb and the opportunity-complete mapping),
//     the same way player-leverage dispatches leverage-social/rumor from
//     the verb path rather than waiting for the tick (F-f4c2fa00).
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
 * Scan this tick's npc-agency delta for betrayal-witnessed (event log) and
 * a NEW kind:'betrayed' obligation (ledger timestamps) (F-b7196370).
 */
function collectBetrayalReactionTriggers(
  world: WorldState,
  start: number,
  end: number,
  currentTick: number,
): ReactionTrigger[] {
  const triggers: ReactionTrigger[] = [];
  const log = world.eventLog;
  for (let i = start; i < end && i < log.length; i++) {
    if (log[i].type === 'npc.betrayal.witnessed') triggers.push('betrayal-witnessed');
  }
  for (const ledger of getPersistedNpcObligations(world).values()) {
    if (ledger.obligations.some((o) => o.kind === 'betrayed' && o.createdAtTick === currentTick)) {
      triggers.push('obligation-betrayed');
      break;
    }
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
    playerRumors: getPlayerRumorState(world).rumors,
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
        applyDistrictMetricEffect(world, effect.districtId, effect.metric, effect.delta);
        break;
      case 'milestone-tag':
        // Feeds back into the genre spawn rules' milestone conditions. Routed
        // through recordMilestone (v3.8) so this path and opportunity
        // fallout's write the same ledger through the same door — `state` is
        // the attached namespace object, so this is the identical write.
        recordMilestone(world, `pressure:${fallout.resolution.pressureKind}`, [effect.tag]);
        break;
      case 'title-trigger': {
        // v3.8. Six authored tags live on this side — bounty-survivor,
        // trade-broker, faith-tested, iron-captain, steadfast, ghost — one per
        // pressure kind's own resolution, and every one of them rode the
        // pressure.expired payload into nothing. Wired here rather than left
        // for a later wave because it is the SAME store the opportunity-side
        // sink writes: closing one and leaving the other is exactly the
        // asymmetry that made milestone-tag worth finding.
        const player = world.entities[world.playerId];
        if (player) grantTitleToEntity(player, effect.tag, currentTick);
        break;
      }
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

      // ── The last three, closed by P4's own audit (v3.8) ─────────────────
      //
      // FLA-1 reads BOTH event families and reported an `economy-shift`
      // announced by a pressure resolution that no read could find. It was
      // right: this applier handled six of its nine effect types and dropped
      // rumor, economy-shift and spawn-opportunity onto the
      // "rides the pressure.expired payload" default — the exact class this
      // release spent itself closing, sitting on the other applier the whole
      // time. Every writer below already existed and was already in use by
      // opportunity fallout; none of this is new machinery, only the same
      // door opened from the second room.

      case 'economy-shift': {
        const economy = getDistrictEconomy(world, effect.districtId);
        if (economy) {
          setDistrictEconomy(world, effect.districtId, applyEconomyShift(economy, {
            districtId: effect.districtId,
            category: effect.category as SupplyCategory,
            delta: effect.delta,
            cause: effect.cause,
          }));
        }
        break;
      }

      case 'rumor': {
        // Same origin discipline opportunity fallout uses: a rumor about the
        // player still comes from SOMEONE. A pressure's own source faction is
        // that someone, and with no faction there is no honest origin — so it
        // is skipped rather than invented, and the player is never stamped as
        // the source.
        const origin = effect.spreadTo[0] ?? pressureSourceFaction(world, fallout.resolution.pressureId);
        if (!origin) break;
        const rumorState = getPlayerRumorState(world);
        let rumor = spawnNpcOriginatedRumor(
          effect.claim,
          effect.valence,
          effect.valence === 'fearsome' ? 'npc-accusation' : 'npc-gossip',
          origin,
          effect.spreadTo[0] ?? origin,
          undefined,
          currentTick,
          NPC_RUMOR_CONFIDENCE,
          world,
        );
        for (const extra of effect.spreadTo.slice(1)) rumor = propagateRumor(rumor, extra);
        setPlayerRumorState(world, { rumors: [...rumorState.rumors, rumor] });
        break;
      }

      case 'spawn-opportunity': {
        // Both of the spawner's guards, for the reason the opportunity-side
        // sink states: POP-1's cap is a measured argument, and a chain that
        // could push past it would undo that argument by the back door.
        const opportunities = getPersistedOpportunities(world);
        const live = opportunities.filter((o) => o.status === 'available' || o.status === 'accepted');
        if (live.length >= MAX_ACTIVE_OPPORTUNITIES) break;
        const source = effect.sourceNpcId ?? effect.sourceFactionId ?? 'none';
        if (live.some((o) => `${o.kind}:${o.sourceNpcId ?? o.sourceFactionId ?? 'none'}` === `${effect.kind}:${source}`)) break;
        setPersistedOpportunities(world, [
          ...opportunities,
          makeOpportunity({
            kind: effect.kind,
            sourceNpcId: effect.sourceNpcId,
            sourceFactionId: effect.sourceFactionId,
            title: effect.description,
            description: effect.description,
            objectiveDescription: 'Follow the thread this opened.',
            urgency: CHAINED_OPPORTUNITY_URGENCY,
            turnsRemaining: deadlineFor(effect.kind),
            visibility: 'offered',
            rewards: [],
            risks: [],
            genre: '',
            currentTick,
            tags: ['chained', `from:pressure:${fallout.resolution.pressureKind}`],
          }),
        ]);
        break;
      }

      default:
        break;
    }
  }
  return chains;
}

/** The faction a live pressure names as its source, for rumor attribution. */
function pressureSourceFaction(world: WorldState, pressureId: string): string | undefined {
  return getActivePressures(world).find((p) => p.id === pressureId)?.sourceFactionId;
}

export type PlayerPressureResolution = {
  pressure: WorldPressure;
  fallout: PressureFallout;
  chains: WorldPressure[];
  companionEvents: ResolvedEvent[];
};

/**
 * Apply the 'pressure-resolved-well' companion reaction on the live player-
 * resolve path (F-f4c2fa00). Mirrors player-leverage.ts's
 * dispatchLeverageCompanionReactions: VerbHandler has world-only access, so
 * events are returned for the caller's recordEvent loop rather than emitted
 * via engine.store. Empty party → no-op. `action` is optional so a direct
 * resolvePressureByPlayer call still moves morale even when no verb events
 * will be recorded.
 */
function dispatchPressureResolvedWell(
  world: WorldState,
  currentTick: number,
  action?: ActionIntent,
): ResolvedEvent[] {
  let party = getPartyState(world);
  if (party.companions.length === 0) return [];

  const events: ResolvedEvent[] = [];
  let changed = false;
  const reactions = evaluateCompanionReactions(party.companions, 'pressure-resolved-well', { tick: currentTick });
  for (const reaction of reactions) {
    const companion = getCompanion(party, reaction.npcId);
    if (!companion) continue;

    party = adjustCompanionMorale(party, reaction.npcId, reaction.moraleDelta);
    changed = true;
    const newMorale = getCompanion(party, reaction.npcId)?.morale ?? 0;
    const entityForSync = world.entities[reaction.npcId];
    if (entityForSync) syncCompanionCustomFields(entityForSync, companion.role, newMorale);

    if (action) {
      events.push(makeEvent(action, 'companion.reaction', {
        npcId: reaction.npcId,
        trigger: reaction.trigger,
        moraleDelta: reaction.moraleDelta,
        morale: newMorale,
        narratorHint: reaction.narratorHint,
      }, {
        targetIds: [reaction.npcId],
        presentation: { channels: ['narrator'], priority: 'low' },
      }));
    }

    if (reaction.departure) {
      const removal = removeCompanion(party, reaction.npcId);
      party = removal.party;
      const entity = world.entities[reaction.npcId];
      if (entity) removeCompanionTags(entity, companion.role);
      if (action) {
        events.push(makeEvent(action, 'companion.departed', {
          npcId: reaction.npcId,
          npcName: entity?.name ?? reaction.npcId,
          role: companion.role,
          reason: reaction.departureReason ?? 'left the party',
        }, {
          targetIds: [reaction.npcId],
          presentation: { channels: ['objective', 'narrator'], priority: 'high' },
        }));
      }
    }
  }

  if (!changed) return events;
  setPartyState(world, party);

  const player = world.entities[world.playerId];
  if (player) {
    const statusEvent = refreshCompanionAbilityStatus(world, party, player, currentTick);
    if (statusEvent && action) events.push(statusEvent);
  }

  return events;
}

/**
 * Resolve a live pressure as `resolved-by-player` (F-04dece4f).
 *
 * Removes it from the live list (honouring the in-tick working array the same
 * way pushActivePressure does), computes fallout with resolutionType
 * 'resolved-by-player', applies it through applyFallout (titles, rumours,
 * economy, district metrics — the same door expiry uses), records the
 * fallout on the resolvedPressures ledger, pushes any chain pressures, and
 * dispatches 'pressure-resolved-well' companion reactions (F-f4c2fa00) so
 * the verb and the opportunity-complete mapping both move morale.
 *
 * `action` is the originating verb (resolve-pressure or opportunity-complete)
 * when one exists — companion.reaction events ride that action's recordEvent
 * loop. Direct callers may omit it; morale still moves.
 *
 * Returns undefined when `pressureId` is not currently live.
 */
export function resolvePressureByPlayer(
  world: WorldState,
  pressureId: string,
  currentTick: number,
  genre: string,
  action?: ActionIntent,
): PlayerPressureResolution | undefined {
  const state = getWorldTickState(world);
  const working = runningPressures.get(world);
  const list = working ?? state.pressures;
  const idx = list.findIndex((p) => p.id === pressureId);
  if (idx < 0) return undefined;
  const [pressure] = list.splice(idx, 1);
  if (!pressure) return undefined;
  if (working && state.pressures !== working) {
    const persistedIdx = state.pressures.findIndex((p) => p.id === pressureId);
    if (persistedIdx >= 0) state.pressures.splice(persistedIdx, 1);
  }

  const fallout = computeFallout(pressure, 'resolved-by-player', genre, {
    resolvedBy: 'player',
    currentTick,
    playerDistrictId: getPlayerDistrictId(world),
    resolutionVisibility: pressure.visibility,
  });
  const chains = applyFallout(world, state, fallout, currentTick);
  for (const chain of chains) {
    pushActivePressure(world, chain);
  }
  const ledger = (state.resolvedPressures ??= []);
  ledger.push(fallout);
  if (ledger.length > RESOLVED_PRESSURES_KEPT) {
    ledger.splice(0, ledger.length - RESOLVED_PRESSURES_KEPT);
  }
  const companionEvents = dispatchPressureResolvedWell(world, currentTick, action);
  return { pressure, fallout, chains, companionEvents };
}

export type FactionPressureResolution = {
  pressure: WorldPressure;
  fallout: PressureFallout;
  chains: WorldPressure[];
};

/**
 * Verbs that close a live pressure of the acting faction's own (F-35aa8ed0).
 * investigate wraps investigation-opened; bribe/open-trade (the truce-shaped
 * verbs) wrap trade-war; patrol is the hunt that wraps bounty-issued.
 */
export const FACTION_PRESSURE_CLOSERS: Partial<Record<FactionActionVerb, PressureKind>> = {
  investigate: 'investigation-opened',
  bribe: 'trade-war',
  'open-trade': 'trade-war',
  patrol: 'bounty-issued',
};

/**
 * Resolve a live pressure as `resolved-by-faction` (F-35aa8ed0).
 *
 * Mirrors resolvePressureByPlayer: splice from the live list, computeFallout
 * with resolutionType 'resolved-by-faction', applyFallout, ledger, chains.
 * Does not dispatch pressure-resolved-well (that is the player verb).
 */
export function resolvePressureByFaction(
  world: WorldState,
  pressureId: string,
  factionId: string,
  currentTick: number,
  genre: string,
): FactionPressureResolution | undefined {
  const state = getWorldTickState(world);
  const working = runningPressures.get(world);
  const list = working ?? state.pressures;
  const idx = list.findIndex((p) => p.id === pressureId);
  if (idx < 0) return undefined;
  const [pressure] = list.splice(idx, 1);
  if (!pressure) return undefined;
  if (working && state.pressures !== working) {
    const persistedIdx = state.pressures.findIndex((p) => p.id === pressureId);
    if (persistedIdx >= 0) state.pressures.splice(persistedIdx, 1);
  }

  const fallout = computeFallout(pressure, 'resolved-by-faction', genre, {
    resolvedBy: factionId,
    currentTick,
    playerDistrictId: getPlayerDistrictId(world),
    resolutionVisibility: pressure.visibility,
  });
  const chains = applyFallout(world, state, fallout, currentTick);
  for (const chain of chains) {
    pushActivePressure(world, chain);
  }
  const ledger = (state.resolvedPressures ??= []);
  ledger.push(fallout);
  if (ledger.length > RESOLVED_PRESSURES_KEPT) {
    ledger.splice(0, ledger.length - RESOLVED_PRESSURES_KEPT);
  }
  return { pressure, fallout, chains };
}

function resolvePressureHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  const pressureId =
    (typeof action.parameters?.pressureId === 'string' && action.parameters.pressureId) ||
    action.toolId ||
    action.targetIds?.[0];
  if (!pressureId) {
    return [makeEvent(action, 'action.rejected', { verb: action.verb, reason: 'no pressure specified' })];
  }
  const genre = typeof action.parameters?.genre === 'string' && action.parameters.genre
    ? action.parameters.genre
    : 'fantasy';
  const resolved = resolvePressureByPlayer(world, pressureId, action.issuedAtTick, genre, action);
  if (!resolved) {
    return [makeEvent(action, 'action.rejected', {
      verb: action.verb,
      reason: `pressure ${pressureId} not found`,
    })];
  }
  const events: ResolvedEvent[] = [
    makeEvent(action, 'pressure.resolved', {
      ...pressurePayload(resolved.pressure),
      summary: resolved.fallout.summary,
      resolutionType: resolved.fallout.resolution.resolutionType,
      effects: resolved.fallout.effects,
      ...(resolved.fallout.warnings ? { warnings: resolved.fallout.warnings } : {}),
    }, {
      presentation: { channels: ['narrator'], priority: 'high' },
    }),
  ];
  for (const chain of resolved.chains) {
    events.push(makeEvent(action, 'pressure.spawned', {
      ...pressurePayload(chain),
      triggeredBy: chain.triggeredBy,
      chainedFrom: chain.chainedFrom,
    }, {
      presentation: { channels: ['narrator'], priority: 'high' },
    }));
  }
  events.push(...resolved.companionEvents);
  return events;
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
 * obligation ledgers / active consequence chains to world.modules['npc-agency'].
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

  // Last tick's breakpoints (still on the namespace — we have not overwritten
  // it yet) are the "previous" half of evaluateConsequenceChainTrigger.
  const previousBreakpoints = new Map(
    getPersistedNpcProfiles(world).map((p) => [p.npcId, p.breakpoint] as const),
  );
  // Tick EXISTING chains first so a chain minted this round with delayTurns:2
  // needs two subsequent waits, and a delayTurns:0 step can still fire the
  // same round it is built (shouldResolve sees 0 without a same-tick decrement).
  let chains: ConsequenceChain[] = getPersistedNpcChains(world).map(tickConsequenceChain);

  // Age the obligation ledgers BEFORE building this round's profiles/goals —
  // the same "age the lifecycle, then evaluate against the aged version"
  // order tickPressures/tickOpportunities already use for their own state.
  const obligationLedgers = new Map<string, NpcObligationLedger>();
  for (const [npcId, ledger] of getPersistedNpcObligations(world)) {
    obligationLedgers.set(npcId, tickObligations(ledger));
  }

  const playerRumors = getPlayerRumorState(world).rumors;
  const profiles = buildAllNpcProfiles(world, world.playerId, active, playerRumors, obligationLedgers);
  const results = runNpcAgencyTick(world, world.playerId, active, currentTick, playerRumors, obligationLedgers);

  // Breakpoint-shift / obligation triggers → delayed verbs through the SAME
  // resolveNpcAction apply path the regular tick already uses.
  const chainKeys = new Set(chains.map((c) => `${c.npcId}:${c.kind}`));
  for (const profile of profiles) {
    const prev = previousBreakpoints.get(profile.npcId) ?? profile.breakpoint;
    const kind = evaluateConsequenceChainTrigger(
      profile,
      prev,
      obligationLedgers.get(profile.npcId),
    );
    if (!kind) continue;
    const key = `${profile.npcId}:${kind}`;
    if (chainKeys.has(key)) continue;
    chainKeys.add(key);
    chains.push(buildConsequenceChain(profile.npcId, kind, kind, currentTick));
  }
  chains.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const nextChains: ConsequenceChain[] = [];
  for (const chain of chains) {
    if (!shouldResolveChainStep(chain)) {
      nextChains.push(chain);
      continue;
    }
    const stepped = resolveConsequenceChainStep(chain);
    if (!stepped) {
      nextChains.push(chain);
      continue;
    }
    const npc = world.entities[chain.npcId];
    results.push(resolveNpcAction({
      npcId: chain.npcId,
      verb: stepped.verb,
      targetEntityId: world.playerId,
      description: `${npc?.name ?? chain.npcId} ${stepped.description}`,
    }, world));
    nextChains.push(stepped.chain);
  }
  chains = nextChains;

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

    if (result.action.verb === 'betray') {
      engine.store.emitEvent('npc.betrayal.witnessed', {
        npcId: result.action.npcId,
        npcName,
        targetEntityId: result.action.targetEntityId,
        description: result.action.description,
      }, {
        actorId: result.action.npcId,
        ...(result.action.targetEntityId ? { targetIds: [result.action.targetEntityId] } : {}),
        visibility: 'public',
        presentation: { channels: ['narrator'], priority: 'high' },
      });
    }

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
  const prunedChains = chains.filter((c) => currentNpcIds.has(c.npcId));

  const chainMap = new Map(prunedChains.map((c) => [c.npcId, c] as const));
  const recapEntries = computeNpcRecapEntries(
    profiles,
    previousBreakpoints,
    obligationLedgers,
    chainMap,
  );

  setPersistedNpcState(world, profiles, prunedLastActions, obligationLedgers, prunedChains, recapEntries);
}

// ---------------------------------------------------------------------------
// Faction agency (F-b57cee05) — npc-agency's faction sibling that v3.0 never
// wired. runFactionAgencyTick was fully authored with ZERO production callers.
// ---------------------------------------------------------------------------

/**
 * Gate + drive faction-agency.ts's runFactionAgencyTick for one round,
 * applying every returned FactionEffect and persisting profiles / lastActions
 * / memberCounts to world.modules['faction-agency'] — the shape director.ts's
 * FACTIONS section already reads via lastActions.
 *
 * SEED-0 IDENTITY (non-negotiable): a world with NO factions must be
 * byte-identical to today — no faction-agency namespace created, no events,
 * no state mutation of any kind. The `factionIds.length === 0` check is the
 * entire gate.
 */
function runFactionAgencyStep(
  engine: Engine,
  world: WorldState,
  active: WorldPressure[],
  currentTick: number,
  genre: string,
): void {
  const factionIds = Object.keys(world.factions ?? {}).sort();
  if (factionIds.length === 0) return; // SEED-0 identity — read and write nothing

  const playerReputations = factionIds.map((factionId) => ({
    factionId,
    value: (world.factions?.[factionId]?.reputation ?? 0) + num(world.globals[`reputation_${factionId}`]),
  }));
  const districtEconomies = new Map(Object.entries(getEconomyCoreState(world).districts));
  const results = runFactionAgencyTick(world, playerReputations, active, currentTick, districtEconomies);

  const memberCounts = { ...getPersistedFactionMemberCounts(world) };
  const rumorState = getPlayerRumorState(world);
  let rumors = rumorState.rumors;
  let rumorsChanged = false;
  const activeKinds = new Set(active.map((p) => p.kind));
  const lastActionsByFaction = new Map(
    getPersistedFactionLastActions(world).map((r) => [r.action.factionId, r] as const),
  );

  for (const result of results) {
    for (const effect of result.effects) {
      switch (effect.type) {
        case 'reputation':
          addGlobal(world, `reputation_${effect.factionId}`, effect.delta);
          break;
        case 'alert':
          addGlobal(world, `faction_alert_${effect.factionId}`, effect.delta);
          break;
        case 'district-metric':
          applyDistrictMetricEffect(world, effect.districtId, effect.metric, effect.delta);
          break;
        case 'cohesion': {
          const cognition = getFactionCognition(world, effect.factionId);
          cognition.cohesion = clamp(0, 1, cognition.cohesion + effect.delta);
          break;
        }
        case 'pressure': {
          if (activeKinds.has(effect.kind)) break;
          const pressure = makePressure(
            {
              kind: effect.kind,
              sourceFactionId: effect.sourceFactionId,
              description: effect.description,
              triggeredBy: `faction-agency:${result.action.factionId}`,
              urgency: effect.urgency,
              visibility: 'rumored',
              turnsRemaining: CHAIN_TURNS_REMAINING,
              potentialOutcomes: [],
              tags: ['faction-agency'],
              currentTick,
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
        case 'rumor': {
          const origin = result.action.factionId;
          const [firstFaction, ...restFactions] = effect.targetFactionIds;
          let rumor = spawnNpcOriginatedRumor(
            effect.claim,
            effect.valence,
            effect.valence === 'fearsome' ? 'npc-accusation' : 'npc-gossip',
            origin,
            firstFaction ?? origin,
            undefined,
            currentTick,
            NPC_RUMOR_CONFIDENCE,
            world,
          );
          for (const extra of restFactions) rumor = propagateRumor(rumor, extra);
          rumors = [...rumors, rumor];
          rumorsChanged = true;
          break;
        }
        case 'economy-shift': {
          const economy = getDistrictEconomy(world, effect.districtId);
          if (economy) {
            setDistrictEconomy(world, effect.districtId, applyEconomyShift(economy, {
              districtId: effect.districtId,
              category: effect.category as SupplyCategory,
              delta: effect.delta,
              cause: effect.cause,
            }));
          }
          break;
        }
        case 'member-count':
          memberCounts[effect.factionId] = (memberCounts[effect.factionId] ?? 0) + effect.delta;
          break;
        default:
          break;
      }
    }

    // F-35aa8ed0: when this faction's action targets a live pressure of its
    // own, close it as resolved-by-faction so a living board can end a
    // revenge-attempt / bounty / trade-war, not only spawn one.
    const closeKind = FACTION_PRESSURE_CLOSERS[result.action.verb];
    if (closeKind) {
      const live = active.find(
        (p) => p.kind === closeKind && p.sourceFactionId === result.action.factionId,
      );
      if (live) {
        const closed = resolvePressureByFaction(
          world,
          live.id,
          result.action.factionId,
          currentTick,
          genre,
        );
        if (closed) {
          const gone = active.findIndex((p) => p.id === live.id);
          if (gone >= 0) active.splice(gone, 1);
          engine.store.emitEvent('pressure.resolved', {
            ...pressurePayload(closed.pressure),
            summary: closed.fallout.summary,
            resolutionType: closed.fallout.resolution.resolutionType,
            effects: closed.fallout.effects,
            resolvedBy: result.action.factionId,
            ...(closed.fallout.warnings ? { warnings: closed.fallout.warnings } : {}),
          }, {
            visibility: 'public',
            presentation: { channels: ['narrator'], priority: 'high' },
          });
          for (const chain of closed.chains) {
            emitPressureEvent(
              engine,
              'pressure.spawned',
              { ...pressurePayload(chain), triggeredBy: chain.triggeredBy, chainedFrom: chain.chainedFrom },
              { hidden: false, priority: 'high' },
            );
          }
        }
      }
    }

    lastActionsByFaction.set(result.action.factionId, result);
    engine.store.emitEvent('faction.action.resolved', {
      factionId: result.action.factionId,
      verb: result.action.verb,
      description: result.action.description,
      narratorHint: result.narratorHint,
      effects: result.effects,
      ...(result.warning ? { warning: result.warning } : {}),
    }, {
      visibility: 'public',
      presentation: { channels: ['narrator'], priority: 'normal' },
    });
  }

  if (rumorsChanged) setPlayerRumorState(world, { rumors });

  const profiles: FactionProfile[] = [];
  for (const factionId of factionIds) {
    const rep = playerReputations.find((r) => r.factionId === factionId)?.value ?? 0;
    const profile = buildFactionProfile(factionId, world, rep, active, districtEconomies);
    const extra = memberCounts[factionId] ?? 0;
    if (extra) profile.memberCount = Math.max(0, profile.memberCount + extra);
    profiles.push(profile);
  }
  const currentFactionIds = new Set(factionIds);
  const prunedLastActions: FactionActionResult[] = [...lastActionsByFaction.values()]
    .filter((r) => currentFactionIds.has(r.action.factionId));

  setPersistedFactionState(world, profiles, prunedLastActions, memberCounts);
}

// ---------------------------------------------------------------------------
// Leverage income (v3.0 wave 2, "leverage-income", step 5a2) — see file
// header. player-leverage.ts's tickLeverage/computeLeverageGains were fully
// authored and unit-tested with ZERO production callers before this wire.
// ---------------------------------------------------------------------------

/**
 * Combine two partial leverage-gain records, summing shared currencies.
 * computeLeverageGains is called once per hint AXIS below (xp, each new
 * milestone, pressure resolution) rather than once with every hint bundled
 * into a single call — bundling would re-check `hints.xpGained >= 15` (and
 * re-grant its blackmail gain) once per milestone in a multi-milestone
 * round, instead of exactly once for the round's actual xp delta.
 */
function mergeLeverageGains(
  a: Partial<Record<LeverageCurrency, number>>,
  b: Partial<Record<LeverageCurrency, number>>,
): Partial<Record<LeverageCurrency, number>> {
  const merged = { ...a };
  for (const [currency, amount] of Object.entries(b)) {
    if (!amount) continue;
    const key = currency as LeverageCurrency;
    merged[key] = (merged[key] ?? 0) + amount;
  }
  return merged;
}

/**
 * Tick passive leverage income for one round: heat decay + reputation-
 * derived influence reconciliation (tickLeverage), then passive gains from
 * this round's xp/milestone/pressure-resolution signals (computeLeverageGains),
 * written back to the player entity's custom fields via applyLeverageDeltas.
 * `reputation` is the SAME `{factionId, value}[]` buildPressureInputs already
 * derives for the pressure/opportunity steps — reused, not re-plumbed.
 * Player-resolved fallouts are read from `state.resolvedPressures` (the
 * ledger resolvePressureByPlayer writes), filtered to this tick — not from
 * step 3's expiry array, which still always stamps 'expired-ignored'.
 *
 * SEED-0 IDENTITY (non-negotiable): a legacy world that never engaged the
 * social layer — no reputation (maxRep <= 0), no NEW milestones since the
 * cursor, no xp gained this round, no player-resolved pressure this round,
 * AND no pre-existing `leverage.*` custom key — must be byte-identical:
 * this function reads world/state but writes NOTHING (not playerCustom, not
 * either WorldTickState tracking field) when every one of those signals is
 * absent. `hasActivity` below is the entire gate, mirroring
 * runNpcAgencyStep's own "the check is the entire gate; when false, read and
 * write nothing" contract. A world that HAS pre-existing leverage.* state
 * (the player used a social/rumor/diplomacy/sabotage verb directly, outside
 * this step) keeps ticking every round from then on regardless of THIS
 * round's own signals — heat must keep decaying even in a quiet round, the
 * same reasoning HEAT_DECAY_PER_QUIET_TICK's own quiet-round decay exists
 * for the world's ambient heat.
 *
 * MILESTONE-CURSOR TRAP: state.milestones accumulates for the WHOLE session
 * (collectMilestones above and applyFallout's 'milestone-tag' effect both
 * only ever PUSH, never clear or trim). Feeding computeLeverageGains the
 * FULL array every round would re-grant every old milestone's gain on every
 * subsequent tick. state.leverageMilestoneCursor tracks how many entries
 * this step has already processed; only the slice PAST the cursor is fed
 * in, and the cursor advances to state.milestones.length every round this
 * step actually runs. It never advances on a round the SEED-0 gate skips,
 * but a skipped round is, by construction, a round with zero NEW milestones
 * anyway (a new milestone is itself one of the hasActivity triggers
 * below) — the cursor never has a chance to drift behind an unprocessed
 * entry.
 *
 * OPTIONAL fields (leverageMilestoneCursor / lastXp / lastReputation) are tolerant-reader,
 * `?? 0` degrading absence to "nothing processed / no xp observed yet" —
 * but UNLIKE resolvedPressures?/districtTones? (which freshWorldTickState
 * seeds unconditionally at 0/{} for every world), these two are lazily
 * created ONLY inside the `hasActivity` branch below, never in
 * freshWorldTickState. Seeding them at 0 for every world would itself be an
 * observable difference the SEED-0 contract forbids for a world that never
 * triggers this step.
 *
 * computeLeverageGains' reputationDelta hint axis (rep-gain → favor /
 * large-rep-loss → blackmail) is wired via lastReputation the same way
 * lastXp feeds xpGained (F-9b836ed9): per-faction deltas, largest-magnitude
 * wins, quiet ticks do not re-grant. Its pressureResolution axis reads THIS TICK's
 * resolved-by-player fallouts from state.resolvedPressures (F-bdd030b2).
 * submitAction stamps issuedAtTick then advances, so a played round of
 * resolve-pressure + runWorldTick records resolvedAtTick as engine.tick - 1;
 * a same-tick resolve (no subsequent advance) stamps resolvedAtTick ===
 * currentTick. Both identities count as this tick. The lazy
 * leveragePressureResolutionTick cursor prevents a later quiet tick from
 * re-granting the same record.
 */
function runLeverageIncomeStep(
  world: WorldState,
  state: WorldTickState,
  reputation: PressureInputs['reputation'],
  currentTick: number,
): void {
  const player = world.entities[world.playerId];
  const playerCustom = (player?.custom ?? {}) as Record<string, string | number | boolean>;

  const cursor = state.leverageMilestoneCursor ?? 0;
  const newMilestones = state.milestones.slice(cursor);

  const currentXp = getCurrency(world, world.playerId, 'xp');
  const previousXp = state.lastXp ?? 0;
  const xpGained = currentXp - previousXp;

  const previousRep = state.lastReputation ?? {};
  let reputationDelta: { factionId: string; delta: number } | undefined;
  for (const r of reputation) {
    const delta = r.value - (previousRep[r.factionId] ?? 0);
    if (delta === 0) continue;
    if (
      !reputationDelta ||
      Math.abs(delta) > Math.abs(reputationDelta.delta) ||
      (Math.abs(delta) === Math.abs(reputationDelta.delta) && r.factionId < reputationDelta.factionId)
    ) {
      reputationDelta = { factionId: r.factionId, delta };
    }
  }

  const alreadyGrantedTick = state.leveragePressureResolutionTick;
  const playerResolvedFallout = (state.resolvedPressures ?? []).find(
    (f) =>
      f.resolution.resolutionType === 'resolved-by-player' &&
      f.resolution.resolvedAtTick !== alreadyGrantedTick &&
      (f.resolution.resolvedAtTick === currentTick ||
        f.resolution.resolvedAtTick === currentTick - 1),
  );

  const maxRep = Math.max(0, ...reputation.map((r) => r.value));
  const hasExistingLeverageState = Object.keys(playerCustom).some((k) => k.startsWith('leverage.'));

  const hasActivity =
    maxRep > 0 ||
    hasExistingLeverageState ||
    newMilestones.length > 0 ||
    xpGained !== 0 ||
    reputationDelta !== undefined ||
    playerResolvedFallout !== undefined;

  if (!hasActivity) return; // SEED-0 identity — read only, nothing written

  // V3-LEV-1: heat decay + reputation-derived influence reconciliation.
  let custom = tickLeverage(playerCustom, reputation);

  // V3-LEV-2: passive gains, one hint axis at a time (see this function's
  // own docstring for why bundling every hint into one call would
  // double/under-count).
  let gains: Partial<Record<LeverageCurrency, number>> = {};
  if (xpGained !== 0) {
    gains = mergeLeverageGains(gains, computeLeverageGains({ xpGained }));
  }
  // Skip reputationDelta on a tick that already granted pressureResolution
  // (F-bdd030b2 pin: resolve-pressure favor+10 must not also stack the
  // reputation-gain favor+5 from the same bounty clearing).
  if (reputationDelta && !playerResolvedFallout) {
    gains = mergeLeverageGains(
      gains,
      computeLeverageGains({ xpGained: 0, reputationDelta }),
    );
  }
  for (const milestone of newMilestones) {
    gains = mergeLeverageGains(
      gains,
      computeLeverageGains({ xpGained: 0, milestoneTriggered: milestone }),
    );
  }
  if (playerResolvedFallout) {
    gains = mergeLeverageGains(
      gains,
      computeLeverageGains({
        xpGained: 0,
        pressureResolution: { resolutionType: playerResolvedFallout.resolution.resolutionType },
      }),
    );
    state.leveragePressureResolutionTick = playerResolvedFallout.resolution.resolvedAtTick;
  }
  custom = applyLeverageDeltas(custom, gains);

  if (player) player.custom = custom;
  state.lastXp = currentXp;
  state.lastReputation = Object.fromEntries(reputation.map((r) => [r.factionId, r.value]));
  state.leverageMilestoneCursor = state.milestones.length;
}

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

/**
 * Compose AdvisorInputs from already-persisted ledgers and persist
 * recommendMoves' result. The production caller for buildStrategicMap +
 * recommendMoves (F-7a056689). CLI endgame.ts still mirrors the district
 * loop rather than calling this — that surface is out of domain.
 */
function runMoveAdvisorStep(
  world: WorldState,
  state: WorldTickState,
  currentTick: number,
  heat: number,
  active: WorldPressure[],
): void {
  const player = world.entities[world.playerId];
  const custom = (player?.custom ?? {}) as Record<string, string | number | boolean>;
  const hasLeverage = Object.keys(custom).some((k) => k.startsWith('leverage.'));
  const hasFactions = Object.keys(world.factions ?? {}).length > 0;
  if (!hasLeverage && active.length === 0 && !hasFactions) return;

  const inputs = buildPressureInputs(world, state, '', currentTick, active);
  const opportunities = getPersistedOpportunities(world);
  const map = buildStrategicMap(
    world,
    inputs.playerRumors,
    active,
    inputs.reputation,
    getPersistedFactionLastActions(world),
    inputs.districtEconomies,
    opportunities,
  );

  const cooldowns: Record<string, number> = {};
  for (const [key, value] of Object.entries(custom)) {
    if (!key.startsWith('cooldown.') || typeof value !== 'number') continue;
    cooldowns[key.slice('cooldown.'.length)] = value;
  }

  const rec = recommendMoves({
    leverageState: getLeverageState(custom),
    activePressures: active,
    factionViews: map.factions,
    districtViews: map.districts,
    playerReputation: inputs.reputation,
    currentTick,
    cooldowns,
    playerHeat: heat,
    activeOpportunities: opportunities,
  });

  // F-7d890283: attach the player-facing strategic-map line over the SAME
  // `map` just built above — the unread half of F-7a056689's production
  // wiring. Empty (no hot district, no hostile/high-alert faction) omits the
  // field, matching formatStrategicMapForPlayer's own contract. traversal-
  // core.ts's inspectHandler reads this same persisted value (never
  // recomputes it) to surface it beside economyReport on world.zone.inspected.
  const situationHint = formatStrategicMapForPlayer(map);
  setPersistedMoveRecommendation(world, { ...rec, ...(situationHint ? { situationHint } : {}) });
}

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
    // Partial-round application is real (heat/pressures may already have
    // moved). Report the live ledger, not fabricated zeros (F-39229b3b).
    const world = engine.store.state;
    return {
      ok: false,
      heat: num(world.globals[HEAT_KEY]),
      spawned: [],
      revealed: [],
      escalated: [],
      expired: [],
      active: getActivePressures(world),
      encounters: [],
      opportunitiesSpawned: [],
      opportunitiesExpired: [],
    };
  } finally {
    // Take the working array back (v3.8). Outside a tick, pushActivePressure
    // must write the PERSISTED array — that one is live then — and a stale
    // lend would silently send the verb path's writes into an array nobody
    // reads again. In `finally` because a tick that threw has the same
    // problem as one that returned.
    runningPressures.delete(engine.store.state);
  }
}

function tickWorld(engine: Engine, genre: string): WorldTickResult {
  const world = engine.store.state;
  const state = getWorldTickState(world);
  const currentTick = engine.tick;
  const heat = num(world.globals[HEAT_KEY]);

  // Companion reactions (F-b595731a): collected AFTER the typed-hazard steps
  // so an on-enter instakill's combat.entity.defeated (F-2cd298dd) is in
  // range alongside this round's player/NPC attacks. Start cursor is still
  // lastEventIndex — encounter spawn does not emit that type. Pressure-
  // resolution triggers are collected separately, inline, in step 3 below.
  const reactionTriggers: ReactionTrigger[] = [];

  // 0. Zone-entry encounter check (F-ENG005-encounter-spawn-wiring) — the
  // tactical layer of the same reaction loop. Runs inside this tick so the
  // round keeps ONE world tick; its `encounter.spawned` event rides the same
  // round delta the narration presents.
  const encounters = runEncounterSpawnStep(engine);

  // 0a. TYPED HAZARDS (C3/P3) — the on-enter pass, then the per-turn pass.
  //
  // Here rather than in an environment-core event listener, for a measured reason:
  // `createEnvironmentCore` closure-captures `config.hazards` and registers one
  // listener per hazard at construction, so a post-boot registration cannot add a
  // listener (the same structural class as `progressionTrees`, C1's correction);
  // and an event listener receives only `world`, never the engine, so it cannot
  // reach the `emitEvent` choke point a player-visible hazard needs. The
  // cursor-driven step above is the pattern that already solves both.
  //
  // ORDER MATTERS AND IS DELIBERATE: on-enter/on-exit run BEFORE the spawn step's
  // consequences are narrated but AFTER the entry events exist, and per-turn/timed
  // run after, so an entity that walks into a poison swamp takes the entry tick and
  // then the standing tick — not two standing ticks. A pack with no typed hazards
  // makes both calls no-ops, so all twelve shipped packs are byte-identical.
  runTypedHazardEntryStep(engine);
  runTypedHazardStep(engine);
  // F-7793de81: durationTicks applyStatus runs here, AFTER this round's
  // action.resolved periodic pass. Pulse elapsed=0 now so durationTicks:1
  // deals damage this round and durationTicks:N deals N pulses. lastFiredTick
  // in processPeriodicStatuses stops the next action.resolved (same tick
  // number) from double-hitting. Player-applied DoTs still pulse on
  // action.resolved at elapsed 0..N-1 because that pass runs before the tick
  // advances into this world tick.
  for (const ev of processPeriodicStatuses(world, currentTick)) {
    engine.store.recordEvent(ev);
  }
  reactionTriggers.push(...collectCombatReactionTriggers(world, state.lastEventIndex, world.eventLog.length));

  // 0b. ZONE STATE (C3/P4) — the moat bridge. Re-derives each zone's condition
  // from district stability/morale and economy tone, and emits
  // `world.zone.state.changed` ONLY for zones that CROSSED a threshold. A state
  // that fires every round is not a state, and the RED control checks exactly
  // that. Runs before the economy tick below, so a change reflects the state the
  // player just acted on rather than one round of drift later.
  runZoneStateStep(engine);

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
  // Lend this round's working array to pushActivePressure for the duration of
  // the tick (v3.8) — see that function's contract. `active` is a fresh array
  // and `state.pressures = active` only happens at the very end, so a sink
  // firing at step 5b-i has no other way to reach the list that survives.
  runningPressures.set(world, active);

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

    // Companion reactions (F-f4c2fa00): expiry is always 'expired-ignored'
    // → pressure-resolved-badly. The live resolved-by-player path dispatches
    // pressure-resolved-well from resolvePressureByPlayer (the verb and the
    // opportunity-complete mapping), not from this loop.
    reactionTriggers.push('pressure-resolved-badly');

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
      // DistrictModifiers.pressureUrgencyBias (0-0.15): a district already on
      // edge sharpens whatever the world throws at it. Composed here — the
      // caller — and applied to the spawned pressure rather than passed into
      // evaluatePressures, so the rules keep deciding WHICH pressure and the
      // place decides how hard it lands. 0 bias leaves the urgency byte-
      // identical, which is every district with a neutral mood.
      const urgencyBias = districtPressureUrgencyBias(world, playerDistrictId);
      if (urgencyBias > 0) {
        result.pressure.urgency = Math.min(1, round2(result.pressure.urgency + urgencyBias));
      }
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
  const npcLogStart = world.eventLog.length;
  runNpcAgencyStep(engine, world, active, currentTick, playerDistrictId, genre);
  // F-b7196370: collect AFTER the ledger write / witnessed-betrayal emit so
  // a same-tick betray moves morale. A dedicated window (npcLogStart → now)
  // keeps next tick from re-firing these events via the combat cursor.
  const betrayalTriggers = collectBetrayalReactionTriggers(
    world,
    npcLogStart,
    world.eventLog.length,
    currentTick,
  );
  if (betrayalTriggers.length > 0) {
    const latestBreakpoints = new Map(
      getPersistedNpcProfiles(world).map((p) => [p.npcId, p.breakpoint]),
    );
    applyCompanionReactions(engine, world, betrayalTriggers, currentTick, latestBreakpoints);
  }

  // 5a1. Faction agency tick (F-b57cee05) — npc-agency's faction sibling.
  // Gated on "at least one faction exists" — see runFactionAgencyStep's
  // SEED-0 identity contract. Runs after 5a so an NPC-triggered pressure
  // is visible to faction goals, and before 5a2/5b so faction-spawned
  // pressures land in `active` in time for buildPressureInputs.
  runFactionAgencyStep(engine, world, active, currentTick, genre);

  // 5a2. Leverage income (v3.0 wave 2, "leverage-income") — see file header
  // + runLeverageIncomeStep's own docstring for the full SEED-0 contract.
  // Computed AFTER 5a/5a1 so NPC- and faction-spawned pressures and their
  // reputation/alert writes are visible to opportunity evaluation.
  const oppPressureInputs = buildPressureInputs(world, state, genre, currentTick, active);
  runLeverageIncomeStep(world, state, oppPressureInputs.reputation, currentTick);

  // 5b. Opportunity spawn/tick wire (F-ceed887f) — see file header. Runs
  // every round (not heat-gated). Reuses buildPressureInputs' own
  // reputation/factionStates/districtEconomies derivation (computed once,
  // just above, and shared with step 5a2) so opportunity evaluation never
  // disagrees with the pressure tick about faction standing or district
  // economies. Ticks the persisted set FIRST (timers/visibility/expiry),
  // then evaluates a new spawn against the ticked set's own capacity/
  // interval/pair-conflict guards — the exact order step 2→5 already uses
  // for pressures.
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
    // v3.7 pacing: the kind-recurrence cooldown reads the resolution ledger
    // this file and the `opportunity` verb both already append to. Same
    // non-attaching accessor director.ts reads; [] on a world that has never
    // resolved one, so a fresh world evaluates exactly as before.
    recentResolutions: getResolvedOpportunities(world).map((f) => ({
      kind: f.resolution.opportunityKind,
      resolvedAtTick: f.resolution.resolvedAtTick,
    })),
    // Kept in world-tick's OWN state slice rather than derived from the
    // opportunity list, because a resolved offer leaves that list entirely —
    // which is how a player who cleared their queue used to skip the spawn
    // interval altogether. Absent on a world that has never spawned one.
    ...(typeof state.lastOpportunitySpawnTick === 'number'
      ? { lastSpawnTick: state.lastOpportunitySpawnTick }
      : {}),
  };
  const oppResult = evaluateOpportunities(oppInputs);
  if (oppResult) state.lastOpportunitySpawnTick = currentTick;
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
  // 7. Move advisor — after the round's ledgers are persisted so
  // getActivePressures / buildStrategicMap read THIS tick. SEED-0: a world
  // with no leverage keys, no active pressures, and no factions writes
  // nothing (F-7a056689).
  runMoveAdvisorStep(world, state, currentTick, finalHeat, active);
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
