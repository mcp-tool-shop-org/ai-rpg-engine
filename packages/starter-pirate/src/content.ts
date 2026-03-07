// Black Flag Requiem — content definitions

import type { EntityState, ZoneState, GameManifest, ActionIntent, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import type { DialogueDefinition, ProgressionTreeDefinition } from '@ai-rpg-engine/content-schema';
import type { DistrictDefinition } from '@ai-rpg-engine/modules';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';

// --- Manifest ---

export const manifest: GameManifest = {
  id: 'black-flag-requiem',
  title: 'Black Flag Requiem',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'pirate-minimal',
  modules: [
    'traversal-core',
    'status-core',
    'combat-core',
    'inventory-core',
    'dialogue-core',
  ],
  contentPacks: ['black-flag-requiem'],
};

// --- Player ---

export const player: EntityState = {
  id: 'captain',
  blueprintId: 'captain',
  type: 'player',
  name: 'Captain',
  tags: ['player', 'pirate', 'captain'],
  stats: { brawn: 5, cunning: 6, 'sea-legs': 5 },
  resources: { hp: 20, morale: 15 },
  statuses: [],
  inventory: [],
  zoneId: 'ship-deck',
};

// --- NPCs ---

export const quartermaster: EntityState = {
  id: 'quartermaster_bly',
  blueprintId: 'quartermaster',
  type: 'npc',
  name: 'Quartermaster Bly',
  tags: ['npc', 'pirate', 'crew', 'male'],
  stats: { brawn: 4, cunning: 5, 'sea-legs': 6 },
  resources: { hp: 16, morale: 12 },
  statuses: [],
  zoneId: 'ship-deck',
};

export const cartographer: EntityState = {
  id: 'cartographer_mara',
  blueprintId: 'cartographer',
  type: 'npc',
  name: 'Mara the Cartographer',
  tags: ['npc', 'neutral', 'knowledge', 'female'],
  stats: { brawn: 2, cunning: 7, 'sea-legs': 4 },
  resources: { hp: 8, morale: 10 },
  statuses: [],
  zoneId: 'port-tavern',
};

export const governor: EntityState = {
  id: 'governor_vane',
  blueprintId: 'governor',
  type: 'npc',
  name: 'Governor Vane',
  tags: ['npc', 'colonial', 'authority', 'male'],
  stats: { brawn: 3, cunning: 6, 'sea-legs': 2 },
  resources: { hp: 10, morale: 18 },
  statuses: [],
  zoneId: 'governors-fort',
};

// --- Enemies ---

export const navySailor: EntityState = {
  id: 'navy_sailor',
  blueprintId: 'navy-sailor',
  type: 'enemy',
  name: 'Navy Sailor',
  tags: ['enemy', 'colonial', 'navy', 'male'],
  stats: { brawn: 5, cunning: 3, 'sea-legs': 4 },
  resources: { hp: 16, morale: 14 },
  statuses: [],
  zoneId: 'governors-fort',
  ai: {
    profileId: 'aggressive',
    goals: ['enforce-law', 'protect-governor'],
    fears: ['mutiny'],
    alertLevel: 0,
    knowledge: {},
  },
};

export const seaBeast: EntityState = {
  id: 'drowned_guardian',
  blueprintId: 'sea-beast',
  type: 'enemy',
  name: 'Drowned Guardian',
  tags: ['enemy', 'cursed', 'creature', 'aquatic'],
  stats: { brawn: 7, cunning: 2, 'sea-legs': 8 },
  resources: { hp: 22, morale: 30 },
  statuses: [],
  zoneId: 'sunken-shrine',
  ai: {
    profileId: 'aggressive',
    goals: ['guard-shrine', 'destroy-trespassers'],
    fears: [],
    alertLevel: 0,
    knowledge: {},
  },
};

// --- Zones ---

export const zones: ZoneState[] = [
  {
    id: 'ship-deck',
    roomId: 'ship',
    name: 'Ship Deck',
    tags: ['outdoor', 'ship', 'home-base'],
    neighbors: ['port-tavern', 'open-water'],
    light: 5,
    interactables: ['helm', 'cannons', 'cargo-hold'],
  },
  {
    id: 'port-tavern',
    roomId: 'port-haven',
    name: 'The Rusty Anchor',
    tags: ['indoor', 'social', 'tavern', 'neutral'],
    neighbors: ['ship-deck', 'governors-fort'],
    light: 3,
    noise: 6,
    interactables: ['notice-board', 'barkeep', 'rum-barrel'],
  },
  {
    id: 'governors-fort',
    roomId: 'port-haven',
    name: "Governor's Fort",
    tags: ['outdoor', 'fortified', 'colonial', 'hostile'],
    neighbors: ['port-tavern', 'open-water'],
    light: 5,
    stability: 8,
    interactables: ['gate', 'stockade', 'treasury-door'],
  },
  {
    id: 'open-water',
    roomId: 'archipelago',
    name: 'Open Water',
    tags: ['outdoor', 'sea', 'travel', 'weather'],
    neighbors: ['ship-deck', 'governors-fort', 'sunken-shrine'],
    light: 6,
    hazards: ['storm-surge'],
  },
  {
    id: 'sunken-shrine',
    roomId: 'archipelago',
    name: 'Sunken Shrine',
    tags: ['outdoor', 'cursed', 'dark', 'underwater'],
    neighbors: ['open-water'],
    light: 1,
    stability: 2,
    hazards: ['drowning-pressure', 'curse-whisper'],
    interactables: ['barnacle-altar', 'treasure-chest', 'coral-idol'],
  },
];

// --- Dialogue ---

export const cartographerDialogue: DialogueDefinition = {
  id: 'cartographer-maps',
  speakers: ['Mara the Cartographer'],
  entryNodeId: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Mara the Cartographer',
      text: "Captain. I've charted the reef line south of here. There's a shrine beneath the waves — old as the islands themselves. The governor wants it sealed. I want to know why.",
      choices: [
        {
          id: 'buy-map',
          text: "What's the price for the chart?",
          nextNodeId: 'price',
        },
        {
          id: 'ask-shrine',
          text: 'What do you know about the shrine?',
          nextNodeId: 'shrine-lore',
        },
      ],
    },
    price: {
      id: 'price',
      speaker: 'Mara the Cartographer',
      text: "Not coin. Bring me something from the shrine — proof it's real. Do that, and the chart is yours forever.",
      choices: [
        {
          id: 'accept-deal',
          text: "You've got a deal.",
          nextNodeId: 'end',
          effects: [
            { type: 'set-global', target: 'actor', params: { key: 'shrine-deal', value: true } },
          ],
        },
      ],
    },
    'shrine-lore': {
      id: 'shrine-lore',
      speaker: 'Mara the Cartographer',
      text: 'Sailors say a drowned fleet guards it. Some say the treasure is cursed. I say curses are just stories that keep cowards ashore.',
      choices: [
        { id: 'to-price', text: 'About that chart...', nextNodeId: 'price' },
        { id: 'leave', text: 'I will think on it.', nextNodeId: 'end' },
      ],
    },
    end: {
      id: 'end',
      speaker: 'Mara the Cartographer',
      text: "Fair winds, Captain. Don't trust the governor's men near open water.",
    },
  },
};

