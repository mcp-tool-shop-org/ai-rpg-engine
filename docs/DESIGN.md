# AI RPG Engine Design Overview

AI RPG Engine is a simulation-first narrative engine for terminal RPGs. It maintains objective world truth, routes events through presentation channels that can lie, and supports pluggable genres through modular rulesets.

## Core Architecture

```
┌─────────────────────────────────────────────┐
│                   Engine                     │
│  ┌──────────┐ ┌────────────┐ ┌───────────┐ │
│  │WorldStore│ │ActionDisp. │ │ModuleMgr  │ │
│  │  state   │ │  verbs     │ │  modules  │ │
│  │  rng     │ │  validators│ │  formulas │ │
│  │  events  │ │            │ │  rules    │ │
│  └──────────┘ └────────────┘ └───────────┘ │
│         ┌──────────────┐                    │
│         │Presentation  │                    │
│         │  Channels    │                    │
│         └──────────────┘                    │
└─────────────────────────────────────────────┘
```

**WorldStore** holds the canonical simulation state: entities, zones, quests, factions, globals, event log, pending effects, and seeded RNG.

**ActionDispatcher** is the single front door into the simulation. Every state change flows through `dispatch(action)`: declare → validate → resolve → record → emit.

**ModuleManager** registers modules and wires their verbs, rules, events, persistence namespaces, UI panels, and formulas into the engine.

**PresentationChannels** routes resolved events through typed filters before the UI sees them. This is how the engine lies.

## Action Pipeline

```
Player/AI/Script
      │
      ▼
  ActionIntent { verb, actorId, targetIds, parameters }
      │
      ▼
  action.declared (event emitted)
      │
      ▼
  Validators (global + module rule checks)
      │ fail → action.rejected
      ▼
  VerbHandler (registered by module)
      │
      ▼
  ResolvedEvent[] (recorded to world log)
      │
      ▼
  action.resolved (event emitted)
      │
      ▼
  Tick advances
```

Every mutation goes through this pipeline. No backdoors.

## Event System

Events follow `domain.object.verb` naming:
- `combat.contact.hit`, `combat.entity.defeated`
- `world.zone.entered`, `world.zone.inspected`
- `resource.changed`, `status.applied`
- `dialogue.started`, `dialogue.ended`
- `action.declared`, `action.resolved`, `action.rejected`

The EventBus supports specific listeners, domain wildcards (`combat.*`), and catch-all (`*`).

## Module System

Modules plug mechanics into the engine without touching core:

```typescript
const myModule: EngineModule = {
  id: 'my-module',
  version: '0.1.0',
  dependsOn: ['other-module'],

  register(ctx) {
    ctx.actions.registerVerb('my-verb', handler);
    ctx.rules.registerCheck(myCheck);
    ctx.events.on('combat.*', myListener);
    ctx.persistence.registerNamespace('my-module', defaults);
    ctx.formulas.register('my-formula', myFn);
  },

  init(ctx) { /* called after all modules registered */ },
  teardown() { /* called on shutdown */ },
};
```

**Registries available:**
- `actions` — register verb handlers
- `rules` — register checks (pre-action) and effects (post-event)
- `events` — subscribe to event types
- `content` — extend schemas
- `persistence` — namespaced state that survives save/load
- `ui` — register panel renderers
- `debug` — register inspectors
- `formulas` — register/query named formula implementations

**Built-in modules:** traversal-core, status-core, combat-core, inventory-core, dialogue-core, narrative-authority, cognition-core, perception-filter, progression-core, environment-core, faction-cognition, rumor-propagation, district-core, belief-provenance, observer-presentation, simulation-inspector.

## Ruleset Model

A `RulesetDefinition` declares what a genre provides:

```typescript
{
  id: 'fantasy-minimal',
  name: 'Fantasy Minimal',
  version: '0.1.0',
  stats: [{ id: 'vigor', name: 'Vigor', default: 5 }, ...],
  resources: [{ id: 'hp', name: 'HP', min: 0, default: 20 }, ...],
  verbs: [{ id: 'attack', name: 'Attack', tags: ['combat'] }, ...],
  formulas: [{ id: 'hit-chance', name: 'Hit Chance', inputs: [...], output: 'number' }],
  defaultModules: ['traversal-core', 'combat-core', ...],
  progressionModels: [],
}
```

The engine is genre-ignorant. It doesn't know what "vigor" means. The ruleset + modules + content define the genre. Proven by running both fantasy and cyberpunk on the same runtime.

