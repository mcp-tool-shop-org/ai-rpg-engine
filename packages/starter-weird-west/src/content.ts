// Dust Devil's Bargain — content definitions

import type { EntityState, ZoneState, GameManifest, ActionIntent, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import type { DialogueDefinition, ProgressionTreeDefinition, AbilityDefinition, StatusDefinition, QuestDefinition } from '@ai-rpg-engine/content-schema';
import type { DistrictDefinition, EncounterDefinition, BossDefinition, CurrencyReward, EncounterSpawnContent } from '@ai-rpg-engine/modules';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';

// --- Manifest ---

export const manifest: GameManifest = {
  id: 'dust-devils-bargain',
  title: "Dust Devil's Bargain",
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'weird-west-minimal',
  modules: [
    'traversal-core',
    'status-core',
    'combat-core',
    'inventory-core',
    'dialogue-core',
  ],
  contentPacks: ['dust-devils-bargain'],
};

// --- Player ---

export const player: EntityState = {
  id: 'drifter',
  blueprintId: 'drifter',
  type: 'player',
  name: 'The Drifter',
  tags: ['player', 'human', 'drifter', 'gunslinger'],
  stats: { grit: 5, 'draw-speed': 6, lore: 4 },
  // F-92c78519: a small starting coin purse — trade-core's `sell`/`buy`
  // verbs (always registered via buildWorldStack) read/write this resource
  // directly; without a seed the drifter starts a working economy at 0.
  resources: { hp: 18, maxHp: 18, stamina: 5, resolve: 15, dust: 0, coin: 25 },
  statuses: [],
  // F-86b9145d: the gunslinger's six-shooter reaches the authored player
  // too, so the equip loop is reachable without character creation (created
  // gunslinger characters carry it via the archetype's startingInventory).
  inventory: ['six-shooter'],
  zoneId: 'crossroads',
};

// --- NPCs ---

export const bartender: EntityState = {
  id: 'bartender_silas',
  blueprintId: 'bartender',
  type: 'npc',
  name: 'Silas',
  // F-a56f7e5d: recruitable + a bare CompanionRole tag ('scout') — the
  // town's informant is exactly a scout's stock in trade.
  // 'named' (V3R-NPC-2, v3.0 Living NPCs remediation): also the pack's one
  // dialogue-bearing story NPC (bartenderDialogue) — alive in npc-agency's
  // social/PEOPLE layer from turn 1, independent of (and ahead of) whatever
  // 'companion' tag recruiting him later adds.
  tags: ['npc', 'townsfolk', 'informant', 'male', 'recruitable', 'scout', 'named'],
  stats: { grit: 3, 'draw-speed': 2, lore: 5 },
  // maxHp/maxStamina (F-4b9c5aee): a recruitable companion needs the same
  // resources shape enemies carry — entityHpRatio/regen both read the max
  // fields, and without them the entity always reads as full HP regardless
  // of true damage taken.
  resources: { hp: 10, maxHp: 10, stamina: 2, maxStamina: 2, resolve: 12, dust: 0 },
  statuses: [],
  zoneId: 'saloon',
  custom: {
    companionRole: 'scout',
    companionAbilities: 'town-intel,trail-warning',
    personalGoal: 'Learn what really happened to the vanished townsfolk',
  },
};

export const sheriff: EntityState = {
  id: 'sheriff_hale',
  blueprintId: 'sheriff',
  type: 'npc',
  name: 'Sheriff Hale',
  // F-a56f7e5d: recruitable + a bare CompanionRole tag ('fighter').
  tags: ['npc', 'law', 'secretive', 'male', 'recruitable', 'fighter'],
  stats: { grit: 6, 'draw-speed': 5, lore: 3 },
  // maxHp/maxStamina (F-4b9c5aee) — see Silas's comment above.
  resources: { hp: 16, maxHp: 16, stamina: 4, maxStamina: 4, resolve: 14, dust: 0 },
  statuses: [],
  zoneId: 'sheriffs-office',
  custom: {
    companionRole: 'fighter',
    companionAbilities: 'lawman-backup,duel-cover',
    personalGoal: 'Atone for whatever he did out at the mesa',
  },
};

// --- Enemies ---

export const revenant: EntityState = {
  id: 'dust_revenant',
  blueprintId: 'revenant',
  type: 'enemy',
  name: 'Dust Revenant',
  tags: ['enemy', 'undead', 'cursed', 'gunslinger', 'role:elite'],
  stats: { grit: 6, 'draw-speed': 7, lore: 1 },
  resources: { hp: 14, stamina: 6, resolve: 20, dust: 0 },
  statuses: [],
  zoneId: 'red-mesa-trail',
  ai: {
    profileId: 'aggressive',
    goals: ['guard-mesa', 'duel-intruders'],
    fears: ['sacred-symbols'],
    alertLevel: 0,
    knowledge: {},
  },
};

export const crawler: EntityState = {
  id: 'mesa_crawler',
  blueprintId: 'crawler',
  type: 'enemy',
  name: 'Mesa Crawler',
  tags: ['enemy', 'spirit', 'beast', 'supernatural', 'role:boss'],
  stats: { grit: 4, 'draw-speed': 3, lore: 8 },
  resources: { hp: 10, maxHp: 10, stamina: 4, maxStamina: 4, resolve: 25, dust: 0 },
  statuses: [],
  zoneId: 'spirit-hollow',
  resistances: { blind: 'immune', supernatural: 'resistant' },
  ai: {
    profileId: 'territorial',
    goals: ['guard-hollow', 'consume-resolve'],
    fears: [],
    alertLevel: 0,
    knowledge: {},
  },
};

export const banditRider: EntityState = {
  id: 'bandit-rider',
  blueprintId: 'bandit-rider',
  type: 'enemy',
  name: 'Bandit Rider',
  tags: ['enemy', 'human', 'outlaw', 'role:skirmisher'],
  stats: { grit: 4, 'draw-speed': 5, lore: 2 },
  resources: { hp: 10, stamina: 5, resolve: 10, dust: 0 },
  statuses: [],
  zoneId: 'red-mesa-trail',
  ai: { profileId: 'aggressive', goals: ['rob-travelers', 'ambush'], fears: ['law', 'spirits'], alertLevel: 0, knowledge: {} },
};

// --- Boss Definition ---

export const mesaCrawlerBoss: BossDefinition = {
  entityId: 'mesa_crawler',
  phases: [
    {
      hpThreshold: 0.5,
      narrativeKey: 'feeding-frenzy',
      addTags: ['frenzied', 'spirit-charged'],
    },
    {
      hpThreshold: 0.25,
      narrativeKey: 'death-wail',
      addTags: ['desperate', 'wailing'],
      removeTags: ['frenzied'],
    },
  ],
};

// --- Encounters ---

export const trailPatrol: EncounterDefinition = {
  id: 'trail-patrol',
  name: 'Trail Patrol',
  participants: [
    { entityId: 'bandit-rider', role: 'skirmisher' },
    { entityId: 'dust_revenant', role: 'elite' },
  ],
  composition: 'patrol',
  validZoneIds: ['red-mesa-trail', 'crossroads'],
  narrativeHooks: { tone: 'ominous', trigger: 'Hoofbeats and the rattle of dry bones.', stakes: 'The trail takes its toll.' },
};

export const saloonAmbush: EncounterDefinition = {
  id: 'saloon-ambush',
  name: 'Saloon Ambush',
  participants: [
    { entityId: 'bandit-rider', role: 'skirmisher' },
    { entityId: 'bandit-rider', role: 'skirmisher' },
  ],
  composition: 'ambush',
  validZoneIds: ['saloon'],
  narrativeHooks: { tone: 'sudden', trigger: 'The piano stops. Hands move to holsters.', stakes: 'Draw or die.' },
};

export const spiritHollowShowdown: EncounterDefinition = {
  id: 'spirit-hollow-showdown',
  name: 'Spirit Hollow Showdown',
  participants: [
    { entityId: 'mesa_crawler', role: 'boss' },
    { entityId: 'dust_revenant', role: 'elite' },
  ],
  composition: 'boss-fight',
  validZoneIds: ['spirit-hollow'],
  narrativeHooks: { tone: 'dread', trigger: 'The hollow screams with spirit fire.', stakes: 'Banish the crawler or join the dead.' },
};


// --- Encounter spawn wiring (F-ENG005-encounter-spawn-wiring) ---
//
// Per-zone encounter tables — the moral equivalent of content-schema's
// ZoneDefinition.encounterTable (string[]; weight is repetition).
// The cursed trail is thick with riders and worse, the crossroads sees the
// occasional posse, and once in a while the saloon goes sideways. The spirit
// hollow showdown is the placed set-piece — boss fights never enter random
// tables.

export const encounterSpawnContent = {
  encounters: [trailPatrol, saloonAmbush, spiritHollowShowdown],
  entityTemplates: [banditRider, revenant],
  zoneTables: {
    'red-mesa-trail': ['trail-patrol', 'trail-patrol'],
    'crossroads': ['trail-patrol'],
    'saloon': ['saloon-ambush'],
  },
} satisfies EncounterSpawnContent;

// --- Zones ---

export const zones: ZoneState[] = [
  {
    id: 'crossroads',
    roomId: 'town',
    name: "Drifter's Crossroads",
    tags: ['outdoor', 'neutral', 'dusty'],
    neighbors: ['saloon', 'sheriffs-office', 'red-mesa-trail'],
    light: 5,
    interactables: ['signpost', 'hitching-post', 'wanted-poster'],
  },
  {
    id: 'saloon',
    roomId: 'town',
    name: 'The Dusty Spur Saloon',
    tags: ['indoor', 'social', 'safe'],
    neighbors: ['crossroads'],
    light: 3,
    interactables: ['bar', 'piano', 'notice-board'],
  },
  {
    id: 'sheriffs-office',
    roomId: 'town',
    name: "Sheriff's Office",
    tags: ['indoor', 'law', 'safe'],
    neighbors: ['crossroads'],
    light: 4,
    interactables: ['desk', 'gun-rack', 'cell-door', 'lockbox'],
  },
  {
    id: 'red-mesa-trail',
    roomId: 'badlands',
    name: 'Red Mesa Trail',
    tags: ['outdoor', 'hostile', 'cursed'],
    neighbors: ['crossroads', 'spirit-hollow'],
    light: 6,
    noise: 2,
    stability: 3,
    hazards: ['dust-storm', 'cursed-ground'],
    interactables: ['petroglyphs', 'bone-cairn'],
  },
  {
    id: 'spirit-hollow',
    roomId: 'badlands',
    name: 'Spirit Hollow',
    tags: ['outdoor', 'supernatural', 'sacred'],
    neighbors: ['red-mesa-trail'],
    light: 1,
    noise: 1,
    stability: 2,
    hazards: ['spirit-drain'],
    interactables: ['ley-line-crack', 'ancient-altar', 'whispering-stones'],
  },
];

// --- Dialogue ---

export const bartenderDialogue: DialogueDefinition = {
  id: 'bartender-intel',
  // Must be the entity id (not the display name) — dialogue-core's
  // speakHandler auto-discovers a dialogue via `speakers.includes(targetId)`
  // using the real entity id when no explicit dialogueId is passed.
  speakers: ['bartender_silas'],
  entryNodeId: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Silas',
      text: "Stranger. You've got the look of someone who doesn't plan on staying long. Smart. This town's got a sickness, and it ain't the kind a doctor fixes.",
      choices: [
        {
          id: 'ask-mesa',
          text: "What's out at Red Mesa?",
          nextNodeId: 'mesa-info',
        },
        {
          id: 'ask-sheriff',
          text: 'What can you tell me about the sheriff?',
          nextNodeId: 'sheriff-info',
        },
      ],
    },
    'mesa-info': {
      id: 'mesa-info',
      speaker: 'Silas',
      text: "Cult moved in three months back. Call themselves the Red Congregation. They do things out there at night — chanting, fires. Folks who go looking don't come back right. Some don't come back at all.",
      choices: [
        {
          id: 'volunteer-mesa',
          text: "I'll check it out. What should I watch for?",
          nextNodeId: 'mesa-warning',
        },
        { id: 'leave-mesa', text: "Not my problem.", nextNodeId: 'end' },
      ],
    },
    'sheriff-info': {
      id: 'sheriff-info',
      speaker: 'Silas',
      text: "Hale's been sheriff longer than anyone can remember. Good man, or was. Lately he locks himself in that office. Won't talk about the mesa. Won't talk about the disappearances. Something's eating at him.",
      choices: [
        { id: 'to-mesa', text: 'And the mesa?', nextNodeId: 'mesa-info' },
        { id: 'leave-sheriff', text: "I'll keep that in mind.", nextNodeId: 'end' },
      ],
    },
    'mesa-warning': {
      id: 'mesa-warning',
      speaker: 'Silas',
      text: "The dust out there — it gets inside you. Not your lungs. Your head. Sage helps. Burns it out, slows it down. Take this bundle. And if you see a dead man walking with a gun on his hip... shoot first.",
      effects: [
        { type: 'set-global', target: 'actor', params: { key: 'mesa-mission', value: true } },
      ],
    },
    end: {
      id: 'end',
      speaker: 'Silas',
      text: "Suit yourself, stranger. Whiskey's two bits if you're staying.",
    },
  },
};

