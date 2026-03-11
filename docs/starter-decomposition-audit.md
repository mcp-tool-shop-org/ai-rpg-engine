# Starter Decomposition Audit

This audit decomposes each starter into engine composition layers so authors know what to borrow, what to replace, and what's demo-only glue.

Every starter follows the same internal structure. The differences are content and configuration — not architecture. That's the point: the engine is the product; starters are examples.

---

## Layer Definitions

| Layer | What It Contains | Reusable? |
|-------|-----------------|-----------|
| **Character / Playstyle** | Stat mapping, pack biases, resource profile, abilities | Yes — portable across worlds |
| **World / Setting** | Zones, districts, entities, dialogues, items | Yes — portable across playstyles |
| **Encounter Structure** | Boss definition, engagement config, encounter type | Yes — portable across worlds |
| **Demo-Only Glue** | Scripted event listeners, audio cues, presentation rules | No — specific to this example |

---

## Per-Starter Decomposition

### Fantasy — The Chapel Threshold

**Character / Playstyle**
- Stat mapping: `vigor / instinct / will`
- Resource profile: none (simplest combat wiring)
- Pack biases: `[undead]`
- Abilities: 3 (holy-smite, purify, divine-light)

**World / Setting**
- 7 entities (player, pilgrim, brotherAldric, sisterMaren, ashGhoul, cryptStalker, cryptWarden)
- 5 zones (chapel-entrance, crypt-chamber, undead-lair, sacred-ground, cursed-shrine)
- 1 dialogue tree, 7 items, 1 status definition

**Encounter Structure**
- Boss: crypt-warden (2 phases: enraged, desperate)
- Engagement: no backline/protector tags, no chokepoints

**Demo-Only Glue**
- `dialogue.ended` → grants healing-draught after specific dialogue
- `world.zone.entered` → audio cue on crypt entry
- `combat.entity.defeated` → victory audio stinger

**Best pattern to borrow:** Simplest possible combat wiring — no resource profile, no engagement roles. Good starting point for "hello world" games.

---

### Cyberpunk — Neon Lockbox

**Character / Playstyle**
- Stat mapping: `chrome / reflex / netrunning`
- Resource profile: bandwidth (single resource)
- Pack biases: `[ice-agent]`
- Abilities: 3 (ice-breaker-hack, debug-protocol, nano-repair)

**World / Setting**
- 6 entities (runner, fixer, rez, iceAgent, streetRunner, vaultOverseer)
- 3 zones (street-level, data-vault, network-core, black-market-alley, corporate-tower)
- 1 dialogue tree, 7 items, 1 status definition

**Encounter Structure**
- Boss: vault-overseer (2 phases: firewall-up, system-crash)
- Engagement: backline=[ranged, caster, netrunner], protectors=[bodyguard]

**Demo-Only Glue**
- `dialogue.ended` → grants ice-breaker after specific dialogue
- `world.zone.entered` → audio cue on vault entry

**Best pattern to borrow:** Full squad engagement config with backline/protector tags. Resource profile with AI bandwidth awareness.

---

### Detective — Gaslight Detective

**Character / Playstyle**
- Stat mapping: `grit / perception / eloquence`
- Resource profile: composure (single resource, defensive spending)
- Pack biases: `[criminal]`
- Abilities: 4 (deductive-strike, composure-shield, expose-weakness, clear-headed)

**World / Setting**
- 7 entities (inspector, widow, constable, thug, hiredMuscle, crimeBoss + 1 more)
- 5 zones (crime-scene, dockside, mansions, abandoned-warehouse, underground-tunnels)
- 1 dialogue tree, 7 items, 1 status definition

**Encounter Structure**
- Boss: crime-boss (2 phases: calculating, cornered)
- Engagement: no backline/protector tags

**Demo-Only Glue**
- `dialogue.ended` → grants smelling-salts
- `world.zone.entered` → audio cue on crime-scene entry
- `combat.entity.defeated` → victory audio

**Best pattern to borrow:** Defensive resource profile — composure is spent on guard/reposition to resist status effects, not on damage. Shows that resources don't have to be offensive.

