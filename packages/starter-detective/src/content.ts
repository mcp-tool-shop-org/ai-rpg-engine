// Gaslight Detective — content definitions

import type { EntityState, ZoneState, GameManifest, ActionIntent, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import type { DialogueDefinition, ProgressionTreeDefinition } from '@ai-rpg-engine/content-schema';
import type { DistrictDefinition } from '@ai-rpg-engine/modules';

// --- Manifest ---

export const manifest: GameManifest = {
  id: 'gaslight-detective',
  title: 'Gaslight Detective',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'detective-minimal',
  modules: [
    'traversal-core',
    'status-core',
    'combat-core',
    'inventory-core',
    'dialogue-core',
  ],
  contentPacks: ['gaslight-detective'],
};

// --- Player ---

export const player: EntityState = {
  id: 'inspector',
  blueprintId: 'inspector',
  type: 'player',
  name: 'Inspector',
  tags: ['player', 'law', 'investigator'],
  stats: { perception: 7, eloquence: 5, grit: 4 },
  resources: { hp: 15, composure: 12 },
  statuses: [],
  inventory: [],
  zoneId: 'crime-scene',
};

// --- NPCs ---

export const widow: EntityState = {
  id: 'widow_ashford',
  blueprintId: 'widow',
  type: 'npc',
  name: 'Lady Ashford',
  tags: ['npc', 'aristocracy', 'suspect', 'female'],
  stats: { perception: 3, eloquence: 7, grit: 2 },
  resources: { hp: 8, composure: 18 },
  statuses: [],
  zoneId: 'parlour',
};

export const constable: EntityState = {
  id: 'constable_pike',
  blueprintId: 'constable',
  type: 'npc',
  name: 'Constable Pike',
  tags: ['npc', 'law', 'police', 'male'],
  stats: { perception: 4, eloquence: 3, grit: 6 },
  resources: { hp: 18, composure: 10 },
  statuses: [],
  zoneId: 'crime-scene',
};

export const servant: EntityState = {
  id: 'mrs_calloway',
  blueprintId: 'servant',
  type: 'npc',
  name: 'Mrs Calloway',
  tags: ['npc', 'servant', 'witness', 'female'],
  stats: { perception: 5, eloquence: 4, grit: 3 },
  resources: { hp: 8, composure: 8 },
  statuses: [],
  zoneId: 'servants-hall',
};

// --- Enemies ---

export const thug: EntityState = {
  id: 'dock_thug',
  blueprintId: 'thug',
  type: 'enemy',
  name: 'Dock Thug',
  tags: ['enemy', 'criminal', 'male'],
  stats: { perception: 3, eloquence: 2, grit: 6 },
  resources: { hp: 14, composure: 6 },
  statuses: [],
  zoneId: 'back-alley',
  ai: {
    profileId: 'aggressive',
    goals: ['guard-territory', 'intimidate'],
    fears: ['outnumbered'],
    alertLevel: 0,
    knowledge: {},
  },
};

// --- Zones ---

export const zones: ZoneState[] = [
  {
    id: 'crime-scene',
    roomId: 'ashford-manor',
    name: 'The Study',
    tags: ['indoor', 'crime-scene', 'locked-room'],
    neighbors: ['parlour', 'servants-hall'],
    light: 3,
    interactables: ['desk', 'brandy-glass', 'fireplace', 'window-latch'],
  },
  {
    id: 'parlour',
    roomId: 'ashford-manor',
    name: 'The Parlour',
    tags: ['indoor', 'aristocratic', 'social'],
    neighbors: ['crime-scene', 'front-entrance'],
    light: 5,
    interactables: ['portrait', 'letter-tray', 'tea-set'],
  },
  {
    id: 'servants-hall',
    roomId: 'ashford-manor',
    name: "Servants' Hall",
    tags: ['indoor', 'below-stairs', 'hidden'],
    neighbors: ['crime-scene', 'back-alley'],
    light: 2,
    interactables: ['ledger', 'key-rack', 'coal-chute'],
  },
  {
    id: 'front-entrance',
    roomId: 'ashford-manor',
    name: 'Front Entrance',
    tags: ['outdoor', 'public', 'foggy'],
    neighbors: ['parlour', 'back-alley'],
    light: 2,
    noise: 4,
  },
  {
    id: 'back-alley',
    roomId: 'ashford-manor',
    name: 'Back Alley',
    tags: ['outdoor', 'dark', 'dangerous'],
    neighbors: ['servants-hall', 'front-entrance'],
    light: 1,
    noise: 2,
    stability: 3,
    hazards: ['fog-chill'],
  },
];

// --- Dialogue ---

export const widowDialogue: DialogueDefinition = {
  id: 'widow-interrogation',
  speakers: ['Lady Ashford'],
  entryNodeId: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Lady Ashford',
      text: 'Inspector. I trust you will resolve this dreadful business quickly. My husband was a man of enemies, but none I thought capable of... this.',
      choices: [
        {
          id: 'sympathize',
          text: 'My condolences, Lady Ashford. When did you last see your husband?',
          nextNodeId: 'timeline',
        },
        {
          id: 'press',
          text: 'You mentioned enemies. I need names.',
          nextNodeId: 'enemies',
          effects: [
            { type: 'set-global', target: 'actor', params: { key: 'pressed-widow', value: true } },
          ],
        },
      ],
    },
    timeline: {
      id: 'timeline',
      speaker: 'Lady Ashford',
      text: 'Supper. Around eight. He retired to his study afterward. The door was locked from the inside when the constable arrived.',
      choices: [
        { id: 'ask-key', text: 'Who has a key to the study?', nextNodeId: 'keys' },
        { id: 'end-polite', text: 'Thank you. I may return with more questions.', nextNodeId: 'end' },
      ],
    },
    enemies: {
      id: 'enemies',
      speaker: 'Lady Ashford',
      text: 'There was a dockworker — some dispute over unpaid labor. And his business partner, Mr Hargreaves. But surely you do not suspect me?',
      choices: [
        { id: 'reassure', text: 'Everyone is a suspect until the evidence says otherwise.', nextNodeId: 'end' },
      ],
    },
    keys: {
      id: 'keys',
      speaker: 'Lady Ashford',
      text: 'Only my husband. And Mrs Calloway, the housekeeper. She keeps a spare on the key rack downstairs.',
      choices: [
        {
          id: 'note-key',
          text: 'Interesting. I will speak with Mrs Calloway.',
          nextNodeId: 'end',
          effects: [
            { type: 'set-global', target: 'actor', params: { key: 'knows-spare-key', value: true } },
          ],
        },
      ],
    },
    end: {
      id: 'end',
      speaker: 'Lady Ashford',
      text: 'Do what you must, Inspector. But do it quietly. The family name cannot bear more scandal.',
    },
  },
};

