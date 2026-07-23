// Black Flag Requiem — content definitions

import type { EntityState, ZoneState, GameManifest, ActionIntent, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import type { DialogueDefinition, ProgressionTreeDefinition, AbilityDefinition, StatusDefinition, QuestDefinition } from '@ai-rpg-engine/content-schema';
import type { DistrictDefinition, EncounterDefinition, BossDefinition, CurrencyReward, EncounterSpawnContent } from '@ai-rpg-engine/modules';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';

// --- Manifest ---

export const manifest: GameManifest = {
  id: 'black-flag-requiem',
  title: 'Black Flag Requiem',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'pirate-minimal',
  modules: [
    'traversal-core',
    'status-core',
    'combat-core',
    'inventory-core',
    'dialogue-core',
  ],
  contentPacks: ['black-flag-requiem'],
};

// --- Player ---

export const player: EntityState = {
  id: 'captain',
  blueprintId: 'captain',
  type: 'player',
  name: 'Captain',
  tags: ['player', 'pirate', 'captain'],
  stats: { brawn: 5, cunning: 6, 'sea-legs': 5 },
  // F-92c78519: a small starting coin purse — trade-core's `sell`/`buy`
  // verbs (always registered via buildWorldStack) read/write this resource
  // directly; without a seed the captain starts a working economy at 0.
  resources: { hp: 20, maxHp: 20, stamina: 5, morale: 15, coin: 30 },
  statuses: [],
  // F-86b9145d: the armory issues the corsair's cutlass to the authored
  // player too, so the equip loop is reachable without character creation
  // (created corsair characters carry it via the archetype's startingInventory).
  inventory: ['cutlass'],
  zoneId: 'ship-deck',
};

// --- NPCs ---

export const quartermaster: EntityState = {
  id: 'quartermaster_bly',
  blueprintId: 'quartermaster',
  type: 'npc',
  name: 'Quartermaster Bly',
  // F-a56f7e5d: recruitable + a bare CompanionRole tag ('fighter') — the
  // vocabulary companion-core's deriveCompanionRole/recruit verb already read.
  tags: ['npc', 'pirate', 'crew', 'male', 'recruitable', 'fighter'],
  stats: { brawn: 4, cunning: 5, 'sea-legs': 6 },
  // maxHp/maxStamina (F-4b9c5aee): a recruitable companion needs the same
  // resources shape enemies carry — entityHpRatio/regen both read the max
  // fields, and without them the entity always reads as full HP regardless
  // of true damage taken.
  resources: { hp: 16, maxHp: 16, stamina: 4, maxStamina: 4, morale: 12 },
  statuses: [],
  zoneId: 'ship-deck',
  custom: {
    companionRole: 'fighter',
    companionAbilities: 'boarding-assault,crew-discipline',
    personalGoal: 'Earn enough plunder to captain his own ship',
  },
};

export const cartographer: EntityState = {
  id: 'cartographer_mara',
  blueprintId: 'cartographer',
  type: 'npc',
  name: 'Mara the Cartographer',
  // F-a56f7e5d: recruitable + a bare CompanionRole tag ('scout') — her charts
  // and shrine lore are exactly a scout's stock in trade.
  tags: ['npc', 'neutral', 'knowledge', 'female', 'recruitable', 'scout'],
  stats: { brawn: 2, cunning: 7, 'sea-legs': 4 },
  // maxHp/maxStamina (F-4b9c5aee) — see Quartermaster Bly's comment above.
  resources: { hp: 8, maxHp: 8, stamina: 2, maxStamina: 2, morale: 10 },
  statuses: [],
  zoneId: 'port-tavern',
  custom: {
    companionRole: 'scout',
    companionAbilities: 'reef-navigation,shrine-lore',
    personalGoal: 'Chart the Sunken Shrine before the Navy does',
  },
};

export const governor: EntityState = {
  id: 'governor_vane',
  blueprintId: 'governor',
  type: 'npc',
  name: 'Governor Vane',
  // 'named' (V3R-NPC-2, v3.0 Living NPCs remediation): the colonial
  // authority the player answers to — a notable, non-recruitable story NPC.
  // Makes him live in npc-agency's social/PEOPLE layer without an `ai`
  // block, which would wrongly make him a combatant.
  tags: ['npc', 'colonial', 'authority', 'male', 'named'],
  stats: { brawn: 3, cunning: 6, 'sea-legs': 2 },
  resources: { hp: 10, stamina: 2, morale: 18 },
  statuses: [],
  zoneId: 'governors-fort',
};

// --- Enemies ---

export const navySailor: EntityState = {
  id: 'navy_sailor',
  blueprintId: 'navy-sailor',
  type: 'enemy',
  name: 'Navy Sailor',
  tags: ['enemy', 'colonial', 'navy', 'male', 'role:brute'],
  stats: { brawn: 5, cunning: 3, 'sea-legs': 4 },
  resources: { hp: 16, stamina: 5, morale: 14 },
  statuses: [],
  zoneId: 'governors-fort',
  ai: {
    profileId: 'aggressive',
    goals: ['enforce-law', 'protect-governor'],
    fears: ['mutiny'],
    alertLevel: 0,
    knowledge: {},
  },
};

export const seaBeast: EntityState = {
  id: 'drowned_guardian',
  blueprintId: 'sea-beast',
  type: 'enemy',
  name: 'Drowned Guardian',
  tags: ['enemy', 'cursed', 'creature', 'aquatic', 'role:boss'],
  stats: { brawn: 7, cunning: 2, 'sea-legs': 8 },
  resources: { hp: 22, maxHp: 22, stamina: 6, maxStamina: 6, morale: 30 },
  statuses: [],
  zoneId: 'sunken-shrine',
  resistances: { fear: 'immune' },
  ai: {
    profileId: 'territorial',
    goals: ['guard-shrine', 'destroy-trespassers'],
    fears: [],
    alertLevel: 0,
    knowledge: {},
  },
};

export const boardingMarine: EntityState = {
  id: 'boarding_marine',
  blueprintId: 'boarding-marine',
  type: 'enemy',
  name: 'Boarding Marine',
  tags: ['enemy', 'colonial', 'navy', 'role:skirmisher'],
  stats: { brawn: 4, cunning: 5, 'sea-legs': 5 },
  resources: { hp: 12, stamina: 5, morale: 12 },
  statuses: [],
  zoneId: 'ship-deck',
  resistances: { blind: 'resistant' },
  ai: {
    profileId: 'aggressive',
    goals: ['board-enemy-ships', 'enforce-law'],
    fears: ['outnumbered'],
    alertLevel: 0,
    knowledge: {},
  },
};

// --- Boss Definition ---

export const drownedGuardianBoss: BossDefinition = {
  entityId: 'drowned_guardian',
  phases: [
    {
      hpThreshold: 0.5,
      narrativeKey: 'rising-tide',
      addTags: ['enraged', 'tidal-surge'],
    },
    {
      hpThreshold: 0.2,
      narrativeKey: 'abyssal-fury',
      addTags: ['desperate', 'abyssal'],
      removeTags: ['enraged'],
    },
  ],
  immovable: true,
};

// --- Encounters ---

export const portPatrol: EncounterDefinition = {
  id: 'port-patrol',
  name: 'Port Patrol',
  participants: [
    { entityId: 'navy_sailor', role: 'brute' },
    { entityId: 'boarding_marine', role: 'skirmisher' },
  ],
  composition: 'patrol',
  validZoneIds: ['ship-deck', 'governors-fort'],
  narrativeHooks: { tone: 'tense', trigger: 'The navy patrol tightens its grip on the port.', stakes: 'Discovery means the noose.' },
};

export const openWaterAmbush: EncounterDefinition = {
  id: 'open-water-ambush',
  name: 'Open Water Ambush',
  participants: [
    { entityId: 'boarding_marine', role: 'skirmisher' },
    { entityId: 'boarding_marine', role: 'skirmisher' },
  ],
  composition: 'ambush',
  validZoneIds: ['open-water'],
  narrativeHooks: { tone: 'urgent', trigger: 'Sails on the horizon — navy colors.', stakes: 'Outrun them or face boarding.' },
};

export const shrineGuardian: EncounterDefinition = {
  id: 'shrine-guardian',
  name: 'Shrine Guardian',
  participants: [
    { entityId: 'drowned_guardian', role: 'boss' },
    { entityId: 'navy_sailor', role: 'brute' },
  ],
  composition: 'boss-fight',
  validZoneIds: ['sunken-shrine'],
  narrativeHooks: { tone: 'dread', trigger: 'The shrine groans with ancient fury.', stakes: 'Treasure or a watery grave.' },
};


// --- Encounter spawn wiring (F-ENG005-encounter-spawn-wiring) ---
//
// Per-zone encounter tables — the moral equivalent of content-schema's
// ZoneDefinition.encounterTable (string[]; weight is repetition).
// Marines board on the open water, the governor's fort walks its rounds,
// and now and then the navy comes to your own deck. The shrine guardian is
// the placed set-piece — boss fights never enter random tables.

export const encounterSpawnContent = {
  encounters: [portPatrol, openWaterAmbush, shrineGuardian],
  entityTemplates: [navySailor, boardingMarine],
  zoneTables: {
    'open-water': ['open-water-ambush', 'open-water-ambush'],
    'governors-fort': ['port-patrol', 'port-patrol'],
    'ship-deck': ['port-patrol'],
  },
} satisfies EncounterSpawnContent;

// --- Zones ---

export const zones: ZoneState[] = [
  {
    id: 'ship-deck',
    roomId: 'ship',
    name: 'Ship Deck',
    tags: ['outdoor', 'ship', 'home-base'],
    neighbors: ['port-tavern', 'open-water'],
    light: 5,
    interactables: ['helm', 'cannons', 'cargo-hold'],
  },
  {
    id: 'port-tavern',
    roomId: 'port-haven',
    name: 'The Rusty Anchor',
    tags: ['indoor', 'social', 'tavern', 'neutral'],
    neighbors: ['ship-deck', 'governors-fort'],
    light: 3,
    noise: 6,
    interactables: ['notice-board', 'barkeep', 'rum-barrel'],
  },
  {
    id: 'governors-fort',
    roomId: 'port-haven',
    name: "Governor's Fort",
    tags: ['outdoor', 'fortified', 'colonial', 'hostile'],
    neighbors: ['port-tavern', 'open-water'],
    light: 5,
    stability: 8,
    interactables: ['gate', 'stockade', 'treasury-door'],
  },
  {
    id: 'open-water',
    roomId: 'archipelago',
    name: 'Open Water',
    tags: ['outdoor', 'sea', 'travel', 'weather'],
    neighbors: ['ship-deck', 'governors-fort', 'sunken-shrine'],
    light: 6,
    hazards: ['storm-surge'],
  },
  {
    id: 'sunken-shrine',
    roomId: 'archipelago',
    name: 'Sunken Shrine',
    tags: ['outdoor', 'cursed', 'dark', 'underwater'],
    neighbors: ['open-water'],
    light: 1,
    stability: 2,
    hazards: ['drowning-pressure', 'curse-whisper'],
    interactables: ['barnacle-altar', 'treasure-chest', 'coral-idol'],
  },
];

// --- Dialogue ---

export const cartographerDialogue: DialogueDefinition = {
  id: 'cartographer-maps',
  // Must be the entity id (not the display name) — dialogue-core's
  // speakHandler auto-discovers a dialogue via `speakers.includes(targetId)`
  // using the real entity id when no explicit dialogueId is passed.
  speakers: ['cartographer_mara'],
  entryNodeId: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Mara the Cartographer',
      text: "Captain. I've charted the reef line south of here. There's a shrine beneath the waves — old as the islands themselves. The governor wants it sealed. I want to know why.",
      choices: [
        {
          id: 'buy-map',
          text: "What's the price for the chart?",
          nextNodeId: 'price',
        },
        {
          id: 'ask-shrine',
          text: 'What do you know about the shrine?',
          nextNodeId: 'shrine-lore',
        },
      ],
    },
    price: {
      id: 'price',
      speaker: 'Mara the Cartographer',
      text: "Not coin. Bring me something from the shrine — proof it's real. Do that, and the chart is yours forever.",
      choices: [
        {
          id: 'accept-deal',
          text: "You've got a deal.",
          nextNodeId: 'end',
          effects: [
            { type: 'set-global', target: 'actor', params: { key: 'shrine-deal', value: true } },
          ],
        },
      ],
    },
    'shrine-lore': {
      id: 'shrine-lore',
      speaker: 'Mara the Cartographer',
      text: 'Sailors say a drowned fleet guards it. Some say the treasure is cursed. I say curses are just stories that keep cowards ashore.',
      choices: [
        { id: 'to-price', text: 'About that chart...', nextNodeId: 'price' },
        { id: 'leave', text: 'I will think on it.', nextNodeId: 'end' },
      ],
    },
    end: {
      id: 'end',
      speaker: 'Mara the Cartographer',
      text: "Fair winds, Captain. Don't trust the governor's men near open water.",
    },
  },
};

