// Salt Road Ledger — mercantile starter content
// 8 zones, 4 NPCs, 3 hostiles, 1 boss, 4 districts, 2 dialogues, 3 quests
//
// You are a FACTOR: an agent trading on someone else's capital. The goods in
// your hands are owed for. Every mechanic here is a variation on that one
// pressure — `liquidity` is what you can move without calling in a debt, `lien`
// is what accrues when you cannot, and the Assay Guild seizes assets at 70.
//
// Combat is authored as a COST, not content. The hostiles are low-threat and
// winning still raises lien (you damaged someone's property), so a factor who
// fights has already made a bad trade. That inversion is the point.

import type { EntityState, ZoneState, GameManifest, ResolvedEvent } from '@ai-rpg-engine/core';
import type { DialogueDefinition, ProgressionTreeDefinition, AbilityDefinition, StatusDefinition, QuestDefinition } from '@ai-rpg-engine/content-schema';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import type { DistrictDefinition, EncounterDefinition, BossDefinition, CurrencyReward } from '@ai-rpg-engine/modules';

export const manifest: GameManifest = {
  id: 'salt-road-ledger',
  title: 'Salt Road Ledger',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'merchant-minimal',
  modules: ['traversal-core', 'status-core', 'combat-core', 'inventory-core', 'dialogue-core'],
  contentPacks: ['salt-road-ledger'],
};

// --- Player ---

export const player: EntityState = {
  id: 'factor',
  blueprintId: 'factor',
  type: 'player',
  name: 'Factor',
  // 'merchant' is the pack-identity tag every ability requirement gates on
  // (T0-tag-gate: a created character without it hides gated abilities).
  tags: ['player', 'merchant', 'indebted'],
  stats: { ledger: 6, tongue: 6, standing: 4 },
  // `coin` is stock-in-hand; `liquidity` is deployable capital; `lien` starts
  // empty and fills toward seizure. 40 coin is a working float — enough to buy
  // out one small obligation but not two, which is the choice The Late Caravan
  // is built around.
  resources: { hp: 14, maxHp: 14, stamina: 10, maxStamina: 10, coin: 40, liquidity: 45, lien: 0 },
  statuses: [],
  // The ledger-book is required by `audit` and is itself a growable relic (its
  // default milestones are age-based — a book that has seen years). The flax is
  // the first thing you have to move.
  inventory: ['bale-of-flax', 'ledger-book'],
  zoneId: 'counting-house',
};

// --- NPCs ---

export const assayMasterCorvane: EntityState = {
  id: 'assay-master-corvane',
  blueprintId: 'assay-master-corvane',
  // 'named' (the v3.0 Living NPCs convention): the one authored story NPC this
  // starter carries, so npc-agency has a person to run goals/obligations for.
  type: 'npc',
  name: 'Assay Master Corvane',
  tags: ['npc', 'named', 'guild', 'assayer'],
  stats: { ledger: 12, tongue: 7, standing: 9 },
  resources: { hp: 12, maxHp: 12, stamina: 4, maxStamina: 4 },
  statuses: [],
  zoneId: 'counting-house',
  custom: {
    personalGoal: 'Keep the Guild seal worth more than the wax it is pressed in',
    disposition: 'exacting',
  },
};

export const harbourmasterDrell: EntityState = {
  id: 'harbourmaster-drell',
  blueprintId: 'harbourmaster-drell',
  type: 'npc',
  name: 'Harbourmaster Drell',
  tags: ['npc', 'authority', 'tariff'],
  stats: { ledger: 8, tongue: 6, standing: 7 },
  resources: { hp: 12, maxHp: 12, stamina: 4, maxStamina: 4 },
  statuses: [],
  zoneId: 'customs-shed',
};

export const brokerInaya: EntityState = {
  id: 'broker-inaya',
  blueprintId: 'broker-inaya',
  type: 'npc',
  name: 'Broker Inaya',
  tags: ['npc', 'fence', 'unbonded'],
  stats: { ledger: 9, tongue: 10, standing: 2 },
  resources: { hp: 10, maxHp: 10, stamina: 4, maxStamina: 4 },
  statuses: [],
  zoneId: 'crooked-stair',
  custom: {
    // The `payment`-primitive counterparty: cash on the barrel, no escrow, no
    // recourse, better prices. The Warrens has no controlling faction for
    // exactly this reason.
    settlesWithoutEscrow: 'true',
  },
};

export const exchequerNull = {
  id: 'exchequer-null',
  blueprintId: 'exchequer-null',
  type: 'npc',
  name: 'Exchequer Null',
  tags: ['npc', 'crown', 'auditor'],
  stats: { ledger: 15, tongue: 8, standing: 12 },
  resources: { hp: 14, maxHp: 14, stamina: 4, maxStamina: 4 },
  statuses: [],
  zoneId: 'audit-chamber',
} satisfies EntityState;

