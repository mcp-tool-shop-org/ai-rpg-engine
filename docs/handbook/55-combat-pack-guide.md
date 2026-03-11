# Build a Combat Pack Profile

This chapter teaches pack authors how to give a world its combat identity using the builder helpers shipped in `@ai-rpg-engine/modules`.

For the overview of how combat works: [Combat Overview](49a-combat-overview.md)
For the full composition workflow (not just combat): [Composition Guide](57-composition-guide.md)

---

## The Two Paths

### Path 1: buildCombatStack (Recommended)

One function call. Handles formula generation, wrapper composition, module wiring, and review tracing.

```typescript
import { buildCombatStack } from '@ai-rpg-engine/modules';

const combat = buildCombatStack({
  statMapping: { attack: 'grit', precision: 'draw-speed', resolve: 'lore' },
  playerId: 'drifter',
  resourceProfile: myProfile,
  biasTags: ['undead', 'spirit', 'beast'],
  engagement: {
    backlineTags: ['ranged'],
    protectorTags: ['bodyguard'],
  },
});

const engine = new Engine({
  modules: [traversalCore, statusCore, ...combat.modules, /* non-combat modules */],
});
```

### Path 2: Manual Wiring

For worlds that need full control over formula logic or non-standard module ordering. See any starter world's `setup.ts` for the pattern — it involves `createCombatReview`, `withEngagement`, `withCombatResources`, and manually ordering 8+ combat modules.

Most worlds should use Path 1.

---

## Step 1: Choose Your Stat Mapping

The stat mapping is your world's combat fingerprint. It maps three logical roles to genre-specific stat names:

| Role | What It Drives | Example Names |
|------|---------------|---------------|
| **attack** | Damage, guard breakthrough | grit, might, chrome, brawn, fitness, vitality |
| **precision** | Hit chance, dodge, guard counter, reposition | draw-speed, agility, reflex, cunning, wits, perception |
| **resolve** | Guard absorption, disengage, brace resistance, morale | lore, showmanship, netrunning, sea-legs, nerve, composure |

**The golden rule:** attack, precision, and resolve must map to **three different stats**. If attack and resolve map to the same stat (e.g., both map to 'grit'), guard breakthrough becomes impossible and guard reduction collapses to a single dimension.

```typescript
// Good: three distinct stats
{ attack: 'grit', precision: 'draw-speed', resolve: 'lore' }

// Bad: attack = resolve = 'grit' — dimension collapse
{ attack: 'grit', precision: 'draw-speed', resolve: 'grit' }
```

### What stat spreads produce

Guard breakthrough fires when `attackStat - resolveStat > 2`. Design your entity stats accordingly:

- **Brutes** (high attack, low resolve): Can break through guard. War Beast with might=8, showmanship=0 → 15% breakthrough.
- **Tacticians** (balanced): Rarely break through. Inspector with grit=4, eloquence=5 → 0%. Genre-correct.
- **Resilient** (high resolve): Nearly unbreakable guard. Zombies with nerve=10 → impossible to break through.

---

## Step 2: Design Your Resource Profile (Optional)

Resource profiles wire genre-specific currencies into combat. Omit this for simple worlds.

```typescript
import type { CombatResourceProfile } from '@ai-rpg-engine/modules';
import { COMBAT_STATES } from '@ai-rpg-engine/modules';

const myProfile: CombatResourceProfile = {
  packId: 'weird-west',

  // Earn resources from combat events
  gains: [
    { trigger: 'take-damage', resourceId: 'dust', amount: 3 },
  ],

  // Spend resources to enhance actions
  spends: [
    {
      action: 'brace',
      resourceId: 'resolve',
      amount: 3,
      effects: {
        guardBonus: 0.10,
        resistState: COMBAT_STATES.OFF_BALANCE,
        resistChance: 60,
      },
    },
    {
      action: 'attack',
      resourceId: 'resolve',
      amount: 2,
      effects: { damageBonus: 1 },
    },
  ],

  // Lose resources from setbacks
  drains: [
    { trigger: 'take-damage', resourceId: 'resolve', amount: 1 },
  ],

  // Shift AI behavior based on resource levels
  aiModifiers: [
    {
      resourceId: 'dust',
      highThreshold: 60,
      highModifiers: { disengage: 15 },
    },
    {
      resourceId: 'resolve',
      lowThreshold: 20,
      lowModifiers: { guard: 10, brace: 10 },
    },
  ],
};
```

### Available Triggers

**Gains:** `attack-hit`, `guard-absorb`, `brace`, `defeat-enemy`, `reposition-success`, `reposition-outflank`, `take-damage`, `ally-defeated`

**Drains:** Same trigger set as gains.

**Spends:** `attack`, `guard`, `brace`, `disengage`, `reposition`

### Resource Design Patterns

| Pattern | Example | Feel |
|---------|---------|------|
| **Corruption** | Gain dust from damage, high dust penalizes | Weird West — violence taints |
| **Composure** | Gain from guarding, drain from damage | Detective — calm under pressure |
| **Bloodlust** | Gain from kills, spend for power | Vampire — hunger feeds strength |
| **Crowd Favor** | Gain from flashy attacks, spend for bonuses | Gladiator — the audience demands spectacle |
| **Infection** | Gain from zombie contact, no spends | Zombie — slow inevitable decay |

---

## Step 3: Choose Pack Biases

Pack biases diversify AI behavior by enemy archetype. Use `biasTags` in `buildCombatStack` to select which built-in biases apply.

