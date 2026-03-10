// Gaslight Detective — content definitions

import type { EntityState, ZoneState, GameManifest, ActionIntent, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import type { DialogueDefinition, ProgressionTreeDefinition, AbilityDefinition, StatusDefinition } from '@ai-rpg-engine/content-schema';
import type { DistrictDefinition, EncounterDefinition, BossDefinition } from '@ai-rpg-engine/modules';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';

// --- Manifest ---

export const manifest: GameManifest = {
  id: 'gaslight-detective',
  title: 'Gaslight Detective',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'detective-minimal',
  modules: [
    'traversal-core',
    'status-core',
    'combat-core',
    'inventory-core',
    'dialogue-core',
  ],
  contentPacks: ['gaslight-detective'],
};

// --- Player ---

export const player: EntityState = {
  id: 'inspector',
  blueprintId: 'inspector',
  type: 'player',
  name: 'Inspector',
  tags: ['player', 'law', 'investigator'],
  stats: { perception: 7, eloquence: 5, grit: 4 },
  resources: { hp: 15, stamina: 4, composure: 12 },
  statuses: [],
  inventory: [],
  zoneId: 'crime-scene',
};

// --- NPCs ---

export const widow: EntityState = {
  id: 'widow_ashford',
  blueprintId: 'widow',
  type: 'npc',
  name: 'Lady Ashford',
  tags: ['npc', 'aristocracy', 'suspect', 'female'],
  stats: { perception: 3, eloquence: 7, grit: 2 },
  resources: { hp: 8, stamina: 2, composure: 18 },
  statuses: [],
  zoneId: 'parlour',
};

export const constable: EntityState = {
  id: 'constable_pike',
  blueprintId: 'constable',
  type: 'npc',
  name: 'Constable Pike',
  tags: ['npc', 'law', 'police', 'male'],
  stats: { perception: 4, eloquence: 3, grit: 6 },
  resources: { hp: 18, stamina: 4, composure: 10 },
  statuses: [],
  zoneId: 'crime-scene',
};

export const servant: EntityState = {
  id: 'mrs_calloway',
  blueprintId: 'servant',
  type: 'npc',
  name: 'Mrs Calloway',
  tags: ['npc', 'servant', 'witness', 'female'],
  stats: { perception: 5, eloquence: 4, grit: 3 },
  resources: { hp: 8, stamina: 2, composure: 8 },
  statuses: [],
  zoneId: 'servants-hall',
};

// --- Enemies ---

export const thug: EntityState = {
  id: 'dock_thug',
  blueprintId: 'thug',
  type: 'enemy',
  name: 'Dock Thug',
  tags: ['enemy', 'criminal', 'male', 'role:minion'],
  stats: { perception: 3, eloquence: 2, grit: 6 },
  resources: { hp: 14, stamina: 5, composure: 6 },
  statuses: [],
  zoneId: 'back-alley',
  ai: {
    profileId: 'aggressive',
    goals: ['guard-territory', 'intimidate'],
    fears: ['outnumbered'],
    alertLevel: 0,
    knowledge: {},
  },
};

export const hiredMuscle: EntityState = {
  id: 'hired-muscle',
  blueprintId: 'hired-muscle',
  type: 'enemy',
  name: 'Hired Muscle',
  tags: ['enemy', 'criminal', 'enforcer', 'role:brute'],
  stats: { perception: 3, eloquence: 2, grit: 6 },
  resources: { hp: 18, stamina: 5, composure: 8 },
  statuses: [],
  zoneId: 'back-alley',
  resistances: { fear: 'resistant' },
  ai: { profileId: 'aggressive', goals: ['protect-boss', 'intimidate'], fears: ['law'], alertLevel: 0, knowledge: {} },
};

export const crimeBoss: EntityState = {
  id: 'crime-boss',
  blueprintId: 'crime-boss',
  type: 'enemy',
  name: 'Mr. Hargreaves',
  tags: ['enemy', 'criminal', 'mastermind', 'role:boss'],
  stats: { perception: 6, eloquence: 7, grit: 5 },
  resources: { hp: 40, maxHp: 40, stamina: 10, maxStamina: 10, composure: 20 },
  statuses: [],
  zoneId: 'back-alley',
  resistances: { control: 'resistant', fear: 'immune' },
  ai: { profileId: 'calculating', goals: ['eliminate-witnesses', 'control-docks'], fears: ['exposure'], alertLevel: 0, knowledge: {} },
};

// --- Boss Definition ---

export const crimeBossDef: BossDefinition = {
  entityId: 'crime-boss',
  phases: [
    {
      hpThreshold: 0.5,
      narrativeKey: 'calculating',
      addTags: ['scheming', 'calling-reinforcements'],
    },
    {
      hpThreshold: 0.25,
      narrativeKey: 'cornered',
      addTags: ['desperate', 'violent'],
      removeTags: ['scheming'],
    },
  ],
};

// --- Encounters ---

export const alleyPatrol: EncounterDefinition = {
  id: 'alley-patrol',
  name: 'Alley Patrol',
  participants: [
    { entityId: 'dock_thug', role: 'minion' },
    { entityId: 'hired-muscle', role: 'brute' },
  ],
  composition: 'patrol',
  validZoneIds: ['back-alley', 'front-entrance'],
  narrativeHooks: { tone: 'threatening', trigger: 'Heavy footsteps echo through the fog.', stakes: 'The docks are watched.' },
};

export const docksideAmbush: EncounterDefinition = {
  id: 'dockside-ambush',
  name: 'Dockside Ambush',
  participants: [
    { entityId: 'dock_thug', role: 'minion' },
    { entityId: 'dock_thug', role: 'minion' },
    { entityId: 'hired-muscle', role: 'brute' },
  ],
  composition: 'ambush',
  validZoneIds: ['back-alley'],
  narrativeHooks: { tone: 'sudden', trigger: 'A whistle cuts the fog — you are surrounded.', stakes: 'Fight or lose the case forever.' },
};

export const crimeLordConfrontation: EncounterDefinition = {
  id: 'crime-lord-confrontation',
  name: 'Crime Lord Confrontation',
  participants: [
    { entityId: 'crime-boss', role: 'boss' },
    { entityId: 'hired-muscle', role: 'brute' },
    { entityId: 'dock_thug', role: 'minion' },
  ],
  composition: 'boss-fight',
  validZoneIds: ['back-alley'],
  narrativeHooks: { tone: 'climactic', trigger: 'Hargreaves steps from the shadows.', stakes: 'Justice or silence — only one walks away.' },
};

// --- Zones ---

export const zones: ZoneState[] = [
  {
    id: 'crime-scene',
    roomId: 'ashford-manor',
    name: 'The Study',
    tags: ['indoor', 'crime-scene', 'locked-room'],
    neighbors: ['parlour', 'servants-hall'],
    light: 3,
    interactables: ['desk', 'brandy-glass', 'fireplace', 'window-latch'],
  },
  {
    id: 'parlour',
    roomId: 'ashford-manor',
    name: 'The Parlour',
    tags: ['indoor', 'aristocratic', 'social'],
    neighbors: ['crime-scene', 'front-entrance'],
    light: 5,
    interactables: ['portrait', 'letter-tray', 'tea-set'],
  },
  {
    id: 'servants-hall',
    roomId: 'ashford-manor',
    name: "Servants' Hall",
    tags: ['indoor', 'below-stairs', 'hidden'],
    neighbors: ['crime-scene', 'back-alley'],
    light: 2,
    interactables: ['ledger', 'key-rack', 'coal-chute'],
  },
  {
    id: 'front-entrance',
    roomId: 'ashford-manor',
    name: 'Front Entrance',
    tags: ['outdoor', 'public', 'foggy'],
    neighbors: ['parlour', 'back-alley'],
    light: 2,
    noise: 4,
  },
  {
    id: 'back-alley',
    roomId: 'ashford-manor',
    name: 'Back Alley',
    tags: ['outdoor', 'dark', 'dangerous'],
    neighbors: ['servants-hall', 'front-entrance'],
    light: 1,
    noise: 2,
    stability: 3,
    hazards: ['fog-chill'],
  },
];

// --- Dialogue ---

export const widowDialogue: DialogueDefinition = {
  id: 'widow-interrogation',
  speakers: ['Lady Ashford'],
  entryNodeId: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Lady Ashford',
      text: 'Inspector. I trust you will resolve this dreadful business quickly. My husband was a man of enemies, but none I thought capable of... this.',
      choices: [
        {
          id: 'sympathize',
          text: 'My condolences, Lady Ashford. When did you last see your husband?',
          nextNodeId: 'timeline',
        },
        {
          id: 'press',
          text: 'You mentioned enemies. I need names.',
          nextNodeId: 'enemies',
          effects: [
            { type: 'set-global', target: 'actor', params: { key: 'pressed-widow', value: true } },
          ],
        },
      ],
    },
    timeline: {
      id: 'timeline',
      speaker: 'Lady Ashford',
      text: 'Supper. Around eight. He retired to his study afterward. The door was locked from the inside when the constable arrived.',
      choices: [
        { id: 'ask-key', text: 'Who has a key to the study?', nextNodeId: 'keys' },
        { id: 'end-polite', text: 'Thank you. I may return with more questions.', nextNodeId: 'end' },
      ],
    },
    enemies: {
      id: 'enemies',
      speaker: 'Lady Ashford',
      text: 'There was a dockworker — some dispute over unpaid labor. And his business partner, Mr Hargreaves. But surely you do not suspect me?',
      choices: [
        { id: 'reassure', text: 'Everyone is a suspect until the evidence says otherwise.', nextNodeId: 'end' },
      ],
    },
    keys: {
      id: 'keys',
      speaker: 'Lady Ashford',
      text: 'Only my husband. And Mrs Calloway, the housekeeper. She keeps a spare on the key rack downstairs.',
      choices: [
        {
          id: 'note-key',
          text: 'Interesting. I will speak with Mrs Calloway.',
          nextNodeId: 'end',
          effects: [
            { type: 'set-global', target: 'actor', params: { key: 'knows-spare-key', value: true } },
          ],
        },
      ],
    },
    end: {
      id: 'end',
      speaker: 'Lady Ashford',
      text: 'Do what you must, Inspector. But do it quietly. The family name cannot bear more scandal.',
    },
  },
};

