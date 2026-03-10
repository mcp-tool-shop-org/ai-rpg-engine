// Crimson Court — gothic horror vampire starter content
// 5 zones, 3 NPCs, 2 enemies, 1 dialogue, 2 districts

import type { EntityState, ZoneState, GameManifest, ActionIntent, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import type { DialogueDefinition, ProgressionTreeDefinition } from '@ai-rpg-engine/content-schema';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import type { DistrictDefinition, EncounterDefinition, BossDefinition } from '@ai-rpg-engine/modules';

export const manifest: GameManifest = {
  id: 'crimson-court',
  title: 'Crimson Court',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'vampire-minimal',
  modules: ['traversal-core', 'status-core', 'combat-core', 'inventory-core', 'dialogue-core'],
  contentPacks: ['crimson-court'],
};

// --- Player ---

export const player: EntityState = {
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Fledgling',
  tags: ['player', 'vampire', 'fledgling'],
  stats: { presence: 4, vitality: 5, cunning: 5 },
  resources: { hp: 20, stamina: 5, bloodlust: 10, humanity: 25 },
  statuses: [],
  inventory: [],
  zoneId: 'grand-ballroom',
};

// --- NPCs ---

export const duchessMorvaine: EntityState = {
  id: 'duchess-morvaine',
  blueprintId: 'duchess-morvaine',
  type: 'npc',
  name: 'Duchess Morvaine',
  tags: ['npc', 'vampire', 'elder', 'recruitable', 'diplomat'],
  stats: { presence: 8, vitality: 4, cunning: 7 },
  resources: { hp: 15, stamina: 3, bloodlust: 5, humanity: 8 },
  statuses: [],
  zoneId: 'grand-ballroom',
  custom: {
    companionRole: 'diplomat',
    companionAbilities: 'faction-route,rumor-suppression',
    personalGoal: 'Maintain House Morvaine dominance through the masquerade',
  },
};

export const cassius: EntityState = {
  id: 'cassius',
  blueprintId: 'cassius',
  type: 'npc',
  name: 'Cassius',
  tags: ['npc', 'vampire', 'rival'],
  stats: { presence: 6, vitality: 6, cunning: 4 },
  resources: { hp: 18, stamina: 4, bloodlust: 30, humanity: 15 },
  statuses: [],
  zoneId: 'east-gallery',
};

export const servantElara: EntityState = {
  id: 'servant-elara',
  blueprintId: 'servant-elara',
  type: 'npc',
  name: 'Servant Elara',
  tags: ['npc', 'human', 'recruitable', 'scout'],
  stats: { presence: 3, vitality: 2, cunning: 6 },
  resources: { hp: 8, stamina: 2 },
  statuses: [],
  zoneId: 'wine-cellar',
  custom: {
    companionRole: 'scout',
    companionAbilities: 'smuggling-contact,scholarly-insight',
    personalGoal: 'Escape the manor with her family alive',
  },
};

// --- Enemies ---

export const witchHunter: EntityState = {
  id: 'witch-hunter',
  blueprintId: 'witch-hunter',
  type: 'enemy',
  name: 'Witch Hunter',
  tags: ['enemy', 'human', 'hunter', 'role:elite'],
  stats: { presence: 3, vitality: 6, cunning: 5 },
  resources: { hp: 18, stamina: 5 },
  statuses: [],
  zoneId: 'bell-tower',
  ai: { profileId: 'stalker', goals: ['purge-vampires'], fears: ['outnumbered'], alertLevel: 0, knowledge: {} },
};

export const feralThrall: EntityState = {
  id: 'feral-thrall',
  blueprintId: 'feral-thrall',
  type: 'enemy',
  name: 'Feral Thrall',
  tags: ['enemy', 'vampire', 'feral', 'role:minion'],
  stats: { presence: 1, vitality: 7, cunning: 2 },
  resources: { hp: 14, stamina: 6, bloodlust: 95 },
  statuses: [],
  zoneId: 'wine-cellar',
  ai: { profileId: 'aggressive', goals: ['feed'], fears: ['fire', 'sunlight'], alertLevel: 0, knowledge: {} },
};

export const elderVampire: EntityState = {
  id: 'elder-vampire',
  blueprintId: 'elder-vampire',
  type: 'enemy',
  name: 'Elder Vampire',
  tags: ['enemy', 'vampire', 'elder', 'role:boss'],
  stats: { presence: 8, vitality: 7, cunning: 6 },
  resources: { hp: 50, maxHp: 50, stamina: 14, maxStamina: 14, bloodlust: 5, humanity: 2 },
  statuses: [],
  zoneId: 'grand-ballroom',
  ai: { profileId: 'calculating', goals: ['dominate-court', 'feed-selectively'], fears: ['sunlight', 'fire'], alertLevel: 0, knowledge: {} },
};

// --- Boss Definition ---

export const elderVampireBoss: BossDefinition = {
  entityId: 'elder-vampire',
  phases: [
    {
      hpThreshold: 0.5,
      narrativeKey: 'mesmerize',
      addTags: ['mesmerizing', 'dominating'],
    },
    {
      hpThreshold: 0.25,
      narrativeKey: 'blood-frenzy',
      addTags: ['frenzied', 'desperate'],
      removeTags: ['mesmerizing'],
    },
  ],
};

// --- Encounters ---

export const cellarPatrol: EncounterDefinition = {
  id: 'cellar-patrol',
  name: 'Cellar Patrol',
  participants: [
    { entityId: 'feral-thrall', role: 'minion' },
    { entityId: 'feral-thrall', role: 'minion' },
    { entityId: 'witch-hunter', role: 'elite' },
  ],
  composition: 'patrol',
  validZoneIds: ['wine-cellar', 'moonlit-garden'],
  narrativeHooks: { tone: 'stalking', trigger: 'Shadows shift in the candlelight.', stakes: 'Blood or dust — someone feeds tonight.' },
};

export const galleryAmbush: EncounterDefinition = {
  id: 'gallery-ambush',
  name: 'Gallery Ambush',
  participants: [
    { entityId: 'witch-hunter', role: 'elite' },
    { entityId: 'witch-hunter', role: 'elite' },
  ],
  composition: 'ambush',
  validZoneIds: ['east-gallery'],
  narrativeHooks: { tone: 'sudden', trigger: 'Silver glints from behind the portraits.', stakes: 'The hunters have found their prey.' },
};

export const ballroomReckoning: EncounterDefinition = {
  id: 'ballroom-reckoning',
  name: 'Ballroom Reckoning',
  participants: [
    { entityId: 'elder-vampire', role: 'boss' },
    { entityId: 'feral-thrall', role: 'minion' },
  ],
  composition: 'boss-fight',
  validZoneIds: ['grand-ballroom'],
  narrativeHooks: { tone: 'climactic', trigger: 'The elder drops the masquerade.', stakes: 'The court will have a new master — or a new corpse.' },
};

// --- Zones ---

export const zones: ZoneState[] = [
  {
    id: 'grand-ballroom',
    roomId: 'manor',
    name: 'Grand Ballroom',
    tags: ['interior', 'social', 'opulent'],
    neighbors: ['east-gallery', 'wine-cellar'],
    light: 3,
    interactables: ['crystal chandelier', 'masked dancers', 'blood-red curtains'],
  },
  {
    id: 'east-gallery',
    roomId: 'manor',
    name: 'East Gallery',
    tags: ['interior', 'private', 'dim'],
    neighbors: ['grand-ballroom', 'moonlit-garden'],
    light: 2,
    interactables: ['ancestral portraits', 'velvet chaise'],
  },
  {
    id: 'wine-cellar',
    roomId: 'manor',
    name: 'Wine Cellar',
    tags: ['interior', 'underground', 'dark'],
    neighbors: ['grand-ballroom', 'bell-tower'],
    light: 1,
    interactables: ['dusty casks', 'iron grate'],
    hazards: ['blood-scent'],
  },
  {
    id: 'moonlit-garden',
    roomId: 'grounds',
    name: 'Moonlit Garden',
    tags: ['exterior', 'open', 'moonlit'],
    neighbors: ['east-gallery', 'bell-tower'],
    light: 4,
    interactables: ['stone fountain', 'withered roses', 'garden gate'],
  },
  {
    id: 'bell-tower',
    roomId: 'grounds',
    name: 'Bell Tower',
    tags: ['interior', 'sacred', 'high'],
    neighbors: ['wine-cellar', 'moonlit-garden'],
    light: 2,
    interactables: ['cracked bell', 'hunter supplies'],
    hazards: ['consecrated-ground'],
  },
];

// --- Dialogue ---

export const duchessDialogue: DialogueDefinition = {
  id: 'duchess-audience',
  speakers: ['duchess-morvaine'],
  entryNodeId: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Duchess Morvaine',
      text: 'Ah, the newly turned. You carry yourself well for one so... fresh. The court watches, fledgling.',
      choices: [
        {
          id: 'ask-court',
          text: 'What does the court expect of me?',
          nextNodeId: 'court-politics',
        },
        {
          id: 'ask-hunger',
          text: 'The hunger is difficult to control.',
          nextNodeId: 'hunger-advice',
        },
        {
          id: 'ask-hunter',
          text: 'There is a hunter in the tower.',
          nextNodeId: 'hunter-warning',
        },
      ],
    },
    'court-politics': {
      id: 'court-politics',
      speaker: 'Duchess Morvaine',
      text: 'Survive the night. Prove your worth. The houses will court you or consume you — it matters only which you choose.',
      choices: [
        {
          id: 'accept-guidance',
          text: 'I will earn my place.',
          nextNodeId: 'end-gift',
          effects: [{ type: 'set-global', target: 'actor', params: { key: 'duchess-guidance', value: true } }],
        },
      ],
    },
    'hunger-advice': {
      id: 'hunger-advice',
      speaker: 'Duchess Morvaine',
      text: 'Feed sparingly. Every drop costs you something no blood can replenish. The cellar holds... provisions, if you are discreet.',
      choices: [
        {
          id: 'thank',
          text: 'Thank you, Duchess.',
          nextNodeId: 'end-info',
          effects: [{ type: 'set-global', target: 'actor', params: { key: 'duchess-guidance', value: true } }],
        },
      ],
    },
    'hunter-warning': {
      id: 'hunter-warning',
      speaker: 'Duchess Morvaine',
      text: 'I am aware. He is... tolerated, for now. If he becomes inconvenient, that burden falls to those still eager to prove themselves.',
      choices: [
        {
          id: 'understood',
          text: 'Understood.',
          nextNodeId: 'end-info',
          effects: [{ type: 'set-global', target: 'actor', params: { key: 'duchess-guidance', value: true } }],
        },
      ],
    },
    'end-gift': {
      id: 'end-gift',
      speaker: 'Duchess Morvaine',
      text: 'A token of the house. It will steady the hunger, for a time.',
    },
    'end-info': {
      id: 'end-info',
      speaker: 'Duchess Morvaine',
      text: 'Go carefully, fledgling. The night is long, but not infinite.',
    },
  },
};

