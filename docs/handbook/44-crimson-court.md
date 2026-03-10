# Chapter 44 — Crimson Court (Vampire Horror Demo)

> Part VI — Starter Worlds

A walkthrough of the vampire horror starter.

## Setting

A decaying aristocratic manor during a masked ball. Three vampire houses vie for dominance while mortals serve as unwitting pawns. The player is a newly turned vampire navigating court politics while fighting the hunger that threatens to consume what remains of their humanity.

## Contents

| Element | Description |
|---------|-------------|
| Grand Ballroom | Starting zone — chandeliers, masked dancers, blood-red curtains |
| East Gallery | Social zone — oil portraits, whispered secrets, shadowed alcoves |
| Wine Cellar | Supply zone — blood reserves, vintage casks, hidden tunnels |
| Moonlit Garden | Neutral zone — stone fountain, hedge maze, iron gate |
| Bell Tower | Vantage zone — city overlook, bat colony, ancient mechanism |
| Duchess Morvaine | NPC — elder vampire, house leader (presence 8, cunning 7) |
| Cassius | NPC — rival fledgling, ambitious (vitality 6, cunning 5) |
| Servant Elara | NPC — human, knows manor secrets (cunning 7) |
| Witch Hunter | Enemy — mortal threat (vitality 7, cunning 6) |
| Feral Thrall | Enemy — vampire consumed by bloodlust (vitality 8, presence 2) |
| Blood Vial | Item — reduces bloodlust by 15 |
| Blood Mastery | Progression tree — iron-will → mesmerist → apex-predator |

## Ruleset: vampire-minimal

| Stat | Role |
|------|------|
| Presence | Social dominance, supernatural authority |
| Vitality | Physical prowess, feeding efficiency |
| Cunning | Deception, perception, court intrigue |

| Resource | Range | Notes |
|----------|-------|-------|
| HP | 0–30 | Physical health |
| Bloodlust | 0–100 | **Inverse pressure** — rises each tick, loss of control at 100 |
| Humanity | 0–30 | Moral anchor — feeding costs humanity, below 10 locks dialogue |

Unique verbs: `enthrall` (supernatural social domination), `feed` (drain blood to reduce bloodlust).

## How the Systems Interact

1. **Dialogue** — Duchess Morvaine offers guidance on navigating the court and controlling the hunger. Accepting her counsel sets the `duchess-guidance` flag and grants a blood vial.

2. **Environment** — Two hazard types: blood-scent zones raise bloodlust as the hunger gnaws, consecrated-ground zones drain HP from vampires who tread on holy earth.

3. **Cognition** — The vampire perception presentation rule makes all vampires perceive humans as "vessels of warmth" — the hunger colors everything.

4. **Combat** — Two enemy archetypes: Witch Hunters are cunning mortals with silver weapons (outmaneuver or enthrall), Feral Thralls are raw vitality with no restraint (overpower before they frenzy).

5. **Factions** — House Morvaine controls the manor proper, while the witch-hunters operate from the shadows with fanatical cohesion.

## Install

```bash
npm install @ai-rpg-engine/starter-vampire
```

```typescript
import { createGame } from '@ai-rpg-engine/starter-vampire';
const engine = createGame(42);
```

This pack includes 3 abilities (mesmerize, blood-drain, dark-ward), the `mesmerized` status with supernatural tag, and resistance profiles on witch-hunter and elder-vampire entities. See [Chapter 48: Abilities System](./48-abilities-system.md).
