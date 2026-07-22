<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# AI RPG Engine

A TypeScript toolkit for building deterministic RPG simulations. You define stats, pick modules, wire a combat stack, and create content. The engine handles state, events, RNG, action resolution, and AI decision-making. Every run is reproducible.

This is a **composition engine**, not a finished game. The 10 starter worlds are examples — decomposable patterns you learn from and remix. Your game uses whatever subset of the engine you need.

---

## What This Is

- A **module library** — 30+ engine modules covering combat, perception, cognition, factions, rumors, traversal, companions, and more
- A **composition toolkit** — `buildCombatStack()` wires combat in ~7 lines; `new Engine({ modules })` boots the game
- A **simulation runtime** — deterministic ticks, replayable action logs, seeded RNG
- An **AI design studio** (optional) — scaffolding, critique, balance analysis, tuning, experiments via Ollama

## What This Is Not

- Not a single finished game — it ships 10 playable starter worlds you can `run` today as examples, and the engine is the toolkit you compose your *own* game from
- Not a visual engine — it outputs structured events, not pixels
- Not a story generator — it simulates worlds; narrative emerges from mechanics

---

## Current Status (v2.7.0)

**What works and is tested:**
- Core runtime: world state, events, actions, ticks, replay — stable since v1.0; deterministic byte-identical replay (per-instance id counter, seeded RNG)
- Combat system: 5 actions, 4 combat states, 4 engagement states, companion interception, defeat flow, AI tactics
- Abilities: costs, cooldowns, stat checks, typed effects, 11-tag status vocabulary, AI-aware selection
- **Party combat (v2.4):** ally-targeting (heal / buff / revive), friend/foe AoE filtering, target selectors — a healer can heal a teammate; enemy AoE spares allies
- **Status effects (v2.4):** passive stat modifiers reach combat, deterministic DoT/HoT off the tick counter, depth-capped reactive triggers (thorns/reflect)
- **Plug-in Profiles — per-entity rule resolution (v2.5):** a `might` fighter and a `will` mystic resolve combat in one fight, each reading stats through its own mapping. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()` attaches a profile (stat mapping, resource pools, per-entity abilities); `buildProfile()`, `validateProfileSet()` (duplicate ids rejected), 10 starter-derived templates, and a `profile` CLI command
- **Playable `run` loop (v2.6):** the terminal game is real, not a demo — enemies act on their own AI intent profiles (`aggressive`/`cautious`/`territorial`/`calculating`), a fight ends in victory or defeat, you can save and resume, and abilities and XP are on the action menu. `run <path>` loads a game you scaffolded. Composed terminal UI with a glance-able HUD and accessible color (honors `NO_COLOR` / non-TTY)
- **AI design studio ships as its own `ai` command (v2.6):** `npm install -g @ai-rpg-engine/ollama` → `ai chat` — scaffold, critique, and balance content against a local Ollama model
- Unified decision layer: combat + ability scoring merged into one call (`selectBestAction`)
- All 10 starter worlds use `buildCombatStack()` — the proven composition spine
- Cognition config API (`cognition: CognitionCoreConfig | false`) for per-starter AI tuning
- Tag taxonomy and validation utilities for content authoring
- **The world reacts (v2.7):** kills accrue heat and erode district safety; a per-round world tick spawns hidden pressures that surface as rumors ("Whispers reach you…"), escalate, and expire with consequences; the ~30 authored encounter compositions fire on zone entry in all 10 starters — deterministic per-seed, bloodier districts spawn more, boss set-pieces protected
- **A reason to return (v2.7):** a minimal quest loop on the long-shipped schema — quests offer on triggers, track kill/reach/progress objectives, and pay XP and items exactly once; four authored quests, a **Journal** screen, quest beats in the round's narration
- **Equipment reaches combat (v2.7):** `equip`/`unequip` move real numbers through the status layer the combat formulas already read — zero combat-code changes; gladiator's trident-and-net is wired end-to-end with a test-pinned hit-chance delta
- **Seeded runs (v2.7):** every fresh session prints its seed with the exact replay command; `--seed <n>` reproduces a session byte-for-byte; combat, resist, ability, and tactics rolls all consume the world seed — and endings read the run you actually played (live heat, pressures, faction accruals, player level)
- **`buildWorldStack()` (v2.7):** the strategic composition spine beside `buildCombatStack()` — one call assembles environment, factions, rumors, districts, defeat fallout, encounters, and quests; plus the **Director's Ledger** strategy screen, an `AI_RPG_DEBUG=1` simulation inspector, `inspect-save` gated by the same authorities as Continue, and a module save-migration seam on the shipped restore path
- `ai-rpg-engine create-starter <name>` — scaffold a new game (standalone, runs outside the monorepo); `validate` + `scaffold` content commands; load packs from JSON
- Published starter template on npm (`@ai-rpg-engine/starter-template`)
- Full test suite: **4797 tests** (deterministic across repeated runs; test files typechecked in CI; coverage ratchet-enforced)

**What is rough or incomplete:**
- The AI worldbuilding studio (Ollama layer) is more lightly tested than the simulation core, and needs a local Ollama daemon; it is entirely optional — the engine and the `run` loop need no network
- The narration/audio stack builds deterministic audio commands but there is **no terminal audio backend** — nothing plays a sound; the commands are an integration hook for a GUI/web embedder
- Multiplayer (two human players sharing one world) is **not** built — it is a networking layer, deliberately out of scope; profiles today target a single controller
- `replay --replay` restores the save instead of re-simulating: re-simulation is not sound with world-state modules (world ticks and encounter spawns evolve outside the action log); parity is v2.8 work
- Quests ship in the fantasy and zombie starters first and the equip loop is wired in gladiator first — the machinery is engine-wide; the content rollout is deliberate
- Documentation is extensive but not every handbook page reflects the very latest APIs

---

## What It Looks Like

The bundled terminal UI composes each turn into labeled sections — scene, status, log, and actions — with a glance-able HUD. Output is plain text by default and adds semantic color on a TTY (damage red, heals green, rejections yellow), honoring `NO_COLOR` and non-TTY pipes; every cue is carried in the text too, never color alone.

```text
── The Crypt Gate ──────────────────────────────────────────
  [dark, unhallowed]

  ! Crypt Warden · HP 6/14 · Off Balance
  ! Bone Thrall · defeated
  + Mira · HP 11/16

  * rusted portcullis winch

  Exits: Ossuary, Churchyard