// --- Districts ---

export const districts: DistrictDefinition[] = [
  {
    id: 'ashford-estate',
    name: 'Ashford Estate',
    zoneIds: ['crime-scene', 'parlour', 'servants-hall', 'front-entrance'],
    tags: ['aristocratic', 'private'],
  },
  {
    id: 'dockyards',
    name: 'The Dockyards',
    zoneIds: ['back-alley'],
    tags: ['industrial', 'dangerous'],
    controllingFaction: 'dockworkers',
  },
];

// --- Progression ---

export const deductionTree: ProgressionTreeDefinition = {
  id: 'deduction-mastery',
  name: 'Deduction Mastery',
  currency: 'xp',
  nodes: [
    {
      id: 'keen-eye',
      name: 'Keen Eye',
      cost: 10,
      effects: [
        { type: 'stat-boost', params: { stat: 'perception', amount: 1 } },
      ],
    },
    {
      id: 'silver-tongue',
      name: 'Silver Tongue',
      cost: 15,
      effects: [
        { type: 'stat-boost', params: { stat: 'eloquence', amount: 1 } },
        { type: 'grant-tag', params: { tag: 'persuasive' } },
      ],
    },
    {
      id: 'iron-nerves',
      name: 'Iron Nerves',
      cost: 25,
      requires: ['keen-eye'],
      effects: [
        { type: 'resource-boost', params: { resource: 'composure', amount: 5 } },
        { type: 'stat-boost', params: { stat: 'grit', amount: 1 } },
      ],
    },
  ],
};

