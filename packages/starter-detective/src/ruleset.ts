// Gaslight Detective — ruleset definition

import type { RulesetDefinition } from '@ai-rpg-engine/core';

export const detectiveMinimalRuleset: RulesetDefinition = {
  id: 'detective-minimal',
  name: 'Detective Minimal',
  version: '0.1.0',

  stats: [
    { id: 'perception', name: 'Perception', min: 1, max: 20, default: 6 },
    { id: 'eloquence', name: 'Eloquence', min: 1, max: 20, default: 5 },
    { id: 'grit', name: 'Grit', min: 1, max: 20, default: 4 },
  ],

  resources: [
    { id: 'hp', name: 'HP', min: 0, max: 30, default: 15 },
    { id: 'composure', name: 'Composure', min: 0, max: 20, default: 12, regenRate: 1 },
  ],

  verbs: [
    { id: 'move', name: 'Move', description: 'Move to an adjacent location' },
    { id: 'inspect', name: 'Inspect', description: 'Examine an object, person, or scene for clues' },
    { id: 'attack', name: 'Strike', tags: ['combat'], description: 'Physical confrontation' },
    { id: 'use', name: 'Use', description: 'Use an item from inventory' },
    { id: 'speak', name: 'Speak', tags: ['dialogue'], description: 'Engage in conversation' },
    { id: 'choose', name: 'Choose', tags: ['dialogue'], description: 'Select a dialogue option' },
    { id: 'interrogate', name: 'Interrogate', tags: ['dialogue', 'investigation'], description: 'Press a subject for information using persuasion or intimidation' },
    { id: 'deduce', name: 'Deduce', tags: ['investigation'], description: 'Draw a conclusion from gathered evidence' },
  ],

  formulas: [
    {
      id: 'hit-chance',
      name: 'Hit Chance',
      description: 'Attacker grit vs target grit',
      inputs: ['attacker.grit', 'target.grit'],
      output: 'number (0-100)',
    },
    {
      id: 'damage',
      name: 'Damage',
      description: 'Base: attacker grit, minimum 1',
      inputs: ['attacker.grit'],
      output: 'number',
    },
    {
      id: 'interrogation-success',
      name: 'Interrogation Success',
      description: 'Eloquence vs target composure',
      inputs: ['attacker.eloquence', 'target.composure'],
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
    entityTypes: ['player', 'npc', 'suspect', 'enemy'],
    statusTags: ['buff', 'debuff', 'social', 'evidence'],
    combatTags: ['melee', 'brawl'],
  },
};
