// The Chapel Threshold — fantasy starter content
// 2 rooms, 5 zones, 1 NPC, 1 enemy, 1 item, 1 dialogue, 1 status

import type { EntityState, ZoneState, GameManifest, ActionIntent, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import type { DialogueDefinition } from '@ai-rpg-engine/content-schema';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import type { EncounterDefinition, BossDefinition } from '@ai-rpg-engine/modules';

export const manifest: GameManifest = {
  id: 'chapel-threshold',
  title: 'The Chapel Threshold',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'fantasy-minimal',
  modules: ['traversal-core', 'status-core', 'combat-core', 'inventory-core', 'dialogue-core'],
  contentPacks: ['chapel-threshold'],
};

// --- Player ---

export const player: EntityState = {
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Wanderer',
  tags: ['player'],
  stats: { vigor: 5, instinct: 4, will: 3 },
  resources: { hp: 20, stamina: 8 },
  statuses: [],
  inventory: [],
  zoneId: 'chapel-entrance',
};

// --- NPCs ---

export const pilgrim: EntityState = {
  id: 'pilgrim',
  blueprintId: 'pilgrim',
  type: 'npc',
  name: 'Suspicious Pilgrim',
  tags: ['npc'],
  stats: { vigor: 2, instinct: 3, will: 6 },
  resources: { hp: 8 },
  statuses: [],
  zoneId: 'chapel-entrance',
};

export const brotherAldric: EntityState = {
  id: 'brother-aldric',
  blueprintId: 'brother-aldric',
  type: 'npc',
  name: 'Brother Aldric',
  tags: ['npc', 'recruitable', 'healer'],
  stats: { vigor: 3, instinct: 3, will: 7 },
  resources: { hp: 12 },
  statuses: [],
  zoneId: 'chapel-nave',
  custom: {
    companionRole: 'healer',
    companionAbilities: 'medical-support,witness-calming',
    personalGoal: 'Redeem the fallen brothers of the chapel',
  },
};

export const sisterMaren: EntityState = {
  id: 'sister-maren',
  blueprintId: 'sister-maren',
  type: 'npc',
  name: 'Sister Maren',
  tags: ['npc', 'recruitable', 'diplomat'],
  stats: { vigor: 2, instinct: 5, will: 5 },
  resources: { hp: 10 },
  statuses: [],
  zoneId: 'chapel-entrance',
  custom: {
    companionRole: 'diplomat',
    companionAbilities: 'faction-route,scholarly-insight',
    personalGoal: 'Recover the chapel archives from the crypt',
  },
};

// --- Enemies ---

export const ashGhoul: EntityState = {
  id: 'ash-ghoul',
  blueprintId: 'ash-ghoul',
  type: 'enemy',
  name: 'Ash Ghoul',
  tags: ['enemy', 'undead', 'role:brute'],
  stats: { vigor: 4, instinct: 3, will: 1 },
  resources: { hp: 12, stamina: 4 },
  statuses: [],
  zoneId: 'crypt-chamber',
  ai: { profileId: 'aggressive', goals: ['guard-crypt'], fears: ['fire', 'sacred'], alertLevel: 0, knowledge: {} },
};

export const cryptWarden: EntityState = {
  id: 'crypt-warden',
  blueprintId: 'crypt-warden',
  type: 'enemy',
  name: 'Crypt Warden',
  tags: ['enemy', 'undead', 'role:boss'],
  stats: { vigor: 7, instinct: 4, will: 5 },
  resources: { hp: 45, maxHp: 45, stamina: 12, maxStamina: 12 },
  statuses: [],
  zoneId: 'crypt-chamber',
  ai: { profileId: 'territorial', goals: ['protect-crypt', 'destroy-intruders'], fears: ['sacred'], alertLevel: 0, knowledge: {} },
};

export const cryptWardenBoss: BossDefinition = {
  entityId: 'crypt-warden',
  phases: [
    {
      hpThreshold: 0.5,
      narrativeKey: 'enraged',
      addTags: ['enraged'],
    },
    {
      hpThreshold: 0.25,
      narrativeKey: 'desperate',
      addTags: ['desperate'],
      removeTags: ['enraged'],
    },
  ],
  immovable: true,
};

// --- Encounters ---

export const cryptEncounter: EncounterDefinition = {
  id: 'crypt-descent',
  name: 'The Crypt Descent',
  participants: [
    { entityId: 'ash-ghoul', role: 'brute' },
    { entityId: 'crypt-warden', role: 'boss' },
  ],
  composition: 'boss-fight',
  validZoneIds: ['crypt-chamber'],
  narrativeHooks: {
    tone: 'dread, oppressive darkness',
    trigger: 'Entering the crypt antechamber',
    stakes: 'The Ember Sigil and escape from the crypt',
  },
};

// --- Zones ---

export const zones: ZoneState[] = [
  {
    id: 'chapel-entrance',
    roomId: 'ruined-chapel',
    name: 'Ruined Chapel Entrance',
    tags: ['interior', 'sacred', 'dim'],
    neighbors: ['chapel-nave', 'chapel-alcove'],
    light: 3,
    interactables: ['cracked altar', 'faded mural'],
  },
  {
    id: 'chapel-nave',
    roomId: 'ruined-chapel',
    name: 'Chapel Nave',
    tags: ['interior', 'sacred'],
    neighbors: ['chapel-entrance', 'vestry-door'],
    light: 4,
    interactables: ['broken pews', 'dust-covered lectern'],
  },
  {
    id: 'chapel-alcove',
    roomId: 'ruined-chapel',
    name: 'Shadowed Alcove',
    tags: ['interior', 'dark', 'hidden'],
    neighbors: ['chapel-entrance'],
    light: 1,
    interactables: ['loose stone'],
  },
  {
    id: 'vestry-door',
    roomId: 'ruined-chapel',
    name: 'Vestry Passage',
    tags: ['interior', 'transition'],
    neighbors: ['chapel-nave', 'crypt-chamber'],
    light: 2,
    hazards: ['unstable floor'],
  },
  {
    id: 'crypt-chamber',
    roomId: 'crypt',
    name: 'Crypt Antechamber',
    tags: ['interior', 'cursed', 'dark'],
    neighbors: ['vestry-door'],
    light: 1,
    interactables: ['bone altar', 'relic alcove'],
  },
];

// --- Dialogue ---

export const pilgrimDialogue: DialogueDefinition = {
  id: 'pilgrim-talk',
  speakers: ['pilgrim'],
  entryNodeId: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Suspicious Pilgrim',
      text: 'You should not be here. The chapel is... changed. Something stirs below.',
      choices: [
        {
          id: 'ask-what',
          text: 'What stirs below?',
          nextNodeId: 'warn-crypt',
        },
        {
          id: 'ask-relic',
          text: 'I seek the relic.',
          nextNodeId: 'relic-info',
        },
        {
          id: 'leave',
          text: 'I can handle myself.',
          nextNodeId: 'dismiss',
        },
      ],
    },
    'warn-crypt': {
      id: 'warn-crypt',
      speaker: 'Suspicious Pilgrim',
      text: 'An ash ghoul. Once a brother of this order. Now it guards the crypt with hollow fury. Take this, you may need it.',
      choices: [
        {
          id: 'accept',
          text: 'I accept your gift.',
          nextNodeId: 'end-gift',
          effects: [{ type: 'set-global', target: 'actor', params: { key: 'pilgrim-warned', value: true } }],
        },
      ],
    },
    'relic-info': {
      id: 'relic-info',
      speaker: 'Suspicious Pilgrim',
      text: 'The Ember Sigil rests in the crypt alcove, beyond the vestry. But the ghoul will not let you pass without a fight.',
      choices: [
        {
          id: 'thanks',
          text: 'Thank you for the warning.',
          nextNodeId: 'end-info',
          effects: [{ type: 'set-global', target: 'actor', params: { key: 'pilgrim-warned', value: true } }],
        },
      ],
    },
    dismiss: {
      id: 'dismiss',
      speaker: 'Suspicious Pilgrim',
      text: 'Confidence is not armor. Remember that.',
    },
    'end-gift': {
      id: 'end-gift',
      speaker: 'Suspicious Pilgrim',
      text: 'A healing draught. May it serve you well. Go with caution.',
    },
    'end-info': {
      id: 'end-info',
      speaker: 'Suspicious Pilgrim',
      text: 'Be careful, wanderer. The dead here do not rest easily.',
    },
  },
};

