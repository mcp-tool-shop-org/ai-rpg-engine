// Vampire Minimal Ruleset — declarative contract for crimson-court and similar content

import type { RulesetDefinition } from '@ai-rpg-engine/core';

export const vampireMinimalRuleset: RulesetDefinition = {
  id: 'vampire-minimal',
  name: 'Vampire Minimal',
  version: '0.1.0',

  stats: [
    { id: 'presence', name: 'Presence', min: 1, max: 20, default: 5 },
    { id: 'vitality', name: 'Vitality', min: 1, max: 20, default: 5 },
    { id: 'cunning', name: 'Cunning', min: 1, max: 20, default: 5 },
  ],

  resources: [
    { id: 'hp', name: 'HP', min: 0, max: 30, default: 20 },
    { id: 'bloodlust', name: 'Bloodlust', min: 0, max: 100, default: 10 },
    { id: 'humanity', name: 'Humanity', min: 0, max: 30, default: 25 },
  ],

  verbs: [
    { id: 'move', name: 'Move', description: 'Travel to an adjacent zone' },
    { id: 'inspect', name: 'Inspect', description: 'Examine your surroundings or a target' },
    { id: 'attack', name: 'Attack', tags: ['combat'], description: 'Strike a target' },
    { id: 'use', name: 'Use', description: 'Use an item from your inventory' },
    { id: 'speak', name: 'Speak', tags: ['dialogue'], description: 'Initiate dialogue with an NPC' },
    { id: 'choose', name: 'Choose', tags: ['dialogue'], description: 'Select a dialogue option' },
    { id: 'enthrall', name: 'Enthrall', tags: ['social', 'supernatural'], description: 'Bend a mortal mind to your will' },
    { id: 'feed', name: 'Feed', tags: ['predatory', 'survival'], description: 'Drink blood to sate the hunger' },
  ],

  formulas: [
    {
      id: 'hit-chance',
      name: 'Hit Chance',
      description: 'Base: 50 + attacker.vitality*5 - target.vitality*3, clamped 5-95',
      inputs: ['attacker.vitality', 'target.vitality'],
      output: 'number (0-100)',
    },
    {
      id: 'damage',
      name: 'Damage',
      description: 'Base: attacker.vitality, minimum 1',
      inputs: ['attacker.vitality'],
      output: 'number',
    },
    {
      id: 'enthrall-chance',
      name: 'Enthrall Chance',
      description: 'Base: 30 + actor.presence*5 - target.will*3, clamped 5-90',
      inputs: ['actor.presence', 'target.will'],
      output: 'number (0-100)',
    },
    {
      id: 'feed-efficiency',
      name: 'Feed Efficiency',
      description: 'Bloodlust reduced: 15 + actor.cunning*2',
      inputs: ['actor.cunning'],
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
    statusTags: ['buff', 'debuff', 'curse', 'bloodfrenzy'],
    combatTags: ['melee', 'supernatural', 'predatory'],
  },
};
