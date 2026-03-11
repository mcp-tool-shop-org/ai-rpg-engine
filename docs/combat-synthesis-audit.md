# Combat Synthesis Audit

**Date:** 2026-03-11
**Scope:** Six combat pillars, 10 starter worlds, full interaction analysis
**Verdict:** The system is internally consistent with no contradictions. Three risks warrant targeted tuning. Two mechanics are effectively dead at default stat distributions.

---

## 1. Pillar Inventory

Six shipped pillars form the canonical combat surface:

| # | Pillar | Purpose | Primary Module |
|---|--------|---------|----------------|
| 1 | **Guard** | Reactive defense with counter threat | combat-core.ts |
| 2 | **Brace** | Proactive stabilization, OFF_BALANCE resistance | combat-tactics.ts |
| 3 | **Engagement** | Zone-local positioning (frontline/backline) | engagement-core.ts |
| 4 | **Interception** | Companion protection, scored by stats/role/state | combat-core.ts |
| 5 | **Dimensions** | Stat-driven mechanic variance (instinct/vigor/will) | combat-core.ts |
| 6 | **AI Tactics** | 8-intent scoring, pack biases, resource awareness | combat-intent.ts |

**No hidden seventh pillar.** Defeat flow (morale cascade, FLEEING, rout) is cross-cutting — it connects pillars 3, 4, 5, and 6 but is not a pillar itself. Combat recovery and combat resources are integration layers, not pillars.

**Plain-English purpose of each pillar:**

1. **Guard** makes defense an active choice with risk (counter) and reward (damage reduction), not a passive stat.
2. **Brace** lets entities hold ground and resist destabilization, giving positional fights a stickiness axis.
3. **Engagement** makes where you stand matter — frontliners screen, backliners snipe, isolation is dangerous.
4. **Interception** makes companions feel alive — loyal defenders step in, broken ones don't.
5. **Dimensions** ensure that vigor, instinct, and will each bend different mechanics, not just scale the same number.
6. **AI Tactics** ensure NPCs make legible decisions that reflect their role, morale, and tactical situation.

---

## 2. Interaction Matrix

### Pairwise Classification

|  | Guard | Brace | Engagement | Interception | Dimensions | AI Tactics |
|--|-------|-------|------------|--------------|------------|------------|
| **Guard** | — | Synergistic | Synergistic | Synergistic | Synergistic | Synergistic |
| **Brace** | Synergistic | — | Synergistic | Synergistic | Synergistic | Synergistic |
| **Engagement** | Synergistic | Synergistic | — | Synergistic | Neutral | Synergistic |
| **Interception** | Synergistic | Synergistic | Synergistic | — | Synergistic | Synergistic |
| **Dimensions** | Synergistic | Synergistic | Neutral | Synergistic | — | Synergistic |
| **AI Tactics** | Synergistic | Synergistic | Synergistic | Synergistic | Synergistic | — |

**No conflicting or redundant interactions found.**

### Detailed Pairwise Notes

**Guard x Brace** — Both produce GUARDED status but serve different roles. Guard = reactive (counter threat, clears on absorb). Brace = proactive (stability, OFF_BALANCE resistance). Well-differentiated.

**Guard x Engagement** — PROTECTED boosts guard reduction (+0.10). Guard is more valuable when a bodyguard is nearby. Clean synergy.

**Guard x Interception** — GUARDED gives +8 to interception chance. A guarding companion is a better interceptor. Intentional.

**Guard x Dimensions** — Guard reduction scales with resolve (will). Counter chance scales with instinct + will. Breakthrough scales with vigor - resolve. Clean three-way tension.

**Guard x AI** — AI scores guard when HP is low or EXPOSED. Pack biases can suppress guard (feral). AI prefers reposition when enemy is guarded. Well-integrated.

**Brace x Engagement** — Braced at chokepoint = -20 to reposition against. Engagement at chokepoint forces ENGAGED. Strong defensive combo. See dominance risks.

**Brace x Interception** — Brace applies GUARDED (+8 interception) and clears OFF_BALANCE (which penalizes interception -10). Indirect boost, clean.