// --- Quests (F-ENG005-quest-loop-min / F-c07d6024) ---
//
// Two authored QuestDefinitions — the explicit reason to ride out. Wired via
// buildWorldStack's `quests` config in setup.ts; quest-core validates at
// construction (fail loud) and drives offer -> track -> complete -> reward
// off the live event stream. Both are completable inside a normal session
// with the shipped world alone: bandit riders patrol the trail, crossroads,
// and saloon, and the mesa crawler stands fixed watch over the hollow.

export const rideTheMesaTrailQuest: QuestDefinition = {
  id: 'ride-the-mesa-trail',
  name: 'Ride the Mesa Trail',
  // Offered the moment the drifter steps into the saloon — the first place
  // in town where the talk turns to the mesa.
  triggers: [
    {
      event: 'world.zone.entered',
      condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'saloon' } },
      effect: { type: 'offer', params: {} },
    },
  ],
  stages: [
    {
      id: 'reach-the-mesa-trail',
      name: 'Reach the Mesa Trail',
      description: 'The talk in the saloon points out past the crossroads',
      objectives: ['Reach Red Mesa Trail'],
      triggers: [
        {
          event: 'world.zone.entered',
          condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'red-mesa-trail' } },
          effect: { type: 'advance', params: {} },
        },
      ],
      nextStage: 'clear-the-riders',
    },
    {
      id: 'clear-the-riders',
      name: 'Clear the Riders',
      description: 'Bandit riders dog every step down this trail',
      objectives: ['Defeat one bandit rider'],
      triggers: [
        {
          event: 'combat.entity.defeated',
          condition: { type: 'payload-entity-has-tag', params: { tag: 'outlaw' } },
          effect: { type: 'advance', params: {} },
        },
      ],
    },
  ],
  rewards: [{ type: 'xp', params: { amount: 20 } }],
};

