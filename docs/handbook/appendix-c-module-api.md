# Appendix C — Module API Reference

Function signatures and hooks for built-in modules.

## Core Engine

### createEngine(config)

Creates and returns an engine instance.

### createTestEngine(config)

Creates an isolated engine instance for testing.

## Cognition Core — `createCognitionCore(config?)`

| Function | Signature | Description |
|----------|-----------|-------------|
| getCognition | `(world, entityId) → CognitionState` | Get entity's cognition state |
| setBelief | `(world, entityId, belief) → void` | Set a belief |
| getBelief | `(world, entityId, subject, key) → Belief` | Get a specific belief |
| getBeliefValue | `(world, entityId, subject, key) → any` | Get belief value directly |
| believes | `(world, entityId, subject, key, value) → boolean` | Check if entity holds a belief |
| addMemory | `(world, entityId, memory) → void` | Record a memory |
| getMemories | `(world, entityId) → Memory[]` | Get all memories |
| getRecentMemories | `(world, entityId, count) → Memory[]` | Get N most recent memories |
| checkPerception | `(world, entityId, difficulty, stat?) → PerceptionResult` | Roll a perception check |
| selectIntent | `(world, entityId) → IntentOption` | Choose an action from AI profile |

## Perception Filter — `createPerceptionFilter(config?)`

| Function | Signature | Description |
|----------|-----------|-------------|
| getPerceptionLog | `(world, entityId) → PerceivedEvent[]` | Full perception history |
| getRecentPerceptions | `(world, entityId, count) → PerceivedEvent[]` | Recent perceptions |
| didPerceive | `(world, entityId, eventType) → boolean` | Check if entity perceived event type |
| whoPerceived | `(world, eventType) → string[]` | List entities that perceived event |

## Progression Core — `createProgressionCore(config)`

| Function | Signature | Description |
|----------|-----------|-------------|
| getCurrency | `(world, entityId, currency) → number` | Get currency balance |
| addCurrency | `(world, entityId, currency, amount) → void` | Add currency |
| spendCurrency | `(world, entityId, currency, amount) → boolean` | Spend currency |
| isNodeUnlocked | `(world, entityId, nodeId) → boolean` | Check if node is unlocked |
| canUnlock | `(world, entityId, nodeId) → boolean` | Check if node can be unlocked |
| unlockNode | `(world, entityId, nodeId) → UnlockResult` | Unlock a progression node |
| getAvailableNodes | `(world, entityId) → TreeNode[]` | List unlockable nodes |
| getUnlockedNodes | `(world, entityId) → string[]` | List unlocked node IDs |

## Environment Core — `createEnvironmentCore(config?)`

| Function | Signature | Description |
|----------|-----------|-------------|
| getZoneProperty | `(world, zoneId, key) → number` | Get dynamic zone property |
| setZoneProperty | `(world, zoneId, key, value) → void` | Set zone property |
| modifyZoneProperty | `(world, zoneId, key, delta) → void` | Modify property by delta |
| processEnvironmentDecays | `(world) → void` | Process all decay timers |

## Narrative Authority — `createNarrativeAuthority(config?)`

| Function | Signature | Description |
|----------|-----------|-------------|
| conceal | `(world, eventId, reason) → void` | Hide an event from presentation |
| distort | `(world, eventId, replacement) → void` | Replace event in presentation |
| getContradictions | `(world) → Contradiction[]` | List recorded contradictions |
| reveal | `(world, contradictionId) → void` | Expose a hidden truth |

## District Core — `createDistrictCore(config)`

| Function | Signature | Description |
|----------|-----------|-------------|
| getDistrictForZone | `(world, zoneId) → string \| undefined` | Find which district a zone belongs to |
| getDistrictState | `(world, districtId) → DistrictMetrics \| undefined` | Get district aggregate metrics |
| getDistrictDefinition | `(world, districtId) → DistrictDefinition \| undefined` | Get district config |
| getAllDistrictIds | `(world) → string[]` | List all district IDs |
| getDistrictMetric | `(world, districtId, metric) → number` | Get a specific metric value |
| modifyDistrictMetric | `(world, districtId, metric, delta) → void` | Modify a metric by delta (clamped 0-100) |
| isDistrictOnAlert | `(world, districtId) → boolean` | Check if alertPressure > 30 |
| getDistrictThreatLevel | `(world, districtId) → number` | Weighted composite of all metrics |

