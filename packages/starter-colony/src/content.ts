// Signal Loss — content definitions

import type { EntityState, ZoneState, GameManifest, ActionIntent, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import type { DialogueDefinition, ProgressionTreeDefinition } from '@ai-rpg-engine/content-schema';
import type { DistrictDefinition } from '@ai-rpg-engine/modules';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';

// --- Manifest ---

export const manifest: GameManifest = {
  id: 'signal-loss',
  title: 'Signal Loss',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'colony-minimal',
  modules: [
    'traversal-core',
    'status-core',
    'combat-core',
    'inventory-core',
    'dialogue-core',
  ],
  contentPacks: ['signal-loss'],
};

// --- Player ---

export const player: EntityState = {
  id: 'commander',
  blueprintId: 'commander',
  type: 'player',
  name: 'Commander',
  tags: ['player', 'human', 'colonist', 'officer'],
  stats: { engineering: 4, command: 6, awareness: 5 },
  resources: { hp: 18, power: 60, morale: 20 },
  statuses: [],
  inventory: [],
  zoneId: 'command-module',
};

// --- NPCs ---

export const scientist: EntityState = {
  id: 'dr_vasquez',
  blueprintId: 'scientist',
  type: 'npc',
  name: 'Dr. Vasquez',
  tags: ['npc', 'colonist', 'scientist', 'female'],
  stats: { engineering: 3, command: 2, awareness: 7 },
  resources: { hp: 12, power: 60, morale: 16 },
  statuses: [],
  zoneId: 'signal-tower',
};

export const security: EntityState = {
  id: 'chief_okafor',
  blueprintId: 'security',
  type: 'npc',
  name: 'Chief Okafor',
  tags: ['npc', 'colonist', 'security', 'male'],
  stats: { engineering: 5, command: 5, awareness: 4 },
  resources: { hp: 20, power: 60, morale: 18 },
  statuses: [],
  zoneId: 'perimeter-fence',
};

// --- Enemies ---

export const drone: EntityState = {
  id: 'breached_drone',
  blueprintId: 'drone',
  type: 'enemy',
  name: 'Breached Drone',
  tags: ['enemy', 'drone', 'mechanical', 'malfunctioning'],
  stats: { engineering: 6, command: 1, awareness: 5 },
  resources: { hp: 10, power: 30, morale: 0 },
  statuses: [],
  zoneId: 'perimeter-fence',
  ai: {
    profileId: 'aggressive',
    goals: ['patrol-perimeter', 'attack-unauthorized'],
    fears: [],
    alertLevel: 0,
    knowledge: {},
  },
};

export const resonance: EntityState = {
  id: 'resonance_entity',
  blueprintId: 'resonance',
  type: 'enemy',
  name: 'Resonance Entity',
  tags: ['enemy', 'alien', 'energy', 'enigmatic'],
  stats: { engineering: 2, command: 1, awareness: 9 },
  resources: { hp: 8, power: 80, morale: 0 },
  statuses: [],
  zoneId: 'alien-cavern',
  ai: {
    profileId: 'territorial',
    goals: ['protect-signal', 'observe-colonists'],
    fears: ['high-power-weapons'],
    alertLevel: 0,
    knowledge: {},
  },
};

// --- Zones ---

export const zones: ZoneState[] = [
  {
    id: 'command-module',
    roomId: 'colony',
    name: 'Command Module',
    tags: ['indoor', 'safe', 'colony-core'],
    neighbors: ['hydroponics', 'perimeter-fence'],
    light: 5,
    interactables: ['console', 'power-grid', 'comms-array', 'status-board'],
  },
  {
    id: 'hydroponics',
    roomId: 'colony',
    name: 'Hydroponics Bay',
    tags: ['indoor', 'life-support', 'colony'],
    neighbors: ['command-module', 'signal-tower'],
    light: 4,
    interactables: ['grow-pods', 'water-recycler', 'nutrient-tanks'],
  },
  {
    id: 'perimeter-fence',
    roomId: 'colony',
    name: 'Perimeter Fence',
    tags: ['outdoor', 'defensive', 'exposed'],
    neighbors: ['command-module', 'alien-cavern'],
    light: 3,
    noise: 5,
    hazards: ['power-drain'],
    interactables: ['fence-generator', 'sentry-mount', 'breach-point'],
  },
  {
    id: 'signal-tower',
    roomId: 'outskirts',
    name: 'Signal Tower',
    tags: ['outdoor', 'elevated', 'scientific'],
    neighbors: ['hydroponics', 'alien-cavern'],
    light: 6,
    interactables: ['antenna-array', 'signal-decoder', 'recording-device'],
  },
  {
    id: 'alien-cavern',
    roomId: 'outskirts',
    name: 'Alien Cavern',
    tags: ['underground', 'alien', 'dangerous', 'enigmatic'],
    neighbors: ['perimeter-fence', 'signal-tower'],
    light: 1,
    noise: 2,
    stability: 3,
    hazards: ['resonance-field', 'low-oxygen'],
    interactables: ['crystal-formation', 'signal-source', 'bio-luminescent-pool'],
  },
];

// --- Dialogue ---

export const scientistDialogue: DialogueDefinition = {
  id: 'vasquez-briefing',
  speakers: ['Dr. Vasquez'],
  entryNodeId: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Dr. Vasquez',
      text: "Commander. The signal from the cavern has changed pattern. It's not random — it's structured. Something down there is responding to us. And the colony council is... divided on what to do about it.",
      choices: [
        {
          id: 'ask-signal',
          text: "What kind of signal? Break it down for me.",
          nextNodeId: 'signal-analysis',
        },
        {
          id: 'ask-council',
          text: "What's the council's position?",
          nextNodeId: 'council-politics',
        },
      ],
    },
    'signal-analysis': {
      id: 'signal-analysis',
      speaker: 'Dr. Vasquez',
      text: "Harmonic resonance at frequencies our equipment wasn't designed to detect. The pattern repeats every 47 seconds. It accelerated after we activated the perimeter fence. Whatever is down there, it noticed us.",
      choices: [
        {
          id: 'investigate',
          text: "I'll go down there. What do I need?",
          nextNodeId: 'mission-prep',
        },
        { id: 'cautious', text: "We should wait and observe.", nextNodeId: 'end' },
      ],
    },
    'council-politics': {
      id: 'council-politics',
      speaker: 'Dr. Vasquez',
      text: "Okafor wants to seal the cavern and forget it exists. Half the engineering team thinks we should study it. And there's a faction — small but growing — that wants to shut down the colony and evacuate. Morale is fragile.",
      choices: [
        { id: 'to-signal', text: 'Tell me about the signal itself.', nextNodeId: 'signal-analysis' },
        { id: 'leave-politics', text: "I'll handle the council. Focus on the data.", nextNodeId: 'end' },
      ],
    },
    'mission-prep': {
      id: 'mission-prep',
      speaker: 'Dr. Vasquez',
      text: "Take an emergency power cell — the resonance field drains colony systems. Your suit has basic shielding, but don't stay in the cavern too long. And Commander... if the signal changes again, get out.",
      effects: [
        { type: 'set-global', target: 'actor', params: { key: 'cavern-mission', value: true } },
      ],
    },
    end: {
      id: 'end',
      speaker: 'Dr. Vasquez',
      text: "I'll keep monitoring from the tower. Be careful, Commander.",
    },
  },
};

