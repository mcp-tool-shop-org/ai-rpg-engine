<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

This is a **composition engine**, not a finished game. The 12 starter worlds are examples — decomposable patterns you learn from and remix. Your game uses whatever subset of the engine you need.

---

## What This Is

- A **module library** — 30+ engine modules covering combat, perception, cognition, factions, rumors, traversal, companions, and more
- A **composition toolkit** — `buildCombatStack()` wires combat in ~7 lines; `new Engine({ modules })` boots the game
- A **simulation runtime** — deterministic ticks, replayable action logs, seeded RNG
- An **AI design studio** (optional) — scaffolding, critique, balance analysis, tuning, experiments via Ollama
- An **optional on-ledger layer** — `@ai-rpg-engine/ledger-adapter` backs a game's coin and tradeable items with real XRPL **testnet** tokens, settled at checkpoints, entirely outside the deterministic core (opt-in; a run is byte-identical without it)
- An **optional visual host** — `@ai-rpg-engine/sidecar` plus the Godot 4 client [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage). The engine still does not emit pixels. The stage draws a 2:1 dimetric harbour and plays `felt` audio. Occupancy stays a zone id.

## What This Is Not

- Not a single finished game — it ships 12 playable starter worlds you can `run` today as examples, and the engine is the toolkit you compose your *own* game from
- Not a visual engine — it outputs structured events, not pixels. Drawing is a host's job (terminal, or Godot)
- Not a story generator — it simulates worlds; narrative emerges from mechanics

---

## Current Status (v4.0.0)

**What works and is tested:**
- The simulation core: deterministic ticks, seeded RNG, byte-identical replay, and save and resume
- Party combat: ally targeting, status effects, area attacks that spare allies, and enemies that act on their own AI intent profiles
- A world that reacts: factions, rumors, a trade economy, companions, named NPCs with their own goals, and consequences for what you do
- All 12 starter worlds, playable today with `run`
- World Forge packs, loaded as content
- The Godot 4 host [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage), through the sidecar, with `felt` audio cues
- The opt-in XRPL testnet ledger layer

**What is rough or incomplete:**
- The AI design studio (Ollama) is optional and more lightly tested than the simulation core
- There is no terminal audio backend: only the Godot stage plays sound
- Multiplayer (two human players in one world) is not built
- `replay --replay` restores the save instead of re-simulating, by design
- Some handbook pages lag behind the latest APIs

The full release history is in [CHANGELOG.md](CHANGELOG.md).

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

## The XRPL ledger adapter (opt-in)

`@ai-rpg-engine/ledger-adapter` is an **optional** package that binds a game's
**player-owned tradeable layer** — the `coin` balance and consumable inventory
that `trade-core`'s `buy`/`sell` verbs already move — to the **XRPL testnet**, so
those assets can be backed by real on-ledger tokens and settled at checkpoints.
An absent adapter is exactly the offline engine that ships today.

**The determinism invariant (the whole point).** The adapter is a *side channel*,
never part of the simulation:

- It is **never invoked inside the deterministic tick** — only at **checkpoints**
  (save, town/market entry, chapter break).
- Nothing in `@ai-rpg-engine/core` or `@ai-rpg-engine/modules` imports it (its
  only engine dependency is a compile-time `import type`).
- **A run is byte-identical with or without it.** A firewall test runs the real
  `starter-pirate` `createGame()` merchant loop on two engines — one with the
  adapter enabled and settling at a checkpoint — and asserts the two worlds are
  deep-equal. Seed-0 replay is untouched.

**Integration levels — a game folds it in as deeply as its design wants.** The
firewall is a *determinism* boundary, not an anti-integration rule; the invariant
above holds at every level:

| Level | What depends on the adapter | Fits |
|-------|-----------------------------|------|
| **L0 — External observer** | Nothing inside the game; the adapter attaches from outside at checkpoints and the game is unaware. | Retrofitting an existing game (the shipped pirate demo). |
| **L1 — Game-driven checkpoints** | The game's own save / town / meta-progression flow calls the adapter at defined moments. | A game that wants deliberate ledger moments. |
| **L2 — Ledger-native design** | The game's economy or identity is designed *around* on-chain ownership (persistent issuer, real markets). | A ledger-first merchant game. |

The distinction that keeps replay safe is **not** "which package imports the
adapter" but "is the call inside the tick." A game package may import and drive
the adapter freely, as long as every call lands at a checkpoint outside the
seed-driven replay loop.

**Three play modes.** `offline` (default — no chain, the engine as it ships) ·
`ledger` (coin/items backed by testnet balances, settled at checkpoints) ·
`diary` (play offline, then anchor the run's state hash on-ledger for a
tamper-evident receipt).

**What's on the ledger.** `coin` → an issued-currency IOU over a trust line;
consumable items → fungible tokens; a checkpoint's net trade delta → a settled
transfer via **XLS-85 token escrow**. Unique equipment ships as **XLS-20 NFTs**
(v3.3), with relic growth advancing a mutable NFT's metadata in place via
**XLS-46 `NFTokenModify`** — driven by real play as of v3.4. The abstract district
economy (`economy-core`) is *not* touched — it stays a pure simulation.

