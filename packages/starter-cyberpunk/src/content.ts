// Neon Lockbox — cyberpunk micro-demo content
// 3 zones, 1 NPC, 1 ICE agent, 1 item, 1 dialogue

import type { EntityState, ZoneState, GameManifest, ActionIntent, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import type { DialogueDefinition } from '@ai-rpg-engine/content-schema';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import type { AbilityDefinition, StatusDefinition } from '@ai-rpg-engine/content-schema';

export const manifest: GameManifest = {
  id: 'neon-lockbox',
  title: 'Neon Lockbox',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'cyberpunk-minimal',
  modules: ['traversal-core', 'status-core', 'combat-core', 'inventory-core', 'dialogue-core'],
  contentPacks: ['neon-lockbox'],
};

// --- Player ---

export const player: EntityState = {
  id: 'runner',
  blueprintId: 'runner',
  type: 'player',
  name: 'Ghost',
  tags: ['player', 'netrunner'],
  stats: { chrome: 3, reflex: 5, netrunning: 7 },
  resources: { hp: 15, stamina: 6, ice: 10, bandwidth: 8 },
  statuses: [],
  inventory: [],
  zoneId: 'street-level',
};

// --- NPCs ---

export const fixer: EntityState = {
  id: 'fixer',
  blueprintId: 'fixer',
  type: 'npc',
  name: 'Kira',
  tags: ['npc', 'fixer', 'recruitable', 'fighter'],
  stats: { chrome: 2, reflex: 4, netrunning: 3 },
  resources: { hp: 10 },
  statuses: [],
  zoneId: 'street-level',
  custom: {
    companionRole: 'fighter',
    companionAbilities: 'intimidation-backup,trade-advantage',
    personalGoal: 'Track down the source of the lockbox data',
  },
};

export const rez: EntityState = {
  id: 'rez',
  blueprintId: 'rez',
  type: 'npc',
  name: 'Rez',
  tags: ['npc', 'recruitable', 'scout'],
  stats: { chrome: 1, reflex: 6, netrunning: 5 },
  resources: { hp: 8 },
  statuses: [],
  zoneId: 'server-room',
  custom: {
    companionRole: 'scout',
    companionAbilities: 'smuggling-contact,rumor-suppression',
    personalGoal: 'Erase his identity from the corporate databases',
  },
};

// --- Enemies ---

export const iceAgent: EntityState = {
  id: 'ice-sentry',
  blueprintId: 'ice-sentry',
  type: 'enemy',
  name: 'ICE Sentry',
  tags: ['enemy', 'ice-agent', 'autonomous', 'role:bodyguard'],
  stats: { chrome: 6, reflex: 4, netrunning: 2 },
  resources: { hp: 10, ice: 15 },
  statuses: [],
  zoneId: 'data-vault',
  resistances: { control: 'resistant' },
  ai: { profileId: 'aggressive', goals: ['guard-vault'], fears: [], alertLevel: 0, knowledge: {} },
};

export const streetRunner: EntityState = {
  id: 'street-runner',
  blueprintId: 'street-runner',
  type: 'enemy',
  name: 'Street Runner',
  tags: ['enemy', 'gang', 'netrunner', 'role:skirmisher'],
  stats: { chrome: 3, reflex: 6, netrunning: 4 },
  resources: { hp: 10, stamina: 5, ice: 5 },
  statuses: [],
  zoneId: 'street-level',
  ai: { profileId: 'aggressive', goals: ['defend-turf', 'hack-intruders'], fears: ['ice-overload'], alertLevel: 0, knowledge: {} },
};

export const vaultOverseer: EntityState = {
  id: 'vault-overseer',
  blueprintId: 'vault-overseer',
  type: 'enemy',
  name: 'Vault Overseer',
  tags: ['enemy', 'corporate', 'ai-construct', 'role:boss'],
  stats: { chrome: 7, reflex: 5, netrunning: 8 },
  resources: { hp: 45, maxHp: 45, stamina: 12, maxStamina: 12, ice: 30 },
  statuses: [],
  zoneId: 'data-vault',
  resistances: { breach: 'resistant' },
  ai: { profileId: 'calculating', goals: ['protect-data', 'eliminate-intruders'], fears: [], alertLevel: 0, knowledge: {} },
};

// --- Boss Definition ---

export const vaultOverseerBoss: BossDefinition = {
  entityId: 'vault-overseer',
  phases: [
    {
      hpThreshold: 0.5,
      narrativeKey: 'firewall-up',
      addTags: ['shielded', 'counter-hacking'],
    },
    {
      hpThreshold: 0.25,
      narrativeKey: 'system-crash',
      addTags: ['glitching', 'desperate'],
      removeTags: ['shielded'],
    },
  ],
  immovable: true,
};

// --- Encounters ---

export const streetSweep: EncounterDefinition = {
  id: 'street-sweep',
  name: 'Street Sweep',
  participants: [
    { entityId: 'street-runner', role: 'skirmisher' },
    { entityId: 'ice-sentry', role: 'bodyguard' },
  ],
  composition: 'patrol',
  validZoneIds: ['street-level'],
  narrativeHooks: { tone: 'tense', trigger: 'Neon shadows shift — someone is scanning.', stakes: 'Get spotted and the whole block locks down.' },
};

export const serverBreach: EncounterDefinition = {
  id: 'server-breach',
  name: 'Server Breach',
  participants: [
    { entityId: 'street-runner', role: 'skirmisher' },
    { entityId: 'street-runner', role: 'skirmisher' },
  ],
  composition: 'ambush',
  validZoneIds: ['server-room'],
  narrativeHooks: { tone: 'urgent', trigger: 'Alarms blare — ICE countermeasures activate.', stakes: 'Jack out or get flatlined.' },
};

export const vaultLockdown: EncounterDefinition = {
  id: 'vault-lockdown',
  name: 'Vault Lockdown',
  participants: [
    { entityId: 'vault-overseer', role: 'boss' },
    { entityId: 'ice-sentry', role: 'bodyguard' },
  ],
  composition: 'boss-fight',
  validZoneIds: ['data-vault'],
  narrativeHooks: { tone: 'climactic', trigger: 'The Overseer manifests in the datastream.', stakes: 'Crack the vault or lose everything.' },
};

// --- Zones ---

export const zones: ZoneState[] = [
  {
    id: 'street-level',
    roomId: 'neon-block',
    name: 'Neon Block — Street Level',
    tags: ['exterior', 'neon', 'crowded'],
    neighbors: ['server-room'],
    light: 7,
    interactables: ['vending terminal', 'flickering sign'],
  },
  {
    id: 'server-room',
    roomId: 'neon-block',
    name: 'Abandoned Server Room',
    tags: ['interior', 'dark', 'networked'],
    neighbors: ['street-level', 'data-vault'],
    light: 2,
    interactables: ['dusty rack', 'blinking console'],
    hazards: ['exposed wiring'],
  },
  {
    id: 'data-vault',
    roomId: 'neon-block',
    name: 'Data Vault',
    tags: ['interior', 'secure', 'networked'],
    neighbors: ['server-room'],
    light: 1,
    interactables: ['lockbox terminal', 'encrypted archive'],
  },
];

// --- Dialogue ---

export const fixerDialogue: DialogueDefinition = {
  id: 'fixer-briefing',
  speakers: ['fixer'],
  entryNodeId: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Kira',
      text: 'Ghost. The lockbox is in the vault behind the server room. ICE is active. You ready?',
      choices: [
        {
          id: 'ask-details',
          text: 'What am I looking for?',
          nextNodeId: 'details',
        },
        {
          id: 'ask-ice',
          text: 'How tough is the ICE?',
          nextNodeId: 'ice-info',
        },
        {
          id: 'go-now',
          text: 'I was born ready.',
          nextNodeId: 'dismiss',
        },
      ],
    },
    details: {
      id: 'details',
      speaker: 'Kira',
      text: 'A data shard. Client code NEON-7. Should be in the encrypted archive. Grab it and get out.',
      choices: [
        {
          id: 'accept',
          text: 'Consider it done.',
          nextNodeId: 'end-briefed',
          effects: [{ type: 'set-global', target: 'actor', params: { key: 'briefed', value: true } }],
        },
      ],
    },
    'ice-info': {
      id: 'ice-info',
      speaker: 'Kira',
      text: 'Standard sentry. Chrome-heavy but netrunning is basic. Brute force or hack your way through. Here, take this.',
      choices: [
        {
          id: 'take-prog',
          text: 'Thanks for the program.',
          nextNodeId: 'end-equipped',
          effects: [{ type: 'set-global', target: 'actor', params: { key: 'briefed', value: true } }],
        },
      ],
    },
    dismiss: {
      id: 'dismiss',
      speaker: 'Kira',
      text: 'Confidence without intel gets runners flatlined. Your call.',
    },
    'end-briefed': {
      id: 'end-briefed',
      speaker: 'Kira',
      text: 'Good luck, Ghost. Signal me when you have the shard.',
    },
    'end-equipped': {
      id: 'end-equipped',
      speaker: 'Kira',
      text: 'That will scramble the ICE for a few cycles. Use it wisely.',
    },
  },
};