// --- Quests (F-ENG005-quest-loop-min / F-c07d6024) ---
//
// Two authored QuestDefinitions — the explicit reason to leave port. Wired
// via buildWorldStack's `quests` config in setup.ts; quest-core validates at
// construction (fail loud) and drives offer -> track -> complete -> reward
// off the live event stream. Both are completable inside a normal session
// with the shipped world alone: the notice board points to open water, navy
// patrols spawn there and at the governor's fort, and the drowned guardian
// stands fixed watch over the sunken shrine.

export const chartTheOpenWaterQuest: QuestDefinition = {
  id: 'chart-the-open-water',
  name: 'Chart the Open Water',
  // Offered the moment the captain steps into the tavern — the notice board
  // is the first hint there is more to this port than rum.
  triggers: [
    {
      event: 'world.zone.entered',
      condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'port-tavern' } },
      effect: { type: 'offer', params: {} },
    },
  ],
  stages: [
    {
      id: 'reach-open-water',
      name: 'Reach Open Water',
      description: 'The notice board points past the harbor mouth',
      objectives: ['Reach Open Water'],
      triggers: [
        {
          event: 'world.zone.entered',
          condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'open-water' } },
          effect: { type: 'advance', params: {} },
        },
      ],
      nextStage: 'break-the-patrol',
    },
    {
      id: 'break-the-patrol',
      name: 'Break the Patrol',
      description: 'Navy colors on the horizon — they will not let a pirate sail quietly',
      objectives: ['Defeat one colonial patroller'],
      triggers: [
        {
          event: 'combat.entity.defeated',
          condition: { type: 'payload-entity-has-tag', params: { tag: 'colonial' } },
          effect: { type: 'advance', params: {} },
        },
      ],
    },
  ],
  rewards: [{ type: 'xp', params: { amount: 20 } }],
};

