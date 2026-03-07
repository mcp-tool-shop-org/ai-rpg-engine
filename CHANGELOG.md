# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.8.0] - 2025-07-15

### Added — Scenario Experiments (ollama)

- **chat-experiments.ts** — deterministic experiment engine: batch runs, sweeps, variance analysis, comparisons
  - `ExperimentSpec`, `ExperimentRunResult`, `AggregateMetrics`, `VarianceFinding`, `ExperimentSummary`, `ExperimentComparison`, `ParameterSweepSpec`, `SweepPoint`, `ParameterSweepResult`, `ExperimentPlanStep`, `ExperimentPlan`, `ReplayProducer` types

- **P1 — Deterministic Experiment Runner**
  - `runExperiment(spec, producer)` — batch-runs a scenario N times with deterministic seeds
  - `deriveSeeds(spec)` — seeds from `seedList` or `seedStart` with defensive copy
  - Seed isolation: each run gets its own seed, results are reproducible across machines
  - Graceful failure: failed runs recorded with error, non-failures still aggregate

- **P2 — Scenario Metrics Extraction**
  - `extractScenarioMetrics(replayData)` — tick-level metric extraction from replay JSON
  - Handles raw tick arrays, wrapped objects (`{ ticks: [...] }`), empty/single-tick replays
  - Extracts: totalTicks, escalationTick, rumorSpreadReach, encounterDuration, factionHostilityPeak, encounterTicks, escalationPhases

- **P3 — Variance Analysis**
  - `computeAggregate(metrics[])` — means, mins, maxes, variances, rates across all runs
  - `detectVarianceFindings(aggregate, runCount)` — 6 variance rules with severity levels
  - Rules: high_variance_encounter_duration, rare_escalation_trigger, unstable_rumor_spread, survival_outcomes_too_swingy, high_variance_hostility_peak, escalation_timing_unstable
  - Each finding includes code, severity (low/medium/high), metric, summary, likelyCause, suggestion

- **P4 — Parameter Sweeps**
  - `runParameterSweep(sweepSpec, producer)` — sweep a tunable parameter across values
  - `generateSweepValues(from, to, step)` — float-safe range generation
  - `isTunableParam(name)` / `getTunableParams()` — 7-param whitelist with ranges
  - Tunables: rumorClarity, alertGain, hostilityDecay, escalationThreshold, stabilityReactivity, escalationGain, encounterDifficulty
  - Each sweep point runs the full experiment, recommendation generated from results

- **P5 — Experiment Comparison**
  - `compareExperiments(before, after)` — structured comparison with improvements, regressions, unchanged
  - `isImprovementDirection` heuristic: lower-is-better for durations/peaks, higher for survival/reach
  - Metric diffs with before/after/delta, variance findings delta

- **P6 — Experiment Plans**
  - `generateExperimentPlan(goal, session?)` — 3 plan templates: compare (40 runs), sweep (60 runs), default batch (20 runs)
  - Goal keyword detection: "compare"→compare template, "sweep"→sweep template
  - Each step has id, description, command, params, status

- **P7 — Session Integration**
  - 6 new `SessionEventKind` values: `experiment_plan_created`, `experiment_started`, `experiment_run_completed`, `experiment_sweep_completed`, `experiment_compared`, `experiment_findings_added` (33 total)
  - Engine tracks `lastExperiment` and `baselineExperiment` state

- **P8 — Chat Integration**
  - 4 new intents: `experiment_run`, `experiment_sweep`, `experiment_compare`, `experiment_plan` (30 total)
  - 4 new tools: `experiment-run`, `experiment-sweep`, `experiment-compare`, `experiment-plan` (29 total)
  - 4 new router patterns with extractParams (run count, sweep param/range/step, plan goal)
  - 6 new shell commands: `/experiment-plan`, `/experiment-run`, `/experiment-sweep`, `/experiment-compare`, `/experiment-findings`
  - Personality mappings: experiment_run/sweep/compare→ANALYST, experiment_plan→WORLDBUILDER

- **5 formatting functions**: `formatExperimentSummary`, `formatExperimentComparison`, `formatParameterSweepResult`, `formatExperimentPlan`, `formatRunResults`

- 114 new tests (1154 total): seed derivation (5), experiment runner (10), metrics extraction (7), aggregate computation (8), variance detection (9), parameter sweeps (12), experiment comparison (7), experiment plans (7), session integration (2), chat router patterns (14), tool registry (6), formatting (18), edge cases (9)

