// Ruleset — declarative contract for your game's stats, resources, and verbs

import type { RulesetDefinition } from '@ai-rpg-engine/core';

export const myRuleset: RulesetDefinition = {
  id: 'my-game',
  name: 'My Game',
  version: '0.1.0',

  // ═══════════════════════════════════════════════════════════════
  // STATS — three combat dimensions + any exploration/social stats
  // ═══════════════════════════════════════════════════════════════
  stats: [
    // Combat dimensions (required — mapped in buildCombatStack)
    { id: 'power', name: 'Power', min: 1, max: 20, default: 5 },      // → attack
    { id: 'speed', name: 'Speed', min: 1, max: 20, default: 5 },      // → precision
    { id: 'grit', name: 'Grit', min: 1, max: 20, default: 5 },       // → resolve
    // Add exploration/social stats here if needed
  ],

  // ═══════════════════════════════════════════════════════════════
  // RESOURCES — hp is required; add your starter-specific resource
  // ═══════════════════════════════════════════════════════════════
  resources: [
    { id: 'hp', name: 'HP', min: 0, max: 100, default: 25 },
    { id: 'stamina', name: 'Stamina', min: 0, max: 50, default: 10, regenRate: 1 },
    // YOUR RESOURCE: the one thing that makes your game feel different
    { id: 'tension', name: 'Tension', min: 0, max: 100, default: 0 },
  ],

  // ═══════════════════════════════════════════════════════════════
  // VERBS — actions available to players and AI
  // ═══════════════════════════════════════════════════════════════
  verbs: [
    { id: 'move', name: 'Move', description: 'Travel to an adjacent zone' },
    { id: 'inspect', name: 'Inspect', description: 'Examine surroundings' },
    { id: 'attack', name: 'Attack', tags: ['combat'], description: 'Strike a target' },
    { id: 'guard', name: 'Guard', tags: ['combat', 'defensive'], description: 'Reduce incoming damage' },
    { id: 'brace', name: 'Brace', tags: ['combat', 'defensive'], description: 'Stabilize and resist status effects' },
    { id: 'disengage', name: 'Disengage', tags: ['combat', 'movement'], description: 'Break from combat' },
    { id: 'reposition', name: 'Reposition', tags: ['combat', 'movement'], description: 'Shift engagement state' },
    { id: 'use', name: 'Use', description: 'Use an item' },
    { id: 'speak', name: 'Speak', tags: ['dialogue'], description: 'Talk to an NPC' },
    { id: 'choose', name: 'Choose', tags: ['dialogue'], description: 'Select a dialogue option' },
    { id: 'use-ability', name: 'Use Ability', tags: ['ability'], description: 'Activate a special ability' },
  ],

  formulas: [
    { id: 'hit-chance', name: 'Hit Chance', description: 'Standard: 50 + speed*5 - target.speed*3', inputs: ['attacker.speed', 'target.speed'], output: 'number (0-100)' },
    { id: 'damage', name: 'Damage', description: 'Standard: attacker.power', inputs: ['attacker.power'], output: 'number' },
  ],

  defaultModules: [
    'traversal-core',
    'combat-core',
    'cognition-core',
    'engagement-core',
    'combat-tactics',
    'combat-intent',
    'combat-recovery',
    'combat-state-narration',
  ],

  progressionModels: [],
};
