// Hue and Cry — thief-taker starter content
// 7 zones, 4 NPCs, 3 hostiles, 1 boss, 3 districts, 2 dialogues, 3 quests
//
// You are a THIEF-TAKER. There is no police force. There is a bounty office
// that pays by the head, an underworld that pays for silence and stolen plate,
// and one man — Jonathan Quill, who calls himself Thief-Taker General — who
// discovered you can run both at once. He is the boss of this pack and he is
// not a monster; he is you, four years further down the same road.
//
// AUTHORED BACKWARDS FROM THREE SYSTEMS, in this order:
//
//  1. OPPORTUNITIES. The bounty board is the core loop, so the content is
//     shaped to make the SPAWN RULES fire on their own terms rather than
//     hoping. Clerk Hesper is authored allied-and-greedy because that is the
//     only shape `evaluateNpcGoalOpportunities` will offer a `contract` from
//     (POR-1's finding). The Rookery is authored poor and unstable because
//     that is what `evaluateDistrictOpportunities` reads. Sergeant Pike is
//     recruitable because `escort` and the companion `favor-request` both need
//     somebody in the party.
//  2. THE PURSUIT DOCTRINE (RG-4). Named hunters with recorded history; a
//     legible three-state pursuit surface; deterministic numbers, shown.
//  3. THE SINKS. Every one of the eight consequences v3.8 built has authored
//     content here that produces it, because a sink with nothing to record is
//     the same gap one level along.

import type { EntityState, ZoneState, GameManifest, ResolvedEvent, ActionIntent, WorldState } from '@ai-rpg-engine/core';
import type { DialogueDefinition, ProgressionTreeDefinition, AbilityDefinition, StatusDefinition, QuestDefinition } from '@ai-rpg-engine/content-schema';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import type { DistrictDefinition, EncounterDefinition, BossDefinition, CurrencyReward } from '@ai-rpg-engine/modules';

export const manifest: GameManifest = {
  id: 'hue-and-cry',
  title: 'Hue and Cry',
  version: '0.1.0',
  engineVersion: '>=3.8.0 <4.0.0',
  ruleset: 'bounty-hunter-minimal',
  modules: ['traversal-core', 'status-core', 'combat-core', 'inventory-core', 'dialogue-core'],
  contentPacks: ['hue-and-cry'],
};

// --- Player ---

export const player: EntityState = {
  id: 'thief-taker',
  blueprintId: 'thief-taker',
  type: 'player',
  name: 'Thief-Taker',
  // 'thief-taker' is the pack-identity tag every ability requirement gates on
  // (T0-tag-gate: a created character without it hides gated abilities).
  tags: ['player', 'thief-taker', 'sworn'],
  stats: { grip: 7, nose: 7, authority: 5 },
  // 40 warrant is four collars' worth of legal cover before you must testify,
  // which is the pack's opening question stated as a number: you can take four
  // people on the office's credit before you have to decide whether you are
  // the office's man.
  resources: {
    hp: 20, maxHp: 20, stamina: 14, maxStamina: 14,
    coin: 25, warrant: 40, infamy: 20,
  },
  statuses: [],
  inventory: ['iron-darbies', 'bill-of-hue', 'cordial-flask'],
  zoneId: 'bounty-office',
};

// --- NPCs ---

export const clerkHesper: EntityState = {
  id: 'clerk-hesper',
  blueprintId: 'clerk-hesper',
  type: 'npc',
  name: 'Clerk Hesper',
  tags: ['npc', 'named', 'office', 'lawful'],
  stats: { grip: 3, nose: 12, authority: 9 },
  resources: { hp: 10, maxHp: 10, stamina: 4, maxStamina: 4 },
  statuses: [],
  zoneId: 'bounty-office',
  // ALLIED AND GREEDY, and both numbers are load-bearing rather than flavour.
  // `evaluateNpcGoalOpportunities` will only offer a `contract` from an NPC who
  // is BOTH allied (trust >= 60, faction loyalty >= 50) AND carrying a
  // `bargain` goal (greed > 60) — and those read like alternatives but are not:
  // `favorable` requires greed < 50, so allied-and-greedy is the ONLY shape
  // that reaches the kind at all. starter-merchant learned this the expensive
  // way in v3.7 (see POR-1); the twelfth pack is authored knowing it.
  //
  // 66 and 70 sit just over their gates on purpose. Hesper is not your friend.
  // He keeps the board, he takes a cut of every ticket he hands you, and he
  // would hand your name to Quill for the right consideration.
  relations: { 'player-trust': 66 },
  custom: {
    personalGoal: 'Keep the board full and the ledger balanced, in that order',
    disposition: 'transactional',
    greed: 70,
  },
};

