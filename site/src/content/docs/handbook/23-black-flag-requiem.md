---
title: "Chapter 23 — Black Flag Requiem (Pirate Demo)"
description: "Black Flag Requiem (Pirate Demo)"
sidebar:
  order: 23
---

> Part VI — Starter Worlds

A walkthrough of the pirate starter.

## Setting

The Caribbean, or something like it. Your ship is your kingdom, port towns are powder kegs, and beneath the waves lies a shrine guarded by the drowned dead.

## Contents

| Element | Description |
|---------|-------------|
| Ship Deck | Starting zone — helm, cannons, cargo hold |
| The Rusty Anchor | Social zone — tavern with notice board, barkeep, rum barrel |
| Governor's Fort | Hostile zone — fortified colonial stronghold with gate, stockade, treasury |
| Open Water | Travel zone — sea routes with storm surge hazard |
| Sunken Shrine | Boss zone — underwater cursed shrine with barnacle altar, treasure chest |
| Quartermaster Bly | NPC — loyal crew, sea-legs 6 |
| Mara the Cartographer | NPC — neutral knowledge broker, cunning 7 |
| Governor Vane | NPC — colonial authority, morale 18 |
| Navy Sailor | Enemy — aggressive AI, enforces law |
| Drowned Guardian | Enemy — cursed sea beast, brawn 7, sea-legs 8 |
| Rum Barrel | Item — restores 8 morale |
| Seamanship | Progression tree — sea-hardened → ruthless / dread-captain |

## Ruleset: pirate-minimal

| Stat | Role |
|------|------|
| Brawn | Raw physical power, melee damage |
| Cunning | Tactics, deception, social maneuvering |
| Sea Legs | Balance, swimming, nautical skill |

| Resource | Range | Notes |
|----------|-------|-------|
| HP | 0–40 | Physical health |
| Morale | 0–30 | Crew spirit, regens 1/tick |

Unique verbs: `plunder` (loot defeated areas), `navigate` (chart courses between islands).

## How the Systems Interact

1. **Dialogue** — The cartographer offers a map deal: bring proof from the sunken shrine and the chart is yours. Accepting sets the `shrine-deal` global flag.

2. **Cognition** — The cursed guardian presentation rule makes cursed creatures perceive all visitors as trespassers desecrating the shrine.

3. **Environment** — Storm surge in open water drains morale. Drowning pressure in the sunken shrine deals HP damage. Two distinct hazard types in one world.

4. **Factions** — The colonial navy faction includes the governor and navy sailors with 0.8 cohesion, creating a united front against pirates.

5. **Progression** — The seamanship tree requires both sea-hardened and ruthless before unlocking dread captain, creating a branching prerequisite structure.

## Install

```bash
npm install @ai-rpg-engine/starter-pirate
```

```typescript
import { createGame } from '@ai-rpg-engine/starter-pirate';
const engine = createGame(42);
```
