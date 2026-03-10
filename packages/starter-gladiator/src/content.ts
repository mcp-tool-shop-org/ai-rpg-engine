// Iron Colosseum — historical gladiator arena starter content
// 5 zones, 3 NPCs, 2 enemies, 1 dialogue, 2 districts

import type { EntityState, ZoneState, GameManifest, ActionIntent, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import type { DialogueDefinition, ProgressionTreeDefinition } from '@ai-rpg-engine/content-schema';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import type { DistrictDefinition, EncounterDefinition, BossDefinition } from '@ai-rpg-engine/modules';

export const manifest: GameManifest = {
  id: 'iron-colosseum',
  title: 'Iron Colosseum',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'gladiator-minimal',
  modules: ['traversal-core', 'status-core', 'combat-core', 'inventory-core', 'dialogue-core'],
  contentPacks: ['iron-colosseum'],
};

// --- Player ---

export const player: EntityState = {
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Gladiator',
  tags: ['player', 'gladiator', 'enslaved'],
  stats: { might: 5, agility: 5, showmanship: 4 },
  resources: { hp: 25, stamina: 6, fatigue: 0, 'crowd-favor': 40 },
  statuses: [],
  inventory: [],
  zoneId: 'holding-cells',
};

// --- NPCs ---

export const lanistaBrutus: EntityState = {
  id: 'lanista-brutus',
  blueprintId: 'lanista-brutus',
  type: 'npc',
  name: 'Lanista Brutus',
  tags: ['npc', 'arena-master', 'authority'],
  stats: { might: 4, agility: 3, showmanship: 6 },
  resources: { hp: 12, stamina: 2 },
  statuses: [],
  zoneId: 'holding-cells',
};

export const dominaValeria: EntityState = {
  id: 'domina-valeria',
  blueprintId: 'domina-valeria',
  type: 'npc',
  name: 'Domina Valeria',
  tags: ['npc', 'patron', 'wealthy', 'recruitable', 'diplomat'],
  stats: { might: 2, agility: 3, showmanship: 7 },
  resources: { hp: 8, stamina: 2 },
  statuses: [],
  zoneId: 'patron-gallery',
  custom: {
    companionRole: 'diplomat',
    companionAbilities: 'trade-advantage,faction-route',
    personalGoal: 'Acquire the most celebrated gladiator in the arena',
  },
};

export const nerva: EntityState = {
  id: 'nerva',
  blueprintId: 'nerva',
  type: 'npc',
  name: 'Nerva',
  tags: ['npc', 'gladiator', 'veteran', 'recruitable', 'fighter'],
  stats: { might: 6, agility: 5, showmanship: 3 },
  resources: { hp: 20, stamina: 5, fatigue: 5 },
  statuses: [],
  zoneId: 'holding-cells',
  custom: {
    companionRole: 'fighter',
    companionAbilities: 'intimidation-backup,medical-support',
    personalGoal: 'Earn enough victories to buy his freedom',
  },
};

// --- Enemies ---

export const arenaChampion: EntityState = {
  id: 'arena-champion',
  blueprintId: 'arena-champion',
  type: 'enemy',
  name: 'Arena Champion',
  tags: ['enemy', 'gladiator', 'champion', 'role:elite'],
  stats: { might: 7, agility: 6, showmanship: 5 },
  resources: { hp: 30, stamina: 8, fatigue: 0, 'crowd-favor': 70 },
  statuses: [],
  zoneId: 'arena-floor',
  ai: { profileId: 'aggressive', goals: ['defend-title'], fears: ['crowd-turning'], alertLevel: 0, knowledge: {} },
};

export const warBeast: EntityState = {
  id: 'war-beast',
  blueprintId: 'war-beast',
  type: 'enemy',
  name: 'War Beast',
  tags: ['enemy', 'beast', 'feral', 'role:brute'],
  stats: { might: 8, agility: 4, showmanship: 0 },
  resources: { hp: 22, stamina: 6 },
  statuses: [],
  zoneId: 'arena-floor',
  ai: { profileId: 'aggressive', goals: ['kill-prey'], fears: ['fire'], alertLevel: 0, knowledge: {} },
};

export const arenaOverlord: EntityState = {
  id: 'arena-overlord',
  blueprintId: 'arena-overlord',
  type: 'enemy',
  name: 'The Overlord',
  tags: ['enemy', 'gladiator', 'role:boss'],
  stats: { might: 9, agility: 5, showmanship: 6 },
  resources: { hp: 60, maxHp: 60, stamina: 15, maxStamina: 15, fatigue: 0, 'crowd-favor': 90 },
  statuses: [],
  zoneId: 'arena-floor',
  ai: { profileId: 'territorial', goals: ['dominate-arena'], fears: ['rebellion'], alertLevel: 0, knowledge: {} },
};

export const arenaOverlordBoss: BossDefinition = {
  entityId: 'arena-overlord',
  phases: [
    {
      hpThreshold: 0.75,
      narrativeKey: 'calls-reinforcements',
      addTags: ['rallying'],
    },
    {
      hpThreshold: 0.5,
      narrativeKey: 'berserker',
      addTags: ['enraged'],
      removeTags: ['rallying'],
    },
    {
      hpThreshold: 0.25,
      narrativeKey: 'desperate-last-stand',
      addTags: ['desperate'],
      removeTags: ['enraged'],
    },
  ],
  immovable: true,
};

export const championshipBout: EncounterDefinition = {
  id: 'championship-bout',
  name: 'The Championship Bout',
  participants: [
    { entityId: 'arena-overlord', role: 'boss' },
    { entityId: 'war-beast', role: 'brute' },
  ],
  composition: 'boss-fight',
  validZoneIds: ['arena-floor'],
  narrativeHooks: {
    tone: 'spectacle, roaring crowd, blood and glory',
    trigger: 'The final challenge for freedom',
    stakes: 'Freedom or death in the arena',
  },
};

// --- Zones ---

export const zones: ZoneState[] = [
  {
    id: 'holding-cells',
    roomId: 'arena-underground',
    name: 'Holding Cells',
    tags: ['interior', 'underground', 'confined'],
    neighbors: ['arena-floor', 'armory'],
    light: 2,
    interactables: ['iron bars', 'scratched tally marks', 'straw bedding'],
  },
  {
    id: 'arena-floor',
    roomId: 'arena',
    name: 'Arena Floor',
    tags: ['exterior', 'combat', 'open', 'sand'],
    neighbors: ['holding-cells', 'tunnel-exit'],
    light: 5,
    interactables: ['bloodstained sand', 'discarded weapons', 'gate mechanisms'],
    hazards: ['scorching-sand'],
  },
  {
    id: 'patron-gallery',
    roomId: 'arena',
    name: 'Patron Gallery',
    tags: ['interior', 'elevated', 'social', 'wealthy'],
    neighbors: ['arena-floor', 'armory'],
    light: 4,
    interactables: ['cushioned seats', 'wine goblets', 'betting tablets'],
  },
  {
    id: 'armory',
    roomId: 'arena-underground',
    name: 'Armory',
    tags: ['interior', 'underground', 'weapons'],
    neighbors: ['holding-cells', 'patron-gallery'],
    light: 3,
    interactables: ['weapon racks', 'armor stands', 'oil lamps'],
  },
  {
    id: 'tunnel-exit',
    roomId: 'arena-underground',
    name: 'Tunnel Exit',
    tags: ['interior', 'underground', 'escape', 'hidden'],
    neighbors: ['arena-floor'],
    light: 1,
    interactables: ['collapsed stones', 'rusted gate'],
    hazards: ['trap-pit'],
  },
];

// --- Dialogue ---

export const patronDialogue: DialogueDefinition = {
  id: 'patron-audience',
  speakers: ['domina-valeria'],
  entryNodeId: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Domina Valeria',
      text: 'You fight with promise. The crowd noticed. More importantly, I noticed.',
      choices: [
        {
          id: 'ask-patronage',
          text: 'What does your patronage offer?',
          nextNodeId: 'patronage-offer',
        },
        {
          id: 'ask-freedom',
          text: 'I fight for freedom, not favors.',
          nextNodeId: 'freedom-path',
        },
        {
          id: 'ask-champion',
          text: 'Tell me about the champion.',
          nextNodeId: 'champion-intel',
        },
      ],
    },
    'patronage-offer': {
      id: 'patronage-offer',
      speaker: 'Domina Valeria',
      text: 'Better weapons. Healing between bouts. Protection from... convenient accidents. All I ask is that you dedicate your victories to House Valeria.',
      choices: [
        {
          id: 'accept',
          text: 'I accept your patronage.',
          nextNodeId: 'end-gift',
          effects: [{ type: 'set-global', target: 'actor', params: { key: 'patron-accepted', value: true } }],
        },
      ],
    },
    'freedom-path': {
      id: 'freedom-path',
      speaker: 'Domina Valeria',
      text: 'Freedom is earned in the sand, not demanded from a cell. Win the crowd, win the title, and the Senate may grant your petition. Until then, you need allies.',
      choices: [
        {
          id: 'consider',
          text: 'I will consider it.',
          nextNodeId: 'end-info',
          effects: [{ type: 'set-global', target: 'actor', params: { key: 'patron-accepted', value: true } }],
        },
      ],
    },
    'champion-intel': {
      id: 'champion-intel',
      speaker: 'Domina Valeria',
      text: 'Magnus the Unbroken. Thirty victories, no defeats. He tires in the third exchange — his left guard drops. Remember that.',
      choices: [
        {
          id: 'thanks',
          text: 'Useful information.',
          nextNodeId: 'end-info',
          effects: [{ type: 'set-global', target: 'actor', params: { key: 'patron-accepted', value: true } }],
        },
      ],
    },
    'end-gift': {
      id: 'end-gift',
      speaker: 'Domina Valeria',
      text: 'A patron token. Show it to the armorer. And here — something to steady your nerves before the next bout.',
    },
    'end-info': {
      id: 'end-info',
      speaker: 'Domina Valeria',
      text: 'Win spectacularly, gladiator. The crowd has a short memory.',
    },
  },
};

