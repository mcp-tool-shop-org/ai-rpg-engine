// Shared test fixtures for character-creation tests

import type { RulesetDefinition } from '@ai-rpg-engine/core';
import type { BuildCatalog, CharacterBuild } from './types.js';

export const testRuleset: RulesetDefinition = {
  id: 'test-ruleset',
  name: 'Test Ruleset',
  version: '1.0.0',
  stats: [
    { id: 'str', name: 'Strength', min: 1, max: 10, default: 3 },
    { id: 'dex', name: 'Dexterity', min: 1, max: 10, default: 3 },
    { id: 'wis', name: 'Wisdom', min: 1, max: 10, default: 3 },
  ],
  resources: [
    { id: 'hp', name: 'HP', min: 0, max: 50, default: 20 },
    { id: 'mana', name: 'Mana', min: 0, max: 30, default: 10 },
  ],
  verbs: [
    { id: 'move', name: 'Move', tags: [], description: 'Move between zones' },
    { id: 'attack', name: 'Attack', tags: ['combat'], description: 'Attack a target' },
    { id: 'pray', name: 'Pray', tags: ['divine'], description: 'Invoke divine aid' },
    { id: 'steal', name: 'Steal', tags: ['stealth'], description: 'Steal from a target' },
  ],
  formulas: [],
  defaultModules: ['traversal-core', 'combat-core'],
  progressionModels: [],
};

export const testCatalog: BuildCatalog = {
  packId: 'test-pack',
  statBudget: 3,
  maxTraits: 3,
  requiredFlaws: 1,
  archetypes: [
    {
      id: 'warrior',
      name: 'Warrior',
      description: 'Strong melee fighter',
      statPriorities: { str: 6, dex: 4, wis: 2 },
      startingTags: ['martial'],
      progressionTreeId: 'combat-mastery',
    },
    {
      id: 'mage',
      name: 'Mage',
      description: 'Arcane caster',
      statPriorities: { str: 2, dex: 3, wis: 7 },
      resourceOverrides: { mana: 20 },
      startingTags: ['arcane'],
      startingInventory: ['spellbook'],
      progressionTreeId: 'arcane-mastery',
      grantedVerbs: ['pray'],
    },
    {
      id: 'rogue',
      name: 'Rogue',
      description: 'Stealthy trickster',
      statPriorities: { str: 3, dex: 7, wis: 2 },
      startingTags: ['shadow'],
      startingInventory: ['lockpick'],
      progressionTreeId: 'shadow-mastery',
      grantedVerbs: ['steal'],
    },
  ],
  backgrounds: [
    {
      id: 'noble',
      name: 'Noble Born',
      description: 'Raised in privilege',
      statModifiers: { wis: 1, str: -1 },
      startingTags: ['noble'],
      startingInventory: ['signet-ring'],
    },
    {
      id: 'street',
      name: 'Street Urchin',
      description: 'Grew up in the gutters',
      statModifiers: { dex: 1 },
      startingTags: ['streetwise'],
    },
    {
      id: 'military',
      name: 'Military Service',
      description: 'Trained by the army',
      statModifiers: { str: 1, wis: -1 },
      startingTags: ['disciplined'],
    },
  ],
  traits: [
    {
      id: 'tough',
      name: 'Tough',
      description: 'Extra resilient',
      category: 'perk',
      effects: [{ type: 'resource-modifier', resource: 'hp', amount: 5 }],
    },
    {
      id: 'quick',
      name: 'Quick Reflexes',
      description: 'Faster reactions',
      category: 'perk',
      effects: [{ type: 'stat-modifier', stat: 'dex', amount: 1 }],
    },
    {
      id: 'frail',
      name: 'Frail',
      description: 'Weak constitution',
      category: 'flaw',
      effects: [{ type: 'resource-modifier', resource: 'hp', amount: -3 }],
      incompatibleWith: ['tough'],
    },
    {
      id: 'cursed',
      name: 'Cursed',
      description: 'Bear a dark mark',
      category: 'flaw',
      effects: [
        { type: 'stat-modifier', stat: 'wis', amount: -1 },
        { type: 'grant-tag', tag: 'curse-touched' },
      ],
    },
  ],
  disciplines: [
    {
      id: 'occultist',
      name: 'Occultist',
      description: 'Dabbles in forbidden knowledge',
      grantedVerb: 'pray',
      passive: { type: 'stat-modifier', stat: 'wis', amount: 1 },
      drawback: { type: 'resource-modifier', resource: 'mana', amount: -3 },
    },
    {
      id: 'smuggler',
      name: 'Smuggler',
      description: 'Moves goods through dark channels',
      grantedVerb: 'steal',
      passive: { type: 'stat-modifier', stat: 'dex', amount: 1 },
      drawback: { type: 'faction-modifier', faction: 'guard', amount: -10 },
    },
  ],
  crossTitles: [
    { archetypeId: 'warrior', disciplineId: 'occultist', title: 'Grave Warden', tags: ['grave-warden'] },
    { archetypeId: 'warrior', disciplineId: 'smuggler', title: 'Iron Fence', tags: ['iron-fence'] },
    { archetypeId: 'mage', disciplineId: 'occultist', title: 'Doomcaller', tags: ['doomcaller'] },
    { archetypeId: 'mage', disciplineId: 'smuggler', title: 'Relic Runner', tags: ['relic-runner'] },
    { archetypeId: 'rogue', disciplineId: 'occultist', title: 'Ink-Seer', tags: ['ink-seer'] },
    { archetypeId: 'rogue', disciplineId: 'smuggler', title: 'Shadow Broker', tags: ['shadow-broker'] },
  ],
  entanglements: [
    {
      id: 'divine-smuggler',
      archetypeId: 'mage',
      disciplineId: 'smuggler',
      description: 'Arcane scholars who smuggle attract unwanted attention from the guard',
      effects: [{ type: 'grant-tag', tag: 'wanted' }],
    },
  ],
};

export const validBuild: CharacterBuild = {
  name: 'Aldric',
  archetypeId: 'warrior',
  backgroundId: 'military',
  traitIds: ['tough', 'cursed'],
  statAllocations: { str: 2, dex: 1 },
};

export const validBuildWithDiscipline: CharacterBuild = {
  name: 'Morrigan',
  archetypeId: 'mage',
  backgroundId: 'noble',
  traitIds: ['quick', 'cursed'],
  disciplineId: 'smuggler',
  portraitRef: 'portrait-morrigan-001',
};
