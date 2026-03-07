// Profile creation and core operations

import type { CharacterBuild } from '@ai-rpg-engine/character-creation';
import { createEmptyLoadout } from '@ai-rpg-engine/equipment';
import type { CharacterProfile } from './types.js';
import { PROFILE_VERSION } from './types.js';

/** Generate a simple unique ID. */
function generateId(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${time}-${rand}`;
}

/** Create a fresh profile from a character build and resolved stats/resources/tags. */
export function createProfile(
  build: CharacterBuild,
  stats: Record<string, number>,
  resources: Record<string, number>,
  tags: string[],
  packId: string,
): CharacterProfile {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    version: PROFILE_VERSION,
    build,
    stats: { ...stats },
    resources: { ...resources },
    tags: [...tags],
    loadout: createEmptyLoadout(),
    progression: {
      xp: 0,
      level: 1,
      archetypeRank: 1,
      disciplineRank: build.disciplineId ? 1 : 0,
      traitEvolutions: [],
    },
    injuries: [],
    milestones: [],
    reputation: [],
    portraitRef: build.portraitRef,
    packId,
    createdAt: now,
    updatedAt: now,
    totalTurns: 0,
    custom: {},
  };
}

/** Update the timestamp on a profile. Returns a new profile. */
export function touch(profile: CharacterProfile): CharacterProfile {
  return { ...profile, updatedAt: new Date().toISOString() };
}

/** Increment the turn counter. */
export function incrementTurns(profile: CharacterProfile, count = 1): CharacterProfile {
  return touch({ ...profile, totalTurns: profile.totalTurns + count });
}

/** Set a custom metadata value. */
export function setCustom(
  profile: CharacterProfile,
  key: string,
  value: string | number | boolean,
): CharacterProfile {
  return touch({
    ...profile,
    custom: { ...profile.custom, [key]: value },
  });
}

/** Get a summary of the profile for display. */
export function getProfileSummary(profile: CharacterProfile): {
  name: string;
  level: number;
  xp: number;
  archetype: string;
  background: string;
  discipline: string | undefined;
  activeInjuries: number;
  milestoneCount: number;
  totalTurns: number;
} {
  return {
    name: profile.build.name,
    level: profile.progression.level,
    xp: profile.progression.xp,
    archetype: profile.build.archetypeId,
    background: profile.build.backgroundId,
    discipline: profile.build.disciplineId,
    activeInjuries: profile.injuries.filter((i) => !i.healed).length,
    milestoneCount: profile.milestones.length,
    totalTurns: profile.totalTurns,
  };
}
