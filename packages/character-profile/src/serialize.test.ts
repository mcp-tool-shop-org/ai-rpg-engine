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

// core-spine F-08afa14a: the required-object checks for build/stats/resources/
// loadout/progression used `typeof obj[field] !== 'object' || obj[field] === null`,
// which accepts arrays because `typeof [] === 'object'` in JS. A `progression`
// array in particular silently produces NaN-poisoned XP/level once
// grantXp/computeLevel read profile.progression.xp/.level off the array
// (`undefined + amount` = NaN) — the same "corrupt input loads clean, then
// produces a sticky NaN with no signal" failure class the CP-03/CP-04 guards
// above exist to eliminate, just unguarded for the array case specifically.
// itemChronicle had NO shape validation at all when present (only ever
// defaulted when absent).
describe('deserializeProfile — rejects arrays for object-shaped fields (F-08afa14a)', () => {
  it('rejects a profile where build is an array', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    obj.build = ['not', 'an', 'object'];
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.includes('build'))).toBe(true);
  });

  it('rejects a profile where stats is an array', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    obj.stats = [1, 2, 3];
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.includes('stats'))).toBe(true);
  });

  it('rejects a profile where resources is an array', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    obj.resources = [];
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.includes('resources'))).toBe(true);
  });

  it('rejects a profile where loadout is an array', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    obj.loadout = [];
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.includes('loadout'))).toBe(true);
  });

  it('rejects a profile where progression is an array (the NaN-poisoning shape)', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    obj.progression = [0, 1, 0, 0];
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.toLowerCase().includes('progression'))).toBe(true);
  });
});

describe('deserializeProfile — itemChronicle shape validation (F-08afa14a)', () => {
  it('accepts a profile with itemChronicle absent (migrated/defaulted to {})', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    delete obj.itemChronicle;
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.errors).toEqual([]);
    expect(result.profile).not.toBeNull();
    expect(result.profile!.itemChronicle).toEqual({});
  });

  it('accepts a profile with a well-formed itemChronicle', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    obj.itemChronicle = {
      'sword-001': [{ event: 'acquired', tick: 3, detail: 'Looted from Bone Collector' }],
    };
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.errors).toEqual([]);
    expect(result.profile).not.toBeNull();
  });

  it('rejects itemChronicle that is an array instead of a record', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    obj.itemChronicle = ['not', 'a', 'record'];
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.toLowerCase().includes('itemchronicle'))).toBe(true);
  });

  it('rejects itemChronicle that is a string', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    obj.itemChronicle = 'bogus';
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.toLowerCase().includes('itemchronicle'))).toBe(true);
  });

  it('rejects an itemChronicle whose per-item value is not an array', () => {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    obj.itemChronicle = { 'sword-001': { event: 'acquired', tick: 3, detail: 'not wrapped in an array' } };
    const result = deserializeProfile(JSON.stringify(obj));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.toLowerCase().includes('itemchronicle'))).toBe(true);
  });
});

// core-spine F-08afa14a re-report: Stage A's per-key `Array.isArray` check
// rejects a NON-ARRAY chronicle value but never validates the ELEMENTS of an
// otherwise-valid array. Reproduced: `itemChronicle: { "sword-1": [null] }`
// passed deserializeProfile with errors: [] — then the first call to
// evaluateRelicGrowth raw-threw `TypeError: Cannot read properties of null
// (reading 'event')` inside countByEvent/getAge, which every default trigger
// type calls unconditionally. Subtler sibling: an entry that IS an object but
// has a missing/wrong-typed `tick` doesn't crash at all — getAge()'s
// `currentTick - acquired.tick` silently yields NaN, so every age threshold
// (`NaN >= 100`) is false forever: an item that should earn "Old X" epithets
// simply never does, with zero signal — the exact sticky-NaN failure class
// the CP-03 progression guards were built to eliminate.
describe('deserializeProfile — itemChronicle ELEMENT shape validation (F-08afa14a re-report)', () => {
  function withChronicle(entries: unknown): string {
    const obj = JSON.parse(serializeProfile(makeProfile()));
    obj.itemChronicle = { 'sword-1': entries };
    return JSON.stringify(obj);
  }

  it('rejects the reproduced [null] entry that raw-threw inside evaluateRelicGrowth', () => {
    const result = deserializeProfile(withChronicle([null]));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.includes('itemChronicle.sword-1[0]'))).toBe(true);
  });

  it('rejects an entry that is an array (typeof [] === "object" must not slip through)', () => {
    const result = deserializeProfile(withChronicle([['acquired', 3, 'nested']]));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.includes('itemChronicle.sword-1[0]'))).toBe(true);
  });

  it('rejects an entry whose event is not one of the known chronicle events', () => {
    const result = deserializeProfile(
      withChronicle([{ event: 'obliterated', tick: 3, detail: 'no such event' }]),
    );
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.includes('itemChronicle.sword-1[0].event'))).toBe(true);
  });

  it('rejects an entry with a missing tick (the silent NaN-age path)', () => {
    const result = deserializeProfile(
      withChronicle([{ event: 'acquired', detail: 'no tick at all' }]),
    );
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.includes('itemChronicle.sword-1[0].tick'))).toBe(true);
  });

  it('rejects an entry with a non-numeric tick', () => {
    const result = deserializeProfile(
      withChronicle([{ event: 'acquired', tick: 'yesterday', detail: 'string tick' }]),
    );
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.includes('itemChronicle.sword-1[0].tick'))).toBe(true);
  });

  it('rejects an entry with a missing detail', () => {
    const result = deserializeProfile(withChronicle([{ event: 'acquired', tick: 3 }]));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.includes('itemChronicle.sword-1[0].detail'))).toBe(true);
  });

  it('rejects an entry with an empty-string detail', () => {
    const result = deserializeProfile(withChronicle([{ event: 'acquired', tick: 3, detail: '' }]));
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.includes('itemChronicle.sword-1[0].detail'))).toBe(true);
  });

  it('rejects an entry with a non-string zoneId', () => {
    const result = deserializeProfile(
      withChronicle([{ event: 'acquired', tick: 3, detail: 'Found', zoneId: 7 }]),
    );
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.includes('itemChronicle.sword-1[0].zoneId'))).toBe(true);
  });

  it('names the exact element index when a later entry is the malformed one', () => {
    const result = deserializeProfile(
      withChronicle([
        { event: 'acquired', tick: 1, detail: 'Looted from Bone Collector' },
        { event: 'used-in-kill', tick: 'NaN-factory', detail: 'Struck down a boss' },
      ]),
    );
    expect(result.profile).toBeNull();
    expect(result.errors.some((e) => e.includes('itemChronicle.sword-1[1].tick'))).toBe(true);
    // The well-formed sibling entry produced no error of its own.
    expect(result.errors.some((e) => e.includes('itemChronicle.sword-1[0]'))).toBe(false);
  });

  it('accepts well-formed entries across all seven event kinds, with optional zoneId', () => {
    const events = ['acquired', 'lost', 'used-in-kill', 'recognized', 'transformed', 'cursed', 'blessed'];
    const result = deserializeProfile(
      withChronicle(events.map((event, i) => ({
        event, tick: i, detail: `Chronicle entry ${i}`, ...(i % 2 === 0 ? { zoneId: 'crypt' } : {}),
      }))),
    );
    expect(result.errors).toEqual([]);
    expect(result.profile).not.toBeNull();
    expect(result.profile!.itemChronicle['sword-1']).toHaveLength(7);
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
