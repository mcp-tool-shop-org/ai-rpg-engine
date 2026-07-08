// Unit tests — YAML-ish parser and room validation pipeline

import { describe, it, expect } from 'vitest';
import {
  parseYamlish,
  validateGeneratedRoom,
  validateFactionDefinition,
  validateDistrictDefinition,
  validateGeneratedFaction,
  validateGeneratedDistrict,
  validateGeneratedLocationPack,
  validateGeneratedEncounterPack,
} from './validators.js';

describe('parseYamlish', () => {
  it('parses flat key-value YAML', () => {
    const result = parseYamlish('id: chapel\nname: Ruined Chapel') as Record<string, unknown>;
    expect(result['id']).toBe('chapel');
    expect(result['name']).toBe('Ruined Chapel');
  });

  it('coerces numbers and booleans', () => {
    const result = parseYamlish('light: 0.5\nactive: true\ncount: 3') as Record<string, unknown>;
    expect(result['light']).toBe(0.5);
    expect(result['active']).toBe(true);
    expect(result['count']).toBe(3);
  });

  it('falls back to JSON parse', () => {
    const result = parseYamlish('{"id": "chapel"}') as Record<string, unknown>;
    expect(result['id']).toBe('chapel');
  });

  it('returns empty object for garbage input', () => {
    const result = parseYamlish('☃☃☃');
    expect(result).toBeDefined();
  });

  it('parses arrays of scalars under a key', () => {
    const result = parseYamlish('tags:\n  - dark\n  - undead\nid: crypt') as Record<string, unknown>;
    expect(result['tags']).toEqual(['dark', 'undead']);
    expect(result['id']).toBe('crypt');
  });

  // v2.5 audit PA-4 — the parser was flat-only, so nested shapes (room zones,
  // pack sections, baseMetrics) could never reach their schema validators
  // unless the model emitted JSON. Block-style nesting must now round-trip.
  describe('nested structures (PA-4)', () => {
    it('parses a nested map', () => {
      const result = parseYamlish([
        'id: market',
        'baseMetrics:',
        '  alertPressure: 20',
        '  stability: 0.8',
      ].join('\n')) as Record<string, unknown>;
      expect(result['baseMetrics']).toEqual({ alertPressure: 20, stability: 0.8 });
    });

    it('parses an array of maps (room zones)', () => {
      const result = parseYamlish([
        'id: chapel',
        'name: Ruined Chapel',
        'zones:',
        '  - id: nave',
        '    name: Nave',
        '    light: 0.3',
        '  - id: crypt',
        '    name: Crypt',
      ].join('\n')) as Record<string, unknown>;
      expect(result['zones']).toEqual([
        { id: 'nave', name: 'Nave', light: 0.3 },
        { id: 'crypt', name: 'Crypt' },
      ]);
    });

    it('parses nested arrays inside array items', () => {
      const result = parseYamlish([
        'rooms:',
        '  - id: tavern',
        '    name: Tavern',
        '    zones:',
        '      - id: bar',
        '        name: Bar',
        '        tags:',
        '          - social',
      ].join('\n')) as Record<string, unknown>;
      const rooms = result['rooms'] as Array<Record<string, unknown>>;
      expect(rooms).toHaveLength(1);
      const zones = rooms[0]['zones'] as Array<Record<string, unknown>>;
      expect(zones[0]['id']).toBe('bar');
      expect(zones[0]['tags']).toEqual(['social']);
    });

    it('parses sequence items at the same indent as their key', () => {
      const result = parseYamlish('tags:\n- a\n- b\nid: x') as Record<string, unknown>;
      expect(result['tags']).toEqual(['a', 'b']);
      expect(result['id']).toBe('x');
    });

    it('skips blank lines and full-line comments', () => {
      const result = parseYamlish('# generated draft\n\nid: chapel\n\n# trailing note\nname: Chapel') as Record<string, unknown>;
      expect(result['id']).toBe('chapel');
      expect(result['name']).toBe('Chapel');
    });

    it('keeps colons inside scalar values intact', () => {
      const result = parseYamlish('name: The Bay: Docks') as Record<string, unknown>;
      expect(result['name']).toBe('The Bay: Docks');
    });
  });
});