## [1.7.0] - 2026-07-14

### Added — Guided Tuning (ollama)

- **chat-tuning-engine.ts** — operational tuning engine: bundles, patches, previews, impact predictions
  - `ConfigPatch`, `ReplayImpactPrediction`, `TuningBundle`, `PatchPreview`, `DesignImpactSection`, `DesignImpactComparison` types

- **P1 — Tuning Plans (operational)**
  - `generateOperationalPlan(goal, session, analysis)` — concrete config-level tuning plans grounded in analysis findings
  - Falls back to content-creation plans (v1.6.0) when no analysis available
  - Steps include preview → apply per bundle → verify via compare-scenarios
  - Each apply step stores serialized patches and impact predictions in params

- **P2 — Fix Bundles**
  - `bundleFindings(findings, fixes)` → groups related findings into systemic `TuningBundle[]`
  - 5 bundle templates: escalation_tuning, rumor_flow_fix, faction_dynamics_fix, district_stability_fix, encounter_design_fix
  - Each bundle includes finding codes, fix codes, config patches, and predicted impact

- **P3 — Patch Preview**
  - `generateConfigPatches(fix)` → concrete `ConfigPatch[]` with path, field, oldValue, newValue, unit
  - 7 patch templates mapping fix codes to config changes with default values and deltas
  - `buildPatchPreview(goal, findings, fixes, session)` → full `PatchPreview` with aggregate impact
  - `previewTuningStep(state, stepId)` → preview a specific step's patches and impact
  - `generatePatchYaml(bundle, goal)` → YAML config content grouped by path with comments

- **P4 — Replay Impact Modeling**
  - `predictImpact(patches, fixCodes?)` → heuristic `ReplayImpactPrediction` per patch set
  - 7 impact rules mapping fix codes to predicted metric changes (rumor reach, escalation timing, encounter duration, hostility curve)
  - Confidence scaling: 0.50 base + 0.10 per patch, capped at 0.85

- **P5 — Compare Before/After (design emphasis)**
  - `buildDesignImpact(comparison, intent?)` → Improved / Unchanged / Regression sections
  - Fills in unmeasured dimensions as unchanged; includes intent target mood when provided

- **P6 — Session Tracking**
  - 3 new `SessionEventKind` values: `tuning_step_previewed`, `tuning_step_applied`, `tuning_bundle_created` (27 total)
  - Engine captures `lastAnalysis` from analyze-balance runs for operational tuning

- **P7 — Chat Integration**
  - 3 new intents: `tune_preview`, `tune_apply`, `tune_bundles` (26 total)
  - 3 new tools: `tune-preview`, `tune-apply` (mutates), `tune-bundles` (25 total)
  - 3 new router patterns with keyword/regex matching
  - 4 new/enhanced shell commands: `/tune-preview` (now shows patches+impact), `/tune-apply`, `/tune-bundles`, `/tune-impact`
  - `/tune` now uses operational plan when prior analysis is available

- **5 formatting functions**: `formatConfigPatch`, `formatPatchPreview`, `formatTuningBundles`, `formatReplayImpact`, `formatDesignImpact`

- 114 new tests (1040 total): config patch generation (10), impact prediction (11), fix bundling (12), patch preview (8), operational plan generation (14), design impact comparison (10), step preview (6), YAML generation (6), formatting (12), router integration (8), tool integration (5), session events (3), edge cases (9)

## [1.4.0] - 2026-06-14

### Added — Adaptive Context (ollama)

- **Richer session-aware routing (A1-A2)**
  - `buildTaskString()` now includes issue buckets, replay signals, recent artifact types, stale issues, profile name
  - `IssueBucket` type with 8 route-friendly categories; `CODE_TO_BUCKET` mapping (25+ issue codes)
  - `summarizeIssueBuckets()` — deterministic issue compression for routing signals
  - Internal helpers: `extractReplaySignals()`, `recentArtifactTypes()`, `countStaleIssues()`

- **Personality-aware loadout routing (B1-B2)**
  - `PROFILE_SOURCE_BIAS` table: analyst→[replay,critique,decision], generator→[artifact,doc], worldbuilder→[artifact,doc,session,decision], router→[session]
  - `applyProfileBias()` — adds profile-biased sources (never removes)
  - `explainProfileInfluence()` — deterministic explanation of profile's effect on source selection
  - `routeContext()` and `buildTaskString()` now accept optional `PersonalityProfile`
  - `LoadoutRoutePlan.profileInfluence` field