export const motherSlack: EntityState = {
  id: 'mother-slack',
  blueprintId: 'mother-slack',
  type: 'npc',
  name: 'Mother Slack',
  // 'fence' is not decoration — pursuit-core's `fence` handler requires a
  // co-located entity carrying this tag. The verb needs a PERSON, which is
  // the difference between a crooked market and a shop menu.
  tags: ['npc', 'named', 'fence', 'unbonded', 'rookery'],
  stats: { grip: 4, nose: 11, authority: 3 },
  resources: { hp: 12, maxHp: 12, stamina: 4, maxStamina: 4 },
  statuses: [],
  zoneId: 'flash-house',
  // Openly hostile to the office, warm to anyone who has made themselves
  // useful down here. Negative stored trust is the OTHER direction of the v3.8
  // npc-relationship sink: fence enough and this number climbs on its own.
  relations: { 'player-trust': -20 },
  custom: {
    personalGoal: 'Outlive every man who has ever tried to run this ward',
    disposition: 'watchful',
    greed: 55,
  },
};

export const sergeantPike: EntityState = {
  id: 'sergeant-pike',
  blueprintId: 'sergeant-pike',
  type: 'npc',
  name: 'Sergeant Pike',
  // 'recruitable' is the gate companion-core's isCompanionRecruitable reads;
  // 'guard' is the bare CompanionRole tag deriveCompanionRole falls back to.
  // Without a recruitable NPC the pack cannot reach `escort` or the companion
  // `favor-request` at all — two of the eight kinds, gone on an omission.
  tags: ['npc', 'named', 'recruitable', 'guard', 'watch'],
  stats: { grip: 10, nose: 5, authority: 7 },
  resources: { hp: 18, maxHp: 18, stamina: 8, maxStamina: 8 },
  statuses: [],
  zoneId: 'sessions-yard',
  relations: { 'player-trust': 30 },
  custom: {
    personalGoal: 'See one man hang who deserves it, before the parish retires him',
    disposition: 'dogged',
    greed: 20,
  },
};

export const theScrivener: EntityState = {
  id: 'the-scrivener',
  blueprintId: 'the-scrivener',
  type: 'npc',
  name: 'The Scrivener',
  tags: ['npc', 'named', 'shambles', 'informant'],
  stats: { grip: 2, nose: 14, authority: 4 },
  resources: { hp: 8, maxHp: 8, stamina: 3, maxStamina: 3 },
  statuses: [],
  zoneId: 'dead-wall',
  relations: { 'player-trust': 10 },
  custom: {
    personalGoal: 'Write down everything, and sell it exactly twice',
    disposition: 'incurious',
    greed: 64,
  },
};

/**
 * The one usable item, and it exists because PVR-1 caught its absence.
 *
 * The pack shipped its first build with `createInventoryCore([])` — an
 * advertised `use` verb with no item in the catalog that does anything, which
 * is EXACTLY the defect v3.6 found across starter-merchant's whole catalog and
 * the reason PVR-1 was written. Caught here by the gate rather than by a
 * player, on the twelfth pack's first run through the suite, which is what
 * "born conformant" is supposed to mean.
 *
 * Thematically it is the right object too: a thief-taker's flask is the thing
 * you drink AFTER the running, and it costs a little of the edge you need for
 * the next one.
 */
export const cordialFlaskEffect = {
  itemId: 'cordial-flask',
  use: (action: ActionIntent, world: WorldState): ResolvedEvent[] => {
    const actor = world.entities[action.actorId];
    if (!actor) return [];
    const previous = actor.resources.stamina ?? 0;
    const ceiling = actor.resources.maxStamina ?? previous;
    actor.resources.stamina = Math.min(ceiling, previous + 8);
    return [{
      id: '',
      tick: action.issuedAtTick,
      type: 'resource.changed',
      actorId: action.actorId,
      payload: {
        entityId: actor.id,
        resource: 'stamina',
        previous,
        current: actor.resources.stamina,
        delta: actor.resources.stamina - previous,
        drankFrom: 'cordial-flask',
      },
    }];
  },
};

// --- Hostiles ---

export const rookeryRunner: EntityState = {
  id: 'rookery-runner',
  blueprintId: 'rookery-runner',
  type: 'enemy',
  name: 'Rookery Runner',
  tags: ['enemy', 'thief', 'rookery', 'role:skirmisher'],
  stats: { grip: 5, nose: 8, authority: 1 },
  resources: { hp: 10, maxHp: 10, stamina: 6, maxStamina: 6 },
  statuses: [],
  zoneId: 'rookery',
  ai: { profileId: 'aggressive', goals: ['run'], fears: ['the darbies'], alertLevel: 30, knowledge: {} },
};

export const bludger: EntityState = {
  id: 'bludger',
  blueprintId: 'bludger',
  type: 'enemy',
  name: 'The Bludger',
  tags: ['enemy', 'thieves-company', 'role:brute'],
  stats: { grip: 12, nose: 3, authority: 4 },
  resources: { hp: 20, maxHp: 20, stamina: 7, maxStamina: 7 },
  statuses: [],
  zoneId: 'shambles',
  ai: { profileId: 'aggressive', goals: ['collect'], fears: [], alertLevel: 45, knowledge: {} },
};

