// Profile creation and core operations

import type { CharacterBuild } from '@ai-rpg-engine/character-creation';
import { createEmptyLoadout } from '@ai-rpg-engine/equipment';
import type { CharacterProfile } from './types.js';
import { PROFILE_VERSION } from './types.js';

/**
 * Deterministic 32-bit FNV-1a hash → base36. Used to derive a stable profile id
 * from the build inputs so the same character always serializes to the same id
 * (CP-05 — no Date.now / Math.random in persisted state).
 */
function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Derive a deterministic profile id from the identifying build fields. */
function deriveProfileId(build: CharacterBuild, packId: string): string {
  const seed = [
    packId,
    build.name,
    build.archetypeId,
    build.backgroundId,
    build.disciplineId ?? '',
    [...build.traitIds].join(','),
  ].join('|');
  return `pc-${hashString(seed)}`;
}

/**
 * Create a fresh profile from a character build and resolved stats/resources/tags.
 * `id` is optional — when omitted, a deterministic id is derived from the build so
 * the same inputs always yield the same id (CP-05).
 */
export function createProfile(
  build: CharacterBuild,
  stats: Record<string, number>,
  resources: Record<string, number>,
  tags: string[],
  packId: string,
  id?: string,
): CharacterProfile {
  const now = new Date().toISOString();
  return {
    id: id ?? deriveProfileId(build, packId),
    version: PROFILE_VERSION,
    build,
    stats: { ...stats },
    resources: { ...resources },
    tags: [...tags],
    loadout: createEmptyLoadout(),
    itemChronicle: {},
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
