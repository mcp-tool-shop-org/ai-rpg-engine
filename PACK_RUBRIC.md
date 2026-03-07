# Pack Quality Rubric

Every starter pack in the AI RPG Engine catalog must pass this rubric before inclusion. The rubric ensures each pack offers a **mechanically and narratively distinct** experience. A pack must pass **5 of 7 dimensions** to qualify.

The `validatePackRubric()` function in `@ai-rpg-engine/pack-registry` enforces the mechanically checkable subset of this rubric.

---

## Dimensions

### 1. Distinct Verbs

The pack must define **at least one verb** beyond the six base verbs (`move`, `inspect`, `attack`, `use`, `speak`, `choose`). These genre verbs should reflect the pack's unique gameplay loop.

**Examples:**
- Cyberpunk: `hack` (breach ICE)
- Weird West: `draw` (quick-draw duel), `commune` (speak with spirits)
- Colony: `scan` (sensor sweep), `allocate` (redistribute power)

### 2. Distinct Resource Pressure

The pack must define **at least one non-HP resource** that creates meaningful pressure. This resource should drive decisions the player wouldn't face in other packs.

**Examples:**
- Weird West: Dust (inverse — accumulates toward failure)
- Colony: Power (shared colony resource with cascading shutdown)
- Zombie: Infection (ticking clock toward transformation)

### 3. Distinct Faction Topology

The pack must define districts with controlling factions, creating a political landscape. The faction structure should reflect the genre's power dynamics.

**Examples:**
- Pirate: Crown Navy vs pirate crews vs merchants
- Colony: Colony council vs alien presence
- Detective: Scotland Yard vs criminal underworld

### 4. Distinct Presentation Rule

The pack's `tones` array must not be identical to any other pack in the catalog. Tone combinations define the narrator's voice and atmosphere.

**Good:** `['eerie', 'gritty']` (Weird West) vs `['noir', 'gritty']` (Cyberpunk)
**Bad:** Two packs both using `['dark', 'atmospheric']` with no differentiation.

### 5. Distinct Audio Palette

The pack should suggest a distinct sonic identity through its setting, even if audio isn't wired yet. This is a **soft check** — it always passes but is reported for review.

**Guidance:** Consider what ambient sounds, music style, and sound effects would distinguish this pack from others. Document these in the pack's presentation rules or README.

### 6. Distinct Failure Mode

The pack must define a **unique pressure resource** beyond HP and generic stamina. This creates a genre-specific way to lose or be degraded.

**Examples:**
- Weird West: Dust accumulation (supernatural corruption)
- Colony: Power depletion (systems cascade offline)
- Zombie: Infection percentage (transformation timer)

### 7. Distinct Narrative Fantasy

The pack's genre combination must be **unique across the catalog**. No two packs should occupy the same genre niche.

**Current catalog:**
| Pack | Genre(s) |
|------|----------|
| Chapel Threshold | fantasy |
| Neon Lockbox | cyberpunk |
| Gaslight Detective | mystery |
| Black Flag Requiem | pirate |
| Ashfall Dead | horror, post-apocalyptic |
| Dust Devil's Bargain | western |
| Signal Loss | sci-fi |

---

## Scoring

| Score | Result |
|-------|--------|
| 7/7 | Excellent — pack is fully differentiated |
| 5–6/7 | Pass — pack qualifies for inclusion |
| 3–4/7 | Needs work — address failing dimensions |
| 0–2/7 | Reject — pack overlaps too heavily with existing catalog |

---

## Checklist for Pack Authors

Before submitting a new pack, verify:

- [ ] At least 1 unique verb beyond move/inspect/attack/use/speak/choose
- [ ] At least 1 non-HP resource with meaningful pressure
- [ ] Districts defined with controlling factions
- [ ] Tone combination is unique in the catalog
- [ ] Audio identity considered (even if not implemented)
- [ ] Unique failure/degradation mechanic
- [ ] Genre combination not already in catalog
- [ ] `packMeta` exported from `content.ts` and `index.ts`
- [ ] `validatePackRubric()` returns `ok: true`

---

## Running the Rubric

```typescript
import { validatePackRubric } from '@ai-rpg-engine/pack-registry';

const result = validatePackRubric(myPack, allOtherPacks);
console.log(result.ok);    // true if score >= 5
console.log(result.score);  // number of passing dimensions
console.log(result.checks); // detailed per-dimension results
```