**Brace x Dimensions** — Brace resistance scales with vigor. High vigor = better at maintaining stability. Clean.

**Engagement x Interception** — PROTECTED gives +15 interception. BACKLINE triggers shouldIntercept. ISOLATED blocks protection. Clean positional integration.

**Engagement x Dimensions** — Mostly independent. Engagement modifiers are flat (+5, -10, -15), not stat-scaled. No conflict, but also no interesting interaction. See dead-mechanic notes.

**Engagement x AI** — AI considers BACKLINE (pressure intent), ISOLATED (disengage intent), ENGAGED (reduced disengage scoring). enemyCover map accounts for interception risk. Well-integrated.

**Interception x Dimensions** — Formula uses instinct (x2.5) and will (x1.5). Stat-driven, clean.

**Interception x AI** — AI accounts for enemyCover when scoring attacks. Cover penalty up to -10. Clean.

**Dimensions x AI** — AI considers vigor_advantage and precision_advantage in attack scoring. Clean.

---

## 3. Three-Way Combo Audit

### Brace + Interception + Guard Counter
A braced entity is GUARDED (+8 interception, 70% OFF_BALANCE resistance). If attacked, guard counter may fire (instinct + will based), applying OFF_BALANCE to the attacker. Brace resistance then stabilizes against counter-OFF_BALANCE.

**Verdict:** Internally consistent. The bracer is a strong defensive anchor — interceptor, counter-threat, and stability. Not overpowered because it costs an action to set up and clears on absorb.

### Engagement + Reposition + Frontline Collapse
ENGAGED entities have -15 disengage. Reposition can outflank GUARDED enemies (+15). If the last ENGAGED entity falls, frontline collapses — remaining entities become ISOLATED (+2 damage, no protection).

**Verdict:** Clean sequence. This is the intended "push through" pattern: reposition breaks guard, attack kills frontliner, collapse exposes backline. Well-designed.

### Instinct + Interception + AI Target Choice
High instinct = better hit chance AND better interception. AI considers enemyCover.

**Concern:** Is there a reason NOT to max instinct on a bodyguard? Yes — instinct doesn't help damage (vigor does). A max-instinct bodyguard intercepts reliably but hits softly. Valid trade-off.

### Vigor + Brace + Guard Breakthrough
High vigor = breakthrough (stagger through guard) AND better brace resistance. Vigor-heavy entities are the best bracers AND the best breakthrough attackers.

**Verdict:** Not contradictory. Vigor = physical power. Strong entities hold ground AND hit through defenses. The counter is instinct (precision finds openings without brute force).

### Will + Morale Cascade + FLEEING
High will = reduced morale loss (mitigation min 0.3 at will=10). FLEEING blocks interception, +10% to hit.

**Concern:** Will=10 entity takes ~3.3x longer to collapse than will=3. Strong but not elimination — 30% of morale shifts still apply. At 0.3 x 25 (big damage hit) = 7.5 morale per big hit, starting from 70, takes ~8 big hits to reach 0.

**Verdict:** Will is the strongest single stat but has real trade-offs (no damage, no precision). See tuning backlog.

### Interception + Defeat Flow + Backline Restoration
When a frontliner is defeated, backline entities may become ISOLATED (no protection, no interception). If a reinforcement enters the zone, ISOLATED clears, interception returns.

**Verdict:** Clean flow. Defeat creates vulnerability, reinforcement restores protection. Creates meaningful tactical moments.

---

## 4. Dominance Risk Assessment

### MODERATE RISK: Brace + Chokepoint Stacking

A braced entity at a chokepoint imposes:
- -20 to reposition (braced defender penalty)
- -15 to reposition (chokepoint)
- -15 to disengage (ENGAGED at chokepoint stacks with engagement penalty)

Net reposition chance vs braced chokepoint defender: `40 + precision*4 - 35`. At instinct=5 (precision 5): `40 + 20 - 35 = 25%`. Very sticky.

**Mitigation exists:** Direct attacks still work (just reduced damage through GUARDED). Guard breakthrough can stagger. But in chokepoint-heavy worlds, braced defenders could stall fights indefinitely.

**Recommendation:** Monitor chokepoint density in starter worlds. Consider a cap on combined reposition penalties.

