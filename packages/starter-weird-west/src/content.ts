// Dust Devil's Bargain — content definitions

import type { EntityState, ZoneState, GameManifest, ActionIntent, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import type { DialogueDefinition, ProgressionTreeDefinition } from '@ai-rpg-engine/content-schema';
import type { DistrictDefinition } from '@ai-rpg-engine/modules';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';

// --- Manifest ---

export const manifest: GameManifest = {
  id: 'dust-devils-bargain',
  title: "Dust Devil's Bargain",
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'weird-west-minimal',
  modules: [
    'traversal-core',
    'status-core',
    'combat-core',
    'inventory-core',
    'dialogue-core',
  ],
  contentPacks: ['dust-devils-bargain'],
};

// --- Player ---

export const player: EntityState = {
  id: 'drifter',
  blueprintId: 'drifter',
  type: 'player',
  name: 'The Drifter',
  tags: ['player', 'human', 'drifter', 'gunslinger'],
  stats: { grit: 5, 'draw-speed': 6, lore: 4 },
  resources: { hp: 18, resolve: 15, dust: 0 },
  statuses: [],
  inventory: [],
  zoneId: 'crossroads',
};

// --- NPCs ---

export const bartender: EntityState = {
  id: 'bartender_silas',
  blueprintId: 'bartender',
  type: 'npc',
  name: 'Silas',
  tags: ['npc', 'townsfolk', 'informant', 'male'],
  stats: { grit: 3, 'draw-speed': 2, lore: 5 },
  resources: { hp: 10, resolve: 12, dust: 0 },
  statuses: [],
  zoneId: 'saloon',
};

export const sheriff: EntityState = {
  id: 'sheriff_hale',
  blueprintId: 'sheriff',
  type: 'npc',
  name: 'Sheriff Hale',
  tags: ['npc', 'law', 'secretive', 'male'],
  stats: { grit: 6, 'draw-speed': 5, lore: 3 },
  resources: { hp: 16, resolve: 14, dust: 0 },
  statuses: [],
  zoneId: 'sheriffs-office',
};

// --- Enemies ---

export const revenant: EntityState = {
  id: 'dust_revenant',
  blueprintId: 'revenant',
  type: 'enemy',
  name: 'Dust Revenant',
  tags: ['enemy', 'undead', 'cursed', 'gunslinger'],
  stats: { grit: 6, 'draw-speed': 7, lore: 1 },
  resources: { hp: 14, resolve: 20, dust: 0 },
  statuses: [],
  zoneId: 'red-mesa-trail',
  ai: {
    profileId: 'aggressive',
    goals: ['guard-mesa', 'duel-intruders'],
    fears: ['sacred-symbols'],
    alertLevel: 0,
    knowledge: {},
  },
};

export const crawler: EntityState = {
  id: 'mesa_crawler',
  blueprintId: 'crawler',
  type: 'enemy',
  name: 'Mesa Crawler',
  tags: ['enemy', 'spirit', 'beast', 'supernatural'],
  stats: { grit: 4, 'draw-speed': 3, lore: 8 },
  resources: { hp: 10, resolve: 25, dust: 0 },
  statuses: [],
  zoneId: 'spirit-hollow',
  ai: {
    profileId: 'territorial',
    goals: ['guard-hollow', 'consume-resolve'],
    fears: [],
    alertLevel: 0,
    knowledge: {},
  },
};

// --- Zones ---

export const zones: ZoneState[] = [
  {
    id: 'crossroads',
    roomId: 'town',
    name: "Drifter's Crossroads",
    tags: ['outdoor', 'neutral', 'dusty'],
    neighbors: ['saloon', 'sheriffs-office', 'red-mesa-trail'],
    light: 5,
    interactables: ['signpost', 'hitching-post', 'wanted-poster'],
  },
  {
    id: 'saloon',
    roomId: 'town',
    name: 'The Dusty Spur Saloon',
    tags: ['indoor', 'social', 'safe'],
    neighbors: ['crossroads'],
    light: 3,
    interactables: ['bar', 'piano', 'notice-board'],
  },
  {
    id: 'sheriffs-office',
    roomId: 'town',
    name: "Sheriff's Office",
    tags: ['indoor', 'law', 'safe'],
    neighbors: ['crossroads'],
    light: 4,
    interactables: ['desk', 'gun-rack', 'cell-door', 'lockbox'],
  },
  {
    id: 'red-mesa-trail',
    roomId: 'badlands',
    name: 'Red Mesa Trail',
    tags: ['outdoor', 'hostile', 'cursed'],
    neighbors: ['crossroads', 'spirit-hollow'],
    light: 6,
    noise: 2,
    stability: 3,
    hazards: ['dust-storm', 'cursed-ground'],
    interactables: ['petroglyphs', 'bone-cairn'],
  },
  {
    id: 'spirit-hollow',
    roomId: 'badlands',
    name: 'Spirit Hollow',
    tags: ['outdoor', 'supernatural', 'sacred'],
    neighbors: ['red-mesa-trail'],
    light: 1,
    noise: 1,
    stability: 2,
    hazards: ['spirit-drain'],
    interactables: ['ley-line-crack', 'ancient-altar', 'whispering-stones'],
  },
];

// --- Dialogue ---

export const bartenderDialogue: DialogueDefinition = {
  id: 'bartender-intel',
  speakers: ['Silas'],
  entryNodeId: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Silas',
      text: "Stranger. You've got the look of someone who doesn't plan on staying long. Smart. This town's got a sickness, and it ain't the kind a doctor fixes.",
      choices: [
        {
          id: 'ask-mesa',
          text: "What's out at Red Mesa?",
          nextNodeId: 'mesa-info',
        },
        {
          id: 'ask-sheriff',
          text: 'What can you tell me about the sheriff?',
          nextNodeId: 'sheriff-info',
        },
      ],
    },
    'mesa-info': {
      id: 'mesa-info',
      speaker: 'Silas',
      text: "Cult moved in three months back. Call themselves the Red Congregation. They do things out there at night — chanting, fires. Folks who go looking don't come back right. Some don't come back at all.",
      choices: [
        {
          id: 'volunteer-mesa',
          text: "I'll check it out. What should I watch for?",
          nextNodeId: 'mesa-warning',
        },
        { id: 'leave-mesa', text: "Not my problem.", nextNodeId: 'end' },
      ],
    },
    'sheriff-info': {
      id: 'sheriff-info',
      speaker: 'Silas',
      text: "Hale's been sheriff longer than anyone can remember. Good man, or was. Lately he locks himself in that office. Won't talk about the mesa. Won't talk about the disappearances. Something's eating at him.",
      choices: [
        { id: 'to-mesa', text: 'And the mesa?', nextNodeId: 'mesa-info' },
        { id: 'leave-sheriff', text: "I'll keep that in mind.", nextNodeId: 'end' },
      ],
    },
    'mesa-warning': {
      id: 'mesa-warning',
      speaker: 'Silas',
      text: "The dust out there — it gets inside you. Not your lungs. Your head. Sage helps. Burns it out, slows it down. Take this bundle. And if you see a dead man walking with a gun on his hip... shoot first.",
      effects: [
        { type: 'set-global', target: 'actor', params: { key: 'mesa-mission', value: true } },
      ],
    },
    end: {
      id: 'end',
      speaker: 'Silas',
      text: "Suit yourself, stranger. Whiskey's two bits if you're staying.",
    },
  },
};