// --- Districts ---

export const districts: DistrictDefinition[] = [
  {
    id: 'manor-halls',
    name: 'Manor Halls',
    zoneIds: ['grand-ballroom', 'east-gallery', 'moonlit-garden'],
    tags: ['aristocratic', 'vampiric'],
    controllingFaction: 'house-morvaine',
  },
  {
    id: 'servant-quarters',
    name: 'Servant Quarters',
    zoneIds: ['wine-cellar', 'bell-tower'],
    tags: ['underground', 'human'],
  },
];

// --- Progression Trees ---

export const bloodMasteryTree: ProgressionTreeDefinition = {
  id: 'blood-mastery',
  name: 'Blood Mastery',
  currency: 'xp',
  nodes: [
    {
      id: 'iron-will',
      name: 'Iron Will',
      cost: 10,
      effects: [{ type: 'resource-boost', params: { resource: 'humanity', amount: 3 } }],
    },
    {
      id: 'mesmerist',
      name: 'Mesmerist',
      cost: 15,
      effects: [
        { type: 'stat-boost', params: { stat: 'presence', amount: 1 } },
        { type: 'grant-tag', params: { tag: 'mesmerist' } },
      ],
    },
    {
      id: 'apex-predator',
      name: 'Apex Predator',
      cost: 25,
      requires: ['iron-will'],
      effects: [
        { type: 'stat-boost', params: { stat: 'vitality', amount: 2 } },
        { type: 'grant-tag', params: { tag: 'apex-predator' } },
      ],
    },
  ],
};

