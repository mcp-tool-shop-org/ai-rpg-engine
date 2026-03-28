// Gladiator Minimal Ruleset — declarative contract for iron-colosseum and similar content

import type { RulesetDefinition } from '@ai-rpg-engine/core';

export const gladiatorMinimalRuleset: RulesetDefinition = {
  id: 'gladiator-minimal',
  name: 'Gladiator Minimal',
  version: '0.1.0',

  stats: [
    { id: 'might', name: 'Might', min: 1, max: 20, default: 5 },
    { id: 'agility', name: 'Agility', min: 1, max: 20, default: 5 },
    { id: 'showmanship', name: 'Showmanship', min: 1, max: 20, default: 4 },
  ],

  resources: [
    { id: 'hp', name: 'HP', min: 0, max: 40, default: 25 },
    { id: 'fatigue', name: 'Fatigue', min: 0, max: 50, default: 0 },
    { id: 'crowd-favor', name: 'Crowd Favor', min: 0, max: 100, default: 40 },
  ],

  verbs: [
    { id: 'move', name: 'Move', description: 'Travel to an adjacent zone' },
    { id: 'inspect', name: 'Inspect', description: 'Examine your surroundings or a target' },
    { id: 'attack', name: 'Attack', tags: ['combat'], description: 'Strike a target in combat' },
    { id: 'guard', name: 'Guard', tags: ['combat', 'defensive'], description: 'Brace for incoming attacks, reducing damage taken' },
    { id: 'disengage', name: 'Disengage', tags: ['combat', 'movement'], description: 'Attempt to break from combat and withdraw' },
    { id: 'use', name: 'Use', description: 'Use an item from your inventory' },
    { id: 'speak', name: 'Speak', tags: ['dialogue'], description: 'Initiate dialogue with an NPC' },
    { id: 'choose', name: 'Choose', tags: ['dialogue'], description: 'Select a dialogue option' },
    { id: 'taunt', name: 'Taunt', tags: ['social', 'arena'], description: 'Provoke an opponent to lower their guard' },
    { id: 'showboat', name: 'Showboat', tags: ['spectacle', 'crowd'], description: 'Play to the crowd for favor' },
    { id: 'use-ability', name: 'Use Ability', tags: ['ability'], description: 'Activate a gladiatorial technique' },
  ],

  formulas: [
    {
      id: 'hit-chance',
      name: 'Hit Chance',
      description: 'Base: 50 + attacker.agility*5 - target.agility*3, clamped 5-95',
      inputs: ['attacker.agility', 'target.agility'],
      output: 'number (0-100)',
    },
    {
      id: 'damage',
      name: 'Damage',
      description: 'Base: attacker.might, minimum 1',
      inputs: ['attacker.might'],
      output: 'number',
    },
    {
      id: 'guard-reduction',
      name: 'Guard Reduction',
      description: 'Fraction of damage absorbed when guarded (default 0.5)',
      inputs: ['defender.might'],
      output: 'number (0-1)',
    },
    {
      id: 'disengage-chance',
      name: 'Disengage Chance',
      description: 'Success chance: 40 + instinct*5 + will*2, clamped 15-90',
      inputs: ['actor.agility', 'actor.showmanship'],
      output: 'number (0-100)',
    },
    {
      id: 'taunt-effect',
      name: 'Taunt Effect',
      description: 'Base: 25 + actor.showmanship*4 - target.will*2, clamped 5-90',
      inputs: ['actor.showmanship', 'target.will'],
      output: 'number (0-100)',
    },
    {
      id: 'crowd-swing',
      name: 'Crowd Swing',
      description: 'Favor change: actor.showmanship*3, modified by action spectacle',
      inputs: ['actor.showmanship'],
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
    statusTags: ['buff', 'debuff', 'exhaustion', 'crowd-roar'],
    combatTags: ['melee', 'spectacle', 'grapple'],
  },
};