// --- Hostiles ---
// Deliberately low-threat. A factor who ends up in a fight has already lost the
// trade; these exist to make that concrete, not to be a combat ladder.

export const collectionsEnforcer: EntityState = {
  id: 'collections-enforcer',
  blueprintId: 'collections-enforcer',
  type: 'enemy',
  name: 'Collections Enforcer',
  tags: ['enemy', 'collections', 'role:brute'],
  stats: { ledger: 3, tongue: 4, standing: 6 },
  resources: { hp: 16, maxHp: 16, stamina: 6, maxStamina: 6 },
  statuses: [],
  zoneId: 'bonded-warehouse',
  ai: { profileId: 'aggressive', goals: ['recover-the-debt'], fears: ['a-witness-with-standing'], alertLevel: 0, knowledge: {} },
};

export const warrenCutpurse: EntityState = {
  id: 'warren-cutpurse',
  blueprintId: 'warren-cutpurse',
  type: 'enemy',
  name: 'Warren Cutpurse',
  tags: ['enemy', 'thief', 'role:skirmisher'],
  stats: { ledger: 4, tongue: 6, standing: 1 },
  resources: { hp: 10, maxHp: 10, stamina: 5, maxStamina: 5 },
  statuses: [],
  zoneId: 'unlit-cellar',
  ai: { profileId: 'aggressive', goals: ['take-what-is-carried'], fears: ['the-harbour-watch'], alertLevel: 0, knowledge: {} },
};

export const bondedClerkThrall: EntityState = {
  id: 'bonded-clerk-thrall',
  blueprintId: 'bonded-clerk-thrall',
  type: 'enemy',
  name: 'Bonded Clerk',
  tags: ['enemy', 'clerk', 'role:elite'],
  stats: { ledger: 10, tongue: 3, standing: 4 },
  resources: { hp: 12, maxHp: 12, stamina: 4, maxStamina: 4 },
  statuses: [],
  zoneId: 'bonded-warehouse',
  ai: { profileId: 'territorial', goals: ['guard-the-seals'], fears: ['an-irregular-manifest'], alertLevel: 0, knowledge: {} },
};

// --- Boss ---

export const theStandingAccount: EntityState = {
  id: 'the-standing-account',
  blueprintId: 'the-standing-account',
  type: 'enemy',
  name: 'The Standing Account',
  // `role:boss` is the convention every shipped pack uses, and the one the
  // item-chronicle producer's boss-kill detection reads.
  tags: ['enemy', 'crown', 'reckoning', 'role:boss'],
  stats: { ledger: 16, tongue: 10, standing: 14 },
  resources: { hp: 44, maxHp: 44, stamina: 12, maxStamina: 12 },
  statuses: [],
  zoneId: 'audit-chamber',
  ai: { profileId: 'calculating', goals: ['close-the-books'], fears: ['an-honest-set-of-accounts'], alertLevel: 0, knowledge: {} },
};

/**
 * The endgame is not a creature — it is a reckoning, and its phases are keyed to
 * how encumbered you arrive. A factor who kept their books clean fights a
 * shorter fight; one who arrives at lien 70+ has already handed it weapons.
 */
export const theStandingAccountBoss: BossDefinition = {
  entityId: 'the-standing-account',
  phases: [
    {
      hpThreshold: 0.75,
      narrativeKey: 'produces-the-first-discrepancy',
      addTags: ['citing'],
    },
    {
      hpThreshold: 0.5,
      narrativeKey: 'calls-in-every-obligation',
      addTags: ['foreclosing'],
      removeTags: ['citing'],
    },
    {
      hpThreshold: 0.25,
      narrativeKey: 'the-books-close',
      addTags: ['final-demand'],
      removeTags: ['foreclosing'],
    },
  ],
};

// --- Encounters ---

export const collectionsCall: EncounterDefinition = {
  id: 'collections-call',
  name: 'A Call from Collections',
  participants: [
    { entityId: 'collections-enforcer', role: 'brute' },
  ],
  composition: 'ambush',
  validZoneIds: ['bonded-warehouse', 'long-quay'],
  narrativeHooks: {
    tone: 'polite menace, a ledger held like a weapon',
    trigger: 'An obligation has gone unpaid long enough to be noticed',
    stakes: 'Property, and the standing that lets you borrow against it',
  },
};