// --- Items ---

export const bloodVialEffect = {
  itemId: 'blood-vial',
  use: (action: ActionIntent, world: WorldState): ResolvedEvent[] => {
    const actor = world.entities[action.actorId];
    if (!actor) return [];
    const previous = actor.resources.bloodlust ?? 0;
    actor.resources.bloodlust = Math.max(0, previous - 15);
    return [{
      id: nextId('evt'),
      tick: action.issuedAtTick,
      type: 'resource.changed',
      actorId: action.actorId,
      payload: {
        entityId: actor.id,
        resource: 'bloodlust',
        previous,
        current: actor.resources.bloodlust,
        delta: actor.resources.bloodlust - previous,
      },
    }];
  },
};

// --- Pack Metadata ---

export const packMeta: PackMetadata = {
  id: 'crimson-court',
  name: 'Crimson Court',
  tagline: 'A masked ball where the predators are the guests.',
  genres: ['horror', 'historical'],
  difficulty: 'intermediate',
  tones: ['dark', 'noir'],
  tags: ['vampire', 'aristocracy', 'hunger', 'politics', 'gothic'],
  engineVersion: '2.0.0',
  version: '2.1.0',
  description: 'Navigate vampire court politics during a decadent masked ball. Feed sparingly, enthrall carefully, and survive the night without losing your humanity.',
  narratorTone: 'gothic horror, intimate, decadent, predatory',
};

