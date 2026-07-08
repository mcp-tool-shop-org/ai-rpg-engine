---
title: "Chapter 59 — Plug-in Profiles"
description: "Per-entity rule resolution — a might fighter and a will mystic resolving combat in one fight, each through its own stat mapping"
sidebar:
  order: 59
---

# Chapter 59 — Plug-in Profiles

> Part X — Composition

A world's combat stack defines **one** stat mapping: `attack → might`, `precision → agility`, `resolve → will`. Every entity in that world resolves combat through it. That is fine for a single-playstyle game and it is what every pre-v2.5 starter does.

Plug-in Profiles (shipped v2.5) lift that constraint. A **profile** is a portable bundle of mechanical rules — a stat mapping, an optional resource economy, an ability pack, AI biases, tags — that a single entity opts into. A `might` fighter and a `will` mystic can then stand in the same fight, off the same formula set, each reading damage from *its own* stat. One formula set, per-entity data.

This is **CR-1: per-entity rule resolution**. The runnable proof is [`docs/examples/mixed-party.ts`](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/docs/examples/mixed-party.ts) and [`docs/examples/shared-profiles.ts`](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/docs/examples/shared-profiles.ts), both type-checked and behaviour-tested in CI.

> **Not the same as [Chapter 31 — Character Profiles](./31-character-profiles.md).** A `CharacterProfile` is a *saved character sheet* (progression, injuries, loadout). A `RuleProfile` is a *combat rule template* — how an entity fights, not who it is. Different package, different purpose.

---

## Two layers: `Profile` and `RuleProfile`

The system has an authoring layer and a runtime layer. They are different types in different packages, and the split is deliberate.

| | `Profile` | `RuleProfile` |
|---|---|---|
| **Package** | `@ai-rpg-engine/modules` | `@ai-rpg-engine/core` |
| **Role** | Authoring bundle — the full archetype | Runtime slice the engine resolves through |
| **Holds** | `statMapping`, `resourceProfile?`, `abilities`, `packBiases?`, `engagement?`, `tags?` | `statMapping` only (`formulaOverrides` reserved) |
| **Validated by** | `buildProfile`, `validateProfileSet` | — (it is plain data) |
| **Lives on** | your authoring code / a `*.profile.json` file | `world.ruleProfiles[id]` |

A `Profile`'s `statMapping` **is** the `RuleProfile`'s `statMapping` — authoring feeds runtime directly. `applyProfile` (below) copies the mapping across; you rarely construct a `RuleProfile` by hand.

Why two? `core` cannot depend on `modules` (that would be a dependency cycle), so the runtime shape is redeclared structurally in `core`. The two are byte-identical and freely assignable under TypeScript's structural typing.

---

## The runtime shape

Three additive fields carry the feature. All are **optional** — a world that never sets them behaves exactly as it did before v2.5, byte-for-byte.

```typescript
// @ai-rpg-engine/core
type RuleProfile = {
  statMapping: { attack: string; precision: string; resolve: string };
  // formulaOverrides?: RESERVED — combat formulas are closures and cannot
  // round-trip through serialized data, so v1 ships statMapping only.
};

type WorldState = {
  // ...existing fields...
  ruleProfiles?: Record<string, RuleProfile>;   // registry, keyed by profile id
};

type EntityState = {
  // ...existing fields...
  ruleProfileId?: string;   // id into world.ruleProfiles
};
```

An entity with a `ruleProfileId` resolves combat through the matching `RuleProfile`. An entity without one resolves through the world/fallback mapping, unchanged. That is the entire contract.

### The resolution chain

Combat reads every stat through `resolveEntityMapping(entity, world, fallback)`. It resolves in this order:

```
entity's RuleProfile  →  world mapping (the buildCombatStack statMapping)  →  DEFAULT
```

Because every combat call site already passes the *specific* entity for each read — the attacker for the attacker's stats, the target for the target's — attacker reads use the attacker's mapping and target reads use the target's, with no call-site change. That source-vs-target split is what lets two playstyles collide correctly in one exchange.

The fallback is always the world mapping (never a bare `DEFAULT_STAT_MAPPING`), so a custom-mapping starter such as Weird West (`attack → grit`) keeps working for its profileless entities.

---

## Authoring a profile: `buildProfile`