### LOW-MODERATE RISK: Will Stat Breadth

Will influences:
- Guard reduction (scales with resolve)
- Guard counter chance (+will component)
- Morale loss mitigation (1.0 - (will-3)*0.1, min 0.3)
- Interception chance (+will*1.5)
- Disengage resistance (AI scoring)

Five mechanics keyed to one stat. No other stat touches this many systems.

**Mitigation:** Will trades off against vigor (damage) and instinct (precision/hit chance). A will=10 entity is stable but hits softly and inaccurately.

**Recommendation:** Acceptable for now. Flag for balance pass if will-heavy builds dominate playtesting.

### LOW RISK: Max-Stat Bodyguard Interception

A GUARDED + PROTECTED bodyguard with instinct=10, will=10 reaches the 90% cap. In practice, this requires stacking 4+ bonuses simultaneously — rare outside purpose-built bodyguard entities where 90% interception is thematically correct.

**Recommendation:** No change needed. The 90% cap is the design intent.

### LOW RISK: AI Action Convergence

Without pack biases, AI defaults toward attack (highest base score). Pack biases exist specifically to prevent convergence. All 9 world-with-tactics use pack biases.

**Recommendation:** No change needed. Ensure every entity has either a role tag or explicit pack bias.

---

## 5. Dead-Mechanic Audit

### DEAD AT DEFAULT STATS: Guard Breakthrough

Formula: `min(25%, (vigor - resolve - 2) * 5)`

At default vigor=5, resolve(will)=3: `(5 - 3 - 2) * 5 = 0%`. Breakthrough never fires. Requires vigor > resolve + 2 to activate at all. At vigor=8, resolve=3: `(8 - 3 - 2) * 5 = 15%`.

**Problem:** Most entities have balanced stats. Breakthrough only matters in asymmetric matchups (brute vs scholar). In symmetric worlds, this mechanic is invisible.

**Recommendation:** Either lower the threshold (vigor - resolve) or ensure starter worlds include asymmetric matchups that demonstrate breakthrough.

### DEAD AT DEFAULT STATS: Guard Counter → Brace Resistance Chain

Guard counter chance at instinct=5, will=3: `max(5, min(50, (5 + 3 - 4) * 3.5)) = 14%`. Counter fires ~1 in 7 attacks. Brace resistance then fires on the OFF_BALANCE from counter: `stabilizeChance = vigor * 10`. At vigor=5: 50%.

Combined chance: 14% * 50% = 7%. The full chain fires ~1 in 14 attacks.

**Problem:** Too many gates. Counter is already rare. Brace resistance on top of it makes the combo nearly invisible.

**Recommendation:** This is acceptable as a rare highlight moment, not a reliable tactic. No change needed unless the narrative system fails to dramatize it when it happens.

### NARROW WINDOW: Interception Critical HP Penalty

-15 penalty at hpRatio < 0.25. The interceptor must be badly wounded but alive (1-5 HP out of 20). This is a narrow band before death.

**Verdict:** Working as intended — creates the "battered tank barely holds" moment. Not dead, just rare and dramatic.

### UNDEREXERCISED: Outflank from Reposition

Reposition against guarded target gets +15 (outflank). But reposition success depends on precision, and braced/chokepoint penalties can negate the bonus.

**Problem:** In low-precision worlds, outflank rarely fires. In high-penalty scenarios (chokepoint + braced), it's mathematically suppressed.

**Recommendation:** Check that at least 2-3 starter worlds have entities with instinct high enough to make outflanking viable.

### POTENTIALLY INERT: Engagement x Dimensions

Engagement modifiers (+5 ENGAGED, -10 BACKLINE, +20 EXPOSED) are flat, not stat-scaled. A precision-focused duelist gets no special engagement advantage. A vigor brute gets no special engagement disadvantage.

**Verdict:** This is a design choice (positioning is universal, not stat-dependent). Not a bug, but a missed synthesis opportunity. Could revisit if "precision should help with positioning" becomes a design goal.

---

## 6. Contradiction Audit

**No contradictions found.** The system is internally consistent.

### Design-Feel Issue: Interception Agency