// --- Build Catalog ---

export const buildCatalog: BuildCatalog = {
  packId: 'crimson-court',
  statBudget: 3,
  maxTraits: 3,
  requiredFlaws: 1,
  archetypes: [
    {
      id: 'courtier',
      name: 'Courtier',
      description: 'A social predator who rules through charm',
      statPriorities: { presence: 6, vitality: 3, cunning: 5 },
      startingTags: ['aristocrat', 'charming'],
      progressionTreeId: 'blood-mastery',
    },
    {
      id: 'stalker',
      name: 'Stalker',
      description: 'A shadow who hunts from darkness',
      statPriorities: { presence: 3, vitality: 6, cunning: 5 },
      startingTags: ['predator', 'shadow'],
      startingInventory: ['blood-vial'],
      progressionTreeId: 'blood-mastery',
    },
    {
      id: 'aesthete',
      name: 'Aesthete',
      description: 'A connoisseur who savors every sensation',
      statPriorities: { presence: 5, vitality: 3, cunning: 6 },
      resourceOverrides: { humanity: 28 },
      startingTags: ['refined', 'perceptive'],
      progressionTreeId: 'blood-mastery',
    },
  ],
  backgrounds: [
    {
      id: 'fallen-noble',
      name: 'Fallen Noble',
      description: 'Once held title and land, now holds only thirst',
      statModifiers: { presence: 1, vitality: -1 },
      startingTags: ['noble-blood'],
    },
    {
      id: 'street-urchin',
      name: 'Street Urchin',
      description: 'Survived the gutters before surviving the bite',
      statModifiers: { cunning: 1, presence: -1 },
      startingTags: ['street-wise'],
    },
    {
      id: 'scholar',
      name: 'Scholar',
      description: 'Sought immortality in books before finding it in blood',
      statModifiers: { cunning: 1 },
      startingTags: ['learned'],
    },
  ],
  traits: [
    {
      id: 'iron-constitution',
      name: 'Iron Constitution',
      description: 'The hunger rises slower than most',
      category: 'perk',
      effects: [{ type: 'resource-modifier', resource: 'humanity', amount: 3 }],
    },
    {
      id: 'predator-instinct',
      name: 'Predator Instinct',
      description: 'Senses sharpen when blood is near',
      category: 'perk',
      effects: [
        { type: 'stat-modifier', stat: 'cunning', amount: 1 },
        { type: 'grant-tag', tag: 'blood-sense' },
      ],
    },
    {
      id: 'thin-blood',
      name: 'Thin Blood',
      description: 'The turning did not take fully',
      category: 'flaw',
      effects: [{ type: 'resource-modifier', resource: 'hp', amount: -3 }],
    },
    {
      id: 'beast-within',
      name: 'Beast Within',
      description: 'The feral nature lurks close to the surface',
      category: 'flaw',
      effects: [
        { type: 'stat-modifier', stat: 'presence', amount: -1 },
        { type: 'grant-tag', tag: 'feral-edge' },
      ],
      incompatibleWith: ['iron-constitution'],
    },
  ],
  disciplines: [
    {
      id: 'blood-alchemist',
      name: 'Blood Alchemist',
      description: 'Transmutes blood into elixirs of power',
      grantedVerb: 'distill',
      passive: { type: 'stat-modifier', stat: 'cunning', amount: 1 },
      drawback: { type: 'resource-modifier', resource: 'humanity', amount: -2 },
    },
    {
      id: 'shadow-dancer',
      name: 'Shadow Dancer',
      description: 'Moves unseen through the night',
      grantedVerb: 'vanish',
      passive: { type: 'stat-modifier', stat: 'vitality', amount: 1 },
      drawback: { type: 'faction-modifier', faction: 'house-morvaine', amount: -10 },
    },
  ],
  crossTitles: [
    { archetypeId: 'courtier', disciplineId: 'blood-alchemist', title: 'Crimson Vintner', tags: ['crimson-vintner'] },
    { archetypeId: 'courtier', disciplineId: 'shadow-dancer', title: 'Phantom Host', tags: ['phantom-host'] },
    { archetypeId: 'stalker', disciplineId: 'blood-alchemist', title: 'Vein Harvester', tags: ['vein-harvester'] },
    { archetypeId: 'stalker', disciplineId: 'shadow-dancer', title: 'Night Wraith', tags: ['night-wraith'] },
    { archetypeId: 'aesthete', disciplineId: 'blood-alchemist', title: 'Scarlet Savant', tags: ['scarlet-savant'] },
    { archetypeId: 'aesthete', disciplineId: 'shadow-dancer', title: 'Velvet Phantom', tags: ['velvet-phantom'] },
  ],
  entanglements: [
    {
      id: 'predator-alchemist',
      archetypeId: 'stalker',
      disciplineId: 'blood-alchemist',
      description: 'Stalkers who practice blood alchemy attract unwanted attention from elder vampires',
      effects: [{ type: 'grant-tag', tag: 'marked-by-elders' }],
    },
  ],
};

