// Cyberpunk Minimal Ruleset — for Neon Lockbox and similar content

import type { RulesetDefinition } from '@ai-rpg-engine/core';

export const cyberpunkMinimalRuleset: RulesetDefinition = {
  id: 'cyberpunk-minimal',
  name: 'Cyberpunk Minimal',
  version: '0.1.0',

  stats: [
    { id: 'chrome', name: 'Chrome', min: 1, max: 20, default: 5 },
    { id: 'reflex', name: 'Reflex', min: 1, max: 20, default: 5 },
    { id: 'netrunning', name: 'Netrunning', min: 1, max: 20, default: 5 },
  ],

  resources: [
    { id: 'hp', name: 'HP', min: 0, max: 100, default: 15 },
    { id: 'ice', name: 'ICE', min: 0, max: 50, default: 10 },
    { id: 'bandwidth', name: 'Bandwidth', min: 0, max: 20, default: 8, regenRate: 2 },
  ],

  verbs: [
    { id: 'move', name: 'Move', description: 'Navigate to adjacent node' },
    { id: 'inspect', name: 'Scan', description: 'Scan current node or target' },
    { id: 'hack', name: 'Hack', tags: ['netrunning'], description: 'Attempt to breach a system' },
    { id: 'attack', name: 'Zap', tags: ['combat'], description: 'Hit with a stun baton or similar' },
    { id: 'guard', name: 'Guard', tags: ['combat', 'defensive'], description: 'Brace for incoming attacks, reducing damage taken' },
    { id: 'disengage', name: 'Disengage', tags: ['combat', 'movement'], description: 'Attempt to break from combat and withdraw' },
    { id: 'use', name: 'Use', description: 'Use a program or item' },
    { id: 'speak', name: 'Speak', tags: ['dialogue'], description: 'Talk to an NPC' },
    { id: 'choose', name: 'Choose', tags: ['dialogue'], description: 'Select a dialogue option' },
    { id: 'jack-in', name: 'Jack In', tags: ['netrunning'], description: 'Connect to a network node' },
    { id: 'use-ability', name: 'Use Ability', tags: ['ability'], description: 'Activate a special ability or program' },
  ],

  formulas: [
    {
      id: 'hack-chance',
      name: 'Hack Chance',
      description: 'Base: 30 + netrunning*7 - target.ice*4, clamped 5-95',
      inputs: ['actor.netrunning', 'target.ice'],
      output: 'number (0-100)',
    },
    {
      id: 'hit-chance',
      name: 'Hit Chance',
      description: 'Base: 40 + attacker.reflex*6 - target.reflex*3',
      inputs: ['attacker.reflex', 'target.reflex'],
      output: 'number (0-100)',
    },
    {
      id: 'damage',
      name: 'Damage',
      description: 'Base: attacker.chrome, minimum 1',
      inputs: ['attacker.chrome'],
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
    entityTypes: ['runner', 'npc', 'ice-agent', 'drone', 'program'],
    statusTags: ['buff', 'debuff', 'virus', 'firewall'],
    networkTags: ['node', 'subnet', 'firewall', 'data-vault'],
  },
};
