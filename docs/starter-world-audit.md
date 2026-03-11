# Starter World Combat Audit

**Date:** 2026-03-11
**Scope:** All 10 starter worlds, encounter-level pillar expression analysis
**Carry-forward questions from synthesis audit:**
1. Does brace + chokepoint actually create stall patterns?
2. Do any worlds surface guard breakthrough enough to justify its existence?

---

## Carry-Forward Answers

### CF-1: Brace + Chokepoint Stall Risk

**Answer: Entirely theoretical. No starter world uses chokepoints.**

Zero of 10 worlds tag any zone as `chokepoint`. The engagement system's `chokepointTag` is never configured. The brace+chokepoint interaction (-20 braced + -15 chokepoint = -35 to reposition) cannot fire in any starter world.

Related dead mechanics:
- `ambushTag` in engagement config: never configured
- `ambush_entry` zone tag: never used
- Chokepoint brace bonus in combat-tactics: never triggers

**Verdict:** The chokepoint subsystem is complete decorative plumbing. Not a stall risk — it simply doesn't exist in practice.

**Recommendation:** Either add chokepoint zones to 2-3 corridor-appropriate worlds (Colony tunnels, Fantasy crypt passages, Ronin hidden passage) or document chokepoints as a pack-author extension point that starters intentionally skip.

### CF-2: Guard Breakthrough Visibility

**Answer: Breakthrough is structurally dead in 5 of 10 worlds and marginal in 3 more.**

Formula: `min(25%, (attackStat - resolveStat - 2) * 5)`

| World | Attack Stat | Resolve Stat | Same Stat? | Best Breakthrough % | Verdict |
|-------|-------------|-------------|------------|---------------------|---------|
| Colony | engineering | command | No | 5% (player vs low-cmd enemies) | Marginal |
| Cyberpunk | chrome | netrunning | No | 0% (player chrome too low) | Dead |
| Detective | grit | grit | **YES** | 0% (always cancels) | **Structurally impossible** |
| Fantasy | vigor | will | No | 10% (crypt warden vs player) | Visible |
| Gladiator | might | showmanship | No | 15% (war beast vs player, player vs war beast) | **Best world** |
| Pirate | brawn | sea-legs | No | 0% (stats too balanced) | Dead |
| Ronin | discipline | composure | No | 5% (shadow assassin only) | Marginal |
| Vampire | vitality | presence | No | 10% (player vs feral thrall) | Visible |
| Weird West | grit | grit | **YES** | 0% (always cancels) | **Structurally impossible** |
| Zombie | fitness | nerve | No | 5% (bloater only, zombies have nerve=10) | Marginal |

**Key problems:**
1. **Two worlds map attack and resolve to the same stat** (Detective: grit/grit, Weird West: grit/grit). Breakthrough is mathematically impossible regardless of entity stats.
2. **Three more worlds** have stats too balanced or resolve too high for breakthrough to fire.
3. Only **Gladiator** shows meaningful breakthrough rates (15%), and only in brute/beast matchups.
4. **Fantasy** — the one world using the canonical vigor/instinct/will — shows 10% in the crypt warden fight, which is decent but not dramatic.

**Verdict:** Guard breakthrough is a mechanic that only 2 of 10 worlds exercise meaningfully. The same-stat mapping issue (Detective, Weird West) is a design bug — if attack and resolve are the same stat, the dimension system collapses for that axis.

**Recommendation:**
- Fix Detective and Weird West stat mappings so attack ≠ resolve
- Ensure at least 1 enemy per world has attack stat > defender resolve + 4 (for 10%+ breakthrough)
- Consider lowering the threshold from `vigor - resolve - 2` to `vigor - resolve - 1`

---

## Engagement System Coverage

### Feature Configuration