export const banishTheCrawlerQuest: QuestDefinition = {
  id: 'banish-the-crawler',
  name: 'Banish the Crawler',
  // Offered on setting foot in the hollow itself — the crawler's ground.
  triggers: [
    {
      event: 'world.zone.entered',
      condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'spirit-hollow' } },
      effect: { type: 'offer', params: {} },
    },
  ],
  stages: [
    {
      id: 'destroy-the-crawler',
      name: 'Destroy the Crawler',
      description: 'The Mesa Crawler stands between you and the ley line beneath the hollow',
      objectives: ['Destroy the Mesa Crawler'],
      triggers: [
        {
          event: 'combat.entity.defeated',
          condition: { type: 'payload-equals', params: { key: 'entityId', value: 'mesa_crawler' } },
          effect: { type: 'advance', params: {} },
        },
      ],
    },
  ],
  rewards: [
    { type: 'xp', params: { amount: 30 } },
    { type: 'item', params: { itemId: 'rattlesnake-fang' } },
  ],
};

export const weirdWestQuests: QuestDefinition[] = [rideTheMesaTrailQuest, banishTheCrawlerQuest];

// --- Districts ---

export const districts: DistrictDefinition[] = [
  {
    id: 'town',
    name: 'Perdition',
    zoneIds: ['crossroads', 'saloon', 'sheriffs-office'],
    tags: ['civilized', 'frontier'],
    controllingFaction: 'townsfolk',
  },
  {
    id: 'badlands',
    name: 'The Badlands',
    zoneIds: ['red-mesa-trail', 'spirit-hollow'],
    tags: ['cursed', 'supernatural', 'hostile'],
    controllingFaction: 'red-congregation',
  },
];

