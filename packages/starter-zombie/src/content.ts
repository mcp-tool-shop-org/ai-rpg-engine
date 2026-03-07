// Ashfall Dead — content definitions

import type { EntityState, ZoneState, GameManifest, ActionIntent, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import type { DialogueDefinition, ProgressionTreeDefinition } from '@ai-rpg-engine/content-schema';
import type { DistrictDefinition } from '@ai-rpg-engine/modules';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';

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
  tags: ['enemy', 'zombie', 'undead', 'slow'],
  stats: { fitness: 3, wits: 1, nerve: 10 },
  resources: { hp: 12, stamina: 20, infection: 0 },
  statuses: [],
  zoneId: 'overrun-street',
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
  tags: ['enemy', 'zombie', 'undead', 'fast'],
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
