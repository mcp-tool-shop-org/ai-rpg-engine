import { describe, it, expect } from 'vitest';
import type { CharacterBuild } from '@ai-rpg-engine/character-creation';
import { createProfile, incrementTurns, setCustom, getProfileSummary } from './profile.js';
import { addInjury, healInjury } from './injuries.js';
import { serializeProfile } from './serialize.js';
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
    const build: CharacterBuild = {
      ...testBuild,
      traitIds: [...testBuild.traitIds],
      statAllocations: { vigor: 2 },
    };
    const profile = createProfile(build, stats, testResources, testTags, 'fantasy');
    stats.vigor = 99;
    build.traitIds.push('illegal');
    build.statAllocations!.vigor = 99;
    build.disciplineId = 'hijacked';
    expect(profile.stats.vigor).toBe(5);
    expect(profile.build).not.toBe(build);
    expect(profile.build.traitIds).toEqual(['iron-frame', 'cursed-blood']);
    expect(profile.build.statAllocations).toEqual({ vigor: 2 });
    expect(profile.build.disciplineId).toBe('occultist');
    // F-68f549c2: CharacterProfile is the persistence boundary — a caller
    // mutation of the input build must not land in serializeProfile.
    expect(serializeProfile(profile)).not.toContain('illegal');
  });

  // CP-05: persisted IDs must be deterministic (no Date.now / Math.random),
  // so the same inputs always yield the same id (reproducible saves).
  it('generates a reproducible id from the same inputs', () => {
    const a = createProfile(testBuild, testStats, testResources, testTags, 'fantasy');
    const b = createProfile(testBuild, testStats, testResources, testTags, 'fantasy');
    expect(a.id).toBe(b.id);
    expect(a.id).toBeTruthy();
  });

  it('stamps portraitRef from a stub PortraitOps inject (F-963fcb3a)', () => {
    const build = { ...testBuild, portraitRef: undefined };
    const profile = createProfile(build, testStats, testResources, testTags, 'fantasy', undefined, {
      ensure: () => 'hash-profile-001',
    });
    expect(profile.portraitRef).toBe('hash-profile-001');
    expect(profile.build.portraitRef).toBe('hash-profile-001');
    expect(build.portraitRef).toBeUndefined();
  });

  it('leaves portraitRef absent without an inject (F-963fcb3a)', () => {
    const build = { name: 'Beric', archetypeId: 'x', backgroundId: 'y', traitIds: [] };
    const profile = createProfile(build, testStats, testResources, testTags, 'fantasy');
    expect(profile.portraitRef).toBeUndefined();
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

  // F-586e744e: non-finite count used to poison totalTurns.
  it('skips a non-finite count rather than writing NaN', () => {
    const profile = createProfile(testBuild, testStats, testResources, testTags, 'fantasy');
    const updated = incrementTurns(profile, NaN);
    expect(updated.totalTurns).toBe(0);
    expect(Number.isFinite(updated.totalTurns)).toBe(true);
  });

  it('floors totalTurns at 0 on a large negative count', () => {
    const profile = incrementTurns(
      createProfile(testBuild, testStats, testResources, testTags, 'fantasy'),
      3,
    );
    const updated = incrementTurns(profile, -100);
    expect(updated.totalTurns).toBe(0);
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
  it('returns a display-ready summary with humanized ids', () => {
    const profile = createProfile(testBuild, testStats, testResources, testTags, 'fantasy');
    const summary = getProfileSummary(profile);
    expect(summary.name).toBe('Aldric');
    expect(summary.level).toBe(1);
    expect(summary.archetype).toBe('Penitent Knight');
    expect(summary.background).toBe('Oath Breaker');
    expect(summary.discipline).toBe('Occultist');
    expect(summary.activeInjuries).toEqual([]);
    expect(summary.milestoneCount).toBe(0);
    expect(summary.totalTurns).toBe(0);
  });

  it('prints active injury names and compact penalties (F-ca340f5d)', () => {
    const profile = createProfile(testBuild, testStats, testResources, testTags, 'fantasy');
    const wounded = addInjury(profile, {
      name: 'Broken Arm',
      description: 'Fractured in combat.',
      statPenalties: { vigor: -2 },
      resourcePenalties: {},
      grantedTags: ['injured'],
      sustainedAt: 'turn-10',
    });
    const summary = getProfileSummary(wounded);
    expect(summary.activeInjuries).toEqual(['Broken Arm (vigor -2)']);
  });

  it('omits healed injuries from the display list', () => {
    let profile = createProfile(testBuild, testStats, testResources, testTags, 'fantasy');
    profile = addInjury(profile, {
      name: 'Broken Arm',
      description: 'Fractured in combat.',
      statPenalties: { vigor: -2 },
      resourcePenalties: {},
      grantedTags: ['injured'],
      sustainedAt: 'turn-10',
    });
    const injuryId = profile.injuries[0]!.id;
    const healed = healInjury(profile, injuryId, 'turn-12').profile;
    expect(getProfileSummary(healed).activeInjuries).toEqual([]);
  });
});