// --- Districts ---

export const districts: DistrictDefinition[] = [
  {
    id: 'colony',
    name: 'Colony Proper',
    zoneIds: ['command-module', 'hydroponics', 'perimeter-fence'],
    tags: ['colonist', 'defended'],
    controllingFaction: 'colony-council',
  },
  {
    id: 'outskirts',
    name: 'Colony Outskirts',
    zoneIds: ['signal-tower', 'alien-cavern'],
    tags: ['exposed', 'alien', 'scientific'],
  },
];

// --- Progression ---

export const commanderTree: ProgressionTreeDefinition = {
  id: 'commander',
  name: 'Commander',
  currency: 'xp',
  nodes: [
    {
      id: 'field-engineer',
      name: 'Field Engineer',
      cost: 10,
      effects: [
        { type: 'stat-boost', params: { stat: 'engineering', amount: 1 } },
        { type: 'resource-boost', params: { resource: 'power', amount: 10 } },
      ],
    },
    {
      id: 'sharp-sensors',
      name: 'Sharp Sensors',
      cost: 12,
      effects: [
        { type: 'stat-boost', params: { stat: 'awareness', amount: 1 } },
        { type: 'grant-tag', params: { tag: 'enhanced-sensors' } },
      ],
    },
    {
      id: 'unshakeable',
      name: 'Unshakeable',
      cost: 25,
      requires: ['field-engineer', 'sharp-sensors'],
      effects: [
        { type: 'stat-boost', params: { stat: 'command', amount: 2 } },
        { type: 'resource-boost', params: { resource: 'morale', amount: 8 } },
      ],
    },
  ],
};

