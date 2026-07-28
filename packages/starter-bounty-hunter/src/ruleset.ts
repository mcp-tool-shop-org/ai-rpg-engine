// Hue and Cry — ruleset definition
//
// You are a THIEF-TAKER in a city that has no police force and does not want
// one. Nobody pays you a wage. You are paid by the head, by whoever wants that
// head, and the two halves of the city that want heads are the bounty office
// and the underworld — often for the same name, sometimes on the same day.
//
// "Hue and cry" is the actual institution: the legal duty of every bystander to
// join a pursuit once it is raised. It is also, exactly, this engine's heat
// doctrine in period language — heat decides whether the world is PAYING
// ATTENTION, and standing decides whether it remembers afterward. The pack is
// authored WITH that doctrine rather than around it: noise raises the cry,
// quiet lets it die, and what you are known for outlives both.
//
// The pack's own pressure is a TWO-SIDED reputation, which is what makes it a
// different game rather than a reskin. `warrant` is legal cover — what lets you
// take a person lawfully instead of just hurting them. `infamy` is the
// underworld's read of you. Working the office raises one and spends the other;
// working the street does the reverse. Neither is heat: heat asks "is anyone
// looking right now", these two ask "which half of this city will open a door
// to you". A thief-taker who lets either hit zero has stopped being a
// thief-taker in one direction or the other.

import type { RulesetDefinition } from '@ai-rpg-engine/core';