**Safety rails.** Testnet only, with a **mainnet-impossible-in-code** structural
guard (not a config flag); wallet seeds live in a gitignored secrets sidecar,
never in the save file; settlement is idempotent and conservation-safe on the
retry path; proofs verify the **real on-chain memo** (not the engine's own
string); and if the chain is unreachable the run simply continues, marked
*unanchored*.

**Proven live.** A real `starter-pirate` merchant run — sell a cutlass, buy a
cannon-shell — settles on XRPL testnet via token escrow, then `reconcile()`
confirms on-ledger balances and memos against the engine's economy (conservation
holds for every token). The ledger is a different system family than the engine,
so the engine cannot fake it — reconciliation is a genuine external verifier.
Testnet only; assets are game-scoped receipts, not securities.

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
| [`@ai-rpg-engine/equipment`](packages/equipment) | Equipment types, item provenance, and relic growth — including `item-chronicle-core`, the opt-in module that records gear history from real play so items earn epithets and tiers |
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
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | Mercantile starter — the reference pack for the ledger adapter, carrying no dependency on it |
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | Thief-taker starter — pursuit as the loop, and which half of a city will open a door to you |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **Optional** — opt-in XRPL testnet settlement for the player-owned tradeable layer (coin / inventory / trade), via XLS-85 token escrow at checkpoints, entirely outside the deterministic core |

### Starter Examples

The 12 starter worlds are **composition examples** — they demonstrate how to combine engine modules into complete games. Each one shows different patterns (stat mappings, resource profiles, engagement configs, ability sets). See each starter's README for "Patterns Demonstrated" and "What to Borrow."

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
| [`starter-merchant`](packages/starter-merchant) | Mercantile | Obligation as the loop, combat priced as a penalty |
| [`starter-bounty-hunter`](packages/starter-bounty-hunter) | Pursuit | Hunting people for money; violence is loud, not forbidden |
| [`starter-vampire`](packages/starter-vampire) | Vampire horror | Blood resource, social manipulation |
| [`starter-gladiator`](packages/starter-gladiator) | Historical gladiator | Arena combat, crowd favor |

---

## Documentation

| Resource | Description |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Scaffold a new game — CLI or manual template route |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Build your own game by composing engine modules |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Per-entity rule resolution — mixed-playstyle combat, `applyProfile`, profile templates, the `profile` CLI |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | Opt-in on-ledger settlement — the determinism firewall, L0/L1/L2 integration levels, play modes, safety rails, and the live-proven pirate demo |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | Six combat pillars, five actions, states at a glance |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | Step-by-step buildCombatStack, stat mapping, resource profiles |
| [Visual Clients](site/src/content/docs/handbook/66-visual-clients.md) | Sidecar hosts, felt payload, Godot dimetric harbour — presentation may lie, occupancy stays a zone id |
| [Handbook](site/src/content/docs/handbook/index.md) | Comprehensive handbook — every system, plus 4 appendices |
| [Composition Model](docs/composition-model.md) | The 6 reusable layers and how they compose |
| [Examples](docs/examples/) | Runnable TypeScript examples (type-checked + behavior-tested in CI) — per-entity mixed party, shared profiles, cross-world, from scratch |
| [Design Document](docs/DESIGN.md) | Architecture deep-dive — action pipeline, truth vs presentation |
| [Philosophy](PHILOSOPHY.md) | Deterministic worlds, evidence-driven design, AI as assistant |
| [Changelog](CHANGELOG.md) | Release history |

---

## Roadmap

### Where we are now

Both composition spines are complete: all 12 starters run on `buildCombatStack` **and** `buildWorldStack`, replay is deterministic and byte-identical under printed seeds, AI decision scoring is complete, and the CLI scaffolds, runs, validates and inspects.

The full release history is in [CHANGELOG.md](CHANGELOG.md).

### Next

What remains is later-cycle work:

- A prosperous-family ambient bed (the tone bridge and per-zone roll ship; CORE still has no prosperous stem)
- Multiplayer — two *human* players sharing one world (a networking layer, deliberately deferred; single-controller shared profiles ship today as [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- Serializable formula overrides — per-profile formula tuning (blocked on a formula DSL; profiles carry stat mappings today, not closures)

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

The core engine is a **local-only simulation library**: no telemetry, no network, no secrets. Save files go to `.ai-rpg-engine/` only when explicitly requested. Two **optional** layers add an outbound path, and only when you invoke them:

- The AI layer (`@ai-rpg-engine/ollama`) talks to a **local** Ollama daemon; its opt-in `webfetch` (for RAG) is confined by an SSRF guard (blocks loopback/link-local/CGNAT/cloud-metadata and IPv6-tunnelled equivalents).
- The ledger layer (`@ai-rpg-engine/ledger-adapter`) reaches the **XRPL testnet** — and only the testnet: a **mainnet-impossible-in-code** structural guard (not a config flag) rejects any non-testnet host at construction. Wallet seeds live in a gitignored secrets sidecar, never in a save file, and the deterministic core never imports the adapter.

See [SECURITY.md](SECURITY.md) for details.

## Requirements

- Node.js >= 20
- TypeScript (ESM modules)

## License

[MIT](LICENSE)

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