export const sunkenShrineQuest: QuestDefinition = {
  id: 'the-sunken-shrine',
  name: 'The Sunken Shrine',
  // Offered on setting foot in the shrine itself — the guardian's ground.
  triggers: [
    {
      event: 'world.zone.entered',
      condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'sunken-shrine' } },
      effect: { type: 'offer', params: {} },
    },
  ],
  stages: [
    {
      id: 'slay-the-guardian',
      name: 'Slay the Guardian',
      description: 'The Drowned Guardian stands between you and the treasure',
      objectives: ['Destroy the Drowned Guardian'],
      triggers: [
        {
          event: 'combat.entity.defeated',
          condition: { type: 'payload-equals', params: { key: 'entityId', value: 'drowned_guardian' } },
          effect: { type: 'advance', params: {} },
        },
      ],
    },
  ],
  rewards: [
    { type: 'xp', params: { amount: 30 } },
    { type: 'item', params: { itemId: 'kraken-tooth' } },
  ],
};

export const pirateQuests: QuestDefinition[] = [chartTheOpenWaterQuest, sunkenShrineQuest];

// --- Districts ---

export const districts: DistrictDefinition[] = [
  {
    id: 'port-haven',
    name: 'Port Haven',
    zoneIds: ['port-tavern', 'governors-fort'],
    tags: ['colonial', 'trade'],
    controllingFaction: 'colonial-navy',
  },
  {
    id: 'cursed-waters',
    name: 'Cursed Waters',
    zoneIds: ['open-water', 'sunken-shrine'],
    tags: ['sea', 'cursed', 'dangerous'],
  },
];