```typescript
import { PACK_BIAS_TAGS } from '@ai-rpg-engine/modules';
// Available: assassin, samurai, feral, beast, pirate, colonial,
//            vampire, hunter, ice-agent, zombie, undead, criminal,
//            drone, alien, spirit, gladiator
```

Biases modify the AI's 8 intent scores. Example:

| Bias | Key Shifts |
|------|-----------|
| **assassin** | +20 finish, +15 reposition, -10 guard |
| **samurai** | +15 guard, +15 brace, +10 protect |
| **feral** | +20 attack, +15 finish, -20 guard, -20 brace |
| **zombie** | +15 attack, -15 disengage, -10 guard |

Entities get biases when their tags match. A `role:brute` entity tagged `beast` gets the beast bias.

---

## Step 4: Configure Engagement (Optional)

Engagement tags control which entities get BACKLINE and PROTECTED states.

```typescript
buildCombatStack({
  // ...
  engagement: {
    backlineTags: ['ranged', 'caster', 'netrunner'],  // default: ['ranged', 'caster']
    protectorTags: ['bodyguard', 'samurai'],           // default: ['bodyguard']
    chokepointTag: 'chokepoint',                       // default: 'chokepoint'
  },
});
```

**Tag placement:**
- Add `ranged`, `caster`, etc. to entity tags for backline eligibility
- Add `bodyguard` to entity tags for protector role
- Add `chokepoint` to zone tags for chokepoint behavior

→ See [Zone Positioning](51-zone-positioning.md) for engagement state details.

---

## Step 5: Override Formulas (Optional)

For worlds that need non-standard combat math, spread overrides:

```typescript
buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'showmanship' },
  formulaOverrides: {
    // Custom damage: might + weapon bonus
    damage: (attacker) => Math.max(1, (attacker.stats.might ?? 3) + (attacker.resources.weaponBonus ?? 0)),
  },
});
```

The override replaces only the specified formula. All others use the standard logic generated from the stat mapping.

---

## Complete Example: Weird West

```typescript
import { buildCombatStack, COMBAT_STATES } from '@ai-rpg-engine/modules';
import type { CombatResourceProfile } from '@ai-rpg-engine/modules';

const weirdWestCombatProfile: CombatResourceProfile = {
  packId: 'weird-west',
  gains: [{ trigger: 'take-damage', resourceId: 'dust', amount: 3 }],
  spends: [
    { action: 'brace', resourceId: 'resolve', amount: 3,
      effects: { guardBonus: 0.10, resistState: COMBAT_STATES.OFF_BALANCE, resistChance: 60 } },
    { action: 'attack', resourceId: 'resolve', amount: 2,
      effects: { damageBonus: 1 } },
  ],
  drains: [{ trigger: 'take-damage', resourceId: 'resolve', amount: 1 }],
  aiModifiers: [
    { resourceId: 'dust', highThreshold: 60, highModifiers: { disengage: 15 } },
    { resourceId: 'resolve', lowThreshold: 20, lowModifiers: { guard: 10, brace: 10 } },
  ],
};

const combat = buildCombatStack({
  statMapping: { attack: 'grit', precision: 'draw-speed', resolve: 'lore' },
  playerId: 'drifter',
  resourceProfile: weirdWestCombatProfile,
  biasTags: ['undead', 'spirit', 'beast'],
});

// In Engine: modules: [traversalCore, statusCore, ...combat.modules, ...]
```

**What this produces:**
- Standard formulas mapped to grit/draw-speed/lore
- Engagement with default tags (bodyguard protects, ranged/caster backline)
- Resource hooks: dust builds from damage, resolve drains under pressure
- AI biases for undead, spirit, and beast enemies
- Full review tracing for combat explainability

---

## Minimal Example: Fantasy

```typescript
const combat = buildCombatStack({
  statMapping: { attack: 'vigor', precision: 'instinct', resolve: 'will' },
  playerId: 'player',
  biasTags: ['undead'],
  recovery: { safeZoneTags: ['safe', 'sacred'] },
});
```

No resource profile. No custom engagement. No formula overrides. Combat works with all five actions, four combat states, four engagement states, guard counter, breakthrough — all using default formulas derived from the stat mapping.

---

## API Notes

**`profile` vs `config` naming:** `CombatResourceProfile` uses `profile` because it's a data declaration, not behavior configuration. All other combat modules use `config`. This is intentional — profiles describe what resources do; configs tune how modules behave.

**Event naming:** All combat events follow `combat.{verb}.{outcome}` (e.g., `combat.guard.absorbed`, `combat.reposition.success`). One exception: `combat.guard.broken` uses "broken" rather than "fail" — semantically correct since it describes guard being broken through, not a failed guard action.

**`buildCombatFormulas` standalone:** Available separately for worlds that want standard formulas without the full stack:

```typescript
import { buildCombatFormulas } from '@ai-rpg-engine/modules';

const formulas = buildCombatFormulas({
  attack: 'might', precision: 'agility', resolve: 'showmanship',
});
```

---

## See Also

- [Combat Overview](49a-combat-overview.md) — the six pillars, actions, states
- [Composition Guide](57-composition-guide.md) — full game composition workflow
- [Tuning Philosophy](56-tuning-philosophy.md) — what to tune vs leave alone
- [Profile Roadmap](../profile-roadmap.md) — plug-in profiles: the engine's destination feature (planned)