// --- Districts ---

import type { DistrictDefinition, EncounterDefinition, BossDefinition } from '@ai-rpg-engine/modules';

export const districts: DistrictDefinition[] = [
  {
    id: 'neon-street',
    name: 'Neon Street Block',
    zoneIds: ['street-level'],
    tags: ['exterior', 'public'],
  },
  {
    id: 'vault-complex',
    name: 'Vault Complex',
    zoneIds: ['server-room', 'data-vault'],
    tags: ['secure', 'networked'],
    controllingFaction: 'vault-ice',
  },
];

// --- Progression Trees ---

import type { ProgressionTreeDefinition } from '@ai-rpg-engine/content-schema';

export const netrunningTree: ProgressionTreeDefinition = {
  id: 'netrunning-skills',
  name: 'Netrunning Skills',
  currency: 'xp',
  nodes: [
    {
      id: 'packet-sniffer',
      name: 'Packet Sniffer',
      cost: 10,
      effects: [{ type: 'stat-boost', params: { stat: 'netrunning', amount: 1 } }],
    },
    {
      id: 'ice-hardening',
      name: 'ICE Hardening',
      cost: 15,
      effects: [{ type: 'resource-boost', params: { resource: 'ice', amount: 5 } }],
    },
    {
      id: 'neural-boost',
      name: 'Neural Boost',
      cost: 30,
      requires: ['packet-sniffer'],
      effects: [
        { type: 'stat-boost', params: { stat: 'reflex', amount: 1 } },
        { type: 'grant-tag', params: { tag: 'neural-boosted' } },
      ],
    },
  ],
};