── Status ──────────────────────────────────────────────────
  HP 9/20 [#####-----]  Stamina 4/10
  Status: Guarded
  Items: healing-draught, grave-key

── Log ─────────────────────────────────────────────────────
  > Ash takes a guarded stance.
  > Hit!  4 damage dealt (HP: 6)
  > Bone Thrall defeated!
  > You can't do that: not enough stamina

── Actions ─────────────────────────────────────────────────
  [ 1] Move to Ossuary      [ 3] Attack Crypt Warden
  [ 2] Move to Churchyard   [ 4] Inspect Crypt Warden
────────────────────────────────────────────────────────────
```

---

## Install & Play

Play a starter, or scaffold your own game, from the terminal:

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

The `run` loop is a real turn-based session: enemies act on their own AI
profiles, abilities and XP are on the menu, you can save and resume, and a
fight ends in victory or defeat. Every game is deterministic and replayable.

Optionally, the AI design studio installs as its own command:

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

The studio talks to a local [Ollama](https://ollama.com) daemon — run
`ollama serve` and `ollama pull qwen2.5-coder` first. It is entirely optional;
the engine and the `run` loop need no network.

A container image is published to GHCR as
`ghcr.io/mcp-tool-shop-org/ai-rpg-engine` for CI and sandboxed runs.

---

## Quick Start

Prefer to build your own game in code? Compose the engine from modules:

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { buildCombatStack, traversalCore, statusCore, createDialogueCore } from '@ai-rpg-engine/modules';

// Define your stat mapping
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  biasTags: ['undead', 'beast'],
});

// Wire the engine
const engine = new Engine({
  manifest: myManifest,
  modules: [statusCore, ...combat.modules, traversalCore, createDialogueCore(myDialogues)],
});

// Submit player actions
engine.submitAction('attack', { targetIds: ['skeleton-1'] });

// Submit AI entity actions
engine.submitActionAs('guard-captain', 'attack', { targetIds: ['player'] });
```

See the [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) for the full workflow, or scaffold a new starter:

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## Architecture

| Layer | Role |
|-------|------|
| **Core Runtime** | Deterministic engine — world state, events, actions, ticks, RNG, replay |
| **Modules** | 30+ composable systems — combat, perception, cognition, factions, traversal, companions, etc. |
| **Content** | Entities, zones, dialogue, items, abilities, statuses — author-created |
| **AI Studio** | Optional Ollama layer — scaffolding, critique, balance analysis, tuning, experiments |

---

## Combat System

Five actions (attack, guard, disengage, brace, reposition), four combat states (guarded, off-balance, exposed, fleeing), four engagement states (engaged, protected, backline, isolated). Three stat dimensions drive every formula so a quick duelist plays differently from a heavy bruiser or a composed sentinel.

AI opponents use unified decision scoring — combat actions and abilities compete in a single evaluation, with configurable thresholds to prevent marginal ability spam.

Pack authors use `buildCombatStack()` to wire combat from a stat mapping, resource profile, and bias tags. See the [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) and [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md).

---

## Abilities

Genre-native ability system with costs, stat checks, cooldowns, and typed effects (damage, heal, status apply, cleanse). Status effects use an 11-tag semantic vocabulary with resistance/vulnerability profiles. AI-aware selection scores self/AoE/single-target paths.

```typescript
const warCry: AbilityDefinition = {
  id: 'war-cry', name: 'War Cry', verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2 } },
  ],
  cooldown: 4,
};
```

---

## Packages

| Package | Purpose |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Deterministic simulation runtime — world state, events, RNG, ticks, action resolution |
| [`@ai-rpg-engine/modules`](packages/modules) | 30+ composable modules — combat, perception, cognition, factions, rumors, traversal, companions, NPC agency, strategic map, item recognition, emergent opportunities, arc detection, endgame triggers |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Canonical schemas and validators for world content |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Character progression, injuries, milestones, reputation |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Archetype selection, build generation, starter gear |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Equipment types, item provenance, relic growth |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Cross-session memory, relationship effects, campaign state |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Rumor lifecycle, mutation mechanics, spread tracking |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Narration plan schema, render contracts, voice profiles |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Cue scheduling, priority, ducking, cooldown logic |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Sound pack manifests, content-addressable registry |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Pack registration, rubric scoring, pack discovery |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Content-addressed storage for portraits, icons, media |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Headless portrait generation with pluggable providers |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Optional AI authoring — scaffolding, critique, guided workflows, tuning, experiments |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI: run games, scaffold starters, inspect saves |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Terminal renderer and input layer |

### Starter Examples

The 10 starter worlds are **composition examples** — they demonstrate how to combine engine modules into complete games. Each one shows different patterns (stat mappings, resource profiles, engagement configs, ability sets). See each starter's README for "Patterns Demonstrated" and "What to Borrow."

| Starter | Genre | Key Patterns |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Dark fantasy | Minimal combat, dialogue-driven |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Resources, engagement roles |
| [`starter-detective`](packages/starter-detective) | Victorian mystery | Social-first, perception-heavy |
| [`starter-pirate`](packages/starter-pirate) | Pirate | Naval + melee, multi-zone |
| [`starter-zombie`](packages/starter-zombie) | Zombie survival | Scarcity, infection resource |
| [`starter-weird-west`](packages/starter-weird-west) | Weird west | Pack biases, safe-zone recovery |
| [`starter-colony`](packages/starter-colony) | Sci-fi colony | Chokepoints, ambush zones |
| [`starter-ronin`](packages/starter-ronin) | Feudal Japan | Hidden passages, multiple protector roles |
| [`starter-vampire`](packages/starter-vampire) | Vampire horror | Blood resource, social manipulation |
| [`starter-gladiator`](packages/starter-gladiator) | Historical gladiator | Arena combat, crowd favor |

---

## Documentation

| Resource | Description |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Scaffold a new game — CLI or manual template route |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Build your own game by composing engine modules |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Per-entity rule resolution — mixed-playstyle combat, `applyProfile`, profile templates, the `profile` CLI |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | Six combat pillars, five actions, states at a glance |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | Step-by-step buildCombatStack, stat mapping, resource profiles |
| [Handbook](site/src/content/docs/handbook/index.md) | Comprehensive handbook — every system, plus 4 appendices |
| [Composition Model](docs/composition-model.md) | The 6 reusable layers and how they compose |
| [Examples](docs/examples/) | Runnable TypeScript examples (type-checked + behavior-tested in CI) — per-entity mixed party, shared profiles, cross-world, from scratch |
| [Design Document](docs/DESIGN.md) | Architecture deep-dive — action pipeline, truth vs presentation |
| [Philosophy](PHILOSOPHY.md) | Deterministic worlds, evidence-driven design, AI as assistant |
| [Changelog](CHANGELOG.md) | Release history |

---

## Roadmap

### Where we are now

Both composition spines are complete — 4797 tests across 259 files, all 10 starters on `buildCombatStack` **and** `buildWorldStack`, deterministic byte-identical replay under printed seeds, full AI decision scoring, and a CLI that scaffolds, runs, validates, and inspects. **v2.7 lights up the strategic tier: the world reacts to how you play (heat, pressures, encounters), quests give a run a spine, equipment changes real numbers, and every session is replayable from the seed it prints.**

**Recent release arc (v2.4.0–v2.7.0):**
- v2.4.0 — Party combat (ally-targeting / heal / buff / revive, friend-foe AoE), status-effect system (modifiers + DoT/HoT + reactive triggers), plug-in Profiles Phase 1, content `validate`/`scaffold` CLI
- v2.5.0 — Per-entity rule resolution (mixed-playstyle combat), the `applyProfile` loader + per-entity abilities, profile templates + `profile` CLI, and a full health pass
- v2.6.0 — The `run` command became a real game: enemies act on their own AI profiles, victory/defeat, save/resume, abilities and XP on the menu, the `ai` studio bin, and the narration stack
- **v2.7.0 — The world reacts and there's a reason to return: heat → pressures → narrated consequences, zone-entry encounters, a quest loop + Journal, equipment in combat, seeded replayable runs, live endgame inputs, `buildWorldStack`, the Director's Ledger, and a save-migration seam**

### Next (the v2.8 spine)

- The economy tier — live district economies, a trade surface priced by `computeItemValue`, crafting/salvage loops (the modules ship today; the wiring is next)
- Companions and social verbs — recruit/party mechanics and the bribe/intimidate/seed-rumor playstyle layer over the leverage system
- `--replay` re-simulation parity with world-state modules, and the remaining Director-formatter surfaces
- Multiplayer — two *human* players sharing one world (a networking layer, deliberately deferred; single-controller shared profiles ship today as [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- Serializable formula overrides — per-profile formula tuning (blocked on a formula DSL; profiles carry stat mappings today, not closures)
- API documentation sync — ensure every handbook page reflects the v2.7 APIs

### Destination: Plug-in Profiles

The engine's end goal is **user-defined profiles** — portable bundles that slot into any game. A profile packages a stat mapping, resource behavior, AI bias tags, and abilities into a single importable unit. As of v2.5, entities in one world can each carry their own profile and resolve combat per-entity — a `might` fighter and a `will` mystic share a party, each bringing their own playstyle.

The schema, the `applyProfile` loader, per-entity ability resolution, and cross-profile validation are all shipped. What remains is multiplayer — letting two *human* players (not just two entities) share a world — which is a networking layer. See [Profile Roadmap](docs/profile-roadmap.md) and [feature-architecture.md](docs/feature-architecture.md) for the design.

---

## Philosophy

AI RPG Engine is built around three ideas:

1. **Deterministic worlds** — simulation results must be reproducible.
2. **Evidence-driven design** — world mechanics should be tested through simulation.
3. **AI as assistant, not authority** — AI tools help generate and critique designs but do not replace deterministic systems.

See [PHILOSOPHY.md](PHILOSOPHY.md) for the full explanation.

---

## Security

The core engine is a **local-only simulation library**: no telemetry, no network, no secrets. Save files go to `.ai-rpg-engine/` only when explicitly requested. The **optional** AI layer (`@ai-rpg-engine/ollama`) talks to a **local** Ollama daemon; its opt-in `webfetch` (for RAG) is the only outbound network path and is confined by an SSRF guard (blocks loopback/link-local/CGNAT/cloud-metadata and IPv6-tunnelled equivalents) — you never reach it unless you invoke it. See [SECURITY.md](SECURITY.md) for details.

## Requirements

- Node.js >= 20
- TypeScript (ESM modules)

## License

[MIT](LICENSE)

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
