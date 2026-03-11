# Balance Pass — Post Content Fix

**Date:** 2025-03-11
**Scope:** Targeted balance analysis after C1-C6 content fixes
**Method:** Mathematical analysis using actual entity stat distributions from all 10 worlds
**Formula versions:** combat-core defaultInterceptChance, guard breakthrough `min(25, max(0, (atk - res - 2) * 5))`, withEngagement chokepoint modifiers, combat-tactics brace/reposition

---

## 1. Guard Breakthrough Rates

Formula: `breakChance = min(25, max(0, (attackStat - resolveStat - 2) * 5))`

### Per-World Breakthrough Table

| World | StatMapping (atk→res) | Max Player→Enemy | Max Enemy→Player | Notes |
|-------|----------------------|-------------------|-------------------|-------|
| **Gladiator** | might→showmanship | **15%** (vs Beast show=0) | **15%** (Overlord might=9) | Most breakthrough-rich |
| **Weird West** | grit→lore | **10%** (vs Revenant lore=1) | 0% | Player-sided asymmetry |
| **Fantasy** | vigor→will | **10%** (vs Ghoul will=1) | **10%** (Warden vigor=7) | Bidirectional |
| **Vampire** | vitality→presence | **10%** (vs Thrall pres=1) | **5%** (Elder/Thrall) | Moderate |
| **Colony** | engineering→command | **5%** (vs all, cmd=1) | 0% | Player-sided |
| **Ronin** | discipline→composure | 0% | **5%** (Assassin disc=7) | Enemy-sided |
| **Zombie** | fitness→nerve | 0% | **5%** (Bloater fit=8) | Zombies have nerve=10 |
| **Detective** | grit→eloquence | 0% | 0% | Genre-correct |
| **Cyberpunk** | chrome→netrunning | 0% | 0% | Player is netrunner, not bruiser |
| **Pirate** | brawn→sea-legs | 0% | 0% | Stats too balanced |

### Breakthrough Detail — Key Matchups

**Gladiator** (attack='might', resolve='showmanship'):
| Attacker | Defender | atk | res | Chance |
|----------|----------|-----|-----|--------|
| Player (might=5) | War Beast (show=0) | 5 | 0 | 15% |
| Overlord (might=9) | Player (show=4) | 9 | 4 | 15% |
| Champion (might=7) | Player (show=4) | 7 | 4 | 5% |
| War Beast (might=8) | Player (show=4) | 8 | 4 | 10% |

**Weird West** (attack='grit', resolve='lore'):
| Attacker | Defender | atk | res | Chance |
|----------|----------|-----|-----|--------|
| Player (grit=5) | Revenant (lore=1) | 5 | 1 | 10% |
| Player (grit=5) | Bandit (lore=2) | 5 | 2 | 5% |
| Revenant (grit=6) | Player (lore=4) | 6 | 4 | 0% |

**Fantasy** (attack='vigor', resolve='will'):
| Attacker | Defender | atk | res | Chance |
|----------|----------|-----|-----|--------|
| Player (vigor=5) | Ash Ghoul (will=1) | 5 | 1 | 10% |
| Crypt Warden (vigor=7) | Player (will=3) | 7 | 3 | 10% |

### Breakthrough Assessment

**Meets user targets:**
- Gladiator shows obvious breakthrough (15% both directions) ✓
- Weird West shows brute-vs-weird asymmetry (10% Player→Revenant, 0% reverse) ✓
- Detective uses dimensions meaningfully despite 0% breakthrough ✓ (eloquence now drives guard reduction and disengage separately from grit)

**Zero-breakthrough worlds (Detective, Cyberpunk, Pirate):**
- Detective: Genre-correct. Inspector fights with perception and eloquence, not raw force.
- Cyberpunk: Genre-correct. Player is a netrunner (chrome=3, netrunning=7). Combat isn't about overpowering guard.
- Pirate: All entities have brawn ≈ sea-legs (within ±3). No stat gap exceeds the threshold of >2. Could benefit from wider stat spreads on content side, but not a constants issue.