// --- Progression ---

export const seamanshipTree: ProgressionTreeDefinition = {
  id: 'seamanship',
  name: 'Seamanship',
  currency: 'xp',
  nodes: [
    {
      id: 'sea-hardened',
      name: 'Sea-Hardened',
      cost: 10,
      effects: [
        { type: 'resource-boost', params: { resource: 'hp', amount: 5 } },
        { type: 'stat-boost', params: { stat: 'sea-legs', amount: 1 } },
      ],
    },
    {
      id: 'ruthless',
      name: 'Ruthless',
      cost: 15,
      effects: [
        { type: 'stat-boost', params: { stat: 'brawn', amount: 1 } },
        { type: 'grant-tag', params: { tag: 'feared' } },
      ],
    },
    {
      id: 'dread-captain',
      name: 'Dread Captain',
      cost: 25,
      requires: ['sea-hardened', 'ruthless'],
      effects: [
        { type: 'resource-boost', params: { resource: 'morale', amount: 10 } },
        { type: 'stat-boost', params: { stat: 'cunning', amount: 2 } },
      ],
    },
  ],
};

// --- Item Effect ---

export const rumBarrelEffect = {
  itemId: 'rum-barrel',
  use: (action: ActionIntent, world: WorldState): ResolvedEvent[] => {
    const actor = world.entities[action.actorId];
    if (!actor) return [];

    const previous = actor.resources.morale ?? 0;
    actor.resources.morale = Math.min(30, previous + 8);

    return [{
      id: '',
      tick: action.issuedAtTick,
      type: 'resource.changed',
      actorId: action.actorId,
      payload: {
        entityId: actor.id,
        resource: 'morale',
        previous,
        current: actor.resources.morale,
        delta: actor.resources.morale - previous,
      },
    }];
  },
};