Interception narration says "steps in front of" and "throws themselves between" — implying active choice. But the mechanic is a passive roll on the ally. The companion doesn't decide to intercept.

**Recommendation:** Either lean into the passive nature ("instinctively reacts") or add a future "protect" stance that makes interception opt-in. Current narration is fine for now but could feel odd to attentive players.

---

## 7. World Coverage Audit

### Module Registration

| World | Guard | Brace | Engagement | Interception | Dimensions | AI Tactics | Resources |
|-------|-------|-------|------------|--------------|------------|------------|-----------|
| Colony (sci-fi) | yes | yes | yes | yes | yes | yes | power, morale |
| Cyberpunk | yes | yes | yes | yes | yes | yes | ice, bandwidth |
| Detective | yes | yes | yes | yes | yes | yes | composure |
| Fantasy | yes | **no** | yes | yes | yes | yes | **none** |
| Gladiator | yes | yes | yes | yes | yes | yes | crowd-favor, fatigue |
| Pirate | yes | yes | yes | yes | yes | yes | morale |
| Ronin | yes | yes | yes | yes | yes | yes | honor, ki |
| Vampire | yes | yes | yes | yes | yes | yes | bloodlust, humanity |
| Weird West | yes | yes | yes | yes | yes | yes | resolve, dust |
| Zombie | yes | yes | yes | yes | yes | yes | (unknown) |

**Fantasy is the intentional outlier** — no brace action, no combat resources. Simpler combat, appropriate for a dungeon-crawl introduction.

### Combat Identity Coverage

The question is not just "does the module load" but "does the world create situations where the mechanic matters?"

**Worlds likely to surface engagement/positioning:** Colony (aliens in tunnels), Gladiator (arena zones), Pirate (ship decks), Ronin (castle corridors)

**Worlds likely to surface brace/chokepoint:** Colony (corridor defense), Gladiator (arena walls), Ronin (narrow bridges)

**Worlds likely to surface interception:** Ronin (bodyguard samurai with protectorTags), Vampire (thrall protectors with backlineTags)

**Worlds likely to surface morale cascade:** Pirate (crew morale resource), Colony (morale resource), Detective (composure collapse)

**Worlds likely to surface precision vs force:** Ronin (discipline vs brawn), Gladiator (agility vs might), Weird West (draw-speed vs grit)

### Coverage Gaps (Suspected)

1. **Detective** — Social/mystery world. Does combat even matter enough to exercise the full pillar stack? Likely underexercises brace, engagement, and interception.
2. **Cyberpunk** — Netrunning is the focus. Physical combat pillars may be secondary to ICE/hacking mechanics.
3. **Fantasy** — Missing brace and resources by design. Only exercises 4 of 6 pillars.

**Recommendation:** Confirm during starter world audit phase that Detective and Cyberpunk have at least one meaningful combat encounter that exercises positioning, interception, and tactical variety. If they don't, add one or accept that those worlds express combat identity differently.

---

## 8. Authoring/DX Observations

### Formula Wrapping Pattern
All 9 tactical worlds use:
```typescript
createCombatCore(review.explain(withCombatResources(profile, withEngagement(formulas))))
```
This is functional composition but the nesting depth is significant. Pack authors must understand the wrapper order matters.

### Clear Extension Points
- `CombatFormulas` — pluggable hit/damage/guard/intercept calculations
- `PackBias` — 16 built-in biases, easy to create custom
- `CombatResourceProfile` — gains/spends/drains/AI modifiers
- `TacticalHooks` — pre/post action, defense/movement modifiers
- `EngagementConfig` — backlineTags, chokepointTag, protectorTags

### Rough Edges
1. **Wrapper composition is implicit** — no type-level guarantee that withEngagement wraps before withCombatResources. Wrong order could cause subtle bugs.
2. **Role tags vs companion tags** — two parallel tag systems (role:bodyguard vs companion:fighter) that both influence interception. Could confuse pack authors.
3. **No "combat profile" concept** — authors must wire 6+ module creators individually. A higher-level "combat preset" or "combat profile" would reduce boilerplate.
4. **defaultInterceptChance vs formulas.interceptChance** — two interception paths (default formula vs custom). The default is well-designed but authors may not realize they can override it.