describe('validateGeneratedRoom', () => {
  it('reports errors for incomplete room', () => {
    const result = validateGeneratedRoom('id: test', { id: 'test' });
    expect(result.valid).toBe(false);
    expect(result.validation.errors.length).toBeGreaterThan(0);
  });

  it('preserves raw output', () => {
    const raw = 'id: test\nname: Test';
    const result = validateGeneratedRoom(raw, { id: 'test', name: 'Test' });
    expect(result.raw).toBe(raw);
  });

  it('accepts a real nested room parsed from YAML text (PA-4 parser + schema together)', () => {
    const yaml = [
      'id: ruined_chapel',
      'name: Ruined Chapel',
      'zones:',
      '  - id: nave',
      '    name: Nave',
      '  - id: crypt',
      '    name: Crypt',
    ].join('\n');
    const result = validateGeneratedRoom(yaml, parseYamlish(yaml));
    expect(result.validation.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

// v2.5 audit PA-4 — faction/district/pack generators previously ran NO schema
// validation ("validated at load" only, and no faction/district validator even
// existed). These validators make generation-time checking real.
describe('validateFactionDefinition (PA-4)', () => {
  const validFaction = {
    id: 'dock_rats',
    name: 'The Dock Rats',
    members: ['rat_boss', 'rat_lookout'],
    cohesion: 0.7,
    tags: ['criminal', 'secretive'],
    goals: ['control the docks'],
    attitudes: { harbor_watch: -0.8 },
    initialBeliefs: [{ subject: 'harbor_watch', key: 'corrupt', value: true, confidence: 0.6 }],
  };

  it('accepts a fully-specified faction', () => {
    const result = validateFactionDefinition(validFaction);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('accepts a minimal faction (id, name, members)', () => {
    expect(validateFactionDefinition({ id: 'x', name: 'X', members: ['m1'] }).ok).toBe(true);
  });

  it('rejects a faction with no members', () => {
    const result = validateFactionDefinition({ id: 'x', name: 'X', members: [] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.path.includes('members'))).toBe(true);
  });

  it('rejects a missing id/name and a non-object', () => {
    expect(validateFactionDefinition({ members: ['m'] }).ok).toBe(false);
    expect(validateFactionDefinition('nope').ok).toBe(false);
  });

  it('rejects out-of-range cohesion and attitudes', () => {
    expect(validateFactionDefinition({ ...validFaction, cohesion: 1.5 }).ok).toBe(false);
    expect(validateFactionDefinition({ ...validFaction, attitudes: { rivals: -2 } }).ok).toBe(false);
  });

  it('rejects malformed initialBeliefs', () => {
    const result = validateFactionDefinition({
      ...validFaction,
      initialBeliefs: [{ subject: 'x' }],
    });
    expect(result.ok).toBe(false);
  });

  it('validates a faction parsed from YAML text end-to-end', () => {
    const yaml = [
      'id: chapel_pilgrims',
      'name: Chapel Pilgrims',
      'members:',
      '  - pilgrim_leader',
      '  - pilgrim_watcher',
      'cohesion: 0.8',
      'goals:',
      '  - protect the relics',
    ].join('\n');
    const result = validateGeneratedFaction(yaml, parseYamlish(yaml));
    expect(result.validation.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('validateDistrictDefinition (PA-4)', () => {
  const validDistrict = {
    id: 'harbor_quarter',
    name: 'Harbor Quarter',
    zoneIds: ['dockside', 'warehouse_row'],
    tags: ['commerce', 'contested'],
    controllingFaction: 'harbor_watch',
    baseMetrics: { alertPressure: 25, stability: 0.9 },
  };

  it('accepts a fully-specified district', () => {
    const result = validateDistrictDefinition(validDistrict);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects missing zoneIds or tags (required by the engine type)', () => {
    expect(validateDistrictDefinition({ id: 'x', name: 'X', tags: [] }).ok).toBe(false);
    expect(validateDistrictDefinition({ id: 'x', name: 'X', zoneIds: ['z'] }).ok).toBe(false);
  });

  it('rejects out-of-range baseMetrics', () => {
    expect(validateDistrictDefinition({ ...validDistrict, baseMetrics: { alertPressure: 250 } }).ok).toBe(false);
    expect(validateDistrictDefinition({ ...validDistrict, baseMetrics: { stability: 2 } }).ok).toBe(false);
  });

  it('validates a district parsed from YAML text end-to-end (nested baseMetrics)', () => {
    const yaml = [
      'id: market_quarter',
      'name: Market Quarter',
      'zoneIds:',
      '  - market_main',
      '  - market_alley',
      'tags:',
      '  - commerce',
      'baseMetrics:',
      '  alertPressure: 10',
      '  stability: 0.95',
    ].join('\n');
    const result = validateGeneratedDistrict(yaml, parseYamlish(yaml));
    expect(result.validation.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('pack validators (PA-4)', () => {
  const locationPackYaml = [
    'district:',
    '  id: harbor_quarter',
    '  name: Harbor Quarter',
    '  zoneIds:',
    '    - dockside',
    '  tags:',
    '    - commerce',
    'rooms:',
    '  - id: waterfront_tavern',
    '    name: Waterfront Tavern',
    '    zones:',
    '      - id: dockside',
    '        name: Dockside',
  ].join('\n');

  const encounterPackYaml = [
    'room:',
    '  id: ambush_clearing',
    '  name: Ambush Clearing',
    '  zones:',
    '    - id: treeline',
    '      name: Treeline',
    'entities:',
    '  - id: bandit_leader',
    '    type: enemy',
    '    name: Bandit Leader',
    'quest:',
    '  id: clear_the_road',
    '  name: Clear the Road',
    '  stages:',
    '    - id: find_ambush',
    '      name: Find the Ambush',
  ].join('\n');

  it('accepts a coherent location pack parsed from YAML', () => {
    const result = validateGeneratedLocationPack(locationPackYaml, parseYamlish(locationPackYaml));
    expect(result.validation.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('rejects a location pack without rooms, with path-prefixed errors', () => {
    const result = validateGeneratedLocationPack('x', { district: { id: 'd', name: 'D', zoneIds: ['z'], tags: [] } });
    expect(result.valid).toBe(false);
    expect(result.validation.errors.some((e) => e.path === 'LocationPack.rooms')).toBe(true);
  });

  it('reports nested room errors inside a location pack', () => {
    const result = validateGeneratedLocationPack('x', {
      district: { id: 'd', name: 'D', zoneIds: ['z'], tags: [] },
      rooms: [{ id: 'r1' }],
    });
    expect(result.valid).toBe(false);
    expect(result.validation.errors.some((e) => e.path.startsWith('LocationPack.rooms[0]'))).toBe(true);
  });

  it('accepts a coherent encounter pack parsed from YAML', () => {
    const result = validateGeneratedEncounterPack(encounterPackYaml, parseYamlish(encounterPackYaml));
    expect(result.validation.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('rejects an encounter pack missing its quest', () => {
    const parsed = parseYamlish(encounterPackYaml) as Record<string, unknown>;
    delete parsed['quest'];
    const result = validateGeneratedEncounterPack('x', parsed);
    expect(result.valid).toBe(false);
    expect(result.validation.errors.some((e) => e.path === 'EncounterPack.quest')).toBe(true);
  });
});