**Verdict: No constant changes needed.** Breakthrough rates are controlled by stat distributions, which is by design. The threshold of `atk - res > 2` is appropriate — it means breakthrough is a niche for brutes attacking low-resolve targets, not a universal mechanic.

---

## 2. Chokepoint Stickiness (3 worlds post-fix)

Chokepoints now exist in: Colony (alien-cavern), Fantasy (vestry-door), Ronin (hidden-passage).

### Disengage at Chokepoint

Pack formula: `40 + precision * 5 + resolve * 2` (clamped 15-90)
Engagement modifiers: ENGAGED -15, chokepoint -10 → total -25

| World | Entity | precision | resolve | Pack Base | At Chokepoint+ENGAGED |
|-------|--------|-----------|---------|-----------|----------------------|
| Fantasy | Player (inst=4, will=3) | 4 | 3 | 66% | **41%** |
| Fantasy | Ash Ghoul (inst=3, will=1) | 3 | 1 | 57% | **32%** |
| Fantasy | Stalker (inst=5, will=2) | 5 | 2 | 69% | **44%** |
| Fantasy | Warden (inst=4, will=5) | 4 | 5 | 70% | **45%** |
| Ronin | Player (perc=6, comp=4) | 6 | 4 | 78% | **53%** |
| Ronin | Assassin (perc=5, comp=6) | 5 | 6 | 77% | **52%** |
| Ronin | Guard (perc=4, comp=5) | 4 | 5 | 70% | **45%** |
| Colony | Player (aware=5, cmd=6) | 5 | 6 | 77% | **52%** |
| Colony | Drone (aware=5, cmd=1) | 5 | 1 | 67% | **42%** |
| Colony | Entity (aware=9, cmd=1) | 9 | 1 | 87% | **62%** |

### Reposition at Chokepoint

Base: `45 + precision * 5`
Modifiers: ENGAGED -10, chokepoint -15, braced defender -20

| World | Entity | precision | Base | Choke+ENGAGED | +Braced Defender |
|-------|--------|-----------|------|---------------|------------------|
| Fantasy | Player (inst=4) | 4 | 65% | **40%** | **20%** |
| Fantasy | Ghoul (inst=3) | 3 | 60% | **35%** | **15%** |
| Fantasy | Stalker (inst=5) | 5 | 70% | **45%** | **25%** |
| Ronin | Player (perc=6) | 6 | 75% | **50%** | **30%** |
| Ronin | Assassin (perc=5) | 5 | 70% | **45%** | **25%** |
| Colony | Player (aware=5) | 5 | 70% | **45%** | **25%** |
| Colony | Drone (aware=5) | 5 | 70% | **45%** | **25%** |

### Brace Stabilize at Chokepoint

Formula: `min(90, 40 + attackStat * 6)` + 15 chokepoint bonus
Resists OFF_BALANCE when braced.

| World | Entity | attackStat | Base Stabilize | +Chokepoint |
|-------|--------|------------|----------------|-------------|
| Fantasy | Player (vigor=5) | 5 | 70% | **85%** |
| Fantasy | Ghoul (vigor=4) | 4 | 64% | **79%** |
| Fantasy | Warden (vigor=7) | 7 | 82% | **90%** (cap) |
| Ronin | Player (disc=5) | 5 | 70% | **85%** |
| Ronin | Guard (disc=5) | 5 | 70% | **85%** |
| Colony | Player (eng=4) | 4 | 64% | **79%** |
| Colony | Drone (eng=6) | 6 | 76% | **90%** (cap) |

### Chokepoint Stickiness Assessment

**Synthesis carry-forward question: "Does brace+chokepoint stall fights?"**

Answer: **No.** The combination is strong but not stalling:
- Reposition drops to 15-30% with braced defender at chokepoint (meaningful friction)
- But brace costs an action each round (no damage output while bracing)
- Disengage remains 32-62% even at chokepoint (escape is hard but possible)
- Brace stabilize at chokepoint is 79-90% (very resistant to being knocked off-balance)

