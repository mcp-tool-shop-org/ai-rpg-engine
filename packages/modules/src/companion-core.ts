// companion-core — party state and companion management
// Companions are NPCs with a CompanionState sidecar. Not a new entity type.
// Pure functions. No state mutation — returns new objects.

import type { EntityState } from '@ai-rpg-engine/core';

// --- Types ---

export type CompanionRole = 'fighter' | 'scout' | 'healer' | 'diplomat' | 'smuggler' | 'scholar';

export type CompanionState = {
  npcId: string;           // Same ID as their EntityState
  role: CompanionRole;
  joinedAtTick: number;
  personalGoal?: string;   // "Find her brother", "Clear her name"
  abilityTags: string[];   // ['intimidation-backup', 'medical-support']
  morale: number;          // 0-100, tracks how companion feels about traveling with player
  active: boolean;         // In the active party (vs dismissed/away)
};

export type PartyState = {
  companions: CompanionState[];
  maxSize: number;          // Default 3
  cohesion: number;         // 0-100, derived from average companion morale
};

export type AbilityModifiers = {
  leverageCostDiscount: number;    // Subtracted from leverage costs
  hpRecoveryBonus: number;         // Added to post-combat HP recovery
  rumorSpreadScale: number;        // Multiplied onto rumor spread
  reputationBonus: Record<string, number>;  // Per-faction reputation bonus
  commerceGainBonus: number;       // Added to commerce leverage gains
  rumorSuppressionChance: number;  // 0-1, chance to bury negative rumors
  perceptionBonus: number;         // Added to perception clarity
};

// --- Party Management ---

const DEFAULT_MAX_SIZE = 3;

export function createPartyState(maxSize?: number): PartyState {
  return {
    companions: [],
    maxSize: maxSize ?? DEFAULT_MAX_SIZE,
    cohesion: 0,
  };
}

export function addCompanion(party: PartyState, companion: CompanionState): PartyState {
  if (party.companions.length >= party.maxSize) return party;
  if (party.companions.some((c) => c.npcId === companion.npcId)) return party;
  const companions = [...party.companions, companion];
  return { ...party, companions, cohesion: computePartyCohesion({ ...party, companions }) };
}

export function removeCompanion(
  party: PartyState,
  npcId: string,
): { party: PartyState; removed: CompanionState | undefined } {
  const removed = party.companions.find((c) => c.npcId === npcId);
  if (!removed) return { party, removed: undefined };
  const companions = party.companions.filter((c) => c.npcId !== npcId);
  const newParty: PartyState = { ...party, companions, cohesion: computePartyCohesion({ ...party, companions }) };
  return { party: newParty, removed };
}

export function getCompanion(party: PartyState, npcId: string): CompanionState | undefined {
  return party.companions.find((c) => c.npcId === npcId);
}

export function isCompanion(party: PartyState, npcId: string): boolean {
  return party.companions.some((c) => c.npcId === npcId);
}

export function getActiveCompanions(party: PartyState): CompanionState[] {
  return party.companions.filter((c) => c.active);
}

export function setCompanionActive(party: PartyState, npcId: string, active: boolean): PartyState {
  const companions = party.companions.map((c) =>
    c.npcId === npcId ? { ...c, active } : c,
  );
  return { ...party, companions, cohesion: computePartyCohesion({ ...party, companions }) };
}

export function adjustCompanionMorale(party: PartyState, npcId: string, delta: number): PartyState {
  const companions = party.companions.map((c) =>
    c.npcId === npcId
      ? { ...c, morale: Math.max(0, Math.min(100, c.morale + delta)) }
      : c,
  );
  return { ...party, companions, cohesion: computePartyCohesion({ ...party, companions }) };
}

export function computePartyCohesion(party: PartyState): number {
  const active = party.companions.filter((c) => c.active);
  if (active.length === 0) return 0;
  const avg = active.reduce((sum, c) => sum + c.morale, 0) / active.length;
  return Math.round(avg);
}

export function computePartyAbilities(party: PartyState): string[] {
  const active = party.companions.filter((c) => c.active);
  const tags = new Set<string>();
  for (const c of active) {
    for (const tag of c.abilityTags) {
      tags.add(tag);
    }
  }
  return [...tags];
}

export function isCompanionRecruitable(entity: EntityState): boolean {
  return entity.tags.includes('recruitable') || entity.tags.includes('companion-ready');
}

// --- Ability Modifiers ---

const ABILITY_EFFECTS: Record<string, Partial<AbilityModifiers>> = {
  'intimidation-backup': { leverageCostDiscount: 1 },
  'medical-support': { hpRecoveryBonus: 2 },
  'smuggling-contact': { leverageCostDiscount: 1 },
  'witness-calming': { rumorSpreadScale: 0.7 },
  'trade-advantage': { commerceGainBonus: 1 },
  'rumor-suppression': { rumorSuppressionChance: 0.3 },
  'scholarly-insight': { perceptionBonus: 0.1 },
  // faction-route handled specially — needs companion's factionId
};

