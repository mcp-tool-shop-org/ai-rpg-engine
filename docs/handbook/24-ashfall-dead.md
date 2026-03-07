> Part VI — Starter Worlds

A walkthrough of the zombie survival starter.

## Setting

Society has snapped in half. A safehouse, a handful of survivors, and the dead walking the streets. You scavenge, negotiate, hide, and decide who gets saved when there isn't enough of anything.

## Contents

| Element | Description |
|---------|-------------|
| Safehouse Lobby | Starting zone — barricade door, supply shelf, radio |
| Abandoned Gas Station | Loot zone — fuel pump, counter, storage room |
| Overrun Street | Hostile zone — roaming dead and broken glass hazards |
| Hospital East Wing | Boss zone — infection risk, collapsed ceiling, medicine cabinet |
| Hospital Rooftop | Lookout zone — signal fire, binoculars, helicopter pad |
| Dr. Chen | NPC — medic, wits 7, hospital supply-run quest |
| Rook | NPC — scavenger, fitness 6 |
| Sergeant Marsh | NPC — military leader, nerve 6, fitness 6 |
| Shambler | Enemy — slow, tough (hp 12, nerve 10) |
| Runner | Enemy — fast, fragile (fitness 7, hp 8) |
| Antibiotics | Item — reduces infection by 25 |
| Survival | Progression tree — scrapper → cool-headed / last-one-standing |

## Ruleset: zombie-minimal

| Stat | Role |
|------|------|
| Fitness | Strength, endurance, melee effectiveness |
| Wits | Awareness, scavenging ability, problem solving |
| Nerve | Courage under pressure, fear resistance |

| Resource | Range | Notes |
|----------|-------|-------|
| HP | 0–30 | Physical health |
| Stamina | 0–20 | Exertion pool, regens 1/tick |
| Infection | 0–100 | Zombie virus, starts at 0, climbs on exposure |

Unique verbs: `barricade` (fortify locations), `scavenge` (forage for supplies).

## How the Systems Interact

1. **Dialogue** — Dr. Chen briefs you on the hospital situation. Accepting the medicine run sets the `hospital-mission` global flag. She explains the infection mechanic in-world.

2. **Environment** — Two hazard types: roaming dead drain stamina (representing exhaustion from evasion), infection-risk zones raise the infection counter for human entities only.

3. **Cognition** — The zombie hunger presentation rule makes undead perceive all living entities as prey. Zombies have nerve 10 (fearless) but wits 1 (mindless).

4. **Combat** — Two enemy archetypes: shamblers are slow but tough, runners are fast but fragile. Different tactical challenges from the same combat system.

5. **Factions** — The survivors faction groups all friendly NPCs (medic, scavenger, leader) with 0.6 cohesion, reflecting the fragile trust of desperate allies.

## Install

```bash
npm install @ai-rpg-engine/starter-zombie
```

```typescript
import { createGame } from '@ai-rpg-engine/starter-zombie';
const engine = createGame(42);
```
