// Pack registry — imports all starter packs and exposes them for selection

import type { Engine, RulesetDefinition } from '@ai-rpg-engine/core';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import type { ProgressionTreeDefinition } from '@ai-rpg-engine/content-schema';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import type { StatusDefinition } from '@ai-rpg-engine/content-schema';

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
import * as merchant from '@ai-rpg-engine/starter-merchant';
import * as bountyHunter from '@ai-rpg-engine/starter-bounty-hunter';

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
  /**
   * The pack's full item catalog. Registered here so catalog-wide audits can
   * reason about items a pack DEFINES rather than only items it happens to
   * place in the world at boot — most usable items are acquired in play, so
   * scanning starting inventories misses them (PVR-1).
   */
  itemCatalog: ItemCatalog;
  /**
   * The pack's own status definitions. Registered here so a catalog-wide gate
   * can check them against the pack's declared `contentConventions.statusTags`
   * — the global `registerStatusDefinitions` registry merges every pack that
   * has booted, so it cannot answer "which tags does THIS pack use".
   */
  statusDefinitions: StatusDefinition[];
};

export type PackCatalogEntry = { id: string; name: string; tagline: string };

/** Installed starters as `{id, name, tagline}` — the packs / --list-packs dump. */
export function packCatalogEntries(packs: readonly PackInfo[] = allPacks): PackCatalogEntry[] {
  return packs.map((p) => ({
    id: p.meta.id,
    name: p.meta.name,
    tagline: p.meta.tagline ?? '',
  }));
}

/** `id\\tname\\t- tagline` lines, one per installed pack. */
export function formatPackCatalog(packs: readonly PackInfo[] = allPacks): string {
  return packCatalogEntries(packs)
    .map((e) => `${e.id}\t${e.name}\t- ${e.tagline}`)
    .join('\n');
}

export interface PacksCommandDeps {
  log: (msg: string) => void;
  error: (msg: string) => void;
}

/**
 * `ai-rpg-engine packs [--json]` — catalog dump, then return. Never prompts.
 * Unknown extra tokens refuse (same voice as other verbs).
 */
export function runPacksCommand(
  args: string[],
  deps: PacksCommandDeps = { log: (m) => console.log(m), error: (m) => console.error(m) },
): number {
  const { log, error } = deps;
  const positional = args.filter((a) => !a.startsWith('-'));
  const flags = args.filter((a) => a.startsWith('-'));
  if (positional.length > 0) {
    error(`Unknown command: packs ${positional[0]}`);
    error('  Hint: ai-rpg-engine packs [--json] lists installed starter ids and exits.');
    return 1;
  }
  const allowed = new Set(['--json', '--help', '-h', '--ascii', '--plain']);
  const unknown = flags.filter((f) => !allowed.has(f) && !f.startsWith('--json='));
  if (unknown.length > 0) {
    error(`"${unknown[0]}" is not a recognized packs flag.`);
    error('  Hint: packs accepts --json (array of {id,name,tagline}) and nothing else.');
    return 1;
  }
  if (flags.includes('--help') || flags.includes('-h')) {
    log('Usage: ai-rpg-engine packs [--json]');
    log('');
    log('List installed starter ids (id, name, tagline) and exit. No readline.');
    log('  --json  print an array of {id, name, tagline}');
    return 0;
  }
  const entries = packCatalogEntries();
  const json = flags.includes('--json') || flags.some((f) => f.startsWith('--json='));
  if (json) {
    log(JSON.stringify(entries));
  } else {
    log(formatPackCatalog());
  }
  return 0;
}