// --- Items ---

export const iceBreaker = {
  itemId: 'ice-breaker',
  use: (action: ActionIntent, world: WorldState): ResolvedEvent[] => {
    // Damages ICE on target
    const targetId = action.targetIds?.[0];
    if (!targetId) return [];
    const target = world.entities[targetId];
    if (!target) return [];
    const prevIce = target.resources.ice ?? 0;
    target.resources.ice = Math.max(0, prevIce - 8);
    return [{
      id: nextId('evt'),
      tick: action.issuedAtTick,
      type: 'netrunning.ice.breached',
      actorId: action.actorId,
      targetIds: [targetId],
      payload: {
        targetId,
        iceRemoved: prevIce - target.resources.ice,
        iceRemaining: target.resources.ice,
      },
    }];
  },
};

// --- Abilities ---

export const iceBreakAbility: AbilityDefinition = {
  id: 'ice-breaker-hack',
  name: 'ICE Breaker',
  verb: 'use-ability',
  tags: ['netrunning', 'combat', 'damage'],
  costs: [{ resourceId: 'bandwidth', amount: 4 }],
  target: { type: 'single' },
  checks: [{ stat: 'netrunning', difficulty: 7, onFail: 'half-damage' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 5, damageType: 'net' } },
    { type: 'apply-status', target: 'target', params: { statusId: 'system-breach', duration: 2, stacking: 'replace' } },
  ],
  cooldown: 2,
  ui: {
    text: 'Deploy an intrusion package to shatter ICE defenses.',
    hitText: 'ICE barriers fracture — system breach detected.',
    missText: 'The intrusion script bounces — firewall holds.',
    soundCue: 'ability.ice-breaker',
  },
};

export const debugProtocol: AbilityDefinition = {
  id: 'debug-protocol',
  name: 'Debug Protocol',
  verb: 'use-ability',
  tags: ['netrunning', 'support', 'cleanse'],
  costs: [
    { resourceId: 'stamina', amount: 2 },
    { resourceId: 'ice', amount: 2 },
  ],
  target: { type: 'self' },
  checks: [{ stat: 'netrunning', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'remove-status-by-tag', target: 'actor', params: { tags: 'breach' } },
  ],
  cooldown: 3,
  ui: {
    text: 'Run emergency diagnostics to patch system vulnerabilities.',
    hitText: 'Firewall restored — breach contained.',
    missText: 'Debug protocol failed — system too compromised.',
    soundCue: 'ability.debug-protocol',
  },
};