## Belief Provenance — `createBeliefProvenance()`

| Function | Signature | Description |
|----------|-----------|-------------|
| traceEntityBelief | `(world, entityId, subject, key) → BeliefTrace` | Trace an entity belief's provenance |
| traceFactionBelief | `(world, factionId, subject, key) → BeliefTrace` | Trace a faction belief through rumor chain |
| traceSubject | `(world, subject) → BeliefTrace[]` | Find all beliefs about a subject |
| formatBeliefTrace | `(trace) → string` | Human-readable forensic narrative |

## Observer Presentation — `createObserverPresentation(config?)`

| Function | Signature | Description |
|----------|-----------|-------------|
| presentForObserver | `(event, observerId, world, rules?) → ObserverPresentedEvent` | Present event from observer's perspective |
| presentForAllObservers | `(event, world) → ObserverPresentedEvent[]` | One version per AI entity |
| getDivergences | `(world) → DivergenceRecord[]` | All recorded divergences |
| getEventDivergences | `(world, eventId) → DivergenceRecord[]` | Divergences for a specific event |

## Player Leverage — `player-leverage.ts`

Pure functions for structured social play. 4 compound verbs (social, rumor, diplomacy, sabotage) with 24 sub-actions, resolved deterministically.

| Function | Signature | Description |
|----------|-----------|-------------|
| getLeverageState | `(custom) → LeverageState` | Extract leverage currencies from profile |
| adjustLeverage | `(custom, currency, delta) → custom` | Modify a single currency |
| applyLeverageDeltas | `(custom, deltas) → custom` | Apply multiple currency changes |
| canAfford | `(state, costs) → boolean` | Check if player can pay action costs |
| isCooldownReady | `(custom, verb, subAction, tick, turns) → boolean` | Check cooldown elapsed |
| setCooldown | `(custom, verb, subAction, tick) → custom` | Record cooldown timestamp |
| resolveSocialAction | `(subAction, targetId, factionId, state, rep, factionCog?, tick) → LeverageResolution` | Resolve social verb |
| resolveRumorAction | `(subAction, factionId, state, tick) → LeverageResolution` | Resolve rumor verb |
| resolveDiplomacyAction | `(subAction, factionId, state, rep, factionCog?, tick) → LeverageResolution` | Resolve diplomacy verb |
| resolveSabotageAction | `(subAction, targetId, factionId, state, tick) → LeverageResolution` | Resolve sabotage verb |
| tickLeverage | `(custom, reputations) → custom` | Passive tick: heat decay, influence calc |
| computeLeverageGains | `(hints) → Record<string, number>` | Natural gains from game events |
| formatLeverageForDirector | `(state) → string` | Director-mode leverage display |
| formatLeverageStatus | `(state) → string` | Compact one-line status |

## Strategic Map — `strategic-map.ts`

Aggregates world state into a strategic overview of districts, factions, and hotspots.

| Function | Signature | Description |
|----------|-----------|-------------|
| buildStrategicMap | `(world, rumors, pressures, reputation, actions?) → StrategicMap` | Build complete strategic view |
| formatStrategicMapForDirector | `(map) → string` | Director-mode map display |
| formatStrategicMapForPlayer | `(map) → string` | Player-facing map display |

## Move Advisor — `move-advisor.ts`

Deterministic scoring engine that evaluates all 24 leverage sub-actions against current state. Drives contextual suggestions and `/status` command.

