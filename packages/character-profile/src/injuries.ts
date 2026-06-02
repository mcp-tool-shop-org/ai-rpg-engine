// Injury management — sustain, heal, query

import type { CharacterProfile, Injury } from './types.js';
import { touch } from './profile.js';

/**
 * Derive the next deterministic injury id for a profile (CP-05 — no Date.now /
 * Math.random). Ids are `inj-N` where N is one past the highest existing suffix,
 * making them sequential, collision-free, and reproducible from profile state.
 */
function nextInjuryId(profile: CharacterProfile): string {
  let max = 0;
  for (const inj of profile.injuries) {
    const m = /^inj-(\d+)$/.exec(inj.id);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `inj-${max + 1}`;
}

/**
 * Add an injury to the profile. `id` is optional — when omitted, a deterministic
 * sequential id is derived from the profile's existing injuries (CP-05).
 */
export function addInjury(
  profile: CharacterProfile,
  injury: Omit<Injury, 'id' | 'healed' | 'healedAt'>,
  id?: string,
): CharacterProfile {
  const full: Injury = {
    ...injury,
    id: id ?? nextInjuryId(profile),
    healed: false,
  };
  return touch({
    ...profile,
    injuries: [...profile.injuries, full],
  });
}

/** Heal an injury by ID. */
export function healInjury(
  profile: CharacterProfile,
  injuryId: string,
): { profile: CharacterProfile; found: boolean } {
  const idx = profile.injuries.findIndex((i) => i.id === injuryId);
  if (idx === -1) return { profile, found: false };

  const updated = profile.injuries.map((i) =>
    i.id === injuryId
      ? { ...i, healed: true, healedAt: new Date().toISOString() }
      : i,
  );

  return {
    profile: touch({ ...profile, injuries: updated }),
    found: true,
  };
}

/** Get all active (unhealed) injuries. */
export function getActiveInjuries(profile: CharacterProfile): Injury[] {
  return profile.injuries.filter((i) => !i.healed);
}

/** Compute aggregate stat penalties from active injuries. */
export function computeInjuryPenalties(profile: CharacterProfile): {
  statPenalties: Record<string, number>;
  resourcePenalties: Record<string, number>;
  grantedTags: string[];
} {
  const statPenalties: Record<string, number> = {};
  const resourcePenalties: Record<string, number> = {};
  const tags: string[] = [];

  for (const injury of getActiveInjuries(profile)) {
    for (const [stat, value] of Object.entries(injury.statPenalties)) {
      statPenalties[stat] = (statPenalties[stat] ?? 0) + value;
    }
    for (const [res, value] of Object.entries(injury.resourcePenalties)) {
      resourcePenalties[res] = (resourcePenalties[res] ?? 0) + value;
    }
    tags.push(...injury.grantedTags);
  }

  return { statPenalties, resourcePenalties, grantedTags: [...new Set(tags)] };
}
