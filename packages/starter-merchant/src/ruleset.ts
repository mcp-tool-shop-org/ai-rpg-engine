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