The defensive trade is correct: sacrifice damage output for position control. High-instinct enemies (Stalker, Assassin) can still reposition at 25-45% even against a braced chokepoint defender.

**User target: "Colony/Fantasy/Ronin prove chokepoints are interesting rather than glue."**
✓ Chokepoints create meaningful tactical friction without deadlock. A braced defender at a chokepoint forces attackers to either commit to the fight or attempt risky repositioning.

**Verdict: No constant changes needed.** Chokepoint penalties (-10 disengage, -15 reposition) and brace counter (-20 reposition) are well-calibrated.

---

## 3. Interception Reliability

Formula: `8 + instinct*2.5 + max(0, (will-3)*1.5) + hpRatio*8 + (morale-50)*0.15 + stateBonus + roleBonus`
PROTECTED bonus: +15 (from withEngagement wrapper)
Clamped: 5-90%

### Bodyguard Interception (worlds with protectorTags)

| World | Bodyguard | inst | will | HP% | Role | Base | +PROTECTED |
|-------|-----------|------|------|-----|------|------|------------|
| Colony | Breached Drone (aware=5, cmd=1) | 5 | 1 | 50%* | +15 | **42%** | **57%** |
| Cyberpunk | ICE Sentry (reflex=4, net=2) | 4 | 2 | 50%* | +15 | **40%** | **55%** |
| Ronin | Castle Guard (perc=4, comp=5) | 4 | 5 | 90%† | +15 | **46%** | **61%** |

*hp=10, maxHp defaults to 20. †hp=18, maxHp defaults to 20.

### Bodyguard Degradation Curve (Ronin Castle Guard)

| HP% | Base Chance | With PROTECTED | Notes |
|-----|-------------|----------------|-------|
| 100% | 48% | 63% | Full strength |
| 75% | 46% | 61% | Minor wound |
| 50% | 44% | 59% | Wounded |
| 25% | 26% | 41% | Critical (−15 penalty kicks in) |
| 10% | 24% | 39% | Near death |

### Non-Bodyguard Ally Interception

| World | Ally | inst | will | HP% | Role Bonus | Chance |
|-------|------|------|------|-----|------------|--------|
| Weird West | Sheriff Hale (draw=5, lore=3) | 5 | 3 | 80% | 0 | **29%** |
| Fantasy | Brother Aldric (inst=3, will=7) | 3 | 7 | 60%* | 0 | **28%** |
| Detective | Constable Pike (perc=4, eloq=3) | 4 | 3 | 90% | 0 | **28%** |
| Pirate | Quartermaster Bly (cun=5, sea=6) | 5 | 6 | 80% | 0 | **34%** |

*hp=12, maxHp defaults to 20.

### Interception Assessment

**Differentiation arc:**
- Bodyguards at full HP: ~40-48% base, ~55-63% with PROTECTED
- Non-bodyguard allies: ~28-34%
- Gap: ~15-20 percentage points from role bonus alone
- Injury degrades smoothly until critical HP (25%), where -15 penalty creates sharp dropoff
- FLEEING: 0% (hard block)

**User target: "Present without becoming constant nanny-ball?"**
✓ Bodyguards intercept roughly half the time (not constant). Non-bodyguards intercept roughly 1 in 3-4. Injury creates meaningful degradation. The system rewards protecting your protector.

**Verdict: No constant changes needed.** Interception rates are well-distributed across the 5-90% range with meaningful variation from stats, HP, roles, and combat states.

---

## 4. AI Action Distribution

### Post-Fix Dimension Separation Impact

The C1/C2 fixes separated attack and resolve stats in Detective and Weird West. This changes:

**Guard Reduction** (how effective guarding is):
- Formula: `0.5 + max(0, (resolve - 3) * 0.03)`, clamped to 0.75
- Detective: Now uses `eloquence` instead of `grit`. Player's eloquence=5 → reduction=0.56 (was grit=4 → 0.53). Minor change.
- Weird West: Now uses `lore` instead of `grit`. Player's lore=4 → reduction=0.53 (was grit=5 → 0.56). Minor change.
- More meaningful: Revenant (lore=1) → reduction=0.50. Guard is weakest for low-lore enemies. Correct — mindless undead shouldn't guard effectively.

