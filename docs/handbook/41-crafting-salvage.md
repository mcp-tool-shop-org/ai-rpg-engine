# Chapter 41 — Crafting, Salvage & Item Transformation

Objects in AI RPG Engine can be found, tracked, and remembered — but until now, not changed. The crafting system adds salvage (items → materials), crafting (materials → items), repair, and modification — all responding to local scarcity, district mood, faction access, and item provenance.

This is not a crafting minigame. Lookup-table recipes, deterministic yield tables, and context-driven quality modifiers produce emergent item-economy feedback with zero LLM calls and negligible token overhead.

---

## Materials

Materials use the existing 8 supply categories — no new categories. A player's material inventory is stored in `profile.custom` as `materials.{category}: number`, following the same key-value pattern as leverage currencies (`leverage.{currency}`), capped at 0–50 per category.

```
materials.medicine: 3
materials.components: 7
materials.weapons: 2
```

### Reading and Writing Materials

| Function | Signature | Description |
|----------|-----------|-------------|
| `getMaterialInventory` | `(custom) → MaterialInventory` | Read all `materials.*` keys into structured form |
| `adjustMaterial` | `(custom, category, delta) → custom` | Modify single material, clamp 0–50 |
| `applyMaterialDeltas` | `(custom, deltas) → custom` | Apply multiple material changes atomically |
| `hasMaterials` | `(custom) → boolean` | True if any material > 0 |

### Formatting

| Function | Description |
|----------|-------------|
| `formatMaterialsForDirector(inventory)` | Detailed multi-line view of all categories |
| `formatMaterialsCompact(inventory)` | One-line status: `Materials: 3 medicine, 5 components` |

---

## Salvage

Salvaging destroys an item and yields materials based on its slot and rarity.

### Yield Tables

| Slot | Common | Uncommon | Rare | Legendary |
|------|--------|----------|------|-----------|
| weapon | components×1 | components×2, weapons×1 | components×3, weapons×2 | components×4, weapons×3 |
| armor | components×1 | components×2, luxuries×1 | components×3, luxuries×2 | components×4, luxuries×3 |
| tool | components×2 | components×3 | components×4, fuel×1 | components×5, fuel×2 |
| accessory | luxuries×1 | luxuries×2 | luxuries×2, components×1 | luxuries×3, components×2 |
| trinket | components×1 | components×1, luxuries×1 | luxuries×2, contraband×1 | luxuries×3, contraband×2 |

Quality is derived from rarity: common → poor, uncommon → standard, rare/legendary → fine.

### Byproducts

Provenance flags generate byproducts on salvage:

| Flag | Byproduct | Side Effect |
|------|-----------|-------------|
| `cursed` | `occult-residue` | — |
| `blessed` | `sanctified-essence` | — |
| `contraband` | `contraband-parts` | Generates heat |
| `stolen` | — | Suspicion if faction present in district |

Salvaging a relic (tier > 0) generates a rumor claim string.

### Economy Feedback

Salvaging increases the district's supply for yielded categories by 1 per unit — the player is adding materials to the local economy.

### API

| Function | Signature | Description |
|----------|-----------|-------------|
| `computeSalvageYield` | `(item) → MaterialYield[]` | Pure yield lookup |
| `salvageItem` | `(item, context?) → SalvageResult` | Full salvage: yields + byproducts + economy shifts |
| `formatSalvagePreview` | `(item, result) → string` | Preview for director `/salvage` command |

---

## Recipes

Recipes are static lookup tables — genre-aware, tag-filtered, deterministic. Three categories: **craft** (materials → new item), **repair** (materials → restore item), **modify** (materials → enhance/transform item).

### Universal Recipes (All Genres)

| Recipe ID | Category | Inputs | Output |
|-----------|----------|--------|--------|
| `repair-weapon` | repair | components×2 | Repair equipped weapon |
| `repair-armor` | repair | components×2, luxuries×1 | Repair equipped armor |
| `craft-bandage` | craft | medicine×2 | Tool (medical), common |
| `craft-torch` | craft | fuel×1, components×1 | Tool, common |
| `modify-sharpen` | modify | components×1 | Weapon +1 attack |
| `modify-reinforce` | modify | components×2 | Armor +1 defense |

### Genre-Specific Recipes

| Genre | Recipe ID | Inputs | Notes |
|-------|-----------|--------|-------|
| fantasy | `craft-potion` | medicine×3 | Healing tool |
| fantasy | `modify-bless` | medicine×1 | Requires `sacred` tag |
| zombie | `craft-improvised-weapon` | weapons×1, components×2 | Makeshift weapon |
| cyberpunk | `craft-stim` | medicine×2, components×1 | Combat stimulant |
| cyberpunk | `modify-black-market-tune` | contraband×2 | Requires black market |
| pirate | `modify-faction-mark` | luxuries×1 | Requires faction access |
| weird-west | `modify-curse` | contraband×1 | Adds cursed flag |

### Recipe Filtering

`getAvailableRecipes(genre, playerTags?, districtTags?)` returns recipes matching:

1. Genre filter (genre-specific or universal)
2. Required tags (e.g., `sacred` for bless, black market access for contraband mods)

### Material Sufficiency

`canCraft(recipe, materials, context?)` checks:

1. Material quantities meet recipe inputs
2. Context requirements met (black market access, faction access, district tags)

---

## Crafting Resolution

### Craft

`resolveCraft(recipe, context)` produces a new item:

1. Consumes materials from recipe inputs
2. Generates output `ItemDefinition` fragment (slot, rarity, stat modifiers)
3. Applies quality bonus from context
4. Produces side effects (economy shifts, rumors, heat)