// --- Progression Rewards (T0-progression-ceiling) ---
//
// Kills alone cannot complete the captain tree: 3 enemies x 12 = 36 XP vs a 50 XP tree. Max earnable: 36 + 5 (cartographer parley) + 10 (5 zones x 2) + 10 (guardian bounty) = 61 >= 50.
// Non-combat sources: a completed parley with the cartographer, charting every cove of the isle, and the drowned guardian's bounty.
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
      e.payload.entityId === 'drowned_guardian' ? 'boss:drowned_guardian' : undefined),
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

export const broadside: AbilityDefinition = {
  id: 'broadside',
  name: 'Broadside',
  verb: 'use-ability',
  tags: ['naval', 'combat', 'damage', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 4 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'cunning', difficulty: 8, onFail: 'half-damage' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 4, damageType: 'cannon' } },
    { type: 'resource-modify', target: 'actor', params: { resource: 'morale', amount: 3 } },
  ],
  cooldown: 4,
  requirements: [{ type: 'has-tag', params: { tag: 'pirate' } }],
  ui: {
    text: 'Order the cannons to fire! Every gun bears on the enemy.',
    hitText: 'Thunder and splinter! The broadside tears through!',
    missText: 'The shots go wide — the sea claims the cannonballs.',
    soundCue: 'ability.broadside',
  },
};