| World | backlineTags | protectorTags | chokepointTag | ambushTag |
|-------|-------------|---------------|---------------|-----------|
| Colony | none | none | none | none |
| Cyberpunk | ranged, caster, netrunner | none | none | none |
| Detective | none | none | none | none |
| Fantasy | none | none | none | none |
| Gladiator | none | none | none | none |
| Pirate | none | none | none | none |
| Ronin | none | bodyguard, samurai | none | none |
| Vampire | ranged, caster, thrall | none | none | none |
| Weird West | none | none | none | none |
| Zombie | none | none | none | none |

**Only 3 of 10 worlds configure any engagement features beyond the base module.**
- BACKLINE: 2 worlds (Cyberpunk, Vampire)
- PROTECTED: 1 world (Ronin)
- Chokepoint: 0 worlds
- Ambush: 0 worlds

**ENGAGED and ISOLATED still fire universally** (on hit contact and ally defeat), but BACKLINE and PROTECTED require tag configuration that most worlds skip.

---

## Interception Coverage

Interception requires same-type allies in the same zone during combat.

| World | Structural Interception Setup | Notes |
|-------|------------------------------|-------|
| Colony | Weak | Chief Okafor (NPC) at perimeter-fence with drone, but NPC type mismatch |
| Cyberpunk | Recruitment-dependent | Kira/Rez recruitable but start in non-combat zones |
| Detective | Weak | Constable Pike at crime-scene (no enemies there) |
| Fantasy | Recruitment-dependent | Brother Aldric / Sister Maren recruitable |
| Gladiator | Recruitment-dependent | Nerva recruitable fighter |
| Pirate | Moderate | Quartermaster Bly on ship-deck with boarding marine |
| Ronin | **Strong** | Castle guard (role:bodyguard) at castle-gate with corrupt samurai + boss |
| Vampire | Recruitment-dependent | Duchess / Elara recruitable |
| Weird West | Weak | No companions in combat zones |
| Zombie | Weak | NPCs in safehouse (safe zone), enemies elsewhere |

**Only Ronin has interception structurally guaranteed** from the start (bodyguard guard in the same zone as enemies). All other worlds require the player to recruit companions and bring them to combat zones — which is player-driven, not world-authored.

**Verdict:** Interception is a late-game mechanic for 9 of 10 worlds. New players will likely never see it in their first encounters.

---

## Role Distribution

| Role | Colony | Cyber | Det | Fan | Glad | Pirate | Ronin | Vamp | WW | Zombie | Total |
|------|--------|-------|-----|-----|------|--------|-------|------|-----|--------|-------|
| boss | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 10 |
| brute | - | - | 1 | 1 | 1 | 1 | - | - | - | - | 4 |
| skirmisher | - | 1 | - | 1 | - | 1 | 1 | - | 1 | 1 | 6 |
| elite | - | - | - | - | 1 | - | - | 1 | 1 | - | 3 |
| bodyguard | 1 | 1 | - | - | - | - | 1 | - | - | - | 3 |
| minion | 1 | - | 1 | - | - | - | - | 1 | - | 1 | 4 |
| sentinel | - | - | - | - | - | - | - | - | - | - | 0 |
| coward | - | - | - | - | - | - | - | - | - | - | 0 |
| backliner | - | - | - | - | - | - | - | - | - | - | 0 |

**Unused roles:** sentinel (0), coward (0), backliner (0). These exist in the role template system but no starter world uses them.

**Under-represented:** bodyguard (3 worlds), elite (3 worlds). Bodyguard is key to the interception/protection narrative but only appears in Colony, Cyberpunk, and Ronin.

---

## Pack Bias Diversity

| World | Biases | Count |
|-------|--------|-------|
| Colony | drone, alien | 2 |
| Cyberpunk | ice-agent | 1 |
| Detective | criminal | 1 |
| Fantasy | undead | 1 |
| Gladiator | feral, beast | 2 |
| Pirate | pirate, colonial, beast | 3 |
| Ronin | assassin, samurai | 2 |
| Vampire | vampire, feral, hunter | 3 |
| Weird West | undead, spirit, beast | 3 |
| Zombie | zombie, undead | 2 |