export const cellarShakedown: EncounterDefinition = {
  id: 'cellar-shakedown',
  name: 'Cellar Shakedown',
  participants: [
    { entityId: 'warren-cutpurse', role: 'skirmisher' },
    { entityId: 'warren-cutpurse', role: 'skirmisher' },
  ],
  composition: 'ambush',
  validZoneIds: ['unlit-cellar', 'crooked-stair'],
  narrativeHooks: {
    tone: 'damp stone, quick hands, no witnesses',
    trigger: 'Carrying unbonded goods where nobody is bonded',
    stakes: 'Whatever is in your hands right now',
  },
};

export const encounterSpawnContent = {
  encounters: [collectionsCall, cellarShakedown],
  entityTemplates: [collectionsEnforcer, warrenCutpurse],
  zoneTables: {
    // The bonded warehouse is where seized goods are held — collections works
    // out of it, so a visit is twice as likely to draw one.
    'bonded-warehouse': ['collections-call', 'collections-call'],
    'long-quay': ['collections-call'],
    'unlit-cellar': ['cellar-shakedown', 'cellar-shakedown'],
    'crooked-stair': ['cellar-shakedown'],
  } as Record<string, string[]>,
};

// --- Zones ---

export const zones: ZoneState[] = [
  {
    id: 'counting-house',
    roomId: 'saltgate',
    name: 'The Counting House',
    // 'safe'/'home-base' are the recovery tags buildCombatStack reads — the one
    // room where a factor can breathe.
    tags: ['interior', 'safe', 'home-base', 'lawful'],
    neighbors: ['weighing-floor', 'long-quay'],
    light: 4,
    interactables: ['a standing desk', 'the house ledger', 'a wax jack and seal press'],
  },
  {
    id: 'weighing-floor',
    roomId: 'saltgate',
    name: 'The Weighing Floor',
    tags: ['interior', 'market', 'lawful', 'crowded'],
    neighbors: ['counting-house', 'bonded-warehouse', 'customs-shed'],
    light: 5,
    interactables: ['brass scales', 'a queue of factors', 'the day’s posted rates'],
  },
  {
    id: 'bonded-warehouse',
    roomId: 'saltgate',
    name: 'The Bonded Warehouse',
    tags: ['interior', 'storage', 'lawful', 'guarded'],
    neighbors: ['weighing-floor', 'long-quay'],
    light: 2,
    interactables: ['crates under seal', 'a seizure manifest', 'a locked cage of unclaimed goods'],
  },
  {
    id: 'long-quay',
    roomId: 'dockward',
    name: 'The Long Quay',
    tags: ['exterior', 'harbour', 'busy'],
    neighbors: ['counting-house', 'bonded-warehouse', 'customs-shed', 'crooked-stair'],
    light: 5,
    hazards: ['tide-slick'],
    interactables: ['a caravan late by nine days', 'coiled hawsers', 'a tally-boy with bad news'],
  },
  {
    id: 'customs-shed',
    roomId: 'dockward',
    name: 'The Customs Shed',
    tags: ['interior', 'authority', 'slow'],
    // audit-chamber reciprocated: the summons is walked to and walked back from.
    // Caught by the adjacency-symmetry test — the same one-way-passage class as
    // gladiator's F-7902facb.
    neighbors: ['weighing-floor', 'long-quay', 'audit-chamber'],
    light: 3,
    interactables: ['the tariff schedule', 'a stamp that means everything', 'unopened manifests'],
  },
  {
    id: 'crooked-stair',
    roomId: 'warrens',
    name: 'The Crooked Stair',
    tags: ['exterior', 'unbonded', 'contested'],
    neighbors: ['long-quay', 'unlit-cellar'],
    light: 2,
    interactables: ['a doorway with no sign', 'chalk marks in a private code'],
  },
  {
    id: 'unlit-cellar',
    roomId: 'warrens',
    name: 'The Unlit Cellar',
    tags: ['interior', 'unbonded', 'contested', 'dark'],
    neighbors: ['crooked-stair'],
    light: 1,
    hazards: ['no-recourse'],
    interactables: ['goods with no provenance', 'a scale that reads light'],
  },
  {
    id: 'audit-chamber',
    roomId: 'high-counting-house',
    name: 'The Audit Chamber',
    tags: ['interior', 'crown', 'formal'],
    neighbors: ['customs-shed'],
    light: 4,
    interactables: ['every book you have ever signed', 'a chair placed too far from the desk'],
  },
];

// --- Districts ---

