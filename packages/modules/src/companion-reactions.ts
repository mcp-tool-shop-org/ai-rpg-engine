// Companion reactions — role-based morale responses to player decisions and world events

import type { CompanionRole, CompanionState } from './companion-core.js';
import type { NpcRelationship, LoyaltyBreakpoint } from './npc-agency.js';

// --- Types ---

export type CompanionReaction = {
  npcId: string;
  trigger: string;
  moraleDelta: number;
  narratorHint: string;
  departure?: boolean;
  departureReason?: string;
};

export type DepartureRisk = 'none' | 'low' | 'medium' | 'high';

export type DepartureAssessment = {
  risk: DepartureRisk;
  reason?: string;
};

// --- Role-Based Reaction Table ---

type ReactionRow = Record<CompanionRole, number>;

const REACTION_TABLE = {
  'leverage-sabotage':       { fighter: 0,  scout: 2,  healer: -3, diplomat: -5, smuggler: 3,  scholar: -2 },
  'leverage-diplomacy':      { fighter: -1, scout: 0,  healer: 2,  diplomat: 5,  smuggler: 0,  scholar: 3 },
  'leverage-rumor':          { fighter: -1, scout: 1,  healer: -1, diplomat: 0,  smuggler: 3,  scholar: 0 },
  'leverage-social':         { fighter: 0,  scout: 0,  healer: 1,  diplomat: 2,  smuggler: 1,  scholar: 1 },
  'combat-won':              { fighter: 3,  scout: 1,  healer: -1, diplomat: 0,  smuggler: 0,  scholar: 0 },
  'combat-lost':             { fighter: -2, scout: -2, healer: -1, diplomat: -3, smuggler: -3, scholar: -2 },
  'betrayal-witnessed':      { fighter: -5, scout: -3, healer: -5, diplomat: -8, smuggler: -2, scholar: -5 },
  'district-grim':           { fighter: -1, scout: -1, healer: -2, diplomat: -2, smuggler: 0,  scholar: -1 },
  'district-prosperous':     { fighter: 1,  scout: 0,  healer: 1,  diplomat: 2,  smuggler: 2,  scholar: 1 },
  'pressure-resolved-well':  { fighter: 2,  scout: 1,  healer: 2,  diplomat: 3,  smuggler: 1,  scholar: 2 },
  'pressure-resolved-badly': { fighter: -2, scout: -2, healer: -3, diplomat: -3, smuggler: -1, scholar: -2 },
  'obligation-betrayed':     { fighter: -8, scout: -5, healer: -8, diplomat: -10, smuggler: -3, scholar: -5 },
  // Item recognition triggers
  'item-faction-recognized': { fighter: 1,  scout: 0,  healer: 0,  diplomat: 2,  smuggler: 0,  scholar: 1 },
  'item-stolen-recognized':  { fighter: -1, scout: 1,  healer: -2, diplomat: -3, smuggler: 2,  scholar: -1 },
  'item-cursed-recognized':  { fighter: -2, scout: -1, healer: -5, diplomat: -2, smuggler: -1, scholar: 1 },
  'item-trophy-recognized':  { fighter: 3,  scout: 1,  healer: -1, diplomat: 0,  smuggler: 1,  scholar: 2 },
} satisfies Record<string, ReactionRow>;

/**
 * Every trigger the reaction table understands. TypeScript callers get
 * compile-time autocomplete/checking via {@link ReactionTrigger}; dynamic-string
 * callers can validate with {@link isKnownReactionTrigger} before dispatching.
 */
export type ReactionTrigger = keyof typeof REACTION_TABLE;

/** All known reaction triggers, sorted for stable presentation. */
export const KNOWN_REACTION_TRIGGERS: readonly string[] =
  Object.keys(REACTION_TABLE).sort() as readonly string[];

/** True when `trigger` has a reaction-table row. */
export function isKnownReactionTrigger(trigger: string): trigger is ReactionTrigger {
  return Object.prototype.hasOwnProperty.call(REACTION_TABLE, trigger);
}

