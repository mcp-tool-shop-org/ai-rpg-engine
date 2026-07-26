// Salt Road Ledger — ruleset definition
//
// A factor of a small trading house. You do not own the goods you move; you owe
// for them. The whole pack lives in the gap between what you have promised and
// what you have delivered.
//
// Combat exists and is deliberately a BAD trade: HP tops out at 24 (the lowest
// in the catalog), and winning a fight means you damaged someone's property, so
// `lien` accrues either way. The combat stat mapping reflects that — a factor
// who ends up swinging does it by browbeating and backing, never by out-muscling
// anyone (see setup.ts's buildCombatStack config).

import type { RulesetDefinition } from '@ai-rpg-engine/core';

export const merchantMinimalRuleset: RulesetDefinition = {
  id: 'merchant-minimal',
  name: 'Merchant Minimal',
  version: '0.1.0',

  stats: [
    { id: 'ledger', name: 'Ledger', min: 1, max: 20, default: 6 },
    { id: 'tongue', name: 'Tongue', min: 1, max: 20, default: 6 },
    { id: 'standing', name: 'Standing', min: 1, max: 20, default: 4 },
  ],

  resources: [
    { id: 'hp', name: 'HP', min: 0, max: 24, default: 14 },
    { id: 'stamina', name: 'Stamina', min: 0, max: 40, default: 10, regenRate: 1 },
    // `coin` is what you HOLD. It is also the single field the entire opt-in
    // ledger layer reads (snapshotFromWorld reads entity.resources.coin), so it
    // is declared here AND carried on the player entity.
    { id: 'coin', name: 'Coin', min: 0, max: 9999, default: 40 },
    // `liquidity` is what you can DEPLOY without calling in a debt. Selling on
    // terms raises coin while consuming liquidity — the pack's central economic
    // idea and its rubric-distinct pressure. At 0 you do not die; every `haggle`
    // fails and every `consign` is refused.
    { id: 'liquidity', name: 'Liquidity', min: 0, max: 100, default: 45, regenRate: 1 },
    // `lien` is INVERSE — it accrues toward ruin, like Weird West's Dust, but
    // aimed at your assets rather than at you. Overdue consignments, lost
    // fights (property damage), underwriting claims that pay out. At 70 the
    // Assay Guild seizes a consigned asset; at 90 your Guild Seal is revoked.
    { id: 'lien', name: 'Lien', min: 0, max: 100, default: 0 },
  ],

  verbs: [
    { id: 'move', name: 'Move', description: 'Move to an adjacent area' },
    { id: 'inspect', name: 'Look Over', description: 'Examine an area, person, or object' },
    { id: 'attack', name: 'Fight', tags: ['combat'], description: 'Violence — always the worse trade' },
    { id: 'guard', name: 'Guard', tags: ['combat', 'defensive'], description: 'Take a defensive stance, reducing damage taken' },
    { id: 'brace', name: 'Brace', tags: ['combat', 'defensive'], description: 'Plant your footing to steady yourself and recover balance' },
    { id: 'reposition', name: 'Reposition', tags: ['combat', 'movement'], description: 'Shift position to outflank a target or escape a bad spot' },
    { id: 'disengage', name: 'Disengage', tags: ['combat', 'movement'], description: 'Attempt to break from combat and withdraw' },
    { id: 'use', name: 'Use', description: 'Use an item from inventory' },
    { id: 'equip', name: 'Equip', tags: ['equipment'], description: 'Carry an instrument or piece of gear openly' },
    { id: 'unequip', name: 'Unequip', tags: ['equipment'], description: 'Stow an equipped item back into your inventory' },
    { id: 'speak', name: 'Speak', tags: ['dialogue'], description: 'Open a conversation' },
    { id: 'choose', name: 'Choose', tags: ['dialogue'], description: 'Select a dialogue option' },
    { id: 'use-ability', name: 'Use Ability', tags: ['ability'], description: 'Call on a factor’s trained instinct' },

    // ── The five pack-native verbs (contract-core, P4) ──────────────────────
    // These are what makes this pack a different game rather than a reskin, and
    // `consign` is the one the ledger layer exists to meet: value held by a
    // third party, released at a future tick, refunded if the counterparty
    // defaults. Everywhere else in the catalog escrow is plumbing; here it is a
    // plot device.
    { id: 'appraise', name: 'Appraise', tags: ['commerce', 'inspect'], description: 'Read an item’s true worth, rarity, and provenance against the asking price' },
    { id: 'haggle', name: 'Haggle', tags: ['commerce', 'social'], description: 'Contest a price — spends liquidity, pits your tongue against their ledger' },
    { id: 'consign', name: 'Consign', tags: ['commerce', 'obligation'], description: 'Hand goods to a broker against future payment, creating an obligation with a due date' },
    { id: 'underwrite', name: 'Underwrite', tags: ['commerce', 'risk'], description: 'Take on another party’s risk for a fee — liquidity now, lien later if the claim fires' },
    { id: 'audit', name: 'Audit', tags: ['commerce', 'verify'], description: 'Reconcile your books against a district’s records and report the discrepancies' },

    // ── The trade surface (world-stack, ALWAYS registered) ──────────────────
    // Listed because this is a MERCHANT pack. buildWorldStack registers
    // buy/sell/salvage/craft/repair/modify unconditionally in every starter, and
    // most starters leave them off the help table — a defensible omission for a
    // gladiator, an absurd one here. A trade-first pack whose in-game `help`
    // never mentions `buy` is the V3R-MENU-3b defect wearing a different hat.
    { id: 'buy', name: 'Buy', tags: ['commerce', 'trade'], description: 'Purchase stock from the district’s merchants at the going rate' },
    { id: 'sell', name: 'Sell', tags: ['commerce', 'trade'], description: 'Sell goods into the local market — scarcity and provenance move the price' },
    { id: 'salvage', name: 'Salvage', tags: ['commerce', 'craft'], description: 'Break a damaged lot down for whatever the parts are still worth' },
    { id: 'craft', name: 'Grade', tags: ['commerce', 'craft'], description: 'Sort a mixed consignment into a graded lot worth more than its parts' },
    { id: 'repair', name: 'Recooper', tags: ['commerce', 'craft'], description: 'Restore a damaged consignment to saleable condition' },
    { id: 'modify', name: 'Seal Under Mark', tags: ['commerce', 'craft'], description: 'Press an authority’s mark onto a lot — provenance outsells contents' },

    // ── Party + social surface (world-stack, ALWAYS registered) ─────────────
    // Every id below has a real registered handler (companion-core and
    // player-leverage are unconditionally included by buildWorldStack), so this
    // list stays verb-honest in BOTH directions: nothing advertised that does
    // not work, and nothing working that a player cannot discover.
    { id: 'recruit', name: 'Take On', tags: ['party'], description: 'Offer a willing person in your zone a place on the payroll' },
    { id: 'bribe', name: 'Bribe', tags: ['social', 'leverage'], description: 'Spend favor to ease tension with the faction controlling your district' },
    { id: 'intimidate', name: 'Intimidate', tags: ['social', 'leverage'], description: 'Spend heat to press the controlling faction into compliance' },
    { id: 'petition', name: 'Petition', tags: ['social', 'leverage'], description: 'Spend legitimacy to formally petition the controlling faction' },
    { id: 'call-in-favor', name: 'Call in a Favor', tags: ['social', 'leverage'], description: 'Spend debt and favor to restore access or standing with a faction' },
    { id: 'recruit-ally', name: 'Recruit an Ally', tags: ['social', 'leverage'], description: 'Spend favor and influence to win a new ally within a faction' },
    { id: 'disguise', name: 'Go Grey', tags: ['social', 'leverage'], description: 'Spend influence to shed heat and lower alert' },
    { id: 'stake-claim', name: 'Stake a Claim', tags: ['social', 'leverage'], description: 'Spend influence and legitimacy to assert standing where you stand' },
    { id: 'seed', name: 'Seed a Rumor', tags: ['social', 'rumor'], description: 'Spend influence to start a rumor about yourself' },
    { id: 'deny', name: 'Deny', tags: ['social', 'rumor'], description: 'Spend legitimacy to deny an existing rumor by id' },
    { id: 'frame', name: 'Frame', tags: ['social', 'rumor'], description: 'Spend blackmail and heat to frame a target with fabricated paperwork' },
    { id: 'claim-false-credit', name: 'Claim False Credit', tags: ['social', 'rumor'], description: 'Spend influence to claim credit for a deal that was not yours' },
    { id: 'bury-scandal', name: 'Bury a Scandal', tags: ['social', 'rumor'], description: "Spend favor and influence to accelerate a rumor's decay" },
    { id: 'leak-truth', name: 'Leak the Truth', tags: ['social', 'rumor'], description: 'Spend blackmail to leak an uncomfortable truth' },
    { id: 'spread-counter-rumor', name: 'Spread a Counter-Rumor', tags: ['social', 'rumor'], description: 'Spend influence to spread a counter-rumor' },
    { id: 'request-meeting', name: 'Request a Meeting', tags: ['social', 'diplomacy'], description: 'Spend favor to request a meeting with the controlling faction' },
    { id: 'improve-standing', name: 'Improve Standing', tags: ['social', 'diplomacy'], description: 'Spend favor to improve standing with the controlling faction' },
    { id: 'cash-milestone', name: 'Cash in a Milestone', tags: ['social', 'diplomacy'], description: 'Convert accrued legitimacy into reputation with a faction' },
    { id: 'negotiate-access', name: 'Negotiate Access', tags: ['social', 'diplomacy'], description: 'Spend favor and legitimacy to negotiate access with a faction' },
    { id: 'trade-secret', name: 'Trade a Secret', tags: ['social', 'diplomacy'], description: 'Spend blackmail to trade a secret with a faction' },
    { id: 'temporary-alliance', name: 'Propose a Temporary Alliance', tags: ['social', 'diplomacy'], description: 'Spend favor and influence to propose a temporary alliance' },
    { id: 'broker-truce', name: 'Broker a Truce', tags: ['social', 'diplomacy'], description: 'Spend influence and legitimacy to broker a truce between factions' },
    { id: 'sabotage', name: 'Sabotage', tags: ['social', 'sabotage'], description: 'Spend blackmail to sabotage something in your district' },
    { id: 'plant-evidence', name: 'Plant Evidence', tags: ['social', 'sabotage'], description: 'Spend blackmail to plant false records against a target' },
    { id: 'blackmail-target', name: 'Blackmail a Target', tags: ['social', 'sabotage'], description: 'Spend blackmail to force a target into compliance' },
    { id: 'incite-riot', name: 'Incite a Riot', tags: ['social', 'sabotage'], description: 'Spend blackmail and influence to incite a riot in your district' },
  ],

  formulas: [
    {
      id: 'appraisal-accuracy',
      name: 'Appraisal Accuracy',
      description: 'How close your read lands: ledger vs the item’s rarity',
      inputs: ['actor.ledger', 'item.rarity'],
      output: 'number (0-100)',
    },
    {
      id: 'haggle-margin',
      name: 'Haggle Margin',
      description: 'Price movement won: actor tongue vs counterparty ledger, clamped',
      inputs: ['actor.tongue', 'target.ledger'],
      output: 'number (percent, signed)',
    },
    {
      id: 'lien-accrual',
      name: 'Lien Accrual',
      description: 'Lien gained from an overdue obligation: overdue ticks × value ÷ 10',
      inputs: ['obligation.value', 'obligation.overdueTicks'],
      output: 'number',
    },
    {
      id: 'seizure-threshold',
      name: 'Seizure Threshold',
      description: 'The lien level at which the Assay Guild seizes a consigned asset',
      inputs: [],
      output: 'number',
    },
  ],

  defaultModules: [
    'traversal-core',
    'status-core',
    'combat-core',
    'inventory-core',
    'dialogue-core',
  ],

  progressionModels: [],

  contentConventions: {
    entityTypes: ['player', 'npc', 'factor', 'enemy', 'clerk'],
    statusTags: ['buff', 'debuff', 'obligation', 'reputation'],
    combatTags: ['melee', 'improvised', 'collections'],
  },
};