export const districts: DistrictDefinition[] = [
  {
    id: 'saltgate',
    name: 'Saltgate',
    zoneIds: ['counting-house', 'weighing-floor', 'bonded-warehouse'],
    tags: ['lawful', 'trade'],
    controllingFaction: 'assay-guild',
  },
  {
    id: 'dockward',
    name: 'Dockward',
    zoneIds: ['long-quay', 'customs-shed'],
    tags: ['harbour', 'tariff'],
    controllingFaction: 'harbour-authority',
  },
  {
    // DELIBERATELY UNCONTROLLED. No controlling faction means no escrow and no
    // recourse — this is the district where the `payment` settlement primitive
    // is the only option, which is what makes the pack's A/B of the two
    // primitives playable rather than configured.
    id: 'the-warrens',
    name: 'The Warrens',
    zoneIds: ['crooked-stair', 'unlit-cellar'],
    tags: ['unbonded', 'contested'],
  },
  {
    id: 'high-counting-house',
    name: 'The High Counting House',
    zoneIds: ['audit-chamber'],
    tags: ['crown', 'political'],
    controllingFaction: 'crown-exchequer',
  },
];

// --- Dialogue ---

export const guildRegistrationDialogue: DialogueDefinition = {
  id: 'guild-registration',
  speakers: ['assay-master-corvane'],
  entryNodeId: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Assay Master Corvane',
      text: 'You want to trade under the Guild’s mark. Understand what you are asking. The mark is not a favour, it is a debt you carry openly.',
      choices: [
        { id: 'ask-seal', text: 'What does the seal actually do?', nextNodeId: 'seal-explained' },
        { id: 'ask-terms', text: 'What does it cost me?', nextNodeId: 'terms' },
        { id: 'register', text: 'Open the books. I’ll carry it.', nextNodeId: 'registered' },
      ],
    },
    'seal-explained': {
      id: 'seal-explained',
      speaker: 'Assay Master Corvane',
      text: 'It says a third party will hold goods against your word. Without it, every trade is cash in hand and a prayer. With it, you can consign — and be consigned to.',
      choices: [
        { id: 'back-from-seal', text: 'And the cost?', nextNodeId: 'terms' },
        { id: 'register-from-seal', text: 'Open the books.', nextNodeId: 'registered' },
      ],
    },
    terms: {
      id: 'terms',
      speaker: 'Assay Master Corvane',
      text: 'Every obligation you let run past its date becomes a lien. Enough lien and we take an asset — not as punishment, as arithmetic. The Guild does not hold grudges. It holds collateral.',
      choices: [
        { id: 'register-from-terms', text: 'Open the books.', nextNodeId: 'registered' },
        { id: 'decline', text: 'I’ll trade unbonded for now.', nextNodeId: 'declined' },
      ],
    },
    registered: {
      id: 'registered',
      speaker: 'Assay Master Corvane',
      text: 'Then it is done. Your house is on the roll. Carry the seal where it can be seen — a hidden mark is worth nothing.',
      // The checkpoint-0 flag. setup.ts issues the guild-seal on this node and
      // emits `merchant.books.opened`, which is where a ledger driver would
      // call enable().
      effects: [{ type: 'set-global', params: { key: 'books-opened', value: true } }],
    },
    declined: {
      id: 'declined',
      speaker: 'Assay Master Corvane',
      text: 'The Warrens will take your goods and your word at the same price. Come back when that stops sounding like freedom.',
    },
  },
};

export const warrensTermsDialogue: DialogueDefinition = {
  id: 'warrens-terms',
  speakers: ['broker-inaya'],
  entryNodeId: 'greeting',
  nodes: {
    greeting: {
      id: 'greeting',
      speaker: 'Broker Inaya',
      text: 'No seal down here. No escrow, no writ, no one to complain to. Which means I pay better, and you carry all of it.',
      choices: [
        { id: 'ask-price', text: 'How much better?', nextNodeId: 'price' },
        { id: 'ask-risk', text: 'And if you simply don’t pay?', nextNodeId: 'risk' },
      ],
    },
    price: {
      id: 'price',
      speaker: 'Broker Inaya',
      text: 'Better than the Floor, because the Floor takes a cut for the privilege of protecting you. I take nothing. I also protect you from nothing.',
      choices: [{ id: 'to-risk', text: 'And if you don’t pay?', nextNodeId: 'risk' }],
    },
    risk: {
      id: 'risk',
      speaker: 'Broker Inaya',
      text: 'Then you learned something about me at a fair price. That is the whole business, factor. Cash on the barrel.',
      effects: [{ type: 'set-global', params: { key: 'warrens-terms-known', value: true } }],
    },
  },
};

// --- Quests ---

export const openTheBooksQuest: QuestDefinition = {
  id: 'open-the-books',
  name: 'Open the Books',
  // Offered at the desk you start in front of. The tutorial that is also the
  // ledger layer's checkpoint 0.
  triggers: [
    {
      event: 'world.zone.entered',
      condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'counting-house' } },
      effect: { type: 'offer', params: {} },
    },
  ],
  stages: [
    {
      id: 'register-with-the-guild',
      name: 'Register with the Guild',
      description: 'Corvane will put your house on the roll — and the Guild seal in your hand',
      objectives: ['Speak with Assay Master Corvane and open the books'],
      triggers: [
        {
          event: 'dialogue.ended',
          condition: { type: 'payload-equals', params: { key: 'dialogueId', value: 'guild-registration' } },
          effect: { type: 'advance', params: {} },
        },
      ],
    },
  ],
  rewards: [{ type: 'xp', params: { amount: 10 } }],
};