// --- Districts ---

export const districts: DistrictDefinition[] = [
  {
    id: 'port-haven',
    name: 'Port Haven',
    zoneIds: ['port-tavern', 'governors-fort'],
    tags: ['colonial', 'trade'],
    controllingFaction: 'colonial-navy',
  },
  {
    id: 'cursed-waters',
    name: 'Cursed Waters',
    zoneIds: ['open-water', 'sunken-shrine'],
    tags: ['sea', 'cursed', 'dangerous'],
  },
];

// --- Progression ---

export const seamanshipTree: ProgressionTreeDefinition = {
  id: 'seamanship',
  name: 'Seamanship',
  currency: 'xp',
  nodes: [
    {
      id: 'sea-hardened',
      name: 'Sea-Hardened',
      cost: 10,
      effects: [
        { type: 'resource-boost', params: { resource: 'hp', amount: 5 } },
        { type: 'stat-boost', params: { stat: 'sea-legs', amount: 1 } },
      ],
    },
    {
      id: 'ruthless',
      name: 'Ruthless',
      cost: 15,
      effects: [
        { type: 'stat-boost', params: { stat: 'brawn', amount: 1 } },
        { type: 'grant-tag', params: { tag: 'feared' } },
      ],
    },
    {
      id: 'dread-captain',
      name: 'Dread Captain',
      cost: 25,
      requires: ['sea-hardened', 'ruthless'],
      effects: [
        { type: 'resource-boost', params: { resource: 'morale', amount: 10 } },
        { type: 'stat-boost', params: { stat: 'cunning', amount: 2 } },
      ],
    },
  ],
};

// --- Item Effect ---

export const rumBarrelEffect = {
  itemId: 'rum-barrel',
  use: (action: ActionIntent, world: WorldState): ResolvedEvent[] => {
    const actor = world.entities[action.actorId];
    if (!actor) return [];

    const previous = actor.resources.morale ?? 0;
    actor.resources.morale = Math.min(30, previous + 8);

    return [{
      id: nextId('evt'),
      tick: action.issuedAtTick,
      type: 'resource.changed',
      actorId: action.actorId,
      payload: {
        entityId: actor.id,
        resource: 'morale',
        previous,
        current: actor.resources.morale,
        delta: actor.resources.morale - previous,
      },
    }];
  },
};

// --- Pack Metadata ---

export const packMeta: PackMetadata = {
  id: 'black-flag-requiem',
  name: 'Black Flag Requiem',
  tagline: 'Your ship is your kingdom, and beneath the waves the drowned dead wait.',
  genres: ['pirate'],
  difficulty: 'intermediate',
  tones: ['gritty', 'atmospheric'],
  tags: ['naval', 'treasure', 'cursed', 'exploration'],
  engineVersion: '2.0.0',
  version: '2.0.0',
  description: 'Captain a pirate vessel through port towns and cursed waters. Strike deals, fight the navy, and brave a sunken shrine.',
  narratorTone: 'pirate adventure, salty, atmospheric, treacherous',
};

