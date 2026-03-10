// Jade Veil — feudal mystery ronin starter content
// 5 zones, 3 NPCs, 2 enemies, 1 dialogue, 2 districts

import type { EntityState, ZoneState, GameManifest, ActionIntent, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import type { DialogueDefinition, ProgressionTreeDefinition, AbilityDefinition, StatusDefinition } from '@ai-rpg-engine/content-schema';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import type { DistrictDefinition, EncounterDefinition, BossDefinition } from '@ai-rpg-engine/modules';

export const manifest: GameManifest = {
  id: 'jade-veil',
  title: 'Jade Veil',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'ronin-minimal',
  modules: ['traversal-core', 'status-core', 'combat-core', 'inventory-core', 'dialogue-core'],
  contentPacks: ['jade-veil'],
};

// --- Player ---

export const player: EntityState = {
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Ronin',
  tags: ['player', 'ronin', 'masterless'],
  stats: { discipline: 5, perception: 6, composure: 4 },
  resources: { hp: 20, stamina: 5, honor: 25, ki: 15 },
  statuses: [],
  inventory: [],
  zoneId: 'castle-gate',
};

// --- NPCs ---

export const lordTakeda: EntityState = {
  id: 'lord-takeda',
  blueprintId: 'lord-takeda',
  type: 'npc',
  name: 'Lord Takeda',
  tags: ['npc', 'noble', 'poisoned', 'bedridden'],
  stats: { discipline: 6, perception: 4, composure: 7 },
  resources: { hp: 5, stamina: 2, honor: 28 },
  statuses: [],
  zoneId: 'lords-chamber',
};

export const ladyHimiko: EntityState = {
  id: 'lady-himiko',
  blueprintId: 'lady-himiko',
  type: 'npc',
  name: 'Lady Himiko',
  tags: ['npc', 'noble', 'suspect', 'recruitable', 'diplomat'],
  stats: { discipline: 3, perception: 5, composure: 7 },
  resources: { hp: 8, stamina: 2, honor: 22 },
  statuses: [],
  zoneId: 'great-hall',
  custom: {
    companionRole: 'diplomat',
    companionAbilities: 'faction-route,rumor-suppression',
    personalGoal: 'Protect her husband and expose the true poisoner',
  },
};

export const magistrateSato: EntityState = {
  id: 'magistrate-sato',
  blueprintId: 'magistrate-sato',
  type: 'npc',
  name: 'Magistrate Sato',
  tags: ['npc', 'official', 'investigator', 'recruitable', 'scout'],
  stats: { discipline: 4, perception: 7, composure: 5 },
  resources: { hp: 10, stamina: 2, honor: 20 },
  statuses: [],
  zoneId: 'great-hall',
  custom: {
    companionRole: 'scout',
    companionAbilities: 'scholarly-insight,witness-calming',
    personalGoal: 'Solve the poisoning through proper legal channels',
  },
};

// --- Enemies ---

export const shadowAssassin: EntityState = {
  id: 'shadow-assassin',
  blueprintId: 'shadow-assassin',
  type: 'enemy',
  name: 'Shadow Assassin',
  tags: ['enemy', 'assassin', 'hidden', 'role:skirmisher'],
  stats: { discipline: 7, perception: 5, composure: 6 },
  resources: { hp: 14, stamina: 6, ki: 20 },
  statuses: [],
  zoneId: 'hidden-passage',
  ai: { profileId: 'stalker', goals: ['eliminate-target'], fears: ['exposure', 'outnumbered'], alertLevel: 0, knowledge: {} },
};

export const corruptSamurai: EntityState = {
  id: 'corrupt-samurai',
  blueprintId: 'corrupt-samurai',
  type: 'enemy',
  name: 'Corrupt Samurai',
  tags: ['enemy', 'samurai', 'traitor', 'role:boss'],
  stats: { discipline: 6, perception: 4, composure: 3 },
  resources: { hp: 18, maxHp: 18, stamina: 5, maxStamina: 5, honor: 5 },
  statuses: [],
  zoneId: 'castle-gate',
  resistances: { fear: 'immune' },
  ai: { profileId: 'defensive', goals: ['guard-passage', 'conceal-guilt'], fears: ['accusation'], alertLevel: 0, knowledge: {} },
};

export const castleGuard: EntityState = {
  id: 'castle-guard',
  blueprintId: 'castle-guard',
  type: 'enemy',
  name: 'Castle Guard',
  tags: ['enemy', 'samurai', 'loyal', 'role:bodyguard'],
  stats: { discipline: 5, perception: 4, composure: 5 },
  resources: { hp: 18, stamina: 4, honor: 20 },
  statuses: [],
  zoneId: 'castle-gate',
  resistances: { stance: 'resistant' },
  ai: { profileId: 'defensive', goals: ['protect-castle', 'challenge-intruders'], fears: ['dishonor'], alertLevel: 0, knowledge: {} },
};

// --- Boss Definition ---

export const corruptSamuraiBoss: BossDefinition = {
  entityId: 'corrupt-samurai',
  phases: [
    {
      hpThreshold: 0.5,
      narrativeKey: 'fury-unleashed',
      addTags: ['enraged', 'reckless'],
    },
    {
      hpThreshold: 0.25,
      narrativeKey: 'final-stance',
      addTags: ['desperate', 'cornered'],
      removeTags: ['enraged'],
    },
  ],
};

// --- Encounters ---

export const gatePatrol: EncounterDefinition = {
  id: 'gate-patrol',
  name: 'Gate Patrol',
  participants: [
    { entityId: 'castle-guard', role: 'bodyguard' },
    { entityId: 'corrupt-samurai', role: 'boss' },
  ],
  composition: 'patrol',
  validZoneIds: ['castle-gate', 'great-hall'],
  narrativeHooks: { tone: 'formal', trigger: 'Armored guards patrol the castle corridors.', stakes: 'Suspicion falls on the masterless.' },
};

export const teaGardenAmbush: EncounterDefinition = {
  id: 'tea-garden-ambush',
  name: 'Tea Garden Ambush',
  participants: [
    { entityId: 'shadow-assassin', role: 'skirmisher' },
    { entityId: 'shadow-assassin', role: 'skirmisher' },
  ],
  composition: 'ambush',
  validZoneIds: ['tea-garden'],
  narrativeHooks: { tone: 'sudden', trigger: 'Shadows move among the cherry blossoms.', stakes: 'The assassin strikes without warning.' },
};

export const lordsChamberShowdown: EncounterDefinition = {
  id: 'lords-chamber-showdown',
  name: "Lord's Chamber Showdown",
  participants: [
    { entityId: 'corrupt-samurai', role: 'boss' },
    { entityId: 'castle-guard', role: 'bodyguard' },
  ],
  composition: 'boss-fight',
  validZoneIds: ['lords-chamber'],
  narrativeHooks: { tone: 'climactic', trigger: 'The traitor reveals himself at last.', stakes: 'Justice or death in the lord\'s own chamber.' },
};

// --- Zones ---

export const zones: ZoneState[] = [
  {
    id: 'castle-gate',
    roomId: 'castle',
    name: 'Castle Gate',
    tags: ['exterior', 'guarded', 'formal'],
    neighbors: ['great-hall', 'tea-garden'],
    light: 4,
    interactables: ['iron-bound gates', 'stone lanterns', 'guard post'],
  },
  {
    id: 'great-hall',
    roomId: 'castle',
    name: 'Great Hall',
    tags: ['interior', 'formal', 'political'],
    neighbors: ['castle-gate', 'lords-chamber', 'tea-garden'],
    light: 4,
    interactables: ['audience dais', 'clan banners', 'ceremonial weapons'],
  },
  {
    id: 'tea-garden',
    roomId: 'castle',
    name: 'Tea Garden',
    tags: ['exterior', 'tranquil', 'social'],
    neighbors: ['castle-gate', 'great-hall', 'hidden-passage'],
    light: 4,
    interactables: ['stone bench', 'koi pond', 'cherry blossoms'],
  },
  {
    id: 'lords-chamber',
    roomId: 'castle',
    name: 'Lord\'s Chamber',
    tags: ['interior', 'private', 'guarded'],
    neighbors: ['great-hall', 'hidden-passage'],
    light: 2,
    interactables: ['sickbed', 'medicine tray', 'half-eaten meal'],
    hazards: ['poison-residue'],
  },
  {
    id: 'hidden-passage',
    roomId: 'castle',
    name: 'Hidden Passage',
    tags: ['interior', 'hidden', 'dark', 'dangerous'],
    neighbors: ['lords-chamber', 'tea-garden'],
    light: 1,
    interactables: ['secret door mechanism', 'poison vials', 'bloody cloth'],
    hazards: ['shadow-watch'],
  },
];

// --- Dialogue ---

export const magistrateDialogue: DialogueDefinition = {
  id: 'magistrate-briefing',
  speakers: ['magistrate-sato'],
  entryNodeId: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Magistrate Sato',
      text: 'A ronin. Convenient. The lord was poisoned during the evening meal. Everyone at the table is a suspect — including his wife.',
      choices: [
        {
          id: 'ask-suspects',
          text: 'Who else was at the table?',
          nextNodeId: 'suspect-list',
        },
        {
          id: 'ask-poison',
          text: 'What kind of poison?',
          nextNodeId: 'poison-details',
        },
        {
          id: 'ask-authority',
          text: 'Why bring in a masterless warrior?',
          nextNodeId: 'ronin-role',
        },
      ],
    },
    'suspect-list': {
      id: 'suspect-list',
      speaker: 'Magistrate Sato',
      text: 'Lady Himiko, Captain Endo, the tea master, and the lord\'s own brother. Each had motive. Each had access. Tread carefully — a false accusation costs more than face.',
      choices: [
        {
          id: 'understood',
          text: 'I will investigate quietly.',
          nextNodeId: 'end-gift',
          effects: [{ type: 'set-global', target: 'actor', params: { key: 'magistrate-briefed', value: true } }],
        },
      ],
    },
    'poison-details': {
      id: 'poison-details',
      speaker: 'Magistrate Sato',
      text: 'Slow-acting. Not meant to kill quickly — meant to weaken over days. Someone wants him alive but powerless. That narrows the motive considerably.',
      choices: [
        {
          id: 'continue',
          text: 'A political poison, then.',
          nextNodeId: 'end-info',
          effects: [{ type: 'set-global', target: 'actor', params: { key: 'magistrate-briefed', value: true } }],
        },
      ],
    },
    'ronin-role': {
      id: 'ronin-role',
      speaker: 'Magistrate Sato',
      text: 'Because you owe no clan loyalty. You cannot be compromised by allegiance. That makes you either the perfect investigator or the perfect scapegoat.',
      choices: [
        {
          id: 'accept',
          text: 'I accept that risk.',
          nextNodeId: 'end-info',
          effects: [{ type: 'set-global', target: 'actor', params: { key: 'magistrate-briefed', value: true } }],
        },
      ],
    },
    'end-gift': {
      id: 'end-gift',
      speaker: 'Magistrate Sato',
      text: 'Take this incense kit. It reveals traces of certain compounds. And ronin — your honor here will speak louder than your blade.',
    },
    'end-info': {
      id: 'end-info',
      speaker: 'Magistrate Sato',
      text: 'The summit resumes at dawn. Find the poisoner before then, or the Takeda clan falls.',
    },
  },
};