export const dirtyFighting: AbilityDefinition = {
  id: 'dirty-fighting',
  name: 'Dirty Fighting',
  verb: 'use-ability',
  tags: ['combat', 'damage', 'debuff'],
  costs: [{ resourceId: 'stamina', amount: 2 }],
  target: { type: 'single' },
  checks: [{ stat: 'cunning', difficulty: 6, onFail: 'half-damage' }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 4, damageType: 'melee' } },
    { type: 'apply-status', target: 'target', params: { statusId: 'blinded', duration: 2, stacking: 'replace' } },
  ],
  cooldown: 2,
  requirements: [{ type: 'has-tag', params: { tag: 'pirate' } }],
  ui: {
    text: 'Sand in the eyes, a kick to the shin — pirates fight to win.',
    hitText: 'A handful of grit finds its mark. They stagger, blinded.',
    missText: 'They see it coming and duck aside.',
    soundCue: 'ability.dirty-fighting',
  },
};

export const seaShanty: AbilityDefinition = {
  id: 'sea-shanty',
  name: 'Sea Shanty',
  verb: 'use-ability',
  tags: ['support', 'buff', 'morale'],
  costs: [
    { resourceId: 'stamina', amount: 2 },
    { resourceId: 'morale', amount: 5 },
  ],
  target: { type: 'self' },
  checks: [{ stat: 'sea-legs', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'heal', target: 'actor', params: { amount: 4, resource: 'hp' } },
    { type: 'stat-modify', target: 'actor', params: { stat: 'brawn', amount: 1 } },
    { type: 'stat-modify', target: 'actor', params: { stat: 'sea-legs', amount: 1 } },
  ],
  cooldown: 4,
  ui: {
    text: 'Belt out a working song — the crew finds their rhythm.',
    hitText: 'The shanty rings out! Hearts lift, arms find new strength.',
    missText: 'The words catch in your throat. The crew looks away.',
    soundCue: 'ability.sea-shanty',
  },
};

export const rumCourage: AbilityDefinition = {
  id: 'rum-courage',
  name: 'Rum Courage',
  verb: 'use-ability',
  tags: ['support', 'cleanse', 'morale'],
  costs: [
    { resourceId: 'stamina', amount: 2 },
    { resourceId: 'morale', amount: 5 },
  ],
  target: { type: 'self' },
  checks: [{ stat: 'sea-legs', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'remove-status-by-tag', target: 'actor', params: { tags: 'fear,blind' } },
  ],
  cooldown: 4,
  requirements: [{ type: 'has-tag', params: { tag: 'pirate' } }],
  ui: {
    text: 'Take a pull from the flask — liquid courage against the dark.',
    hitText: 'The rum burns away the fear. Eyes clear, hands steady.',
    missText: 'The rum hits wrong — you choke and sputter.',
    soundCue: 'ability.rum-courage',
  },
};

export const pirateAbilities: AbilityDefinition[] = [broadside, dirtyFighting, seaShanty, rumCourage];

// --- Status Definitions ---

export const pirateStatusDefinitions: StatusDefinition[] = [
  {
    id: 'blinded',
    name: 'Blinded',
    tags: ['blind', 'debuff'],
    stacking: 'replace',
    duration: { type: 'ticks', value: 2 },
    ui: { icon: '🏴‍☠️', color: '#2c3e50', description: 'Sand in the eyes — can\'t see a thing' },
  },
];

// --- Pack Metadata ---

export const packMeta: PackMetadata = {
  id: 'black-flag-requiem',
  name: 'Black Flag Requiem',
  tagline: 'Your ship is your kingdom, and beneath the waves the drowned dead wait.',
  genres: ['pirate'],
  difficulty: 'intermediate',
  tones: ['gritty', 'atmospheric'],
  tags: ['naval', 'treasure', 'cursed', 'exploration'],
  engineVersion: '2.0.0',
  version: '2.0.0',
  description: 'Captain a pirate vessel through port towns and cursed waters. Strike deals, fight the navy, and brave a sunken shrine.',
  narratorTone: 'pirate adventure, salty, atmospheric, treacherous',
};