Worlds with only 1 bias (Cyberpunk, Detective, Fantasy) will have the most homogeneous AI behavior. Enemies in these worlds all fight the same way.

---

## World-by-World Combat Identity

### 1. Colony — Signal Loss

**Signature feel:** Power management under alien pressure. Brace generates power, attacks spend it for bonus damage.

**Stat mapping:** engineering/awareness/command (attack/precision/resolve)

**Pillar expression:**
| Pillar | Expression | Notes |
|--------|-----------|-------|
| Guard | Occasional | Default guard works; command-scaled reduction |
| Brace | Central | Brace generates +3 power; AI boosts brace when power < 15 |
| Engagement | Rare | No backline/protector/chokepoint tags configured |
| Interception | Rare | Bodyguard drone exists but interception requires same-type allies |
| Dimensions | Occasional | Different stats (eng/aware/cmd) but breakthrough marginal (5%) |
| AI Tactics | Occasional | 2 biases (drone, alien); morale drain drives disengage |
| Morale/Defeat | Central | Morale is both cognition and spendable resource; ally defeat -5 morale |

**Combat identity:** Resource-pressure fights where power management is the core decision. Brace to generate, attack to spend. Morale collapse possible through sustained damage + hazards.

**Gaps:** Engagement barely matters. Interception unlikely without recruitment. No chokepoints despite tunnel-appropriate zones.

---

### 2. Cyberpunk — Neon Lockbox

**Signature feel:** Bandwidth economy + netrunning. Reposition is the power move (spend bandwidth for +15 bonus).

**Stat mapping:** chrome/reflex/netrunning (attack/precision/resolve)

**Pillar expression:**
| Pillar | Expression | Notes |
|--------|-----------|-------|
| Guard | Occasional | Default guard; netrunning-scaled reduction |
| Brace | Occasional | Brace generates +2 bandwidth; AI boosts when bandwidth < 10 |
| Engagement | Occasional | backlineTags configured (ranged, caster, netrunner); BACKLINE can fire |
| Interception | Rare | ICE Sentry is bodyguard but starts in different zone from player |
| Dimensions | Absent | Breakthrough 0% (chrome too low vs netrunning); no asymmetric matchups |
| AI Tactics | Rare | Only 1 bias (ice-agent); low diversity |
| Morale/Defeat | Occasional | Standard cognition morale; no morale resource |

**Combat identity:** Bandwidth as tactical currency. Reposition dominates because +15 bonus is the biggest spend payoff. BACKLINE gives netrunner entities positional texture.

**Gaps:** Breakthrough impossible. Only 1 pack bias = homogeneous AI. Interception requires recruitment. Physical combat is secondary to the netrunning theme.

---

### 3. Detective — Gaslight Detective

**Signature feel:** Composure as combat resilience. Guards and braces restore composure; damage drains it. When composure drops, AI disengages.

**Stat mapping:** grit/perception/grit (attack/precision/resolve — **attack = resolve**)

**Pillar expression:**
| Pillar | Expression | Notes |
|--------|-----------|-------|
| Guard | Central | Guard absorb +2 composure AND resist OFF_BALANCE 70%. Guard is the best defensive action. |
| Brace | Occasional | Brace +1 composure; less valuable than guard |
| Engagement | Absent | No backline/protector/chokepoint tags |
| Interception | Absent | No companions in combat zones, no bodyguards |
| Dimensions | **Broken** | Attack = resolve = grit. Breakthrough impossible. Guard reduction and counter both scale the same way. |
| AI Tactics | Rare | 1 bias (criminal); AI disengages when composure < 10 |
| Morale/Defeat | Occasional | Standard morale + composure drain overlap |