// --- Districts ---

export const districts: DistrictDefinition[] = [
  {
    id: 'castle-proper',
    name: 'Castle Proper',
    zoneIds: ['castle-gate', 'great-hall', 'lords-chamber'],
    tags: ['noble', 'formal'],
    controllingFaction: 'takeda-clan',
  },
  {
    id: 'servant-ward',
    name: 'Servant Ward',
    zoneIds: ['tea-garden', 'hidden-passage'],
    tags: ['common', 'accessible'],
  },
];

// --- Progression Trees ---

export const wayOfTheBladeTree: ProgressionTreeDefinition = {
  id: 'way-of-the-blade',
  name: 'Way of the Blade',
  currency: 'xp',
  nodes: [
    {
      id: 'steady-hand',
      name: 'Steady Hand',
      cost: 10,
      effects: [{ type: 'stat-boost', params: { stat: 'discipline', amount: 1 } }],
    },
    {
      id: 'inner-calm',
      name: 'Inner Calm',
      cost: 15,
      effects: [
        { type: 'resource-boost', params: { resource: 'ki', amount: 5 } },
        { type: 'stat-boost', params: { stat: 'composure', amount: 1 } },
      ],
    },
    {
      id: 'righteous-fury',
      name: 'Righteous Fury',
      cost: 25,
      requires: ['steady-hand'],
      effects: [
        { type: 'stat-boost', params: { stat: 'discipline', amount: 2 } },
        { type: 'grant-tag', params: { tag: 'righteous' } },
      ],
    },
  ],
};

