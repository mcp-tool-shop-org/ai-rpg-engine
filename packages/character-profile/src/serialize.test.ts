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