// --- Item Effect ---

export const smellingSaltsEffect = {
  itemId: 'smelling-salts',
  use: (action: ActionIntent, world: WorldState): ResolvedEvent[] => {
    const actor = world.entities[action.actorId];
    if (!actor) return [];

    const previous = actor.resources.composure ?? 0;
    actor.resources.composure = Math.min(20, previous + 8);

    return [{
      id: nextId('evt'),
      tick: action.issuedAtTick,
      type: 'resource.changed',
      actorId: action.actorId,
      payload: {
        entityId: actor.id,
        resource: 'composure',
        previous,
        current: actor.resources.composure,
        delta: actor.resources.composure - previous,
      },
    }];
  },
};

// --- Abilities ---

export const deductiveStrike: AbilityDefinition = {
  id: 'deductive-strike',
  name: 'Deductive Strike',
  verb: 'use-ability',
  tags: ['combat', 'damage'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'single' },
  checks: [{ stat: 'grit', difficulty: 5, onFail: 'half-damage' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 4, damageType: 'melee' } },
  ],
  cooldown: 2,
  requirements: [{ type: 'has-tag', params: { tag: 'investigator' } }],
  ui: {
    text: 'A measured blow — precisely where it will hurt most.',
    hitText: 'The strike lands clean. Training meets instinct.',
    missText: 'They sidestep — faster than expected.',
    soundCue: 'ability.deductive-strike',
  },
};