// --- Districts ---

import type { DistrictDefinition } from '@ai-rpg-engine/modules';

export const districts: DistrictDefinition[] = [
  {
    id: 'chapel-grounds',
    name: 'Chapel Grounds',
    zoneIds: ['chapel-entrance', 'chapel-nave', 'chapel-alcove'],
    tags: ['sacred', 'aboveground'],
  },
  {
    id: 'crypt-depths',
    name: 'Crypt Depths',
    zoneIds: ['vestry-door', 'crypt-chamber'],
    tags: ['cursed', 'underground'],
    controllingFaction: 'chapel-undead',
  },
];

// --- Progression Trees ---

import type { ProgressionTreeDefinition } from '@ai-rpg-engine/content-schema';

export const combatMasteryTree: ProgressionTreeDefinition = {
  id: 'combat-mastery',
  name: 'Combat Mastery',
  currency: 'xp',
  nodes: [
    {
      id: 'toughened',
      name: 'Toughened',
      cost: 10,
      effects: [{ type: 'resource-boost', params: { resource: 'hp', amount: 5 } }],
    },
    {
      id: 'keen-eye',
      name: 'Keen Eye',
      cost: 15,
      effects: [{ type: 'stat-boost', params: { stat: 'instinct', amount: 1 } }],
    },
    {
      id: 'battle-fury',
      name: 'Battle Fury',
      cost: 25,
      requires: ['toughened'],
      effects: [
        { type: 'stat-boost', params: { stat: 'vigor', amount: 2 } },
        { type: 'grant-tag', params: { tag: 'battle-fury' } },
      ],
    },
  ],
};