// --- Districts ---

export const districts: DistrictDefinition[] = [
  {
    id: 'town',
    name: 'Perdition',
    zoneIds: ['crossroads', 'saloon', 'sheriffs-office'],
    tags: ['civilized', 'frontier'],
    controllingFaction: 'townsfolk',
  },
  {
    id: 'badlands',
    name: 'The Badlands',
    zoneIds: ['red-mesa-trail', 'spirit-hollow'],
    tags: ['cursed', 'supernatural', 'hostile'],
    controllingFaction: 'red-congregation',
  },
];

// --- Progression ---

export const gunslingerTree: ProgressionTreeDefinition = {
  id: 'gunslinger',
  name: 'Gunslinger',
  currency: 'xp',
  nodes: [
    {
      id: 'quick-hand',
      name: 'Quick Hand',
      cost: 10,
      effects: [
        { type: 'stat-boost', params: { stat: 'draw-speed', amount: 1 } },
      ],
    },
    {
      id: 'iron-will',
      name: 'Iron Will',
      cost: 12,
      effects: [
        { type: 'stat-boost', params: { stat: 'grit', amount: 1 } },
        { type: 'resource-boost', params: { resource: 'resolve', amount: 3 } },
      ],
    },
    {
      id: 'dead-eye',
      name: 'Dead Eye',
      cost: 25,
      requires: ['quick-hand', 'iron-will'],
      effects: [
        { type: 'stat-boost', params: { stat: 'draw-speed', amount: 2 } },
        { type: 'grant-tag', params: { tag: 'dead-eye' } },
      ],
    },
  ],
};

