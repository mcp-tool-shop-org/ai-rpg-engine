# Chapter 11 — Progression System

> Part III — Simulation Systems

Character advancement without hardcoded levels.

## Topics

- **Currencies** — earned through gameplay events
- **Progression trees** — structured unlock paths
- **Nodes** — individual upgrades with costs, effects, and prerequisites
- **Rewards** — automatic currency grants from event patterns
- **Unlock conditions** — prerequisite nodes and currency costs

## How It Works

Progression is currency-based, not level-based.

1. Events happen in the simulation (combat, exploration, dialogue)
2. Currency rewards fire automatically based on configured patterns
3. Players spend currency to unlock nodes in progression trees
4. Unlocked nodes apply effects to the entity

## Built-in Effect Handlers

| Effect Type | What It Does |
|-------------|-------------|
| stat-boost | Increase a stat permanently |
| resource-boost | Increase a resource cap |
| grant-tag | Add a tag to the entity |
| set-global | Set a global world variable |

## Example Trees

**Fantasy — Combat Mastery**

```
toughened (5 XP)
├── keen-eye (8 XP, requires: toughened)
└── battle-fury (10 XP, requires: toughened)
```

**Cyberpunk — Netrunning**

```
packet-sniffer (5 street-cred)
├── neural-boost (8 street-cred, requires: packet-sniffer)
└── ice-hardening (10 street-cred, requires: packet-sniffer)
```

## Why Engine-Level Progression Matters

Because progression is a module, not baked-in logic, different genres can define entirely different advancement systems:

- XP trees
- reputation unlocks
- doctrine fragments
- cybernetic upgrade slots
- skill proficiency

All use the same underlying currency → tree → effect pipeline.