**Guard Counter** (chance to inflict OFF_BALANCE when attacked while guarding):
- Formula: `25 + precision * 2 + resolve * 2`
- Detective Player: `25 + 7*2 + 5*2 = 49%` (was `25 + 7*2 + 4*2 = 47%`). Barely changed.
- Weird West Player: `25 + 6*2 + 4*2 = 45%` (was `25 + 6*2 + 5*2 = 47%`). Barely changed.
- Key: These were already using the correct precision stat. Only the resolve portion changed.

**Disengage** (escape combat):
- Detective Player: `40 + 7*5 + 5*2 = 85%` (was `40 + 7*5 + 4*2 = 83%`). Minor.
- Weird West Player: `40 + 6*5 + 4*2 = 78%` (was `40 + 6*5 + 5*2 = 80%`). Minor.

### AI Scoring Dimensions

The AI scores attacks on 12 dimensions. Post-fix, the stat-driven dimensions use correct values:

**will dimension** (resolve stat): `min(5, (will - 3) * 1.5)`
- Detective Player: will=eloquence=5 → 3.0 (was grit=4 → 1.5)
- Weird West Player: will=lore=4 → 1.5 (was grit=5 → 3.0)

**vigor_advantage** (attack stat): `min(5, (attack - 5) * 3)` if attack > 5
- Detective Player: attack=grit=4 → 0 (unchanged)
- Weird West Player: attack=grit=5 → 0 (unchanged)

### AI Assessment

The content fixes produce minor numerical shifts in AI scoring (1-2 points on the 0-100 scale). The AI's action selection is primarily driven by game state (exposed, guarded, fleeing) rather than raw stat values.

**Key behavioral change:** Enemies with low resolve stats (Revenant lore=1, Ash Ghoul will=1, War Beast showmanship=0) now guard less effectively. The AI should learn to attack guarded targets more when the defender's resolve is low, since guard absorbs less damage. This is correct behavior — brutes shouldn't benefit from guarding.

**Verdict: No constant changes needed.** The dimension separation doesn't distort AI behavior — it corrects it.

---

## 5. Engagement Expression

### BACKLINE / PROTECTED Coverage Post-Fix

| World | Entities with BACKLINE potential | Entities with PROTECTED potential |
|-------|--------------------------------|----------------------------------|
| Colony | Entities with 'ranged' tag | Breached Drone (bodyguard) |
| Cyberpunk | Entities with 'ranged'/'caster'/'netrunner' | ICE Sentry (bodyguard) |
| Ronin | Entities with 'ranged' | Castle Guard (bodyguard/samurai) |
| Vampire | Entities with 'ranged'/'caster'/'thrall' | None (no protectorTags) |

### Engagement State Effects on Combat

**BACKLINE:** +15 disengage, +10 reposition success
**PROTECTED:** +15 interception chance from allies
**ENGAGED (forced at chokepoints):** -15 disengage, -10 reposition

These bonuses/penalties are additive with base stats. At the stat ranges in these worlds (precision 3-9), the engagement modifiers represent a meaningful but not dominant influence:
- BACKLINE disengage bonus (+15) on a base of 57-87%: shifts to 72-90%
- ENGAGED penalty (-15) on a base of 57-87%: shifts to 42-72%

### Engagement Assessment

The C4/C6 fixes added explicit backlineTags and protectorTags to 3 more worlds. The engagement system now has meaningful expression in 5/10 worlds (Colony, Cyberpunk, Ronin, Vampire, Ronin with bodyguard+samurai protectors).

The remaining 5 worlds (Detective, Weird West, Fantasy, Pirate, Zombie, Gladiator) use default engagement (no backline/protector differentiation). This is acceptable — not every genre needs tactical positioning.

**Verdict: No constant changes needed.** Engagement modifiers are well-sized relative to base stat ranges.

---

