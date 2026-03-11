<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/starter-cyberpunk

> **Composition Example** — This starter demonstrates how to wire the engine for cyberpunk. It is an example to learn from, not a template to copy. See the [Composition Guide](../../docs/handbook/57-composition-guide.md) to build your own game.

**Neon Lockbox** — a cyberpunk starter world for AI RPG Engine.

## Install

```bash
npm install @ai-rpg-engine/starter-cyberpunk
```

## Patterns Demonstrated

This starter demonstrates genre flexibility — the same engine stack with a completely different stat model:

| Feature | What the Lockbox shows |
|---|---|
| **Rulesets** | `cyberpunkMinimalRuleset` — stats (chrome/reflex/netrunning), resources (hp/ice/bandwidth), 8 verbs incl. `hack` & `jack-in` |
| **Zones & traversal** | 3 zones (street → server room → vault) with light, hazards, interactables |
| **Districts** | Neon Street Block (public) vs Vault Complex (secure, faction-controlled) |
| **Dialogue** | Fixer briefing with 3 branches and global-flag effects |
| **Combat** | ICE Sentry with aggressive AI, guard-vault goal |
| **Cognition & perception** | Higher decay + instability, `reflex`-based perception with `netrunning` sense stat |
| **Progression** | 3-node Netrunning Skills tree (Packet Sniffer → ICE Hardening → Neural Boost) |
| **Environment** | Exposed-wiring hazard dealing 2 HP damage on zone entry |
| **Factions** | Vault-ICE faction at 0.95 cohesion |
| **Belief provenance** | Faster rumor propagation (delay=1) with 3% distortion per hop |
| **Inventory** | ICE Breaker program — reduces target ICE by 8 |
| **Presentation rules** | ICE agents flag all non-ICE as intrusion |

### Fantasy vs Cyberpunk — same engine, different rulesets

| | Chapel Threshold | Neon Lockbox |
|---|---|---|
| Stats | vigor / instinct / will | chrome / reflex / netrunning |
| Resources | hp, stamina | hp, ice, bandwidth |
| Unique verbs | — | hack, jack-in |
| Perception | default | reflex-based + netrunning sense |
| Cognition decay | 0.02 base | 0.03 base, 0.8 instability |
| Rumor propagation | delay=2, no distortion | delay=1, 3% distortion |

## What's Inside

- **3 zones** — Neon Block Street Level, Abandoned Server Room, Data Vault
- **1 NPC** — Kira the Fixer (briefing dialogue, 3 conversation paths)
- **1 enemy** — ICE Sentry (aggressive AI, guard-vault goal)
- **1 item** — ICE Breaker program (reduces target ICE resource)
- **1 progression tree** — Netrunning Skills (Packet Sniffer → ICE Hardening → Neural Boost)
- **1 presentation rule** — ICE agents frame all non-ICE entities as intrusion
- **15 modules wired** — same full stack as Chapel Threshold, different configuration

## Usage

```typescript
import { createGame } from '@ai-rpg-engine/starter-cyberpunk';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(77);

// Or import pieces individually:
import { manifest, zones, fixerDialogue, cyberpunkMinimalRuleset } from '@ai-rpg-engine/starter-cyberpunk';
```

## What to Borrow

Squad engagement with backline/protector tags and the bandwidth resource model. Study how engagement roles partition combat responsibility and how bandwidth acts as a shared tactical constraint across the squad.

## Documentation

- [Neon Lockbox (Ch. 21)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/21-neon-lockbox/)
- [Handbook](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