---

## 9. Documentation Gaps

### Missing Cross-References
- Chapter 49 (Tactics) doesn't reference Chapter 53 (Precision vs Force) for how stats affect brace/reposition
- Chapter 51 (Positioning) doesn't reference Chapter 54 (Interception) for how PROTECTED boosts intercept
- Chapter 52 (Defeat Flow) doesn't reference Chapter 47 for role templates that influence morale profiles

### Missing Content
- No combat overview chapter tying all pillars together
- No "build a combat pack profile" guide for authors
- No tuning philosophy document
- No scenario examples showing pillar interactions

### Combat Overview Chapter Outline (Proposed)

1. **Combat at a Glance** — What combat feels like in the AI RPG Engine
2. **The Six Pillars** — One paragraph each, what they contribute
3. **Turn Flow** — Action declaration, resolution, events, state transitions
4. **The Five Actions** — Attack, guard, brace, disengage, reposition with soft counter triangle
5. **States and Positioning** — 4 combat states + 4 engagement states, how they interact
6. **Morale and Defeat Flow** — Will mitigation, FLEEING, rout, frontline collapse
7. **Precision vs Force** — Three stat dimensions, per-mechanic influence table
8. **Companion Protection** — Interception formula, role bonuses, PROTECTED stacking
9. **Resource Hooks and Genre Identity** — How worlds wire resources into combat
10. **AI Tactics and Pack Biases** — 8 intents, bias system, how AI reads the board
11. **Authoring Guidance** — How to express a world's combat identity
12. **Tuning Philosophy** — What to tune, what to leave alone, how to avoid number soup

---

## 10. Prioritized Backlog

### Tuning (Balance Pass Targets)
| # | Item | Risk | Priority |
|---|------|------|----------|
| T1 | Brace + chokepoint combined penalty may stall fights | moderate | high |
| T2 | Guard breakthrough threshold too high for default stats | dead mechanic | medium |
| T3 | Will stat breadth (5 mechanics keyed to one stat) | low-moderate | low |
| T4 | Guard counter fire rate at default stats (~14%) | low | low |

### Docs
| # | Item | Priority |
|---|------|----------|
| D1 | Write combat overview chapter (outline in section 9) | high |
| D2 | Add cross-references between chapters 49/51/52/53/54 | medium |
| D3 | Write "build a combat pack profile" author guide | medium |
| D4 | Write tuning philosophy note | low |

### DX
| # | Item | Priority |
|---|------|----------|
| X1 | Consider a CombatProfile helper that composes all wrappers | medium |
| X2 | Clarify role: vs companion: tag precedence for authors | medium |
| X3 | Document wrapper composition order | low |
| X4 | Add combat preset examples per genre | low |

### Bugs
None found.

### Future Enhancement (Not for this phase)
| # | Item | Notes |
|---|------|-------|
| F1 | Stat-scaled engagement modifiers | Dimensions x Engagement is currently neutral |
| F2 | Explicit "protect" stance for interception | Would give interception player agency |
| F3 | Golden scenario test suite | Regression-check pillar interactions |
| F4 | Combat philosophy one-pager for contributors | |

---

## 11. Conclusion

The six pillars create a coherent fight language. Every pairwise interaction is either synergistic or neutral — no conflicts, no redundancies, no contradictions. The system feels designed, not accumulated.

**What works well:**
- Guard/brace differentiation (reactive vs proactive defense)
- Engagement creating meaningful positioning with frontline collapse
- Interception making companions feel alive through scored formula
- AI tactics reading the full board state
- Three stat dimensions each bending different mechanics

**What needs attention:**
- Brace + chokepoint is the strongest combo and may need a ceiling
- Guard breakthrough and guard counter are nearly invisible at default stats
- Will is the broadest stat — not broken, but watch for it
- Fantasy world is intentionally simpler; Detective and Cyberpunk may underexercise physical combat pillars

**What doesn't need touching:**
- The 90% interception cap
- AI pack bias system
- Defeat flow / morale cascade
- Resource integration layer
- Formula wrapper composition (works, just needs docs)

The beast behaves like one animal.