export const nanoRepair: AbilityDefinition = {
  id: 'nano-repair',
  name: 'Nano-Repair',
  verb: 'use-ability',
  tags: ['netrunning', 'support', 'heal'],
  costs: [
    { resourceId: 'stamina', amount: 2 },
    { resourceId: 'ice', amount: 2 },
  ],
  target: { type: 'self' },
  checks: [{ stat: 'netrunning', difficulty: 5, onFail: 'abort' }],
  effects: [
    { type: 'heal', target: 'actor', params: { amount: 3 } },
    { type: 'resource-modify', target: 'actor', params: { resource: 'bandwidth', amount: 4 } },
  ],
  cooldown: 3,
  ui: {
    text: 'Activate nanite swarm — repair tissue, restore bandwidth.',
    hitText: 'Nanites surge through your system. Damage patched, bandwidth restored.',
    missText: 'Nanite injection rejected — system too degraded.',
    soundCue: 'ability.nano-repair',
  },
};

export const cyberpunkAbilities: AbilityDefinition[] = [iceBreakAbility, debugProtocol, nanoRepair];

// --- Status Definitions ---

export const cyberpunkStatusDefinitions: StatusDefinition[] = [
  {
    id: 'system-breach',
    name: 'System Breach',
    tags: ['breach', 'debuff'],
    stacking: 'replace',
    duration: { type: 'ticks', value: 2 },
    ui: { icon: '⚡', color: '#e74c3c', description: 'Firewall compromised — systems exposed' },
  },
];

// --- Pack Metadata ---

export const packMeta: PackMetadata = {
  id: 'neon-lockbox',
  name: 'Neon Lockbox',
  tagline: 'A rain-slicked alley hides a data vault guarded by autonomous ICE.',
  genres: ['cyberpunk'],
  difficulty: 'beginner',
  tones: ['noir', 'gritty'],
  tags: ['hacking', 'neon', 'corporate', 'netrunning'],
  engineVersion: '2.0.0',
  version: '2.0.0',
  description: 'Meet a fixer in a neon-lit alley, breach a server corridor, and crack a data vault defended by an ICE sentry.',
  narratorTone: 'cyberpunk noir, terse, neon-lit, paranoid',
};

// --- Build Catalog ---

export const buildCatalog: BuildCatalog = {
  packId: 'neon-lockbox',
  statBudget: 3,
  maxTraits: 3,
  requiredFlaws: 1,
  archetypes: [
    {
      id: 'netrunner',
      name: 'Netrunner',
      description: 'Data thief, fast and fragile',
      statPriorities: { chrome: 2, reflex: 4, netrunning: 8 },
      startingTags: ['hacker', 'netrunner'],
      progressionTreeId: 'netrunning-skills',
      grantedVerbs: ['hack', 'jack-in'],
    },
    {
      id: 'street-razor',
      name: 'Street Razor',
      description: 'Chrome-heavy enforcer',
      statPriorities: { chrome: 7, reflex: 5, netrunning: 2 },
      startingTags: ['enforcer', 'chromed'],
      progressionTreeId: 'netrunning-skills',
    },
    {
      id: 'ghost-fixer',
      name: 'Ghost Fixer',
      description: 'Broker who never stays in one place',
      statPriorities: { chrome: 3, reflex: 7, netrunning: 4 },
      startingTags: ['fixer', 'ghost'],
      progressionTreeId: 'netrunning-skills',
    },
  ],
  backgrounds: [
    {
      id: 'corporate-dropout',
      name: 'Corporate Dropout',
      description: 'Left the corp towers with secrets and enemies',
      statModifiers: { netrunning: 1, chrome: -1 },
      startingTags: ['ex-corp'],
    },
    {
      id: 'gutter-rat',
      name: 'Gutter Rat',
      description: 'Grew up in the neon gutters',
      statModifiers: { reflex: 1, netrunning: -1 },
      startingTags: ['street-born'],
    },
    {
      id: 'lab-escapee',
      name: 'Lab Escapee',
      description: 'Experimental chrome, unstable but powerful',
      statModifiers: { chrome: 1 },
      startingTags: ['chrome-unstable'],
    },
  ],
  traits: [
    {
      id: 'hardwired-reflexes',
      name: 'Hardwired Reflexes',
      description: 'Synaptic accelerators wired at birth',
      category: 'perk',
      effects: [{ type: 'stat-modifier', stat: 'reflex', amount: 1 }],
    },
    {
      id: 'ice-familiarity',
      name: 'ICE Familiarity',
      description: 'Knows how intrusion countermeasures think',
      category: 'perk',
      effects: [{ type: 'resource-modifier', resource: 'ice', amount: 3 }],
    },
    {
      id: 'glitch-cascade',
      name: 'Glitch Cascade',
      description: 'Neural implants occasionally misfire',
      category: 'flaw',
      effects: [{ type: 'resource-modifier', resource: 'bandwidth', amount: -2 }],
    },
    {
      id: 'chrome-rejection',
      name: 'Chrome Rejection',
      description: 'Body fights its own augmentations',
      category: 'flaw',
      effects: [
        { type: 'stat-modifier', stat: 'chrome', amount: -1 },
        { type: 'grant-tag', tag: 'rejection-syndrome' },
      ],
      incompatibleWith: ['hardwired-reflexes'],
    },
  ],
  disciplines: [
    {
      id: 'medtech',
      name: 'Medtech',
      description: 'Field medic with scanner implants',
      grantedVerb: 'scan',
      passive: { type: 'stat-modifier', stat: 'chrome', amount: 1 },
      drawback: { type: 'resource-modifier', resource: 'bandwidth', amount: -2 },
    },
    {
      id: 'saboteur',
      name: 'Saboteur',
      description: 'Demolitions and infrastructure disruption',
      grantedVerb: 'barricade',
      passive: { type: 'stat-modifier', stat: 'reflex', amount: 1 },
      drawback: { type: 'faction-modifier', faction: 'vault-ice', amount: -10 },
    },
  ],
  crossTitles: [
    { archetypeId: 'netrunner', disciplineId: 'medtech', title: 'Synapse Surgeon', tags: ['synapse-surgeon'] },
    { archetypeId: 'netrunner', disciplineId: 'saboteur', title: 'Codebreaker', tags: ['codebreaker'] },
    { archetypeId: 'street-razor', disciplineId: 'medtech', title: 'Chrome Doc', tags: ['chrome-doc'] },
    { archetypeId: 'street-razor', disciplineId: 'saboteur', title: 'Wrecking Crew', tags: ['wrecking-crew'] },
    { archetypeId: 'ghost-fixer', disciplineId: 'medtech', title: 'Pulse Dealer', tags: ['pulse-dealer'] },
    { archetypeId: 'ghost-fixer', disciplineId: 'saboteur', title: 'Shadow Arsonist', tags: ['shadow-arsonist'] },
  ],
  entanglements: [
    {
      id: 'netrunner-saboteur',
      archetypeId: 'netrunner',
      disciplineId: 'saboteur',
      description: 'Netrunners who sabotage infrastructure risk bricking their own access nodes',
      effects: [{ type: 'grant-tag', tag: 'node-risky' }],
    },
  ],
};