// --- Items ---

export const incenseKitEffect = {
  itemId: 'incense-kit',
  use: (action: ActionIntent, world: WorldState): ResolvedEvent[] => {
    const actor = world.entities[action.actorId];
    if (!actor) return [];
    const previous = actor.resources.ki ?? 0;
    actor.resources.ki = Math.min(20, previous + 5);
    return [{
      id: nextId('evt'),
      tick: action.issuedAtTick,
      type: 'resource.changed',
      actorId: action.actorId,
      payload: {
        entityId: actor.id,
        resource: 'ki',
        previous,
        current: actor.resources.ki,
        delta: actor.resources.ki - previous,
      },
    }];
  },
};

// --- Abilities ---

export const iaijutsuStrike: AbilityDefinition = {
  id: 'iaijutsu-strike',
  name: 'Iaijutsu Strike',
  verb: 'use-ability',
  tags: ['martial', 'combat', 'damage'],
  costs: [
    { resourceId: 'stamina', amount: 3 },
    { resourceId: 'ki', amount: 5 },
  ],
  target: { type: 'single' },
  checks: [{ stat: 'discipline', difficulty: 8, onFail: 'half-damage' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 7, damageType: 'blade' } },
  ],
  cooldown: 3,
  requirements: [{ type: 'has-tag', params: { tag: 'ronin' } }],
  ui: {
    text: 'Draw, cut, sheathe. One motion. One chance.',
    hitText: 'The blade whispers. A line of crimson blooms.',
    missText: 'The draw is slow. The moment passes.',
    soundCue: 'ability.iaijutsu-strike',
  },
};

