// Injury management — sustain, heal, query

import type { CharacterProfile, Injury } from './types.js';
import { touch } from './profile.js';

/** Generate a simple injury ID. */
function injuryId(): string {
  return `inj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Add an injury to the profile. */
export function addInjury(
  profile: CharacterProfile,
  injury: Omit<Injury, 'id' | 'healed' | 'healedAt'>,
): CharacterProfile {
  const full: Injury = {
    ...injury,
    id: injuryId(),
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
