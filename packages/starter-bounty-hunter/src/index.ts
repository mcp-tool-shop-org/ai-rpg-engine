// @ai-rpg-engine/starter-bounty-hunter — Hue and Cry
//
// The twelfth starter, and the first authored backwards from the CONSEQUENCE
// layer: every one of the eight fallout sinks v3.8 built has content here that
// produces it, because a sink with nothing to record is the same gap one level
// along.

export { createGame, bountyHunterIntentProfiles } from './setup.js';
export { bountyHunterMinimalRuleset } from './ruleset.js';
export {
  createPursuitCore,
  pursuitState,
  formatPursuitForNarrator,
  getPursuitState,
  currentHeat,
  highestAlert,
  informantPrice,
  pursuingPressureCount,
  PURSUIT_STATE_KEY,
  SEARCHED_HEAT,
  HUNTED_HEAT,
  ALERT_HUNTED,
  INFORMANT_BASE_PRICE,
  COLLAR_WARRANT_COST,
  POST_BOUNTY_WARRANT_COST,
  IMPEACH_WARRANT_GAIN,
  IMPEACH_INFAMY_COST,
  INFORMANT_INFAMY_GAIN,
  FENCE_INFAMY_GAIN,
  LAY_LOW_HEAT_RELIEF,
  LAY_LOW_STAMINA_GAIN,
} from './pursuit-core.js';
export type {
  PursuitState,
  MarkRecord,
  PursuitModuleState,
  PursuitCoreConfig,
} from './pursuit-core.js';
export {
  manifest,
  packMeta,
  buildCatalog,
  itemCatalog,
  districts,
  zones,
  thiefTakersNameTree,
  xpAwards,
  progressionRewards,
  bountyHunterAbilities,
  bountyHunterStatusDefinitions,
  bountyHunterQuests,
  encounterSpawnContent,
  player,
  clerkHesper,
  motherSlack,
  sergeantPike,
  theScrivener,
  rookeryRunner,
  bludger,
  nightman,
  jonathanQuill,
  jonathanQuillBoss,
  swearingInDialogue,
  flashHouseDialogue,
  cordialFlaskEffect,
} from './content.js';