**Combat identity:** Social resilience under pressure. Composure is the real HP — lose it and you fall apart. Guard is king because it both absorbs and restores composure.

**Gaps:** **Dimensions are collapsed.** Attack = resolve means guard breakthrough, guard counter, and the precision/force distinction all degenerate. This world has a 2-dimensional stat system pretending to be 3-dimensional. Engagement and interception are both absent. Only 1 pack bias.

**Design question:** Is this intentional? Detective combat is meant to be simpler/social. But the dimension collapse means the world actively contradicts the engine's 3-stat design. Either rename the resolve stat (eloquence would be better for resolve in a social world) or accept that Detective has a different combat feel.

---

### 4. Fantasy — The Chapel Threshold

**Signature feel:** Classic dungeon crawl with the canonical stat mapping. The simplest combat world — no resources, no tactics module.

**Stat mapping:** vigor/instinct/will (the engine's native mapping)

**Pillar expression:**
| Pillar | Expression | Notes |
|--------|-----------|-------|
| Guard | Central | Default guard with will-scaled reduction; no resource overlay |
| Brace | **Absent** | No createCombatTactics module; brace action doesn't exist |
| Engagement | Rare | Module registered but no backline/protector/chokepoint tags |
| Interception | Rare | Brother Aldric (healer) and Sister Maren (diplomat) are recruitable but start in non-combat zones |
| Dimensions | Central | Only world using native vigor/instinct/will. Breakthrough 10% in crypt warden fight. |
| AI Tactics | Occasional | 1 bias (undead); basic but functional |
| Morale/Defeat | Occasional | Standard morale; undead may have different morale profiles |

**Combat identity:** The reference implementation. What combat feels like with just the core pillars. Guard + attack + disengage, with dimension differences visible in the crypt warden fight.

**Onboarding value:** YES — this world correctly demonstrates the base combat loop without overwhelming with resources and tactical actions. A player who masters Fantasy combat understands the foundation.

**Gaps:** No brace or reposition means the tactical triangle doesn't exist here. Engagement is registered but unconfigured. This is acceptable if Fantasy is positioned as "combat 101."

---

### 5. Gladiator — Iron Colosseum

**Signature feel:** Spectacle-driven combat. Crowd-favor is earned by hitting and defeating enemies, spent for damage and guard bonuses. The crowd is a resource.

**Stat mapping:** might/agility/showmanship (attack/precision/resolve)

**Pillar expression:**
| Pillar | Expression | Notes |
|--------|-----------|-------|
| Guard | Central | Guard spends 15 crowd-favor for +0.15 bonus; high cost, high reward |
| Brace | Occasional | AI boosts brace when crowd-favor < 20 (play safe when crowd is cold) |
| Engagement | Rare | No tags configured; arena is "open" but no positional texture |
| Interception | Rare | Nerva (fighter companion) recruitable but starts in holding-cells |
| Dimensions | **Best world** | Breakthrough 15% (war beast might=8 vs player showmanship=4). Asymmetric stats make dimensions visible. |
| AI Tactics | Occasional | 2 biases (feral, beast); beast AI is aggressive |
| Morale/Defeat | Occasional | Standard morale; crowd-favor creates secondary pressure |

**Combat identity:** The most combat-forward world. Arena fights with spectacle economy. Crowd-favor creates a risk/reward loop: attack to build favor, spend favor to amplify. War beast is the best breakthrough demonstration in any world.

**Gaps:** Engagement is wasted — an arena should have positional zones (center, edges, gates). No chokepoints despite tunnel-exit zone. Interception requires companion recruitment.

---

### 6. Pirate — Black Flag Requiem

**Signature feel:** Morale-driven combat. Morale is both the cognition system's internal state AND a spendable resource. Winning fuels aggression, losing triggers retreat.

**Stat mapping:** brawn/cunning/sea-legs (attack/precision/resolve)

**Pillar expression:**
| Pillar | Expression | Notes |
|--------|-----------|-------|
| Guard | Occasional | Standard guard; no resource overlay for guard |
| Brace | Occasional | No special brace resource interaction |
| Engagement | Rare | No tags configured; ship zones have no positional texture |
| Interception | Moderate | Quartermaster Bly starts on ship-deck with boarding marine; interception possible early |
| Dimensions | Dead | Breakthrough 0%; stats too balanced (brawn=5/cunning=6/sea-legs=5 for player) |
| AI Tactics | Central | 3 biases (pirate, colonial, beast); most diverse bias set with some other worlds |
| Morale/Defeat | Central | Morale is the core resource. Attack hit +2 morale, defeat +3 morale. Take damage -3 morale. Morale > 60 → AI boosts attack/pressure. Morale < 20 → AI disengages. |

**Combat identity:** Momentum-based fighting. Win and your morale fuels more aggression. Lose and your crew falls apart. The morale-as-resource double-counting with cognition morale creates a strong feedback loop.

**Gaps:** Dimensions are dead. Engagement unused despite ship-deck being a natural frontline. No chokepoints despite ship corridors.

---

### 7. Ronin — Jade Veil

**Signature feel:** Disciplined martial combat with ki economy and honor stakes. Ki fuels repositioning and empowers attacks. Honor is at risk.

**Stat mapping:** discipline/perception/composure (attack/precision/resolve)

**Pillar expression:**
| Pillar | Expression | Notes |
|--------|-----------|-------|
| Guard | Central | Guard spends ki for 80% OFF_BALANCE resist — the best guard in any world |
| Brace | Central | Brace generates +2 ki; AI boosts brace/guard when ki < 5 |
| Engagement | Occasional | protectorTags configured (bodyguard, samurai); PROTECTED fires for castle guard |
| Interception | **Central** | Castle guard (role:bodyguard) at castle-gate with corrupt samurai. The only world where interception is guaranteed from the start. |
| Dimensions | Marginal | Breakthrough 5% (shadow assassin only); stats mostly balanced |
| AI Tactics | Central | 2 biases (assassin, samurai); distinct tactical identities |
| Morale/Defeat | Occasional | Standard morale; honor drain on disengage fail creates stakes |

**Combat identity:** The most complete combat world. All six pillars are expressed. Ki economy rewards patience (brace to build ki, then spend on empowered actions). Castle guard demonstrates interception and protection. Assassin vs samurai bias contrast shows AI diversity.

**Gaps:** Dimensions are marginal (only 5% breakthrough). No chokepoints despite the hidden passage being a natural narrow space.

---

### 8. Vampire — Crimson Court

**Signature feel:** Predatory combat with bloodlust economy. Attacking generates bloodlust, which can be spent for massive damage. Killing costs humanity.

**Stat mapping:** vitality/cunning/presence (attack/precision/resolve)

**Pillar expression:**
| Pillar | Expression | Notes |
|--------|-----------|-------|
| Guard | Occasional | Standard guard; humanity-low AI suppresses guard (-10) |
| Brace | Occasional | No special brace interaction |
| Engagement | Occasional | backlineTags configured (ranged, caster, thrall); BACKLINE fires for thralls |
| Interception | Rare | Companions recruitable but not in combat zones initially |
| Dimensions | Marginal | Breakthrough 5-10% in select matchups (feral thrall vitality=7 vs player presence=4) |
| AI Tactics | Central | 3 biases (vampire, feral, hunter); most diverse tactical landscape |
| Morale/Defeat | Occasional | Humanity drain on kill creates moral pressure |

**Combat identity:** Escalation loop. Attack → gain bloodlust → spend for +4 damage → kill → gain more bloodlust BUT lose humanity. Low humanity makes AI stop guarding and stop disengaging — they become pure predators. The bloodlust/humanity tension is the real combat identity.

**Gaps:** Interception requires recruitment. Guard has no special interaction with the bloodlust theme.

---

### 9. Weird West — Dust Devil's Bargain

**Signature feel:** Corruption pressure. Taking damage gains dust (corruption); spending resolve (determination) empowers actions. Dust accumulation is the ticking clock.

**Stat mapping:** grit/draw-speed/grit (attack/precision/resolve — **attack = resolve**)

**Pillar expression:**
| Pillar | Expression | Notes |
|--------|-----------|-------|
| Guard | Occasional | Standard guard; grit-scaled |
| Brace | Occasional | Brace spends resolve for +0.10 guard bonus and 60% OFF_BALANCE resist |
| Engagement | Absent | No tags configured |
| Interception | Absent | No companions in combat zones |
| Dimensions | **Broken** | Attack = resolve = grit. Same issue as Detective. Breakthrough impossible. |
| AI Tactics | Occasional | 3 biases (undead, spirit, beast); dust > 60 → AI disengages |
| Morale/Defeat | Occasional | Standard morale; dust/resolve creates secondary pressure |

**Combat identity:** Attrition under supernatural pressure. Dust accumulates as you take hits, representing corruption. Resolve drains as you fight. The world wants combat to feel desperate — you're spending your determination to survive while corruption grows.

**Gaps:** **Same dimension collapse as Detective.** Grit maps to both attack and resolve. The precision/force distinction degenerates. Engagement and interception are both absent.

---

### 10. Zombie — Ashfall Dead

**Signature feel:** Survival horror with infection as consequence. Taking damage gains infection. No resource spends — infection is pure threat.

**Stat mapping:** fitness/wits/nerve (attack/precision/resolve)

**Pillar expression:**
| Pillar | Expression | Notes |
|--------|-----------|-------|
| Guard | Occasional | Standard guard; nerve-scaled |
| Brace | Occasional | Standard brace; no resource interaction |
| Engagement | Rare | No tags configured |
| Interception | Absent | NPCs in safehouse, enemies elsewhere |
| Dimensions | Marginal | Zombies have nerve=10 (undead fearlessness); only bloater fitness=8 vs player nerve=5 = 5% breakthrough |
| AI Tactics | Occasional | 2 biases (zombie, undead); infection > 70 → AI boosts attack |
| Morale/Defeat | Occasional | Zombies have nerve=10 so they never flee; standard player morale |

**Combat identity:** Survival horror attrition. Infection is the real threat — every hit accumulates it. Combat resources have no spends (infection is consequence-only), so the economy is purely punitive. Zombies never flee (nerve=10 = near-max will mitigation).

**Gaps:** Engagement, interception, and dimensions barely matter. This world is intentionally simple — combat is about surviving, not tactical mastery. But the simplicity means 4 of 6 pillars are effectively absent.

---

## Pillar Expression Summary

| Pillar | Central | Occasional | Rare | Absent/Broken |
|--------|---------|-----------|------|---------------|
| **Guard** | Colony, Detective, Fantasy, Gladiator, Ronin | Cyberpunk, Pirate, Vampire, Weird West, Zombie | — | — |
| **Brace** | Colony, Ronin | Cyberpunk, Detective, Gladiator, Pirate, Vampire, Weird West, Zombie | — | Fantasy (no module) |
| **Engagement** | — | Cyberpunk, Ronin, Vampire | Colony, Fantasy, Gladiator, Pirate, Weird West, Zombie | Detective (no tags) |
| **Interception** | Ronin | — | Colony, Cyberpunk, Detective, Fantasy, Gladiator, Pirate, Vampire, Zombie | Weird West |
| **Dimensions** | Fantasy, Gladiator | Colony, Vampire | Ronin, Zombie | **Cyberpunk, Detective, Pirate, Weird West** (0% or broken) |
| **AI Tactics** | Pirate, Ronin, Vampire | Colony, Cyberpunk, Gladiator, Weird West, Zombie | Detective, Fantasy | — |
| **Morale/Defeat** | Colony, Pirate | All others | — | — |

### Pillar Health Scorecard

| Pillar | Worlds Central+Occasional | Health |
|--------|--------------------------|--------|
| Guard | 10/10 | Healthy |
| Brace | 8/10 | Healthy (Fantasy intentional) |
| Engagement | 3/10 | **Underexercised** |
| Interception | 1/10 | **Severely underexercised** |
| Dimensions | 4/10 | **Half the worlds are broken or dead** |
| AI Tactics | 8/10 | Healthy |
| Morale/Defeat | 10/10 | Healthy |

---

## Mechanic Coverage Grid

This grid shows whether each combat mechanic can actually fire in each world, based on zone tags, entity stats, and configuration.

| Mechanic | Col | Cyb | Det | Fan | Glad | Pir | Ron | Vamp | WW | Zom | Coverage |
|----------|-----|-----|-----|-----|------|-----|-----|------|----|-----|----------|
| Guard action | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | 10/10 |
| Guard counter | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | 10/10 |
| Guard breakthrough | 5% | 0% | **0%** | 10% | 15% | 0% | 5% | 10% | **0%** | 5% | 5/10 meaningful |
| Brace action | yes | yes | yes | no | yes | yes | yes | yes | yes | yes | 9/10 |
| Brace OFF_BALANCE resist | yes | yes | yes | no | yes | yes | yes | yes | yes | yes | 9/10 |
| Reposition action | yes | yes | yes | no | yes | yes | yes | yes | yes | yes | 9/10 |
| Reposition outflank | yes | yes | yes | no | yes | yes | yes | yes | yes | yes | 9/10 |
| ENGAGED state | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | 10/10 |
| BACKLINE state | no | yes | no | no | no | no | no | yes | no | no | 2/10 |
| PROTECTED state | no | no | no | no | no | no | yes | no | no | no | 1/10 |
| ISOLATED state | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | 10/10 |
| Chokepoint effects | no | no | no | no | no | no | no | no | no | no | **0/10** |
| Ambush entry | no | no | no | no | no | no | no | no | no | no | **0/10** |
| Interception (structural) | no | no | no | no | no | maybe | yes | no | no | no | 1-2/10 |
| Morale cascade | yes | yes | yes | yes | yes | yes | yes | yes | yes | partial | 10/10 |
| FLEEING from morale | yes | yes | yes | yes | yes | yes | yes | yes | yes | no* | 9/10 |

*Zombies have nerve=10, making morale collapse extremely unlikely.

---

## Detective & Cyberpunk Assessment

### Detective
**Does it need a stronger physical combat showcase?**

No. Detective's combat is intentionally social/composure-based. The back-alley encounter (dock thug + hired muscle + crime boss) is a reasonable physical fight.

**What it DOES need:** Fix the dimension collapse. Mapping both attack and resolve to `grit` is a bug, not a feature. `eloquence` or `perception` would be better for resolve in a social-investigation world. This would restore the three-stat dimension and make breakthrough/counter meaningful.

### Cyberpunk
**Does it need a stronger physical combat showcase?**

Not urgently. The chrome/reflex/netrunning mapping is thematically correct. Combat is secondary to netrunning.

**What it needs:** At least one entity with chrome significantly higher than the player's netrunning to demonstrate breakthrough. Currently no entity creates a meaningful asymmetry.

---

## Fantasy Onboarding Assessment

**Is Fantasy's reduced complexity doing useful onboarding work?**

YES. Fantasy is the only world using the native vigor/instinct/will mapping, and it's the only world where the dimension system works as designed (breakthrough at 10% in the right matchup). By excluding brace, reposition, and resources, it lets players learn the core combat loop (attack/guard/disengage) and the three-stat dimension before adding complexity.

**Recommendation:** Keep Fantasy simple. It's the tutorial world. Add a handbook note explaining that Fantasy intentionally omits tactical actions to serve as combat onboarding.

---

## Split Backlog

### Content Fixes (World Changes)

| # | Fix | Worlds | Priority |
|---|-----|--------|----------|
| C1 | Fix Detective stat mapping: change resolve from 'grit' to 'eloquence' or 'perception' | Detective | High |
| C2 | Fix Weird West stat mapping: change resolve from 'grit' to 'lore' | Weird West | High |
| C3 | Add chokepoint tag to 2-3 zones where narratively appropriate | Colony (alien-cavern), Fantasy (vestry-door), Ronin (hidden-passage) | Medium |
| C4 | Add backlineTags to 2-3 more worlds | Ronin (ranged), Zombie (ranged), Colony (ranged) | Medium |
| C5 | Add at least 1 high-attack enemy to Cyberpunk and Pirate for breakthrough visibility | Cyberpunk, Pirate | Low |
| C6 | Add protectorTags to Colony (bodyguard drone) and Cyberpunk (ICE sentry) | Colony, Cyberpunk | Low |
| C7 | Consider adding a bodyguard-role entity to Gladiator (veteran gladiator protecting player) | Gladiator | Low |
| C8 | Consider adding ambush_entry tag to appropriate zones | Fantasy (crypt-chamber), Vampire (wine-cellar), Zombie (hospital-wing) | Low |

### Tuning Fixes

| # | Fix | Priority |
|---|-----|----------|
| T1 | Lower guard breakthrough threshold from `attack - resolve - 2` to `attack - resolve - 1` | Medium |
| T2 | Consider adding a 2nd pack bias to Detective, Fantasy, Cyberpunk (1-bias worlds) | Low |

### Doc Fixes

| # | Fix | Priority |
|---|-----|----------|
| D1 | Document Fantasy as intentional "combat 101" onboarding world | Medium |
| D2 | Document chokepoints and ambush as extension points for pack authors | Medium |
| D3 | Add world combat identity descriptions to each world's README or handbook | Low |

### Acceptable Intentional Variance

| Item | Worlds | Reasoning |
|------|--------|-----------|
| Fantasy lacks brace/reposition | Fantasy | Onboarding simplicity |
| Zombie morale rarely fires | Zombie | Undead don't flee (nerve=10) — thematically correct |
| Zombie has no resource spends | Zombie | Infection is consequence-only — horror genre fit |
| Detective combat is secondary | Detective | Investigation world; combat is rare and composure-driven |
| Interception requires recruitment | Most worlds | Player agency — choose to bring companions to fights |

---

## Conclusion

**The engine is sound. The worlds are under-expressing it.**

Guard and morale work everywhere. Brace works in 9 of 10. AI tactics work in 8 of 10. But:

- **Engagement** (BACKLINE, PROTECTED, chokepoint, ambush) is the most underexercised pillar. Only 3 of 10 worlds configure any positional features beyond the base ENGAGED/ISOLATED states. Chokepoints and ambush are completely unused.

- **Interception** is structurally guaranteed in only 1 world (Ronin). All others require player-driven companion recruitment. The companion protection system — one of the most emotionally resonant mechanics — is nearly invisible in starter content.

- **Dimensions** are broken in 2 worlds (Detective, Weird West) due to attack=resolve stat mapping, and dead in 3 more (Cyberpunk, Pirate, Zombie) due to balanced stats. Guard breakthrough — the signature dimension mechanic — fires meaningfully in only 2 of 10 worlds.

The two highest-leverage fixes are:
1. **Fix the two broken stat mappings** (C1, C2) — restores dimensional combat in 20% of the starter set
2. **Add chokepoint tags** (C3) — activates a complete subsystem that currently has zero coverage

After that, adding backlineTags and protectorTags to more worlds (C4, C6) would bring engagement from 3/10 to 5-6/10 expression, which is coverage without uniformity.