const DEFAULT_MODIFIERS: AbilityModifiers = {
  leverageCostDiscount: 0,
  hpRecoveryBonus: 0,
  rumorSpreadScale: 1.0,
  reputationBonus: {},
  commerceGainBonus: 0,
  rumorSuppressionChance: 0,
  perceptionBonus: 0,
};

export function computeAbilityModifiers(
  abilities: string[],
  companionFactionIds?: Record<string, string | null>,
): AbilityModifiers {
  const mods: AbilityModifiers = { ...DEFAULT_MODIFIERS, reputationBonus: {} };

  for (const ability of abilities) {
    const effects = ABILITY_EFFECTS[ability];
    if (effects) {
      if (effects.leverageCostDiscount) mods.leverageCostDiscount += effects.leverageCostDiscount;
      if (effects.hpRecoveryBonus) mods.hpRecoveryBonus += effects.hpRecoveryBonus;
      if (effects.rumorSpreadScale !== undefined) mods.rumorSpreadScale *= effects.rumorSpreadScale;
      if (effects.commerceGainBonus) mods.commerceGainBonus += effects.commerceGainBonus;
      if (effects.rumorSuppressionChance) {
        // Combine probabilities: 1 - (1-a)(1-b)
        mods.rumorSuppressionChance = 1 - (1 - mods.rumorSuppressionChance) * (1 - effects.rumorSuppressionChance);
      }
      if (effects.perceptionBonus) mods.perceptionBonus += effects.perceptionBonus;
    }

    // faction-route: +10 reputation bonus for companion's faction
    if (ability === 'faction-route' && companionFactionIds) {
      for (const [, factionId] of Object.entries(companionFactionIds)) {
        if (factionId) {
          mods.reputationBonus[factionId] = (mods.reputationBonus[factionId] ?? 0) + 10;
        }
      }
    }
  }

  return mods;
}

// --- Formatting ---

export function formatPartyForDirector(
  party: PartyState,
  companionProfiles: Array<{
    npcId: string;
    name: string;
    breakpoint: string;
    goals: Array<{ label: string; priority: number }>;
  }>,
  departureRisks: Record<string, { risk: string; reason?: string }>,
): string {
  const DIVIDER = '─'.repeat(60);
  const lines: string[] = [];
  const active = getActiveCompanions(party);

  lines.push('');
  lines.push(DIVIDER);
  lines.push(`  PARTY (${active.length}/${party.maxSize} companions)`);
  lines.push(DIVIDER);
  lines.push('');

  if (party.companions.length === 0) {
    lines.push('  No companions recruited.');
  } else {
    for (const comp of party.companions) {
      const profile = companionProfiles.find((p) => p.npcId === comp.npcId);
      const name = profile?.name ?? comp.npcId;
      const breakpoint = profile?.breakpoint ?? 'unknown';
      const activeStr = comp.active ? '' : ' [inactive]';
      const role = comp.role.charAt(0).toUpperCase() + comp.role.slice(1);

      lines.push(`  ${name} (${comp.npcId}) — ${role} | Morale: ${comp.morale} | Breakpoint: ${breakpoint}${activeStr}`);

      if (comp.abilityTags.length > 0) {
        lines.push(`    Abilities: ${comp.abilityTags.join(', ')}`);
      }

      if (profile?.goals && profile.goals.length > 0) {
        const goalStr = profile.goals.slice(0, 3).map((g) => `${g.label} (${g.priority.toFixed(1)})`).join(', ');
        lines.push(`    Goals: ${goalStr}`);
      }

      const risk = departureRisks[comp.npcId];
      if (risk) {
        lines.push(`    Departure risk: ${risk.risk}${risk.reason ? ` — ${risk.reason}` : ''}`);
      }

      if (comp.personalGoal) {
        lines.push(`    Personal goal: ${comp.personalGoal}`);
      }

      lines.push(`    Joined: tick ${comp.joinedAtTick}`);
      lines.push('');
    }

    const abilities = computePartyAbilities(party);
    lines.push(`  Cohesion: ${party.cohesion}${abilities.length > 0 ? ` | Party abilities: ${abilities.join(', ')}` : ''}`);
  }

  lines.push('');
  lines.push(DIVIDER);
  lines.push('');

  return lines.join('\n');
}

export function formatPartyStatusLine(
  party: PartyState,
  companionNames: Record<string, string>,
): string | undefined {
  const active = getActiveCompanions(party);
  if (active.length === 0) return undefined;

  const parts = active.map((c) => {
    const name = companionNames[c.npcId] ?? c.npcId;
    return `${name} (${c.role}, morale ${c.morale})`;
  });

  return `  Party: ${parts.join(' | ')} | Cohesion: ${party.cohesion}`;
}

export function formatPartyPresence(
  party: PartyState,
  companionNames: Record<string, string>,
): string | undefined {
  const active = getActiveCompanions(party);
  if (active.length === 0) return undefined;

  const parts = active.map((c) => {
    const name = companionNames[c.npcId] ?? c.npcId;
    const mood = c.morale >= 70 ? 'confident' : c.morale >= 40 ? 'cautious' : 'uneasy';
    return `${name} (${c.role}, ${mood})`;
  });

  return `Accompanied by ${parts.join(' and ')}`;
}