A `Profile` is an à-la-carte bundle. Only `id`, `name`, `statMapping`, and `abilities` are required (`abilities` may be `[]`):

```typescript
import { buildProfile } from '@ai-rpg-engine/modules';
import type { Profile } from '@ai-rpg-engine/modules';

const { profile, warnings } = buildProfile({
  id: 'hexweaver',
  name: 'Hexweaver',
  // damage from will, accuracy from focus, defense from grit
  statMapping: { attack: 'will', precision: 'focus', resolve: 'grit' },
  abilities: [{
    id: 'soul-lash', name: 'Soul Lash', verb: 'use-ability',
    tags: ['combat', 'damage'],
    target: { type: 'single' },
    costs: [{ resourceId: 'stamina', amount: 2 }],
    cooldown: 1,
    effects: [{ type: 'damage', params: { amount: 5 } }],
  }],
  // optional: resourceProfile, packBiases, engagement, tags
});
```

`buildProfile` **warns and degrades** — it never throws on a content problem (mirroring `buildCombatStack`). It validates the ability pack against a ruleset *derived from the profile's own stat mapping and resource economy*, so a reference to a stat the archetype does not have, or a cost against an undeclared resource, surfaces as a `warnings` entry instead of vanishing silently. An empty `warnings` array means the bundle is clean. The caller decides whether to ship a profile that carries warnings.

Fields the bundle can carry:

| Field | Purpose |
|-------|---------|
| `statMapping` *(required)* | generic combat roles → this archetype's stat names |
| `abilities` *(required)* | the archetype's ability pack (`[]` for none yet) |
| `resourceProfile` | combat resource economy (momentum / focus / …): gains, spends, drains, caps |
| `packBiases` | AI personality biases keyed by tag |
| `engagement` | positioning overrides (backline / protector / chokepoint tags) |
| `tags` | entity tags (`role:*`, pack-bias, engagement, custom) |

---

## Applying a profile: `applyProfile`

`buildProfile` packages a profile; `applyProfile` **attaches** it to a running entity. It takes a `WorldState` (not an `Engine`), so it is unit-testable and aligns with the serialize surface:

```typescript
import { applyProfile } from '@ai-rpg-engine/modules';

applyProfile(engine.store.state, 'sera', hexweaverProfile);
```

It does three things:

1. **Registers the rule profile.** Copies the profile's `statMapping` into `world.ruleProfiles[profile.id]` and points the entity at it (`entity.ruleProfileId = profile.id`). After this, `resolveEntityMapping` reads *this* entity's own `attack`/`precision`/`resolve` stat names.
2. **Seeds resource pools.** Every resource id the profile's economy references is initialized to `0` on the entity if absent — so `combat-resources`' `hasResource()` gate passes and gains/drains engage. Existing values are never clobbered.
3. **Registers abilities.** The profile's ability pack is registered so the `use-ability` verb can *resolve* (not merely score) the abilities the AI chooses. A no-op for an empty pack.

`applyProfile` is **deterministic and idempotent** — applying the same profile twice yields byte-identical state. It throws a structured error only if the entity is absent (assigning a profile to a nonexistent entity is a caller bug, not a warn-and-degrade case).

Everything it writes is plain data, so it rides `WorldStore.serialize()` with the rest of world state and survives save/load unchanged (see the byte-identical-replay assertion in [`examples.test.ts`](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/docs/examples/examples.test.ts)).

### Doing it by hand

`applyProfile` is convenience wiring. The registry is plain data, so you can also install profiles directly — the whole thing is one assignment:

```typescript
engine.store.state.ruleProfiles = {
  fighter: { statMapping: { attack: 'might', precision: 'agility', resolve: 'grit' } },
  mystic:  { statMapping: { attack: 'will',  precision: 'focus',   resolve: 'grit' } },
};
// then set entity.ruleProfileId = 'fighter' / 'mystic'
```

---

## Per-entity AI: `selectActionForProfile`

For AI *decision-making* (which action an entity picks), `selectActionForProfile(entityId, profile, world, opts?)` routes a profile's stat mapping, pack biases, resource profile, and ability pack into the unified combat + ability advisor, so that entity's decision reflects that archetype's config:

