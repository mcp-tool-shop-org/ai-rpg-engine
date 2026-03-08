# Chapter 37 — NPC Agency

> Part VII — Systems

Autonomous NPC behavior with loyalty breakpoints, goal derivation, obligation tracking, consequence chains, and relationship-aware leverage modifiers.

## Package

`@ai-rpg-engine/modules` — the NPC agency system lives in the modules package alongside combat, cognition, perception, factions, and rumors.

## Architecture

```
NPC Entity + Relationships + Obligations + World State
        ↓
  buildNpcProfile()
        ↓
  NpcProfile
  ├── breakpoint       (allied | favorable | wavering | hostile | compromised)
  ├── dominantAxis     (trust | fear | greed | loyalty)
  ├── leverageAngle    (compact tactical hint)
  ├── goals            (derived, priority-sorted, breakpoint-gated)
  ├── relationship     (trust, fear, greed, loyalty axes)
  ├── knownRumors      (what this NPC has heard about the player)
  └── underPressure    (whether a world pressure targets this NPC's faction)
```

## Loyalty Breakpoints

Five discrete states replace informal stance labels. Breakpoints are derived fresh each tick from the NPC's relationship axes and obligation ledger — no stored state.

| Breakpoint | Condition | Meaning |
|-----------|-----------|---------|
| **allied** | trust >= 60, loyalty >= 50, net obligations >= 0 | Reliable partner, will warn of danger |
| **favorable** | trust >= 30, fear < 40, greed < 50 | Open to deals, responds to respect |
| **compromised** | fear >= 70 OR (greed >= 70 AND trust < 20) | Acting under duress, may be leveraged |
| **hostile** | trust <= -30 OR (loyalty < 20 AND trust < 0) | Dangerous, expect retaliation |
| **wavering** | Default (none of the above) | Unpredictable, watch for shifts |

Rules are evaluated top-to-bottom; first match wins.

- `deriveLoyaltyBreakpoint(rel, obligations?, playerId?)` — returns `LoyaltyBreakpoint`
- `deriveDominantAxis(rel)` — returns the highest-magnitude relationship axis
- `deriveBestLeverageAngle(breakpoint)` — returns a compact tactical hint string

## Goal Derivation

`deriveNpcGoals()` generates priority-sorted goals from the NPC's relationship state, faction context, known rumors, and active pressures. Goals use the `NpcActionVerb` vocabulary: `warn`, `accuse`, `bargain`, `recruit`, `conceal`, `betray`, `flee`.

Breakpoints gate which goals are available:

| Breakpoint | Suppressed | Boosted |
|-----------|-----------|---------|
| allied | accuse, betray (priority = 0) | — |
| hostile | warn, recruit (priority = 0) | accuse (+0.1) |
| compromised | warn (-0.1) | conceal (+0.2) |
| favorable, wavering | No gating | No boosts |

## NPC Actions

`resolveNpcAction()` resolves a goal into concrete effects. Actions produce `NpcActionResult` with typed effects:

| Effect Type | What It Does |
|------------|-------------|
| `reputation` | Adjusts faction standing |
| `rumor` | Spawns or spreads a rumor |
| `alert` | Raises faction alert level |
| `pressure` | Attributes a world pressure to this NPC |
| `obligation` | Creates a debt between NPC and player |

`applyNpcEffects()` writes effects into the simulation state (profile reputation, rumor list, pressure attribution).

## Obligation Ledger

NPCs track mutual debts with the player through `NpcObligationLedger`.

```typescript
type NpcObligation = {
  id: string;
  kind: 'favor' | 'debt' | 'threat' | 'betrayal';
  direction: 'owed-to-player' | 'owed-by-player';
  magnitude: number;    // 1–5
  description: string;
  createdAtTick: number;
  resolvedAtTick?: number;
};
```

- `createObligation(kind, direction, magnitude, description, tick)` — create an obligation
- `addObligation(ledger, obligation)` — append to ledger
- `getNetObligationWeight(ledger, playerId)` — positive = NPC owes player, negative = player owes NPC
- `getUnresolvedObligations(ledger)` — active debts

Obligations influence breakpoint derivation (net weight factors into the `allied` threshold) and modify leverage costs.