// --- Item Effect ---

export const emergencyCellEffect = {
  itemId: 'emergency-cell',
  use: (action: ActionIntent, world: WorldState): ResolvedEvent[] => {
    const actor = world.entities[action.actorId];
    if (!actor) return [];

    const previous = actor.resources.power ?? 0;
    actor.resources.power = Math.min(100, previous + 20);

    return [{
      id: nextId('evt'),
      tick: action.issuedAtTick,
      type: 'resource.changed',
      actorId: action.actorId,
      payload: {
        entityId: actor.id,
        resource: 'power',
        previous,
        current: actor.resources.power,
        delta: actor.resources.power - previous,
      },
    }];
  },
};

// --- Pack Metadata ---

export const packMeta: PackMetadata = {
  id: 'signal-loss',
  name: 'Signal Loss',
  tagline: 'Something beneath the colony is listening. And it just started talking back.',
  genres: ['sci-fi'],
  difficulty: 'advanced',
  tones: ['tense', 'atmospheric'],
  tags: ['colony', 'alien', 'management', 'first-contact', 'power'],
  engineVersion: '2.0.0',
  version: '2.0.0',
  description: 'Command a struggling colony on an alien world. Manage dwindling power, navigate political fractures, and investigate a signal from beneath the surface.',
  narratorTone: 'hard sci-fi, clinical, tense, vast',
};

// --- Build Catalog ---