## 6. Overall Balance Verdict

### Constants Reviewed

| Constant | Value | Verdict |
|----------|-------|---------|
| Breakthrough threshold | atk - res > 2 | **Keep** — produces 0-15% range across worlds, niche for brutes |
| Breakthrough cap | 25% | **Keep** — never reached in practice, appropriate ceiling |
| Guard reduction base | 50% | **Keep** — degrades correctly with low resolve |
| Guard counter | 25 + prec*2 + res*2 | **Keep** — 29-49% range across worlds |
| Chokepoint disengage penalty | -10 | **Keep** — meaningful with ENGAGED -15 stacking |
| Chokepoint reposition penalty | -15 | **Keep** — drops to 15-30% with brace, not stalling |
| Brace reposition counter | -20 | **Keep** — strong but costs an action |
| Brace stabilize chokepoint bonus | +15 | **Keep** — 79-90% stabilize is appropriate for the action cost |
| Interception base | 8 | **Keep** — produces 28-48% range at baseline |
| Bodyguard role bonus | +15 | **Keep** — creates clear differentiation |
| PROTECTED bonus | +15 | **Keep** — stacks bodyguard to 55-63% |
| Critical HP penalty | -15 at <25% | **Keep** — creates sharp degradation arc |
| AI interception cover penalty | -cover*0.6, cap -10 | **Keep** — mild preference for uncovered targets |

### Recommendations

**No constant changes required.** The content fixes (C1-C6) resolved the actual issues — collapsed dimensions and missing engagement tags. The underlying constants produce well-distributed outcomes across all 10 worlds.

**Content-level observations** (not balance constants, for future content passes):
1. **Pirate** could benefit from wider brawn vs sea-legs gaps on specific entities to enable breakthrough (e.g., a boarding brute with brawn=8, sea-legs=3)
2. **Zombie** nerve=10 on all undead makes guard breakthrough impossible against them — may be intentional (zombies are relentless, not breakable)
3. **Gladiator** is the breakthrough showcase world and performs that role well
4. **5 worlds** still have no engagement tags — this is acceptable for genre fit but limits engagement system expression

### User Target Verification

| Target | Status | Evidence |
|--------|--------|----------|
| Gladiator shows obvious breakthrough | ✓ | 15% Player→Beast, 15% Overlord→Player |
| Weird West shows brute-vs-weird asymmetry | ✓ | 10% Player→Revenant (lore=1), 0% reverse |
| Detective uses dimensions meaningfully despite rare breakthrough | ✓ | eloquence drives guard reduction + disengage independently of grit |
| Chokepoints are interesting, not glue | ✓ | 15-45% reposition at chokepoint, 32-62% disengage — friction without deadlock |

---

## Appendix: Guard Counter Rates

Formula: `25 + precision * 2 + resolve * 2`

| World | Defender | precision | resolve | Counter % |
|-------|----------|-----------|---------|-----------|
| Detective | Player (perc=7, eloq=5) | 7 | 5 | **49%** |
| Detective | Boss (perc=6, eloq=7) | 6 | 7 | **51%** |
| Weird West | Player (draw=6, lore=4) | 6 | 4 | **45%** |
| Fantasy | Player (inst=4, will=3) | 4 | 3 | **39%** |
| Fantasy | Warden (inst=4, will=5) | 4 | 5 | **43%** |
| Colony | Player (aware=5, cmd=6) | 5 | 6 | **47%** |
| Cyberpunk | Player (reflex=5, net=7) | 5 | 7 | **49%** |
| Ronin | Player (perc=6, comp=4) | 6 | 4 | **45%** |
| Pirate | Player (cun=6, sea=5) | 6 | 5 | **47%** |
| Vampire | Player (cun=5, pres=4) | 5 | 4 | **43%** |
| Zombie | Player (wits=6, nerve=5) | 6 | 5 | **47%** |
| Gladiator | Player (agil=5, show=4) | 5 | 4 | **43%** |
| Gladiator | Overlord (agil=5, show=6) | 5 | 6 | **47%** |