export const nightman: EntityState = {
  id: 'nightman',
  blueprintId: 'nightman',
  type: 'enemy',
  name: 'The Nightman',
  tags: ['enemy', 'thieves-company', 'role:elite'],
  stats: { grip: 9, nose: 11, authority: 5 },
  resources: { hp: 16, maxHp: 16, stamina: 8, maxStamina: 8 },
  statuses: [],
  zoneId: 'flash-house',
  ai: { profileId: 'territorial', goals: ['hold the stair'], fears: ['the Sessions'], alertLevel: 50, knowledge: {} },
};

export const jonathanQuill: EntityState = {
  id: 'jonathan-quill',
  blueprintId: 'jonathan-quill',
  type: 'enemy',
  name: 'Jonathan Quill',
  // `role:boss` is the convention every shipped pack uses, and the one the
  // item-chronicle producer's boss-kill detection reads.
  tags: ['enemy', 'thieves-company', 'office', 'role:boss'],
  stats: { grip: 11, nose: 16, authority: 14 },
  resources: { hp: 30, maxHp: 30, stamina: 10, maxStamina: 10 },
  statuses: [],
  zoneId: 'tyburn-road',
  ai: { profileId: 'calculating', goals: ['keep both books'], fears: ['being known'], alertLevel: 65, knowledge: {} },
  custom: {
    personalGoal: 'Be the only man in this city who knows where everyone is',
    disposition: 'genial',
    greed: 80,
  },
};

/**
 * Quill does not get stronger as he loses. He gets more CANDID — which is the
 * fight's actual argument. Every phase strips a layer of the respectable
 * thief-taker off and leaves more of the man who runs both halves of the ward.
 */
export const jonathanQuillBoss: BossDefinition = {
  entityId: 'jonathan-quill',
  phases: [
    {
      hpThreshold: 0.75,
      narrativeKey: 'offers-you-a-partnership',
      addTags: ['recruiting'],
    },
    {
      hpThreshold: 0.5,
      narrativeKey: 'names-the-marks-he-sold-you',
      addTags: ['confessing'],
      removeTags: ['recruiting'],
    },
    {
      hpThreshold: 0.25,
      narrativeKey: 'calls-in-the-company',
      addTags: ['cornered'],
      removeTags: ['confessing'],
    },
  ],
};

// --- Encounters ---

export const rookerySweep: EncounterDefinition = {
  id: 'rookery-sweep',
  name: 'A Sweep Through the Rookery',
  participants: [
    { entityId: 'rookery-runner', role: 'skirmisher' },
    { entityId: 'rookery-runner', role: 'skirmisher' },
  ],
  composition: 'ambush',
  validZoneIds: ['rookery', 'flash-house'],
  narrativeHooks: {
    tone: 'wet brick, running feet, nobody who saw anything',
    trigger: 'Word went ahead of you, the way it always does down here.',
  },
};

export const shamblesCollection: EncounterDefinition = {
  id: 'shambles-collection',
  name: 'The Company Collects',
  participants: [
    { entityId: 'bludger', role: 'brute' },
  ],
  composition: 'ambush',
  validZoneIds: ['shambles', 'dead-wall'],
  narrativeHooks: {
    tone: 'a big man being polite in a crowded street',
    trigger: 'Somebody has decided you are working the wrong side of the ward.',
  },
};

export const encounterSpawnContent = {
  encounters: [rookerySweep, shamblesCollection],
  entityTemplates: [rookeryRunner, bludger],
  zoneTables: {
    rookery: ['rookery-sweep', 'rookery-sweep'],
    'flash-house': ['rookery-sweep'],
    shambles: ['shambles-collection'],
    'dead-wall': ['shambles-collection'],
  } as Record<string, string[]>,
};

// --- Zones ---