// --- Build Catalog ---

export const buildCatalog: BuildCatalog = {
  packId: 'black-flag-requiem',
  statBudget: 3,
  maxTraits: 3,
  requiredFlaws: 1,
  archetypes: [
    {
      id: 'corsair',
      name: 'Corsair',
      description: 'Boarding specialist, fear incarnate',
      statPriorities: { brawn: 7, cunning: 4, 'sea-legs': 3 },
      startingTags: ['raider', 'corsair'],
      progressionTreeId: 'seamanship',
      grantedVerbs: ['plunder'],
    },
    {
      id: 'privateer',
      name: 'Privateer',
      description: 'Schemer with a letter of marque',
      statPriorities: { brawn: 3, cunning: 7, 'sea-legs': 4 },
      startingTags: ['schemer', 'privateer'],
      progressionTreeId: 'seamanship',
      grantedVerbs: ['navigate'],
    },
    {
      id: 'helmsman',
      name: 'Helmsman',
      description: 'Born on the waves, reads the wind',
      statPriorities: { brawn: 4, cunning: 3, 'sea-legs': 7 },
      startingTags: ['sailor', 'helmsman'],
      progressionTreeId: 'seamanship',
      grantedVerbs: ['navigate'],
    },
  ],
  backgrounds: [
    {
      id: 'navy-deserter',
      name: 'Navy Deserter',
      description: 'Trained by the Crown, then betrayed it',
      statModifiers: { brawn: 1, cunning: -1 },
      startingTags: ['deserter'],
    },
    {
      id: 'merchants-son',
      name: "Merchant's Son",
      description: 'Knows the price of everything and the value of nothing',
      statModifiers: { cunning: 1, brawn: -1 },
      startingTags: ['merchant-blood'],
    },
    {
      id: 'island-born',
      name: 'Island Born',
      description: 'Salt in the blood from birth',
      statModifiers: { 'sea-legs': 1 },
      startingTags: ['islander'],
    },
  ],
  traits: [
    {
      id: 'sea-devil',
      name: 'Sea Devil',
      description: 'The crew trusts you in any storm',
      category: 'perk',
      effects: [{ type: 'resource-modifier', resource: 'morale', amount: 3 }],
    },
    {
      id: 'cutthroat',
      name: 'Cutthroat',
      description: 'A reputation that enters the room before you do',
      category: 'perk',
      effects: [
        { type: 'stat-modifier', stat: 'brawn', amount: 1 },
        { type: 'grant-tag', tag: 'feared' },
      ],
    },
    {
      id: 'superstitious',
      name: 'Superstitious',
      description: 'Sees omens in every wave and gull',
      category: 'flaw',
      effects: [
        { type: 'stat-modifier', stat: 'cunning', amount: -1 },
        { type: 'grant-tag', tag: 'superstitious' },
      ],
    },
    {
      id: 'landlubber',
      name: 'Landlubber',
      description: 'Still gets seasick in calm waters',
      category: 'flaw',
      effects: [{ type: 'stat-modifier', stat: 'sea-legs', amount: -1 }],
      incompatibleWith: ['sea-devil'],
    },
  ],
  disciplines: [
    {
      id: 'occultist',
      name: 'Occultist',
      description: 'Communes with drowned spirits and cursed relics',
      grantedVerb: 'commune',
      passive: { type: 'stat-modifier', stat: 'cunning', amount: 1 },
      drawback: { type: 'resource-modifier', resource: 'morale', amount: -2 },
    },
    {
      id: 'surgeon',
      name: 'Surgeon',
      description: 'Ship sawbones, keeps the crew breathing',
      grantedVerb: 'scan',
      passive: { type: 'stat-modifier', stat: 'sea-legs', amount: 1 },
      drawback: { type: 'stat-modifier', stat: 'brawn', amount: -1 },
    },
  ],
  crossTitles: [
    { archetypeId: 'corsair', disciplineId: 'occultist', title: 'Storm Gunner', tags: ['storm-gunner'] },
    { archetypeId: 'corsair', disciplineId: 'surgeon', title: 'Sawbones Raider', tags: ['sawbones-raider'] },
    { archetypeId: 'privateer', disciplineId: 'occultist', title: 'Hex Broker', tags: ['hex-broker'] },
    { archetypeId: 'privateer', disciplineId: 'surgeon', title: 'Plague Merchant', tags: ['plague-merchant'] },
    { archetypeId: 'helmsman', disciplineId: 'occultist', title: 'Tide Caller', tags: ['tide-caller'] },
    { archetypeId: 'helmsman', disciplineId: 'surgeon', title: 'Salvage Prophet', tags: ['salvage-prophet'] },
  ],
  entanglements: [
    {
      id: 'corsair-surgeon',
      archetypeId: 'corsair',
      disciplineId: 'surgeon',
      description: 'A raider who heals draws suspicion from the crew — mercy is weakness at sea',
      effects: [{ type: 'resource-modifier', resource: 'morale', amount: -2 }],
    },
  ],
};