## Truth vs Presentation

This is AI RPG Engine's defining feature.

```
Objective Truth (WorldStore)
       │
       ▼
  ResolvedEvent
       │
       ├──→ [objective channel] → UI shows truth
       │
       └──→ [narrator channel] ──→ filters ──→ UI shows distortion
                                      │
                                      ├─ conceal (suppress event)
                                      ├─ distort (modify payload)
                                      └─ lie (replace entirely)
```

The same event can be presented differently on different channels. The narrative-authority module tracks contradictions between objective and presented events. Players can discover hidden truths later.

**Contradiction lifecycle:**
1. Event occurs (objective truth recorded)
2. Narrator filter modifies/conceals it
3. Contradiction recorded (eventId, objective vs presented)
4. Player finds evidence → `revealTruth(eventId)`
5. Contradiction marked discovered

## Content Pipeline

Content is validated at three levels:

1. **Schema validation** — each type (EntityBlueprint, ZoneDefinition, DialogueDefinition, etc.) checked for required fields, correct types, enum values
2. **Reference validation** — cross-content integrity (zone neighbors exist, dialogue speakers match entities, exit targets point to real zones, neighbor symmetry)
3. **Content loader** — combines both, produces summary or error report

```typescript
const result = loadContent({
  entities: [...],
  zones: [...],
  dialogues: [...],
  quests: [...],
});
// result.ok, result.errors, result.summary
```

## Simulation Pipeline

The engine's simulation systems form a causal chain. Understanding this chain answers "why did this NPC do that?" without reading source code.

```
Environment → Perception → Cognition → Intent → Action → Events
     ↑                                                      │
     └──────────────────────────────────────────────────────┘
```

Each layer feeds the next. Environment sets the stage (noise, light, hazards). Perception filters what entities detect. Cognition forms beliefs from perceptions. Intent selects actions from beliefs. Actions produce events. Events modify the environment. The loop closes.

### Environment Layer (environment-core)

Zones have dynamic properties that change during play:

- **Noise** — affects perception rolls and rumor distortion. Combat raises noise; it decays over time.
- **Light** — affects sight-based perception. Low light reduces detection clarity.
- **Stability** — abstract environmental coherence. Low stability accelerates knowledge decay and increases rumor distortion.
- **Hazards** — triggered effects that fire when conditions are met.

Environment ticks every turn. Noise decays toward baseline. Hazard timers count down. Zone properties propagate to all perception and cognition calculations in that zone.

### Perception Layer (perception-filter)

Perception determines what an entity actually detects from the events around it.

```
Event occurs in zone
       │
       ▼
  For each entity in zone:
       │
       ├─ Calculate clarity (perception stat + sense bonuses − noise penalty)
       │
       ├─ clarity ≥ threshold → perception.detected (belief formed)
       │
       └─ clarity < threshold → perception.missed (entity unaware)
```

Key mechanics:
- **Sense types** — sight, hearing, network (cyberpunk), etc. Each maps to a stat.
- **Clarity** — continuous value (0–1) representing detection quality. Higher clarity means more accurate beliefs.
- **Zone noise** — reduces clarity. A loud fight in a noisy alley is harder to perceive than combat in a silent crypt.

The perception stat is configurable per genre. Fantasy uses `instinct`, cyberpunk uses `reflex`. Sense stats are also configurable (`network: 'netrunning'`).

### Cognition Layer (cognition-core)

Every AI entity maintains a belief graph — a set of typed beliefs about the world.

```
Belief {
  subject: 'player'      // who/what
  key: 'hostile'          // what about them
  value: true             // what they believe
  confidence: 0.8         // how sure (0–1)
  source: 'observed'      // how they know
  tick: 42                // when last confirmed
}
```

Beliefs drive intent selection. An entity that believes the player is hostile and present will choose aggressive actions. An entity that believes the player fled will search or return to patrol.

**Knowledge decay** erodes beliefs over time:

```
confidence -= baseRate × elapsed × (1 + instability × instabilityFactor)
```

Where `elapsed` is ticks since last confirmation, and `instability` comes from the zone's environment (noise + low stability). Beliefs that drop below `pruneThreshold` are removed entirely.

**Reinforcement** resets a belief's tick counter, preventing decay. Seeing the player again reinforces the belief they're present. This creates natural "last known position" behavior without explicit tracking code.

### Faction Cognition (faction-cognition)

Factions maintain shared belief graphs separate from individual entities.

