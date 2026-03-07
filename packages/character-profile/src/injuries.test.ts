import { describe, it, expect } from 'vitest';
import type { CharacterBuild } from '@ai-rpg-engine/character-creation';
import { createProfile } from './profile.js';
import {
  addInjury,
  healInjury,
  getActiveInjuries,
  computeInjuryPenalties,
} from './injuries.js';

const testBuild: CharacterBuild = {
  name: 'Aldric',
  archetypeId: 'penitent-knight',
  backgroundId: 'oath-breaker',
  traitIds: [],
};

function makeProfile() {
  return createProfile(testBuild, { vigor: 6 }, { hp: 20 }, [], 'fantasy');
}

describe('addInjury', () => {
  it('adds an injury', () => {
    const profile = makeProfile();
    const updated = addInjury(profile, {
      name: 'Broken Arm',
      description: 'Fractured in combat.',
      statPenalties: { vigor: -2 },
      resourcePenalties: {},
      grantedTags: ['injured'],
      sustainedAt: 'turn-10',
    });
    expect(updated.injuries).toHaveLength(1);
    expect(updated.injuries[0]!.name).toBe('Broken Arm');
    expect(updated.injuries[0]!.healed).toBe(false);
    expect(updated.injuries[0]!.id).toBeTruthy();
  });

  it('preserves existing injuries', () => {
    let profile = makeProfile();
    profile = addInjury(profile, {
      name: 'Cut',
      description: 'A shallow wound.',
      statPenalties: {},
      resourcePenalties: {},
      grantedTags: [],
      sustainedAt: 'turn-5',
    });
    profile = addInjury(profile, {
      name: 'Burn',
      description: 'A flame burn.',
      statPenalties: {},
      resourcePenalties: {},
      grantedTags: ['burned'],
      sustainedAt: 'turn-8',
    });
    expect(profile.injuries).toHaveLength(2);
  });
});

describe('healInjury', () => {
  it('heals an injury by ID', () => {
    let profile = makeProfile();
    profile = addInjury(profile, {
      name: 'Broken Arm',
      description: 'Fractured.',
      statPenalties: { vigor: -2 },
      resourcePenalties: {},
      grantedTags: ['injured'],
      sustainedAt: 'turn-10',
    });
    const injuryId = profile.injuries[0]!.id;
    const result = healInjury(profile, injuryId);
    expect(result.found).toBe(true);
    expect(result.profile.injuries[0]!.healed).toBe(true);
    expect(result.profile.injuries[0]!.healedAt).toBeTruthy();
  });

  it('returns false for unknown injury', () => {
    const profile = makeProfile();
    const result = healInjury(profile, 'nonexistent');
    expect(result.found).toBe(false);
  });
});

describe('getActiveInjuries', () => {
  it('filters healed injuries', () => {
    let profile = makeProfile();
    profile = addInjury(profile, {
      name: 'Cut',
      description: 'Shallow.',
      statPenalties: {},
      resourcePenalties: {},
      grantedTags: [],
      sustainedAt: 'turn-5',
    });
    profile = addInjury(profile, {
      name: 'Burn',
      description: 'Flame.',
      statPenalties: {},
      resourcePenalties: {},
      grantedTags: [],
      sustainedAt: 'turn-8',
    });
    const cutId = profile.injuries[0]!.id;
    profile = healInjury(profile, cutId).profile;

    const active = getActiveInjuries(profile);
    expect(active).toHaveLength(1);
    expect(active[0]!.name).toBe('Burn');
  });
});

describe('computeInjuryPenalties', () => {
  it('sums penalties from active injuries', () => {
    let profile = makeProfile();
    profile = addInjury(profile, {
      name: 'Broken Arm',
      description: 'Fracture.',
      statPenalties: { vigor: -2 },
      resourcePenalties: { hp: -5 },
      grantedTags: ['injured'],
      sustainedAt: 'turn-10',
    });
    profile = addInjury(profile, {
      name: 'Concussion',
      description: 'Head trauma.',
      statPenalties: { vigor: -1, instinct: -2 },
      resourcePenalties: {},
      grantedTags: ['dazed'],
      sustainedAt: 'turn-12',
    });

    const penalties = computeInjuryPenalties(profile);
    expect(penalties.statPenalties.vigor).toBe(-3);
    expect(penalties.statPenalties.instinct).toBe(-2);
    expect(penalties.resourcePenalties.hp).toBe(-5);
    expect(penalties.grantedTags).toContain('injured');
    expect(penalties.grantedTags).toContain('dazed');
  });

  it('ignores healed injuries', () => {
    let profile = makeProfile();
    profile = addInjury(profile, {
      name: 'Cut',
      description: 'Shallow.',
      statPenalties: { vigor: -1 },
      resourcePenalties: {},
      grantedTags: ['bleeding'],
      sustainedAt: 'turn-5',
    });
    const cutId = profile.injuries[0]!.id;
    profile = healInjury(profile, cutId).profile;

    const penalties = computeInjuryPenalties(profile);
    expect(penalties.statPenalties).toEqual({});
    expect(penalties.grantedTags).toEqual([]);
  });

  it('returns empty for no injuries', () => {
    const profile = makeProfile();
    const penalties = computeInjuryPenalties(profile);
    expect(penalties.statPenalties).toEqual({});
    expect(penalties.resourcePenalties).toEqual({});
    expect(penalties.grantedTags).toEqual([]);
  });
});
