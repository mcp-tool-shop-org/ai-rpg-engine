// Ashfall Dead — content definitions

import type { EntityState, ZoneState, GameManifest, ActionIntent, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import type { DialogueDefinition, ProgressionTreeDefinition, AbilityDefinition, StatusDefinition } from '@ai-rpg-engine/content-schema';
import type { DistrictDefinition, EncounterDefinition, BossDefinition } from '@ai-rpg-engine/modules';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';

// --- Manifest ---

export const manifest: GameManifest = {
  id: 'ashfall-dead',
  title: 'Ashfall Dead',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'zombie-minimal',
  modules: [
    'traversal-core',
    'status-core',
    'combat-core',
    'inventory-core',
    'dialogue-core',
  ],
  contentPacks: ['ashfall-dead'],
};

// --- Player ---

export const player: EntityState = {
  id: 'survivor',
  blueprintId: 'survivor',
  type: 'player',
  name: 'Survivor',
  tags: ['player', 'human', 'survivor'],
  stats: { fitness: 5, wits: 6, nerve: 5 },
  resources: { hp: 18, stamina: 12, infection: 0 },
  statuses: [],
  inventory: [],
  zoneId: 'safehouse-lobby',
};

// --- NPCs ---

export const medic: EntityState = {
  id: 'medic_chen',
  blueprintId: 'medic',
  type: 'npc',
  name: 'Dr. Chen',
  tags: ['npc', 'survivor', 'medic', 'female'],
  stats: { fitness: 3, wits: 7, nerve: 4 },
  resources: { hp: 12, stamina: 10, infection: 0 },
  statuses: [],
  zoneId: 'safehouse-lobby',
};

export const scavenger: EntityState = {
  id: 'scavenger_rook',
  blueprintId: 'scavenger',
  type: 'npc',
  name: 'Rook',
  tags: ['npc', 'survivor', 'scavenger', 'male'],
  stats: { fitness: 6, wits: 5, nerve: 3 },
  resources: { hp: 16, stamina: 14, infection: 0 },
  statuses: [],
  zoneId: 'gas-station',
};

export const leader: EntityState = {
  id: 'leader_marsh',
  blueprintId: 'leader',
  type: 'npc',
  name: 'Sergeant Marsh',
  tags: ['npc', 'survivor', 'military', 'male'],
  stats: { fitness: 6, wits: 4, nerve: 6 },
  resources: { hp: 20, stamina: 14, infection: 0 },
  statuses: [],
  zoneId: 'safehouse-lobby',
};

// --- Enemies ---

export const shambler: EntityState = {
  id: 'shambler_1',
  blueprintId: 'shambler',
  type: 'enemy',
  name: 'Shambler',
  tags: ['enemy', 'zombie', 'undead', 'slow', 'role:minion'],
  stats: { fitness: 3, wits: 1, nerve: 10 },
  resources: { hp: 12, stamina: 20, infection: 0 },
  statuses: [],
  zoneId: 'overrun-street',
  resistances: { control: 'immune' },
  ai: {
    profileId: 'aggressive',
    goals: ['consume-living'],
    fears: [],
    alertLevel: 0,
    knowledge: {},
  },
};

export const runner: EntityState = {
  id: 'runner_1',
  blueprintId: 'runner',
  type: 'enemy',
  name: 'Runner',
  tags: ['enemy', 'zombie', 'undead', 'fast', 'role:skirmisher'],
  stats: { fitness: 7, wits: 1, nerve: 10 },
  resources: { hp: 8, stamina: 25, infection: 0 },
  statuses: [],
  zoneId: 'hospital-wing',
  ai: {
    profileId: 'aggressive',
    goals: ['consume-living', 'chase-noise'],
    fears: [],
    alertLevel: 0,
    knowledge: {},
  },
};

export const bloaterAlpha: EntityState = {
  id: 'bloater-alpha',
  blueprintId: 'bloater-alpha',
  type: 'enemy',
  name: 'Bloater Alpha',
  tags: ['enemy', 'zombie', 'undead', 'role:boss'],
  stats: { fitness: 8, wits: 2, nerve: 10 },
  resources: { hp: 50, maxHp: 50, stamina: 30, maxStamina: 30, infection: 0 },
  statuses: [],
  zoneId: 'hospital-wing',
  resistances: { fear: 'immune', poison: 'resistant' },
  ai: {
    profileId: 'aggressive',
    goals: ['destroy-all-living'],
    fears: [],
    alertLevel: 0,
    knowledge: {},
  },
};

export const bloaterAlphaBoss: BossDefinition = {
  entityId: 'bloater-alpha',
  phases: [
    {
      hpThreshold: 0.5,
      narrativeKey: 'rupturing',
      addTags: ['toxic-cloud'],
    },
    {
      hpThreshold: 0.2,
      narrativeKey: 'death-throes',
      addTags: ['frenzied'],
      removeTags: ['toxic-cloud'],
    },
  ],
  immovable: true,
};

export const hordeEncounter: EncounterDefinition = {
  id: 'hospital-horde',
  name: 'Hospital Horde',
  participants: [
    { entityId: 'bloater-alpha', role: 'boss' },
    { entityId: 'shambler_1', role: 'minion' },
    { entityId: 'runner_1', role: 'skirmisher' },
  ],
  composition: 'boss-fight',
  validZoneIds: ['hospital-wing'],
  narrativeHooks: {
    tone: 'overwhelming dread, nowhere to run',
    trigger: 'Deep within the abandoned hospital',
    stakes: 'Medical supplies and survival',
  },
};

export const streetPatrol: EncounterDefinition = {
  id: 'street-patrol',
  name: 'Street Patrol',
  participants: [
    { entityId: 'shambler_1', role: 'minion' },
    { entityId: 'runner_1', role: 'skirmisher' },
  ],
  composition: 'patrol',
  validZoneIds: ['overrun-street', 'gas-station'],
  narrativeHooks: {
    tone: 'shambling shadows, sudden bursts of speed',
    trigger: 'Noise attracts the dead from nearby blocks',
    stakes: 'Safe passage to the gas station',
  },
};

export const runnerAmbush: EncounterDefinition = {
  id: 'runner-ambush',
  name: 'Runner Ambush',
  participants: [
    { entityId: 'runner_1', role: 'skirmisher' },
    { entityId: 'runner_1', role: 'skirmisher' },
  ],
  composition: 'ambush',
  validZoneIds: ['hospital-wing'],
  narrativeHooks: {
    tone: 'blinding speed, no time to react',
    trigger: 'Entering the east wing corridor',
    stakes: 'Access to the medicine cabinet',
  },
};

// --- Zones ---

export const zones: ZoneState[] = [
  {
    id: 'safehouse-lobby',
    roomId: 'safehouse',
    name: 'Safehouse Lobby',
    tags: ['indoor', 'safe', 'home-base'],
    neighbors: ['gas-station', 'overrun-street'],
    light: 2,
    stability: 6,
    interactables: ['barricade-door', 'supply-shelf', 'radio'],
  },
  {
    id: 'gas-station',
    roomId: 'outskirts',
    name: 'Abandoned Gas Station',
    tags: ['indoor', 'loot', 'neutral'],
    neighbors: ['safehouse-lobby', 'overrun-street'],
    light: 3,
    interactables: ['fuel-pump', 'counter', 'storage-room'],
  },
  {
    id: 'overrun-street',
    roomId: 'outskirts',
    name: 'Overrun Street',
    tags: ['outdoor', 'hostile', 'urban'],
    neighbors: ['safehouse-lobby', 'gas-station', 'hospital-wing'],
    light: 4,
    noise: 7,
    hazards: ['roaming-dead', 'broken-glass'],
  },
  {
    id: 'hospital-wing',
    roomId: 'hospital',
    name: 'Hospital East Wing',
    tags: ['indoor', 'hostile', 'medical'],
    neighbors: ['overrun-street', 'rooftop'],
    light: 1,
    noise: 3,
    hazards: ['infection-risk', 'collapsed-ceiling'],
    interactables: ['medicine-cabinet', 'gurney', 'emergency-exit'],
  },
  {
    id: 'rooftop',
    roomId: 'hospital',
    name: 'Hospital Rooftop',
    tags: ['outdoor', 'high-ground', 'lookout'],
    neighbors: ['hospital-wing'],
    light: 6,
    stability: 4,
    interactables: ['signal-fire', 'binoculars', 'helicopter-pad'],
  },
];

// --- Dialogue ---

export const medicDialogue: DialogueDefinition = {
  id: 'medic-triage',
  speakers: ['Dr. Chen'],
  entryNodeId: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Dr. Chen',
      text: "You're still breathing — that's better than most who come through that door. I've got antibiotics, but not enough. We need to hit the hospital before they're gone for good.",
      choices: [
        {
          id: 'ask-hospital',
          text: "What's the situation at the hospital?",
          nextNodeId: 'hospital-intel',
        },
        {
          id: 'ask-infection',
          text: 'What happens if someone gets bitten?',
          nextNodeId: 'infection-info',
        },
      ],
    },
    'hospital-intel': {
      id: 'hospital-intel',
      speaker: 'Dr. Chen',
      text: "East wing had the pharmacy. Runners have been spotted inside — fast ones. But the medicine cabinet should still be intact if nobody's been stupid enough to go in.",
      choices: [
        {
          id: 'volunteer',
          text: "I'll go. What do you need?",
          nextNodeId: 'mission-accept',
        },
        { id: 'refuse', text: "That's a death sentence.", nextNodeId: 'end' },
      ],
    },
    'infection-info': {
      id: 'infection-info',
      speaker: 'Dr. Chen',
      text: "The infection spreads through bites — slowly at first, then it accelerates. Antibiotics can slow it down. A full dose might stop it entirely if caught early. But once it takes hold... there's nothing I can do.",
      choices: [
        { id: 'to-hospital', text: 'Then we need that medicine.', nextNodeId: 'hospital-intel' },
        { id: 'leave', text: "I'll keep that in mind.", nextNodeId: 'end' },
      ],
    },
    'mission-accept': {
      id: 'mission-accept',
      speaker: 'Dr. Chen',
      text: "Anything in the medicine cabinet — antibiotics, painkillers, surgical supplies. Bring it all back. And be quiet — those runners hunt by sound.",
      effects: [
        { type: 'set-global', target: 'actor', params: { key: 'hospital-mission', value: true } },
      ],
    },
    end: {
      id: 'end',
      speaker: 'Dr. Chen',
      text: "Stay safe out there. And if you start feeling feverish... come see me before it's too late.",
    },
  },
};

