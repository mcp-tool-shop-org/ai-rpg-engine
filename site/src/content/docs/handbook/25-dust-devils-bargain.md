---
title: "Chapter 25 — Dust Devil's Bargain (Weird West Demo)"
description: "Dust Devil's Bargain (Weird West Demo)"
sidebar:
  order: 25
---

> Part VI — Starter Worlds

A walkthrough of the weird west starter.

## Setting

A frontier town hides a cult summoning something from the red mesa. You're a drifter caught between law, spirits, and a rising supernatural dust that claims anyone who lingers too long. The desert doesn't forget.

## Contents

| Element | Description |
|---------|-------------|
| Drifter's Crossroads | Starting zone — hitching post, dusty road, vultures |
| Saloon | Social zone — bar, poker table, wanted board |
| Sheriff's Office | Authority zone — desk, cell, strongbox |
| Red Mesa Trail | Wilderness zone — cult territory, rattlesnakes, burning sun |
| Spirit Hollow | Supernatural zone — bone circle, whispering wind, spirit anchor |
| Bartender Silas | NPC — informant, lore 5, mesa cult intel quest |
| Sheriff Hale | NPC — law with a secret, grit 6 |
| Dust Revenant | Enemy — cursed gunslinger (draw-speed 7, grit 5) |
| Mesa Crawler | Enemy — spirit beast (lore 8, grit 7) |
| Sage Bundle | Item — reduces Dust by 20 |
| Gunslinger | Progression tree — quick-hand → iron-will → dead-eye |

## Ruleset: weird-west-minimal

| Stat | Role |
|------|------|
| Grit | Toughness, willpower, endurance |
| Draw-Speed | Reflexes, reaction time, quick-draw ability |
| Lore | Supernatural knowledge, spirit communication |

| Resource | Range | Notes |
|----------|-------|-------|
| HP | 0–30 | Physical health |
| Resolve | 0–20 | Mental fortitude, regens 1/tick |
| Dust | 0–100 | **Inverse pressure** — accumulates, 100 = claimed by the desert |

Unique verbs: `draw` (quick-draw duel), `commune` (speak with spirits).

## How the Systems Interact

1. **Dialogue** — Bartender Silas interrogates you about your business, then reveals what he knows about the Red Mesa congregation. Choosing to investigate sets the `mesa-mission` global flag.

2. **Environment** — Two hazard types: dust storms raise the Dust counter for human entities, spirit drain reduces resolve near supernatural zones.

3. **Cognition** — The spirit perception presentation rule makes spirits perceive all living entities as "echoes of the future." This inverts the normal horror dynamic — the supernatural isn't malicious, it's confused.

4. **Combat** — Two enemy archetypes: the Dust Revenant is a fast gunslinger (draw-speed 7), the Mesa Crawler is a lore-heavy spirit beast. Different verbs suit different enemies.

5. **Factions** — Townsfolk (low cohesion 0.4, reflecting frontier individualism) vs the Red Congregation (high cohesion 0.9, cult discipline).

## Install

```bash
npm install @ai-rpg-engine/starter-weird-west
```

```typescript
import { createGame } from '@ai-rpg-engine/starter-weird-west';
const engine = createGame(42);
```