```
Entity belief → rumor → faction belief
                          │
                          ├─ Cohesion scales confidence
                          ├─ Corroboration boosts confidence (+0.05 per source)
                          └─ Hostile beliefs raise faction alertLevel
```

A faction with high cohesion (tight coordination, like cyberpunk ICE at 0.95) retains rumor confidence well. A faction with low cohesion (loose undead at 0.7) loses information fidelity.

Alert level rises when hostile rumors arrive and decays by 2 per faction-tick. This creates natural escalation and cooldown without scripted timers.

### Rumor Propagation (rumor-propagation)

Rumors are the transport layer for information between entities and factions.

```
Combat event in zone
       │
       ▼
  AI entities in zone with faction membership
       │
       ▼
  Extract beliefs (hostile, alive, present)
       │
       ▼
  Schedule PendingEffect (delay = propagationDelay ticks)
       │
       ▼
  [time passes]
       │
       ▼
  rumor.belief.propagated event fires
       │
       ▼
  Faction-cognition handler updates shared beliefs
```

**Distortion** degrades information quality:

```
distortion = baseDistortion + (instability × instabilityDistortionFactor)
```

Environmental noise and low stability increase distortion. A rumor from a chaotic firefight arrives less accurate than one from a quiet observation. Distortion reduces the confidence of the resulting faction belief.

**Deduplication** prevents rumor spam. The same entity can't propagate the same belief about the same subject within `delay × 2` ticks.

**Confidence threshold** filters out weak beliefs. An entity with only 0.1 confidence about something won't bother reporting it.

### Intent and Action

The cognition layer's intent selector evaluates beliefs against profiles:

```
Intent profiles define conditions:
  "aggressive" → requires: target believed hostile + in same zone
  "defensive"  → requires: self HP < 50% + nearby allies
  "patrol"     → default when no threats believed
```

The selected intent maps to a verb (attack, defend, move) which enters the action pipeline. The pipeline validates, resolves, records events, and the cycle continues.

### Worked Example: Why Did the Ghoul Attack?

1. Player enters the crypt (`world.zone.entered`)
2. Environment: noise is low, stability is high
3. Ghoul's perception check: instinct 6, sight sense, low noise → high clarity (0.9)
4. `perception.detected` → ghoul forms belief: `{subject: 'player', key: 'present', value: true, confidence: 0.9}`
5. Ghoul already has belief from prior combat: `{subject: 'player', key: 'hostile', value: true, confidence: 0.7}`
6. Intent selector: hostile target + present → "aggressive" profile matches
7. Ghoul dispatches `attack` verb targeting player
8. Combat resolves → `combat.contact.hit` event
9. Rumor system: ghoul is in faction `crypt-undead`, schedules rumor with 2-tick delay
10. Two ticks later: faction `crypt-undead` believes player is hostile → other undead in connected zones become alert

Every step is traceable. Every decision has a cause. No magic flags, no scripted triggers.

### District Layer (district-core)

Districts group zones into spatial memory surfaces — persistent aggregate metrics that evolve from zone-level events.

```
Zone events (combat, entry, rumors)
       │
       ▼
  District aggregation:
       │
       ├─ combat.*          → alertPressure ↑
       ├─ world.zone.entered → intruderLikelihood ↑ (non-faction entities)
       └─ rumor.propagated   → rumorDensity ↑
       │
       ▼
  district-tick verb:
       │
       ├─ Decay all metrics toward baseline
       ├─ Update surveillance from faction member presence
       ├─ Sync stability from constituent zone averages
       └─ Boost faction alertLevel when intruderLikelihood > 20
```

Key mechanics:
- **Alert pressure** — cumulative combat intensity across a district's zones. Decays by 1 per tick.
- **Intruder likelihood** — rises when non-faction entities enter faction-controlled districts. Drives faction AI reactions.
- **Surveillance** — faction member count × 15 per member present. Represents active monitoring.
- **Stability** — average stability from constituent zones. Feeds into cognition decay and rumor distortion.
- **Threat level** — weighted composite: alertPressure × 0.4 + intruderLikelihood × 0.35 + rumorDensity × 0.25.

All metrics clamp to 0–100. A district is "on alert" when alertPressure > 30.

### Belief Provenance (belief-provenance)

A pure query module that answers "why does X believe Y?" by correlating existing logs from perception, cognition, rumor, and faction modules. No new state — reads what's already there.