// --- Progression ---

export const gunslingerTree: ProgressionTreeDefinition = {
  id: 'gunslinger',
  name: 'Gunslinger',
  currency: 'xp',
  nodes: [
    {
      id: 'quick-hand',
      name: 'Quick Hand',
      cost: 10,
      effects: [
        { type: 'stat-boost', params: { stat: 'draw-speed', amount: 1 } },
      ],
    },
    {
      id: 'iron-will',
      name: 'Iron Will',
      cost: 12,
      effects: [
        { type: 'stat-boost', params: { stat: 'grit', amount: 1 } },
        { type: 'resource-boost', params: { resource: 'resolve', amount: 3 } },
      ],
    },
    {
      id: 'dead-eye',
      name: 'Dead Eye',
      cost: 25,
      requires: ['quick-hand', 'iron-will'],
      effects: [
        { type: 'stat-boost', params: { stat: 'draw-speed', amount: 2 } },
        { type: 'grant-tag', params: { tag: 'dead-eye' } },
      ],
    },
  ],
};

// --- Item Effect ---

export const sageBundleEffect = {
  itemId: 'sage-bundle',
  use: (action: ActionIntent, world: WorldState): ResolvedEvent[] => {
    const actor = world.entities[action.actorId];
    if (!actor) return [];

    const previous = actor.resources.dust ?? 0;
    actor.resources.dust = Math.max(0, previous - 20);

    return [{
      id: '',
      tick: action.issuedAtTick,
      type: 'resource.changed',
      actorId: action.actorId,
      payload: {
        entityId: actor.id,
        resource: 'dust',
        previous,
        current: actor.resources.dust,
        delta: actor.resources.dust - previous,
      },
    }];
  },
};