export const composureShield: AbilityDefinition = {
  id: 'composure-shield',
  name: 'Composure Shield',
  verb: 'use-ability',
  tags: ['support', 'buff'],
  costs: [{ resourceId: 'stamina', amount: 2 }],
  target: { type: 'self' },
  checks: [{ stat: 'perception', difficulty: 5, onFail: 'abort' }],
  effects: [
    { type: 'heal', target: 'actor', params: { amount: 4, resource: 'composure' } },
    { type: 'stat-modify', target: 'actor', params: { stat: 'perception', amount: 1 } },
  ],
  cooldown: 3,
  ui: {
    text: 'Steady the nerves. Focus sharpens. The case comes into clarity.',
    hitText: 'A deep breath. The fog lifts — every detail snaps into focus.',
    missText: 'The mind races. Too many threads, too little time.',
    soundCue: 'ability.composure-shield',
  },
};

export const exposeWeakness: AbilityDefinition = {
  id: 'expose-weakness',
  name: 'Expose Weakness',
  verb: 'use-ability',
  tags: ['combat', 'debuff', 'social'],
  costs: [
    { resourceId: 'stamina', amount: 2 },
    { resourceId: 'composure', amount: 3 },
  ],
  target: { type: 'single' },
  checks: [{ stat: 'perception', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'exposed', duration: 2, stacking: 'replace' } },
    { type: 'stat-modify', target: 'target', params: { stat: 'grit', amount: -2 } },
  ],
  cooldown: 4,
  requirements: [{ type: 'has-tag', params: { tag: 'investigator' } }],
  ui: {
    text: 'Read them like a case file. Find the crack. Exploit it.',
    hitText: 'There — a flinch. You see right through them.',
    missText: 'They hold steady. Poker face, this one.',
    soundCue: 'ability.expose-weakness',
  },
};

export const clearHeaded: AbilityDefinition = {
  id: 'clear-headed',
  name: 'Clear-Headed',
  verb: 'use-ability',
  tags: ['support', 'cleanse'],
  costs: [
    { resourceId: 'stamina', amount: 2 },
    { resourceId: 'composure', amount: 2 },
  ],
  target: { type: 'self' },
  checks: [{ stat: 'perception', difficulty: 5, onFail: 'abort' }],
  effects: [
    { type: 'remove-status-by-tag', target: 'actor', params: { tags: 'fear,control' } },
  ],
  cooldown: 3,
  ui: {
    text: 'Steady the mind. The facts are still there — find them.',
    hitText: 'A deep breath. The fog lifts. Clarity returns.',
    missText: 'The mind races. Too many threads, too much noise.',
    soundCue: 'ability.clear-headed',
  },
};

export const detectiveAbilities: AbilityDefinition[] = [deductiveStrike, composureShield, exposeWeakness, clearHeaded];

