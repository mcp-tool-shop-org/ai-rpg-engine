// Black Flag Requiem — ruleset definition

import type { RulesetDefinition } from '@ai-rpg-engine/core';

export const pirateMinimalRuleset: RulesetDefinition = {
  id: 'pirate-minimal',
  name: 'Pirate Minimal',
  version: '0.1.0',

  stats: [
    { id: 'brawn', name: 'Brawn', min: 1, max: 20, default: 5 },
    { id: 'cunning', name: 'Cunning', min: 1, max: 20, default: 5 },
    { id: 'sea-legs', name: 'Sea Legs', min: 1, max: 20, default: 4 },
  ],

  resources: [
    { id: 'hp', name: 'HP', min: 0, max: 40, default: 20 },
    { id: 'morale', name: 'Morale', min: 0, max: 30, default: 15, regenRate: 1 },
  ],

  verbs: [
    { id: 'move', name: 'Move', description: 'Move to an adjacent area' },
    { id: 'inspect', name: 'Scout', description: 'Scan an area, ship, or object' },
    { id: 'attack', name: 'Fight', tags: ['combat'], description: 'Melee or ranged combat' },
    { id: 'use', name: 'Use', description: 'Use an item from inventory' },
    { id: 'speak', name: 'Speak', tags: ['dialogue'], description: 'Parley or threaten' },
    { id: 'choose', name: 'Choose', tags: ['dialogue'], description: 'Select a dialogue option' },
    { id: 'plunder', name: 'Plunder', tags: ['loot'], description: 'Loot a defeated area or ship' },
    { id: 'navigate', name: 'Navigate', tags: ['exploration'], description: 'Chart a course between islands' },
  ],

  formulas: [
    {
      id: 'hit-chance',
      name: 'Hit Chance',
      description: 'Attacker brawn vs target sea-legs',
      inputs: ['attacker.brawn', 'target.sea-legs'],
      output: 'number (0-100)',
    },
    {
      id: 'damage',
      name: 'Damage',
      description: 'Base: attacker brawn, minimum 1',
      inputs: ['attacker.brawn'],
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
    entityTypes: ['player', 'npc', 'pirate', 'enemy', 'creature'],
    statusTags: ['buff', 'debuff', 'weather', 'curse'],
    combatTags: ['melee', 'ranged', 'boarding'],
  },
};