// --- Progression Rewards (T0-progression-ceiling) ---
//
// Kills alone cannot complete gunslinger: 3 enemies x 12 = 36 XP vs a 47 XP tree. Max earnable: 36 + 5 (bartender palaver) + 10 (5 zones x 2) + 10 (mesa-crawler bonus) = 61 >= 47.
// Non-combat sources: a finished palaver with the bartender, riding every trail around Perdition, and putting down the mesa crawler.
// content-truth.test.ts pins this arithmetic against the live content.

/** Flat XP amounts per source — exported so tests can pin the progression arithmetic. */
export const xpAwards = {
  kill: 12,
  dialogueComplete: 5,
  firstVisit: 2,
  bossBonus: 10,
} as const;

/** Award `amount` once per unique key, tracked in world.globals (rides saves). */
function oncePer(
  amount: number,
  keyOf: (event: ResolvedEvent) => string | undefined,
): CurrencyReward['amount'] {
  return (event, world) => {
    const k = keyOf(event);
    if (!k) return 0;
    const flag = `xp-awarded:${k}`;
    if (world.globals[flag]) return 0;
    world.globals[flag] = true;
    return amount;
  };
}

/** Only the player earns exploration/story XP (NPC movement must not consume the once-gates). */
const playerOnly: CurrencyReward['recipient'] = (event, world) =>
  event.actorId === world.playerId ? event.actorId : undefined;

export const progressionRewards: CurrencyReward[] = [
  { eventPattern: 'combat.entity.defeated', currencyId: 'xp', amount: xpAwards.kill, recipient: 'actor' },
  {
    eventPattern: 'combat.entity.defeated',
    currencyId: 'xp',
    amount: oncePer(xpAwards.bossBonus, (e) =>
      e.payload.entityId === 'mesa_crawler' ? 'boss:mesa_crawler' : undefined),
    recipient: 'actor',
  },
  {
    eventPattern: 'dialogue.ended',
    currencyId: 'xp',
    amount: oncePer(xpAwards.dialogueComplete, (e) => `dialogue:${String(e.payload.dialogueId)}`),
    recipient: playerOnly,
  },
  {
    eventPattern: 'world.zone.entered',
    currencyId: 'xp',
    amount: oncePer(xpAwards.firstVisit, (e) => `zone:${String(e.payload.zoneId)}`),
    recipient: playerOnly,
  },
];

