# Composition Model

This document defines the reusable layers of the AI RPG Engine. It answers one question: **when you build a game, what belongs where?**

The engine is a composition toolkit. Starters are example builds. This model shows the layers you compose.

---

## The Six Layers

| Layer | What It Contains | Package | Author Touches It? |
|-------|-----------------|---------|-------------------|
| **1. Core Runtime** | Engine, WorldStore, EventBus, RNG, tick loop, action pipeline | `@ai-rpg-engine/core` | No — consume only |
| **2. Mechanical Modules** | 27 module creators, all composable | `@ai-rpg-engine/modules` | Select and configure |
| **3. Ruleset** | Stat schema, resource schema, verb set, formula mappings | Your `ruleset.ts` | Author creates |
| **4. Content** | Entities, zones, dialogue, items, abilities, statuses, progression | Your `content.ts` | Author creates |
| **5. Wiring** | Module selection, combat stack config, Engine constructor | Your `setup.ts` | Author creates |
| **6. Demo Glue** | Event listeners for scripted sequences, audio cues | Bottom of `setup.ts` | Optional, game-specific |

Layers 1-2 are the engine. Layers 3-5 are your game. Layer 6 is optional polish.

---

## Composition Entry Points

### `buildCombatStack(config)` — recommended

The primary composition helper. Takes a config object, returns a wired combat module array.

```typescript
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  resourceProfile: myResourceProfile,   // optional
  biasTags: ['undead', 'beast'],        // optional
  engagement: { backlineTags: ['ranged'], protectorTags: ['bodyguard'] }, // optional
});
// Then: modules: [...combat.modules, ...otherModules]
```

This encapsulates formula generation, engagement wiring, resource wrapping, review tracing, and module ordering. It replaces ~40 lines of manual wiring.

### `new Engine(options)` — the universal constructor

```typescript
const engine = new Engine({
  manifest: { id: 'my-game', title: 'My Game', version: '1.0.0' },
  modules: [...combat.modules, traversalCore, createDialogueCore(dialogues), ...],
  seed: 42,
  ruleset: myRuleset,  // optional
});
```

### Individual module creators

When you need fine-grained control, wire modules directly:

```typescript
createCombatCore(formulas)
createEngagementCore({ playerId, backlineTags, protectorTags })
createDialogueCore(dialogues)
createCognitionCore({ decay: { beliefDecayTicks: 50 } })
createPerceptionFilter()
createProgressionCore({ trees, rewards })
// ... 27 total
```

### `buildCombatFormulas(statMapping)` — formula generation only

Generates standard combat formulas from a stat mapping without the full stack. Useful when you want custom module wiring but standard formulas.

---

## Composition Decisions

When building a game, you make these decisions in order:

### 1. Choose your stats

Every game needs a 3-stat combat mapping: attack, precision, resolve. These drive hit chance, damage, guard absorption, disengage, brace resistance, and AI scoring.

The stat names are yours. The roles are fixed:
- **Attack** → damage, guard breakthrough
- **Precision** → hit chance, disengage, guard counter
- **Resolve** → guard absorption, brace resistance, morale

You can define additional stats beyond these three — the mapping only governs combat formulas. Social stats, exploration stats, and custom stats are separate.

### 2. Choose your combat complexity

| Level | What You Wire | Example Starter |
|-------|--------------|-----------------|
| **No combat** | Skip all combat modules | (none — but possible) |
| **Basic** | `buildCombatStack` with stat mapping only | Fantasy |
| **With resources** | Add a `CombatResourceProfile` | Pirate, Detective |
| **Full tactical** | Add engagement config, bias tags, recovery | Cyberpunk, Colony, Ronin |

### 3. Choose your social complexity

| Level | Modules | What It Adds |
|-------|---------|-------------|
| **None** | — | Pure combat/exploration |
| **Factions only** | `createFactionCognition` | Faction beliefs, trust |
| **Factions + cognition** | + `createCognitionCore` | NPC beliefs, intent, morale, memory |
| **Full social** | + NPC agency, leverage, companions | Goals, obligations, loyalty, political action |

### 4. Choose your world complexity

| Level | Modules | What It Adds |
|-------|---------|-------------|
| **Zones only** | `traversalCore` | Movement between rooms |
| **+ Districts** | + `createDistrictCore` | Spatial grouping, metrics, alerts |
| **+ Economy** | + `createDistrictEconomy` | Supply, surplus, scarcity |
| **+ Environment** | + `createEnvironmentCore` | Hazards, zone properties, decay |

### 5. Choose your encounter structure

| Approach | How It Works |
|----------|-------------|
| **Manual entities** | Define NPCs directly with stats, tags, roles |
| **Encounter library** | Use `createPatrolEncounter`, `createAmbushEncounter`, `createBossFightEncounter` |
| **Boss phases** | Use `createBossPhaseListener` for multi-phase bosses |

---

## What's Engine vs What's Example

**Engine** (layers 1-2): Everything in `@ai-rpg-engine/core` and `@ai-rpg-engine/modules`. These are stable APIs. They don't change when you change your game's theme.

**Your game** (layers 3-5): Stat names, entity definitions, zone layouts, dialogue trees, resource profiles, ability definitions. This is where genre lives.

**Demo glue** (layer 6): Event listeners that reference specific entity IDs, dialogue IDs, and zone IDs. These are tied to specific content and aren't portable without that content.

---

## Remix Rules

**You can mix freely:**
- Any stat mapping with any content (entities, zones, dialogue)
- Any resource profile with any world setting
- Any engagement config with any playstyle
- Modules from different starters (they're all the same engine modules)

**You cannot mix without adaptation:**
- Demo glue from one starter with content from another (it references specific IDs)
- Pack biases expect matching entity tags (e.g., `[undead]` bias needs entities tagged `undead`)

**The formula wrapping order matters:**
```
base formulas → withEngagement → withCombatResources → review.explain
```
`buildCombatStack` handles this automatically. If wiring manually, maintain this order.

---

## Cross-Reference

- Per-starter decomposition: [Starter Decomposition Audit](starter-decomposition-audit.md)
- Combat authoring: [Build a Combat Pack](handbook/55-combat-pack-guide.md)
- User-facing composition workflow: [Composition Guide](handbook/57-composition-guide.md)
- Module API details: [Module API Reference](handbook/appendix-c-module-api.md)
- Plug-in profiles (planned): [Profile Roadmap](profile-roadmap.md)
