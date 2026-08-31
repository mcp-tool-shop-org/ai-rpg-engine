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
  validateGeneratedEntity,
  validateGeneratedDialogue,
  validateGeneratedAbility,
  validateGeneratedStatus,
  validateGeneratedItem,
  validateGeneratedHazard,
  validateGeneratedArchetype,
  validateGeneratedBackground,
  validateGeneratedBuildCatalog,
  validateGeneratedEntityAi,
  validateGeneratedPlacement,
  validateGeneratedEncounterAnchor,
  validateGeneratedProgressionTree,
  validateGeneratedRuleset,
  validateGeneratedRuleProfile,
  validateGeneratedItemPlacement,
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

describe('validateGenerated entity/dialogue/ability/status', () => {
  it('accepts a valid entity blueprint', () => {
    const yaml = 'id: chapel_guard\ntype: npc\nname: Chapel Guard';
    const result = validateGeneratedEntity(yaml, parseYamlish(yaml));
    expect(result.valid).toBe(true);
  });

  it('rejects an entity missing type', () => {
    const result = validateGeneratedEntity('x', { id: 'g', name: 'Guard' });
    expect(result.valid).toBe(false);
    expect(result.validation.errors.some((e) => e.path.includes('type'))).toBe(true);
  });

  it('accepts a valid dialogue tree', () => {
    const yaml = [
      'id: pilgrim_talk',
      'speakers:',
      '  - pilgrim',
      'entryNodeId: greeting',
      'nodes:',
      '  greeting:',
      '    id: greeting',
      '    speaker: pilgrim',
      '    text: Hello.',
    ].join('\n');
    const result = validateGeneratedDialogue(yaml, parseYamlish(yaml));
    expect(result.valid).toBe(true);
  });

  it('accepts a valid ability', () => {
    const yaml = [
      'id: fireball',
      'name: Fireball',
      'verb: cast',
      'tags:',
      '  - magic',
      'target:',
      '  type: single',
      'effects:',
      '  - type: damage',
      '    params:',
      '      amount: 10',
    ].join('\n');
    const result = validateGeneratedAbility(yaml, parseYamlish(yaml));
    expect(result.valid).toBe(true);
  });

  it('accepts a valid status', () => {
    const yaml = [
      'id: burning',
      'name: Burning',
      'tags:',
      '  - fire',
      'stacking: refresh',
    ].join('\n');
    const result = validateGeneratedStatus(yaml, parseYamlish(yaml));
    expect(result.valid).toBe(true);
  });

  it('accepts a valid item', () => {
    const yaml = [
      'id: worn_blade',
      'name: Worn Blade',
      'description: A simple blade.',
      'slot: weapon',
      'rarity: common',
    ].join('\n');
    const result = validateGeneratedItem(yaml, parseYamlish(yaml));
    expect(result.valid).toBe(true);
  });

  it('rejects an item without id', () => {
    const yaml = 'name: Nameless\nslot: weapon';
    const result = validateGeneratedItem(yaml, parseYamlish(yaml));
    expect(result.valid).toBe(false);
  });

  it('accepts a valid hazard', () => {
    const yaml = [
      'id: chapel_fire',
      'trigger: on-enter',
      'effects:',
      '  - kind: damage',
      '    amount: 2',
    ].join('\n');
    const result = validateGeneratedHazard(yaml, parseYamlish(yaml));
    expect(result.valid).toBe(true);
  });

  it('rejects a hazard without effects', () => {
    const yaml = 'id: smoke\ntrigger: on-enter';
    const result = validateGeneratedHazard(yaml, parseYamlish(yaml));
    expect(result.valid).toBe(false);
  });
});