// --- Abilities ---

export const dustDevil: AbilityDefinition = {
  id: 'dust-devil',
  name: 'Dust Devil',
  verb: 'use-ability',
  tags: ['supernatural', 'combat', 'damage', 'aoe'],
  costs: [
    { resourceId: 'resolve', amount: 5 },
    { resourceId: 'dust', amount: 10 },
  ],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'lore', difficulty: 9, onFail: 'abort' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 3, damageType: 'supernatural' } },
    { type: 'apply-status', target: 'target', params: { statusId: 'dust-blind', duration: 2, stacking: 'replace' } },
  ],
  cooldown: 4,
  requirements: [{ type: 'has-tag', params: { tag: 'supernatural' } }],
  ui: {
    text: 'Call upon the cursed dust to scour your enemies.',
    hitText: 'A howling vortex of dust and bone shards engulfs the battlefield.',
    missText: 'The dust refuses to answer — the spirits turn away.',
    soundCue: 'ability.dust-devil',
  },
};

export const frontierGrit: AbilityDefinition = {
  id: 'frontier-grit',
  name: 'Frontier Grit',
  verb: 'use-ability',
  tags: ['supernatural', 'support', 'cleanse'],
  costs: [
    { resourceId: 'stamina', amount: 2 },
    { resourceId: 'resolve', amount: 2 },
  ],
  target: { type: 'self' },
  checks: [{ stat: 'grit', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'remove-status-by-tag', target: 'actor', params: { tags: 'fear,blind' } },
  ],
  cooldown: 4,
  ui: {
    text: 'Grit your teeth and push through the fog.',
    hitText: 'The frontier hardens you. The dust clears.',
    missText: 'The land has its hooks in you — can\'t shake it.',
    soundCue: 'ability.frontier-grit',
  },
};

export const deadEyeShot: AbilityDefinition = {
  id: 'dead-eye-shot',
  name: 'Dead-Eye Shot',
  verb: 'use-ability',
  tags: ['combat', 'damage'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'single' },
  checks: [{ stat: 'draw-speed', difficulty: 6, onFail: 'half-damage' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 5, damageType: 'ballistic' } },
  ],
  cooldown: 2,
  ui: {
    text: 'One shot. Make it count.',
    hitText: 'The bullet finds its mark — dead center.',
    missText: 'The shot goes wide. Dust and smoke.',
    soundCue: 'ability.dead-eye-shot',
  },
};

export const weirdWestAbilities: AbilityDefinition[] = [dustDevil, frontierGrit, deadEyeShot];

// --- Status Definitions ---

export const weirdWestStatusDefinitions: StatusDefinition[] = [
  {
    id: 'dust-blind',
    name: 'Dust Blind',
    tags: ['blind', 'debuff'],
    stacking: 'replace',
    duration: { type: 'ticks', value: 2 },
    ui: { icon: '💨', color: '#d4a574', description: 'Eyes stinging from cursed dust' },
  },
];

// --- Pack Metadata ---

export const packMeta: PackMetadata = {
  id: 'dust-devils-bargain',
  name: "Dust Devil's Bargain",
  tagline: 'A haunted frontier town where the dead still draw.',
  genres: ['western'],
  difficulty: 'intermediate',
  tones: ['eerie', 'gritty'],
  tags: ['supernatural', 'frontier', 'duel', 'spirits', 'cult'],
  engineVersion: '2.0.0',
  version: '2.0.0',
  description: 'Drift into a cursed frontier town. Investigate a mesa cult, duel undead gunslingers, and commune with spirits before the dust takes you.',
  narratorTone: 'weird western, laconic, sun-bleached, haunted',
};

// --- Build Catalog ---