// ---------------------------------------------------------------------------
// Trigger Reachability Ledger (F-6be920bd audit)
// ---------------------------------------------------------------------------
//
// companion-reactions.ts is a pure library — it has no EngineModule, no
// event listeners, and no callers of its own. Every REACTION_TABLE trigger
// only ever fires because SOME OTHER file calls evaluateCompanionReactions
// with that literal string. This ledger is a static, testable accounting of
// which triggers have a real production producer TODAY, audited directly
// against source (not just comments):
//   - world-tick.ts's applyCompanionReactions, fed by
//     collectCombatReactionTriggers (combat.entity.defeated), the district-
//     mood tone-transition check (step 0c), and the pressure-expiry step
//     (step 3);
//   - player-leverage.ts's dispatchLeverageCompanionReactions, called
//     directly from all 25 leverage verb handlers (bribe/intimidate/
//     petition/call-in-favor/recruit-ally/disguise/stake-claim →
//     'leverage-social'; seed/deny/frame/claim-false-credit/bury-scandal/
//     leak-truth/spread-counter-rumor → 'leverage-rumor'; the seven
//     diplomacy-group verbs → 'leverage-diplomacy'; the four sabotage-group
//     verbs → 'leverage-sabotage' — v3.0 wave 1 "social-verbs" registered the
//     21 of these that weren't wired as of the F-6be920bd audit).
//
// Because wiring a trigger always means editing one of those producer
// files (or authoring a brand new one for npc-agency/item-recognition),
// and NOT this file, re-audit and update this table whenever a producer's
// dispatch changes — this file cannot detect that drift on its own.
// ---------------------------------------------------------------------------

export type ReactionTriggerReachability =
  /** A real producer exists and genuinely fires it in a played session. */
  | 'reachable'
  /** A producer calls evaluateCompanionReactions with this trigger, but the
   *  literal value it always passes can never select this trigger's branch
   *  — dead code, not a live path. */
  | 'wired-unreachable'
  /** No producer calls evaluateCompanionReactions with this trigger at all. */
  | 'dark';

export type ReactionTriggerStatus = {
  reachability: ReactionTriggerReachability;
  /** Where this trigger is dispatched from today (reachable/wired-unreachable),
   *  or precisely what it is waiting on (dark). */
  note: string;
};

/**
 * Per-trigger reachability, audited against the live call sites (F-6be920bd
 * audit; v3.0 wave 1 "social-verbs" extended player-leverage.ts's producer to
 * cover all four leverage-* triggers). 9 reachable, 1 wired-but-dead, 6 dark
 * — the 6 remaining dark triggers are NOT wireable from THIS file:
 * betrayal-witnessed/obligation-betrayed/item-*-recognized need entirely new
 * producers in npc-agency.ts/item-recognition.ts that do not exist yet
 * (npc-agency's obligation ledger and item-recognition's chronicle are both
 * never persisted/never reach world.eventLog — honestly deferred to v3.0,
 * not force-wired here).
 *
 * leverage-diplomacy and leverage-sabotage WERE in the dark set as of the
 * F-6be920bd audit (resolveSocialAction's LeverageResolution.verb was always
 * the literal 'social', so nothing discriminated a diplomacy or sabotage
 * action from a plain social one). v3.0 wave 1 registered player-leverage.ts's
 * diplomacy-group and sabotage-group verbs, which resolve through
 * resolveDiplomacyAction/resolveSabotageAction — whose LeverageResolution.verb
 * is always the literal 'diplomacy'/'sabotage' respectively — so both are
 * reachable now.
 */