export const lateCaravanQuest: QuestDefinition = {
  id: 'the-late-caravan',
  name: 'The Late Caravan',
  // Offered on the quay, where the bad news physically arrives.
  triggers: [
    {
      event: 'world.zone.entered',
      condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'long-quay' } },
      effect: { type: 'offer', params: {} },
    },
  ],
  stages: [
    {
      id: 'find-out-what-is-owed',
      name: 'Find Out What Is Owed',
      description: 'Drell keeps the manifests. He will know how far past the date this has run.',
      objectives: ['Ask Harbourmaster Drell about the overdue consignment'],
      triggers: [
        {
          event: 'world.zone.entered',
          condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'customs-shed' } },
          effect: { type: 'advance', params: {} },
        },
      ],
    },
    {
      id: 'settle-or-default',
      name: 'Settle or Default',
      description: 'Buy out the obligation and keep your standing, or let it lapse and learn what the Warrens pay for a factor with nothing to lose',
      objectives: ['Resolve the overdue obligation, one way or the other'],
      triggers: [
        {
          event: 'world.zone.entered',
          condition: { type: 'payload-equals', params: { key: 'crooked-stair', value: 'crooked-stair' } },
          effect: { type: 'advance', params: {} },
        },
      ],
    },
  ],
  rewards: [{ type: 'xp', params: { amount: 20 } }],
};

export const standingAccountQuest: QuestDefinition = {
  id: 'the-standing-account',
  name: 'The Standing Account',
  triggers: [
    {
      event: 'world.zone.entered',
      condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'audit-chamber' } },
      effect: { type: 'offer', params: {} },
    },
  ],
  stages: [
    {
      id: 'answer-the-summons',
      name: 'Answer the Summons',
      description: 'The Crown has read your books. Now it wants to discuss them.',
      objectives: ['Face the Standing Account'],
      triggers: [
        {
          event: 'combat.entity.defeated',
          condition: { type: 'payload-equals', params: { key: 'entityId', value: 'the-standing-account' } },
          effect: { type: 'advance', params: {} },
        },
      ],
    },
  ],
  rewards: [{ type: 'xp', params: { amount: 30 } }],
};

export const merchantQuests: QuestDefinition[] = [openTheBooksQuest, lateCaravanQuest, standingAccountQuest];

// --- Progression ---

export const factorsCreditTree: ProgressionTreeDefinition = {
  id: 'factors-credit',
  name: "Factor's Credit",
  currency: 'xp',
  nodes: [
    {
      id: 'good-name',
      name: 'A Good Name',
      cost: 10,
      effects: [
        { type: 'stat-boost', params: { stat: 'standing', amount: 1 } },
        { type: 'resource-boost', params: { resource: 'liquidity', amount: 10 } },
      ],
    },
    {
      id: 'sharp-pencil',
      name: 'Sharp Pencil',
      cost: 15,
      effects: [
        { type: 'stat-boost', params: { stat: 'ledger', amount: 2 } },
      ],
    },
    {
      id: 'lines-of-credit',
      name: 'Lines of Credit',
      cost: 25,
      requires: ['good-name'],
      effects: [
        { type: 'resource-boost', params: { resource: 'liquidity', amount: 25 } },
        { type: 'grant-tag', params: { tag: 'creditworthy' } },
      ],
    },
    {
      id: 'silver-tongue',
      name: 'Silver Tongue',
      cost: 20,
      requires: ['sharp-pencil'],
      effects: [
        { type: 'stat-boost', params: { stat: 'tongue', amount: 2 } },
      ],
    },
  ],
};

export const xpAwards = {
  kill: 12,
  dialogueComplete: 5,
  firstVisit: 3,
  bossBonus: 15,
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
      e.payload.entityId === 'the-standing-account' ? 'boss:the-standing-account' : undefined),
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

export const readTheRoom: AbilityDefinition = {
  id: 'read-the-room',
  name: 'Read the Room',
  verb: 'use-ability',
  tags: ['commerce', 'utility'],
  costs: [{ resourceId: 'stamina', amount: 2 }],
  target: { type: 'self' },
  checks: [{ stat: 'ledger', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'actor', params: { statusId: 'sharp-eyed', duration: 3 } },
  ],
  cooldown: 3,
  requirements: [{ type: 'has-tag', params: { tag: 'merchant' } }],
  ui: {
    text: 'Take a breath and actually look at what is in front of you.',
    hitText: 'The room resolves into numbers. You can see who is desperate.',
    missText: 'Too much noise. Nothing separates out.',
    soundCue: 'ability.read-the-room',
  },
};

