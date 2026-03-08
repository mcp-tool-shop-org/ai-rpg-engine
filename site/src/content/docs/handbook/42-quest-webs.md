# Chapter 42 — Quest Webs & Emergent Opportunities

The simulation creates rich conditions — pressure, scarcity, faction goals, NPC obligations, district drift, companion dynamics. Quest Webs turn those conditions into structured things the player can intentionally pursue: contracts, bounties, favors, supply runs, investigations, escorts, recovery missions, and faction jobs.

These are not authored quest trees. The world offers work because it needs things. An NPC with a bargain goal and favorable trust offers a contract. A district in supply crisis spawns a supply run. A faction under pressure posts a bounty. Every opportunity traces back to a specific world condition.

---

## Opportunity Kinds

| Kind | Trigger | Example |
|------|---------|---------|
| `contract` | NPC bargain goal + favorable trust | "Deliver this shipment to the docks" |
| `favor-request` | NPC obligation (player owes NPC) | "You owe me — handle this quietly" |
| `bounty` | Bounty-issued pressure | "Bring in the deserter" |
| `supply-run` | District supply < 20 | "The clinic needs medicine" |
| `recovery` | District instability > 60 | "Restore order to the market quarter" |
| `escort` | Companion personal goal | "Help me reach the shrine" |
| `investigation` | District instability > 60 | "Find who's been poisoning the well" |
| `faction-job` | Allied faction + low alert | "The guild needs a representative at the summit" |

All 8 kinds work in every genre. Genre flavor comes from tags, not separate kinds.

---

## Opportunity Lifecycle

```
[available] → accept → [accepted] → complete/fail/abandon/betray → [resolved]
     ↓                       ↓
  decline              timer expires
     ↓                       ↓
 [declined]              [expired]
```

### States

| Status | Description |
|--------|-------------|
| `available` | Offered to the player, can be accepted or declined |
| `accepted` | Player committed, timer counting down |
| `completed` | Successfully resolved |
| `failed` | Attempted but failed |
| `expired` | Timer ran out |
| `declined` | Player chose not to take it |
| `abandoned` | Player walked away after accepting |
| `betrayed` | Player turned against the quest-giver |

---

## Visibility

Opportunities have a visibility progression:

| Level | Meaning |
|-------|---------|
| `hidden` | Exists in the simulation but not yet surfaced |
| `rumored` | Player may have heard whispers |
| `known` | Player knows about it but hasn't been offered |
| `offered` | Directly offered, can be accepted |

Visibility escalates over turns. Hidden opportunities become rumored, then known, then offered. NPC-spawned opportunities start at `offered`.

---

## Evaluation

Every 3 ticks, the engine evaluates whether a new opportunity should spawn. Seven independent rules generate candidates:

| Rule | Source | Output |
|------|--------|--------|
| Scarcity | District supply < 20 | supply-run |
| NPC goals | NPC bargain/recruit + favorable trust | contract, favor-request |
| Obligations | Player-owes-NPC, magnitude >= 4 | favor-request |
| Pressure-linked | Active bounty/supply-crisis/summons | bounty, supply-run, faction-job |
| Faction | Allied faction + alertLevel < 50 | faction-job |
| Companion | Companion with personalGoal set | favor-request (personal-ask tag) |
| District | Instability > 60 | recovery, investigation |

### Scoring

Each candidate is scored:

```
score = (urgency × 0.3 + feasibility × 0.25 + reward × 0.25 + relevance × 0.2) × 100
```

The highest-scoring candidate spawns. Ties broken by urgency.

### Guards

- **Capacity:** Max 5 active opportunities at once
- **Interval:** Min 3 turns between spawns
- **Evaluation window:** Only runs when `tick % 3 === 0`

---

## Rewards & Risks

### Rewards (discriminated union, 7 variants)

| Type | Fields | Example |
|------|--------|---------|
| `reputation` | factionId, delta | +10 with Merchant Guild |
| `leverage` | currency, delta | +3 influence |
| `materials` | category, amount | +5 medicine |
| `economy-shift` | districtId, category, delta | Components +15 in docks |
| `obligation` | npcId, direction, kind, magnitude | NPC owes player a favor |
| `item` | itemId, description | Unique reward item |
| `rumor` | claim, valence | Positive rumor about the player |

### Risks (discriminated union, 5 variants)

| Type | Fields | Example |
|------|--------|---------|
| `heat` | delta | +10 heat |
| `reputation` | factionId, delta | -5 with rival faction |
| `alert` | factionId, delta | +15 alert on local faction |
| `combat` | difficulty, description | Ambush during delivery |
| `obligation` | npcId, direction, kind, magnitude | Player owes NPC on failure |

---

## Fallout

Resolution produces typed `OpportunityFalloutEffect` effects — 14 variants mirroring the engine's effect vocabulary:

| Effect | Trigger |
|--------|---------|
| `reputation` | Most resolutions |
| `leverage` | Completed bounties, faction jobs |
| `materials` | Completed supply runs |
| `economy-shift` | Supply-run completion (supplies up) |
| `rumor` | Completion, abandonment, betrayal |
| `obligation` | Contract completion creates NPC-owes-player; failure escalates player-owes-NPC |
| `spawn-pressure` | Abandoned contract → investigation-opened; failed faction-job → faction-summons |
| `spawn-opportunity` | Completed contracts can chain into new opportunities |
| `heat` | Abandonment, betrayal |
| `alert` | Declined faction-jobs, betrayal |
| `npc-relationship` | Trust changes on completion/betrayal |
| `companion-morale` | Failed escort → morale hit |
| `milestone-tag` | Completed bounties and investigation |
| `title-trigger` | Completing enough contracts |