```typescript
import { selectActionForProfile } from '@ai-rpg-engine/modules';

const decision = selectActionForProfile('sera', hexweaverProfile, engine.world);
```

It drives *decision-making*, not *resolution* — the chosen action still resolves through combat, where `resolveEntityMapping` applies the per-entity mapping. It is pure advisory (no clock, no RNG), so identical `(entity, profile, world)` inputs yield byte-identical decisions.

---

## Validating a set: `validateProfileSet`

`buildProfile` checks one profile in isolation. Some mistakes only exist *between* profiles that share a world — and `validateProfileSet(profiles)` is the cross-profile linter that catches them.

```typescript
import { validateProfileSet } from '@ai-rpg-engine/modules';

const result = validateProfileSet([fighter, mystic]);
// { ok: boolean, errors: ValidationError[], advisories: ValidationError[] }
```

**Errors** break a shared world — treat them as blocking (the `profile` CLI exits `1` on any):

- **Duplicate profile id** — an id keys `world.ruleProfiles`, so two profiles sharing an id means one silently *overwrites* the other when applied (and the duplicate can mask a real ability/stat collision between them). This is the keystone check.
- **Duplicate ability id across two profiles** — an ability id must resolve to exactly one definition.
- **Resource-id collision with conflicting caps** — the same resource declared with two different maximums.

**Advisories** are likely-but-legal, and never block:

- **Stat-name semantic drift** — one profile maps `attack → grit`, another maps `resolve → grit`; the name means two different combat dimensions.
- **Contradictory pack biases** — the same tag pushed in opposite directions for the same intent.
- **Stat/resource namespace collision** — a name used as a combat stat by one profile and a resource id by another.
- **Engagement positioning conflict** — a tag flagged backline by one profile and protector by another.

Every scan sorts by a stable key, so the report is byte-identical across runs.

---

## The 10 starter templates

Each of the 10 shipped starters already wires combat with a `buildCombatStack({ statMapping, biasTags })` config — a playstyle in disguise. `starterProfiles` (a `Record<string, Profile>`) and `starterProfileList` (the array form) extract those into named, importable `Profile` bundles you can spread and tweak, rather than starting from a blank mapping.

```typescript
import { starterProfiles, roninProfile } from '@ai-rpg-engine/modules';

const myRonin = {
  ...roninProfile,
  id: 'wandering-blade',
  abilities: [/* your ability pack */],
};
```

| Profile | `attack` | `precision` | `resolve` |
|---------|----------|-------------|-----------|
| `fantasy` | vigor | instinct | will |
| `cyberpunk` | chrome | reflex | netrunning |
| `detective` | grit | perception | eloquence |
| `pirate` | brawn | cunning | sea-legs |
| `zombie` | fitness | wits | nerve |
| `weird-west` | grit | draw-speed | lore |
| `colony` | engineering | awareness | command |
| `vampire` | vitality | cunning | presence |
| `gladiator` | might | agility | showmanship |
| `ronin` | discipline | perception | composure |

A template captures the game-agnostic **combat identity** — the stat mapping and the resolved AI pack biases. It deliberately leaves `abilities` **empty** and omits `resourceProfile`: those reference ids (`crowd-favor`, `chrome-heat`, `mana`, …) that only exist inside a specific starter's ruleset, and `@ai-rpg-engine/modules` must not depend on the starter packages. Layer your own ability pack and resource profile on top; the `starter-*` packages show fully wired examples.

`validateProfileSet(starterProfileList)` reports no errors — the set has unique ids, no shared ability ids, and no cross-role stat-name drift.

---

## The `profile` CLI

The CLI validates and scaffolds profile files. Both subcommands are deterministic (no clock, RNG, or network) and emit the engine's structured `[CODE] message` + `Hint:` error shape.

```bash
# Scaffold a minimal, valid stub — passes `profile validate` out of the box
ai-rpg-engine profile scaffold storm-mystic
# → writes storm-mystic.profile.json

# Validate a profile or a whole set
ai-rpg-engine profile validate storm-mystic.profile.json
```

**`profile validate <file.json>`** accepts three shapes, all normalized to a profile list: a single profile object, an array of profiles, or `{ "profiles": [ … ] }`. It runs the real library validators:

- `buildProfile` per-profile **build warnings** — printed, but never affect the exit code.
- `validateProfileSet` cross-profile **errors** — block, **exit code 1**.
- `validateProfileSet` **advisories** — printed separately, never block.

So the exit code is `0` when the set has no cross-profile errors, `1` otherwise. A clean run still surfaces any warnings/advisories as non-blocking notes.

**`profile scaffold <name> [--force] [--out=<file>]`** writes `<name>.profile.json` (override the path with `--out`). The `<name>` must be lowercase alphanumeric segments separated by single hyphens (e.g. `storm-mystic`) — the same rule `create-starter` and `scaffold` enforce. It refuses to overwrite an existing file without `--force`. The stub is the minimal shape that passes `profile validate` with zero errors *and* zero warnings.

See [Appendix D — CLI Reference](./appendix-d-cli-reference.md) for the full command surface.

---

## Worked example: a mixed party

From [`docs/examples/mixed-party.ts`](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/docs/examples/mixed-party.ts) — a brute fighter and a cunning mystic in one fight, plus a wolf that never heard of profiles.

```typescript
// The world mapping — the fallback for any entity without a ruleProfileId.
const combat = buildCombatStack({
  statMapping: { attack: 'vigor', precision: 'instinct', resolve: 'will' },
  playerId: 'fighter',
});

// Two playstyles, as data.
engine.store.state.ruleProfiles = {
  fighter: { statMapping: { attack: 'might', precision: 'agility', resolve: 'grit' } },
  mystic:  { statMapping: { attack: 'will',  precision: 'focus',   resolve: 'grit' } },
};

// The fighter reads `might` (9); the mystic reads `will` (7); the wolf,
// with no ruleProfileId, reads the world mapping's `vigor` (5).
const fighter = { id: 'fighter', ruleProfileId: 'fighter', stats: { might: 9, agility: 4, grit: 6 }, /* … */ };
const mystic  = { id: 'mystic',  ruleProfileId: 'mystic',  stats: { will: 7, focus: 6, grit: 3 },   /* … */ };
const wolf    = { id: 'wolf',    /* no ruleProfileId */    stats: { vigor: 5, instinct: 6, will: 3 }, /* … */ };
```

When each strikes the wolf, the damage derives from a **different stat** — same formula set:

```typescript
engine.submitActionAs('fighter', 'attack', { targetIds: ['wolf'] }); // damage 9 (might)
engine.submitActionAs('mystic',  'attack', { targetIds: ['wolf'] }); // damage 7 (will)
```

The load-bearing detail: the fighter has no `vigor` stat. On a pre-CR-1 engine — one world mapping (`attack → vigor`) for every combatant — both party attacks would collapse to the formula fallback of `3`. The `9` and `7` are only possible because each entity resolves through its own mapping. Delete `world.ruleProfiles` and both flatten back to `3`; that regression is exactly what the flagship test pins.

---

## Determinism, serialization, and honest scope

- **Data, never closures.** A `RuleProfile` is a plain record. It serializes with world state byte-identically and survives save/load unchanged — modules are re-supplied by the loader, state is restored, and post-load resolution reads the same mappings (proven in `examples.test.ts`).
- **`formulaOverrides` is reserved.** Combat formulas are closures; they cannot round-trip through serialized data. v1 ships `statMapping` only. Per-profile formula *tuning* is future work that waits on a serializable formula DSL.
- **Single controller.** Profiles let many *entities* in one world resolve combat differently under one process. Two *human* players sharing a world is a networking layer, deliberately out of scope — see the Roadmap.

---

## See also

- [Chapter 55 — Build a Combat Pack](./55-combat-pack-guide.md) — `buildCombatStack`, stat mapping, resource profiles
- [Chapter 57 — Composition Guide](./57-composition-guide.md) — the 5-step workflow for building a game
- [Chapter 48 — Abilities System](./48-abilities-system.md) — ability definitions, costs, effects
- [Chapter 31 — Character Profiles](./31-character-profiles.md) — saved character sheets (a different "profile")
- [Appendix D — CLI Reference](./appendix-d-cli-reference.md) — the `profile` command in full
- Runnable examples: [`mixed-party.ts`](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/docs/examples/mixed-party.ts), [`shared-profiles.ts`](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/docs/examples/shared-profiles.ts)