export const zones: ZoneState[] = [
  {
    id: 'bounty-office',
    roomId: 'the-ward',
    name: 'The Bounty Office',
    tags: ['interior', 'safe', 'home-base', 'lawful'],
    neighbors: ['sessions-yard', 'shambles'],
    light: 5,
    interactables: ['the board of hue', 'a rack of unclaimed tickets', "Hesper's ledger"],
  },
  {
    id: 'sessions-yard',
    roomId: 'the-ward',
    name: 'The Sessions Yard',
    tags: ['exterior', 'lawful', 'formal', 'crowded'],
    neighbors: ['bounty-office', 'dead-wall'],
    light: 5,
    interactables: ['the prisoners’ dock', 'a queue of witnesses', 'the day’s calendar'],
  },
  {
    id: 'shambles',
    roomId: 'the-shambles',
    name: 'The Shambles',
    tags: ['exterior', 'market', 'crowded', 'contested'],
    neighbors: ['bounty-office', 'dead-wall', 'rookery'],
    light: 4,
    interactables: ['butchers’ blocks', 'a press of bodies', 'somebody watching you back'],
  },
  {
    id: 'dead-wall',
    roomId: 'the-shambles',
    name: 'The Dead Wall',
    tags: ['exterior', 'contested', 'slow'],
    neighbors: ['sessions-yard', 'shambles'],
    light: 3,
    interactables: ['posted bills, layered six deep', 'a scrivener’s stool', 'names crossed out in a different hand'],
  },
  {
    id: 'rookery',
    roomId: 'the-rookery',
    name: 'The Rookery',
    tags: ['exterior', 'dark', 'contested', 'unbonded'],
    neighbors: ['shambles', 'flash-house'],
    light: 1,
    hazards: ['no-recourse'],
    interactables: ['a hole in a wall that is a door', 'washing strung between windows', 'three exits you cannot see'],
  },
  {
    id: 'flash-house',
    roomId: 'the-rookery',
    name: 'The Flash House',
    tags: ['interior', 'dark', 'unbonded', 'market'],
    neighbors: ['rookery', 'tyburn-road'],
    light: 2,
    hazards: ['no-recourse'],
    interactables: ['a long table of other people’s property', 'Mother Slack’s scales', 'a back stair'],
  },
  {
    id: 'tyburn-road',
    roomId: 'the-rookery',
    name: 'The Tyburn Road',
    tags: ['exterior', 'slow', 'contested'],
    neighbors: ['flash-house'],
    light: 3,
    interactables: ['the cart route', 'a crowd that comes for this', 'the tree at the end of it'],
  },
];

// --- Districts ---

export const districts: DistrictDefinition[] = [
  {
    id: 'the-ward',
    name: 'The Ward',
    zoneIds: ['bounty-office', 'sessions-yard'],
    tags: ['lawful', 'authority'],
    controllingFaction: 'bounty-office',
  },
  {
    id: 'the-shambles',
    name: 'The Shambles',
    zoneIds: ['shambles', 'dead-wall'],
    tags: ['market', 'contested'],
    controllingFaction: 'parish-watch',
  },
  {
    // DELIBERATELY POOR AND UNCONTROLLED, and both halves are mechanical.
    // No controlling faction is the merchant pack's own trick for a district
    // with no recourse. Low commerce is what `computeDistrictMood` turns into
    // low prosperity, which is what `computeDistrictModifiers` turns into a
    // NEGATIVE npcCooperationBias — so the Rookery is measurably harder to get
    // a straight answer in, through the check-time seam v3.8 built rather than
    // through a special case. It is also what
    // `evaluateDistrictOpportunities` reads for `recovery`.
    id: 'the-rookery',
    name: 'The Rookery',
    zoneIds: ['rookery', 'flash-house', 'tyburn-road'],
    tags: ['unbonded', 'contested', 'dark'],
  },
];

// --- Dialogues ---

export const swearingInDialogue: DialogueDefinition = {
  id: 'swearing-in',
  speakers: ['clerk-hesper'],
  entryNodeId: 'board',
  nodes: {
    board: {
      id: 'board',
      speaker: 'Clerk Hesper',
      text: 'Hesper does not look up. "Board’s there. Prices are what they are. You want a ticket, you sign for it — and if you sign, the office owns what you do next."',
      choices: [
        { id: 'sign', text: 'Sign for a ticket.', nextNodeId: 'signed' },
        { id: 'ask-quill', text: 'Ask who takes the most tickets.', nextNodeId: 'quill' },
      ],
    },
    signed: {
      id: 'signed',
      speaker: 'Clerk Hesper',
      text: '"Then you’re the office’s man." He stamps something without showing you what. "Bring them breathing. We don’t pay for meat."',
      effects: [{ type: 'set-flag', params: { flag: 'sworn-in', value: true } }],
    },
    quill: {
      id: 'quill',
      speaker: 'Clerk Hesper',
      text: 'Now he looks up. "Mr Quill takes the most. Mr Quill takes nearly all of them." A pause exactly long enough. "Nobody has ever asked me how."',
      choices: [
        { id: 'sign-after', text: 'Sign for a ticket anyway.', nextNodeId: 'signed' },
      ],
    },
  },
};