export const callTheDebt: AbilityDefinition = {
  id: 'call-the-debt',
  name: 'Call the Debt',
  verb: 'use-ability',
  tags: ['commerce', 'control'],
  costs: [{ resourceId: 'liquidity', amount: 8 }],
  target: { type: 'single' },
  checks: [{ stat: 'standing', difficulty: 7, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'called-out', duration: 3 } },
  ],
  cooldown: 4,
  requirements: [{ type: 'has-tag', params: { tag: 'merchant' } }],
  ui: {
    text: 'Name what they owe, out loud, where others can hear it.',
    hitText: 'The number lands in the open. They cannot un-hear it.',
    missText: 'They laugh it off. Nobody was listening anyway.',
    soundCue: 'ability.call-the-debt',
  },
};

export const cutLosses: AbilityDefinition = {
  id: 'cut-losses',
  name: 'Cut Losses',
  verb: 'use-ability',
  tags: ['commerce', 'defensive'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'self' },
  effects: [
    { type: 'resource-modify', target: 'actor', params: { resource: 'lien', amount: -6 } },
    { type: 'resource-modify', target: 'actor', params: { resource: 'coin', amount: -8 } },
  ],
  cooldown: 5,
  requirements: [{ type: 'has-tag', params: { tag: 'merchant' } }],
  ui: {
    text: 'Pay something down before it compounds. It always costs more than it should.',
    hitText: 'Coin goes out. The lien eases. Nobody thanks you.',
    missText: 'Nothing to pay down.',
    soundCue: 'ability.cut-losses',
  },
};

export const merchantAbilities: AbilityDefinition[] = [readTheRoom, callTheDebt, cutLosses];

// --- Status Definitions ---

export const merchantStatusDefinitions: StatusDefinition[] = [
  {
    id: 'sharp-eyed',
    name: 'Sharp-Eyed',
    tags: ['buff'],
    stacking: 'replace',
    duration: { type: 'ticks', value: 3 },
    ui: { icon: '\u{1F50E}', color: '#3498db', description: 'You are reading prices instead of hearing them' },
  },
  {
    id: 'called-out',
    name: 'Called Out',
    tags: ['control', 'debuff'],
    stacking: 'replace',
    duration: { type: 'ticks', value: 3 },
    ui: { icon: '\u{1F4DC}', color: '#e67e22', description: 'A debt named in public — hard to walk away from' },
  },
  {
    id: 'encumbered',
    name: 'Encumbered',
    tags: ['debuff', 'obligation'],
    stacking: 'replace',
    duration: { type: 'ticks', value: 4 },
    ui: { icon: '⛓', color: '#7f8c8d', description: 'Lien heavy enough that everyone can smell it' },
  },
];

// --- Pack Metadata ---

export const packMeta: PackMetadata = {
  id: 'salt-road-ledger',
  name: 'Salt Road Ledger',
  tagline: 'Every coin you are owed is a knife someone else is holding.',
  // 'mercantile' is a new PackGenre member (rubric dimension 7: no other pack
  // occupies this niche). Reusing an existing genre would pass the rubric on a
  // technicality while making the pack unfindable via filterPacks.
  genres: ['mercantile'],
  difficulty: 'advanced',
  // `comedic` is unused by all ten other packs, so this tone pair is unique
  // (rubric dimension 4). The register is wry-then-ruinous, not jokey.
  tones: ['comedic', 'tense'],
  tags: ['trade', 'debt', 'obligation', 'ledger', 'escrow', 'audio-coin-count'],
  engineVersion: '3.0.0',
  version: '3.5.0',
  description: 'Trade on someone else’s capital along the Salt Road. Appraise, haggle, and consign goods you do not own — then keep the liens from closing over you before the Crown audits your books.',
  narratorTone: 'mercantile, wry, precise about money, quietly ruinous',
};

// --- Build Catalog ---