### Key Fallout Patterns

| Kind | Completed | Abandoned | Betrayed |
|------|-----------|-----------|----------|
| contract | +rep, +favor, positive rumor | -rep, negative rumor, +heat, investigation pressure | large -rep, fearsome rumor, heat spike, NPC revenge obligation |
| bounty | +rep, +blackmail, fearsome rumor, milestone | -rep | — |
| supply-run | +economy-shift, +rep, +legitimacy | mild -rep | — |
| faction-job | large +rep, +influence, faction rumor | -rep, +alert | large -rep, heat, spawn pressure |
| favor-request | obligation cleared, +trust | magnitude increases, -trust | — |
| escort | +trust, +companion-morale | — | -trust, -companion-morale |

---

## NPC Integration

NPCs become quest-givers through existing systems — no new NPC fields needed:

- **NPC with `bargain` goal + favorable trust** → offers contracts
- **NPC with `player-owes-npc` obligation (magnitude >= 4)** → requests favors
- **NPC `bargain` action from `npc-agency` tick** → can spawn `spawn-opportunity` effects

Quest-giver NPCs reference active opportunities in dialogue:
- Ask about progress
- Grow impatient near deadlines
- Express gratitude on completion
- React with anger or fear on abandonment/betrayal

---

## Pressure Integration

Bidirectional linkage between pressures and opportunities:

**Pressures → Opportunities:**
- `bounty-issued` → bounty opportunity
- `supply-crisis` → supply-run opportunity
- `faction-summons` → faction-job opportunity

**Opportunities → Pressures (on failure):**
- Abandoned contract → `investigation-opened` pressure
- Failed faction-job → `faction-summons` pressure

---

## Move Advisor

The move advisor detects available high-value opportunities as a `situation: 'opportunity'` state, boosting urgency for leverage actions that align with accepted opportunities.

---

## Strategic Map

The strategic map includes an `activeOpportunitySummary` section listing active and available opportunities by kind, source, and deadline.

---

## Narration

When opportunities are active, the narrator receives `opportunityContext` — a compact string describing the player's current commitments. System prompt rules:

- Active contracts create ambient awareness in narration
- NPC quest-givers subtly reference deadlines
- Completed contracts echo in the world

---

## Player Commands

### In-Game (freeform text)

| Input | Action |
|-------|--------|
| `accept job/contract/bounty/mission` | Accept an available opportunity |
| `decline job/contract/offer` | Decline an available opportunity |
| `abandon job/contract/mission` | Walk away from an accepted opportunity |
| `betray job/contract/client` | Turn against the quest-giver |
| `complete/deliver/turn in job/bounty` | Complete an accepted opportunity |

### Director Mode

| Command | Description |
|---------|-------------|
| `/jobs` | List available opportunities with kind, source, rewards, deadline |
| `/contracts` | Alias for `/jobs` |
| `/contract <id>` | Detailed view: description, objective, rewards, risks, linked pressures/NPCs |
| `/accepted` | List accepted opportunities with progress hints |

---

## Session Recap

The OPPORTUNITIES & CONTRACTS section appears in the session summary when opportunity activity occurred:

```
  ──────────────────────────────────────────────────────────────
  OPPORTUNITIES & CONTRACTS
  ──────────────────────────────────────────────────────────────

  accepted: Deliver Medicine — Supply run from Dr. Mora
  completed: Clear the Dock Rats — Bounty from Merchant Guild (+10 rep)
  expired: Guard the Shipment — Contract from harbor master
```

---

## Chronicle

Opportunity events are recorded in the campaign journal:

| Event | Significance |
|-------|-------------|
| `opportunity-accepted` | 0.4 |
| `opportunity-completed` | 0.7 |
| `opportunity-failed` | 0.6 |
| `opportunity-abandoned` | 0.5 |
| `opportunity-betrayed` | 0.7 |
| `opportunity-expired` | 0.3 |

---

## Design Decisions

1. **Opportunity state lives on GameSession** as `activeOpportunities: OpportunityState[]`, serialized to SavedSession. Not in `profile.custom` (too flat) or `world.quests` (that's authored-quest infrastructure). Follows the `partyState`, `districtEconomies`, `npcObligations` pattern.
2. **8 opportunity kinds, universal.** Genre flavor via tags, not separate kinds.
3. **Rewards use discriminated union** mirroring `FalloutEffect` / `LeverageEffect`.
4. **NPCs become quest-givers through existing goal system.** No new NPC fields.
5. **Scoring formula** follows move-advisor pattern.
6. **Max 5 active, evaluated every 3 turns.** Keeps cognitive load manageable.
7. **Bidirectional pressure linkage.** Pressures spawn opportunities; failed opportunities spawn pressures.
8. **Pure functions throughout** — all opportunity logic is deterministic, no LLM calls.
9. **~15 token narration budget** — opportunity context costs negligible tokens.