export const innerCalm: AbilityDefinition = {
  id: 'inner-calm',
  name: 'Inner Calm',
  verb: 'use-ability',
  tags: ['spiritual', 'buff', 'support'],
  costs: [{ resourceId: 'stamina', amount: 2 }],
  target: { type: 'self' },
  checks: [{ stat: 'composure', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'resource-modify', target: 'actor', params: { resource: 'ki', amount: 8 } },
    { type: 'heal', target: 'actor', params: { amount: 3, resource: 'hp' } },
    { type: 'stat-modify', target: 'actor', params: { stat: 'perception', amount: 1 } },
  ],
  cooldown: 4,
  requirements: [{ type: 'has-tag', params: { tag: 'ronin' } }],
  ui: {
    text: 'Center your breathing. Let the world fall silent.',
    hitText: 'Ki flows. The mind sharpens.',
    missText: 'The mind is too turbulent. Calm does not come.',
    soundCue: 'ability.inner-calm',
  },
};

export const bladeWard: AbilityDefinition = {
  id: 'blade-ward',
  name: 'Blade Ward',
  verb: 'use-ability',
  tags: ['martial', 'combat', 'debuff', 'defensive'],
  costs: [
    { resourceId: 'stamina', amount: 2 },
    { resourceId: 'ki', amount: 3 },
  ],
  target: { type: 'single' },
  checks: [{ stat: 'perception', difficulty: 7, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'off-balance', duration: 2, stacking: 'replace' } },
    { type: 'stat-modify', target: 'target', params: { stat: 'discipline', amount: -2 } },
    { type: 'resource-modify', target: 'actor', params: { resource: 'honor', amount: 2 } },
  ],
  cooldown: 3,
  requirements: [{ type: 'has-tag', params: { tag: 'ronin' } }],
  ui: {
    text: "Read the opponent's intent. Deflect and disrupt.",
    hitText: 'The parry finds its mark — your opponent stumbles.',
    missText: 'You misread the strike. The ward fails.',
    soundCue: 'ability.blade-ward',
  },
};

export const centeredMind: AbilityDefinition = {
  id: 'centered-mind',
  name: 'Centered Mind',
  verb: 'use-ability',
  tags: ['discipline', 'support', 'cleanse'],
  costs: [
    { resourceId: 'stamina', amount: 2 },
    { resourceId: 'ki', amount: 3 },
  ],
  target: { type: 'self' },
  checks: [{ stat: 'composure', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'remove-status-by-tag', target: 'actor', params: { tags: 'fear,control' } },
  ],
  cooldown: 3,
  requirements: [{ type: 'has-tag', params: { tag: 'ronin' } }],
  ui: {
    text: 'Still the mind. Let the storm pass through you.',
    hitText: 'Inner calm restores — clarity returns like morning light.',
    missText: 'The turmoil runs deeper than meditation can reach.',
    soundCue: 'ability.centered-mind',
  },
};