export const bountyHunterMinimalRuleset: RulesetDefinition = {
  id: 'bounty-hunter-minimal',
  name: 'Bounty Hunter Minimal',
  version: '0.1.0',

  stats: [
    // What you can do to a man who does not want to be taken.
    { id: 'grip', name: 'Grip', min: 1, max: 20, default: 7 },
    // Reading a room, a ledger, a lie. The thief-taker's real trade.
    { id: 'nose', name: 'Nose', min: 1, max: 20, default: 7 },
    // Whether the room believes you have the right to be doing this.
    { id: 'authority', name: 'Authority', min: 1, max: 20, default: 5 },
  ],

  resources: [
    // Higher than the factor's 24: you take people for a living and the work
    // is physical. Still well under a soldier's — a thief-taker who trades
    // blows with three men is a thief-taker who has lost the thread.
    { id: 'hp', name: 'HP', min: 0, max: 32, default: 20 },
    { id: 'stamina', name: 'Stamina', min: 0, max: 40, default: 14 },
    { id: 'coin', name: 'Coin', min: 0, max: 9999, default: 25 },
    // Legal cover. Spent to take someone lawfully (`collar`) and to put your
    // own price on a name (`post-bounty`); restored by delivering marks and by
    // testifying (`impeach`). At 0 the office will not deal with you and every
    // taking is just an assault — which is the difference between a
    // thief-taker and a kidnapper, and the pack wants that line legible.
    { id: 'warrant', name: 'Warrant', min: 0, max: 100, default: 40 },
    // What the other half of the city thinks you are. Rises when you work the
    // street (`fence`, `informant`), falls when you work the office
    // (`impeach`). High infamy buys you names nobody will give a constable;
    // it also means the bounty office starts reading YOUR name on its own
    // board. Deliberately NOT a ruin meter — there is no losing value, only a
    // side you are drifting toward.
    { id: 'infamy', name: 'Infamy', min: 0, max: 100, default: 20 },
  ],

  verbs: [
    { id: 'move', name: 'Move', description: 'Move to an adjacent area' },
    { id: 'inspect', name: 'Look Over', description: 'Examine an area, person, or object' },
    { id: 'attack', name: 'Fight', tags: ['combat'], description: 'Put hands on someone — the last resort, and the loudest' },
    { id: 'guard', name: 'Guard', tags: ['combat', 'defensive'], description: 'Take a defensive stance, reducing damage taken' },
    { id: 'brace', name: 'Brace', tags: ['combat', 'defensive'], description: 'Plant your footing to steady yourself and recover balance' },
    { id: 'reposition', name: 'Reposition', tags: ['combat', 'movement'], description: 'Shift position to outflank a target or escape a bad spot' },
    { id: 'disengage', name: 'Disengage', tags: ['combat', 'movement'], description: 'Attempt to break from combat and withdraw' },
    { id: 'use', name: 'Use', description: 'Use an item from inventory' },
    { id: 'give', name: 'Hand Over', description: 'Pass something into another party’s hands' },
    { id: 'equip', name: 'Equip', tags: ['equipment'], description: 'Carry a tool or piece of gear openly' },
    { id: 'unequip', name: 'Unequip', tags: ['equipment'], description: 'Stow an equipped item back into your inventory' },
    { id: 'speak', name: 'Speak', tags: ['dialogue'], description: 'Open a conversation' },
    { id: 'choose', name: 'Choose', tags: ['dialogue'], description: 'Select a dialogue option' },
    { id: 'use-ability', name: 'Use Ability', tags: ['ability'], description: 'Call on a thief-taker’s trained instinct' },

    // ── The six pack-native verbs (pursuit-core) ────────────────────────────
    // These are the pack. Each one is a different answer to the same question —
    // how do you find a man in a city that will not help you — and each one
    // costs you standing with one half of the city to buy it from the other.
    { id: 'post-bounty', name: 'Post a Bounty', tags: ['pursuit', 'office'], description: 'Put your own price on a name — spends warrant, and makes your grudge into other people’s work' },
    { id: 'informant', name: 'Buy a Word', tags: ['pursuit', 'street'], description: 'Pay the street for a mark’s whereabouts — buys the location, and tells the street you are looking' },
    { id: 'fence', name: 'Fence', tags: ['pursuit', 'street'], description: 'Move recovered goods through the crooked market — coin now, and the underworld counts you a friend' },
    { id: 'lay-low', name: 'Lie Low', tags: ['pursuit', 'quiet'], description: 'Spend a day out of sight and let the cry die down' },
    { id: 'collar', name: 'Collar', tags: ['pursuit', 'office'], description: 'Take a mark alive under warrant — the lawful taking, and the one the office will pay for' },
    { id: 'impeach', name: 'Impeach', tags: ['pursuit', 'office'], description: 'Testify against a mark you took — turns a body into a conviction, and a conviction into standing' },

    // ── The trade surface (world-stack, ALWAYS registered) ──────────────────
    // Listed for the same reason merchant lists them: buildWorldStack registers
    // these in every starter, and a pack whose whole economy is "get paid for
    // a name, spend it on informants and gear" cannot leave buy/sell off its
    // own help table.
    { id: 'buy', name: 'Buy', tags: ['trade'], description: 'Buy from whoever is selling in this district' },
    { id: 'sell', name: 'Sell', tags: ['trade'], description: 'Sell openly, at the going rate, where the ledger can see it' },
    { id: 'salvage', name: 'Strip', tags: ['craft'], description: 'Break something down for the parts that are still worth carrying' },
    { id: 'craft', name: 'Make Up', tags: ['craft'], description: 'Put together a tool of the trade from what you have' },
    { id: 'repair', name: 'Mend', tags: ['craft'], description: 'Mend gear that has been used the way this work uses gear' },
    { id: 'modify', name: 'Fit Out', tags: ['craft'], description: 'Alter a tool for the way you actually work' },

    // ── Party + social surface (world-stack, ALWAYS registered) ─────────────
    { id: 'recruit', name: 'Take On', tags: ['party'], description: 'Offer a willing person in your zone a share of the next taking' },
    { id: 'bribe', name: 'Bribe', tags: ['social', 'leverage'], description: 'Spend favor to ease tension with the faction that runs this ground' },
    { id: 'intimidate', name: 'Intimidate', tags: ['social', 'leverage'], description: 'Spend heat to press the controlling faction into compliance' },
    { id: 'petition', name: 'Petition', tags: ['social', 'leverage'], description: 'Spend legitimacy to formally petition the controlling faction' },
    { id: 'call-in-favor', name: 'Call in a Favor', tags: ['social', 'leverage'], description: 'Spend debt and favor to restore access or standing with a faction' },
    { id: 'recruit-ally', name: 'Recruit an Ally', tags: ['social', 'leverage'], description: 'Spend favor and influence to win a new ally within a faction' },
    { id: 'disguise', name: 'Go Grey', tags: ['social', 'leverage'], description: 'Spend influence to shed heat and lower alert' },
    { id: 'stake-claim', name: 'Stake a Claim', tags: ['social', 'leverage'], description: 'Spend influence and legitimacy to assert standing where you stand' },
    { id: 'seed', name: 'Seed a Rumor', tags: ['social', 'rumor'], description: 'Spend influence to start a rumor about yourself' },
    { id: 'deny', name: 'Deny', tags: ['social', 'rumor'], description: 'Spend legitimacy to deny an existing rumor by id' },
    { id: 'frame', name: 'Frame', tags: ['social', 'rumor'], description: 'Spend blackmail and heat to hang a charge on someone who did not earn it' },
    { id: 'claim-false-credit', name: 'Claim False Credit', tags: ['social', 'rumor'], description: 'Spend influence to claim a taking that was not yours' },
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
    { id: 'plant-evidence', name: 'Plant Evidence', tags: ['social', 'sabotage'], description: 'Spend blackmail to put something incriminating where it will be found' },
    { id: 'blackmail-target', name: 'Blackmail a Target', tags: ['social', 'sabotage'], description: 'Spend blackmail to force a target into compliance' },
    { id: 'incite-riot', name: 'Incite a Riot', tags: ['social', 'sabotage'], description: 'Spend blackmail and influence to raise the district against itself' },
  ],

  formulas: [
    {
      id: 'pursuit-state',
      name: 'Pursuit State',
      description: 'HUNTED / SEARCHED / COLD, derived from heat and the highest faction alert',
      inputs: ['world.player_heat', 'faction.alertLevel'],
      output: 'string (HUNTED | SEARCHED | COLD)',
    },
    {
      id: 'informant-price',
      name: 'Informant Price',
      description: 'What a word costs: base price against your infamy — the street charges strangers more',
      inputs: ['actor.infamy'],
      output: 'number (coin)',
    },
    {
      id: 'collar-difficulty',
      name: 'Collar Difficulty',
      description: 'Taking a mark alive: your grip and warrant against their condition',
      inputs: ['actor.grip', 'actor.warrant', 'target.resources.hp'],
      output: 'number (0-100)',
    },
    {
      id: 'blood-money',
      name: 'Blood Money',
      description: 'What a conviction pays, and the statutory reward a Tyburn ticket is worth',
      inputs: ['mark.notoriety'],
      output: 'number (coin)',
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
    // Shipped truth, declared FIRST rather than widened later (PCC-1). Every
    // pack in this catalog boots exactly `player`/`npc`/`enemy`, whatever its
    // flavour vocabulary says, and the twelfth is not going to pretend
    // otherwise — the flavour words live in tags, where content can read them.
    entityTypes: ['player', 'npc', 'enemy'],
    statusTags: ['buff', 'debuff', 'pursuit', 'control', 'reputation'],
    // ⚠ DECLARED, AND KNOWN TO HAVE NO CARRIER. PCC-1 measured this: no pack's
    // content model has a field these describe, and the honest disposition is
    // a coverage table with an owner rather than a conformance gate that can
    // never fail. Declared here so the twelfth pack sits in that table like
    // every other, rather than dodging the measurement by staying silent.
    combatTags: ['grapple', 'improvised', 'pursuit'],
  },
};