// --- Districts ---

export const districts: DistrictDefinition[] = [
  {
    id: 'arena-grounds',
    name: 'Arena Grounds',
    zoneIds: ['holding-cells', 'arena-floor', 'armory', 'tunnel-exit'],
    tags: ['combat', 'enslaved'],
    controllingFaction: 'arena-stable',
  },
  {
    id: 'patron-quarter',
    name: 'Patron Quarter',
    zoneIds: ['patron-gallery'],
    tags: ['wealthy', 'political'],
    controllingFaction: 'patron-circle',
  },
];

// --- Progression Trees ---

export const arenaGloryTree: ProgressionTreeDefinition = {
  id: 'arena-glory',
  name: 'Arena Glory',
  currency: 'xp',
  nodes: [
    {
      id: 'crowd-pleaser',
      name: 'Crowd Pleaser',
      cost: 10,
      effects: [
        { type: 'stat-boost', params: { stat: 'showmanship', amount: 1 } },
        { type: 'resource-boost', params: { resource: 'crowd-favor', amount: 10 } },
      ],
    },
    {
      id: 'iron-endurance',
      name: 'Iron Endurance',
      cost: 15,
      effects: [
        { type: 'resource-boost', params: { resource: 'hp', amount: 5 } },
      ],
    },
    {
      id: 'freedom-fighter',
      name: 'Freedom Fighter',
      cost: 25,
      requires: ['iron-endurance'],
      effects: [
        { type: 'stat-boost', params: { stat: 'might', amount: 2 } },
        { type: 'grant-tag', params: { tag: 'defiant' } },
      ],
    },
  ],
};

