# Combat Overview

Combat in the AI RPG Engine is a deterministic, event-driven system built from six interlocking pillars. Every fight is a conversation between actions, states, positioning, and AI decision-making — not a spreadsheet race to zero HP.

This chapter is the map. The detailed chapters that follow are the caves.

---

## What Combat Feels Like

A typical combat turn:

1. An entity declares an action (attack, guard, brace, disengage, reposition)
2. The engine resolves it against formulas, states, and positioning
3. Events fire — hits, misses, state changes, interceptions
4. AI NPCs observe the result and choose their next action
5. Morale shifts, resources change, the tactical landscape evolves

No round counter. No initiative order. Actions resolve immediately when declared. The simulation ticks forward; combat emerges from the event stream.

---

## The Six Pillars

Combat is built from six mechanical pillars. Every world uses all six, but worlds choose how loudly each one speaks.

### 1. Guard and Brace — The Defensive Pair

**Guard** absorbs a single hit (50–75% damage reduction based on resolve), then clears. Attackers risk getting counter-off-balanced. **Brace** doesn't absorb damage — it resists being knocked off-balance and makes repositioning harder for enemies. At chokepoints, brace becomes a wall.

Guard is reactive. Brace is proactive. Together they create a defensive vocabulary beyond "stand there and take it."

→ Details: [Combat Tactics](49-combat-tactics.md), [Combat States](50-combat-states.md)

### 2. Engagement and Positioning

Four engagement states — ENGAGED, PROTECTED, BACKLINE, ISOLATED — describe where entities stand relative to each other. Chokepoints force ENGAGED and penalize escape. Backliners get disengage bonuses. Protectors grant PROTECTED to allies, boosting interception.

Positioning is zone-local, not grid-based. Tags on zones and entities drive the system.

→ Details: [Zone Positioning](51-zone-positioning.md)

### 3. Companion Interception

When an ally is attacked, nearby companions may intercept — stepping in front of the blow. A scored formula weighs reaction speed (precision stat), composure (resolve stat), HP, morale, combat states, and role. Bodyguards intercept at ~45%, non-bodyguards at ~28%. Injury degrades reliability. FLEEING blocks interception entirely.

→ Details: [Companion Interception](54-companion-interception.md)

### 4. Precision vs Force — Three Stat Dimensions

Every combat formula reads from three mapped stats:
- **Attack** — raw damage, guard breakthrough
- **Precision** — hit chance, dodge, guard counter, reposition success
- **Resolve** — guard absorption, disengage, brace resistance, morale

Each world maps these to genre-specific stat names (grit/draw-speed/lore, might/agility/showmanship, etc). The mapping is the world's combat fingerprint.

→ Details: [Precision vs Force](53-precision-vs-force.md)

### 5. Morale and Defeat Flow

Damage erodes morale. Low morale triggers FLEEING. A defeated frontliner can collapse the line, isolating backliners. Kills ripple through faction cognition, rumor propagation, and district safety. Combat has social consequences.

→ Details: [Defeat Flow](52-defeat-flow.md)

### 6. AI Tactics and Pack Biases

AI scores 8 intents (attack, guard, brace, disengage, reposition, pressure, protect, finish) across 12 dimensions. Pack biases shift these scores per enemy archetype — assassins finish wounded targets, samurai guard and brace, feral beasts attack relentlessly.

→ Details: [Combat Tactics](49-combat-tactics.md)

---

## The Five Actions