// --- Items ---

export const healingDraughtEffect = {
  itemId: 'healing-draught',
  use: (action: ActionIntent, world: WorldState): ResolvedEvent[] => {
    const actor = world.entities[action.actorId];
    if (!actor) return [];
    const previous = actor.resources.hp ?? 0;
    actor.resources.hp = Math.min(20, previous + 8);
    return [{
      id: nextId('evt'),
      tick: action.issuedAtTick,
      type: 'resource.changed',
      actorId: action.actorId,
      payload: {
        entityId: actor.id,
        resource: 'hp',
        previous,
        current: actor.resources.hp,
        delta: actor.resources.hp - previous,
      },
    }];
  },
};

// --- Pack Metadata ---

export const packMeta: PackMetadata = {
  id: 'chapel-threshold',
  name: 'The Chapel Threshold',
  tagline: 'A ruined chapel conceals horrors beneath its crumbling stones.',
  genres: ['fantasy'],
  difficulty: 'beginner',
  tones: ['dark', 'atmospheric'],
  tags: ['undead', 'dungeon', 'sacred', 'combat'],
  engineVersion: '2.0.0',
  version: '2.0.0',
  description: 'Explore a ruined chapel and descend into its cursed crypt. Face an ash ghoul, speak with a suspicious pilgrim, and survive the threshold.',
  narratorTone: 'dark fantasy, concise, atmospheric, foreboding',
};

// --- Build Catalog ---

export const buildCatalog: BuildCatalog = {
  packId: 'chapel-threshold',
  statBudget: 3,
  maxTraits: 3,
  requiredFlaws: 1,
  archetypes: [
    {
      id: 'penitent-knight',
      name: 'Penitent Knight',
      description: 'A warrior burdened by an oath',
      statPriorities: { vigor: 6, instinct: 4, will: 2 },
      startingTags: ['martial', 'penitent'],
      progressionTreeId: 'combat-mastery',
    },
    {
      id: 'gravewalker',
      name: 'Gravewalker',
      description: 'Stalker of the dead, sharp and quiet',
      statPriorities: { vigor: 3, instinct: 5, will: 4 },
      startingTags: ['shadow', 'gravewalker'],
      startingInventory: ['torch'],
      progressionTreeId: 'combat-mastery',
    },
    {
      id: 'chapel-seer',
      name: 'Chapel Seer',
      description: 'Vessel of divine whispers',
      statPriorities: { vigor: 2, instinct: 4, will: 6 },
      resourceOverrides: { stamina: 10 },
      startingTags: ['divine', 'seer'],
      progressionTreeId: 'combat-mastery',
      grantedVerbs: ['pray'],
    },
  ],
  backgrounds: [
    {
      id: 'oath-breaker',
      name: 'Oath-Breaker',
      description: 'Once swore a holy vow, then shattered it',
      statModifiers: { vigor: 1, will: -1 },
      startingTags: ['oath-broken'],
    },
    {
      id: 'temple-orphan',
      name: 'Temple Orphan',
      description: 'Raised by chapel priests, steeped in ritual',
      statModifiers: { will: 1, vigor: -1 },
      startingTags: ['chapel-raised'],
    },
    {
      id: 'gravedigger',
      name: 'Gravedigger',
      description: 'Buried the dead for years — knows what comes back',
      statModifiers: { instinct: 1 },
      startingTags: ['corpse-familiar'],
    },
  ],
  traits: [
    {
      id: 'iron-frame',
      name: 'Iron Frame',
      description: 'Unusually resilient body',
      category: 'perk',
      effects: [{ type: 'resource-modifier', resource: 'hp', amount: 3 }],
    },
    {
      id: 'second-sight',
      name: 'Second Sight',
      description: 'Sees what others cannot',
      category: 'perk',
      effects: [
        { type: 'stat-modifier', stat: 'instinct', amount: 1 },
        { type: 'grant-tag', tag: 'spirit-sensitive' },
      ],
    },
    {
      id: 'glass-faith',
      name: 'Glass Faith',
      description: 'Faith cracks under pressure',
      category: 'flaw',
      effects: [{ type: 'resource-modifier', resource: 'stamina', amount: -2 }],
    },
    {
      id: 'cursed-blood',
      name: 'Cursed Blood',
      description: 'Dark lineage seeps through',
      category: 'flaw',
      effects: [
        { type: 'stat-modifier', stat: 'will', amount: -1 },
        { type: 'grant-tag', tag: 'curse-touched' },
      ],
      incompatibleWith: ['second-sight'],
    },
  ],
  disciplines: [
    {
      id: 'occultist',
      name: 'Occultist',
      description: 'Dabbles in forbidden knowledge beyond the chapel walls',
      grantedVerb: 'commune',
      passive: { type: 'stat-modifier', stat: 'will', amount: 1 },
      drawback: { type: 'resource-modifier', resource: 'stamina', amount: -2 },
    },
    {
      id: 'smuggler',
      name: 'Smuggler',
      description: 'Moves relics through back channels',
      grantedVerb: 'scavenge',
      passive: { type: 'stat-modifier', stat: 'instinct', amount: 1 },
      drawback: { type: 'faction-modifier', faction: 'chapel-undead', amount: -10 },
    },
  ],
  crossTitles: [
    { archetypeId: 'penitent-knight', disciplineId: 'occultist', title: 'Grave Warden', tags: ['grave-warden'] },
    { archetypeId: 'penitent-knight', disciplineId: 'smuggler', title: 'Chapel Smuggler', tags: ['chapel-smuggler'] },
    { archetypeId: 'gravewalker', disciplineId: 'occultist', title: 'Ink-Seer', tags: ['ink-seer'] },
    { archetypeId: 'gravewalker', disciplineId: 'smuggler', title: 'Bone Fence', tags: ['bone-fence'] },
    { archetypeId: 'chapel-seer', disciplineId: 'occultist', title: 'Doomcaller', tags: ['doomcaller'] },
    { archetypeId: 'chapel-seer', disciplineId: 'smuggler', title: 'Relic Runner', tags: ['relic-runner'] },
  ],
  entanglements: [
    {
      id: 'divine-smuggler',
      archetypeId: 'chapel-seer',
      disciplineId: 'smuggler',
      description: 'Divine seers who smuggle relics lose the trust of the chapel spirits',
      effects: [{ type: 'grant-tag', tag: 'distrusted' }],
    },
  ],
};

