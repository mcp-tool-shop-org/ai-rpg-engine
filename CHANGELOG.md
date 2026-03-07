# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
