// Signal Loss — ruleset definition

import type { RulesetDefinition } from '@ai-rpg-engine/core';

export const colonyMinimalRuleset: RulesetDefinition = {
  id: 'colony-minimal',
  name: 'Colony Minimal',
  version: '0.1.0',

  stats: [
    { id: 'engineering', name: 'Engineering', min: 1, max: 20, default: 5 },
    { id: 'command', name: 'Command', min: 1, max: 20, default: 5 },
    { id: 'awareness', name: 'Awareness', min: 1, max: 20, default: 4 },
  ],

  resources: [
    { id: 'hp', name: 'HP', min: 0, max: 25, default: 18 },
    { id: 'power', name: 'Power', min: 0, max: 100, default: 60, regenRate: 2 },
    { id: 'morale', name: 'Morale', min: 0, max: 30, default: 20 },
  ],

  verbs: [
    { id: 'move', name: 'Move', description: 'Move to an adjacent module' },
    { id: 'inspect', name: 'Analyze', description: 'Analyze a system or environment' },
    { id: 'attack', name: 'Engage', tags: ['combat'], description: 'Combat with improvised or standard weapons' },
    { id: 'guard', name: 'Guard', tags: ['combat', 'defensive'], description: 'Brace for incoming attacks, reducing damage taken' },
    { id: 'disengage', name: 'Disengage', tags: ['combat', 'movement'], description: 'Attempt to break from combat and withdraw' },
    { id: 'use', name: 'Use', description: 'Use an item from inventory' },
    { id: 'speak', name: 'Speak', tags: ['dialogue'], description: 'Talk to another colonist' },
    { id: 'choose', name: 'Choose', tags: ['dialogue'], description: 'Select a dialogue option' },
    { id: 'scan', name: 'Scan', tags: ['sensor', 'recon'], description: 'Sensor sweep of area or entity' },
    { id: 'allocate', name: 'Allocate', tags: ['management', 'colony'], description: 'Redistribute power between colony systems' },
    { id: 'use-ability', name: 'Use Ability', tags: ['ability'], description: 'Use a special ability' },
  ],

  formulas: [
    {
      id: 'hit-chance',
      name: 'Hit Chance',
      description: 'Attacker awareness vs target awareness',
      inputs: ['attacker.awareness', 'target.awareness'],
      output: 'number (0-100)',
    },
    {
      id: 'damage',
      name: 'Damage',
      description: 'Base: attacker engineering (improvised weapons), minimum 1',
      inputs: ['attacker.engineering'],
      output: 'number',
    },
    {
      id: 'guard-reduction',
      name: 'Guard Reduction',
      description: 'Fraction of damage absorbed when guarded (default 0.5)',
      inputs: ['defender.engineering'],
      output: 'number (0-1)',
    },
    {
      id: 'disengage-chance',
      name: 'Disengage Chance',
      description: 'Success chance: 40 + instinct*5 + will*2, clamped 15-90',
      inputs: ['actor.command', 'actor.awareness'],
      output: 'number (0-100)',
    },
    {
      id: 'scan-success',
      name: 'Scan Success',
      description: 'Awareness + engineering vs difficulty',
      inputs: ['actor.awareness', 'actor.engineering', 'difficulty'],
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
    entityTypes: ['player', 'npc', 'colonist', 'enemy', 'drone', 'alien'],
    statusTags: ['buff', 'debuff', 'radiation', 'low-oxygen', 'system-failure'],
    combatTags: ['melee', 'improvised', 'ranged', 'energy'],
  },
};