export const itemCatalog: ItemCatalog = {
  items: [
    {
      id: 'silver-cane',
      name: 'Silver Cane',
      description: 'An elegant walking cane concealing a silver blade.',
      slot: 'weapon',
      rarity: 'uncommon',
      statModifiers: { vitality: 1 },
      grantedTags: ['armed', 'concealed-weapon'],
      grantedVerbs: ['strike'],
      provenance: { origin: 'House Morvaine armory', factionId: 'house-morvaine', flags: ['heirloom'], lore: 'Carried by three generations of Morvaine enforcers' },
    },
    {
      id: 'masquerade-mask',
      name: 'Masquerade Mask',
      description: 'A porcelain mask that conceals more than the face.',
      slot: 'accessory',
      rarity: 'common',
      statModifiers: { presence: 1 },
      grantedTags: ['masked', 'anonymous'],
    },
    {
      id: 'blood-vial',
      name: 'Blood Vial',
      description: 'A crystal vial of preserved blood — dulls the hunger.',
      slot: 'trinket',
      rarity: 'uncommon',
      grantedTags: ['sustenance'],
    },
    {
      id: 'moon-silk-cloak',
      name: 'Moon-Silk Cloak',
      description: 'A gossamer cloak woven under moonlight.',
      slot: 'armor',
      rarity: 'rare',
      resourceModifiers: { hp: 3 },
      grantedTags: ['moon-touched'],
      statModifiers: { cunning: 1 },
    },
    {
      id: 'ivory-fan',
      name: 'Ivory Fan',
      description: 'A fan carved from bone — a tool of court intrigue.',
      slot: 'tool',
      rarity: 'common',
      grantedTags: ['courtly'],
      grantedVerbs: ['signal'],
    },
    {
      id: 'hunters-journal',
      name: 'Hunter\'s Journal',
      description: 'A leather-bound journal detailing vampire weaknesses.',
      slot: 'tool',
      rarity: 'uncommon',
      grantedTags: ['knowledge-hunter'],
      provenance: { flags: ['stolen', 'contraband'], lore: 'Taken from a dead witch hunter' },
    },
    {
      id: 'obsidian-ring',
      name: 'Obsidian Ring',
      description: 'A ring of black glass that hums faintly in moonlight.',
      slot: 'accessory',
      rarity: 'rare',
      grantedTags: ['nightbound'],
      statModifiers: { presence: 1 },
      provenance: { origin: 'Unknown elder', flags: ['cursed', 'heirloom'], lore: 'Its last three owners vanished before dawn' },
    },
  ],
};