// --- Districts ---

export const districts: DistrictDefinition[] = [
  {
    id: 'safehouse',
    name: 'The Safehouse',
    zoneIds: ['safehouse-lobby'],
    tags: ['safe', 'survivors'],
    controllingFaction: 'survivors',
  },
  {
    id: 'dead-zone',
    name: 'Dead Zone',
    zoneIds: ['overrun-street', 'gas-station', 'hospital-wing', 'rooftop'],
    tags: ['hostile', 'undead', 'scavenging'],
  },
];

// --- Progression ---

export const survivalTree: ProgressionTreeDefinition = {
  id: 'survival',
  name: 'Survival',
  currency: 'xp',
  nodes: [
    {
      id: 'scrapper',
      name: 'Scrapper',
      cost: 10,
      effects: [
        { type: 'stat-boost', params: { stat: 'fitness', amount: 1 } },
        { type: 'resource-boost', params: { resource: 'stamina', amount: 3 } },
      ],
    },
    {
      id: 'cool-headed',
      name: 'Cool-Headed',
      cost: 12,
      effects: [
        { type: 'stat-boost', params: { stat: 'nerve', amount: 1 } },
        { type: 'grant-tag', params: { tag: 'steady' } },
      ],
    },
    {
      id: 'last-one-standing',
      name: 'Last One Standing',
      cost: 25,
      requires: ['scrapper', 'cool-headed'],
      effects: [
        { type: 'resource-boost', params: { resource: 'hp', amount: 8 } },
        { type: 'stat-boost', params: { stat: 'wits', amount: 2 } },
      ],
    },
  ],
};