// --- Status Definitions ---

export const detectiveStatusDefinitions: StatusDefinition[] = [
  {
    id: 'exposed',
    name: 'Exposed',
    tags: ['breach', 'debuff'],
    stacking: 'replace',
    duration: { type: 'ticks', value: 2 },
    ui: { icon: '🔍', color: '#e74c3c', description: 'Weakness laid bare — defenses compromised' },
  },
];

// --- Pack Metadata ---

export const packMeta: PackMetadata = {
  id: 'gaslight-detective',
  name: 'Gaslight Detective',
  tagline: 'A locked-room murder in a fog-choked Victorian estate.',
  genres: ['mystery'],
  difficulty: 'intermediate',
  tones: ['noir', 'dark'],
  tags: ['investigation', 'victorian', 'interrogation', 'deduction'],
  engineVersion: '2.0.0',
  version: '2.0.0',
  description: 'Investigate a locked-room murder at Ashford Estate. Interrogate suspects, gather evidence, and survive the back alleys.',
  narratorTone: 'victorian noir, measured, atmospheric, suspenseful',
};

// --- Build Catalog ---

export const buildCatalog: BuildCatalog = {
  packId: 'gaslight-detective',
  statBudget: 3,
  maxTraits: 3,
  requiredFlaws: 1,
  archetypes: [
    {
      id: 'inspector',
      name: 'Inspector',
      description: 'Methodical observer, sees everything',
      statPriorities: { perception: 7, eloquence: 4, grit: 3 },
      startingTags: ['investigator', 'inspector'],
      progressionTreeId: 'deduction-mastery',
      grantedVerbs: ['interrogate', 'deduce'],
    },
    {
      id: 'raconteur',
      name: 'Raconteur',
      description: 'Charming liar, silver-tongued',
      statPriorities: { perception: 3, eloquence: 7, grit: 4 },
      startingTags: ['socialite', 'raconteur'],
      progressionTreeId: 'deduction-mastery',
      grantedVerbs: ['interrogate'],
    },
    {
      id: 'bruiser',
      name: 'Bruiser',
      description: 'Fists first, questions later',
      statPriorities: { perception: 4, eloquence: 3, grit: 7 },
      startingTags: ['enforcer', 'bruiser'],
      progressionTreeId: 'deduction-mastery',
    },
  ],
  backgrounds: [
    {
      id: 'scotland-yard',
      name: 'Scotland Yard',
      description: 'Trained by the Metropolitan Police',
      statModifiers: { perception: 1, eloquence: -1 },
      startingTags: ['badge-carrier'],
    },
    {
      id: 'theatre-district',
      name: 'Theatre District',
      description: 'Trained on the stage, reads people like scripts',
      statModifiers: { eloquence: 1, grit: -1 },
      startingTags: ['stage-trained'],
    },
    {
      id: 'dockside',
      name: 'Dockside',
      description: 'Grew up near the wharves, hard as iron',
      statModifiers: { grit: 1 },
      startingTags: ['dock-hardened'],
    },
  ],
  traits: [
    {
      id: 'eidetic-memory',
      name: 'Eidetic Memory',
      description: 'Remembers every detail, every face',
      category: 'perk',
      effects: [
        { type: 'stat-modifier', stat: 'perception', amount: 1 },
        { type: 'grant-tag', tag: 'photographic' },
      ],
    },
    {
      id: 'honeyed-words',
      name: 'Honeyed Words',
      description: 'People trust that voice',
      category: 'perk',
      effects: [{ type: 'stat-modifier', stat: 'eloquence', amount: 1 }],
    },
    {
      id: 'haunted-past',
      name: 'Haunted Past',
      description: 'The cases that got away still visit at night',
      category: 'flaw',
      effects: [{ type: 'resource-modifier', resource: 'composure', amount: -3 }],
    },
    {
      id: 'brash-temper',
      name: 'Brash Temper',
      description: 'Patience is not a virtue you possess',
      category: 'flaw',
      effects: [
        { type: 'stat-modifier', stat: 'eloquence', amount: -1 },
        { type: 'grant-tag', tag: 'hot-headed' },
      ],
      incompatibleWith: ['honeyed-words'],
    },
  ],
  disciplines: [
    {
      id: 'occultist',
      name: 'Occultist',
      description: 'Studies the supernatural underbelly of Victorian London',
      grantedVerb: 'commune',
      passive: { type: 'stat-modifier', stat: 'perception', amount: 1 },
      drawback: { type: 'resource-modifier', resource: 'composure', amount: -2 },
    },
    {
      id: 'underworld-contact',
      name: 'Underworld Contact',
      description: 'Knows the criminal element personally',
      grantedVerb: 'plunder',
      passive: { type: 'stat-modifier', stat: 'grit', amount: 1 },
      drawback: { type: 'faction-modifier', faction: 'scotland-yard', amount: -10 },
    },
  ],
  crossTitles: [
    { archetypeId: 'inspector', disciplineId: 'occultist', title: 'Seance Detective', tags: ['seance-detective'] },
    { archetypeId: 'inspector', disciplineId: 'underworld-contact', title: 'Grave Barrister', tags: ['grave-barrister'] },
    { archetypeId: 'raconteur', disciplineId: 'occultist', title: 'Ink-Seer', tags: ['ink-seer'] },
    { archetypeId: 'raconteur', disciplineId: 'underworld-contact', title: 'Velvet Fence', tags: ['velvet-fence'] },
    { archetypeId: 'bruiser', disciplineId: 'occultist', title: 'Exorcist', tags: ['exorcist'] },
    { archetypeId: 'bruiser', disciplineId: 'underworld-contact', title: 'Knuckle Prophet', tags: ['knuckle-prophet'] },
  ],
  entanglements: [
    {
      id: 'inspector-underworld',
      archetypeId: 'inspector',
      disciplineId: 'underworld-contact',
      description: 'Inspectors who consort with criminals risk their badge',
      effects: [{ type: 'grant-tag', tag: 'compromised' }],
    },
  ],
};