// --- Build Catalog ---

export const buildCatalog: BuildCatalog = {
  packId: 'black-flag-requiem',
  statBudget: 3,
  maxTraits: 3,
  requiredFlaws: 1,
  archetypes: [
    {
      id: 'corsair',
      name: 'Corsair',
      description: 'Boarding specialist, fear incarnate',
      statPriorities: { brawn: 7, cunning: 4, 'sea-legs': 3 },
      // 'pirate' is the pack-identity tag every ability requirement gates on
      // (T0-tag-gate: a created character without it hides gated abilities).
      startingTags: ['pirate', 'raider', 'corsair'],
      // F-86b9145d: cutlass carries no requiredTags (any archetype could
      // equip it), but the boarding specialist is the one who canonically
      // starts with it in hand.
      startingInventory: ['cutlass'],
      progressionTreeId: 'seamanship',
    },
    {
      id: 'privateer',
      name: 'Privateer',
      description: 'Schemer with a letter of marque',
      statPriorities: { brawn: 3, cunning: 7, 'sea-legs': 4 },
      startingTags: ['pirate', 'schemer', 'privateer'],
      progressionTreeId: 'seamanship',
    },
    {
      id: 'helmsman',
      name: 'Helmsman',
      description: 'Born on the waves, reads the wind',
      statPriorities: { brawn: 4, cunning: 3, 'sea-legs': 7 },
      startingTags: ['pirate', 'sailor', 'helmsman'],
      progressionTreeId: 'seamanship',
    },
  ],
  backgrounds: [
    {
      id: 'navy-deserter',
      name: 'Navy Deserter',
      description: 'Trained by the Crown, then betrayed it',
      statModifiers: { brawn: 1, cunning: -1 },
      startingTags: ['deserter'],
    },
    {
      id: 'merchants-son',
      name: "Merchant's Son",
      description: 'Knows the price of everything and the value of nothing',
      statModifiers: { cunning: 1, brawn: -1 },
      startingTags: ['merchant-blood'],
    },
    {
      id: 'island-born',
      name: 'Island Born',
      description: 'Salt in the blood from birth',
      statModifiers: { 'sea-legs': 1 },
      startingTags: ['islander'],
    },
  ],
  traits: [
    {
      id: 'sea-devil',
      name: 'Sea Devil',
      description: 'The crew trusts you in any storm',
      category: 'perk',
      effects: [{ type: 'resource-modifier', resource: 'morale', amount: 3 }],
    },
    {
      id: 'cutthroat',
      name: 'Cutthroat',
      description: 'A reputation that enters the room before you do',
      category: 'perk',
      effects: [
        { type: 'stat-modifier', stat: 'brawn', amount: 1 },
        { type: 'grant-tag', tag: 'feared' },
      ],
    },
    {
      id: 'superstitious',
      name: 'Superstitious',
      description: 'Sees omens in every wave and gull',
      category: 'flaw',
      effects: [
        { type: 'stat-modifier', stat: 'cunning', amount: -1 },
        { type: 'grant-tag', tag: 'superstitious' },
      ],
    },
    {
      id: 'landlubber',
      name: 'Landlubber',
      description: 'Still gets seasick in calm waters',
      category: 'flaw',
      effects: [{ type: 'stat-modifier', stat: 'sea-legs', amount: -1 }],
      incompatibleWith: ['sea-devil'],
    },
  ],
  disciplines: [
    {
      id: 'occultist',
      name: 'Occultist',
      description: 'Communes with drowned spirits and cursed relics',
      grantedVerb: 'commune',
      passive: { type: 'stat-modifier', stat: 'cunning', amount: 1 },
      drawback: { type: 'resource-modifier', resource: 'morale', amount: -2 },
    },
    {
      id: 'surgeon',
      name: 'Surgeon',
      description: 'Ship sawbones, keeps the crew breathing',
      grantedVerb: 'scan',
      passive: { type: 'stat-modifier', stat: 'sea-legs', amount: 1 },
      drawback: { type: 'stat-modifier', stat: 'brawn', amount: -1 },
    },
  ],
  crossTitles: [
    { archetypeId: 'corsair', disciplineId: 'occultist', title: 'Storm Gunner', tags: ['storm-gunner'] },
    { archetypeId: 'corsair', disciplineId: 'surgeon', title: 'Sawbones Raider', tags: ['sawbones-raider'] },
    { archetypeId: 'privateer', disciplineId: 'occultist', title: 'Hex Broker', tags: ['hex-broker'] },
    { archetypeId: 'privateer', disciplineId: 'surgeon', title: 'Plague Merchant', tags: ['plague-merchant'] },
    { archetypeId: 'helmsman', disciplineId: 'occultist', title: 'Tide Caller', tags: ['tide-caller'] },
    { archetypeId: 'helmsman', disciplineId: 'surgeon', title: 'Salvage Prophet', tags: ['salvage-prophet'] },
  ],
  entanglements: [
    {
      id: 'corsair-surgeon',
      archetypeId: 'corsair',
      disciplineId: 'surgeon',
      description: 'A raider who heals draws suspicion from the crew — mercy is weakness at sea',
      effects: [{ type: 'resource-modifier', resource: 'morale', amount: -2 }],
    },
  ],
};

