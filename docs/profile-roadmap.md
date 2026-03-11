# Profile Roadmap

This document describes the **plug-in profile** system — the engine's destination feature. Profiles don't exist yet. This is the plan.

---

## What Is a Profile?

A profile is a portable bundle that defines a playstyle. It packages:

- **Stat mapping** — which stat names map to attack, precision, resolve
- **Resource profile** — stamina/mana/ammo costs, gains, drains, and caps
- **Abilities** — the ability set available to entities using this profile
- **AI bias tags** — pack biases that tune NPC decision-making
- **Encounter hooks** — engagement config, boss phase templates, tactical modifiers

A profile is not a character sheet. It's a *mechanical template* — the rules that govern how an entity fights, spends resources, and makes decisions.

---

## Why Profiles?

Today, the engine's composition model works at the **world** level. You pick modules, define stats, wire a combat stack, and everything in that world shares the same mechanical rules. This is fine for single-playstyle games.

But some games need mixed playstyles:

- A fighter and a mystic in the same party, each with different stat mappings and ability sets
- A sci-fi colony where marines use stamina-based combat and engineers use power-cell-based abilities
- A game where players pick from 5 archetypes, each with its own resource economy

Today this requires manual wiring. The unified decision layer (`selectBestAction`) already handles mixed combat+ability scoring per entity. `submitActionAs()` already handles non-player entity actions. What's missing is the **packaging** — a schema that bundles per-entity mechanical rules into a single importable unit.

---

## What Already Works

These pieces are shipped and tested. Profiles will compose them, not replace them.

| Piece | Status | What It Does |
|-------|--------|-------------|
| `buildCombatStack()` | Shipped v2.3.0 | Wires combat modules from a config object |
| `selectBestAction()` | Shipped v2.3.0 | Unified combat + ability scoring per entity |
| `submitActionAs()` | Shipped v2.3.0 | Submit actions on behalf of any entity |
| `CombatResourceProfile` | Shipped v2.3.0 | Per-world resource costs, gains, drains, caps |
| `CombatStatMapping` | Shipped v2.3.0 | Maps generic stat roles to world-specific names |
| `PackBias` | Shipped v2.3.0 | AI behavior tuning per enemy type |
| Tag taxonomy | Shipped v2.3.0 | Canonical tag categories with validation |
| Abilities system | Shipped v2.3.0 | Costs, cooldowns, checks, typed effects |

---

## What Needs to Be Built

### Phase 1: Profile Schema

Define the `Profile` type — the shape of a profile bundle.

```typescript
type Profile = {
  id: string;
  name: string;
  statMapping: CombatStatMapping;
  resourceProfile?: CombatResourceProfile;
  abilities: AbilityDefinition[];
  packBiases?: PackBias[];
  engagement?: Partial<EngagementConfig>;
  tags?: string[];  // e.g., ['role:fighter', 'archetype:berserker']
};
```

This is a type definition + validation. No runtime changes.

### Phase 2: Profile Loader

A function that takes a profile and produces the module configuration needed by the engine.

```typescript
function applyProfile(profile: Profile, entityId: string, engine: Engine): void {
  // Registers the profile's abilities for the entity
  // Sets stat mapping context for formula evaluation
  // Applies resource profile for the entity's costs/gains
}
```

The key design question: do profiles modify world-level config or entity-level config? Current hypothesis: **entity-level**. The engine's combat formulas already read stats per-entity. Resource costs can be keyed per-entity. Abilities are already per-entity.

### Phase 3: Cross-Profile Validation

When two profiles coexist in one game, validate that:

- Stat names don't collide with conflicting semantics
- Resource IDs are namespaced or shared intentionally
- Ability IDs are unique across profiles
- Pack biases don't create contradictory scoring

This is a lint/audit step, not a runtime gate.

### Phase 4: Profile Authoring DX

- `buildProfile()` helper (analogous to `buildCombatStack()`)
- Profile templates derived from existing starters
- Handbook chapter on creating and sharing profiles

---

## What This Changes for Authors

**Today:** You build a world. Everything in the world shares one stat mapping, one resource profile, one set of combat rules.

**With profiles:** You build a world *and* define profiles. Entities in the world reference a profile. Different entities can use different mechanical rules while sharing the same zones, dialogue, and events.

The composition model's 6 layers stay the same. Profiles sit between Layer 3 (Ruleset) and Layer 4 (Content) — they're reusable mechanical templates that content references.

---

## Timeline

This is honest about uncertainty:

- **Phase 1** (profile schema): Next — it's a type definition, low risk
- **Phase 2** (loader): Depends on how entity-level config works out. May require Engine changes.
- **Phase 3** (validation): Straightforward once Phase 2 lands
- **Phase 4** (DX): Comes last — we need usage experience before building helpers

No dates. The combat system and unified decision layer took longer than expected. Profiles will probably take longer than expected too.

---

## Related

- [Composition Model](composition-model.md) — the 6 layers that profiles build on
- [Composition Guide](handbook/57-composition-guide.md) — how to build a game today (without profiles)
- [Combat Pack Guide](handbook/55-combat-pack-guide.md) — buildCombatStack reference