// --- Items ---

export const patronTokenEffect = {
  itemId: 'patron-token',
  use: (action: ActionIntent, world: WorldState): ResolvedEvent[] => {
    const actor = world.entities[action.actorId];
    if (!actor) return [];
    const previous = actor.resources['crowd-favor'] ?? 0;
    actor.resources['crowd-favor'] = Math.min(100, previous + 15);
    return [{
      id: nextId('evt'),
      tick: action.issuedAtTick,
      type: 'resource.changed',
      actorId: action.actorId,
      payload: {
        entityId: actor.id,
        resource: 'crowd-favor',
        previous,
        current: actor.resources['crowd-favor'],
        delta: actor.resources['crowd-favor'] - previous,
      },
    }];
  },
};

// --- Pack Metadata ---

export const packMeta: PackMetadata = {
  id: 'iron-colosseum',
  name: 'Iron Colosseum',
  tagline: 'Freedom is earned in blood and spectacle.',
  genres: ['historical'],
  difficulty: 'intermediate',
  tones: ['gritty', 'heroic'],
  tags: ['gladiator', 'arena', 'combat', 'freedom', 'spectacle', 'roman'],
  engineVersion: '2.0.0',
  version: '2.1.0',
  description: 'Fight for freedom in a crumbling arena. Earn crowd favor through spectacle, secure patrons, and survive long enough to challenge the undefeated champion.',
  narratorTone: 'roman arena, visceral, theatrical, defiant',
};