export const roninAbilities: AbilityDefinition[] = [iaijutsuStrike, innerCalm, bladeWard, centeredMind];

// --- Status Definitions ---

export const roninStatusDefinitions: StatusDefinition[] = [
  {
    id: 'off-balance',
    name: 'Off-Balance',
    tags: ['stance', 'debuff'],
    stacking: 'replace',
    duration: { type: 'ticks', value: 2 },
    ui: { icon: '⚖️', color: '#3498db', description: 'Footing disrupted — vulnerable to follow-up' },
  },
];

// --- Pack Metadata ---

export const packMeta: PackMetadata = {
  id: 'jade-veil',
  name: 'Jade Veil',
  tagline: 'Every accusation costs honor. Every silence costs lives.',
  genres: ['historical', 'mystery'],
  difficulty: 'advanced',
  tones: ['atmospheric', 'tense'],
  tags: ['feudal', 'ronin', 'investigation', 'honor', 'poison', 'court'],
  engineVersion: '2.0.0',
  version: '2.1.0',
  description: 'Investigate a lord\'s poisoning in a feudal castle where every accusation costs honor. Navigate court politics, duel suspects, and find the truth before dawn.',
  narratorTone: 'feudal court, restrained, precise, weighted with consequence',
};

// --- Build Catalog ---

export const buildCatalog: BuildCatalog = {
  packId: 'jade-veil',
  statBudget: 3,
  maxTraits: 3,
  requiredFlaws: 1,
  archetypes: [
    {
      id: 'kensei',
      name: 'Kensei',
      description: 'Sword saint — discipline made flesh',
      statPriorities: { discipline: 6, perception: 4, composure: 4 },
      startingTags: ['blade-master', 'martial'],
      startingInventory: ['katana'],
      progressionTreeId: 'way-of-the-blade',
    },
    {
      id: 'investigator',
      name: 'Investigator',
      description: 'Sees what others overlook, hears what others silence',
      statPriorities: { discipline: 3, perception: 6, composure: 5 },
      startingTags: ['keen-eye', 'methodical'],
      progressionTreeId: 'way-of-the-blade',
    },
    {
      id: 'courtier',
      name: 'Courtier',
      description: 'Navigates politics with grace and calculated silence',
      statPriorities: { discipline: 4, perception: 4, composure: 6 },
      resourceOverrides: { honor: 28 },
      startingTags: ['courtly', 'composed'],
      progressionTreeId: 'way-of-the-blade',
    },
  ],
  backgrounds: [
    {
      id: 'fallen-samurai',
      name: 'Fallen Samurai',
      description: 'Once served a lord — now serves only justice',
      statModifiers: { discipline: 1, composure: -1 },
      startingTags: ['disgraced'],
    },
    {
      id: 'merchants-guard',
      name: 'Merchant\'s Guard',
      description: 'Protected caravans, learned to read people',
      statModifiers: { perception: 1, discipline: -1 },
      startingTags: ['street-smart'],
    },
    {
      id: 'temple-student',
      name: 'Temple Student',
      description: 'Trained in martial arts and meditation at a mountain temple',
      statModifiers: { composure: 1 },
      startingTags: ['temple-trained'],
    },
  ],
  traits: [
    {
      id: 'immovable-stance',
      name: 'Immovable Stance',
      description: 'Rooted and centered in any confrontation',
      category: 'perk',
      effects: [{ type: 'resource-modifier', resource: 'ki', amount: 3 }],
    },
    {
      id: 'keen-senses',
      name: 'Keen Senses',
      description: 'Notices details others miss',
      category: 'perk',
      effects: [
        { type: 'stat-modifier', stat: 'perception', amount: 1 },
        { type: 'grant-tag', tag: 'observant' },
      ],
    },
    {
      id: 'stained-honor',
      name: 'Stained Honor',
      description: 'A past failure haunts your reputation',
      category: 'flaw',
      effects: [{ type: 'resource-modifier', resource: 'honor', amount: -3 }],
    },
    {
      id: 'hot-blooded',
      name: 'Hot-Blooded',
      description: 'Quick to anger, slow to forgive',
      category: 'flaw',
      effects: [
        { type: 'stat-modifier', stat: 'composure', amount: -1 },
        { type: 'grant-tag', tag: 'impulsive' },
      ],
      incompatibleWith: ['immovable-stance'],
    },
  ],
  disciplines: [
    {
      id: 'poison-expert',
      name: 'Poison Expert',
      description: 'Understands toxins — how to identify, create, and counter them',
      grantedVerb: 'analyze',
      passive: { type: 'stat-modifier', stat: 'perception', amount: 1 },
      drawback: { type: 'resource-modifier', resource: 'honor', amount: -2 },
    },
    {
      id: 'shadow-step',
      name: 'Shadow Step',
      description: 'Moves unseen through guarded spaces',
      grantedVerb: 'infiltrate',
      passive: { type: 'stat-modifier', stat: 'discipline', amount: 1 },
      drawback: { type: 'faction-modifier', faction: 'takeda-clan', amount: -10 },
    },
  ],
  crossTitles: [
    { archetypeId: 'kensei', disciplineId: 'poison-expert', title: 'Venomed Blade', tags: ['venomed-blade'] },
    { archetypeId: 'kensei', disciplineId: 'shadow-step', title: 'Ghost Ronin', tags: ['ghost-ronin'] },
    { archetypeId: 'investigator', disciplineId: 'poison-expert', title: 'Toxin Scholar', tags: ['toxin-scholar'] },
    { archetypeId: 'investigator', disciplineId: 'shadow-step', title: 'Silent Witness', tags: ['silent-witness'] },
    { archetypeId: 'courtier', disciplineId: 'poison-expert', title: 'Jade Serpent', tags: ['jade-serpent'] },
    { archetypeId: 'courtier', disciplineId: 'shadow-step', title: 'Silk Shadow', tags: ['silk-shadow'] },
  ],
  entanglements: [
    {
      id: 'courtier-shadow',
      archetypeId: 'courtier',
      disciplineId: 'shadow-step',
      description: 'Courtiers who sneak through shadows lose the trust they built in the open',
      effects: [{ type: 'grant-tag', tag: 'double-faced' }],
    },
  ],
};

