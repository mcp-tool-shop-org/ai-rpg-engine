// XP, leveling, archetype ranks, discipline growth, and trait evolution

import type { CharacterProfile, TraitEvolution } from './types.js';
import { XP_THRESHOLDS, MAX_ARCHETYPE_RANK, MAX_DISCIPLINE_RANK } from './types.js';
import { touch } from './profile.js';

/** Compute the level for a given XP total. */
export function computeLevel(xp: number): number {
  let level = 1;
  for (let i = 1; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]!) {
      level = i + 1;
    } else {
      break;
    }
  }
  return level;
}

/** XP needed for the next level. Returns Infinity at max level. */
export function xpToNextLevel(xp: number): number {
  const level = computeLevel(xp);
  if (level >= XP_THRESHOLDS.length) return Infinity;
  return XP_THRESHOLDS[level]! - xp;
}

/** Grant XP and auto-level. Returns the updated profile and whether a level-up occurred. */
export function grantXp(
  profile: CharacterProfile,
  amount: number,
): { profile: CharacterProfile; leveledUp: boolean; newLevel: number } {
  const newXp = profile.progression.xp + amount;
  const newLevel = computeLevel(newXp);
  const leveledUp = newLevel > profile.progression.level;

  return {
    profile: touch({
      ...profile,
      progression: {
        ...profile.progression,
        xp: newXp,
        level: newLevel,
      },
    }),
    leveledUp,
    newLevel,
  };
}

/** Advance the archetype rank by 1, if below max. */
export function advanceArchetypeRank(
  profile: CharacterProfile,
): { profile: CharacterProfile; advanced: boolean } {
  const current = profile.progression.archetypeRank;
  if (current >= MAX_ARCHETYPE_RANK) {
    return { profile, advanced: false };
  }
  return {
    profile: touch({
      ...profile,
      progression: {
        ...profile.progression,
        archetypeRank: current + 1,
      },
    }),
    advanced: true,
  };
}

/** Advance the discipline rank by 1, if below max and discipline exists. */
export function advanceDisciplineRank(
  profile: CharacterProfile,
): { profile: CharacterProfile; advanced: boolean } {
  if (!profile.build.disciplineId) {
    return { profile, advanced: false };
  }
  const current = profile.progression.disciplineRank;
  if (current >= MAX_DISCIPLINE_RANK) {
    return { profile, advanced: false };
  }
  return {
    profile: touch({
      ...profile,
      progression: {
        ...profile.progression,
        disciplineRank: current + 1,
      },
    }),
    advanced: true,
  };
}

/** Record a trait evolution. */
export function evolveTrait(
  profile: CharacterProfile,
  originalTraitId: string,
  evolvedTraitId: string,
  at: string,
): CharacterProfile {
  const evolution: TraitEvolution = {
    originalTraitId,
    evolvedTraitId,
    evolvedAt: at,
  };
  return touch({
    ...profile,
    progression: {
      ...profile.progression,
      traitEvolutions: [...profile.progression.traitEvolutions, evolution],
    },
  });
}