export const allPacks: PackInfo[] = [
  {
    meta: fantasy.packMeta,
    buildCatalog: fantasy.buildCatalog,
    ruleset: fantasy.fantasyMinimalRuleset,
    createGame: fantasy.createGame,
    progressionTrees: [fantasy.combatMasteryTree],
    itemCatalog: fantasy.itemCatalog,
    statusDefinitions: fantasy.fantasyStatusDefinitions,
  },
  {
    meta: cyberpunk.packMeta,
    buildCatalog: cyberpunk.buildCatalog,
    ruleset: cyberpunk.cyberpunkMinimalRuleset,
    createGame: cyberpunk.createGame,
    progressionTrees: [cyberpunk.netrunningTree],
    itemCatalog: cyberpunk.itemCatalog,
    statusDefinitions: cyberpunk.cyberpunkStatusDefinitions,
  },
  {
    meta: detective.packMeta,
    buildCatalog: detective.buildCatalog,
    ruleset: detective.detectiveMinimalRuleset,
    createGame: detective.createGame,
    progressionTrees: [detective.deductionTree],
    itemCatalog: detective.itemCatalog,
    statusDefinitions: detective.detectiveStatusDefinitions,
  },
  {
    meta: pirate.packMeta,
    buildCatalog: pirate.buildCatalog,
    ruleset: pirate.pirateMinimalRuleset,
    createGame: pirate.createGame,
    progressionTrees: [pirate.seamanshipTree],
    itemCatalog: pirate.itemCatalog,
    statusDefinitions: pirate.pirateStatusDefinitions,
  },
  {
    meta: zombie.packMeta,
    buildCatalog: zombie.buildCatalog,
    ruleset: zombie.zombieMinimalRuleset,
    createGame: zombie.createGame,
    progressionTrees: [zombie.survivalTree],
    itemCatalog: zombie.itemCatalog,
    statusDefinitions: zombie.zombieStatusDefinitions,
  },
  {
    meta: weirdWest.packMeta,
    buildCatalog: weirdWest.buildCatalog,
    ruleset: weirdWest.weirdWestMinimalRuleset,
    createGame: weirdWest.createGame,
    progressionTrees: [weirdWest.gunslingerTree],
    itemCatalog: weirdWest.itemCatalog,
    statusDefinitions: weirdWest.weirdWestStatusDefinitions,
  },
  {
    meta: colony.packMeta,
    buildCatalog: colony.buildCatalog,
    ruleset: colony.colonyMinimalRuleset,
    createGame: colony.createGame,
    progressionTrees: [colony.commanderTree],
    itemCatalog: colony.itemCatalog,
    statusDefinitions: colony.colonyStatusDefinitions,
  },
  {
    meta: vampire.packMeta,
    buildCatalog: vampire.buildCatalog,
    ruleset: vampire.vampireMinimalRuleset,
    createGame: vampire.createGame,
    progressionTrees: [vampire.bloodMasteryTree],
    itemCatalog: vampire.itemCatalog,
    statusDefinitions: vampire.vampireStatusDefinitions,
  },
  {
    meta: gladiator.packMeta,
    buildCatalog: gladiator.buildCatalog,
    ruleset: gladiator.gladiatorMinimalRuleset,
    createGame: gladiator.createGame,
    progressionTrees: [gladiator.arenaGloryTree],
    itemCatalog: gladiator.itemCatalog,
    statusDefinitions: gladiator.gladiatorStatusDefinitions,
  },
  {
    meta: ronin.packMeta,
    buildCatalog: ronin.buildCatalog,
    ruleset: ronin.roninMinimalRuleset,
    createGame: ronin.createGame,
    progressionTrees: [ronin.wayOfTheBladeTree],
    itemCatalog: ronin.itemCatalog,
    statusDefinitions: ronin.roninStatusDefinitions,
  },
  {
    meta: merchant.packMeta,
    buildCatalog: merchant.buildCatalog,
    ruleset: merchant.merchantMinimalRuleset,
    createGame: merchant.createGame,
    progressionTrees: [merchant.factorsCreditTree],
    itemCatalog: merchant.itemCatalog,
    statusDefinitions: merchant.merchantStatusDefinitions,
  },
  {
    meta: bountyHunter.packMeta,
    buildCatalog: bountyHunter.buildCatalog,
    ruleset: bountyHunter.bountyHunterMinimalRuleset,
    createGame: bountyHunter.createGame,
    progressionTrees: [bountyHunter.thiefTakersNameTree],
    itemCatalog: bountyHunter.itemCatalog,
    statusDefinitions: bountyHunter.bountyHunterStatusDefinitions,
  },
];
