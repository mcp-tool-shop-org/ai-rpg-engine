// Profile creation and core operations

import type { CharacterBuild, PortraitOps } from '@ai-rpg-engine/character-creation';
import { createEmptyLoadout } from '@ai-rpg-engine/equipment';
import type { CharacterProfile, Injury } from './types.js';
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
 * `portraits` is an optional inject (F-963fcb3a): a sync `ensure(build)` string
 * is stamped onto portraitRef when the build has none. Omitted → today.
 */
export function createProfile(
  build: CharacterBuild,
  stats: Record<string, number>,
  resources: Record<string, number>,
  tags: string[],
  packId: string,
  id?: string,
  portraits?: PortraitOps,
): CharacterProfile {
  const now = new Date().toISOString();
  const isolated = structuredClone(build);
  if (!isolated.portraitRef && portraits) {
    const ensured = portraits.ensure(isolated);
    if (typeof ensured === 'string' && ensured.length > 0) isolated.portraitRef = ensured;
  }
  return {
    id: id ?? deriveProfileId(build, packId),
    version: PROFILE_VERSION,
    // F-68f549c2: isolate the nested build (traitIds, statAllocations,
    // disciplineId) the same way stats/resources/tags are copied. Assigning
    // `build` by identity let a caller push onto traitIds and persist it.
    build: isolated,
    stats: { ...stats },
    resources: { ...resources },
    tags: [...tags],
    loadout: createEmptyLoadout(),
    itemChronicle: {},
    progression: {
      xp: 0,
      level: 1,
      archetypeRank: 1,
      disciplineRank: isolated.disciplineId ? 1 : 0,
      traitEvolutions: [],
    },
    injuries: [],
    milestones: [],
    reputation: [],
    portraitRef: isolated.portraitRef,
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
  // F-586e744e: a non-finite count used to poison totalTurns (NaN + n = NaN;
  // Infinity persists and later stringify emits null). Skip the mutation
  // rather than coerce; floor a finite result at 0 like grantXp floors xp.
  if (!Number.isFinite(count) || !Number.isFinite(profile.totalTurns)) {
    return profile;
  }
  return touch({ ...profile, totalTurns: Math.max(0, profile.totalTurns + count) });
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

/**
 * Title-case a kebab/snake id the same way terminal-ui humanizeStateId does.
 * Ids already hyphenate the display names, so no catalog lookup is required.
 */
function humanizeId(id: string): string {
  const base = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  return base
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Compact print of an active injury, e.g. 'Broken Arm (vigor -2)'. */
function formatActiveInjury(injury: Injury): string {
  const parts: string[] = [];
  for (const [stat, amount] of Object.entries(injury.statPenalties)) {
    if (typeof amount !== 'number' || amount === 0) continue;
    parts.push(`${stat} ${amount}`);
  }
  return parts.length > 0 ? `${injury.name} (${parts.join(', ')})` : injury.name;
}

/** Get a summary of the profile for display. */
export function getProfileSummary(profile: CharacterProfile): {
  name: string;
  level: number;
  xp: number;
  archetype: string;
  background: string;
  discipline: string | undefined;
  activeInjuries: string[];
  milestoneCount: number;
  totalTurns: number;
} {
  return {
    name: profile.build.name,
    level: profile.progression.level,
    xp: profile.progression.xp,
    archetype: humanizeId(profile.build.archetypeId),
    background: humanizeId(profile.build.backgroundId),
    discipline: profile.build.disciplineId
      ? humanizeId(profile.build.disciplineId)
      : undefined,
    activeInjuries: profile.injuries.filter((i) => !i.healed).map(formatActiveInjury),
    milestoneCount: profile.milestones.length,
    totalTurns: profile.totalTurns,
  };
}