### Quality Bonuses

| Condition | Effect |
|-----------|--------|
| District prosperity > 60 | +1 to highest stat modifier |
| District stability > 50 | 20% chance rarity upgrade |
| Black market context | Adds `contraband` provenance flag |
| Faction access | Adds `factionId` to provenance, origin = "Commissioned by {faction}" |

### Repair

`resolveRepair(item, recipe, context)` restores item stats toward original values. Cost scales with rarity.

### Modify

`resolveModify(item, recipe, context)` applies a modification kind:

| Kind | Effect | Provenance |
|------|--------|------------|
| `enhancement` | +1 stat (attack/defense) | Lore append |
| `makeshift` | Basic stat boost | `makeshift` flag |
| `blessed` | — | `blessed` flag + rumor |
| `cursed` | — | `cursed` flag + rumor |
| `black-market` | +2 stat | `contraband` flag + 10 heat |
| `faction-mark` | — | `factionId` + reputation |

Modifications create **derived ItemDefinitions** — new ID = `{original}-mod-{tick}`. The original stays in the catalog; immutability is preserved.

---

## Side Effects

Crafting actions produce `CraftEffect` side effects — a discriminated union:

| Type | Fields | Trigger |
|------|--------|---------|
| `economy-shift` | districtId, category, delta, cause | Material consumption shifts district supply |
| `rumor` | claim, valence | Crafting rare+ items, blessed/cursed mods |
| `heat` | delta | Black-market modifications (+10) |
| `reputation` | factionId, delta | Faction-mark modifications (+5) |
| `suspicion` | districtId, delta | Salvaging stolen items near faction |

---

## Pressure Integration

The crafting system adds one pressure kind:

### `crafting-shortage`

- **Trigger:** Components < 15 in any district
- **Urgency:** 0.5, 8 turns
- **Resolved-by-player:** Components +15, +5 reputation with local faction, rumor "restored the workshop"
- **Expired:** Components −5, commerce −3

Merchant NPCs in a crafting-shortage district boost their `bargain` priority by +0.2 ("desperate for materials").

---

## District Modifiers

`craftingEfficiency` (0.7–1.3) is added to `DistrictModifiers`:

| Condition | Value |
|-----------|-------|
| Prosperity > 60 + safety > 50 | 1.2 |
| Safety < 30 | 0.7 |
| Otherwise | 1.0 |

---

## Move Advisor

Two new actions in the strategic move recommendation engine:

| Action | Category | Impact | Heat |
|--------|----------|--------|------|
| `diplomacy.negotiate-materials` | diplomacy | 0.5 | 0 |
| `social.commission-craft` | social | 0.4 | 0 |

Both receive +0.3 urgency boost when `crafting-shortage` pressure is active.

---

## Narration Rules

When a crafting action occurs, the narrator receives `craftingContext` describing the player's modified/crafted gear. System prompt rules instruct:

- Describe crafting through sensory detail — hammering, mixing, stitching
- Modified items feel different — sharpened blades catch light, reinforced armor sits heavier
- Makeshift items look improvised — rough welds, mismatched parts
- Blessed items emanate subtle warmth; cursed items feel cold and wrong
- Black-market modifications look dangerous — exposed wiring, volatile compounds

## NPC Dialogue

NPCs react to the player's crafted/modified gear:

| Gear Type | NPC Reaction |
|-----------|-------------|
| Makeshift | Comment on resourcefulness, offer to improve |
| Faction-marked | Recognition from same faction, wariness from rivals |
| Black-market modified | Suspicion, threats to report, offers to buy |
| Blessed | Awe, reverence, superstitious fear |
| Cursed | Recoil, warding gestures, warnings |

---

## Player Commands

### In-Game

| Command | Action |
|---------|--------|
| `craft <recipe-id>` | Craft an item from a recipe |
| `salvage <item-name>` | Destroy item for materials |
| `repair <slot>` | Repair equipped item in slot |
| `modify <item> <recipe-id>` | Apply modification to item |

### Director Mode

| Command | Description |
|---------|-------------|
| `/craft` | List available recipes with can-craft status |
| `/materials` | Show current material inventory |
| `/salvage <item-id>` | Preview salvage yields without executing |

---

## Session Recap

The CRAFTING ACTIVITY section appears in the session summary when crafting occurred:

```
  ──────────────────────────────────────────────────────────────
  CRAFTING ACTIVITY
  ──────────────────────────────────────────────────────────────

  crafted: Iron Bandage — Crafted Iron Bandage at market-square
  modified: Iron Sword — Enhanced Iron Sword with modify-sharpen
  Materials: medicine -2, components +3
```

---

## Design Decisions

1. **Materials = existing 8 supply categories** — no new categories; salvaging a sword yields `weapons` + `components`, not "iron ingots"
2. **Materials in profile.custom** — same storage pattern as leverage currencies, capped at 50
3. **Recipes are lookup tables** — genre-aware + tag-filtered, ~6 universal + ~3–5 per genre, no per-pack recipe configuration
4. **Modifications create derived ItemDefinitions** — preserves catalog immutability; new ID = `{original}-mod-{tick}`
5. **Salvage affects district economy** — adding materials to local supply (+1 per unit), creating micro-economic feedback
6. **One pressure kind** — `crafting-shortage` only; keeps pressure budget lean
7. **Quality scales with context** — prosperity, stability, faction access, black market all modulate output quality
8. **Pure functions throughout** — all crafting logic is deterministic, no side effects, no LLM calls
9. **~15 token narration budget** — crafting context costs negligible tokens