export const flashHouseDialogue: DialogueDefinition = {
  id: 'flash-house-terms',
  speakers: ['mother-slack'],
  entryNodeId: 'terms',
  nodes: {
    terms: {
      id: 'terms',
      speaker: 'Mother Slack',
      text: 'Mother Slack weighs something that is not hers. "You’re the one with the darbies. I know what you are." She does not stop weighing. "Doesn’t mean we can’t deal. Means the price is different."',
      choices: [
        { id: 'deal', text: 'Ask what she buys.', nextNodeId: 'buys' },
        { id: 'quill', text: 'Ask about Quill.', nextNodeId: 'quill-below' },
      ],
    },
    buys: {
      id: 'buys',
      speaker: 'Mother Slack',
      text: '"Anything that walked in on its own legs. Nothing that’s still warm." The scales settle. "And I pay badly. You’re not here for the money, or you’d not have come down the stair."',
    },
    'quill-below': {
      id: 'quill-below',
      speaker: 'Mother Slack',
      text: '"He takes from me on Tuesdays and sells my boys to Hesper on Fridays." She finally looks at you. "You want the difference between him and you? He stopped pretending there was one."',
    },
  },
};

// --- Quests ---

export const firstTicketQuest: QuestDefinition = {
  id: 'the-first-ticket',
  name: 'The First Ticket',
  triggers: [
    {
      event: 'world.zone.entered',
      condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'shambles' } },
      effect: { type: 'offer', params: {} },
    },
  ],
  stages: [
    {
      id: 'find-the-runner',
      name: 'Find the runner',
      description: 'Somebody in the Rookery answers to the name on your bill.',
      nextStage: 'take-him-breathing',
      triggers: [
        {
          event: 'pursuit.word.bought',
          condition: { type: 'payload-equals', params: { key: 'markId', value: 'rookery-runner' } },
          effect: { type: 'advance', params: {} },
        },
      ],
    },
    {
      id: 'take-him-breathing',
      name: 'Take him breathing',
      description: 'The office pays for people, not bodies.',
      triggers: [
        {
          event: 'pursuit.mark.collared',
          condition: { type: 'payload-equals', params: { key: 'markId', value: 'rookery-runner' } },
          effect: { type: 'advance', params: {} },
        },
      ],
    },
  ],
};

export const bloodMoneyQuest: QuestDefinition = {
  id: 'blood-money',
  name: 'Blood Money',
  triggers: [
    {
      event: 'world.zone.entered',
      condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'flash-house' } },
      effect: { type: 'offer', params: {} },
    },
  ],
  stages: [
    {
      id: 'hear-the-terms',
      name: 'Hear the terms',
      description: 'Mother Slack will deal with a thief-taker. At a price.',
      nextStage: 'choose-a-side',
      triggers: [
        {
          event: 'dialogue.ended',
          condition: { type: 'payload-equals', params: { key: 'dialogueId', value: 'flash-house-terms' } },
          effect: { type: 'advance', params: {} },
        },
      ],
    },
    {
      id: 'choose-a-side',
      name: 'Choose a side, for today',
      description: 'Fence what you recovered, or testify to what you took. Not both, not this week.',
      triggers: [
        {
          event: 'pursuit.goods.fenced',
          effect: { type: 'advance', params: {} },
        },
        {
          event: 'pursuit.mark.convicted',
          effect: { type: 'advance', params: {} },
        },
      ],
    },
  ],
};

export const thiefTakerGeneralQuest: QuestDefinition = {
  id: 'the-thief-taker-general',
  name: 'The Thief-Taker General',
  triggers: [
    {
      event: 'world.zone.entered',
      condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'tyburn-road' } },
      effect: { type: 'offer', params: {} },
    },
  ],
  stages: [
    {
      id: 'settle-it',
      name: 'Settle it',
      description: 'Everyone on this road is going the same way. He will offer you the partnership first. He always does.',
      triggers: [
        {
          event: 'combat.entity.defeated',
          condition: { type: 'payload-equals', params: { key: 'entityId', value: 'jonathan-quill' } },
          effect: { type: 'advance', params: {} },
        },
      ],
    },
  ],
};

export const bountyHunterQuests: QuestDefinition[] = [
  firstTicketQuest,
  bloodMoneyQuest,
  thiefTakerGeneralQuest,
];

// --- Progression ---

export const thiefTakersNameTree: ProgressionTreeDefinition = {
  id: 'thief-takers-name',
  name: "A Thief-Taker's Name",
  currency: 'xp',
  nodes: [
    {
      id: 'known-face',
      name: 'A Known Face',
      cost: 10,
      effects: [
        { type: 'stat-boost', params: { stat: 'authority', amount: 1 } },
        { type: 'resource-boost', params: { resource: 'warrant', amount: 10 } },
      ],
    },
    {
      id: 'good-with-names',
      name: 'Good With Names',
      cost: 15,
      requires: ['known-face'],
      effects: [{ type: 'stat-boost', params: { stat: 'nose', amount: 2 } }],
    },
    {
      id: 'hard-hands',
      name: 'Hard Hands',
      cost: 15,
      requires: ['known-face'],
      effects: [
        { type: 'stat-boost', params: { stat: 'grip', amount: 2 } },
        { type: 'resource-boost', params: { resource: 'hp', amount: 4 } },
      ],
    },
    {
      id: 'both-halves',
      name: 'Both Halves of the Ward',
      cost: 30,
      requires: ['good-with-names', 'hard-hands'],
      effects: [
        { type: 'stat-boost', params: { stat: 'authority', amount: 2 } },
        { type: 'grant-tag', params: { tag: 'thief-taker-general' } },
      ],
    },
  ],
};

