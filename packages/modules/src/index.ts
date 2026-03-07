// @ai-rpg-engine/modules — built-in mechanical systems

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
  reinforceBelief,
  processBeliefDecay,
  aggressiveProfile,
  cautiousProfile,
} from './cognition-core.js';
export type {
  Belief,
  Memory,
  CognitionState,
  CognitionCoreConfig,
  BeliefDecayConfig,
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
export {
  createFactionCognition,
  getFactionCognition,
  getEntityFaction,
  getFactionMembers,
  setFactionBelief,
  getFactionBelief,
  factionBelieves,
  getFactionBeliefsAbout,
} from './faction-cognition.js';
export type {
  FactionBelief,
  FactionCognitionState,
  FactionMembership,
  FactionCognitionConfig,
} from './faction-cognition.js';
export {
  createRumorPropagation,
  getRumorsFrom,
  getRumorsToFaction,
  getRumorLog,
} from './rumor-propagation.js';
export type {
  RumorRecord,
  RumorPropagationConfig,
} from './rumor-propagation.js';
export {
  createDistrictCore,
  getDistrictForZone,
  getDistrictState,
  getDistrictDefinition,
  getAllDistrictIds,
  getDistrictMetric,
  modifyDistrictMetric,
  isDistrictOnAlert,
  getDistrictThreatLevel,
} from './district-core.js';
export type {
  DistrictMetrics,
  DistrictDefinition,
  DistrictState,
  DistrictDecayConfig,
  DistrictCoreConfig,
} from './district-core.js';
export {
  createBeliefProvenance,
  traceEntityBelief,
  traceFactionBelief,
  traceSubject,
  formatBeliefTrace,
} from './belief-provenance.js';
export type {
  TraceStep,
  BeliefTrace,
} from './belief-provenance.js';
export {
  createObserverPresentation,
  presentForObserver,
  presentForAllObservers,
  getDivergences,
  getEventDivergences,
} from './observer-presentation.js';
export type {
  ObserverContext,
  PresentationRule,
  ObserverPresentedEvent,
  ObserverPresentationConfig,
  DivergenceRecord,
} from './observer-presentation.js';
export {
  createSimulationInspector,
  inspectEntity,
  inspectAllEntities,
  inspectFaction,
  inspectAllFactions,
  inspectZone,
  inspectAllZones,
  inspectDistrict,
  inspectAllDistricts,
  createSnapshot,
  formatEntityInspection,
  formatFactionInspection,
  formatDistrictInspection,
} from './simulation-inspector.js';
export type {
  EntityInspection,
  FactionInspection,
  ZoneInspection,
  DistrictInspection,
  SimulationSnapshot,
} from './simulation-inspector.js';
