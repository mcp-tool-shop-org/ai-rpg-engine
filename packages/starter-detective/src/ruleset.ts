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
    // T0-tag-gate follow-on: every detective ability costs stamina, and the
    // prebuilt inspector carries it — but the ruleset never declared it, so
    // CREATED characters (whose resources come from ruleset defaults) started
    // with no stamina at all and could never afford a single ability.
    { id: 'stamina', name: 'Stamina', min: 0, max: 50, default: 10, regenRate: 1 },
    { id: 'composure', name: 'Composure', min: 0, max: 20, default: 12, regenRate: 1 },
    // F-92c78519: the trade-core buy/sell currency — declared here so the
    // HUD/status surfaces treat it like every other tracked resource.
    { id: 'coin', name: 'Coin', min: 0, max: 500, default: 0 },
  ],

  verbs: [
    { id: 'move', name: 'Move', description: 'Move to an adjacent location' },
    { id: 'inspect', name: 'Inspect', description: 'Examine an object, person, or scene for clues' },
    { id: 'attack', name: 'Strike', tags: ['combat'], description: 'Physical confrontation' },
    { id: 'guard', name: 'Guard', tags: ['combat', 'defensive'], description: 'Take a defensive stance, reducing damage taken' },
    { id: 'brace', name: 'Brace', tags: ['combat', 'defensive'], description: 'Plant your footing to steady yourself and recover balance' },
    { id: 'reposition', name: 'Reposition', tags: ['combat', 'movement'], description: 'Shift position to outflank a target or escape a bad spot' },
    { id: 'disengage', name: 'Disengage', tags: ['combat', 'movement'], description: 'Attempt to break from combat and withdraw' },
    { id: 'use', name: 'Use', description: 'Use an item from inventory' },
    { id: 'equip', name: 'Equip', tags: ['equipment'], description: 'Ready gear from your inventory (bare "equip" readies your only piece)' },
    { id: 'unequip', name: 'Unequip', tags: ['equipment'], description: 'Stow an equipped item back into your inventory' },
    { id: 'speak', name: 'Speak', tags: ['dialogue'], description: 'Engage in conversation' },
    { id: 'choose', name: 'Choose', tags: ['dialogue'], description: 'Select a dialogue option' },
    { id: 'use-ability', name: 'Use Ability', tags: ['ability'], description: 'Use a special ability' },
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
      id: 'guard-reduction',
      name: 'Guard Reduction',
      description: 'Fraction of damage absorbed when guarded (default 0.5)',
      inputs: ['defender.grit'],
      output: 'number (0-1)',
    },
    {
      id: 'disengage-chance',
      name: 'Disengage Chance',
      description: 'Success chance: 40 + perception*5 + eloquence*2, clamped 15-90',
      inputs: ['actor.eloquence', 'actor.perception'],
      output: 'number (0-100)',
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