// --- Item Effect ---

export const antibioticsEffect = {
  itemId: 'antibiotics',
  use: (action: ActionIntent, world: WorldState): ResolvedEvent[] => {
    const actor = world.entities[action.actorId];
    if (!actor) return [];

    const previous = actor.resources.infection ?? 0;
    actor.resources.infection = Math.max(0, previous - 25);

    return [{
      id: nextId('evt'),
      tick: action.issuedAtTick,
      type: 'resource.changed',
      actorId: action.actorId,
      payload: {
        entityId: actor.id,
        resource: 'infection',
        previous,
        current: actor.resources.infection,
        delta: actor.resources.infection - previous,
      },
    }];
  },
};

// --- Abilities ---

export const desperateSwing: AbilityDefinition = {
  id: 'desperate-swing',
  name: 'Desperate Swing',
  verb: 'use-ability',
  tags: ['combat', 'damage'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'single' },
  checks: [{ stat: 'fitness', difficulty: 5, onFail: 'half-damage' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 5, damageType: 'melee' } },
  ],
  cooldown: 2,
  requirements: [{ type: 'has-tag', params: { tag: 'survivor' } }],
  ui: {
    text: 'Swing hard. Swing fast. Make it count.',
    hitText: 'The blow connects — bone crunches.',
    missText: 'It lurches aside. Wasted energy.',
    soundCue: 'ability.desperate-swing',
  },
};

