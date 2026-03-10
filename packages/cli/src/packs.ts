// Pack registry — imports all starter packs and exposes them for selection

import type { Engine, RulesetDefinition } from '@ai-rpg-engine/core';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';

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
};

export const allPacks: PackInfo[] = [
  {
    meta: fantasy.packMeta,
    buildCatalog: fantasy.buildCatalog,
    ruleset: fantasy.fantasyMinimalRuleset,
    createGame: fantasy.createGame,
  },
  {
    meta: cyberpunk.packMeta,
    buildCatalog: cyberpunk.buildCatalog,
    ruleset: cyberpunk.cyberpunkMinimalRuleset,
    createGame: cyberpunk.createGame,
  },
  {
    meta: detective.packMeta,
    buildCatalog: detective.buildCatalog,
    ruleset: detective.detectiveMinimalRuleset,
    createGame: detective.createGame,
  },
  {
    meta: pirate.packMeta,
    buildCatalog: pirate.buildCatalog,
    ruleset: pirate.pirateMinimalRuleset,
    createGame: pirate.createGame,
  },
  {
    meta: zombie.packMeta,
    buildCatalog: zombie.buildCatalog,
    ruleset: zombie.zombieMinimalRuleset,
    createGame: zombie.createGame,
  },
  {
    meta: weirdWest.packMeta,
    buildCatalog: weirdWest.buildCatalog,
    ruleset: weirdWest.weirdWestMinimalRuleset,
    createGame: weirdWest.createGame,
  },
  {
    meta: colony.packMeta,
    buildCatalog: colony.buildCatalog,
    ruleset: colony.colonyMinimalRuleset,
    createGame: colony.createGame,
  },
  {
    meta: vampire.packMeta,
    buildCatalog: vampire.buildCatalog,
    ruleset: vampire.vampireMinimalRuleset,
    createGame: vampire.createGame,
  },
  {
    meta: gladiator.packMeta,
    buildCatalog: gladiator.buildCatalog,
    ruleset: gladiator.gladiatorMinimalRuleset,
    createGame: gladiator.createGame,
  },
  {
    meta: ronin.packMeta,
    buildCatalog: ronin.buildCatalog,
    ruleset: ronin.roninMinimalRuleset,
    createGame: ronin.createGame,
  },
];