export const buildCatalog: BuildCatalog = {
  packId: 'salt-road-ledger',
  statBudget: 3,
  maxTraits: 3,
  requiredFlaws: 1,
  archetypes: [
    {
      id: 'factor',
      name: 'Factor',
      description: 'Trades on another house’s capital — all the risk, a slice of the margin',
      statPriorities: { ledger: 5, tongue: 5, standing: 4 },
      startingTags: ['merchant', 'factor', 'indebted'],
      startingInventory: ['bale-of-flax', 'ledger-book'],
      progressionTreeId: 'factors-credit',
    },
    {
      id: 'assayer',
      name: 'Assayer',
      description: 'Reads true worth at a glance — harder to cheat, easier to resent',
      statPriorities: { ledger: 7, tongue: 3, standing: 4 },
      startingTags: ['merchant', 'assayer', 'exacting'],
      startingInventory: ['ledger-book', 'assayers-loupe'],
      progressionTreeId: 'factors-credit',
    },
    {
      id: 'runner',
      name: 'Runner',
      description: 'Moves goods where bonded traders will not — fast, unbonded, unloved',
      statPriorities: { ledger: 3, tongue: 6, standing: 2 },
      startingTags: ['merchant', 'runner', 'unbonded'],
      resourceOverrides: { liquidity: 60, standing: 2 },
      startingInventory: ['bale-of-flax'],
      progressionTreeId: 'factors-credit',
    },
  ],
  backgrounds: [
    {
      id: 'guild-apprentice',
      name: 'Guild Apprentice',
      description: 'Raised inside the Assay Guild — you know where the seals are kept',
      statModifiers: { ledger: 1, tongue: -1 },
      startingTags: ['guild-raised'],
    },
    {
      id: 'ruined-house',
      name: 'Ruined House',
      description: 'Your family name used to mean credit. Now it means caution.',
      statModifiers: { standing: 1, ledger: -1 },
      startingTags: ['fallen'],
    },
    {
      id: 'dock-hand',
      name: 'Dock Hand',
      description: 'You loaded the cargo before you ever priced it',
      statModifiers: { tongue: 1, standing: -1 },
      startingTags: ['harbour-known'],
    },
  ],
  traits: [
    {
      id: 'liquid',
      name: 'Liquid',
      description: 'You keep more of your capital movable than is strictly wise',
      category: 'perk',
      effects: [{ type: 'resource-modifier', resource: 'liquidity', amount: 15 }],
    },
    {
      id: 'unforgettable-face',
      name: 'Unforgettable Face',
      description: 'Everyone remembers you — creditors especially',
      category: 'perk',
      effects: [{ type: 'stat-modifier', stat: 'standing', amount: 1 }],
    },
    {
      id: 'over-extended',
      name: 'Over-Extended',
      description: 'You began this life already owing someone',
      category: 'flaw',
      effects: [{ type: 'resource-modifier', resource: 'lien', amount: 15 }],
    },
    {
      id: 'poor-liar',
      name: 'Poor Liar',
      description: 'Your face keeps your books for you',
      category: 'flaw',
      effects: [{ type: 'stat-modifier', stat: 'tongue', amount: -2 }],
    },
  ],
  // Every discipline here trades a real cost for its edge — the pack's thesis
  // applied to character creation. There is no free competence in a business
  // run on other people's money.
  disciplines: [
    {
      id: 'bonded-agent',
      name: 'Bonded Agent',
      description: 'Vouched for by the Guild — trusted with goods, watched more closely',
      grantedVerb: 'underwrite',
      passive: { type: 'stat-modifier', stat: 'standing', amount: 1 },
      drawback: { type: 'resource-modifier', resource: 'liquidity', amount: -10 },
    },
    {
      id: 'smuggler',
      name: 'Smuggler',
      description: 'Moves what the manifests do not mention',
      grantedVerb: 'haggle',
      passive: { type: 'resource-modifier', resource: 'liquidity', amount: 20 },
      drawback: { type: 'faction-modifier', faction: 'assay-guild', amount: -15 },
    },
  ],
  crossTitles: [
    { archetypeId: 'factor', disciplineId: 'bonded-agent', title: 'House Factor', tags: ['house-factor'] },
    { archetypeId: 'factor', disciplineId: 'smuggler', title: 'Quiet Partner', tags: ['quiet-partner'] },
    { archetypeId: 'assayer', disciplineId: 'bonded-agent', title: 'Guild Assayer', tags: ['guild-assayer'] },
    { archetypeId: 'assayer', disciplineId: 'smuggler', title: 'Crooked Scale', tags: ['crooked-scale'] },
    { archetypeId: 'runner', disciplineId: 'bonded-agent', title: 'Bonded Runner', tags: ['bonded-runner'] },
    { archetypeId: 'runner', disciplineId: 'smuggler', title: 'Salt Road Ghost', tags: ['salt-road-ghost'] },
  ],
  entanglements: [
    {
      id: 'bonded-smuggler',
      archetypeId: 'runner',
      disciplineId: 'smuggler',
      description: 'An unbonded runner who smuggles has no one to vouch for them at all — the Guild stops pretending not to notice',
      effects: [{ type: 'grant-tag', tag: 'guild-blacklisted' }],
    },
  ],
};