| Function | Signature | Description |
|----------|-----------|-------------|
| recommendMoves | `(inputs: AdvisorInputs) → MoveRecommendation` | Score all actions, return top 3 + situation tag |
| scoreAction | `(category, subAction, targetFactionId, inputs) → ScoredMove` | Score a single action |
| deriveSituation | `(inputs) → 'safe' \| 'pressured' \| 'crisis' \| 'opportunity'` | Derive situation tag from state |

**Scoring formula:** `score = (urgency × 0.3 + feasibility × 0.3 + impact × 0.25 + (1 - risk) × 0.15) × 100`

- **Urgency:** Active pressure urgency, faction hostility, threat levels
- **Feasibility:** Binary gate (can afford? cooldown ready?) then surplus ratio
- **Impact:** Static table from resolution effect magnitudes, boosted by pressure relevance
- **Risk:** Heat generation + alert escalation, scaled by current heat

## Economy Core — `economy-core.ts`

Pure functions for category-level supply tracking per district. No module registration — import and call directly.

| Function | Signature | Description |
|----------|-----------|-------------|
| createDistrictEconomy | `(genre?, districtTags?) → DistrictEconomy` | Initialize with genre defaults + tag modifiers |
| tickDistrictEconomy | `(economy, commerce, stability, tick) → DistrictEconomy` | Baseline-seeking decay, stability modulation |
| applyEconomyShift | `(economy, shift) → DistrictEconomy` | Adjust single supply, clamp 0-100 |
| deriveEconomyDescriptor | `(economy) → EconomyDescriptor` | Identify scarcities, surpluses, overall tone |
| isBlackMarketCondition | `(economy) → boolean` | True when contraband > 30 or any supply < 20 |
| getSupplyLevel | `(economy, category) → number` | Get level for a single category |
| getScarcestSupply | `(economy) → SupplyCategory \| undefined` | Lowest supply below baseline |
| getMostSurplusSupply | `(economy) → SupplyCategory \| undefined` | Highest supply above baseline |
| formatEconomyForDirector | `(districtId, districtName, economy, descriptor) → string` | Detailed director view |
| formatEconomyForNarrator | `(descriptor) → string` | Compact phrase (~10 tokens) |
| formatAllDistrictEconomiesForDirector | `(economies) → string` | Market overview of all districts |

## Crafting Core — `crafting-core.ts`

Material tracking, salvage computation, and inventory management. Pure functions, no module registration.

| Function | Signature | Description |
|----------|-----------|-------------|
| getMaterialInventory | `(custom) → MaterialInventory` | Read `materials.*` from profile.custom |
| adjustMaterial | `(custom, category, delta) → custom` | Modify single material, clamp 0-50 |
| applyMaterialDeltas | `(custom, deltas) → custom` | Apply multiple material changes |
| hasMaterials | `(custom) → boolean` | True if any material > 0 |
| computeSalvageYield | `(item) → MaterialYield[]` | Pure yield lookup by slot × rarity |
| salvageItem | `(item, context?) → SalvageResult` | Full salvage: yields + byproducts + economy shifts |
| formatMaterialsForDirector | `(inventory) → string` | Detailed multi-line view |
| formatMaterialsCompact | `(inventory) → string` | One-line status |
| formatSalvagePreview | `(item, result) → string` | Preview salvage yields |

## Crafting Recipes — `crafting-recipes.ts`

Recipe lookup, crafting resolution, repair, and modification. Pure functions, genre-aware.

| Function | Signature | Description |
|----------|-----------|-------------|
| getAvailableRecipes | `(genre, playerTags?, districtTags?) → CraftingRecipe[]` | Filter recipes by genre + tags |
| getRecipeById | `(genre, recipeId) → CraftingRecipe \| undefined` | Single recipe lookup |
| canCraft | `(recipe, materials, context?) → CraftCheck` | Material + context requirement check |
| resolveCraft | `(recipe, context) → CraftResult` | Execute craft: output item + side effects |
| resolveRepair | `(item, recipe, context) → RepairResult` | Restore item stats |
| resolveModify | `(item, recipe, context) → ModifyResult` | Apply modification: stat deltas + provenance |
| computeQualityBonus | `(context) → number` | Prosperity/stability quality modifier |
| formatRecipeForDirector | `(recipe, materials) → string` | Single recipe with can-craft status |
| formatAvailableRecipesForDirector | `(recipes, materials) → string` | All recipes grouped by category |

