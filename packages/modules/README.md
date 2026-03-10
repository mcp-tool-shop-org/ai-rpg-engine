<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/modules

17 composable simulation modules for AI RPG Engine — combat, dialogue, cognition, perception, factions, and more.

## Install

```bash
npm install @ai-rpg-engine/modules
```

## Modules

| Module | Description |
|--------|-------------|
| `combatCore` | Attack/defend, damage, defeat, stamina, guard, disengage |
| `dialogueCore` | Graph-based dialogue trees with conditions |
| `inventoryCore` | Items, equipment, use/equip/unequip |
| `traversalCore` | Zone movement and exit validation |
| `statusCore` | Status effects with duration and stacking |
| `environmentCore` | Dynamic zone properties, hazards, decay |
| `cognitionCore` | AI beliefs, intent, morale, memory |
| `perceptionFilter` | Sensory channels, clarity, cross-zone hearing |
| `narrativeAuthority` | Truth vs presentation, concealment, distortion |
| `progressionCore` | Currency-based advancement, skill trees |
| `factionCognition` | Faction beliefs, trust, inter-faction knowledge |
| `rumorPropagation` | Information spread with confidence decay |
| `knowledgeDecay` | Time-based confidence erosion |
| `districtCore` | Spatial memory, zone metrics, alert thresholds |
| `beliefProvenance` | Trace reconstruction across perception/cognition/rumor |
| `observerPresentation` | Per-observer event filtering, divergence tracking |
| `simulationInspector` | Runtime inspection, health checks, diagnostics |
| `combatIntent` | AI decision-making biases, morale, flee logic |
| `engagementCore` | Frontline/backline positioning, bodyguard interception |
| `combatRecovery` | Post-combat wound statuses, safe-zone healing |
| `combatReview` | Formula explanation, hit-chance breakdown |
| `defeatFallout` | Post-combat faction consequences, reputation shifts |
| `bossPhaseListener` | Boss HP-threshold phase transitions |

### Combat Authoring (Pure Functions)

| Export | Purpose |
|--------|---------|
| `combat-roles` | 8 role templates, encounter composition types, danger rating, boss definitions |
| `encounter-library` | 5 encounter archetype factories, 3 boss template factories, pack audit |
| `combat-summary` | Query, audit, format, and inspect combat content |

## Usage

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { combatCore, dialogueCore, cognitionCore, perceptionFilter } from '@ai-rpg-engine/modules';

const engine = new Engine({
  manifest: { /* ... */ },
  seed: 42,
  modules: [combatCore(), dialogueCore(), cognitionCore(), perceptionFilter()],
});
```

## Documentation

- [Modules (Ch. 6)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/06-modules/)
- [AI Cognition (Ch. 8)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/08-ai-cognition/)
- [Perception (Ch. 9)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/09-perception-layers/)
- [Combat System (Ch. 47)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/47-combat-system/)
- [Handbook](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