- **Context budget transparency (C1-C3)**
  - `RetrievalResult` expanded: `excludedSources`, `droppedByBudget`, `truncatedCount`, `totalCandidates`
  - `RetrievalSummary` updated with excluded/dropped/truncated data
  - `ClassBreakdown.budgetSharePercent` — per-class share of total shaping budget
  - Pipeline utilization summary line in `/context` output
  - Loadout profile influence shown in `/context` when present

- **Telemetry-aware affordances (D1-D2)**
  - `LoadoutHistoryEntry` / `loadoutHistory` on `ChatEngine` — rolling history of routing decisions (max 20)
  - `/loadout-history` shell command with `formatLoadoutHistory()`
  - `detectRepeatedContext()` — warns when same source set is routed 3× with open issues
  - `ContextSnapshot.warnings` array shown in `/context` output

- **Documentation (E1-E2)**
  - "Adaptive Context" section in AI_WORLDBUILDING.md with pipeline overview and worked example
  - Shell command reference table for `/context`, `/sources`, `/loadout`, `/loadout-history`

- 37 new tests (745 total): issue buckets, profile influence, retrieval transparency, budget tracking, loadout history, repeated-context detection
## [1.6.0] - 2026-07-14

### Added — Simulation-Guided Balancing (ollama)

- **chat-balance-analyzer.ts** — deterministic simulation analysis, intent comparison, and tuning workflows
  - `DesignIntent`, `BalanceFinding`, `BalanceAnalysis`, `IntentComparison`, `WindowAnalysis`, `SuggestedFix`, `ScenarioComparison`, `TuningStep`, `TuningPlan`, `TuningState` types
  - `parseReplayData()` — flexible replay parser (array, object with ticks, single tick)
  - `extractMetrics()` — builds metric curves, detects escalation, counts rumor reach, hostility peak, escalation phases

- **P1 — Balance Analysis**
  - `analyzeBalance(replayData, session)` → structured `BalanceAnalysis` with metrics + findings
  - 7 deterministic balance checks: `DIFFICULTY_FLAT`, `ESCALATION_TOO_FAST`, `RUMOR_NO_SPREAD`, `HOSTILITY_PINNED`, `STABILITY_INERT`, `ENCOUNTER_NO_ESCALATION`, `SHORT_SIMULATION`
  - Session cross-reference: `SESSION_ESCALATION_ISSUES` correlates open session issues with replay data

- **P2 — Intent vs Outcome**
  - `parseDesignIntent(text)` — parses YAML-like `targetMood`, `desiredOutcomes`, `notes` declarations
  - `compareIntent(intent, replayData, session)` → `IntentComparison` with per-outcome status (achieved/partial/missed)
  - Outcome evaluation patterns: escalation-by-tick, rumor-reach, avoid-combat/dialogue, generic-byTick
  - Mood assessment: paranoia/suspicion/tension, calm/peace, danger/lethal, mystery/intrigue

- **P3 — Replay Window Analysis**
  - `analyzeWindow(replayData, startTick, endTick, focus?)` — tick-range slicing with optional category filter

- **P4 — Auto-Suggested Fixes**
  - `suggestFixes(findings)` → structured `SuggestedFix[]` with confidence scores, sorted by confidence
  - 7 fix templates: `increase_alert_sensitivity`, `reduce_alert_gain`, `add_rumor_path`, `increase_hostility_decay`, `connect_stability_events`, `lower_escalation_threshold`, `review_escalation_mechanics`
  - No changes applied without explicit confirmation — suggestions only

- **P5 — Compare Scenarios**
  - `compareScenarios(beforeData, afterData, intent?)` → `ScenarioComparison` with 6 dimensions
  - Dimensions: escalation pacing, rumor spread, encounter duration, faction hostility peak, escalation phases, district stability variance
  - Intent-aware verdict: improved/regressed/mixed/unchanged relative to design goals

- **P6 — Guided Tuning Plans**
  - `generateTuningPlan(goal, session)` with 4 built-in templates: paranoia (5 steps), lethality (5 steps), rumor speed (5 steps), escalation (5 steps)
  - `detectTuningTemplate()` — keyword-based template matching
  - State management: `createTuningState()`, `nextPendingTuningStep()`, `markTuningStepExecuted()`, `markTuningStepFailed()` with cascading failure
  - Tuning execution in ChatEngine: `executeTuningStep()`, `executeAllTuningSteps()`