```
traceEntityBelief(world, entityId, subject, key)
       │
       ▼
  1. Find source events involving subject
  2. Check entity's perception log for each event
  3. Find matching belief in entity's cognition
  4. Check for rumor propagation from this entity
       │
       ▼
  BeliefTrace { chain: TraceStep[], currentValue, currentConfidence }
```

Trace step types: `source-event`, `perceived`, `missed`, `belief-formed`, `rumor-scheduled`, `rumor-delivered`, `faction-belief-updated`, `decayed`, `reinforced`, `pruned`.

`traceFactionBelief` extends this by following rumors from contributing entities through to faction belief formation. `traceSubject` finds all beliefs about a subject across all entities and factions.

`formatBeliefTrace` produces human-readable forensic narratives with step icons (EVENT, SEEN, MISSED, BELIEF, RUMOR>, RUMOR<, FACTION).

### Observer Presentation (observer-presentation)

The same event described differently depending on who observes it. Connects perception clarity, faction allegiance, and cognitive bias to presentation.

```
ResolvedEvent
       │
       ▼
  For each observer:
       │
       ├─ Build ObserverContext (clarity, faction, hostility, stability, suspicion)
       │
       ├─ Apply matching PresentationRules (sorted by priority)
       │   ├─ low-clarity-identity (10): clarity < 0.4 → "a shadowed figure"
       │   ├─ medium-clarity-partial (5): clarity 0.4-0.7 → "someone in dim light"
       │   ├─ hostile-faction-bias (3): hostile actor → "an enemy combatant"
       │   ├─ high-suspicion-paranoia (2): suspicion > 60 → "a suspicious figure"
       │   └─ unstable-environment-glitch (1): stability < 2 → environmental distortion
       │
       └─ Record DivergenceRecord if rules applied
       │
       ▼
  ObserverPresentedEvent { _observerId, _clarity, _appliedRules }
```

Custom rules are authorable per genre:
- Fantasy: undead entities see all living as "warm blood encroaching upon the sacred dead"
- Cyberpunk: ICE agents see all non-ICE as "unauthorized network entity detected"

`presentForAllObservers` generates one version per AI entity. `getDivergences` queries the divergence log for debugging or narrative replay.

## Observability

The simulation-inspector module provides debugging tools for every layer.

**Entity inspection** shows an entity's complete cognitive state:
- Current beliefs with confidence and source
- Perception log (what they detected and missed)
- Faction membership
- Stats and resources

**Faction inspection** shows collective state:
- Shared beliefs with confidence and contributing sources
- Alert level and cohesion
- Member list
- Recent rumors received

**Zone inspection** shows environmental state:
- Dynamic properties (noise, light, stability)
- Active hazards
- Entities present

**District inspection** shows spatial memory state:
- Alert pressure, intruder likelihood, surveillance, stability
- Threat level (composite score)
- Controlling faction and zone membership
- Event count

**Simulation snapshot** captures the entire world state for comparison:
- All entity inspections
- All faction inspections
- All zone inspections
- All district inspections
- Current tick and event count

**Belief provenance traces** answer "why does X think Y?" by reconstructing the causal chain from source events through perception, cognition, and rumor propagation.

**Presentation divergences** show how the same event was described differently to different observers, including which rules fired and at what clarity levels.

The inspector registers debug inspectors accessible through the engine's debug registry, making these available to CLI tools and future UI panels.

## Save/Load and Replay

Full engine state serializes to JSON: world state + RNG state + action log.

Replay works by creating a fresh engine with the same seed and re-dispatching the action log. Deterministic RNG ensures identical results.

## Package Structure

```
packages/
  core/             — Engine, WorldStore, EventBus, ActionDispatcher, types
  content-schema/   — Author-facing types, validators, reference checker, loader
  modules/          — Built-in mechanical modules
  terminal-ui/      — Terminal renderer (scene, events, actions, dialogue)
  cli/              — ai-rpg-engine run|replay|inspect-save
  starter-fantasy/  — The Chapel Threshold (fantasy demo)
  starter-cyberpunk/— Neon Lockbox (cyberpunk demo)
```

## Creating a New Game

1. Define a `RulesetDefinition` (stats, resources, verbs, formulas)
2. Write content (entities, zones, dialogues) using content-schema types
3. Select modules or write custom ones
4. Wire everything in a `createGame()` function
5. Run with `ai-rpg-engine run` or embed the Engine directly

No core edits required. The engine doesn't know your genre exists until you tell it.
