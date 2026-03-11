# Tuning Philosophy

This chapter explains what to tune, what to leave alone, and how to avoid number soup.

For the combat overview: [Combat Overview](49a-combat-overview.md)

---

## The Core Principle

**Content expression comes before constant fiddling.**

If a mechanic doesn't fire in your world, the first question isn't "should I change the threshold?" — it's "do my entities actually have stat distributions that could trigger it?"

Guard breakthrough requires `attackStat - resolveStat > 2`. If every entity in your world has attack ≈ resolve, breakthrough will never fire. That's not a broken formula — it's a world that doesn't exercise it. Either give some entities wider stat gaps, or accept that breakthrough isn't part of your genre's vocabulary.

---

## What to Tune

### Entity Stat Distributions

This is where most "balance problems" actually live. The engine formulas are stable — they produce well-distributed outcomes across 10 very different starter worlds. What varies is how each world's entities exercise them.

**Levers:**
- Wider attack/resolve gaps → more breakthrough
- Higher precision → more hits, better repositioning, better guard counters
- Higher resolve → better guard absorption, easier disengage, more brace resistance
- Extreme stat asymmetry → dramatic matchup variance (intended for boss fights)

### Resource Profile Values

Resource amounts are genre-specific and should feel right for the world's pacing:
- Gain amounts (how fast resources build)
- Spend amounts (how expensive power spikes are)
- Drain amounts (how punishing setbacks feel)
- AI modifier thresholds (when AI behavior shifts)

### XP per Kill

Ranges from 8 (zombie — many kills) to 20 (cyberpunk — few kills). Match your world's expected combat frequency.

### Pack Bias Tags

Which built-in biases you include shapes AI personality. A world with only `feral` enemies plays very differently from one with `samurai` + `assassin` enemies.

---

## What to Leave Alone

### Engine Constants

These constants were validated across all 10 starter worlds. They produce correct outcomes at every stat distribution tested:

| Constant | Value | Why It's Right |
|----------|-------|----------------|
| Breakthrough threshold | atk - res > 2 | Niche for brutes, silent for balanced fighters |
| Breakthrough cap | 25% | Never reached in practice; appropriate ceiling |
| Guard reduction base | 50% | Degrades correctly with low resolve |
| Guard counter | 25 + prec×2 + res×2 | 29–51% range across all worlds |
| Chokepoint disengage penalty | -10 | Meaningful with ENGAGED -15 stacking |
| Chokepoint reposition penalty | -15 | Drops to 15–30% with brace; not stalling |
| Brace reposition counter | -20 | Strong but costs an action per round |
| Interception base | 8 | 28–48% range at baseline |
| Bodyguard role bonus | +15 | Clear protector differentiation |
| PROTECTED bonus | +15 | Stacks bodyguard to 55–63% |
| Critical HP penalty | -15 at <25% | Sharp degradation arc |

### Formula Structure

The standard formulas (hitChance, damage, guardReduction, disengageChance) are shared by all 10 starter worlds. They're the right abstraction — simple enough to reason about, expressive enough for genre variance through stat mapping.

If you need truly different math, use `formulaOverrides` in `buildCombatStack`. Don't modify the engine defaults.

---

## How to Avoid Number Soup

### The Anti-Pattern

> "Breakthrough is only 5% in my world. Let me lower the threshold from 2 to 1, increase the multiplier from 5 to 8, and add a new stat bonus..."

This creates number soup — constants that are tuned to one world's stat distribution and break every other world.

### The Correct Approach

1. **Check your stat distributions first.** Are there actually entities with attack > resolve + 2?
2. **If no, add one.** Give a brute entity high attack and low resolve. Now breakthrough fires where it should.
3. **If yes and the rate still feels wrong,** the entity's stats need adjustment, not the formula.

### The Test

After any tuning change, verify:
- `npm run build` — clean compile
- `npx vitest run` — all tests pass
- The change produces the outcome you intended
- The change doesn't break other worlds (if modifying engine code)

---

## Genre-Appropriate Silence

Not every world needs every mechanic to be loud.

| World | Breakthrough Rate | Verdict |
|-------|------------------|---------|
| Gladiator | 15% both directions | Correct — arena combat is about raw power |
| Weird West | 10% player-sided | Correct — drifter vs mindless undead |
| Detective | 0% everywhere | Correct — investigation, not headbutts |
| Cyberpunk | 0% everywhere | Correct — netrunner, not bruiser |

Detective having 0% guard breakthrough is not a bug. It's a genre that doesn't worship physical dominance. The three stat dimensions still work — eloquence drives guard absorption and disengage independently of grit. The mechanic is present but intentionally quiet.

---

## The Seventh Pillar Rule

Don't add a seventh combat pillar because you got bored.

The six pillars (guard, brace, engagement, interception, dimensions, AI tactics) form a complete vocabulary. Every pair has a defined interaction. Every three-way combination has been audited. Adding a seventh pillar creates 6 new pairwise interactions and 15 new three-way combinations — all of which need testing, balancing, and documentation.

If you think you need a new pillar, you probably need a new resource profile that uses the existing six in a genre-specific way.