| Action | What It Does | Soft Counter |
|--------|-------------|--------------|
| **Attack** | Deal damage based on attack stat. May break through guard. | Countered by guard (absorbs + off-balance risk) |
| **Guard** | Absorb next hit at 50–75% reduction. Clears after one hit. | Countered by reposition (outflank removes guard) |
| **Brace** | Resist off-balance. Penalize enemy repositioning. Stronger at chokepoints. | Countered by attack (bracing doesn't reduce damage) |
| **Disengage** | Attempt to leave combat. Success based on precision + resolve. | Penalized by ENGAGED state and chokepoints |
| **Reposition** | Attempt to outmaneuver. Can outflank guarded targets. | Penalized by brace, chokepoints, ENGAGED state |

The soft counter triangle: **attack beats brace, brace beats reposition, reposition beats guard**. Guard beats attack (absorbs + counter). No action is universally dominant.

---

## States at a Glance

### Combat States (from combat-core)

| State | How Applied | Effect |
|-------|------------|--------|
| **GUARDED** | Guard action | Absorbs next hit (50–75%), clears after |
| **OFF_BALANCE** | Guard counter, failed reposition | -20 reposition, -10 interception |
| **EXPOSED** | Outflank, frontline collapse | +15 AI attack preference |
| **FLEEING** | Low morale | Blocks interception, +15 AI finish preference |

### Engagement States (from engagement-core)

| State | How Applied | Effect |
|-------|------------|--------|
| **ENGAGED** | Combat contact, chokepoints | -15 disengage, -10 reposition |
| **PROTECTED** | Allied protector in zone | +15 interception from allies |
| **BACKLINE** | Entity has backline tag, no contact | +15 disengage, +10 reposition |
| **ISOLATED** | Frontline collapsed, no allies | -10 disengage |

---

## Simple Worlds vs Advanced Worlds

Not every world needs to exercise every pillar at full volume.

**Fantasy** (simple): Uses default stat mapping, no resource profile, no backline/protector tags, no chokepoints. Combat works — guard, brace, attack, disengage, reposition all function. The pillars are present but quiet.

**Weird West** (advanced): Custom stat mapping, dual resource profile (dust + resolve), two AI bias tags, environmental hazards that feed resources, defeat fallout listener. The pillars are loud.

Both are valid. The engine doesn't penalize simplicity. A simple world just has less tactical surface area — which may be exactly right for its genre.

---

## Resource Hooks and Genre Identity

Each world can define a `CombatResourceProfile` that wires genre-specific resources into combat:

- **Gains**: Earn resources from combat events (e.g., take-damage → dust)
- **Spends**: Spend resources to enhance actions (e.g., spend resolve for +1 damage)
- **Drains**: Lose resources from setbacks (e.g., take-damage → lose resolve)
- **AI Modifiers**: Shift AI behavior based on resource levels (e.g., high dust → prefer disengage)

Resources are the primary way worlds express combat personality. A vampire world where bloodlust builds from kills plays very differently from a detective world where composure drains under pressure.

---

## Authoring Quick Reference

The fastest path to combat in a new world:

```typescript
import { buildCombatStack } from '@ai-rpg-engine/modules';

const combat = buildCombatStack({
  statMapping: { attack: 'grit', precision: 'draw-speed', resolve: 'lore' },
  playerId: 'drifter',
  resourceProfile: myResourceProfile,   // optional
  biasTags: ['undead', 'spirit'],       // optional
  engagement: { protectorTags: ['bodyguard'] },  // optional
});

// In Engine constructor:
modules: [traversalCore, statusCore, ...combat.modules, /* other modules */]
```

For full authoring guidance: [Build a Combat Pack Profile](55-combat-pack-guide.md)

For tuning guidance: [Tuning Philosophy](56-tuning-philosophy.md)

---

## Chapter Map

| Chapter | Covers |
|---------|--------|
| [Combat System](47-combat-system.md) | Roles, encounters, bosses, danger rating, recovery, defeat fallout |
| [Abilities System](48-abilities-system.md) | Ability definitions, effects, status semantics, builder helpers |
| [Combat Tactics](49-combat-tactics.md) | The five actions, soft counters, brace/reposition, round flags |
| [Combat States](50-combat-states.md) | GUARDED, OFF_BALANCE, EXPOSED, FLEEING — the four-state doctrine |
| [Zone Positioning](51-zone-positioning.md) | ENGAGED, PROTECTED, BACKLINE, ISOLATED, chokepoints |
| [Defeat Flow](52-defeat-flow.md) | Morale cascade, FLEEING, frontline collapse, defeat narration |
| [Precision vs Force](53-precision-vs-force.md) | Three stat dimensions, per-mechanic influence, breakthrough |
| [Companion Interception](54-companion-interception.md) | Scored formula, role bonuses, PROTECTED stacking, AI cover awareness |
| [Build a Combat Pack](55-combat-pack-guide.md) | Author guide for buildCombatStack, stat mapping, resource profiles |
| [Tuning Philosophy](56-tuning-philosophy.md) | What to tune, what to leave alone |