export const REACTION_TRIGGER_STATUS: Record<ReactionTrigger, ReactionTriggerStatus> = {
  'combat-won': {
    reachability: 'reachable',
    note: 'world-tick.ts combatReactionTrigger: a hostile/enemy entity is defeated',
  },
  'combat-lost': {
    reachability: 'reachable',
    note: "world-tick.ts combatReactionTrigger: a companion is defeated (the player-defeat sub-case is unreachable in the shipped CLI — bin.ts's \"no tick over a corpse\" gate always returns before this file's round scan runs)",
  },
  'pressure-resolved-well': {
    reachability: 'wired-unreachable',
    note: "world-tick.ts's only computeFallout call site always passes the literal 'expired-ignored' as resolutionType, so fallout.resolution.resolutionType can never equal 'resolved-by-player' in production — dead branch, not a live path",
  },
  'pressure-resolved-badly': {
    reachability: 'reachable',
    note: "world-tick.ts: every pressure expiry's resolutionType is (today, always) 'expired-ignored', which maps here",
  },
  'district-grim': {
    reachability: 'reachable',
    note: "world-tick.ts step 0c: district-mood.ts's computeDistrictMood reports a tone TRANSITION into 'grim'",
  },
  'district-prosperous': {
    reachability: 'reachable',
    note: "world-tick.ts step 0c: district-mood.ts's computeDistrictMood reports a tone TRANSITION into 'prosperous'",
  },
  'leverage-social': {
    reachability: 'reachable',
    note: "player-leverage.ts dispatchLeverageCompanionReactions: all seven social-group verbs (bribe/intimidate/petition/call-in-favor/recruit-ally/disguise/stake-claim, the last four added in v3.0 wave 1 'social-verbs') — resolveSocialAction's LeverageResolution.verb is always the literal 'social'",
  },
  'leverage-rumor': {
    reachability: 'reachable',
    note: "player-leverage.ts dispatchLeverageCompanionReactions: all seven rumor-group verbs (seed/deny/frame/claim-false-credit/bury-scandal/leak-truth/spread-counter-rumor, the last six added in v3.0 wave 1 'social-verbs') — resolveRumorAction's LeverageResolution.verb is always the literal 'rumor'",
  },
  'leverage-diplomacy': {
    reachability: 'reachable',
    note: "player-leverage.ts dispatchLeverageCompanionReactions: all seven diplomacy-group verbs (request-meeting/improve-standing/cash-milestone/negotiate-access/trade-secret/temporary-alliance/broker-truce), via resolveDiplomacyAction — whose LeverageResolution.verb is always the literal 'diplomacy', distinct from resolveSocialAction's 'social' (v3.0 wave 1 'social-verbs')",
  },
  'leverage-sabotage': {
    reachability: 'reachable',
    note: "player-leverage.ts dispatchLeverageCompanionReactions: all four sabotage-group verbs (sabotage/plant-evidence/blackmail-target/incite-riot), via resolveSabotageAction — whose LeverageResolution.verb is always the literal 'sabotage' (v3.0 wave 1 'social-verbs')",
  },
  'betrayal-witnessed': {
    reachability: 'dark',
    note: 'waits on npc-agency emitting a witnessed-betrayal signal — no producer exists yet (v3.0)',
  },
  'obligation-betrayed': {
    reachability: 'dark',
    note: "waits on npc-agency's obligation ledger being persisted — it is not today (endgame.ts's own buildEndgameInputs comment confirms the same ceiling; v3.0)",
  },
  'item-faction-recognized': {
    reachability: 'dark',
    note: "waits on item-recognition's chronicle reaching world.eventLog — it does not today (v3.0)",
  },
  'item-stolen-recognized': {
    reachability: 'dark',
    note: 'same item-recognition ceiling as item-faction-recognized (v3.0)',
  },
  'item-cursed-recognized': {
    reachability: 'dark',
    note: 'same item-recognition ceiling as item-faction-recognized (v3.0)',
  },
  'item-trophy-recognized': {
    reachability: 'dark',
    note: 'same item-recognition ceiling as item-faction-recognized (v3.0)',
  },
};

// --- Narrator Hint Templates ---

const POSITIVE_HINTS: Record<CompanionRole, string[]> = {
  fighter: ['nods approvingly', 'grins fiercely', 'thumps their chest'],
  scout: ['smirks quietly', 'gives a subtle nod', 'seems satisfied'],
  healer: ['breathes a sigh of relief', 'smiles gently', 'offers a quiet blessing'],
  diplomat: ['beams with approval', 'raises an eyebrow appreciatively', 'claps softly'],
  smuggler: ['whistles approvingly', 'rubs their hands together', 'tips their hat'],
  scholar: ['makes a note with interest', 'hums thoughtfully', 'adjusts their spectacles, pleased'],
};

const NEGATIVE_HINTS: Record<CompanionRole, string[]> = {
  fighter: ['scowls darkly', 'clenches their jaw', 'shakes their head'],
  scout: ['goes quiet', 'looks away', 'narrows their eyes'],
  healer: ['winces visibly', 'clutches their holy symbol', 'looks pained'],
  diplomat: ['frowns deeply', 'purses their lips', 'clears their throat disapprovingly'],
  smuggler: ['mutters under their breath', 'crosses their arms', 'looks uncomfortable'],
  scholar: ['adjusts their spectacles, frowning', 'sighs heavily', 'writes something disapproving'],
};

function pickHint(role: CompanionRole, delta: number, seed: number): string {
  const hints = delta >= 0 ? POSITIVE_HINTS[role] : NEGATIVE_HINTS[role];
  return hints[seed % hints.length];
}

// --- Core Evaluation ---

/**
 * Hard morale floor for the breakpoint-independent departure fallback
 * (V3R-PARTY-2b, Phase-9 party-departure remediation). Well below the
 * breakpoint path's own 10-threshold, and well below the worst single-
 * trigger swing in REACTION_TABLE (-10, obligation-betrayed/diplomat) — one
 * bad event from a healthy baseline can never cross it by accident. See
 * evaluateCompanionReactions' shouldDepart computation below for the full
 * gating rule.
 */
export const MORALE_FLOOR_FALLBACK = 5;

