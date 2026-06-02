import { describe, it, expect } from 'vitest';
import type { CharacterBuild } from '@ai-rpg-engine/character-creation';
import { createProfile, incrementTurns, setCustom, getProfileSummary } from './profile.js';
import { PROFILE_VERSION } from './types.js';

const testBuild: CharacterBuild = {
  name: 'Aldric',
  archetypeId: 'penitent-knight',
  backgroundId: 'oath-breaker',
  traitIds: ['iron-frame', 'cursed-blood'],
  disciplineId: 'occultist',
  portraitRef: 'abc123',
};

const testStats = { vigor: 7, instinct: 4, will: 1 };
const testResources = { hp: 25, stamina: 8 };
const testTags = ['martial', 'oath-broken', 'curse-touched'];

describe('createProfile', () => {
  it('creates a profile with correct initial values', () => {
    const profile = createProfile(testBuild, testStats, testResources, testTags, 'fantasy');

    expect(profile.id).toBeTruthy();
    expect(profile.version).toBe(PROFILE_VERSION);
    expect(profile.build).toEqual(testBuild);
    expect(profile.stats).toEqual(testStats);
    expect(profile.resources).toEqual(testResources);
    expect(profile.tags).toEqual(testTags);
    expect(profile.packId).toBe('fantasy');
    expect(profile.portraitRef).toBe('abc123');
    expect(profile.totalTurns).toBe(0);
  });

  it('starts with empty loadout', () => {
    const profile = createProfile(testBuild, testStats, testResources, testTags, 'fantasy');
    expect(profile.loadout.equipped.weapon).toBeNull();
    expect(profile.loadout.inventory).toEqual([]);
  });

  it('starts at level 1 with 0 XP', () => {
    const profile = createProfile(testBuild, testStats, testResources, testTags, 'fantasy');
    expect(profile.progression.level).toBe(1);
    expect(profile.progression.xp).toBe(0);
    expect(profile.progression.archetypeRank).toBe(1);
    expect(profile.progression.disciplineRank).toBe(1);
  });

  it('sets discipline rank to 0 without discipline', () => {
    const build = { ...testBuild, disciplineId: undefined };
    const profile = createProfile(build, testStats, testResources, testTags, 'fantasy');
    expect(profile.progression.disciplineRank).toBe(0);
  });

  it('starts with empty injuries and milestones', () => {
    const profile = createProfile(testBuild, testStats, testResources, testTags, 'fantasy');
    expect(profile.injuries).toEqual([]);
    expect(profile.milestones).toEqual([]);
    expect(profile.reputation).toEqual([]);
  });

  it('does not share reference to input objects', () => {
    const stats = { vigor: 5 };
    const profile = createProfile(testBuild, stats, testResources, testTags, 'fantasy');
    stats.vigor = 99;
    expect(profile.stats.vigor).toBe(5);
  });

  // CP-05: persisted IDs must be deterministic (no Date.now / Math.random),
  // so the same inputs always yield the same id (reproducible saves).
  it('generates a reproducible id from the same inputs', () => {
    const a = createProfile(testBuild, testStats, testResources, testTags, 'fantasy');
    const b = createProfile(testBuild, testStats, testResources, testTags, 'fantasy');
    expect(a.id).toBe(b.id);
    expect(a.id).toBeTruthy();
  });

  it('honors a caller-supplied id', () => {
    const profile = createProfile(testBuild, testStats, testResources, testTags, 'fantasy', 'pc-aldric');
    expect(profile.id).toBe('pc-aldric');
  });

  it('derives different ids for materially different builds', () => {
    const a = createProfile(testBuild, testStats, testResources, testTags, 'fantasy');
    const other = { ...testBuild, name: 'Beric' };
    const b = createProfile(other, testStats, testResources, testTags, 'fantasy');
    expect(a.id).not.toBe(b.id);
  });
});

describe('incrementTurns', () => {
  it('increments turn count by 1', () => {
    const profile = createProfile(testBuild, testStats, testResources, testTags, 'fantasy');
    const updated = incrementTurns(profile);
    expect(updated.totalTurns).toBe(1);
  });

  it('increments by custom amount', () => {
    const profile = createProfile(testBuild, testStats, testResources, testTags, 'fantasy');
    const updated = incrementTurns(profile, 5);
    expect(updated.totalTurns).toBe(5);
  });
});

describe('setCustom', () => {
  it('sets a custom metadata value', () => {
    const profile = createProfile(testBuild, testStats, testResources, testTags, 'fantasy');
    const updated = setCustom(profile, 'campaign', 'chapel-threshold');
    expect(updated.custom.campaign).toBe('chapel-threshold');
  });
});

describe('getProfileSummary', () => {
  it('returns a summary object', () => {
    const profile = createProfile(testBuild, testStats, testResources, testTags, 'fantasy');
    const summary = getProfileSummary(profile);
    expect(summary.name).toBe('Aldric');
    expect(summary.level).toBe(1);
    expect(summary.archetype).toBe('penitent-knight');
    expect(summary.background).toBe('oath-breaker');
    expect(summary.discipline).toBe('occultist');
    expect(summary.activeInjuries).toBe(0);
    expect(summary.milestoneCount).toBe(0);
    expect(summary.totalTurns).toBe(0);
  });
});
