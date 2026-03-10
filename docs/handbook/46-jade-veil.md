# Chapter 46 — Jade Veil (Feudal Mystery Demo)

> Part VI — Starter Worlds

A walkthrough of the feudal mystery starter.

## Setting

A feudal castle during a tense political summit. Lord Takeda has been poisoned. The player — a ronin hired for protection — must find the poisoner while navigating a court where every accusation costs honor and silence costs lives.

## Contents

| Element | Description |
|---------|-------------|
| Castle Gate | Starting zone — stone archway, guard post, courtyard bridge |
| Great Hall | Social zone — war banners, tatami mats, ancestral shrine |
| Tea Garden | Investigation zone — stone lanterns, koi pond, whispering pines |
| Lord's Chamber | Restricted zone — silk screens, medicine table, poison residue |
| Hidden Passage | Secret zone — narrow tunnel, dust, concealed door mechanism |
| Lord Takeda | NPC — poisoned lord, bedridden (composure 7) |
| Lady Himiko | NPC — lord's wife, suspect (composure 8, perception 6) |
| Magistrate Sato | NPC — investigator, potential ally (perception 7, discipline 5) |
| Shadow Assassin | Enemy — hidden killer (discipline 7, perception 8) |
| Corrupt Samurai | Enemy — bodyguard turned traitor (discipline 8, composure 4) |
| Incense Kit | Item — restores 5 ki |
| Way of the Blade | Progression tree — steady-hand → inner-calm → righteous-fury |

## Ruleset: ronin-minimal

| Stat | Role |
|------|------|
| Discipline | Martial skill, blade technique, focus |
| Perception | Awareness, deduction, reading intent |
| Composure | Social control, emotional mastery, interrogation |

| Resource | Range | Notes |
|----------|-------|-------|
| HP | 0–30 | Physical health |
| Honor | 0–30 | **Fragile** — false accusations cost -5, hard to recover (+1 for righteous acts) |
| Ki | 0–20 | Spiritual energy, regens 2/tick, powers special actions |

Unique verbs: `duel` (formal martial challenge), `meditate` (restore ki and composure at the cost of a turn).

## How the Systems Interact

1. **Dialogue** — Magistrate Sato briefs the ronin on the poisoning and court suspects. Completing the briefing sets the `magistrate-briefed` flag and grants an incense kit.

2. **Environment** — Two hazard types: poison-residue in the lord's chamber drains HP from lingering toxins, shadow-watch zones drain ki as unseen eyes track your movements.

3. **Cognition** — The assassin perception rule makes shadow operatives perceive the ronin as "a blade without a lord — unpredictable and dangerous."

4. **Combat** — Two enemy archetypes: Shadow Assassins are perception-heavy ambush fighters (detect before they strike), Corrupt Samurai are disciplined but emotionally unstable (provoke their composure to break).

5. **Factions** — The Takeda clan controls the castle with waning authority, while the shadow-network operates with near-perfect cohesion from the hidden passages.

## Install

```bash
npm install @ai-rpg-engine/starter-ronin
```

```typescript
import { createGame } from '@ai-rpg-engine/starter-ronin';
const engine = createGame(42);
```