## Trade Value — `trade-value.ts`

Context-sensitive item valuation. Pure functions, lookup-table driven.

| Function | Signature | Description |
|----------|-----------|-------------|
| computeItemValue | `(baseValue, supplyCategory, ctx) → ItemValueResult` | Full contextual valuation |
| computeScarcityMultiplier | `(supplyLevel) → number` | 0.5-3.0 based on supply level |
| computeFactionAttitudeMultiplier | `(reputation) → number` | 0.85-1.5 based on faction rep |
| computeProvenanceMultiplier | `(provenance?, heat?) → number` | 1.0-2.0 based on item history |
| computeContrabandFactor | `(isContraband, blackMarketActive, reputation) → number` | 0.0-1.0 |
| computePressureModifier | `(pressureKinds, category) → number` | 0.8-1.5 from active pressures |
| deriveTradeAdvice | `(modifiers, isContraband) → TradeAdvice` | sell-here/elsewhere/hold/risky/untradeable |
| formatValueBreakdownForDirector | `(result) → string` | Detailed value breakdown |
| formatTradeAdviceForNarrator | `(result) → string` | Compact narrator advice |

## Opportunity Core — `opportunity-core.ts`

Emergent opportunity generation and lifecycle. Pure functions, no module registration.

| Function | Signature | Description |
|----------|-----------|-------------|
| evaluateOpportunities | `(inputs: OpportunityInputs) → OpportunitySpawnResult \| null` | Evaluate and spawn a new opportunity |
| tickOpportunities | `(opps, currentTick) → OpportunityTickResult` | Decrement timers, expire overdue, escalate visibility |
| getAvailableOpportunities | `(opps) → OpportunityState[]` | Filter to available opportunities |
| getAcceptedOpportunities | `(opps) → OpportunityState[]` | Filter to accepted opportunities |
| getOpportunityById | `(opps, id) → OpportunityState \| undefined` | Find by ID |
| getOpportunitiesForNpc | `(opps, npcId) → OpportunityState[]` | Filter by source NPC |
| getOpportunitiesForFaction | `(opps, factionId) → OpportunityState[]` | Filter by source faction |
| makeOpportunity | `(overrides) → OpportunityState` | Create opportunity with defaults |
| formatOpportunityForDirector | `(opp) → string` | Detailed single opportunity view |
| formatOpportunityListForDirector | `(opps) → string` | Multi-opportunity director list |
| formatOpportunityForNarrator | `(opp) → string` | Compact narrator context |
| formatOpportunityForDialogue | `(opp) → string` | Dialogue context for quest-giver NPCs |

## Opportunity Resolution — `opportunity-resolution.ts`

Compute fallout effects when opportunities resolve. Pure functions, deterministic.

| Function | Signature | Description |
|----------|-----------|-------------|
| computeOpportunityFallout | `(opp, resolutionType, ctx) → OpportunityFallout` | Compute all fallout effects for a resolution |
| formatOpportunityFalloutForDirector | `(fallout) → string` | Detailed fallout breakdown |
| formatOpportunityFalloutForNarrator | `(fallout) → string` | Compact narrator summary |

**Resolution types:** `completed`, `failed`, `abandoned`, `betrayed`, `expired`, `declined`

**Fallout effects (14 variants):** reputation, leverage, materials, economy-shift, rumor, obligation, spawn-pressure, spawn-opportunity, heat, alert, npc-relationship, companion-morale, milestone-tag, title-trigger

## Simulation Inspector — `createSimulationInspector()`

