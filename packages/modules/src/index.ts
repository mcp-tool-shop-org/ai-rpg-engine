// @signalfire/modules — built-in mechanical systems

export { traversalCore } from './traversal-core.js';
export { statusCore, applyStatus, removeStatus, hasStatus, getStatusStacks } from './status-core.js';
export { combatCore, createCombatCore } from './combat-core.js';
export type { CombatFormulas } from './combat-core.js';
export { inventoryCore, createInventoryCore, giveItem } from './inventory-core.js';
export type { ItemEffect } from './inventory-core.js';
export { createDialogueCore } from './dialogue-core.js';
export type { DialogueState, DialogueRegistry } from './dialogue-core.js';
export { createNarrativeAuthority, recordPresentation, revealTruth, getHiddenTruths, getRevealedTruths } from './narrative-authority.js';
export type { NarratorPersonality, NarrativeAuthorityState, Contradiction } from './narrative-authority.js';
export {
  createCognitionCore,
  getCognition,
  setBelief,
  getBelief,
  getBeliefValue,
  believes,
  addMemory,
  getMemories,
  getRecentMemories,
  checkPerception,
  selectIntent,
  aggressiveProfile,
  cautiousProfile,
} from './cognition-core.js';
export type {
  Belief,
  Memory,
  CognitionState,
  PerceptionCheck,
  PerceptionResult,
  IntentOption,
  IntentProfile,
} from './cognition-core.js';
export {
  createPerceptionFilter,
  getPerceptionLog,
  getRecentPerceptions,
  didPerceive,
  whoPerceived,
} from './perception-filter.js';
export type {
  SenseType,
  PerceivedEvent,
  PerceptionLayer,
  PerceptionFilterConfig,
} from './perception-filter.js';
export {
  createProgressionCore,
  getCurrency,
  addCurrency,
  spendCurrency,
  getUnlockedNodes,
  isNodeUnlocked,
  canUnlock,
  unlockNode,
  getAvailableNodes,
} from './progression-core.js';
export type {
  ProgressionState,
  ProgressionEvent,
  CurrencyReward,
  ProgressionCoreConfig,
  EffectHandler,
  UnlockResult,
} from './progression-core.js';
export {
  createEnvironmentCore,
  getZoneProperty,
  setZoneProperty,
  modifyZoneProperty,
  getHazardLog,
  processEnvironmentDecays,
  zoneHasTag,
  entitiesInZone,
} from './environment-core.js';
export type {
  EnvironmentRule,
  HazardDefinition,
  ZoneTickEffect,
  EnvironmentCoreConfig,
  EnvironmentState,
  HazardEvent,
} from './environment-core.js';