---

### Pirate — Black Flag Requiem

**Character / Playstyle**
- Stat mapping: `brawn / cunning / sea-legs`
- Resource profile: morale (single resource, crew-centric)
- Pack biases: `[pirate, colonial, beast]`
- Abilities: 4 (broadside, dirty-fighting, sea-shanty, rum-courage)

**World / Setting**
- 7 entities (captain, quartermaster, cartographer, navySailor, seaBeast, drownedGuardian + 1)
- 5 zones (ship-deck, port-town, sunken-shrine, coral-graveyard, treasure-hold)
- 1 dialogue tree, 7 items, 1 status definition

**Encounter Structure**
- Boss: drowned-guardian (2 phases: rising-tide, abyssal-fury)
- Engagement: no backline/protector tags

**Demo-Only Glue**
- `dialogue.ended` → grants rum-barrel
- `world.zone.entered` → audio cue on shrine entry
- `combat.entity.defeated` → victory audio

**Best pattern to borrow:** Morale as a shared crew resource that rises with kills and falls with ally defeats. Shows resources as group narrative rather than individual currency.

---

### Zombie — Ashfall Dead

**Character / Playstyle**
- Stat mapping: `fitness / wits / nerve`
- Resource profile: infection (consequence-only — gained when taking damage, cannot be spent)
- Pack biases: `[zombie, undead]`
- Abilities: 4 (desperate-swing, field-triage, war-cry, survival-instinct)

**World / Setting**
- 7 entities (survivor, medic, scavenger, leader, shambler, runner, bloaterAlpha)
- 5 zones (safehouse-lobby, hospital-wing, underground-tunnels, rooftop, infested-marketplace)
- 1 dialogue tree, 7 items, 1 status definition

**Encounter Structure**
- Boss: bloater-alpha (2 phases: rupturing, death-throes)
- Engagement: no backline/protector tags

**Demo-Only Glue**
- `dialogue.ended` → grants antibiotics
- `world.zone.entered` → audio cue on hospital entry
- `combat.entity.defeated` → victory audio

**Best pattern to borrow:** Infection as a read-only resource — it accumulates as a consequence but can't be spent. Shows that resources can be purely punitive/narrative pressure rather than tactical currency.

---

### Weird West — Dust Devil's Bargain

**Character / Playstyle**
- Stat mapping: `grit / draw-speed / lore`
- Resource profile: dust (momentum) + resolve (willpower)
- Pack biases: `[undead, spirit, beast]`
- Abilities: 3 (dust-devil, frontier-grit, dead-eye-shot)

**World / Setting**
- 6 entities (drifter, bartender, sheriff, revenant, crawler, banditRider, mesaCrawler)
- 5 zones (crossroads, spirit-hollow, mesa-cliffs, ghost-town, saloon)
- 1 dialogue tree, 7 items, 1 status definition

**Encounter Structure**
- Boss: mesa-crawler (2 phases: feeding-frenzy, death-wail)
- Engagement: no backline/protector tags

**Demo-Only Glue**
- `dialogue.ended` → grants sage-bundle
- `world.zone.entered` → audio cue on spirit-hollow entry
- `combat.entity.defeated` → victory audio
- `defeat.fallout.triggered` → dust accumulation on fallout

**Best pattern to borrow:** The only starter using `buildCombatStack`. Shows the composition-friendly way to wire combat in 7 lines. Also demonstrates dual resources (momentum + willpower) with AI modifiers.

---

### Colony — Signal Loss

**Character / Playstyle**
- Stat mapping: `engineering / awareness / command`
- Resource profile: power + morale (dual resource, defensive)
- Pack biases: `[drone, alien]`
- Abilities: 4 (plasma-burst, emergency-protocol, system-override, reboot-systems)

**World / Setting**
- 6 entities (commander, scientist, security, drone, resonance, swarmLarva)
- 5 zones (command-module, alien-cavern, mining-sector, hydroponics, engineering-bay)
- 1 dialogue tree, 7 items, 1 status definition

**Encounter Structure**
- Boss: resonance-entity (2 phases: harmonic-shift, signal-overload)
- Engagement: backline=[ranged], protectors=[bodyguard]