export const buildCatalog: BuildCatalog = {
  packId: 'dust-devils-bargain',
  statBudget: 3,
  maxTraits: 3,
  requiredFlaws: 1,
  archetypes: [
    {
      id: 'gunslinger',
      name: 'Gunslinger',
      description: 'Fastest hand in the territory',
      statPriorities: { grit: 4, 'draw-speed': 7, lore: 3 },
      // T0-unreachable-abilities (b): the whole kit used to gate on
      // 'supernatural', a tag nothing granted. frontier-grit and dead-eye-shot
      // are grit-and-gunpowder moves — ungated. dust-devil IS spirit work and
      // keeps its 'supernatural' gate, grantable two ways: the spirit-walker
      // archetype carries it natively, and the Spirit-Touched trait grants it.
      startingTags: ['gunslinger', 'quick-draw'],
      // F-86b9145d: six-shooter carries no requiredTags (any archetype could
      // equip it), but the fastest hand in the territory is who canonically
      // starts with it drawn.
      startingInventory: ['six-shooter'],
      progressionTreeId: 'gunslinger',
    },
    {
      id: 'spirit-walker',
      name: 'Spirit Walker',
      description: 'Speaks to what shouldn\'t speak back',
      statPriorities: { grit: 3, 'draw-speed': 3, lore: 8 },
      startingTags: ['supernatural', 'mystic', 'spirit-walker'],
      progressionTreeId: 'gunslinger',
    },
    {
      id: 'lawkeeper',
      name: 'Lawkeeper',
      description: 'Badge and backbone, but whose law?',
      statPriorities: { grit: 7, 'draw-speed': 4, lore: 3 },
      startingTags: ['law', 'lawkeeper'],
      progressionTreeId: 'gunslinger',
    },
  ],
  backgrounds: [
    {
      id: 'drifter',
      name: 'Drifter',
      description: 'No home, no ties, no one waiting',
      statModifiers: { 'draw-speed': 1, lore: -1 },
      startingTags: ['rootless'],
    },
    {
      id: 'preachers-child',
      name: "Preacher's Child",
      description: 'Raised on scripture and superstition',
      statModifiers: { lore: 1, 'draw-speed': -1 },
      startingTags: ['scripture-raised'],
    },
    {
      id: 'outlaw',
      name: 'Outlaw',
      description: 'Wanted poster in three counties',
      statModifiers: { grit: 1 },
      startingTags: ['wanted'],
    },
  ],
  traits: [
    {
      id: 'desert-hardened',
      name: 'Desert-Hardened',
      description: 'The sun tried to kill you and failed',
      category: 'perk',
      effects: [{ type: 'resource-modifier', resource: 'resolve', amount: 3 }],
    },
    {
      id: 'spirit-touched',
      name: 'Spirit-Touched',
      description: 'The dead whisper your name',
      category: 'perk',
      effects: [
        { type: 'stat-modifier', stat: 'lore', amount: 1 },
        { type: 'grant-tag', tag: 'spirit-sensitive' },
        { type: 'grant-tag', tag: 'supernatural' },
      ],
    },
    {
      id: 'dust-cursed',
      name: 'Dust-Cursed',
      description: 'The desert has already marked you',
      category: 'flaw',
      effects: [
        { type: 'resource-modifier', resource: 'dust', amount: 15 },
        { type: 'grant-tag', tag: 'dust-marked' },
      ],
    },
    {
      id: 'twitchy',
      name: 'Twitchy',
      description: 'Jumps at shadows, second-guesses every choice',
      category: 'flaw',
      effects: [
        { type: 'stat-modifier', stat: 'grit', amount: -1 },
        { type: 'grant-tag', tag: 'nervous' },
      ],
      incompatibleWith: ['desert-hardened'],
    },
  ],
  disciplines: [
    {
      id: 'occultist',
      name: 'Occultist',
      description: 'Studies the mesa rituals and spirit bindings',
      grantedVerb: 'commune',
      passive: { type: 'stat-modifier', stat: 'lore', amount: 1 },
      drawback: { type: 'resource-modifier', resource: 'dust', amount: 10 },
    },
    {
      id: 'bounty-hunter',
      name: 'Bounty Hunter',
      description: 'Tracks down the wanted, dead or alive',
      grantedVerb: 'interrogate',
      passive: { type: 'stat-modifier', stat: 'grit', amount: 1 },
      drawback: { type: 'faction-modifier', faction: 'red-congregation', amount: -10 },
    },
  ],
  crossTitles: [
    { archetypeId: 'gunslinger', disciplineId: 'occultist', title: 'Hex Pistol', tags: ['hex-pistol'] },
    { archetypeId: 'gunslinger', disciplineId: 'bounty-hunter', title: 'Dead-Eye Marshal', tags: ['dead-eye-marshal'] },
    { archetypeId: 'spirit-walker', disciplineId: 'occultist', title: 'Doomcaller', tags: ['doomcaller'] },
    { archetypeId: 'spirit-walker', disciplineId: 'bounty-hunter', title: 'Ghost Tracker', tags: ['ghost-tracker'] },
    { archetypeId: 'lawkeeper', disciplineId: 'occultist', title: 'Witch Sheriff', tags: ['witch-sheriff'] },
    { archetypeId: 'lawkeeper', disciplineId: 'bounty-hunter', title: 'Iron Judge', tags: ['iron-judge'] },
  ],
  entanglements: [
    {
      id: 'spirit-walker-bounty-hunter',
      archetypeId: 'spirit-walker',
      disciplineId: 'bounty-hunter',
      description: 'Spirits distrust those who hunt the living — commune checks suffer',
      effects: [{ type: 'stat-modifier', stat: 'lore', amount: -1 }],
    },
  ],
};