- **8 formatting functions**: `formatBalanceAnalysis`, `formatIntentComparison` (●/◐/○ icons), `formatWindowAnalysis`, `formatSuggestedFixes`, `formatScenarioComparison` (+/-/= directions), `formatTuningPlan`, `formatTuningStatus` (○/●/✗/– icons), `formatTuningPlan`

- **Chat integration**
  - 6 new intents: `analyze_balance`, `compare_intent`, `analyze_window`, `suggest_fixes`, `compare_scenarios`, `tune_goal`
  - 6 new tools registered (22 total)
  - 11 new shell commands: `/analyze-balance`, `/compare-intent`, `/analyze-window`, `/suggest-fixes`, `/compare-scenarios`, `/tune`, `/tune-preview`, `/tune-step`, `/tune-execute`, `/tune-status`
  - 9 new `SessionEventKind` values for balance/tuning lifecycle tracking
  - Router pattern ordering fix: `suggest_fixes` now matches before `suggest_next`

- 100 new tests (926 total): replay parsing, metric extraction, all 7 balance checks, intent parsing, outcome evaluation (escalation/rumor/mood), window analysis, fix suggestions, scenario comparison (6 dimensions + intent-aware verdict), tuning plan generation (4 templates + generic), state management (create/execute/fail/cascade/complete), formatting, router integration, tool registration, session events, edge cases

## [1.5.0] - 2026-07-03

### Added — Guided Build Mode (ollama)

- **chat-build-planner.ts** — session-aware, plan-first build workflows
  - `BuildStep`, `BuildPlan`, `BuildState` types — full build lifecycle tracking
  - `generateBuildPlan(goal, session)` — deterministic plan generation from natural language goals
  - Three build templates: district, scenario, faction network — auto-detected from goal keywords
  - `detectTemplate()` — keyword-based template matching exported for testing
  - Smart artifact skip: if session already has matching artifacts, those steps are omitted
  - Issue-aware injection: open `RUMOR_*`, `FACTION_*`, `GAP_*` issues inject extra steps or warnings
  - Replay-aware injection: `never_triggered` / `regression` replay findings inject encounter-pack steps
  - Dependency ordering: steps carry `dependencies[]` and `usePriorContent` for critique injection

- **Build state management**
  - `createBuildState()`, `nextPendingStep()`, `markStepExecuted()`, `markStepFailed()`
  - `isBuildComplete()`, `finalizeBuild()` — lifecycle with cascading failure (dependent steps auto-skip)
  - `BuildState.generatedContent[]` accumulates YAML from scaffold steps for critique injection

- **Formatting**
  - `formatBuildPlan()` — numbered steps with warnings and available commands
  - `formatBuildPreview()` — detailed step view with kind/theme/artifact outputs
  - `formatBuildStatus()` — status icons (○/●/✗/–) with progress fraction
  - `formatBuildDiagnostics()` — post-build diagnostics (step counts, issues, missing artifacts)

- **Build execution in ChatEngine**
  - `activeBuild: BuildState | null` on engine — tracks active build plan
  - `executeBuildStep()` — executes next pending step through existing tool registry
  - `executeAllBuildSteps()` — runs all remaining steps with post-build diagnostics
  - Build plan captured automatically when `build_goal` tool returns

- **Session integration**
  - 4 new `SessionEventKind` values: `build_plan_created`, `build_step_executed`, `build_step_failed`, `build_plan_completed`
  - Every build action records events in session history

- **Chat + shell integration**
  - `build_goal` intent added to `ChatIntent` with keyword pattern + LLM fallback
  - `build-plan` tool registered in tool registry (non-mutating)
  - 6 new shell commands: `/build <goal>`, `/preview`, `/step`, `/execute`, `/status`, `/diagnostics`
  - Help text updated with all build commands

- 81 new tests (826 total): template detection, plan generation, artifact skipping, issue/replay injection, build state lifecycle, formatting, router integration, tool registration, edge cases, session event types
## [1.3.0] - 2026-06-13

### Added — Loadout-Guided Context (ollama)

