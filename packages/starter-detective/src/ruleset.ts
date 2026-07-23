// Gaslight Detective — ruleset definition

import type { RulesetDefinition } from '@ai-rpg-engine/core';

export const detectiveMinimalRuleset: RulesetDefinition = {
  id: 'detective-minimal',
  name: 'Detective Minimal',
  version: '0.1.0',

  stats: [
    { id: 'perception', name: 'Perception', min: 1, max: 20, default: 6 },
    { id: 'eloquence', name: 'Eloquence', min: 1, max: 20, default: 5 },
    { id: 'grit', name: 'Grit', min: 1, max: 20, default: 4 },
  ],

  resources: [
    { id: 'hp', name: 'HP', min: 0, max: 30, default: 15 },
    // T0-tag-gate follow-on: every detective ability costs stamina, and the
    // prebuilt inspector carries it — but the ruleset never declared it, so
    // CREATED characters (whose resources come from ruleset defaults) started
    // with no stamina at all and could never afford a single ability.
    { id: 'stamina', name: 'Stamina', min: 0, max: 50, default: 10, regenRate: 1 },
    { id: 'composure', name: 'Composure', min: 0, max: 20, default: 12, regenRate: 1 },
    // F-92c78519: the trade-core buy/sell currency — declared here so the
    // HUD/status surfaces treat it like every other tracked resource.
    { id: 'coin', name: 'Coin', min: 0, max: 500, default: 0 },
  ],

  verbs: [
    { id: 'move', name: 'Move', description: 'Move to an adjacent location' },
    { id: 'inspect', name: 'Inspect', description: 'Examine an object, person, or scene for clues' },
    { id: 'attack', name: 'Strike', tags: ['combat'], description: 'Physical confrontation' },
    { id: 'guard', name: 'Guard', tags: ['combat', 'defensive'], description: 'Take a defensive stance, reducing damage taken' },
    { id: 'brace', name: 'Brace', tags: ['combat', 'defensive'], description: 'Plant your footing to steady yourself and recover balance' },
    { id: 'reposition', name: 'Reposition', tags: ['combat', 'movement'], description: 'Shift position to outflank a target or escape a bad spot' },
    { id: 'disengage', name: 'Disengage', tags: ['combat', 'movement'], description: 'Attempt to break from combat and withdraw' },
    { id: 'use', name: 'Use', description: 'Use an item from inventory' },
    { id: 'equip', name: 'Equip', tags: ['equipment'], description: 'Ready gear from your inventory (bare "equip" readies your only piece)' },
    { id: 'unequip', name: 'Unequip', tags: ['equipment'], description: 'Stow an equipped item back into your inventory' },
    { id: 'speak', name: 'Speak', tags: ['dialogue'], description: 'Engage in conversation' },
    { id: 'choose', name: 'Choose', tags: ['dialogue'], description: 'Select a dialogue option' },
    { id: 'use-ability', name: 'Use Ability', tags: ['ability'], description: 'Use a special ability' },
    // v3.0 wave-3 (menu-social-fix, V3R-MENU-3b): recruit (companion-core.ts)
    // and all 25 player-leverage.ts verbs were registered — and reachable via
    // free text — in earlier waves but never listed here, so in-game `help`
    // never taught them. Every id below has a real registered handler
    // (companion-core/player-leverage are BOTH always included in this
    // starter's world stack, unconditionally — world-stack.ts's own "ALWAYS
    // included, no config" contract), so this list stays verb-honest the
    // same way T0-verb-honesty-content's removal of unregistered flavor rows
    // (above) already is.
    { id: 'recruit', name: 'Recruit', tags: ['party'], description: 'Ask a willing NPC in your zone to join your party' },
    { id: 'bribe', name: 'Bribe', tags: ['social', 'leverage'], description: 'Spend favor to ease tension with the faction controlling your district' },
    { id: 'intimidate', name: 'Intimidate', tags: ['social', 'leverage'], description: 'Spend heat to threaten the controlling faction into compliance' },
    { id: 'petition', name: 'Petition', tags: ['social', 'leverage'], description: 'Spend legitimacy to formally petition the controlling faction' },
    { id: 'call-in-favor', name: 'Call in a Favor', tags: ['social', 'leverage'], description: 'Spend debt and favor to restore access or standing with a faction' },
    { id: 'recruit-ally', name: 'Recruit an Ally', tags: ['social', 'leverage'], description: 'Spend favor and influence to win a new ally within a faction' },
    { id: 'disguise', name: 'Disguise', tags: ['social', 'leverage'], description: 'Spend influence to shed heat and lower alert' },
    { id: 'stake-claim', name: 'Stake a Claim', tags: ['social', 'leverage'], description: 'Spend influence and legitimacy to assert dominance where you stand' },
    { id: 'seed', name: 'Seed a Rumor', tags: ['social', 'rumor'], description: 'Spend influence to start a rumor about yourself' },
    { id: 'deny', name: 'Deny', tags: ['social', 'rumor'], description: 'Spend legitimacy to deny an existing rumor by id' },
    { id: 'frame', name: 'Frame', tags: ['social', 'rumor'], description: 'Spend blackmail and heat to frame a target with fabricated evidence' },
    { id: 'claim-false-credit', name: 'Claim False Credit', tags: ['social', 'rumor'], description: 'Spend influence to claim credit for a deed that was not yours' },
    { id: 'bury-scandal', name: 'Bury a Scandal', tags: ['social', 'rumor'], description: "Spend favor and influence to accelerate an existing rumor's decay" },
    { id: 'leak-truth', name: 'Leak the Truth', tags: ['social', 'rumor'], description: 'Spend blackmail to leak an uncomfortable truth' },
    { id: 'spread-counter-rumor', name: 'Spread a Counter-Rumor', tags: ['social', 'rumor'], description: 'Spend influence to spread a counter-rumor' },
    { id: 'request-meeting', name: 'Request a Meeting', tags: ['social', 'diplomacy'], description: 'Spend favor to request a meeting with the controlling faction' },
    { id: 'improve-standing', name: 'Improve Standing', tags: ['social', 'diplomacy'], description: 'Spend favor to improve standing with the controlling faction' },
    { id: 'cash-milestone', name: 'Cash in a Milestone', tags: ['social', 'diplomacy'], description: 'Spend accrued legitimacy to convert a milestone into reputation with a faction' },
    { id: 'negotiate-access', name: 'Negotiate Access', tags: ['social', 'diplomacy'], description: 'Spend favor and legitimacy to negotiate access with a faction' },
    { id: 'trade-secret', name: 'Trade a Secret', tags: ['social', 'diplomacy'], description: 'Spend blackmail to trade a secret with a faction' },
    { id: 'temporary-alliance', name: 'Propose a Temporary Alliance', tags: ['social', 'diplomacy'], description: 'Spend favor and influence to propose a temporary alliance' },
    { id: 'broker-truce', name: 'Broker a Truce', tags: ['social', 'diplomacy'], description: 'Spend influence and legitimacy to broker a truce with a faction' },
    { id: 'sabotage', name: 'Sabotage', tags: ['social', 'sabotage'], description: 'Spend blackmail to sabotage something in your district' },
    { id: 'plant-evidence', name: 'Plant Evidence', tags: ['social', 'sabotage'], description: 'Spend blackmail to plant false evidence against a target' },
    { id: 'blackmail-target', name: 'Blackmail a Target', tags: ['social', 'sabotage'], description: 'Spend blackmail to force a target into compliance' },
    { id: 'incite-riot', name: 'Incite a Riot', tags: ['social', 'sabotage'], description: 'Spend blackmail and influence to incite a riot in your district' },
  ],

  formulas: [
    {
      id: 'hit-chance',
      name: 'Hit Chance',
      description: 'Attacker grit vs target grit',
      inputs: ['attacker.grit', 'target.grit'],
      output: 'number (0-100)',
    },
    {
      id: 'damage',
      name: 'Damage',
      description: 'Base: attacker grit, minimum 1',
      inputs: ['attacker.grit'],
      output: 'number',
    },
    {
      id: 'guard-reduction',
      name: 'Guard Reduction',
      description: 'Fraction of damage absorbed when guarded (default 0.5)',
      inputs: ['defender.grit'],
      output: 'number (0-1)',
    },
    {
      id: 'disengage-chance',
      name: 'Disengage Chance',
      description: 'Success chance: 40 + perception*5 + eloquence*2, clamped 15-90',
      inputs: ['actor.eloquence', 'actor.perception'],
      output: 'number (0-100)',
    },
    {
      id: 'interrogation-success',
      name: 'Interrogation Success',
      description: 'Eloquence vs target composure',
      inputs: ['attacker.eloquence', 'target.composure'],
      output: 'number (0-100)',
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
    entityTypes: ['player', 'npc', 'suspect', 'enemy'],
    statusTags: ['buff', 'debuff', 'social', 'evidence'],
    combatTags: ['melee', 'brawl'],
  },
};