// --- Item Catalog ---

export const itemCatalog: ItemCatalog = {
  items: [
    {
      id: 'cutlass',
      name: 'Cutlass',
      description: 'A curved blade, balanced for boarding actions.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { brawn: 1 },
      grantedTags: ['armed'],
      grantedVerbs: ['slash'],
    },
    {
      id: 'spyglass',
      name: 'Spyglass',
      description: 'A brass telescope for spotting sails on the horizon.',
      slot: 'tool',
      rarity: 'common',
      statModifiers: { cunning: 1 },
      grantedVerbs: ['scout'],
    },
    {
      id: 'sea-leather',
      name: 'Sea Leather Coat',
      description: 'Salt-hardened leather that turns blades and rain alike.',
      slot: 'armor',
      rarity: 'common',
      resourceModifiers: { morale: 3 },
    },
    {
      id: 'compass-charm',
      name: 'Compass Charm',
      description: 'A lodestone pendant said to guide the lost home.',
      slot: 'trinket',
      rarity: 'uncommon',
      statModifiers: { 'sea-legs': 1 },
      grantedTags: ['navigation'],
    },
    {
      id: 'flintlock-pistol',
      name: 'Flintlock Pistol',
      description: 'One shot — make it count.',
      slot: 'weapon',
      rarity: 'uncommon',
      statModifiers: { cunning: 1 },
      grantedVerbs: ['shoot'],
      grantedTags: ['armed'],
    },
    {
      id: 'captains-signet',
      name: "Captain's Signet",
      description: 'A heavy ring bearing the mark of a lost captain.',
      slot: 'accessory',
      rarity: 'uncommon',
      grantedTags: ['captain-authority'],
      statModifiers: { brawn: 1 },
    },
    {
      id: 'kraken-tooth',
      name: 'Kraken Tooth Dagger',
      description: 'A jagged blade carved from a sea beast\'s fang.',
      slot: 'weapon',
      rarity: 'rare',
      statModifiers: { brawn: 2, 'sea-legs': 1 },
      grantedTags: ['armed', 'sea-blessed'],
      grantedVerbs: ['rend'],
    },
    {
      // F-d70c722d: granted via a bespoke item-use effect (rumBarrelEffect)
      // but had no itemCatalog entry — mirrors the healing-draught/antibiotics
      // fix (F-a7a22999/F-b34a5c82).
      id: 'rum-barrel',
      name: 'Rum Barrel',
      description: 'A tapped barrel of dark rum, passed hand to hand belowdecks.',
      slot: 'tool',
      rarity: 'common',
    },
  ],
};