export const xpAwards = {
  kill: 12,
  collar: 14,
  conviction: 10,
  firstVisit: 3,
  bossBonus: 20,
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

const playerOnly: CurrencyReward['recipient'] = (event, world) =>
  event.actorId === world.playerId ? event.actorId : undefined;

export const progressionRewards: CurrencyReward[] = [
  { eventPattern: 'combat.entity.defeated', currencyId: 'xp', amount: xpAwards.kill, recipient: 'actor' },
  {
    eventPattern: 'combat.entity.defeated',
    currencyId: 'xp',
    amount: oncePer(xpAwards.bossBonus, (e) =>
      e.payload.entityId === 'jonathan-quill' ? 'boss:jonathan-quill' : undefined),
    recipient: 'actor',
  },
  // A COLLAR PAYS MORE THAN A KILL, and that is the pack's whole economy
  // stated as two numbers. Taking a man breathing is worth 14; putting him
  // down is worth 12. Small on purpose — this is a thumb on the scale, not a
  // rule against violence, and a player who never notices the difference is
  // still playing the game.
  { eventPattern: 'pursuit.mark.collared', currencyId: 'xp', amount: xpAwards.collar, recipient: 'actor' },
  { eventPattern: 'pursuit.mark.convicted', currencyId: 'xp', amount: xpAwards.conviction, recipient: 'actor' },
  {
    eventPattern: 'world.zone.entered',
    currencyId: 'xp',
    amount: oncePer(xpAwards.firstVisit, (e) =>
      typeof e.payload.zoneId === 'string' ? `zone:${e.payload.zoneId}` : undefined),
    recipient: playerOnly,
  },
];

// --- Abilities ---

export const readTheBoard: AbilityDefinition = {
  id: 'read-the-board',
  name: 'Read the Board',
  verb: 'use-ability',
  tags: ['pursuit', 'utility'],
  costs: [{ resourceId: 'stamina', amount: 2 }],
  target: { type: 'self' },
  checks: [{ stat: 'nose', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'actor', params: { statusId: 'on-the-scent', duration: 3 } },
  ],
  requirements: [{ type: 'has-tag', params: { tag: 'thief-taker' } }],
};

export const runHimDown: AbilityDefinition = {
  id: 'run-him-down',
  name: 'Run Him Down',
  verb: 'use-ability',
  tags: ['pursuit', 'control'],
  costs: [{ resourceId: 'stamina', amount: 5 }],
  target: { type: 'single' },
  checks: [{ stat: 'grip', difficulty: 7, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'hobbled', duration: 2 } },
  ],
  requirements: [{ type: 'has-tag', params: { tag: 'thief-taker' } }],
};

export const quietWord: AbilityDefinition = {
  id: 'quiet-word',
  name: 'A Quiet Word',
  verb: 'use-ability',
  tags: ['pursuit', 'social'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'self' },
  effects: [
    { type: 'resource-modify', target: 'actor', params: { resource: 'infamy', amount: 4 } },
    { type: 'apply-status', target: 'actor', params: { statusId: 'known-below', duration: 6 } },
  ],
  requirements: [{ type: 'has-tag', params: { tag: 'thief-taker' } }],
};

export const bountyHunterAbilities: AbilityDefinition[] = [readTheBoard, runHimDown, quietWord];

// --- Status Definitions ---

export const bountyHunterStatusDefinitions: StatusDefinition[] = [
  {
    id: 'on-the-scent',
    name: 'On the Scent',
    tags: ['buff', 'pursuit'],
    stacking: 'replace',
    duration: { type: 'ticks', value: 3 },
    ui: { icon: '\u{1F50D}', color: '#3498db', description: 'You know which way he went' },
  },
  {
    id: 'hobbled',
    name: 'Hobbled',
    tags: ['debuff', 'control'],
    stacking: 'replace',
    duration: { type: 'ticks', value: 2 },
    ui: { icon: '\u{1FA79}', color: '#c0392b', description: 'They are not running anywhere' },
  },
  {
    id: 'known-below',
    name: 'Known Below',
    tags: ['reputation', 'pursuit'],
    stacking: 'replace',
    duration: { type: 'ticks', value: 6 },
    ui: { icon: '\u{1F576}', color: '#8e44ad', description: 'The Rookery has decided you are useful' },
  },
  {
    id: 'marked-man',
    name: 'Marked Man',
    tags: ['debuff', 'pursuit', 'reputation'],
    stacking: 'replace',
    duration: { type: 'ticks', value: 8 },
    ui: { icon: '\u{1F3AF}', color: '#e67e22', description: 'Somebody has put your name on the wall' },
  },
];