// --- Item Effect ---

export const sageBundleEffect = {
  itemId: 'sage-bundle',
  use: (action: ActionIntent, world: WorldState): ResolvedEvent[] => {
    const actor = world.entities[action.actorId];
    if (!actor) return [];

    const previous = actor.resources.dust ?? 0;
    actor.resources.dust = Math.max(0, previous - 20);

    return [{
      id: nextId('evt'),
      tick: action.issuedAtTick,
      type: 'resource.changed',
      actorId: action.actorId,
      payload: {
        entityId: actor.id,
        resource: 'dust',
        previous,
        current: actor.resources.dust,
        delta: actor.resources.dust - previous,
      },
    }];
  },
};

// --- Pack Metadata ---

export const packMeta: PackMetadata = {
  id: 'dust-devils-bargain',
  name: "Dust Devil's Bargain",
  tagline: 'A haunted frontier town where the dead still draw.',
  genres: ['western'],
  difficulty: 'intermediate',
  tones: ['eerie', 'gritty'],
  tags: ['supernatural', 'frontier', 'duel', 'spirits', 'cult'],
  engineVersion: '2.0.0',
  version: '2.0.0',
  description: 'Drift into a cursed frontier town. Investigate a mesa cult, duel undead gunslingers, and commune with spirits before the dust takes you.',
  narratorTone: 'weird western, laconic, sun-bleached, haunted',
};

// --- Build Catalog ---

export const buildCatalog: BuildCatalog = {
  packId: 'dust-devils-bargain',
  statBudget: 3,
  maxTraits: 3,
  requiredFlaws: 1,
  archetypes: [
    {
      id: 'gunslinger',
      name: 'Gunslinger',
      description: 'Fastest hand in the territory',
      statPriorities: { grit: 4, 'draw-speed': 7, lore: 3 },
      startingTags: ['gunslinger', 'quick-draw'],
      progressionTreeId: 'gunslinger-path',
      grantedVerbs: ['draw'],
    },
    {
      id: 'spirit-walker',
      name: 'Spirit Walker',
      description: 'Speaks to what shouldn\'t speak back',
      statPriorities: { grit: 3, 'draw-speed': 3, lore: 8 },
      startingTags: ['mystic', 'spirit-walker'],
      progressionTreeId: 'gunslinger-path',
      grantedVerbs: ['commune'],
    },
    {
      id: 'lawkeeper',
      name: 'Lawkeeper',
      description: 'Badge and backbone, but whose law?',
      statPriorities: { grit: 7, 'draw-speed': 4, lore: 3 },
      startingTags: ['law', 'lawkeeper'],
      progressionTreeId: 'gunslinger-path',
    },
  ],
  backgrounds: [
    {
      id: 'drifter',
      name: 'Drifter',
      description: 'No home, no ties, no one waiting',
      statModifiers: { 'draw-speed': 1, lore: -1 },
      startingTags: ['rootless'],
    },
    {
      id: 'preachers-child',
      name: "Preacher's Child",
      description: 'Raised on scripture and superstition',
      statModifiers: { lore: 1, 'draw-speed': -1 },
      startingTags: ['scripture-raised'],
    },
    {
      id: 'outlaw',
      name: 'Outlaw',
      description: 'Wanted poster in three counties',
      statModifiers: { grit: 1 },
      startingTags: ['wanted'],
    },
  ],
  traits: [
    {
      id: 'desert-hardened',
      name: 'Desert-Hardened',
      description: 'The sun tried to kill you and failed',
      category: 'perk',
      effects: [{ type: 'resource-modifier', resource: 'resolve', amount: 3 }],
    },
    {
      id: 'spirit-touched',
      name: 'Spirit-Touched',
      description: 'The dead whisper your name',
      category: 'perk',
      effects: [
        { type: 'stat-modifier', stat: 'lore', amount: 1 },
        { type: 'grant-tag', tag: 'spirit-sensitive' },
      ],
    },
    {
      id: 'dust-cursed',
      name: 'Dust-Cursed',
      description: 'The desert has already marked you',
      category: 'flaw',
      effects: [
        { type: 'resource-modifier', resource: 'dust', amount: 15 },
        { type: 'grant-tag', tag: 'dust-marked' },
      ],
    },
    {
      id: 'twitchy',
      name: 'Twitchy',
      description: 'Jumps at shadows, second-guesses every choice',
      category: 'flaw',
      effects: [
        { type: 'stat-modifier', stat: 'grit', amount: -1 },
        { type: 'grant-tag', tag: 'nervous' },
      ],
      incompatibleWith: ['desert-hardened'],
    },
  ],
  disciplines: [
    {
      id: 'occultist',
      name: 'Occultist',
      description: 'Studies the mesa rituals and spirit bindings',
      grantedVerb: 'commune',
      passive: { type: 'stat-modifier', stat: 'lore', amount: 1 },
      drawback: { type: 'resource-modifier', resource: 'dust', amount: 10 },
    },
    {
      id: 'bounty-hunter',
      name: 'Bounty Hunter',
      description: 'Tracks down the wanted, dead or alive',
      grantedVerb: 'interrogate',
      passive: { type: 'stat-modifier', stat: 'grit', amount: 1 },
      drawback: { type: 'faction-modifier', faction: 'red-congregation', amount: -10 },
    },
  ],
  crossTitles: [
    { archetypeId: 'gunslinger', disciplineId: 'occultist', title: 'Hex Pistol', tags: ['hex-pistol'] },
    { archetypeId: 'gunslinger', disciplineId: 'bounty-hunter', title: 'Dead-Eye Marshal', tags: ['dead-eye-marshal'] },
    { archetypeId: 'spirit-walker', disciplineId: 'occultist', title: 'Doomcaller', tags: ['doomcaller'] },
    { archetypeId: 'spirit-walker', disciplineId: 'bounty-hunter', title: 'Ghost Tracker', tags: ['ghost-tracker'] },
    { archetypeId: 'lawkeeper', disciplineId: 'occultist', title: 'Witch Sheriff', tags: ['witch-sheriff'] },
    { archetypeId: 'lawkeeper', disciplineId: 'bounty-hunter', title: 'Iron Judge', tags: ['iron-judge'] },
  ],
  entanglements: [
    {
      id: 'spirit-walker-bounty-hunter',
      archetypeId: 'spirit-walker',
      disciplineId: 'bounty-hunter',
      description: 'Spirits distrust those who hunt the living — commune checks suffer',
      effects: [{ type: 'stat-modifier', stat: 'lore', amount: -1 }],
    },
  ],
};