// --- Build Catalog ---

export const buildCatalog: BuildCatalog = {
  packId: 'iron-colosseum',
  statBudget: 3,
  maxTraits: 3,
  requiredFlaws: 1,
  archetypes: [
    {
      id: 'retiarius',
      name: 'Retiarius',
      description: 'Net-and-trident fighter, quick and theatrical',
      statPriorities: { might: 3, agility: 6, showmanship: 5 },
      startingTags: ['net-fighter', 'agile'],
      startingInventory: ['trident-and-net'],
      progressionTreeId: 'arena-glory',
    },
    {
      id: 'murmillo',
      name: 'Murmillo',
      description: 'Heavy fighter, shield and sword, built to endure',
      statPriorities: { might: 6, agility: 4, showmanship: 3 },
      startingTags: ['heavy-fighter', 'armored'],
      resourceOverrides: { hp: 30 },
      progressionTreeId: 'arena-glory',
    },
    {
      id: 'provocator',
      name: 'Provocator',
      description: 'Showman first, fighter second — lives for the crowd',
      statPriorities: { might: 4, agility: 4, showmanship: 6 },
      startingTags: ['showman', 'crowd-favorite'],
      resourceOverrides: { 'crowd-favor': 55 },
      progressionTreeId: 'arena-glory',
    },
  ],
  backgrounds: [
    {
      id: 'war-captive',
      name: 'War Captive',
      description: 'Taken in conquest, forged in the arena',
      statModifiers: { might: 1, showmanship: -1 },
      startingTags: ['war-hardened'],
    },
    {
      id: 'debt-slave',
      name: 'Debt Slave',
      description: 'Sold to pay a family debt',
      statModifiers: { agility: 1, might: -1 },
      startingTags: ['desperate'],
    },
    {
      id: 'volunteer',
      name: 'Volunteer',
      description: 'Chose the arena for glory and coin',
      statModifiers: { showmanship: 1 },
      startingTags: ['glory-seeker'],
    },
  ],
  traits: [
    {
      id: 'crowd-darling',
      name: 'Crowd Darling',
      description: 'The audience loves you before you even fight',
      category: 'perk',
      effects: [{ type: 'resource-modifier', resource: 'crowd-favor', amount: 10 }],
    },
    {
      id: 'iron-body',
      name: 'Iron Body',
      description: 'Built like a siege engine',
      category: 'perk',
      effects: [
        { type: 'stat-modifier', stat: 'might', amount: 1 },
        { type: 'grant-tag', tag: 'tough' },
      ],
    },
    {
      id: 'glass-jaw',
      name: 'Glass Jaw',
      description: 'One clean hit and the lights go out',
      category: 'flaw',
      effects: [{ type: 'resource-modifier', resource: 'hp', amount: -4 }],
    },
    {
      id: 'arena-dread',
      name: 'Arena Dread',
      description: 'The roar of the crowd freezes your blood',
      category: 'flaw',
      effects: [
        { type: 'stat-modifier', stat: 'showmanship', amount: -1 },
        { type: 'grant-tag', tag: 'stage-fright' },
      ],
      incompatibleWith: ['crowd-darling'],
    },
  ],
  disciplines: [
    {
      id: 'beast-handler',
      name: 'Beast Handler',
      description: 'Trained with war beasts — knows their patterns',
      grantedVerb: 'command',
      passive: { type: 'stat-modifier', stat: 'agility', amount: 1 },
      drawback: { type: 'resource-modifier', resource: 'crowd-favor', amount: -5 },
    },
    {
      id: 'pit-doctor',
      name: 'Pit Doctor',
      description: 'Heals wounds between bouts with crude skill',
      grantedVerb: 'mend',
      passive: { type: 'stat-modifier', stat: 'might', amount: 1 },
      drawback: { type: 'faction-modifier', faction: 'patron-circle', amount: -10 },
    },
  ],
  crossTitles: [
    { archetypeId: 'retiarius', disciplineId: 'beast-handler', title: 'Net Wrangler', tags: ['net-wrangler'] },
    { archetypeId: 'retiarius', disciplineId: 'pit-doctor', title: 'Sand Surgeon', tags: ['sand-surgeon'] },
    { archetypeId: 'murmillo', disciplineId: 'beast-handler', title: 'Iron Tamer', tags: ['iron-tamer'] },
    { archetypeId: 'murmillo', disciplineId: 'pit-doctor', title: 'Shield Medic', tags: ['shield-medic'] },
    { archetypeId: 'provocator', disciplineId: 'beast-handler', title: 'Beast Showman', tags: ['beast-showman'] },
    { archetypeId: 'provocator', disciplineId: 'pit-doctor', title: 'Bloody Entertainer', tags: ['bloody-entertainer'] },
  ],
  entanglements: [
    {
      id: 'showman-doctor',
      archetypeId: 'provocator',
      disciplineId: 'pit-doctor',
      description: 'Showmen who heal their opponents confuse the crowd and lose favor',
      effects: [{ type: 'grant-tag', tag: 'crowd-confused' }],
    },
  ],
};