// --- Pack metadata ---

export const packMeta: PackMetadata = {
  id: 'hue-and-cry',
  name: 'Hue and Cry',
  tagline: 'There is no law here. There is a price, and there is you.',
  // 'pursuit' is a new PackGenre member (rubric dimension 7: no other pack
  // occupies this niche). Reusing an existing genre would pass the rubric on a
  // technicality while making the pack unfindable by the thing it is about.
  genres: ['pursuit'],
  difficulty: 'advanced',
  // ['gritty','tense'] was the first pick and it scored 6/7: identical as a SET
  // to ashfall-dead's, which the rubric counts as a failed distinctness
  // dimension. Measured, not guessed — the score named the collision.
  //
  // `noir` is the better answer anyway and it took the gate to notice: a
  // thief-taker running informants for the office and fencing for the ward is
  // proto-noir, a century before the word. noir+tense is unclaimed.
  tones: ['noir', 'tense'],
  tags: ['bounty', 'thief-taker', 'pursuit', 'informants', 'double-life', 'early-modern'],
  engineVersion: '>=3.8.0 <4.0.0',
  version: '3.8.0',
  description: 'Take thieves for money in a city with no police. Buy words from informants, post prices on names, fence what comes back — and decide, one job at a time, whether you are the office’s man or the ward’s.',
  narratorTone: 'plain, unhurried, period-precise, unsentimental about hanging',
};

// --- Build catalog ---

export const buildCatalog: BuildCatalog = {
  packId: 'hue-and-cry',
  statBudget: 3,
  maxTraits: 3,
  requiredFlaws: 1,
  archetypes: [
    {
      id: 'thief-taker',
      name: 'Thief-Taker',
      description: 'Paid by the head, by whoever wants it — all the risk, none of the wage',
      statPriorities: { grip: 5, nose: 5, authority: 4 },
      startingTags: ['thief-taker', 'sworn'],
      startingInventory: ['iron-darbies', 'bill-of-hue'],
      progressionTreeId: 'thief-takers-name',
    },
    {
      id: 'informer',
      name: 'Informer',
      description: 'Knows where everyone sleeps — and who else has been asking',
      statPriorities: { grip: 3, nose: 7, authority: 4 },
      startingTags: ['thief-taker', 'informant'],
      startingInventory: ['bill-of-hue', 'scrivener-list'],
      progressionTreeId: 'thief-takers-name',
    },
    {
      id: 'bailiff',
      name: 'Bailiff',
      description: 'Serves the office openly, and is disliked openly for it',
      statPriorities: { grip: 6, nose: 3, authority: 6 },
      startingTags: ['thief-taker', 'sworn', 'lawful'],
      startingInventory: ['iron-darbies', 'constables-staff'],
      progressionTreeId: 'thief-takers-name',
    },
  ],
  disciplines: [
    {
      id: 'hue-and-cry',
      name: 'The Hue and Cry',
      description: 'Raise the ward against a man and let the city do the running',
      // Posting a price is the office's own instrument, so the discipline that
      // grants it is the one that leans on standing — and pays for it in the
      // Rookery, where a crier is exactly the wrong thing to be.
      grantedVerb: 'post-bounty',
      passive: { type: 'stat-modifier', stat: 'authority', amount: 1 },
      drawback: { type: 'faction-modifier', faction: 'thieves-company', amount: -15 },
    },
    {
      id: 'thieves-cant',
      name: "Thieves' Cant",
      description: 'Speak the ward’s own language, and be answered in it',
      grantedVerb: 'informant',
      passive: { type: 'resource-modifier', resource: 'infamy', amount: 15 },
      drawback: { type: 'faction-modifier', faction: 'bounty-office', amount: -15 },
    },
  ],
  backgrounds: [
    {
      id: 'former-constable',
      name: 'Former Constable',
      description: 'Served the parish a year for nothing, the way the parish likes it',
      statModifiers: { authority: 1, nose: -1 },
      startingTags: ['watch-known'],
    },
    {
      id: 'raised-in-the-rookery',
      name: 'Raised in the Rookery',
      description: 'You know which doors are doors. They know you too.',
      statModifiers: { nose: 1, authority: -1 },
      startingTags: ['rookery-born'],
    },
    {
      id: 'gaol-turnkey',
      name: 'Gaol Turnkey',
      description: 'You have already spent years standing between men and the outside',
      statModifiers: { grip: 1, nose: -1 },
      startingTags: ['gaol-hand'],
    },
  ],
  traits: [
    { id: 'long-memory', name: 'Long Memory', category: 'perk', description: 'You have never forgotten a face or a slight', effects: [{ type: 'stat-modifier', stat: 'nose', amount: 1 }] },
    { id: 'heavy-handed', name: 'Heavy-Handed', category: 'perk', description: 'Nobody has ever slipped your grip twice', effects: [{ type: 'stat-modifier', stat: 'grip', amount: 1 }] },
    { id: 'sworn-oath', name: 'Sworn', category: 'perk', description: 'The office knows your name and expects things of it', effects: [{ type: 'grant-tag', tag: 'sworn' }] },
    { id: 'known-below-flaw', name: 'Known Below', category: 'flaw', description: 'The Rookery knows exactly what you are', effects: [{ type: 'stat-modifier', stat: 'authority', amount: -1 }] },
    { id: 'in-quills-book', name: "In Quill's Book", category: 'flaw', description: 'You owe the General a favour and he has not called it yet', effects: [{ type: 'stat-modifier', stat: 'authority', amount: -1 }] },
  ],
  crossTitles: [
    { archetypeId: 'thief-taker', disciplineId: 'hue-and-cry', title: 'Crier', tags: ['crier'] },
    { archetypeId: 'thief-taker', disciplineId: 'thieves-cant', title: 'Double Man', tags: ['cant'] },
    { archetypeId: 'informer', disciplineId: 'hue-and-cry', title: 'Common Informer', tags: ['crier'] },
    { archetypeId: 'informer', disciplineId: 'thieves-cant', title: 'Nose', tags: ['cant'] },
    { archetypeId: 'bailiff', disciplineId: 'hue-and-cry', title: 'Bailiff of the Ward', tags: ['crier', 'lawful'] },
    { archetypeId: 'bailiff', disciplineId: 'thieves-cant', title: 'Bent Bailiff', tags: ['cant'] },
  ],
  entanglements: [
    {
      id: 'bailiff-in-cant',
      archetypeId: 'bailiff',
      disciplineId: 'thieves-cant',
      description: 'A bailiff who speaks cant is not a bailiff with contacts — he is a bailiff the office has started asking about',
      effects: [{ type: 'grant-tag', tag: 'under-suspicion' }],
    },
  ],
};

