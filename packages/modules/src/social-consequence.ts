// social-consequence — pure helpers for deriving social reactions
// No module registration; operates on existing cognition/faction/reputation data.

// --- Types ---

export type Stance =
  | 'hostile'
  | 'fearful'
  | 'awed'
  | 'pitying'
  | 'opportunistic'
  | 'kinship'
  | 'neutral';

export type ReputationConsequence = {
  /** Price multiplier: < 1 = discount, > 1 = markup */
  priceModifier: number;
  /** Access level granted by the faction */
  accessLevel: 'denied' | 'restricted' | 'normal' | 'privileged';
  /** One-liner for prompt injection describing faction attitude */
  dialogueBias: string;
};

export type TitleEvolution = {
  /** Prepend to current title */
  prefix?: string;
  /** Append to current title */
  suffix?: string;
  /** Full replacement (overrides prefix/suffix) */
  replace?: string;
  /** All of these milestone tags must be present */
  requiredTags: string[];
  /** Minimum count of each required tag (default: 1) */
  minCount?: number;
};

// --- Stance Derivation ---

/**
 * Derive an NPC's social stance toward the player.
 * Priority cascade — first matching condition wins.
 */
export function deriveStance(
  reputationValue: number,
  cognition: { morale: number; suspicion: number },
  alertLevel: number,
): Stance {
  if (reputationValue <= -60) return 'hostile';
  if (cognition.suspicion >= 80) return 'fearful';
  if (reputationValue >= 60) return 'awed';
  if (cognition.morale <= 20) return 'pitying';
  if (alertLevel >= 50 && reputationValue < 0) return 'opportunistic';
  if (reputationValue >= 30) return 'kinship';
  return 'neutral';
}

// --- Reputation Consequences ---

/**
 * Map a reputation value to mechanical consequences.
 */
export function getReputationConsequence(reputationValue: number): ReputationConsequence {
  if (reputationValue <= -60) {
    return { priceModifier: 1.5, accessLevel: 'denied', dialogueBias: 'This one is not welcome here.' };
  }
  if (reputationValue <= -20) {
    return { priceModifier: 1.3, accessLevel: 'restricted', dialogueBias: 'Watch this one carefully.' };
  }
  if (reputationValue >= 60) {
    return { priceModifier: 0.7, accessLevel: 'privileged', dialogueBias: 'We are honored by your presence.' };
  }
  if (reputationValue >= 20) {
    return { priceModifier: 0.9, accessLevel: 'normal', dialogueBias: 'A friend of the faction.' };
  }
  return { priceModifier: 1.0, accessLevel: 'normal', dialogueBias: '' };
}

// --- Title Evolution ---

/**
 * Check if milestone tags qualify for a title evolution.
 * Returns the evolved title, or the current title if no evolution matches.
 */
export function evolveTitle(
  currentTitle: string | undefined,
  milestoneTags: string[],
  evolutions: TitleEvolution[],
): string | undefined {
  // Count tag occurrences
  const tagCounts = new Map<string, number>();
  for (const tag of milestoneTags) {
    tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }

  for (const evo of evolutions) {
    const minCount = evo.minCount ?? 1;
    const qualifies = evo.requiredTags.every(
      (tag) => (tagCounts.get(tag) ?? 0) >= minCount,
    );
    if (!qualifies) continue;

    if (evo.replace) return evo.replace;
    if (!currentTitle) continue;
    if (evo.prefix) return `${evo.prefix} ${currentTitle}`;
    if (evo.suffix) return `${currentTitle} ${evo.suffix}`;
  }

  return currentTitle;
}

// --- Player Descriptor (for rumors) ---

/**
 * Build a rumorized identity string for how NPCs describe the player.
 */
export function buildPlayerDescriptor(
  name: string,
  archetypeId: string,
  level: number,
  injuryNames: string[],
  titleStr?: string,
): string {
  const parts: string[] = [];

  if (titleStr) {
    parts.push(`${name} "${titleStr}"`);
  } else {
    parts.push(name);
  }

  parts.push(`a level ${level} ${archetypeId}`);

  if (injuryNames.length > 0) {
    parts.push(`bearing ${injuryNames.join(' and ')}`);
  }

  return parts.join(', ');
}