export const itemCatalog: ItemCatalog = {
  items: [
    {
      id: 'rusted-mace',
      name: 'Rusted Mace',
      description: 'A pitted mace found near a collapsed grave.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { vigor: 1 },
      grantedTags: ['armed'],
      grantedVerbs: ['strike'],
    },
    {
      id: 'chapel-lantern',
      name: 'Chapel Lantern',
      description: 'A flickering lantern blessed by a forgotten saint.',
      slot: 'tool',
      rarity: 'common',
      grantedTags: ['light-bearer'],
      grantedVerbs: ['illuminate'],
      provenance: { origin: 'Chapel reliquary', flags: ['blessed', 'heirloom'], lore: 'Lit by a saint whose name has been forgotten' },
    },
    {
      id: 'penitent-mail',
      name: 'Penitent Mail',
      description: 'Chain links inscribed with prayers of atonement.',
      slot: 'armor',
      rarity: 'common',
      resourceModifiers: { hp: 5 },
    },
    {
      id: 'bone-talisman',
      name: 'Bone Talisman',
      description: 'A charm carved from the rib of a restless dead.',
      slot: 'trinket',
      rarity: 'uncommon',
      grantedTags: ['ward-undead'],
      statModifiers: { will: 1 },
      provenance: { flags: ['cursed', 'trophy'], lore: 'Carved from the rib of something that refused to stay buried' },
    },
    {
      id: 'gravedigger-spade',
      name: 'Gravedigger\'s Spade',
      description: 'A sturdy spade — tool and weapon in equal measure.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { vigor: 1 },
      grantedVerbs: ['dig'],
      provenance: { origin: 'Chapel groundskeeper', lore: 'A well-worn spade used to tend the chapel grounds' },
    },
    {
      id: 'sigil-ring',
      name: 'Sigil Ring',
      description: 'A ring bearing the chapel\'s lost seal.',
      slot: 'accessory',
      rarity: 'uncommon',
      grantedTags: ['chapel-authority'],
      provenance: { origin: 'Chapel inner sanctum', factionId: 'chapel-order', flags: ['heirloom'], lore: 'The lost seal of the Chapel Order' },
    },
    {
      id: 'veil-shroud',
      name: 'Veil Shroud',
      description: 'A threadbare funeral shroud that dulls the senses of the dead.',
      slot: 'armor',
      rarity: 'rare',
      resourceModifiers: { hp: 3 },
      grantedTags: ['veil-touched'],
      statModifiers: { instinct: 1 },
    },
  ],
};
