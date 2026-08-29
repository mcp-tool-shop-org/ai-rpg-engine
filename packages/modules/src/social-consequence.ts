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
  /**
   * @deprecated Price multiplier: < 1 = discount, > 1 = markup. Not the live
   * reputation→price mapping — trade-core.ts's 'sell' verb prices items
   * through trade-value.ts's computeItemValue (specifically its
   * computeFactionAttitudeMultiplier(playerReputation) term), which reads the
   * SAME merged reputation (authored faction baseline + accrued
   * reputation_<factionId> global) but applies its own band curve, informed
   * by district economy/scarcity/provenance/pressure the way THIS field never
   * was. This field predates that write-wire (F-4684385c) and has no
   * production caller today; kept for back-compat with any existing caller
   * that still reads it, and because accessLevel/dialogueBias below (which
   * DO have no live replacement yet — see their own note) are computed in the
   * same band cascade.
   */
  priceModifier: number;
  /**
   * Access level granted by the faction. Derived from the reputation band
   * unless a stored `access.<factionId>` override is passed in (F-cd5a8eec —
   * applyLeverageEffects persists negotiate-access / call-in-favor here).
   * getFactionAccess is the helper that prefers the stored mark.
   */
  accessLevel: 'denied' | 'restricted' | 'normal' | 'privileged';
  /**
   * One-liner for prompt injection describing faction attitude. No production
   * caller yet (F-4684385c) — reserved for a future dialogue consumer
   * (targeted v3.0), same status as accessLevel above.
   */
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
 * Map a reputation value to mechanical consequences. See
 * {@link ReputationConsequence.priceModifier} — deprecated (F-4684385c),
 * trade-value.ts's computeItemValue is the live reputation→price mapping.
 * accessLevel is the derived band unless `storedAccess` is supplied — a
 * persisted override (player-leverage.ts's `access.<factionId>` sink) wins
 * over the reputation curve, because negotiate-access / call-in-favor
 * announce a door opening that reputation alone has not earned yet.
 */
export function getReputationConsequence(
  reputationValue: number,
  storedAccess?: ReputationConsequence['accessLevel'],
): ReputationConsequence {
  let result: ReputationConsequence;
  if (reputationValue <= -60) {
    result = { priceModifier: 1.5, accessLevel: 'denied', dialogueBias: 'This one is not welcome here.' };
  } else if (reputationValue <= -20) {
    result = { priceModifier: 1.3, accessLevel: 'restricted', dialogueBias: 'Watch this one carefully.' };
  } else if (reputationValue >= 60) {
    result = { priceModifier: 0.7, accessLevel: 'privileged', dialogueBias: 'We are honored by your presence.' };
  } else if (reputationValue >= 20) {
    result = { priceModifier: 0.9, accessLevel: 'normal', dialogueBias: 'A friend of the faction.' };
  } else {
    result = { priceModifier: 1.0, accessLevel: 'normal', dialogueBias: '' };
  }
  if (storedAccess) return { ...result, accessLevel: storedAccess };
  return result;
}

/**
 * Prefer a persisted access mark over the reputation-derived band.
 * `storedAccess` is the `access.<factionId>` custom value applyLeverageEffects
 * writes; omit it to read the derived band alone.
 */
export function getFactionAccess(
  reputationValue: number,
  storedAccess?: ReputationConsequence['accessLevel'],
): ReputationConsequence['accessLevel'] {
  return getReputationConsequence(reputationValue, storedAccess).accessLevel;
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