export const fieldTriage: AbilityDefinition = {
  id: 'field-triage',
  name: 'Field Triage',
  verb: 'use-ability',
  tags: ['support', 'heal'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'self' },
  checks: [{ stat: 'wits', difficulty: 5, onFail: 'abort' }],
  effects: [
    { type: 'heal', target: 'actor', params: { amount: 4, resource: 'hp' } },
    { type: 'resource-modify', target: 'actor', params: { resource: 'infection', amount: -2 } },
  ],
  cooldown: 4,
  ui: {
    text: 'Patch the wound. Clean the bite. Keep moving.',
    hitText: 'Bandaged and disinfected — not clean, but alive.',
    missText: 'Hands shaking too badly. The wound stays open.',
    soundCue: 'ability.field-triage',
  },
};

export const warCry: AbilityDefinition = {
  id: 'war-cry',
  name: 'War Cry',
  verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [
    { resourceId: 'stamina', amount: 3 },
    { resourceId: 'infection', amount: 5 },
  ],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2, stacking: 'replace' } },
  ],
  cooldown: 4,
  requirements: [{ type: 'has-tag', params: { tag: 'survivor' } }],
  ui: {
    text: 'Let the infection fuel the fury. Scream until they flinch.',
    hitText: 'A primal roar echoes — even the dead hesitate.',
    missText: 'The scream catches in the throat. Nothing flinches.',
    soundCue: 'ability.war-cry',
  },
};

export const survivalInstinct: AbilityDefinition = {
  id: 'survival-instinct',
  name: 'Survival Instinct',
  verb: 'use-ability',
  tags: ['support', 'cleanse'],
  costs: [{ resourceId: 'stamina', amount: 2 }],
  target: { type: 'self' },
  checks: [{ stat: 'nerve', difficulty: 5, onFail: 'abort' }],
  effects: [
    { type: 'remove-status-by-tag', target: 'actor', params: { tags: 'fear,blind' } },
  ],
  cooldown: 3,
  requirements: [{ type: 'has-tag', params: { tag: 'survivor' } }],
  ui: {
    text: 'The body knows what the mind forgets — survive.',
    hitText: 'Adrenaline surges. Fear dissolves. Eyes clear.',
    missText: 'Panic grips tight. The instinct fails.',
    soundCue: 'ability.survival-instinct',
  },
};

