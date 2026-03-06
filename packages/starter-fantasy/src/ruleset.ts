// Fantasy Minimal Ruleset — declarative contract for chapel-threshold and similar content

import type { RulesetDefinition } from '@signalfire/core';

export const fantasyMinimalRuleset: RulesetDefinition = {
  id: 'fantasy-minimal',
  name: 'Fantasy Minimal',
  version: '0.1.0',

  stats: [
    { id: 'vigor', name: 'Vigor', min: 1, max: 20, default: 5 },
    { id: 'instinct', name: 'Instinct', min: 1, max: 20, default: 5 },
    { id: 'will', name: 'Will', min: 1, max: 20, default: 5 },
  ],

  resources: [
    { id: 'hp', name: 'HP', min: 0, max: 100, default: 20 },
    { id: 'stamina', name: 'Stamina', min: 0, max: 50, default: 10, regenRate: 1 },
  ],

  verbs: [
    { id: 'move', name: 'Move', description: 'Travel to an adjacent zone' },
    { id: 'inspect', name: 'Inspect', description: 'Examine your surroundings or a target' },
    { id: 'attack', name: 'Attack', tags: ['combat'], description: 'Strike a target in melee' },
    { id: 'use', name: 'Use', description: 'Use an item from your inventory' },
    { id: 'speak', name: 'Speak', tags: ['dialogue'], description: 'Initiate dialogue with an NPC' },
    { id: 'choose', name: 'Choose', tags: ['dialogue'], description: 'Select a dialogue option' },
  ],

  formulas: [
    {
      id: 'hit-chance',
      name: 'Hit Chance',
      description: 'Base: 50 + attacker.instinct*5 - target.instinct*3, clamped 5-95',
      inputs: ['attacker.instinct', 'target.instinct'],
      output: 'number (0-100)',
    },
    {
      id: 'damage',
      name: 'Damage',
      description: 'Base: attacker.vigor, minimum 1',
      inputs: ['attacker.vigor'],
      output: 'number',
    },
  ],

  defaultModules: [
    'traversal-core',
    'status-core',
    'combat-core',
    'inventory-core',
    'dialogue-core',
  ],

  progressionModels: [],

  contentConventions: {
    entityTypes: ['player', 'npc', 'enemy', 'item'],
    statusTags: ['buff', 'debuff', 'curse', 'blessing'],
    combatTags: ['melee', 'ranged', 'magic'],
  },
};
