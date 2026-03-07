import { describe, it, expect } from 'vitest';
import type { CharacterBuild } from '@ai-rpg-engine/character-creation';
import { createProfile } from './profile.js';
import {
  computeLevel,
  xpToNextLevel,
  grantXp,
  advanceArchetypeRank,
  advanceDisciplineRank,
  evolveTrait,
} from './progression.js';

const testBuild: CharacterBuild = {
  name: 'Aldric',
  archetypeId: 'penitent-knight',
  backgroundId: 'oath-breaker',
  traitIds: ['iron-frame'],
  disciplineId: 'occultist',
};

function makeProfile() {
  return createProfile(testBuild, { vigor: 6 }, { hp: 20 }, ['martial'], 'fantasy');
}

describe('computeLevel', () => {
  it('returns 1 for 0 XP', () => {
    expect(computeLevel(0)).toBe(1);
  });

  it('returns 2 at 100 XP', () => {
    expect(computeLevel(100)).toBe(2);
  });

  it('returns 2 at 249 XP', () => {
    expect(computeLevel(249)).toBe(2);
  });

  it('returns 3 at 250 XP', () => {
    expect(computeLevel(250)).toBe(3);
  });

  it('returns 10 at 16000 XP', () => {
    expect(computeLevel(16000)).toBe(10);
  });

  it('returns 10 for XP beyond max', () => {
    expect(computeLevel(999999)).toBe(10);
  });
});

describe('xpToNextLevel', () => {
  it('returns 100 for 0 XP', () => {
    expect(xpToNextLevel(0)).toBe(100);
  });

  it('returns 150 for 100 XP (level 2→3)', () => {
    expect(xpToNextLevel(100)).toBe(150);
  });

  it('returns Infinity at max level', () => {
    expect(xpToNextLevel(16000)).toBe(Infinity);
  });
});

describe('grantXp', () => {
  it('adds XP without leveling', () => {
    const profile = makeProfile();
    const result = grantXp(profile, 50);
    expect(result.profile.progression.xp).toBe(50);
    expect(result.leveledUp).toBe(false);
    expect(result.newLevel).toBe(1);
  });

  it('levels up at threshold', () => {
    const profile = makeProfile();
    const result = grantXp(profile, 100);
    expect(result.profile.progression.xp).toBe(100);
    expect(result.leveledUp).toBe(true);
    expect(result.newLevel).toBe(2);
  });

  it('can skip levels with large XP', () => {
    const profile = makeProfile();
    const result = grantXp(profile, 500);
    expect(result.newLevel).toBe(4);
    expect(result.leveledUp).toBe(true);
  });
});

describe('advanceArchetypeRank', () => {
  it('advances from rank 1 to 2', () => {
    const profile = makeProfile();
    const result = advanceArchetypeRank(profile);
    expect(result.advanced).toBe(true);
    expect(result.profile.progression.archetypeRank).toBe(2);
  });

  it('caps at max rank', () => {
    let profile = makeProfile();
    // Advance to max
    for (let i = 0; i < 4; i++) {
      profile = advanceArchetypeRank(profile).profile;
    }
    expect(profile.progression.archetypeRank).toBe(5);
    const result = advanceArchetypeRank(profile);
    expect(result.advanced).toBe(false);
    expect(result.profile.progression.archetypeRank).toBe(5);
  });
});

describe('advanceDisciplineRank', () => {
  it('advances when discipline exists', () => {
    const profile = makeProfile();
    const result = advanceDisciplineRank(profile);
    expect(result.advanced).toBe(true);
    expect(result.profile.progression.disciplineRank).toBe(2);
  });

  it('does nothing without discipline', () => {
    const build = { ...testBuild, disciplineId: undefined };
    const profile = createProfile(build, { vigor: 6 }, { hp: 20 }, [], 'fantasy');
    const result = advanceDisciplineRank(profile);
    expect(result.advanced).toBe(false);
  });

  it('caps at max rank', () => {
    let profile = makeProfile();
    for (let i = 0; i < 2; i++) {
      profile = advanceDisciplineRank(profile).profile;
    }
    expect(profile.progression.disciplineRank).toBe(3);
    const result = advanceDisciplineRank(profile);
    expect(result.advanced).toBe(false);
  });
});

describe('evolveTrait', () => {
  it('records trait evolution', () => {
    const profile = makeProfile();
    const updated = evolveTrait(profile, 'iron-frame', 'adamantine-frame', 'turn-50');
    expect(updated.progression.traitEvolutions).toHaveLength(1);
    expect(updated.progression.traitEvolutions[0]!.originalTraitId).toBe('iron-frame');
    expect(updated.progression.traitEvolutions[0]!.evolvedTraitId).toBe('adamantine-frame');
    expect(updated.progression.traitEvolutions[0]!.evolvedAt).toBe('turn-50');
  });
});