| Function | Signature | Description |
|----------|-----------|-------------|
| inspectEntity | `(world, entityId) → EntityInspection` | Full entity cognitive state |
| inspectFaction | `(world, factionId) → FactionInspection` | Faction beliefs and alert level |
| inspectZone | `(world, zoneId) → ZoneInspection` | Zone environment state |
| inspectDistrict | `(world, districtId) → DistrictInspection` | District aggregate metrics |
| inspectAllDistricts | `(world) → Record<string, DistrictInspection>` | All district inspections |
| createSnapshot | `(world) → SimulationSnapshot` | Full world snapshot |
| formatEntityInspection | `(inspection) → string` | Text format for entity |
| formatFactionInspection | `(inspection) → string` | Text format for faction |
| formatDistrictInspection | `(inspection) → string` | Text format for district |

## Combat Core — `createCombatCore(formulas)`

Registers the 5 combat verbs (attack, guard, disengage, brace, reposition) and resolves them using the provided formulas.

| Function | Signature | Description |
|----------|-----------|-------------|
| buildCombatFormulas | `(mapping: CombatStatMapping) → CombatFormulas` | Generate standard formulas from stat names |
| buildCombatStack | `(config: CombatStackConfig) → CombatStack` | Wire complete combat module stack from config |

**CombatStackConfig fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| statMapping | `CombatStatMapping` | Yes | Maps attack, precision, resolve to world stat names |
| playerId | `string` | No | Default: `'player'` |
| engagement | `Partial<EngagementConfig>` | No | backlineTags, protectorTags, chokepointTag |
| resourceProfile | `CombatResourceProfile` | No | Stamina/mana/ammo costs, gains, drains, caps |
| biasTags | `string[]` | No | Filter BUILTIN_PACK_BIASES by tag |
| recovery | `Partial<CombatRecoveryConfig>` | No | Recovery config overrides |
| formulaOverrides | `Partial<CombatFormulas>` | No | Override individual formulas |
| tacticsConfig | `Partial<CombatTacticsConfig>` | No | braceStabilizeChance, etc. |

**CombatResourceProfile.resourceCaps:** Optional `Record<string, number>` for per-resource maximum values. Defaults to 100 for any resource not specified.

**Note:** `buildCombatStack` auto-includes `createCognitionCore()` — no need to add it separately.

## Unified Decision — `selectBestAction(entity, world, abilities, config?)`

Merges combat intent and ability intent into a single decision per entity.

| Function | Signature | Description |
|----------|-----------|-------------|
| selectBestAction | `(entity, world, abilities, config?) → UnifiedDecision` | Combined combat + ability scoring |
| formatUnifiedDecision | `(decision) → string` | Human-readable decision summary |

**UnifiedDecisionConfig fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| abilityAdvantageThreshold | `number` | 5 | Ability must outscore combat by this much to win |
| combatConfig | `CombatIntentConfig` | — | Pass-through to combat intent scorer |

Returns a `UnifiedDecision` with `chosen` (verb, targetId, score, source, abilityId?), `combatDecision`, and `abilityDecision`.

## Tag Taxonomy — `tag-taxonomy.ts`

Canonical tag categories and validation utilities.

| Function | Signature | Description |
|----------|-----------|-------------|
| classifyTag | `(tag: string) → TagCategory` | Classify a tag into a canonical category |
| validateEntityTags | `(tags: string[]) → TagWarning[]` | Validate entity tags, warn on multi-role or contradictions |
| validateZoneTags | `(tags: string[]) → TagWarning[]` | Validate zone tags, warn on entity-level tags |

**Tag categories:** `role`, `companion`, `engagement`, `pack-bias`, `zone`, `status`, `custom`

**Prefix conventions:** `role:*`, `companion:*`, `engagement:*` are recognized prefixes. Unprefixed tags are classified by lookup table or marked `custom`.

## Engine — `submitActionAs`

Convenience method on the Engine class for submitting actions on behalf of non-player entities.

```typescript
engine.submitActionAs(entityId: string, verb: string, options?): ResolvedEvent[]
```

Uses `source: 'ai'`. Equivalent to manually calling `dispatcher.createAction()` + `engine.processAction()` but eliminates the boilerplate.