**Demo-Only Glue**
- `dialogue.ended` → grants emergency-cell
- `world.zone.entered` → audio cue on alien-cavern entry
- `combat.entity.defeated` → victory audio + ally morale penalty on ally death

**Best pattern to borrow:** Squad engagement with ranged/bodyguard roles. Dual resource (power + morale) where power fuels abilities and morale tracks group cohesion. Also demonstrates environment-driven resource pressure.

---

### Vampire — Crimson Court

**Character / Playstyle**
- Stat mapping: `vitality / cunning / presence`
- Resource profile: bloodlust + humanity (opposing dual resources)
- Pack biases: `[vampire, feral, hunter]`
- Abilities: 4 (blood-drain, mesmerize, crimson-fury, blood-purge)

**World / Setting**
- 7 entities (player, duchessMorvaine, cassius, servantElara, witchHunter, feralThrall, elderVampire)
- 5 zones (grand-ballroom, wine-cellar, crypt-ossuary, shadow-garden, feeding-ground)
- 1 dialogue tree, 7 items, 2 status definitions (mesmerized, terrified)

**Encounter Structure**
- Boss: elder-vampire (2 phases: mesmerize, blood-frenzy)
- Engagement: backline=[ranged, caster, thrall], no protectors

**Demo-Only Glue**
- `dialogue.ended` → grants blood-vial
- `world.zone.entered` → audio cue on cellar entry
- `combat.entity.defeated` → victory audio
- `defeat.fallout.triggered` → humanity drain on any defeat

**Best pattern to borrow:** Opposing dual resources — bloodlust rises with kills (offensive reward) while humanity drains (moral cost). Shows that resources can create narrative tension, not just tactical economy. Also has 2 status definitions (most starters have 1).

---

### Gladiator — Iron Colosseum

**Character / Playstyle**
- Stat mapping: `might / agility / showmanship`
- Resource profile: crowd-favor + fatigue (public performance economy)
- Pack biases: `[feral, beast]`
- Abilities: 4 (crowd-cleave, rally-crowd, gladiators-challenge, iron-resolve)

**World / Setting**
- 7 entities (player, lanistaBrutus, dominaValeria, nerva, arenaChampion, warBeast, arenaOverlord)
- 5 zones (holding-cells, arena-floor, barracks, market-square, patron-chambers)
- 1 dialogue tree, 7 items, 1 status definition

**Encounter Structure**
- Boss: arena-overlord (3 phases: calls-reinforcements, berserker, desperate-last-stand)
- Engagement: no backline/protector tags

**Demo-Only Glue**
- `dialogue.ended` → grants patron-token
- `world.zone.entered` → audio cue on arena entry
- `combat.entity.defeated` → victory audio

**Best pattern to borrow:** Best guard-breakthrough expression (highest attack-resolve gap). 3-phase boss (only starter with more than 2). Crowd-favor as a public-facing resource that rewards flashy play — shows resources as narrative performance, not just survival.

---

### Ronin — Way of the Blade

**Character / Playstyle**
- Stat mapping: `discipline / perception / composure`
- Resource profile: ki + honor (dual resource, spiritual + social)
- Pack biases: `[assassin, samurai]`
- Abilities: 4 (iaijutsu-strike, inner-calm, blade-ward, centered-mind)

**World / Setting**
- 7 entities (player, lordTakeda, ladyHimiko, magistrateSato, shadowAssassin, corruptSamurai, castleGuard)
- 5 zones (castle-gate, hidden-passage, dojo-chamber, moon-garden, shadow-shrine)
- 1 dialogue tree, 7 items, 1 status definition

**Encounter Structure**
- Boss: corrupt-samurai (2 phases: fury-unleashed, final-stance)
- Engagement: backline=[ranged], protectors=[bodyguard, samurai]

**Demo-Only Glue**
- `dialogue.ended` → grants incense-kit
- `world.zone.entered` → audio cue on hidden-passage entry
- `combat.entity.defeated` → victory audio
- `defeat.fallout.triggered` → honor bonus on boss kill

