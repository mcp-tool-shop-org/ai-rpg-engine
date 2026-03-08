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
  computeDistrictMood,
  computeDistrictModifiers,
  formatDistrictMoodForNarrator,
  formatDistrictForDirector,
  formatAllDistrictsForDirector,
} from './district-mood.js';
export type {
  DistrictMood,
  DistrictModifiers,
} from './district-mood.js';
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
export {
  deriveStance,
  getReputationConsequence,
  evolveTitle,
  buildPlayerDescriptor,
} from './social-consequence.js';
export type {
  Stance,
  ReputationConsequence,
  TitleEvolution,
} from './social-consequence.js';
export {
  spawnPlayerRumor,
  spawnReputationRumor,
  spawnIntentionalRumor,
  spawnNpcOriginatedRumor,
  denyRumor,
  buryRumor,
  propagateRumor,
  shouldMutate,
  mutateRumorClaim,
  deriveRumorValence,
  getRumorsKnownToFaction,
  getRumorsInDistrict,
  formatRumorForDirector,
} from './player-rumor.js';
export type {
  PlayerRumor,
  RumorValence,
  RumorMutation,
  MilestoneHint,
  NpcRumorSource,
} from './player-rumor.js';
export {
  evaluatePressures,
  tickPressures,
  getPressuresForFaction,
  getVisiblePressures,
  formatPressureForDirector,
  formatPressureForNarrator,
  formatPressureForDialogue,
  makePressure,
} from './pressure-system.js';
export type {
  PressureKind,
  PressureVisibility,
  WorldPressure,
  PressureInputs,
  PressureSpawnResult,
  PressureTickResult,
} from './pressure-system.js';
export {
  computeFallout,
  formatFalloutForDirector,
  formatFalloutForNarrator,
} from './pressure-resolution.js';
export type {
  ResolutionType,
  PressureResolution,
  FalloutEffect,
  PressureFallout,
  FalloutContext,
} from './pressure-resolution.js';
export {
  buildFactionProfile,
  evaluateFactionActions,
  resolveFactionAction,
  runFactionAgencyTick,
  formatFactionProfilesForDirector,
  formatFactionAgencyForNarrator,
} from './faction-agency.js';
export type {
  FactionActionVerb,
  FactionGoal,
  FactionProfile,
  FactionAction,
  FactionEffect,
  FactionActionResult,
} from './faction-agency.js';
export {
  getLeverageState,
  adjustLeverage,
  applyLeverageDeltas,
  canAfford,
  isCooldownReady,
  setCooldown,
  getSocialRequirements,
  getRumorRequirements,
  getDiplomacyRequirements,
  getSabotageRequirements,
  isPlayerSocialVerb,
  isPlayerRumorVerb,
  isPlayerDiplomacyVerb,
  isPlayerSabotageVerb,
  resolveSocialAction,
  resolveRumorAction,
  resolveDiplomacyAction,
  resolveSabotageAction,
  tickLeverage,
  computeLeverageGains,
  formatLeverageForDirector,
  formatLeverageActionForNarrator,
  formatLeverageStatus,
} from './player-leverage.js';
export type {
  LeverageCurrency,
  LeverageState,
  PlayerSocialVerb,
  PlayerRumorVerb,
  PlayerDiplomacyVerb,
  PlayerSabotageVerb,
  LeverageCost,
  LeverageRequirement,
  LeverageEffect,
  LeverageResolution,
  LeverageHints,
} from './player-leverage.js';
export {
  buildStrategicMap,
  formatStrategicMapForDirector,
  formatStrategicMapForPlayer,
} from './strategic-map.js';
export type {
  DistrictStrategicView,
  FactionStrategicView,
  StrategicMap,
} from './strategic-map.js';
export {
  recommendMoves,
  scoreAction,
  deriveSituation,
} from './move-advisor.js';
export type {
  MoveCategory,
  ScoredMove,
  AdvisorInputs,
  MoveRecommendation,
} from './move-advisor.js';
export {
  createPartyState,
  addCompanion,
  removeCompanion,
  getCompanion,
  isCompanion,
  getActiveCompanions,
  setCompanionActive,
  adjustCompanionMorale,
  computePartyCohesion,
  computePartyAbilities,
  isCompanionRecruitable,
  computeAbilityModifiers,
  formatPartyForDirector,
  formatPartyStatusLine,
  formatPartyPresence,
} from './companion-core.js';
export type {
  CompanionRole,
  CompanionState,
  PartyState,
  AbilityModifiers,
} from './companion-core.js';
export {
  evaluateCompanionReactions,
  evaluateDepartureRisk,
} from './companion-reactions.js';
export type {
  CompanionReaction,
  DepartureRisk,
  DepartureAssessment,
} from './companion-reactions.js';
export {
  evaluateItemRecognition,
  shouldRecognize,
  recognitionProbability,
} from './item-recognition.js';
export type {
  ItemRecognitionType,
  ItemRecognitionResult,
} from './item-recognition.js';
export {
  isNamedNpc,
  deriveNpcRelationship,
  deriveLoyaltyBreakpoint,
  deriveDominantAxis,
  deriveBestLeverageAngle,
  buildNpcProfile,
  buildAllNpcProfiles,
  evaluateNpcActions,
  resolveNpcAction,
  runNpcAgencyTick,
  formatNpcProfileForDirector,
  formatNpcPeopleForDirector,
  formatNpcAgencyForNarrator,
  generateNpcTextures,
  createObligation,
  addObligation,
  tickObligations,
  getObligationsToward,
  getNetObligationWeight,
  formatObligationsForDirector,
  computeRelationshipModifiers,
  evaluateConsequenceChainTrigger,
  buildConsequenceChain,
  shouldResolveChainStep,
  resolveConsequenceChainStep,
  tickConsequenceChain,
  computeNpcRecapEntries,
} from './npc-agency.js';
export type {
  LoyaltyBreakpoint,
  RelationshipModifiers,
  ConsequenceKind,
  ConsequenceStep,
  ConsequenceChain,
  NpcRecapEntry,
  NpcActionVerb,
  NpcRelationship,
  NpcGoal,
  NpcProfile,
  NpcAction,
  NpcEffect,
  NpcActionResult,
  ObligationKind,
  ObligationDirection,
  NpcObligation,
  NpcObligationLedger,
} from './npc-agency.js';
