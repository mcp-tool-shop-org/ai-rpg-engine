// Pack registry — imports all starter packs and exposes them for selection

import type { Engine, RulesetDefinition } from '@ai-rpg-engine/core';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import type { ProgressionTreeDefinition } from '@ai-rpg-engine/content-schema';

import * as fantasy from '@ai-rpg-engine/starter-fantasy';
import * as cyberpunk from '@ai-rpg-engine/starter-cyberpunk';
import * as detective from '@ai-rpg-engine/starter-detective';
import * as pirate from '@ai-rpg-engine/starter-pirate';
import * as zombie from '@ai-rpg-engine/starter-zombie';
import * as weirdWest from '@ai-rpg-engine/starter-weird-west';
import * as colony from '@ai-rpg-engine/starter-colony';
import * as vampire from '@ai-rpg-engine/starter-vampire';
import * as gladiator from '@ai-rpg-engine/starter-gladiator';
import * as ronin from '@ai-rpg-engine/starter-ronin';

export type PackInfo = {
  meta: PackMetadata;
  buildCatalog: BuildCatalog;
  ruleset: RulesetDefinition;
  createGame: (seed?: number) => Engine;
  /**
   * The pack's progression trees (F1d): powers the in-game "Advance" menu —
   * XP-affordable node unlocks submitted through progression-core's `unlock`
   * verb. Each starter exports exactly one tree today.
   */
  progressionTrees: ProgressionTreeDefinition[];
};

export const allPacks: PackInfo[] = [
  {
    meta: fantasy.packMeta,
    buildCatalog: fantasy.buildCatalog,
    ruleset: fantasy.fantasyMinimalRuleset,
    createGame: fantasy.createGame,
    progressionTrees: [fantasy.combatMasteryTree],
  },
  {
    meta: cyberpunk.packMeta,
    buildCatalog: cyberpunk.buildCatalog,
    ruleset: cyberpunk.cyberpunkMinimalRuleset,
    createGame: cyberpunk.createGame,
    progressionTrees: [cyberpunk.netrunningTree],
  },
  {
    meta: detective.packMeta,
    buildCatalog: detective.buildCatalog,
    ruleset: detective.detectiveMinimalRuleset,
    createGame: detective.createGame,
    progressionTrees: [detective.deductionTree],
  },
  {
    meta: pirate.packMeta,
    buildCatalog: pirate.buildCatalog,
    ruleset: pirate.pirateMinimalRuleset,
    createGame: pirate.createGame,
    progressionTrees: [pirate.seamanshipTree],
  },
  {
    meta: zombie.packMeta,
    buildCatalog: zombie.buildCatalog,
    ruleset: zombie.zombieMinimalRuleset,
    createGame: zombie.createGame,
    progressionTrees: [zombie.survivalTree],
  },
  {
    meta: weirdWest.packMeta,
    buildCatalog: weirdWest.buildCatalog,
    ruleset: weirdWest.weirdWestMinimalRuleset,
    createGame: weirdWest.createGame,
    progressionTrees: [weirdWest.gunslingerTree],
  },
  {
    meta: colony.packMeta,
    buildCatalog: colony.buildCatalog,
    ruleset: colony.colonyMinimalRuleset,
    createGame: colony.createGame,
    progressionTrees: [colony.commanderTree],
  },
  {
    meta: vampire.packMeta,
    buildCatalog: vampire.buildCatalog,
    ruleset: vampire.vampireMinimalRuleset,
    createGame: vampire.createGame,
    progressionTrees: [vampire.bloodMasteryTree],
  },
  {
    meta: gladiator.packMeta,
    buildCatalog: gladiator.buildCatalog,
    ruleset: gladiator.gladiatorMinimalRuleset,
    createGame: gladiator.createGame,
    progressionTrees: [gladiator.arenaGloryTree],
  },
  {
    meta: ronin.packMeta,
    buildCatalog: ronin.buildCatalog,
    ruleset: ronin.roninMinimalRuleset,
    createGame: ronin.createGame,
    progressionTrees: [ronin.wayOfTheBladeTree],
  },
];