// --- Districts ---

export const districts: DistrictDefinition[] = [
  {
    id: 'ashford-estate',
    name: 'Ashford Estate',
    zoneIds: ['crime-scene', 'parlour', 'servants-hall', 'front-entrance'],
    tags: ['aristocratic', 'private'],
  },
  {
    id: 'dockyards',
    name: 'The Dockyards',
    zoneIds: ['back-alley'],
    tags: ['industrial', 'dangerous'],
    controllingFaction: 'dockworkers',
  },
];

// --- Progression ---

export const deductionTree: ProgressionTreeDefinition = {
  id: 'deduction-mastery',
  name: 'Deduction Mastery',
  currency: 'xp',
  nodes: [
    {
      id: 'keen-eye',
      name: 'Keen Eye',
      cost: 10,
      effects: [
        { type: 'stat-boost', params: { stat: 'perception', amount: 1 } },
      ],
    },
    {
      id: 'silver-tongue',
      name: 'Silver Tongue',
      cost: 15,
      effects: [
        { type: 'stat-boost', params: { stat: 'eloquence', amount: 1 } },
        { type: 'grant-tag', params: { tag: 'persuasive' } },
      ],
    },
    {
      id: 'iron-nerves',
      name: 'Iron Nerves',
      cost: 25,
      requires: ['keen-eye'],
      effects: [
        { type: 'resource-boost', params: { resource: 'composure', amount: 5 } },
        { type: 'stat-boost', params: { stat: 'grit', amount: 1 } },
      ],
    },
  ],
};

// --- Item Effect ---

export const smellingSaltsEffect = {
  itemId: 'smelling-salts',
  use: (action: ActionIntent, world: WorldState): ResolvedEvent[] => {
    const actor = world.entities[action.actorId];
    if (!actor) return [];

    const previous = actor.resources.composure ?? 0;
    actor.resources.composure = Math.min(20, previous + 8);

    return [{
      id: nextId('evt'),
      tick: action.issuedAtTick,
      type: 'resource.changed',
      actorId: action.actorId,
      payload: {
        entityId: actor.id,
        resource: 'composure',
        previous,
        current: actor.resources.composure,
        delta: actor.resources.composure - previous,
      },
    }];
  },
};