/**
 * Evaluate companion reactions to a game event trigger.
 * Returns reactions for all active companions, including morale deltas and narrator hints.
 * Checks for departure conditions after applying morale delta.
 *
 * Departure has two independent gates (see the `shouldDepart` computation
 * below): the breakpoint-known path (a hostile/wavering npc-agency
 * relationship compounds a critical morale into departure), and the
 * MORALE_FLOOR_FALLBACK path (V3R-PARTY-2b) — when NO breakpoint is known
 * for a companion at all (either npc-agency hasn't profiled them yet, or the
 * calling site never forwards a breakpoints map, e.g. player-leverage.ts's
 * dispatchLeverageCompanionReactions), departure still becomes reachable
 * once morale bottoms out at the hard floor. Without this fallback,
 * departure depended SOLELY on npc-agency breakpoints and could never fire
 * from a call site or a world state that never supplies one.
 *
 * Unknown triggers (e.g. a typo like `'combat-win'` for `'combat-won'`) return
 * `[]` — indistinguishable from "no companion cares" — so they are ALSO
 * reported through `context.onWarning` when provided. Pass an `onWarning` sink
 * in dev/authoring builds to make trigger typos loud instead of silent; use
 * {@link ReactionTrigger} / {@link isKnownReactionTrigger} for compile-time or
 * pre-dispatch validation.
 */
export function evaluateCompanionReactions(
  companions: CompanionState[],
  trigger: ReactionTrigger | (string & {}),
  context: {
    relationships?: Map<string, NpcRelationship>;
    breakpoints?: Map<string, LoyaltyBreakpoint>;
    tick?: number;
    /** Structured author-warning sink; called for unknown triggers. */
    onWarning?: (message: string) => void;
  },
): CompanionReaction[] {
  if (!isKnownReactionTrigger(trigger)) {
    context.onWarning?.(
      `unknown companion reaction trigger '${trigger}' — no reactions evaluated. `
      + `Known triggers: ${KNOWN_REACTION_TRIGGERS.join(', ')}.`,
    );
    return [];
  }
  const row: ReactionRow = REACTION_TABLE[trigger];

  const reactions: CompanionReaction[] = [];
  const seed = context.tick ?? 0;

  for (const companion of companions) {
    if (!companion.active) continue;

    const baseDelta = row[companion.role] ?? 0;
    if (baseDelta === 0) continue;

    // Compute projected morale after delta
    const projectedMorale = Math.max(0, Math.min(100, companion.morale + baseDelta));

    // Check departure conditions. Two independent gates:
    //  - breakpoint-known path (unchanged): a hostile/wavering relationship
    //    compounds a morale crash (<=10) into departure.
    //  - MORALE_FLOOR_FALLBACK path (V3R-PARTY-2b): gated tightly to ONLY
    //    when the breakpoint is genuinely unknown (undefined) — a companion
    //    with a KNOWN but benign breakpoint ('allied'/'favorable'/
    //    'compromised') does NOT fall through to the floor; that
    //    companion's non-departure at low morale remains the existing,
    //    intentional contract (mirrored by evaluateDepartureRisk's own
    //    breakpoint-gated bands below).
    const breakpoint = context.breakpoints?.get(companion.npcId);
    const shouldDepart = breakpoint === undefined
      ? projectedMorale <= MORALE_FLOOR_FALLBACK
      : projectedMorale <= 10 && (breakpoint === 'hostile' || breakpoint === 'wavering');

    const hint = pickHint(companion.role, baseDelta, seed + companion.npcId.length);

    const reaction: CompanionReaction = {
      npcId: companion.npcId,
      trigger,
      moraleDelta: baseDelta,
      narratorHint: hint,
    };

    if (shouldDepart) {
      reaction.departure = true;
      reaction.departureReason = breakpoint === 'hostile'
        ? 'lost all faith in you'
        : breakpoint === 'wavering'
          ? 'can no longer follow this path'
          : 'has hit their breaking point';
    }

    reactions.push(reaction);
  }

  return reactions;
}

/**
 * Evaluate departure risk for a single companion.
 * Pure assessment for director views — does not trigger departure.
 */
export function evaluateDepartureRisk(
  companion: CompanionState,
  breakpoint?: LoyaltyBreakpoint,
): DepartureAssessment {
  if (companion.morale > 50) {
    return { risk: 'none' };
  }

  if (companion.morale <= 10) {
    if (breakpoint === 'hostile') {
      return { risk: 'high', reason: 'Morale critical, relationship hostile' };
    }
    if (breakpoint === 'wavering') {
      return { risk: 'high', reason: 'Morale critical, relationship wavering' };
    }
    return { risk: 'medium', reason: 'Morale dangerously low' };
  }

  if (companion.morale <= 30) {
    if (breakpoint === 'hostile' || breakpoint === 'wavering') {
      return { risk: 'medium', reason: `Morale low, relationship ${breakpoint}` };
    }
    return { risk: 'low', reason: 'Morale declining' };
  }

  // 30 < morale <= 50
  if (breakpoint === 'hostile') {
    return { risk: 'low', reason: 'Relationship hostile' };
  }
  return { risk: 'none' };
}
