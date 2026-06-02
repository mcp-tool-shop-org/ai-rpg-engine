import { describe, it, expect } from 'vitest';
import type { CharacterBuild } from '@ai-rpg-engine/character-creation';
import { createProfile } from './profile.js';
import {
  serializeProfile,
  deserializeProfile,
  validateSerializedProfile,
} from './serialize.js';

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

describe('serializeProfile', () => {
  it('produces valid JSON', () => {
    const profile = makeProfile();
    const json = serializeProfile(profile);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe('deserializeProfile', () => {
  it('round-trips a profile', () => {
    const profile = makeProfile();
    const json = serializeProfile(profile);
    const result = deserializeProfile(json);
    expect(result.errors).toEqual([]);
    expect(result.profile).not.toBeNull();
    expect(result.profile!.id).toBe(profile.id);
    expect(result.profile!.build.name).toBe('Aldric');
    expect(result.profile!.stats.vigor).toBe(6);
  });

  it('rejects invalid JSON', () => {
    const result = deserializeProfile('not json');
    expect(result.profile).toBeNull();
    expect(result.errors).toContain('Invalid JSON');
  });

  it('rejects non-object', () => {
    const result = deserializeProfile('"hello"');
    expect(result.profile).toBeNull();
    expect(result.errors).toContain('Expected an object');
  });

  it('rejects missing required fields', () => {
    const result = deserializeProfile('{}');
    expect(result.profile).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects future version', () => {
    const profile = makeProfile();
    const json = serializeProfile(profile);
    const obj = JSON.parse(json);
    obj.version = 999;
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.profile).toBeNull();
    expect(result.errors[0]).toContain('newer than supported');
  });
});

describe('deserializeProfile — required scalar/object field validation (CP-04)', () => {
  it('rejects a profile missing totalTurns', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    delete obj.totalTurns;
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.includes('totalTurns'))).toBe(true);
  });

  it('rejects a profile where totalTurns is the wrong type', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    obj.totalTurns = 'twelve';
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.includes('totalTurns'))).toBe(true);
  });

  it('rejects a profile missing custom', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    delete obj.custom;
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.includes('custom'))).toBe(true);
  });

  it('rejects a profile where custom is an array (not an object)', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    obj.custom = ['not', 'an', 'object'];
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.includes('custom'))).toBe(true);
  });

  it('still accepts a fully-valid profile', () => {
    const result = deserializeProfile(serializeProfile(makeProfile()));
    expect(result.errors).toEqual([]);
    expect(result.profile).not.toBeNull();
  });
});

describe('deserializeProfile — progression substructure validation (CP-03)', () => {
  it('rejects progression with a non-numeric xp', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    obj.progression.xp = 'lots';
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.toLowerCase().includes('progression'))).toBe(true);
  });

  it('rejects progression missing level', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    delete obj.progression.level;
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.toLowerCase().includes('progression'))).toBe(true);
  });

  it('rejects progression missing archetypeRank', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    delete obj.progression.archetypeRank;
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.toLowerCase().includes('progression'))).toBe(true);
  });

  it('rejects progression missing disciplineRank', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    delete obj.progression.disciplineRank;
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.toLowerCase().includes('progression'))).toBe(true);
  });

  it('repairs a v1 progression missing traitEvolutions instead of crashing', () => {
    // A legacy save (version 1) with valid numeric fields but no traitEvolutions
    // array should be repaired to an empty array, not rejected.
    const obj = JSON.parse(serializeProfile(makeProfile()));
    obj.version = 1;
    delete obj.progression.traitEvolutions;
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.errors).toEqual([]);
    expect(result.profile).not.toBeNull();
    expect(result.profile!.progression.traitEvolutions).toEqual([]);
  });

  it('rejects traitEvolutions that is present but not an array', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    obj.progression.traitEvolutions = { bogus: true };
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.toLowerCase().includes('progression'))).toBe(true);
  });
});

describe('validateSerializedProfile', () => {
  it('returns ok for valid profile', () => {
    const profile = makeProfile();
    const json = serializeProfile(profile);
    const result = validateSerializedProfile(json);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns errors for invalid', () => {
    const result = validateSerializedProfile('{}');
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
