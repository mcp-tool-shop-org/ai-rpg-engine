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

const REACTION_TABLE: Record<string, ReactionRow> = {
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
 * Evaluate companion reactions to a game event trigger.
 * Returns reactions for all active companions, including morale deltas and narrator hints.
 * Checks for departure conditions after applying morale delta.
 */
export function evaluateCompanionReactions(
  companions: CompanionState[],
  trigger: string,
  context: {
    relationships?: Map<string, NpcRelationship>;
    breakpoints?: Map<string, LoyaltyBreakpoint>;
    tick?: number;
  },
): CompanionReaction[] {
  const row = REACTION_TABLE[trigger];
  if (!row) return [];

  const reactions: CompanionReaction[] = [];
  const seed = context.tick ?? 0;

  for (const companion of companions) {
    if (!companion.active) continue;

    const baseDelta = row[companion.role] ?? 0;
    if (baseDelta === 0) continue;

    // Compute projected morale after delta
    const projectedMorale = Math.max(0, Math.min(100, companion.morale + baseDelta));

    // Check departure conditions
    const breakpoint = context.breakpoints?.get(companion.npcId);
    const shouldDepart = projectedMorale <= 10 &&
      (breakpoint === 'hostile' || breakpoint === 'wavering');

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
        : 'can no longer follow this path';
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