## Relationship Modifiers

`computeRelationshipModifiers()` returns multipliers that scale leverage action outcomes based on the NPC's breakpoint, dominant axis, and obligation balance.

| Modifier | Range | What It Scales |
|---------|-------|---------------|
| `costMultiplier` | 0.5–2.0 | Leverage action costs |
| `reputationMultiplier` | 0.5–2.0 | Reputation deltas from actions |
| `rumorHeatMultiplier` | 0.5–2.0 | Rumor confidence on creation |
| `sideEffectChance` | 0–1 | Chance of bonus/penalty effect |

Base values by breakpoint:

| Breakpoint | Cost | Rep | Heat | Side Effect |
|-----------|------|-----|------|------------|
| allied | 0.7 | 1.3 | 0.6 | 0.05 |
| favorable | 0.85 | 1.15 | 0.8 | 0.1 |
| wavering | 1.0 | 1.0 | 1.0 | 0.15 |
| hostile | 1.4 | 0.7 | 1.4 | 0.3 |
| compromised | 1.2 | 0.8 | 1.2 | 0.25 |

Axis and obligation overrides apply additively before clamping.

## Consequence Chains

When an NPC's breakpoint shifts dramatically (e.g. favorable to hostile), they may initiate a structured consequence chain — a 2-3 step delayed retaliation or spiral. Max 1 active chain per NPC per session.

```typescript
type ConsequenceChain = {
  id: string;
  npcId: string;
  kind: ConsequenceKind;
  trigger: string;
  steps: ConsequenceStep[];
  currentStep: number;
  turnsUntilNext: number;
  resolved: boolean;
  createdAtTick: number;
};
```

Six curated trigger types:

| Trigger | Kind | Steps |
|---------|------|-------|
| Breakpoint to hostile (was favorable+) | retaliation | warn → accuse |
| Breakpoint to compromised | extortion | bargain → conceal |
| Betrayal obligation (magnitude >= 4) | vendetta | accuse → betray |
| Allied NPC sees player betray faction | abandonment | warn → flee |
| Hostile NPC with fear > 80 | plea | bargain |
| Allied NPC with player in danger | sacrifice | warn → recruit |

- `evaluateConsequenceChainTrigger(profile, previousBreakpoint, obligations)` — returns `ConsequenceKind | null`
- `buildConsequenceChain(npcId, kind, trigger, tick)` — creates a chain from the trigger table
- `tickConsequenceChain(chain)` — decrements delay timer
- `shouldResolveChainStep(chain)` — true when timer hits 0
- `resolveConsequenceChainStep(chain)` — returns the next verb + description, advances chain

## Director Commands

Two director commands surface NPC agency data:

**`/npc <name>`** — detailed view of a single NPC:
```
NPC: Kira (Guard Captain, Ironwatch)
  Relationship: trust=65 fear=10 greed=15 loyalty=55
  Breakpoint: allied | Dominant: trust | Angle: "Reliable ally; may warn of danger"
  Goals: warn (0.8), recruit (0.6), bargain (0.3)
  Obligations: favor×2, debt×0
```

**`/people`** — compact roster:
```
Kira [allied/trust] — Guard Cpt, Ironwatch — favor×1, debt×0 — "Reliable ally"
Voss [hostile/fear] — Enforcer, Syndicate — threat×1 — "Dangerous; expect retaliation"
```

## Session Recaps

`computeNpcRecapEntries()` generates recap data for NPCs that changed during the session. Only includes NPCs where breakpoint shifted, obligations exist, or a consequence chain is active.

The session summary renders a **NOTABLE CHARACTERS** section:
```
Kira (Ironwatch) — allied [was: wavering] [shifted!] | trust-driven
  Owes you ×2 | "Reliable ally; may warn of danger"

Voss (Syndicate) — hostile [shifted!] | fear-driven
  You owe ×1 | Active: retaliation chain | "Dangerous; expect retaliation"
```

## Persistence

NPC agency state is saved with the session:

- `npcAgencySnapshot` — serialized NPC profiles and action results
- `npcObligations` — obligation ledgers per NPC (Map serialized as object)
- `consequenceChains` — active chains per NPC (Map serialized as object)

All three are restored on session load and fed back into the agency system.
