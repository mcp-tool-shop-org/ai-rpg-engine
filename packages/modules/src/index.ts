// @ai-rpg-engine/modules — built-in mechanical systems

export { makeEvent } from './make-event.js';
export { traversalCore } from './traversal-core.js';
export { statusCore, applyStatus, removeStatus, hasStatus, getStatusStacks } from './status-core.js';
export { combatCore, createCombatCore, COMBAT_STATES, simpleRoll, DEFAULT_STAT_MAPPING } from './combat-core.js';
export type { CombatFormulas, CombatStatMapping } from './combat-core.js';
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
  territorialProfile,
  calculatingProfile,
  BUILTIN_INTENT_PROFILES,
  resolveIntentProfile,
  selectActionForEntity,
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
  EntityActionSelection,
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
// --- World Tick (F-ENG005: heat/safety drive the pressure lifecycle) ---
export {
  runWorldTick,
  buildPressureInputs,
  getWorldTickState,
  urgencyBand,
  HEAT_KEY,
  HEAT_WAKE_THRESHOLD,
  HEAT_ESCALATION_THRESHOLD,
  HEAT_URGENCY_STEP,
  HEAT_DECAY_PER_QUIET_TICK,
  QUIET_ROUNDS_BEFORE_DECAY,
  DISTRICT_STABILITY_BASE,
  CHAIN_TURNS_REMAINING,
} from './world-tick.js';
export type {
  WorldTickState,
  WorldTickOptions,
  WorldTickResult,
  UrgencyBand,
} from './world-tick.js';
export {
  createEncounterSpawn,
  runEncounterSpawnStep,
  getEncounterSpawnState,
  validateEncounterSpawnContent,
  unregisterEncounterSpawnContent,
  spawnRoll,
  spawnChance,
  compositionLabel,
  encounterDescription,
  BASE_SPAWN_CHANCE,
  SAFETY_CHANCE_STEP,
  MIN_SPAWN_CHANCE,
  MAX_SPAWN_CHANCE,
  BOSS_ROLE_TAG,
} from './encounter-spawn.js';
export type {
  EncounterSpawnContent,
  EncounterSpawnConfig,
  EncounterSpawnState,
  SpawnedEncounterReport,
} from './encounter-spawn.js';
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
  AddCompanionResult,
} from './companion-core.js';
export {
  evaluateCompanionReactions,
  evaluateDepartureRisk,
  isKnownReactionTrigger,
  KNOWN_REACTION_TRIGGERS,
} from './companion-reactions.js';
export type {
  CompanionReaction,
  DepartureRisk,
  DepartureAssessment,
  ReactionTrigger,
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

// --- Economy Core (v1.7) ---
export {
  createDistrictEconomy,
  tickDistrictEconomy,
  applyEconomyShift,
  deriveEconomyDescriptor,
  deriveSupplyTrend,
  isBlackMarketCondition,
  getSupplyLevel,
  getScarcestSupply,
  getMostSurplusSupply,
  formatEconomyForNarrator,
  formatEconomyForDirector,
  formatAllDistrictEconomiesForDirector,
} from './economy-core.js';
export type {
  SupplyCategory,
  SupplyLevel,
  DistrictEconomy,
  ScarcitySeverity,
  SurplusDegree,
  EconomyDescriptor,
  EconomyShift,
} from './economy-core.js';

// --- Trade Value (v1.7) ---
export {
  computeItemValue,
  computeScarcityMultiplier,
  computeFactionAttitudeMultiplier,
  computeProvenanceMultiplier,
  computeContrabandFactor,
  computePressureModifier,
  deriveTradeAdvice,
  formatValueBreakdownForDirector,
  formatTradeAdviceForNarrator,
} from './trade-value.js';
export type {
  TradeContext,
  ValueModifiers,
  TradeAdvice,
  ItemValueResult,
  TradeEffect,
} from './trade-value.js';

// --- Crafting Core (v1.8) ---
export {
  getMaterialInventory,
  adjustMaterial,
  applyMaterialDeltas,
  hasMaterials,
  getTotalMaterials,
  getNonZeroMaterials,
  computeSalvageYield,
  salvageItem,
  wouldGenerateSuspicion,
  getSalvageRumorClaim,
  formatMaterialsForDirector,
  formatMaterialsCompact,
  formatSalvagePreview,
} from './crafting-core.js';
export type {
  MaterialQuality,
  MaterialYield,
  SalvageResult,
  SalvageContext,
  MaterialInventory,
} from './crafting-core.js';

// --- Crafting Recipes (v1.8) ---
export {
  getAvailableRecipes,
  getRecipeById,
  canCraft,
  computeQualityBonus,
  resolveCraft,
  resolveRepair,
  resolveModify,
  formatRecipeForDirector,
  formatAvailableRecipesForDirector,
} from './crafting-recipes.js';
export type {
  RecipeCategory,
  ModificationKind,
  CraftingRecipe,
  CraftingContext,
  CraftEffect,
  CraftResult,
  ModifyResult,
} from './crafting-recipes.js';

// --- Opportunity Core (v1.9) ---
export {
  evaluateOpportunities,
  tickOpportunities,
  getAvailableOpportunities,
  getAcceptedOpportunities,
  getOpportunityById,
  getOpportunitiesForNpc,
  getOpportunitiesForFaction,
  formatOpportunityForDirector,
  formatOpportunityListForDirector,
  formatOpportunityForNarrator,
  formatOpportunityForDialogue,
  makeOpportunity,
  resetOpportunityCounter,
} from './opportunity-core.js';
export type {
  OpportunityKind,
  OpportunityStatus,
  OpportunityVisibility,
  OpportunityReward,
  OpportunityRisk,
  OpportunityState,
  OpportunityInputs,
  OpportunitySpawnResult,
  OpportunityTickResult,
} from './opportunity-core.js';

// --- Opportunity Resolution (v1.9) ---
export {
  computeOpportunityFallout,
  formatOpportunityFalloutForDirector,
  formatOpportunityFalloutForNarrator,
} from './opportunity-resolution.js';
export type {
  OpportunityResolutionType,
  OpportunityFalloutEffect,
  OpportunityResolution,
  OpportunityFallout,
  OpportunityResolutionContext,
} from './opportunity-resolution.js';

// --- Arc Detection (v2.0) ---
export {
  evaluateArcs,
  buildArcSnapshot,
  formatArcForDirector,
  formatArcForNarrator,
} from './arc-detection.js';
export type {
  ArcKind,
  ArcMomentum,
  ArcSignal,
  ArcSnapshot,
  ArcInputs,
  ReputationEntry,
  FactionStateEntry,
} from './arc-detection.js';

// --- Defeat Fallout (Phase 4) ---
export { createDefeatFallout } from './defeat-fallout.js';
export type { DefeatFalloutConfig } from './defeat-fallout.js';

// --- Engagement Core (Phase 5) ---
export { createEngagementCore, withEngagement, ENGAGEMENT_STATES, isEngaged, isProtected, isBackline, isIsolated } from './engagement-core.js';
export type { EngagementConfig, EngagementFormulaOpts } from './engagement-core.js';
export { createEngagementNarration } from './engagement-narration.js';

// --- Defeat Narration ---
export { createDefeatNarration } from './defeat-narration.js';
export type { DefeatNarrationConfig } from './defeat-narration.js';

// --- Combat Review (Phase 6A) ---
export { createCombatReview, formatCombatTrace } from './combat-review.js';
export type { CombatTrace, FormulaTrace, FormulaStep, FormulaSource, DamageTrace, InterceptionTrace, CombatOutcome, CombatReviewConfig } from './combat-review.js';

// --- Combat Intent (Phase 6B) ---
export { createCombatIntent, selectNpcCombatAction, emitDecisionEvent, formatCombatDecision, BUILTIN_PACK_BIASES } from './combat-intent.js';
export type { CombatIntentType, IntentScore, IntentScoreContribution, CombatDecision, PackBias, CombatIntentConfig, ScoringContext } from './combat-intent.js';

// --- Combat Recovery (Phase 6C) ---
export { createCombatRecovery, WOUND_STATUSES, MORALE_AFTERMATH_STATUSES } from './combat-recovery.js';
export type { WoundSeverity, WoundThreshold, MoraleAftermathTier, AftermathSurvivor, AftermathSummaryPayload, CombatRecoveryConfig } from './combat-recovery.js';

// --- Combat Roles & Encounters (Phase 8) ---
export {
  BUILTIN_COMBAT_ROLES,
  COMBAT_ROLES,
  createEncounter,
  validateEncounter,
  collectEncounterBiases,
  createBossPhaseListener,
  calculateDangerRating,
  formatDangerForNarrator,
  analyzeEncounter,
  formatEncounterForDirector,
  getEntityRole,
  getRoleBiases,
  createRoledEnemy,
  getTacticalExpectation,
  validateBossDefinition,
} from './combat-roles.js';
export type {
  CombatRole,
  CombatRoleTemplate,
  EncounterComposition,
  EncounterParticipant,
  EncounterDefinition,
  BossPhaseTransition,
  BossDefinition,
  DangerRating,
  EncounterAnalysis,
  TacticalExpectation,
} from './combat-roles.js';

// --- Combat Summary & Authoring (Phase 9) ---
export {
  findEncounters,
  getEncountersByZone,
  getEncountersByDistrict,
  getEncounterBosses,
  buildBossProfile,
  buildEncounterDetail,
  summarizeCombatContent,
  summarizeRegionCombat,
  auditEncounters,
  auditProjectCombat,
  formatEncounterDetailForDirector,
  formatEncounterDetailForNarrator,
  formatBossProfileForDirector,
  formatTacticalExpectation,
  formatCombatSummaryForDirector,
  formatCombatSummaryForNarrator,
  formatRegionCombatForDirector,
  formatAuditForDirector,
  formatCombatSummaryMarkdown,
  formatCombatSummaryJSON,
} from './combat-summary.js';
export type {
  EncounterFilter,
  EncounterDetail,
  BossProfile,
  CombatContentSummary,
  RegionCombatOverview,
  EncounterAuditWarning,
  EncounterAuditResult,
  ProjectCombatAudit,
} from './combat-summary.js';

// --- Encounter Library (Phase 10) ---
export {
  createPatrolEncounter,
  createAmbushEncounter,
  createBossFightEncounter,
  createHordeEncounter,
  createDuelEncounter,
  createEscalatingBoss,
  createSummonerBoss,
  createPhaseShiftBoss,
  auditPackCoverage,
} from './encounter-library.js';
export type {
  EncounterArchetype,
  EncounterArchetypeConfig,
  BossPattern,
  BossTemplateConfig,
  PackCoverageResult,
} from './encounter-library.js';

// --- Endgame Detection (v2.0) ---
export {
  evaluateEndgame,
  formatEndgameForDirector,
  formatEndgameForNarrator,
  resetEndgameCounter,
} from './endgame-detection.js';
export type {
  ResolutionClass,
  EndgameTrigger,
  EndgameInputs,
} from './endgame-detection.js';

// --- Combat Tactics (Tactical Triangle) ---
export {
  createCombatTactics,
  getRoundFlags,
  setRoundFlag,
  clearRoundFlags,
  clearEntityRoundFlags,
} from './combat-tactics.js';
export type {
  CombatActionKind,
  CombatZone,
  CombatIntent as TacticalIntent,
  RoundFlags,
  TacticalHooks,
  CombatTacticsConfig,
} from './combat-tactics.js';

// --- Combat Resources (Genre Resource Integration) ---
export {
  createCombatResources,
  buildTacticalHooks,
  withCombatResources,
  registerResourceListeners,
  applyResourceIntentModifiers,
} from './combat-resources.js';
export type {
  ResourceGainTrigger,
  ResourceSpendModifier,
  ResourceDrainTrigger,
  ResourceAIModifier,
  CombatResourceProfile,
} from './combat-resources.js';

// --- Combat State Narration ---
export { createCombatStateNarration } from './combat-state-narration.js';

// --- Ability Core (Abilities & Powers) ---
// (F-6b2a840f: the permanently-empty UNIVERSAL_ABILITIES / GENRE_ABILITIES /
// getAbilitiesForGenre stubs were removed — see ability-core.ts.)
export {
  createAbilityCore,
  DEFAULT_ABILITY_STAT_MAPPING,
  ABILITY_CATALOG_FORMULA,
  isAbilityOnCooldown,
  getAbilityCooldown,
  isAbilityReady,
  getAvailableAbilities,
  registerProfileAbilities,
} from './ability-core.js';
export type {
  AbilityStatMapping,
  AbilityCooldownState,
  AbilityUseState,
  AbilityModuleState,
  AbilityCheckResult,
  AbilityCoreConfig,
} from './ability-core.js';

// --- Ability Effects (Abilities & Powers) ---
export {
  createAbilityEffects,
  resolveEffects,
  registerEffectHandler,
  getEffectHandler,
  clearEffectRegistry,
} from './ability-effects.js';
export type {
  EffectContext,
  AbilityEffectHandler,
  AbilityEffectsConfig,
} from './ability-effects.js';

// --- Ability Review (Abilities & Powers) ---
export {
  createAbilityReview,
  formatAbilityTrace,
  getAbilityTraces,
} from './ability-review.js';
export type {
  AbilityCheckTrace,
  AbilityEffectTrace,
  AbilityCostTrace,
  AbilityTrace,
  AbilityReviewConfig,
} from './ability-review.js';

// --- Ability Intent (Abilities & Powers) ---
export {
  scoreAbilityUse,
  selectNpcAbilityAction,
  formatAbilityDecision,
} from './ability-intent.js';
export type {
  AbilityScoreContribution,
  AbilityScore,
  AbilityDecision,
} from './ability-intent.js';

// --- Status Semantics (Abilities Phase 3) ---
export {
  STATUS_SEMANTIC_TAGS,
  isKnownStatusTag,
  registerStatusDefinitions,
  getStatusDefinition,
  getStatusTags,
  getRegisteredStatusIds,
  clearStatusRegistry,
  checkResistance,
  applyResistanceToDuration,
} from './status-semantics.js';
export type { StatusSemanticTag } from './status-semantics.js';

// --- Ability Summary & Audit (Abilities Phase 2+5) ---
export {
  summarizeAbilityPack,
  formatAbilityPackMarkdown,
  formatAbilityPackJSON,
  auditAbilityBalance,
  compareAbilityPacks,
  formatPackComparisonMarkdown,
} from './ability-summary.js';
export type {
  CooldownBand,
  AbilityPackSummary,
  BalanceFlag,
  BalanceAudit,
  PackIdentityProfile,
  StatusEcosystemSummary,
  PackComparisonMatrix,
} from './ability-summary.js';

// --- Combat Builders (DX Helpers) ---
export { buildCombatFormulas, buildCombatStack, PACK_BIAS_TAGS } from './combat-builders.js';
export type { CombatStackConfig, CombatStack } from './combat-builders.js';

// --- World Stack (Strategic-Tier DX Builder) ---
export { buildWorldStack } from './world-stack.js';
export type { WorldStackConfig, WorldStack } from './world-stack.js';

// --- Unified Decision (Combat + Ability Merge Layer) ---
export { selectBestAction, formatUnifiedDecision } from './unified-decision.js';
export type { UnifiedActionSource, UnifiedAction, UnifiedDecision, UnifiedDecisionConfig } from './unified-decision.js';

// --- Tag Taxonomy & Validation ---
export { TAG_CATEGORIES, classifyTag, validateEntityTags, validateZoneTags, validateWorldTags } from './tag-taxonomy.js';
export type { TagCategory, TagCategoryDefinition, TagWarning, WorldTagWarning } from './tag-taxonomy.js';

// --- Ability Builders (Abilities Phase 4) ---
export {
  buildDamageAbility,
  buildHealAbility,
  buildStatusAbility,
  buildCleanseAbility,
  buildBuffAbility,
  buildReviveAbility,
  buildAbilitySuite,
} from './ability-builders.js';
export type {
  DamageAbilityOpts,
  HealAbilityOpts,
  StatusAbilityOpts,
  CleanseAbilityOpts,
  BuffAbilityOpts,
  ReviveAbilityOpts,
  AbilitySuiteResult,
} from './ability-builders.js';

// --- Status Effects (modifiers / periodic DoT-HoT / reactive triggers) ---
export {
  effectiveStat,
  processPeriodicStatuses,
  processStatusTriggers,
  makeProcContext,
  PROC_DEPTH_LIMIT,
  PERIODIC_KEYS,
} from './status-effects.js';
export type { ProcContext } from './status-effects.js';

// --- Targeting (Ally Targeting & Friend/Foe AoE) ---
export {
  affiliationOf,
  matchesAffiliation,
  isSupportAbility,
  normalizeAbilityTarget,
  candidateTargets,
  resolveTargets,
  lowestHp,
  highestHp,
  selectRandomN,
  randomSelector,
} from './targeting.js';
export type { Affiliation, TargetSelector } from './targeting.js';

// --- Profile System (Phase 1: schema + validation + per-entity AI driver) ---
export { buildProfile, validateProfileSet, selectActionForProfile } from './profile.js';
export type { Profile, ProfileConfig, BuildProfileResult, ProfileSetResult } from './profile.js';

// --- Profile Loader (Phase 2: runtime application — attaches a profile to an entity) ---
export { applyProfile } from './profile-loader.js';

// --- Profile Templates (Phase 2: the 10 starter playstyles as reusable bundles) ---
export {
  starterProfiles,
  starterProfileList,
  gladiatorProfile,
  detectiveProfile,
  colonyProfile,
  cyberpunkProfile,
  pirateProfile,
  vampireProfile,
  roninProfile,
  weirdWestProfile,
  zombieProfile,
  fantasyProfile,
} from './profile-templates.js';
