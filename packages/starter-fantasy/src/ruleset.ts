// Fantasy Minimal Ruleset — declarative contract for chapel-threshold and similar content

import type { RulesetDefinition } from '@ai-rpg-engine/core';

export const fantasyMinimalRuleset: RulesetDefinition = {
  id: 'fantasy-minimal',
  name: 'Fantasy Minimal',
  version: '0.1.0',

  stats: [
    { id: 'vigor', name: 'Vigor', min: 1, max: 20, default: 5 },
    { id: 'instinct', name: 'Instinct', min: 1, max: 20, default: 5 },
    { id: 'will', name: 'Will', min: 1, max: 20, default: 5 },
  ],

  resources: [
    { id: 'hp', name: 'HP', min: 0, max: 100, default: 20 },
    { id: 'stamina', name: 'Stamina', min: 0, max: 50, default: 10, regenRate: 1 },
    // F-92c78519: declared for HUD/status-surface consistency with every
    // other tracked resource above — not required for trade-core's buy/sell
    // verbs themselves (they read/write entity.resources.coin directly and
    // clamp min-0/open-ceiling even when undeclared, per WorldStore's own
    // legacy-contract fallback), but every other resource the player carries
    // already has a ruleset declaration, and coin shouldn't be the exception.
    { id: 'coin', name: 'Coin', min: 0, max: 500, default: 0 },
  ],

  verbs: [
    { id: 'move', name: 'Move', description: 'Travel to an adjacent zone' },
    { id: 'inspect', name: 'Inspect', description: 'Examine your surroundings or a target' },
    { id: 'attack', name: 'Attack', tags: ['combat'], description: 'Strike a target in melee' },
    { id: 'guard', name: 'Guard', tags: ['combat', 'defensive'], description: 'Take a defensive stance, reducing damage taken' },
    { id: 'brace', name: 'Brace', tags: ['combat', 'defensive'], description: 'Plant your footing to steady yourself and recover balance' },
    { id: 'reposition', name: 'Reposition', tags: ['combat', 'movement'], description: 'Shift position to outflank a target or escape a bad spot' },
    { id: 'disengage', name: 'Disengage', tags: ['combat', 'movement'], description: 'Attempt to break from combat and withdraw' },
    { id: 'use', name: 'Use', description: 'Use an item from your inventory' },
    { id: 'equip', name: 'Equip', tags: ['equipment'], description: 'Ready gear from your inventory (bare "equip" readies your only piece)' },
    { id: 'unequip', name: 'Unequip', tags: ['equipment'], description: 'Stow an equipped item back into your inventory' },
    { id: 'speak', name: 'Speak', tags: ['dialogue'], description: 'Initiate dialogue with an NPC' },
    { id: 'choose', name: 'Choose', tags: ['dialogue'], description: 'Select a dialogue option' },
    { id: 'use-ability', name: 'Use Ability', tags: ['ability'], description: 'Activate a special ability or power' },
    // v3.0 wave-3 (menu-social-fix, V3R-MENU-3b): recruit (companion-core.ts)
    // and all 25 player-leverage.ts verbs were registered — and reachable via
    // free text — in earlier waves but never listed here, so in-game `help`
    // never taught them. Every id below has a real registered handler
    // (companion-core/player-leverage are BOTH always included in this
    // starter's world stack, unconditionally — world-stack.ts's own "ALWAYS
    // included, no config" contract), so this list stays verb-honest the
    // same way T0-verb-honesty-content's removal of unregistered flavor rows
    // (elsewhere in this codebase's other starters) already is.
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
      description: 'Base: 50 + attacker.instinct*5 - target.instinct*3, clamped 5-95',
      inputs: ['attacker.instinct', 'target.instinct'],
      output: 'number (0-100)',
    },
    {
      id: 'damage',
      name: 'Damage',
      description: 'Base: attacker.vigor, minimum 1',
      inputs: ['attacker.vigor'],
      output: 'number',
    },
    {
      id: 'guard-reduction',
      name: 'Guard Reduction',
      description: 'Fraction of damage absorbed when guarded (default 0.5)',
      inputs: ['defender.vigor'],
      output: 'number (0-1)',
    },
    {
      id: 'disengage-chance',
      name: 'Disengage Chance',
      description: 'Success chance: 40 + instinct*5 + will*2, clamped 15-90',
      inputs: ['actor.instinct', 'actor.will'],
      output: 'number (0-100)',
    },
    {
      id: 'consecrate-chance',
      name: 'Consecrate Chance',
      description: 'Base: 40 + actor.will*5, clamped 10-95',
      inputs: ['actor.will'],
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
    entityTypes: ['player', 'npc', 'enemy', 'item'],
    statusTags: ['buff', 'debuff', 'curse', 'blessing'],
    combatTags: ['melee', 'ranged', 'magic'],
  },
};
