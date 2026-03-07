# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