export const itemCatalog: ItemCatalog = {
  items: [
    {
      id: 'katana',
      name: 'Katana',
      description: 'A curved blade of folded steel — the soul of a warrior.',
      slot: 'weapon',
      rarity: 'uncommon',
      statModifiers: { discipline: 1 },
      grantedTags: ['armed', 'blade-wielder'],
      grantedVerbs: ['strike'],
      provenance: { origin: 'Unknown master smith', lore: 'The blade bears no clan mark — like its wielder' },
    },
    {
      id: 'wakizashi',
      name: 'Wakizashi',
      description: 'A short companion blade — for close quarters and last resorts.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { discipline: 1 },
      grantedTags: ['armed', 'close-quarters'],
    },
    {
      id: 'silk-kimono',
      name: 'Silk Kimono',
      description: 'Fine court attire that commands respect.',
      slot: 'armor',
      rarity: 'common',
      resourceModifiers: { hp: 2 },
      grantedTags: ['courtly'],
      statModifiers: { composure: 1 },
    },
    {
      id: 'jade-pendant',
      name: 'Jade Pendant',
      description: 'A carved jade stone on a silk cord — a ward against deception.',
      slot: 'accessory',
      rarity: 'uncommon',
      grantedTags: ['jade-protected'],
      statModifiers: { perception: 1 },
      provenance: { origin: 'Temple of the Jade Mountain', flags: ['blessed'], lore: 'Said to glow faintly in the presence of lies' },
    },
    {
      id: 'incense-kit',
      name: 'Incense Kit',
      description: 'Ritual incense for meditation and trace detection.',
      slot: 'tool',
      rarity: 'common',
      grantedTags: ['analyst'],
      grantedVerbs: ['detect'],
    },
    {
      id: 'magistrate-seal',
      name: 'Magistrate\'s Seal',
      description: 'An official seal granting authority to investigate.',
      slot: 'accessory',
      rarity: 'uncommon',
      grantedTags: ['authorized', 'official'],
      provenance: { origin: 'Magistrate Sato', factionId: 'takeda-clan', flags: ['heirloom'], lore: 'Lent reluctantly — return is expected' },
    },
    {
      id: 'shadow-kunai',
      name: 'Shadow Kunai',
      description: 'A blackened throwing blade used by assassins.',
      slot: 'weapon',
      rarity: 'rare',
      statModifiers: { discipline: 1 },
      grantedTags: ['concealed-weapon', 'thrown'],
      provenance: { flags: ['stolen', 'contraband'], lore: 'Taken from an assassin who no longer needed it' },
    },
  ],
};