// --- Item Catalog ---

export const itemCatalog: ItemCatalog = {
  items: [
    {
      id: 'six-shooter',
      name: 'Six-Shooter',
      description: 'A worn revolver, well-oiled and eager.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { 'draw-speed': 1 },
      grantedTags: ['armed'],
      grantedVerbs: ['shoot'],
    },
    {
      id: 'spirit-pouch',
      name: 'Spirit Pouch',
      description: 'A leather pouch of bone dust and sage.',
      slot: 'tool',
      rarity: 'common',
      statModifiers: { lore: 1 },
      grantedVerbs: ['commune'],
      grantedTags: ['spirit-touched'],
    },
    {
      id: 'duster-coat',
      name: 'Duster Coat',
      description: 'A long trail coat that turns dust and buckshot.',
      slot: 'armor',
      rarity: 'common',
      resourceModifiers: { resolve: 3 },
    },
    {
      id: 'silver-star',
      name: 'Silver Star Badge',
      description: 'A tarnished badge of frontier law.',
      slot: 'accessory',
      rarity: 'uncommon',
      grantedTags: ['badge-carrier'],
      statModifiers: { grit: 1 },
    },
    {
      id: 'bowie-knife',
      name: 'Bowie Knife',
      description: 'A heavy blade forged for the frontier.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { grit: 1 },
      grantedVerbs: ['slash'],
      grantedTags: ['armed'],
    },
    {
      id: 'rattlesnake-fang',
      name: 'Rattlesnake Fang Charm',
      description: 'A dried fang on a cord — wards off the Dust.',
      slot: 'trinket',
      rarity: 'uncommon',
      grantedTags: ['dust-warded'],
      resourceModifiers: { dust: -5 },
    },
    {
      id: 'hellfire-rounds',
      name: 'Hellfire Rounds',
      description: 'Bullets etched with sigils that burn what they hit.',
      slot: 'trinket',
      rarity: 'rare',
      statModifiers: { 'draw-speed': 1, lore: 1 },
      grantedTags: ['hex-armed'],
      requiredTags: ['spirit-sensitive'],
    },
  ],
};