describe('validateGenerated chargen / entityAi / placement', () => {
  it('accepts a valid archetype', () => {
    const yaml = [
      'id: warden',
      'name: Warden',
      'description: Holds the gate.',
      'progressionTreeId: warden_tree',
      'startingTags:',
      '  - martial',
      'statPriorities:',
      '  might: 2',
      '  wit: 1',
    ].join('\n');
    const result = validateGeneratedArchetype(yaml, parseYamlish(yaml));
    expect(result.valid).toBe(true);
  });

  it('rejects an archetype missing statPriorities', () => {
    const result = validateGeneratedArchetype('x', {
      id: 'warden', name: 'Warden', description: 'x', progressionTreeId: 't', startingTags: ['a'],
    });
    expect(result.valid).toBe(false);
  });

  it('accepts a valid background', () => {
    const yaml = [
      'id: pilgrim',
      'name: Pilgrim',
      'description: Walked the salt road.',
      'startingTags:',
      '  - traveler',
      'statModifiers:',
      '  wit: 1',
    ].join('\n');
    const result = validateGeneratedBackground(yaml, parseYamlish(yaml));
    expect(result.valid).toBe(true);
  });

  it('accepts a satisfiable build catalog', () => {
    const yaml = [
      'packId: chapel',
      'statBudget: 6',
      'maxTraits: 3',
      'requiredFlaws: 0',
      'traits:',
      '  - id: brave',
      '    category: perk',
      'archetypes:',
      '  - id: warden',
      '    name: Warden',
      '    description: Holds the gate.',
      '    progressionTreeId: warden_tree',
      '    startingTags:',
      '      - martial',
      '    statPriorities:',
      '      might: 2',
      'backgrounds:',
      '  - id: pilgrim',
      '    name: Pilgrim',
      '    description: Walked.',
      '    startingTags:',
      '      - traveler',
      '    statModifiers:',
      '      wit: 1',
    ].join('\n');
    const result = validateGeneratedBuildCatalog(yaml, parseYamlish(yaml));
    expect(result.valid).toBe(true);
  });

  it('rejects an unsatisfiable catalog', () => {
    const result = validateGeneratedBuildCatalog('x', {
      requiredFlaws: 2,
      maxTraits: 1,
      traits: [{ id: 'reckless', category: 'flaw' }],
    });
    expect(result.valid).toBe(false);
  });

  it('accepts an entity AI overlay', () => {
    const yaml = [
      'entityId: chapel_guard',
      'profileId: sentinel',
      'goals:',
      '  - hold_the_gate',
      'fears:',
      '  - fire',
      'alertLevel: 0.4',
    ].join('\n');
    const result = validateGeneratedEntityAi(yaml, parseYamlish(yaml));
    expect(result.valid).toBe(true);
  });

  it('rejects entity AI without profileId', () => {
    const result = validateGeneratedEntityAi('x', { entityId: 'g', goals: ['x'] });
    expect(result.valid).toBe(false);
  });

  it('accepts a placement record', () => {
    const yaml = 'entityId: chapel_guard\nzoneId: nave';
    const result = validateGeneratedPlacement(yaml, parseYamlish(yaml));
    expect(result.valid).toBe(true);
  });

  it('rejects a placement missing zoneId', () => {
    const result = validateGeneratedPlacement('x', { entityId: 'chapel_guard' });
    expect(result.valid).toBe(false);
  });

  it('accepts a valid encounter anchor', () => {
    const yaml = [
      'id: nave_ambush',
      'zoneId: nave',
      'encounterType: ambush',
      'enemyIds:',
      '  - ash_ghoul',
      'probability: 0.35',
      'cooldownTurns: 4',
      'tags:',
      '  - undead',
    ].join('\n');
    const result = validateGeneratedEncounterAnchor(yaml, parseYamlish(yaml));
    expect(result.valid).toBe(true);
  });

  it('rejects an encounter anchor with probability outside [0, 1]', () => {
    const result = validateGeneratedEncounterAnchor('x', {
      id: 'nave_ambush',
      zoneId: 'nave',
      encounterType: 'ambush',
      enemyIds: ['ash_ghoul'],
      probability: 35,
      cooldownTurns: 4,
      tags: ['undead'],
    });
    expect(result.valid).toBe(false);
  });

  it('accepts a valid progression tree', () => {
    const yaml = [
      'id: combat_mastery',
      'name: Combat Mastery',
      'currency: xp',
      'nodes:',
      '  - id: toughened',
      '    name: Toughened',
      '    cost: 10',
      '    effects:',
      '      - type: resource-boost',
      '        params:',
      '          resource: hp',
      '          amount: 5',
    ].join('\n');
    const result = validateGeneratedProgressionTree(yaml, parseYamlish(yaml));
    expect(result.valid).toBe(true);
  });

  it('rejects a progression tree missing nodes', () => {
    const result = validateGeneratedProgressionTree('x', {
      id: 'combat_mastery', name: 'Combat Mastery', currency: 'xp',
    });
    expect(result.valid).toBe(false);
  });

  // F-8ec253bf: create-ruleset had no validator wrapper at all (zero
  // create-ruleset/createRuleset matches anywhere in the package).
  it('accepts a minimal valid ruleset', () => {
    const ruleset = {
      id: 'fantasy-minimal',
      name: 'Fantasy Minimal',
      version: '0.1.0',
      stats: [{ id: 'vigor', name: 'Vigor', default: 5 }],
      resources: [{ id: 'hp', name: 'HP', default: 20 }],
      verbs: [{ id: 'move', name: 'Move' }],
      formulas: [],
      defaultModules: [],
      progressionModels: [],
    };
    const result = validateGeneratedRuleset('x', ruleset);
    expect(result.valid).toBe(true);
  });

  it('rejects a ruleset missing verbs', () => {
    const result = validateGeneratedRuleset('x', {
      id: 'fantasy-minimal', name: 'Fantasy Minimal', version: '0.1.0',
      stats: [], resources: [], formulas: [], defaultModules: [], progressionModels: [],
    });
    expect(result.valid).toBe(false);
  });

  // F-0bf295ac: create-rule-profile had no validator wrapper (the fix design
  // assumed content-schema had none dedicated; validateRuleProfile already
  // exists there — F-0987c369 — so this wraps it rather than duplicating it).
  it('accepts a valid rule profile statMapping', () => {
    const yaml = 'id: veteran_soldier\nstatMapping:\n  attack: strength\n  precision: dexterity\n  resolve: willpower';
    const result = validateGeneratedRuleProfile(yaml, parseYamlish(yaml));
    expect(result.valid).toBe(true);
  });

  it('rejects a rule profile missing statMapping.resolve', () => {
    const result = validateGeneratedRuleProfile('x', {
      id: 'veteran_soldier',
      statMapping: { attack: 'strength', precision: 'dexterity' },
    });
    expect(result.valid).toBe(false);
  });

  // F-bd8034ea: create-item-placement had no validator wrapper
  // (validateItemPlacementRecord already exists in content-schema).
  it('accepts a valid item placement', () => {
    const yaml = 'itemId: rusty_key\nentityId: chapel_guard';
    const result = validateGeneratedItemPlacement(yaml, parseYamlish(yaml));
    expect(result.valid).toBe(true);
  });

  it('rejects an item placement missing itemId', () => {
    const result = validateGeneratedItemPlacement('x', { entityId: 'chapel_guard' });
    expect(result.valid).toBe(false);
  });
});