export const buildCatalog: BuildCatalog = {
  packId: 'signal-loss',
  statBudget: 3,
  maxTraits: 3,
  requiredFlaws: 1,
  archetypes: [
    {
      id: 'field-engineer',
      name: 'Field Engineer',
      description: 'Keeps the colony running with wire and will',
      statPriorities: { engineering: 7, command: 3, awareness: 4 },
      startingTags: ['engineer', 'field-engineer'],
      progressionTreeId: 'commander-path',
      grantedVerbs: ['allocate'],
    },
    {
      id: 'colony-commander',
      name: 'Colony Commander',
      description: 'Holds the crew together, makes the calls',
      statPriorities: { engineering: 3, command: 7, awareness: 4 },
      startingTags: ['leader', 'colony-commander'],
      progressionTreeId: 'commander-path',
      grantedVerbs: ['scan'],
    },
    {
      id: 'outrider',
      name: 'Outrider',
      description: 'Scouts the perimeter, reads the signals',
      statPriorities: { engineering: 4, command: 3, awareness: 7 },
      startingTags: ['scout', 'outrider'],
      progressionTreeId: 'commander-path',
      grantedVerbs: ['scan'],
    },
  ],
  backgrounds: [
    {
      id: 'terraform-corps',
      name: 'Terraform Corps',
      description: 'Trained to shape hostile worlds into homes',
      statModifiers: { engineering: 1, awareness: -1 },
      startingTags: ['terra-trained'],
    },
    {
      id: 'command-academy',
      name: 'Command Academy',
      description: 'Fleet-trained leadership, by the book',
      statModifiers: { command: 1, engineering: -1 },
      startingTags: ['academy-graduate'],
    },
    {
      id: 'frontier-scout',
      name: 'Frontier Scout',
      description: 'First boots on alien soil, every time',
      statModifiers: { awareness: 1 },
      startingTags: ['pathfinder'],
    },
  ],
  traits: [
    {
      id: 'power-efficiency',
      name: 'Power Efficiency',
      description: 'Runs systems lean, wastes nothing',
      category: 'perk',
      effects: [{ type: 'resource-modifier', resource: 'power', amount: 10 }],
    },
    {
      id: 'keen-sensors',
      name: 'Keen Sensors',
      description: 'Notices what the instruments miss',
      category: 'perk',
      effects: [
        { type: 'stat-modifier', stat: 'awareness', amount: 1 },
        { type: 'grant-tag', tag: 'enhanced-sensors' },
      ],
    },
    {
      id: 'system-dependency',
      name: 'System Dependency',
      description: 'Cannot function without full infrastructure',
      category: 'flaw',
      effects: [{ type: 'resource-modifier', resource: 'power', amount: -10 }],
      incompatibleWith: ['power-efficiency'],
    },
    {
      id: 'crew-friction',
      name: 'Crew Friction',
      description: 'Abrasive personality that grinds on the crew',
      category: 'flaw',
      effects: [
        { type: 'resource-modifier', resource: 'morale', amount: -5 },
        { type: 'grant-tag', tag: 'abrasive' },
      ],
    },
  ],
  disciplines: [
    {
      id: 'xenobiologist',
      name: 'Xenobiologist',
      description: 'Studies the alien presence with fascination, not fear',
      grantedVerb: 'commune',
      passive: { type: 'stat-modifier', stat: 'awareness', amount: 1 },
      drawback: { type: 'stat-modifier', stat: 'command', amount: -1 },
    },
    {
      id: 'salvage-specialist',
      name: 'Salvage Specialist',
      description: 'Strips derelict systems for parts and power',
      grantedVerb: 'scavenge',
      passive: { type: 'stat-modifier', stat: 'engineering', amount: 1 },
      drawback: { type: 'resource-modifier', resource: 'morale', amount: -3 },
    },
  ],
  crossTitles: [
    { archetypeId: 'field-engineer', disciplineId: 'xenobiologist', title: 'Resonance Technician', tags: ['resonance-technician'] },
    { archetypeId: 'field-engineer', disciplineId: 'salvage-specialist', title: 'Junk Architect', tags: ['junk-architect'] },
    { archetypeId: 'colony-commander', disciplineId: 'xenobiologist', title: 'First Contact Officer', tags: ['first-contact-officer'] },
    { archetypeId: 'colony-commander', disciplineId: 'salvage-specialist', title: 'Resource Czar', tags: ['resource-czar'] },
    { archetypeId: 'outrider', disciplineId: 'xenobiologist', title: 'Signal Prophet', tags: ['signal-prophet'] },
    { archetypeId: 'outrider', disciplineId: 'salvage-specialist', title: 'Perimeter Hawk', tags: ['perimeter-hawk'] },
  ],
  entanglements: [
    {
      id: 'commander-salvage',
      archetypeId: 'colony-commander',
      disciplineId: 'salvage-specialist',
      description: 'A commander who strips systems for parts undermines crew confidence in the colony infrastructure',
      effects: [{ type: 'resource-modifier', resource: 'morale', amount: -3 }],
    },
  ],
};