// --- Item Catalog ---

export const itemCatalog: ItemCatalog = {
  items: [
    {
      id: 'six-shooter',
      name: 'Six-Shooter',
      description: 'A worn revolver, well-oiled and eager.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { 'draw-speed': 1 },
      grantedTags: ['armed'],
      grantedVerbs: ['shoot'],
    },
    {
      id: 'spirit-pouch',
      name: 'Spirit Pouch',
      description: 'A leather pouch of bone dust and sage.',
      slot: 'tool',
      rarity: 'common',
      statModifiers: { lore: 1 },
      grantedVerbs: ['commune'],
      grantedTags: ['spirit-touched'],
    },
    {
      id: 'duster-coat',
      name: 'Duster Coat',
      description: 'A long trail coat that turns dust and buckshot.',
      slot: 'armor',
      rarity: 'common',
      resourceModifiers: { resolve: 3 },
    },
    {
      id: 'silver-star',
      name: 'Silver Star Badge',
      description: 'A tarnished badge of frontier law.',
      slot: 'accessory',
      rarity: 'uncommon',
      grantedTags: ['badge-carrier'],
      statModifiers: { grit: 1 },
    },
    {
      id: 'bowie-knife',
      name: 'Bowie Knife',
      description: 'A heavy blade forged for the frontier.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { grit: 1 },
      grantedVerbs: ['slash'],
      grantedTags: ['armed'],
    },
    {
      id: 'rattlesnake-fang',
      name: 'Rattlesnake Fang Charm',
      description: 'A dried fang on a cord — wards off the Dust.',
      slot: 'trinket',
      rarity: 'uncommon',
      grantedTags: ['dust-warded'],
      resourceModifiers: { dust: -5 },
    },
    {
      id: 'hellfire-rounds',
      name: 'Hellfire Rounds',
      description: 'Bullets etched with sigils that burn what they hit.',
      slot: 'trinket',
      rarity: 'rare',
      statModifiers: { 'draw-speed': 1, lore: 1 },
      grantedTags: ['hex-armed'],
      requiredTags: ['spirit-sensitive'],
    },
    {
      // F-d70c722d: granted via a bespoke item-use effect (sageBundleEffect)
      // but had no itemCatalog entry — mirrors the healing-draught/antibiotics
      // fix (F-a7a22999/F-b34a5c82).
      id: 'sage-bundle',
      name: 'Sage Bundle',
      description: 'A bundle of dried sage, burned to clear the Dust from a troubled mind.',
      slot: 'tool',
      rarity: 'common',
    },
  ],
};
