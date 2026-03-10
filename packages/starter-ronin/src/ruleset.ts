// Ronin Minimal Ruleset — declarative contract for jade-veil and similar content

import type { RulesetDefinition } from '@ai-rpg-engine/core';

export const roninMinimalRuleset: RulesetDefinition = {
  id: 'ronin-minimal',
  name: 'Ronin Minimal',
  version: '0.1.0',

  stats: [
    { id: 'discipline', name: 'Discipline', min: 1, max: 20, default: 5 },
    { id: 'perception', name: 'Perception', min: 1, max: 20, default: 5 },
    { id: 'composure', name: 'Composure', min: 1, max: 20, default: 5 },
  ],

  resources: [
    { id: 'hp', name: 'HP', min: 0, max: 30, default: 20 },
    { id: 'honor', name: 'Honor', min: 0, max: 30, default: 25 },
    { id: 'ki', name: 'Ki', min: 0, max: 20, default: 15, regenRate: 2 },
  ],

  verbs: [
    { id: 'move', name: 'Move', description: 'Travel to an adjacent zone' },
    { id: 'inspect', name: 'Inspect', description: 'Examine your surroundings or a target' },
    { id: 'attack', name: 'Attack', tags: ['combat'], description: 'Strike a target with your blade' },
    { id: 'use', name: 'Use', description: 'Use an item from your inventory' },
    { id: 'speak', name: 'Speak', tags: ['dialogue'], description: 'Initiate dialogue with an NPC' },
    { id: 'choose', name: 'Choose', tags: ['dialogue'], description: 'Select a dialogue option' },
    { id: 'duel', name: 'Duel', tags: ['martial', 'formal'], description: 'Challenge an opponent to an honorable duel' },
    { id: 'meditate', name: 'Meditate', tags: ['recovery', 'spiritual'], description: 'Center yourself to restore ki and focus' },
  ],

  formulas: [
    {
      id: 'hit-chance',
      name: 'Hit Chance',
      description: 'Base: 50 + attacker.discipline*5 - target.discipline*3, clamped 5-95',
      inputs: ['attacker.discipline', 'target.discipline'],
      output: 'number (0-100)',
    },
    {
      id: 'damage',
      name: 'Damage',
      description: 'Base: attacker.discipline, minimum 1',
      inputs: ['attacker.discipline'],
      output: 'number',
    },
    {
      id: 'duel-initiative',
      name: 'Duel Initiative',
      description: 'Base: actor.discipline*3 + actor.composure*2, compared to opponent',
      inputs: ['actor.discipline', 'actor.composure'],
      output: 'number',
    },
    {
      id: 'meditation-recovery',
      name: 'Meditation Recovery',
      description: 'Ki restored: 5 + actor.composure*2, HP restored: actor.composure',
      inputs: ['actor.composure'],
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
    statusTags: ['buff', 'debuff', 'dishonor', 'focused'],
    combatTags: ['melee', 'formal-duel', 'assassination'],
  },
};