export const itemCatalog: ItemCatalog = {
  items: [
    {
      id: 'gladius',
      name: 'Gladius',
      description: 'A short, brutal sword built for close-quarters killing.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { might: 1 },
      grantedTags: ['armed'],
      grantedVerbs: ['strike'],
    },
    {
      id: 'trident-and-net',
      name: 'Trident & Net',
      description: 'The retiarius arsenal — reach and entanglement.',
      slot: 'weapon',
      rarity: 'uncommon',
      statModifiers: { agility: 1 },
      grantedTags: ['armed', 'entangler'],
      grantedVerbs: ['ensnare'],
      provenance: { origin: 'Arena armory', lore: 'Favored by fighters who prefer cunning to brawn' },
    },
    {
      id: 'lorica-segmentata',
      name: 'Lorica Segmentata',
      description: 'Segmented plate armor — heavy but formidable.',
      slot: 'armor',
      rarity: 'uncommon',
      resourceModifiers: { hp: 5 },
    },
    {
      id: 'patron-token',
      name: 'Patron Token',
      description: 'A golden disc bearing a patron house seal — favor made tangible.',
      slot: 'trinket',
      rarity: 'uncommon',
      grantedTags: ['patronized'],
      provenance: { origin: 'House Valeria', factionId: 'patron-circle', flags: ['heirloom'], lore: 'Granted to fighters deemed worthy of investment' },
    },
    {
      id: 'sand-cloak',
      name: 'Sand Cloak',
      description: 'A rough cloak that blends with arena dust.',
      slot: 'armor',
      rarity: 'common',
      resourceModifiers: { hp: 2 },
      grantedTags: ['dust-camouflage'],
    },
    {
      id: 'iron-manacles',
      name: 'Iron Manacles',
      description: 'Broken chains still attached — a reminder and a weapon.',
      slot: 'accessory',
      rarity: 'common',
      statModifiers: { might: 1 },
      grantedTags: ['chain-fighter'],
      provenance: { flags: ['trophy'], lore: 'Broken free during an arena revolt' },
    },
    {
      id: 'victory-wreath',
      name: 'Victory Wreath',
      description: 'A laurel crown awarded for exceptional combat.',
      slot: 'accessory',
      rarity: 'rare',
      statModifiers: { showmanship: 1 },
      grantedTags: ['celebrated'],
      provenance: { origin: 'Senate award', flags: ['heirloom', 'trophy'], lore: 'Only the greatest receive the laurel' },
    },
  ],
};
