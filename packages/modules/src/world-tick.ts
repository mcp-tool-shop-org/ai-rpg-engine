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
// inputs (F-d0b5edb5/F-6008456f): district economies now tick every round
// (step 0b below) and buildPressureInputs sets districtEconomies from the
// same store, so the 4 economy-driven pressure kinds (supply-crisis,
// trade-war, black-market-boom, crafting-shortage) can fire for any pack that
// registers economy-core (buildWorldStack does, unconditionally). Fallout
// rumor / title-trigger / economy-shift / spawn-opportunity effects are still
// not applied to any store — they ride the `pressure.expired` payload for
// downstream layers (a pressure's OWN resolution fallout is a separate,
// still-open wire from the district-economy store this file now ticks).

import type { Engine, EngineModule, ResolvedEvent, WorldState } from '@ai-rpg-engine/core';
import {
  tickPressures,
  evaluatePressures,
  makePressure,
  type WorldPressure,
  type PressureInputs,
} from './pressure-system.js';
import { computeFallout, type PressureFallout } from './pressure-resolution.js';
import { getDistrictForZone, getDistrictState } from './district-core.js';
import { runEncounterSpawnStep, type SpawnedEncounterReport } from './encounter-spawn.js';
import { getEconomyCoreState, setDistrictEconomy, tickDistrictEconomy } from './economy-core.js';
import {
  COMPANION_TAG,
  getPartyState,
  setPartyState,
  getCompanion,
  adjustCompanionMorale,
  removeCompanion,
  removeCompanionTags,
  refreshCompanionAbilityStatus,
  syncCompanionCustomFields,
} from './companion-core.js';
import { evaluateCompanionReactions, type ReactionTrigger } from './companion-reactions.js';
import type { LoyaltyBreakpoint } from './npc-agency.js';

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
// v2.8-shippable cut: 2 of the 16 REACTION_TABLE triggers have a real
// production event/state signal today —
//   - combat.entity.defeated: a hostile going down → 'combat-won'; the
//     player or an intercepting companion going down → 'combat-lost'.
//   - pressure.expired: 'resolved-by-player' → 'pressure-resolved-well';
//     every other resolutionType (today, always 'expired-ignored' — this
//     file never calls computeFallout with any other value, see step 3
//     below) → 'pressure-resolved-badly'.
// The remaining 14 triggers (leverage-*, betrayal-witnessed, district-*,
// obligation-betrayed, item-*-recognized) have no production event or
// persisted state to key off yet: player-leverage.ts's resolveSocialAction/
// resolveRumorAction/resolveSabotageAction emit no ResolvedEvents and have no
// production caller; item-recognition's chronicle never reaches the world
// eventLog; npc-agency's obligation ledger is never persisted (endgame.ts's
// own buildEndgameInputs comment says the same: "obligation ledgers are
// never persisted"). This is an honest ceiling, not an oversight — mirrors
// this file's own documented ceilings in the header above — deferred to a
// follow-up wave explicitly scoped to wire those event sources, named here
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
 * The real call site below passes none — npc-agency's NpcRelationship ledger
 * has no production writer yet (same honest ceiling as the 12 deferred
 * triggers; endgame.ts's own buildEndgameInputs comment says the same), so
 * departure is a fully-built, correct code path that cannot yet fire in a
 * played session. Exported and parameterized (rather than hardcoded to no
 * breakpoints) so it is both directly testable today and a one-line
 * integration point once a future wave wires relationships: pass the real
 * map, nothing else here changes.
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
  // this tick's pressure resolutions, now that both are known.
  applyCompanionReactions(engine, world, reactionTriggers, currentTick);

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
  return {
    ok: true,
    heat: finalHeat,
    spawned,
    revealed,
    escalated,
    expired: expiredFallouts,
    active,
    encounters,
  };
}