export const itemCatalog: ItemCatalog = {
  items: [
    {
      id: 'mono-blade',
      name: 'Mono-Blade',
      description: 'A monomolecular-edged street knife.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { reflex: 1 },
      grantedTags: ['armed'],
      grantedVerbs: ['slash'],
    },
    {
      id: 'ice-breaker',
      name: 'ICE Breaker',
      description: 'A portable intrusion countermeasure cracker.',
      slot: 'tool',
      rarity: 'common',
      grantedVerbs: ['hack'],
      grantedTags: ['net-armed'],
      provenance: { factionId: 'syndicate', flags: ['contraband'], lore: 'Stripped from a corporate courier' },
    },
    {
      id: 'synth-vest',
      name: 'Synth-Weave Vest',
      description: 'Lightweight ballistic mesh under a street jacket.',
      slot: 'armor',
      rarity: 'common',
      resourceModifiers: { hp: 5 },
    },
    {
      id: 'neural-link',
      name: 'Neural Uplink',
      description: 'A cranial interface for direct net access.',
      slot: 'accessory',
      rarity: 'uncommon',
      statModifiers: { netrunning: 2 },
      grantedTags: ['jacked-in'],
    },
    {
      id: 'chrome-knuckles',
      name: 'Chrome Knuckles',
      description: 'Reinforced titanium hand augments.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { chrome: 1 },
      grantedVerbs: ['pummel'],
    },
    {
      id: 'scrambler-chip',
      name: 'Scrambler Chip',
      description: 'Implanted chip that masks biometric signatures.',
      slot: 'trinket',
      rarity: 'uncommon',
      grantedTags: ['ghost-signal'],
      statModifiers: { reflex: 1 },
      provenance: { flags: ['stolen'], lore: 'Serial number filed off — previous owner unknown' },
    },
    {
      id: 'military-exo',
      name: 'Military Exoskeleton',
      description: 'Salvaged powered frame from a corporate PMC.',
      slot: 'armor',
      rarity: 'rare',
      resourceModifiers: { hp: 8 },
      statModifiers: { chrome: 2 },
      requiredTags: ['chrome-compatible'],
      provenance: { origin: 'Corporate PMC unit', factionId: 'corpo-sec', flags: ['trophy', 'contraband'], lore: 'Salvaged from a fallen corporate soldier' },
    },
  ],
};