export const zombieAbilities: AbilityDefinition[] = [desperateSwing, fieldTriage, warCry, survivalInstinct];

// --- Status Definitions ---

export const zombieStatusDefinitions: StatusDefinition[] = [
  {
    id: 'rattled',
    name: 'Rattled',
    tags: ['fear', 'debuff'],
    stacking: 'replace',
    duration: { type: 'ticks', value: 2 },
    ui: { icon: '!', color: '#e74c3c', description: 'Shaken by primal fury — hesitating, stumbling' },
  },
];

// --- Pack Metadata ---

export const packMeta: PackMetadata = {
  id: 'ashfall-dead',
  name: 'Ashfall Dead',
  tagline: 'Society has snapped in half. You decide who gets saved.',
  genres: ['horror', 'post-apocalyptic'],
  difficulty: 'intermediate',
  tones: ['tense', 'gritty'],
  tags: ['zombie', 'survival', 'scavenging', 'infection'],
  engineVersion: '2.0.0',
  version: '2.0.0',
  description: 'Survive in a zombie-ravaged city. Manage infection, scavenge supplies, and make impossible choices about who lives.',
  narratorTone: 'survival horror, desperate, tense, bleak',
};

// --- Build Catalog ---

export const buildCatalog: BuildCatalog = {
  packId: 'ashfall-dead',
  statBudget: 3,
  maxTraits: 3,
  requiredFlaws: 1,
  archetypes: [
    {
      id: 'survivor',
      name: 'Survivor',
      description: 'Endurance machine, never stops moving',
      statPriorities: { fitness: 7, wits: 4, nerve: 3 },
      startingTags: ['survivor', 'endurance'],
      progressionTreeId: 'survival',
      grantedVerbs: ['barricade'],
    },
    {
      id: 'scavenger',
      name: 'Scavenger',
      description: 'Finds resources where others see trash',
      statPriorities: { fitness: 3, wits: 7, nerve: 4 },
      startingTags: ['scavenger', 'resourceful'],
      progressionTreeId: 'survival',
      grantedVerbs: ['scavenge'],
    },
    {
      id: 'warden',
      name: 'Warden',
      description: 'Holds the line, keeps people together',
      statPriorities: { fitness: 4, wits: 3, nerve: 7 },
      startingTags: ['leader', 'warden'],
      progressionTreeId: 'survival',
      grantedVerbs: ['barricade'],
    },
  ],
  backgrounds: [
    {
      id: 'former-soldier',
      name: 'Former Soldier',
      description: 'Military training keeps you alive, but the orders stopped coming',
      statModifiers: { fitness: 1, wits: -1 },
      startingTags: ['military-trained'],
    },
    {
      id: 'hospital-staff',
      name: 'Hospital Staff',
      description: 'Knows anatomy — useful for healing and for headshots',
      statModifiers: { wits: 1, nerve: -1 },
      startingTags: ['medical-knowledge'],
    },
    {
      id: 'firefighter',
      name: 'Firefighter',
      description: 'Ran into burning buildings. This is worse, but the instinct holds',
      statModifiers: { nerve: 1 },
      startingTags: ['first-responder'],
    },
  ],
  traits: [
    {
      id: 'iron-stomach',
      name: 'Iron Stomach',
      description: 'Resistant to the early stages of infection',
      category: 'perk',
      effects: [{ type: 'resource-modifier', resource: 'infection', amount: -10 }],
    },
    {
      id: 'resourceful',
      name: 'Resourceful',
      description: 'Always has something useful in a pocket',
      category: 'perk',
      effects: [
        { type: 'stat-modifier', stat: 'wits', amount: 1 },
        { type: 'grant-tag', tag: 'pack-rat' },
      ],
    },
    {
      id: 'trauma-response',
      name: 'Trauma Response',
      description: 'The body remembers what the mind tries to forget',
      category: 'flaw',
      effects: [{ type: 'resource-modifier', resource: 'stamina', amount: -3 }],
    },
    {
      id: 'bite-scar',
      name: 'Bite Scar',
      description: 'A healed bite that never fully healed',
      category: 'flaw',
      effects: [
        { type: 'resource-modifier', resource: 'infection', amount: 15 },
        { type: 'grant-tag', tag: 'scarred' },
      ],
      incompatibleWith: ['iron-stomach'],
    },
  ],
  disciplines: [
    {
      id: 'field-medic',
      name: 'Field Medic',
      description: 'Patches wounds under fire',
      grantedVerb: 'scan',
      passive: { type: 'stat-modifier', stat: 'wits', amount: 1 },
      drawback: { type: 'stat-modifier', stat: 'fitness', amount: -1 },
    },
    {
      id: 'raider',
      name: 'Raider',
      description: 'Takes what others defend',
      grantedVerb: 'plunder',
      passive: { type: 'stat-modifier', stat: 'fitness', amount: 1 },
      drawback: { type: 'faction-modifier', faction: 'survivors', amount: -10 },
    },
  ],
  crossTitles: [
    { archetypeId: 'survivor', disciplineId: 'field-medic', title: 'Grave Surgeon', tags: ['grave-surgeon'] },
    { archetypeId: 'survivor', disciplineId: 'raider', title: 'Road Warlord', tags: ['road-warlord'] },
    { archetypeId: 'scavenger', disciplineId: 'field-medic', title: 'Pharmacy Runner', tags: ['pharmacy-runner'] },
    { archetypeId: 'scavenger', disciplineId: 'raider', title: 'Vulture King', tags: ['vulture-king'] },
    { archetypeId: 'warden', disciplineId: 'field-medic', title: 'Quarantine Marshal', tags: ['quarantine-marshal'] },
    { archetypeId: 'warden', disciplineId: 'raider', title: 'Iron Shepherd', tags: ['iron-shepherd'] },
  ],
  entanglements: [
    {
      id: 'warden-raider',
      archetypeId: 'warden',
      disciplineId: 'raider',
      description: 'A leader who raids erodes the trust they built — the group fractures',
      effects: [{ type: 'resource-modifier', resource: 'stamina', amount: -2 }],
    },
  ],
};