// --- Item Catalog ---
//
// Two families, deliberately separate. The FUNGIBLE goods are flat inventory
// ids — the layer trade-core moves and the ledger adapter's TradeableSnapshot
// tallies into fungible tokens. The UNIQUE INSTRUMENTS are equipment-catalog
// entries with provenance, and they are this pack's answer to "what is unique
// gear for someone who does not swing a sword": a seal, a writ, a deed.

export const itemCatalog: ItemCatalog = {
  items: [
    // ── Unique instruments (the NFT-natural layer) ────────────────────────
    {
      id: 'guild-seal',
      name: 'Guild Seal',
      description: 'A brass matrix and a stick of wax. It says a third party will hold goods against your word.',
      slot: 'trinket',
      rarity: 'legendary',
      statModifiers: { standing: 2 },
      grantedTags: ['bonded'],
      // The seal is what makes consignment possible at all — without it you are
      // cash-on-the-barrel only, which is the Warrens' whole pitch.
      grantedVerbs: ['consign'],
      provenance: {
        origin: 'The Assay Guild, Saltgate',
        factionId: 'assay-guild',
        flags: ['heirloom'],
        lore: 'Pressed over every contract you have honoured. The wax remembers.',
      },
    },
    {
      id: 'writ-of-passage',
      name: 'Writ of Passage',
      description: 'A stamped exemption from the Dockward tariff. Tradeable, which is precisely the problem.',
      slot: 'accessory',
      rarity: 'rare',
      statModifiers: { tongue: 1 },
      grantedTags: ['exempt'],
      provenance: {
        origin: 'Harbour Authority, Dockward',
        factionId: 'harbour-authority',
        flags: ['trophy'],
        lore: 'Signed by a harbourmaster who has since stopped signing things.',
      },
    },
    {
      id: 'deed-of-the-longshore',
      name: 'Deed of the Longshore',
      description: 'Title to a strip of wharf. It earns while you sleep, and it is the first thing collections will take.',
      slot: 'trinket',
      rarity: 'legendary',
      resourceModifiers: { liquidity: 10 },
      grantedTags: ['landed'],
      provenance: {
        origin: 'Longshore wharf, Dockward',
        flags: ['heirloom', 'trophy'],
        lore: 'Four generations of a family that no longer exists held this.',
      },
    },
    {
      id: 'ledger-book',
      name: 'Ledger Book',
      description: 'Your own hand, going back years. Required to audit anything, including yourself.',
      slot: 'tool',
      rarity: 'uncommon',
      statModifiers: { ledger: 1 },
      grantedVerbs: ['audit'],
      provenance: {
        origin: 'Kept since your apprenticeship',
        lore: 'The early pages are neater. Everyone’s are.',
      },
    },
    {
      id: 'assayers-loupe',
      name: "Assayer's Loupe",
      description: 'Ground glass in a brass barrel. Makes a lie about quality much harder to tell.',
      slot: 'tool',
      rarity: 'uncommon',
      statModifiers: { ledger: 2 },
      provenance: {
        origin: 'Assay Guild issue',
        factionId: 'assay-guild',
        lore: 'Numbered. They know which one you have.',
      },
    },

    // ── Fungible trade goods (the FT layer) ───────────────────────────────
    { id: 'bale-of-flax', name: 'Bale of Flax', description: 'Rough fibre, bound for a mill upriver.', slot: 'tool', rarity: 'common' },
    { id: 'salt-block', name: 'Salt Block', description: 'The road is named for it.', slot: 'tool', rarity: 'common' },
    { id: 'grain-sack', name: 'Grain Sack', description: 'Heavy, cheap, and always wanted somewhere.', slot: 'tool', rarity: 'common' },
    { id: 'pig-iron-ingot', name: 'Pig Iron Ingot', description: 'Crude metal, priced by weight and nothing else.', slot: 'tool', rarity: 'common' },
    { id: 'lamp-oil-cask', name: 'Lamp Oil Cask', description: 'Burns well. Also spills well.', slot: 'tool', rarity: 'common' },
    { id: 'apothecary-tincture', name: 'Apothecary Tincture', description: 'Small, valuable, and awkward to explain at customs.', slot: 'tool', rarity: 'uncommon' },
    { id: 'saffron-brick', name: 'Saffron Brick', description: 'Worth more than its weight in most metals.', slot: 'tool', rarity: 'rare' },
    { id: 'sealed-amphora', name: 'Sealed Amphora', description: 'Contents attested by a seal you did not press.', slot: 'tool', rarity: 'uncommon' },
    {
      id: 'unstamped-bullion',
      name: 'Unstamped Bullion',
      description: 'Metal with no mint mark. Legal to hold, difficult to hold innocently.',
      slot: 'tool',
      rarity: 'rare',
      provenance: { flags: ['contraband'], lore: 'Whoever melted this was careful about the marks.' },
    },
  ],
};