- **chat-loadout.ts** — adapter wrapping `@mcptoolshop/ai-loadout` as a pre-retrieval routing layer
  - `buildTaskString()` — composites user message + classified intent + session summary into a routing signal
  - `routeContext()` — calls `planLoad()`, maps loadout entries to `SourceKind` values for RAG gating
  - `recordContextLoads()` — observability via `recordLoad()` JSONL usage log
  - `formatLoadoutRoute()` — human-readable loadout routing display for `/loadout` command
  - Graceful fallback: returns passthrough plan (all sources allowed) when ai-loadout is not installed
- **RetrievalQuery.allowedSources** — new optional field gates which `SourceKind` retrievers run
- **ChatEngineOptions.loadoutEnabled** — opt-in flag to activate loadout routing before RAG
- **ChatEngine.lastLoadoutPlan** — exposes last routing plan for introspection
- **ContextSnapshot.loadout** / **LoadoutSummary** — loadout routing info in context browser
- **`/loadout`** shell command — shows last loadout routing plan in the REPL
- **formatContextSnapshot** / **formatSources** — now show loadout gating info when active
- Optional peer dep: `@mcptoolshop/ai-loadout >= 0.1.0`
- 26 new tests (chat-loadout: 18, chat-rag allowedSources: 3, chat-context-browser loadout: 5)

## [1.2.0] - 2026-06-12

### Added — Action Intelligence + Context Browser (ollama)

- **chat-planner.ts** — session-aware multi-step planning (`planFromSession`, `formatPlan`, `validatePlan`)
- **chat-recommendations.ts** — leverage-scored structural recommendations (`generateRecommendations`)
- **replay-classifier.ts** — deeper replay diff classification (`classifyReplayChanges`, `formatClassification`)
- **chat-context-browser.ts** — inspectable view of RAG/shaping/profile decisions (`buildContextSnapshot`)
- 3 new intents: `context_info`, `show_plan`, `recommend`
- 3 new tools: `context-info`, `smart-plan`, `recommend` (15 total)
- `/context` and `/sources` slash commands in chat shell
- 92 new tests (682 total)

## [1.1.0] - 2026-06-10

### Added — Context Teeth (ollama)

- **chat-rag.ts** — file-system-based RAG retrieval (session, artifacts, docs, transcripts)
- **chat-memory-shaper.ts** — memory class shaping (current session, open issues, relevant artifacts, etc.)
- **chat-personality.ts** — 3 profiles (Worldbuilder, Analyst, Generator) + intent-based routing
- **chat-webfetch.ts** — URL fetching with domain allowlist
- Webfetch integration in chat engine

## [1.0.0] - 2026-03-06

### Added

- **Core runtime** — WorldStore, ActionDispatcher, ModuleManager, PresentationChannels, seeded RNG, persistence, deterministic replay
- **Combat core** — attack/defend verbs, damage resolution, defeat detection, stamina costs
- **Dialogue core** — graph-based dialogue trees, conditional choices, state effects
- **Inventory core** — item management, equipment slots, use/equip/unequip verbs
- **Traversal core** — zone movement, exit validation, location tracking
- **Status core** — status effects with duration, tick processing, stacking rules
- **Environment core** — dynamic zone properties (light, noise, stability), hazards, decay
- **Cognition core** — AI belief model, intent profiles, morale, memory systems
- **Perception filter** — sensory channels, clarity model, cross-zone perception
- **Narrative authority** — truth vs presentation, concealment, distortion, contradiction tracking
- **Progression core** — currency-based advancement, skill trees, unlock effects
- **Faction cognition** — faction beliefs, trust dynamics, inter-faction knowledge
- **Rumor propagation** — information spread with confidence decay, source tracking
- **Knowledge decay** — time-based confidence erosion for AI memories
- **District core** — spatial memory, zone metric aggregation, alert thresholds
- **Belief provenance** — query-based trace reconstruction across perception/cognition/rumor logs
- **Observer presentation** — per-observer event filtering with custom rules, divergence tracking
- **Simulation inspector** — runtime state inspection, health checks, diagnostics
- **Content schema** — 9 content types with validation, cross-reference checking, content loading pipeline
- **Terminal UI** — renderer, text parser, action selection, hybrid command interface
- **CLI** — run, replay, inspect-save commands
- **Fantasy starter** — The Chapel Threshold (dark fantasy demo)
- **Cyberpunk starter** — Neon Lockbox (cyberpunk demo)
- **Handbook** — 25 chapters + 4 appendices covering full engine documentation
- **Design document** — comprehensive architecture overview
