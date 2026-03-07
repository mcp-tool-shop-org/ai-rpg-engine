// The Chapel Threshold — fantasy starter content
// 2 rooms, 5 zones, 1 NPC, 1 enemy, 1 item, 1 dialogue, 1 status

import type { EntityState, ZoneState, GameManifest, ActionIntent, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import type { DialogueDefinition } from '@ai-rpg-engine/content-schema';

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

// --- Enemies ---

export const ashGhoul: EntityState = {
  id: 'ash-ghoul',
  blueprintId: 'ash-ghoul',
  type: 'enemy',
  name: 'Ash Ghoul',
  tags: ['enemy', 'undead'],
  stats: { vigor: 4, instinct: 3, will: 1 },
  resources: { hp: 12, stamina: 4 },
  statuses: [],
  zoneId: 'crypt-chamber',
  ai: { profileId: 'aggressive', goals: ['guard-crypt'], fears: ['fire', 'sacred'], alertLevel: 0, knowledge: {} },
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