// --- Item Catalog ---

export const itemCatalog: ItemCatalog = {
  items: [
    {
      id: 'magnifying-glass',
      name: 'Magnifying Glass',
      description: 'A well-polished lens for examining clues.',
      slot: 'tool',
      rarity: 'common',
      statModifiers: { perception: 1 },
      grantedVerbs: ['examine'],
    },
    {
      id: 'walking-cane',
      name: 'Walking Cane',
      description: 'A gentleman\'s cane with a weighted head.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { grit: 1 },
      grantedVerbs: ['strike'],
      grantedTags: ['armed'],
    },
    {
      id: 'overcoat',
      name: 'Wool Overcoat',
      description: 'A heavy overcoat that conceals and protects.',
      slot: 'armor',
      rarity: 'common',
      resourceModifiers: { composure: 3 },
    },
    {
      id: 'pocket-watch',
      name: 'Pocket Watch',
      description: 'An heirloom timepiece — steady as its owner.',
      slot: 'trinket',
      rarity: 'uncommon',
      resourceModifiers: { composure: 2 },
      grantedTags: ['punctual'],
    },
    {
      id: 'lockpick-set',
      name: 'Lockpick Set',
      description: 'A set of fine picks in a leather roll.',
      slot: 'tool',
      rarity: 'common',
      grantedVerbs: ['pick-lock'],
      requiredTags: ['dock-hardened'],
    },
    {
      id: 'press-badge',
      name: 'Press Badge',
      description: 'A journalist\'s credentials — opens doors, loosens lips.',
      slot: 'accessory',
      rarity: 'uncommon',
      statModifiers: { eloquence: 1 },
      grantedTags: ['press-access'],
    },
    {
      id: 'spirit-compass',
      name: 'Spirit Compass',
      description: 'A brass compass that points toward restless spirits.',
      slot: 'trinket',
      rarity: 'rare',
      statModifiers: { perception: 2 },
      grantedTags: ['spirit-sensitive'],
      requiredTags: ['photographic'],
    },
  ],
};