**Best pattern to borrow:** Multiple protector roles (bodyguard + samurai). Ki as combat currency + honor as social/narrative currency — shows how dual resources can serve completely different game layers. Custom defeat-fallout hook that rewards boss kills with honor.

---

## Cross-Starter Matrix

| Starter | Attack / Precision / Resolve | Resources | Boss Phases | Abilities | buildCombatStack | Engagement Roles | Entities | Zones |
|---------|------------------------------|-----------|-------------|-----------|-----------------|-----------------|----------|-------|
| Fantasy | vigor / instinct / will | 0 | 2 | 3 | No | No | 7 | 5 |
| Cyberpunk | chrome / reflex / netrunning | 1 (bandwidth) | 2 | 3 | No | Yes (squad) | 6 | 5 |
| Detective | grit / perception / eloquence | 1 (composure) | 2 | 4 | No | No | 7 | 5 |
| Pirate | brawn / cunning / sea-legs | 1 (morale) | 2 | 4 | No | No | 7 | 5 |
| Zombie | fitness / wits / nerve | 1 (infection) | 2 | 4 | No | No | 7 | 5 |
| Weird West | grit / draw-speed / lore | 2 (dust, resolve) | 2 | 3 | **Yes** | No | 6 | 5 |
| Colony | engineering / awareness / command | 2 (power, morale) | 2 | 4 | No | Yes (squad) | 6 | 5 |
| Vampire | vitality / cunning / presence | 2 (bloodlust, humanity) | 2 | 4 | No | Partial (backline) | 7 | 5 |
| Gladiator | might / agility / showmanship | 2 (crowd-favor, fatigue) | **3** | 4 | No | No | 7 | 5 |
| Ronin | discipline / perception / composure | 2 (ki, honor) | 2 | 4 | No | Yes (multi-protector) | 7 | 5 |

---

## Borrowable Patterns Inventory

| If you want to learn... | Study this starter |
|-------------------------|--------------------|
| Simplest possible combat wiring | Fantasy |
| `buildCombatStack` usage (recommended pattern) | Weird West |
| Squad engagement with backline/protector roles | Cyberpunk, Colony, Ronin |
| Defensive resource spending (resist status effects) | Detective |
| Crew/group morale as shared resource | Pirate |
| Consequence-only resource (can't spend, only accumulates) | Zombie (infection) |
| Opposing dual resources (reward vs moral cost) | Vampire (bloodlust vs humanity) |
| Performance/audience-facing resource economy | Gladiator (crowd-favor) |
| Spiritual + social dual resources serving different layers | Ronin (ki + honor) |
| Multi-phase boss encounters (3+ phases) | Gladiator |
| Custom defeat-fallout hooks | Ronin (honor bonus), Vampire (humanity drain), Colony (morale penalty) |
| Environment-driven resource pressure | Colony |
| Multiple protector role types | Ronin (bodyguard + samurai) |

---

## Demo-Only Glue (Universal Pattern)

All 10 starters share identical glue structure — this is demo-specific, not engine architecture:

1. **`dialogue.ended`** → grants a signature item after a specific dialogue (e.g., healing-draught, ice-breaker, antibiotics)
2. **`world.zone.entered`** → plays an audio cue when entering a key zone
3. **`combat.entity.defeated`** → plays a victory audio stinger

Three starters add extra fallout hooks:
- Weird West: `defeat.fallout.triggered` → dust accumulation
- Vampire: `defeat.fallout.triggered` → humanity drain
- Ronin: `defeat.fallout.triggered` → honor bonus on boss kill
- Colony: `combat.entity.defeated` → ally morale penalty

These event listeners reference specific entity IDs, dialogue IDs, and zone IDs from their own content. They are not portable without also taking the content they reference.

---

## Cross-Reference

- Combat-specific analysis: [Starter World Audit](starter-world-audit.md)
- Formula analysis: [Combat Synthesis Audit](combat-synthesis-audit.md)
- Balance data: [Balance Pass](balance-pass.md)
- Composition workflow: [Composition Guide](handbook/57-composition-guide.md)
