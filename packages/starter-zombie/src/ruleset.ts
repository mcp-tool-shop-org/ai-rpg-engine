// Ashfall Dead — ruleset definition

import type { RulesetDefinition } from '@ai-rpg-engine/core';

export const zombieMinimalRuleset: RulesetDefinition = {
  id: 'zombie-minimal',
  name: 'Zombie Survival Minimal',
  version: '0.1.0',

  stats: [
    { id: 'fitness', name: 'Fitness', min: 1, max: 20, default: 5 },
    { id: 'wits', name: 'Wits', min: 1, max: 20, default: 5 },
    { id: 'nerve', name: 'Nerve', min: 1, max: 20, default: 4 },
  ],

  resources: [
    { id: 'hp', name: 'HP', min: 0, max: 30, default: 18 },
    { id: 'stamina', name: 'Stamina', min: 0, max: 20, default: 12, regenRate: 1 },
    { id: 'infection', name: 'Infection', min: 0, max: 100, default: 0 },
  ],

  verbs: [
    { id: 'move', name: 'Move', description: 'Move to an adjacent area' },
    { id: 'inspect', name: 'Search', description: 'Search an area for supplies or threats' },
    { id: 'attack', name: 'Fight', tags: ['combat'], description: 'Melee or improvised weapon combat' },
    { id: 'guard', name: 'Guard', tags: ['combat', 'defensive'], description: 'Brace for incoming attacks, reducing damage taken' },
    { id: 'disengage', name: 'Disengage', tags: ['combat', 'movement'], description: 'Attempt to break from combat and withdraw' },
    { id: 'use', name: 'Use', description: 'Use an item from inventory' },
    { id: 'speak', name: 'Speak', tags: ['dialogue'], description: 'Talk to other survivors' },
    { id: 'choose', name: 'Choose', tags: ['dialogue'], description: 'Select a dialogue option' },
    { id: 'barricade', name: 'Barricade', tags: ['defense'], description: 'Fortify a location against the dead' },
    { id: 'scavenge', name: 'Scavenge', tags: ['loot', 'survival'], description: 'Forage for food, water, or materials' },
  ],

  formulas: [
    {
      id: 'hit-chance',
      name: 'Hit Chance',
      description: 'Attacker fitness vs target fitness',
      inputs: ['attacker.fitness', 'target.fitness'],
      output: 'number (0-100)',
    },
    {
      id: 'damage',
      name: 'Damage',
      description: 'Base: attacker fitness, minimum 1',
      inputs: ['attacker.fitness'],
      output: 'number',
    },
    {
      id: 'guard-reduction',
      name: 'Guard Reduction',
      description: 'Fraction of damage absorbed when guarded (default 0.5)',
      inputs: ['defender.vigor'],
      output: 'number (0-1)',
    },
    {
      id: 'disengage-chance',
      name: 'Disengage Chance',
      description: 'Success chance: 40 + instinct*5 + will*2, clamped 15-90',
      inputs: ['actor.instinct', 'actor.will'],
      output: 'number (0-100)',
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
    entityTypes: ['player', 'npc', 'survivor', 'enemy', 'zombie'],
    statusTags: ['buff', 'debuff', 'infection', 'hunger', 'fear'],
    combatTags: ['melee', 'improvised', 'ranged'],
  },
};
