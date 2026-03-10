import { describe, it, expect } from 'vitest';
import {
  validateEntityBlueprint,
  validateAbilityDefinition,
  validateStatusDefinition,
  validateStatusDefinitionPack,
  validateRulesetDefinition,
  validateZoneDefinition,
  validateRoomDefinition,
  validateQuestDefinition,
  validateDialogueDefinition,
  validateProgressionTreeDefinition,
  validateSoundCueDefinition,
  formatErrors,
} from './validate.js';

describe('validateEntityBlueprint', () => {
  it('accepts valid minimal blueprint', () => {
    const r = validateEntityBlueprint({ id: 'goblin', type: 'enemy', name: 'Goblin' });
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('accepts full blueprint', () => {
    const r = validateEntityBlueprint({
      id: 'knight',
      type: 'npc',
      name: 'Knight',
      tags: ['guard', 'friendly'],
      baseStats: { vigor: 8, instinct: 5 },
      baseResources: { hp: 40 },
      inventory: ['sword', 'shield'],
      equipment: { weapon: 'sword' },
      aiProfile: 'guard',
      scripts: ['patrol.js'],
    });
    expect(r.ok).toBe(true);
  });

  it('rejects missing required fields', () => {
    const r = validateEntityBlueprint({});
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
    expect(r.errors.some((e) => e.path.includes('id'))).toBe(true);
    expect(r.errors.some((e) => e.path.includes('type'))).toBe(true);
    expect(r.errors.some((e) => e.path.includes('name'))).toBe(true);
  });

  it('rejects wrong types in optional fields', () => {
    const r = validateEntityBlueprint({
      id: 'x',
      type: 'y',
      name: 'Z',
      baseStats: 'not-a-record',
      tags: 'not-array',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('baseStats'))).toBe(true);
    expect(r.errors.some((e) => e.path.includes('tags'))).toBe(true);
  });

  it('rejects non-object', () => {
    const r = validateEntityBlueprint('hello');
    expect(r.ok).toBe(false);
  });
});

describe('validateAbilityDefinition', () => {
  it('accepts valid ability', () => {
    const r = validateAbilityDefinition({
      id: 'fireball',
      name: 'Fireball',
      verb: 'cast',
      tags: ['magic', 'fire'],
      target: { type: 'single' },
      effects: [{ type: 'damage', params: { amount: 10 } }],
    });
    expect(r.ok).toBe(true);
  });

  it('rejects missing effects', () => {
    const r = validateAbilityDefinition({
      id: 'x',
      name: 'X',
      verb: 'x',
      tags: [],
      target: { type: 'self' },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('effects'))).toBe(true);
  });
});

describe('validateStatusDefinition', () => {
  it('accepts valid status', () => {
    const r = validateStatusDefinition({
      id: 'burning',
      name: 'Burning',
      tags: ['debuff', 'fire'],
      stacking: 'refresh',
      duration: { type: 'ticks', value: 3 },
      modifiers: [{ stat: 'vigor', operation: 'add', value: -2 }],
    });
    expect(r.ok).toBe(true);
  });

  it('rejects invalid stacking mode', () => {
    const r = validateStatusDefinition({
      id: 'x',
      name: 'X',
      tags: [],
      stacking: 'explode',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('replace, stack, refresh'))).toBe(true);
  });
});

describe('validateZoneDefinition', () => {
  it('accepts valid zone', () => {
    const r = validateZoneDefinition({
      id: 'chapel-entrance',
      name: 'Ruined Chapel Entrance',
      tags: ['interior'],
      neighbors: ['chapel-nave'],
      light: 3,
    });
    expect(r.ok).toBe(true);
  });

  it('rejects non-string id', () => {
    const r = validateZoneDefinition({ id: 42, name: 'X' });
    expect(r.ok).toBe(false);
  });
});

describe('validateRoomDefinition', () => {
  it('accepts valid room with zones', () => {
    const r = validateRoomDefinition({
      id: 'ruined-chapel',
      name: 'Ruined Chapel',
      zones: [
        { id: 'zone-a', name: 'Zone A' },
        { id: 'zone-b', name: 'Zone B' },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it('rejects missing zones', () => {
    const r = validateRoomDefinition({ id: 'x', name: 'X' });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('zones'))).toBe(true);
  });

  it('validates nested zone errors', () => {
    const r = validateRoomDefinition({
      id: 'x',
      name: 'X',
      zones: [{ id: 123, name: '' }],
    });
    expect(r.ok).toBe(false);
  });
});

describe('validateQuestDefinition', () => {
  it('accepts valid quest', () => {
    const r = validateQuestDefinition({
      id: 'rescue',
      name: 'Rescue the Prisoner',
      stages: [
        { id: 'find', name: 'Find the key' },
        { id: 'unlock', name: 'Unlock the cell' },
      ],
    });
    expect(r.ok).toBe(true);
  });
});

describe('validateDialogueDefinition', () => {
  it('accepts the pilgrim dialogue', () => {
    const r = validateDialogueDefinition({
      id: 'pilgrim-talk',
      speakers: ['pilgrim'],
      entryNodeId: 'greeting',
      nodes: {
        greeting: {
          id: 'greeting',
          speaker: 'Pilgrim',
          text: 'Hello.',
          choices: [
            { id: 'ask', text: 'Tell me more.', nextNodeId: 'info' },
          ],
        },
        info: {
          id: 'info',
          speaker: 'Pilgrim',
          text: 'The end.',
        },
      },
    });
    expect(r.ok).toBe(true);
  });

  it('catches missing entry node', () => {
    const r = validateDialogueDefinition({
      id: 'd1',
      speakers: ['npc'],
      entryNodeId: 'missing',
      nodes: {
        greeting: { id: 'greeting', speaker: 'NPC', text: 'Hi.' },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('missing node "missing"'))).toBe(true);
  });

  it('catches broken choice nextNodeId', () => {
    const r = validateDialogueDefinition({
      id: 'd1',
      speakers: ['npc'],
      entryNodeId: 'start',
      nodes: {
        start: {
          id: 'start',
          speaker: 'NPC',
          text: 'Hi.',
          choices: [{ id: 'c1', text: 'Bye', nextNodeId: 'ghost-node' }],
        },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('ghost-node'))).toBe(true);
  });

  it('catches mismatched node id and key', () => {
    const r = validateDialogueDefinition({
      id: 'd1',
      speakers: ['npc'],
      entryNodeId: 'start',
      nodes: {
        start: { id: 'wrong-id', speaker: 'NPC', text: 'Hi.' },
      },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('does not match key'))).toBe(true);
  });
});

describe('validateProgressionTreeDefinition', () => {
  it('accepts valid tree', () => {
    const r = validateProgressionTreeDefinition({
      id: 'skill-tree',
      name: 'Skills',
      currency: 'xp',
      nodes: [
        { id: 'slash', name: 'Slash', cost: 1, effects: [{ type: 'unlock-verb', params: { verb: 'slash' } }] },
        { id: 'whirlwind', name: 'Whirlwind', cost: 3, requires: ['slash'], effects: [{ type: 'unlock-verb', params: { verb: 'whirlwind' } }] },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it('catches broken requires reference', () => {
    const r = validateProgressionTreeDefinition({
      id: 'tree',
      name: 'T',
      currency: 'xp',
      nodes: [
        { id: 'a', name: 'A', cost: 1, requires: ['nonexistent'], effects: [] },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('nonexistent'))).toBe(true);
  });
});

describe('validateSoundCueDefinition', () => {
  it('accepts valid cue', () => {
    const r = validateSoundCueDefinition({
      id: 'crypt-reveal',
      trigger: 'world.zone.entered',
      channel: 'stinger',
      priority: 'high',
    });
    expect(r.ok).toBe(true);
  });

  it('rejects invalid channel', () => {
    const r = validateSoundCueDefinition({
      id: 'x',
      trigger: 'y',
      channel: 'surround-sound',
    });
    expect(r.ok).toBe(false);
  });
});

describe('validateRulesetDefinition', () => {
  const validRuleset = {
    id: 'fantasy-minimal',
    name: 'Fantasy Minimal',
    version: '0.1.0',
    stats: [
      { id: 'vigor', name: 'Vigor', default: 5 },
      { id: 'instinct', name: 'Instinct', default: 5 },
      { id: 'will', name: 'Will', default: 5 },
    ],
    resources: [
      { id: 'hp', name: 'HP', min: 0, default: 20 },
      { id: 'stamina', name: 'Stamina', min: 0, default: 10 },
    ],
    verbs: [
      { id: 'move', name: 'Move' },
      { id: 'attack', name: 'Attack', tags: ['combat'] },
      { id: 'inspect', name: 'Inspect' },
      { id: 'speak', name: 'Speak' },
      { id: 'use', name: 'Use' },
    ],
    formulas: [
      { id: 'hit-chance', name: 'Hit Chance', inputs: ['attacker.instinct', 'target.instinct'], output: 'number' },
      { id: 'damage', name: 'Damage', inputs: ['attacker.vigor'], output: 'number' },
    ],
    defaultModules: ['traversal-core', 'status-core', 'combat-core', 'inventory-core', 'dialogue-core'],
    progressionModels: [],
  };

  it('accepts valid fantasy ruleset', () => {
    const r = validateRulesetDefinition(validRuleset);
    expect(r.ok).toBe(true);
  });

  it('rejects missing required fields', () => {
    const r = validateRulesetDefinition({ id: 'x' });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('name'))).toBe(true);
    expect(r.errors.some((e) => e.path.includes('stats'))).toBe(true);
    expect(r.errors.some((e) => e.path.includes('verbs'))).toBe(true);
  });

  it('catches duplicate verb ids', () => {
    const r = validateRulesetDefinition({
      ...validRuleset,
      verbs: [
        { id: 'attack', name: 'Attack' },
        { id: 'attack', name: 'Attack Again' },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicate verb id'))).toBe(true);
  });

  it('validates nested stat definitions', () => {
    const r = validateRulesetDefinition({
      ...validRuleset,
      stats: [{ id: 'x', name: 'X' }], // missing default
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('default'))).toBe(true);
  });
});

describe('validateStatusDefinitionPack', () => {
  const validDefs = [
    { id: 'mesmerized', name: 'Mesmerized', tags: ['control', 'debuff'], stacking: 'replace' },
    { id: 'terrified', name: 'Terrified', tags: ['fear', 'debuff'], stacking: 'replace' },
  ];

  it('accepts valid status definitions', () => {
    const r = validateStatusDefinitionPack(validDefs);
    expect(r.ok).toBe(true);
    expect(r.advisories).toHaveLength(0);
  });

  it('catches duplicate IDs', () => {
    const dups = [
      { id: 'mesmerized', name: 'Mesmerized', tags: ['control'], stacking: 'replace' },
      { id: 'mesmerized', name: 'Mesmerized Dup', tags: ['control'], stacking: 'replace' },
    ];
    const r = validateStatusDefinitionPack(dups);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicate status id'))).toBe(true);
  });

  it('reports advisory for unknown tags when knownTags provided', () => {
    const defs = [
      { id: 'x', name: 'X', tags: ['control', 'made-up-tag'], stacking: 'replace' },
    ];
    const r = validateStatusDefinitionPack(defs, ['control', 'debuff', 'fear']);
    expect(r.ok).toBe(true); // advisories don't cause failure
    expect(r.advisories.length).toBe(1);
    expect(r.advisories[0].message).toContain('made-up-tag');
  });

  it('no advisories when tags match known vocabulary', () => {
    const r = validateStatusDefinitionPack(validDefs, ['control', 'debuff', 'fear']);
    expect(r.advisories).toHaveLength(0);
  });

  it('validates structural issues in individual defs', () => {
    const bad = [{ id: 'x', name: 'X', tags: [], stacking: 'explode' }];
    const r = validateStatusDefinitionPack(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('replace, stack, refresh'))).toBe(true);
  });
});

describe('formatErrors', () => {
  it('returns Valid for ok result', () => {
    expect(formatErrors({ ok: true, errors: [] })).toBe('Valid');
  });

  it('formats multiple errors', () => {
    const out = formatErrors({
      ok: false,
      errors: [
        { path: 'foo.id', message: 'required non-empty string' },
        { path: 'foo.name', message: 'required non-empty string' },
      ],
    });
    expect(out).toContain('foo.id');
    expect(out).toContain('foo.name');
  });
});