// --- Item Catalog ---

export const itemCatalog: ItemCatalog = {
  items: [
    {
      id: 'fire-axe',
      name: 'Fire Axe',
      description: 'Heavy, reliable, and already covered in something dark.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { fitness: 1 },
      grantedTags: ['armed'],
      grantedVerbs: ['chop'],
    },
    {
      id: 'first-aid-kit',
      name: 'First Aid Kit',
      description: 'Bandages, antiseptic, and a prayer.',
      slot: 'tool',
      rarity: 'common',
      grantedVerbs: ['treat'],
      resourceModifiers: { infection: -5 },
    },
    {
      id: 'riot-vest',
      name: 'Riot Vest',
      description: 'Ballistic vest scavenged from a precinct.',
      slot: 'armor',
      rarity: 'common',
      resourceModifiers: { hp: 5 },
    },
    {
      id: 'duct-tape-roll',
      name: 'Duct Tape Roll',
      description: 'Fixes everything. Almost.',
      slot: 'trinket',
      rarity: 'common',
      grantedTags: ['resourceful'],
      grantedVerbs: ['repair'],
    },
    {
      id: 'crowbar',
      name: 'Crowbar',
      description: 'Opens doors, crates, and skulls with equal ease.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { fitness: 1 },
      grantedVerbs: ['pry'],
      grantedTags: ['armed'],
    },
    {
      id: 'gas-mask',
      name: 'Gas Mask',
      description: 'Filters out the worst of the air — and the smell.',
      slot: 'accessory',
      rarity: 'uncommon',
      grantedTags: ['filtered'],
      resourceModifiers: { infection: -10 },
    },
    {
      id: 'military-radio',
      name: 'Military Radio',
      description: 'A handheld radio tuned to survivor frequencies.',
      slot: 'tool',
      rarity: 'rare',
      statModifiers: { wits: 2 },
      grantedTags: ['comms-active'],
      grantedVerbs: ['broadcast'],
    },
  ],
};
