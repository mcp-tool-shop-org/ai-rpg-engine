# Chapter 45 — Iron Colosseum (Gladiator Historical Demo)

> Part VI — Starter Worlds

A walkthrough of the gladiator historical starter.

## Setting

An underground gladiatorial arena beneath a crumbling empire. The player fights for freedom, earning patrons and navigating arena politics where the crowd's favor means the difference between glory and a death sentence.

## Contents

| Element | Description |
|---------|-------------|
| Holding Cells | Starting zone — iron bars, straw bedding, fighter graffiti |
| Arena Floor | Combat zone — scorching sand, trap mechanisms, blood stains |
| Patron Gallery | Social zone — silk curtains, wine goblets, wealthy spectators |
| Armory | Supply zone — weapon racks, training dummies, repair bench |
| Tunnel Exit | Escape zone — collapsed rubble, faint daylight, rusted gate |
| Lanista Brutus | NPC — arena master, shrewd businessman (showmanship 5, might 6) |
| Domina Valeria | NPC — wealthy patron, political schemer (showmanship 7) |
| Nerva | NPC — veteran gladiator ally (might 6, agility 5) |
| Arena Champion | Enemy — elite fighter (might 8, agility 6) |
| War Beast | Enemy — trained predator (might 7, agility 7) |
| Patron Token | Item — boosts crowd favor by 10 |
| Arena Glory | Progression tree — crowd-pleaser → iron-endurance → freedom-fighter |

## Ruleset: gladiator-minimal

| Stat | Role |
|------|------|
| Might | Raw power, heavy strikes, breaking through |
| Agility | Speed, evasion, precision attacks |
| Showmanship | Crowd manipulation, taunts, theatrical combat |

| Resource | Range | Notes |
|----------|-------|-------|
| HP | 0–40 | Physical health |
| Fatigue | 0–50 | **Inverse pressure** — rises in combat, reduces hit-chance, recovers -2/tick |
| Crowd Favor | 0–100 | **Volatile** — swings on spectacle, >75 unlocks patron gifts, <25 means death |

Unique verbs: `taunt` (provoke enemies and thrill the crowd), `showboat` (sacrifice efficiency for spectacle and favor).

## How the Systems Interact

1. **Dialogue** — Domina Valeria offers patronage and protection in exchange for loyalty. Accepting sets the `patron-accepted` flag and grants a patron token.

2. **Environment** — Two hazard types: scorching-sand zones build fatigue from the relentless heat, trap-pit zones deal direct HP damage from concealed mechanisms.

3. **Cognition** — The patron perception rule makes wealthy sponsors see gladiators as "investments in blood and spectacle" — you are property until you prove otherwise.

4. **Combat** — Two enemy archetypes: the Arena Champion is a skilled fighter requiring tactical superiority, War Beasts are fast and ferocious but predictable.

5. **Factions** — The arena-stable faction bonds gladiators through shared suffering, while the patron-circle operates on wealth and political influence.

## Install

```bash
npm install @ai-rpg-engine/starter-gladiator
```

```typescript
import { createGame } from '@ai-rpg-engine/starter-gladiator';
const engine = createGame(42);
```

This pack includes 4 abilities (savage-strike, shield-bash, crowd-roar, iron-resolve), the `challenged` status with control tag, and resistance profiles on arena-champion and arena-overlord entities. See [Chapter 48: Abilities System](./48-abilities-system.md).