// --- Items ---

export const itemCatalog: ItemCatalog = {
  items: [
    {
      id: 'iron-darbies',
      name: 'Iron Darbies',
      description: 'Two cuffs and a bar. The whole difference between a taking and a killing.',
      slot: 'tool',
      rarity: 'uncommon',
      statModifiers: { grip: 1 },
      grantedTags: ['taker'],
      grantedVerbs: ['collar'],
      provenance: {
        origin: 'The Bounty Office',
        factionId: 'bounty-office',
        flags: ['heirloom'],
        lore: 'Stamped with an office mark and a number. The number is not yours.',
      },
    },
    {
      id: 'bill-of-hue',
      name: 'Bill of Hue',
      description: 'A printed name, a printed price, and a space at the bottom for yours.',
      slot: 'trinket',
      rarity: 'common',
      statModifiers: { authority: 1 },
      grantedTags: ['sworn'],
      grantedVerbs: ['post-bounty'],
      provenance: {
        origin: 'The Board of Hue',
        factionId: 'bounty-office',
        flags: ['contraband'],
        lore: 'Every name on it was somebody the office could not reach itself.',
      },
    },
    {
      id: 'constables-staff',
      name: "Constable's Staff",
      description: 'Painted, crowned, and heavy enough to end an argument.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { grip: 2 },
      grantedTags: ['armed'],
    },
    {
      id: 'scrivener-list',
      name: "Scrivener's List",
      description: 'Names, streets, and who was seen with whom. Sold exactly twice.',
      slot: 'trinket',
      rarity: 'uncommon',
      statModifiers: { nose: 2 },
      grantedVerbs: ['informant'],
    },
    {
      id: 'cordial-flask',
      name: 'Cordial Flask',
      description: 'Something warm and cheap, for after the running.',
      slot: 'tool',
      rarity: 'common',
      grantedTags: ['carrying-drink'],
    },
    {
      id: 'stolen-plate',
      name: 'Stolen Plate',
      description: 'Somebody’s silver, with somebody’s crest filed at.',
      slot: 'trinket',
      rarity: 'uncommon',
      grantedTags: ['hot'],
      provenance: {
        origin: 'Unknown, and better so',
        flags: ['stolen'],
        lore: 'It will be recognised at the Sessions and paid for at the Flash House.',
      },
    },
    {
      id: 'tyburn-ticket',
      name: 'Tyburn Ticket',
      description: 'A certificate exempting the holder from parish office. Real, transferable, and worth more than the reward.',
      slot: 'accessory',
      rarity: 'legendary',
      statModifiers: { authority: 2 },
      grantedTags: ['exempt'],
      provenance: {
        origin: 'Awarded at the Sessions',
        factionId: 'bounty-office',
        flags: ['heirloom', 'trophy'],
        lore: 'Given for a conviction. Sold, more often than not, to a man who never took anyone.',
      },
    },
  ],
};
