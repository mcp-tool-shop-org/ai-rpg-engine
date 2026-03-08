# Chapter 43 — Endgames & Campaign Conclusions

The simulation accumulates state: faction reputations, NPC loyalty shifts, district stability, companion morale, resolved pressures, completed opportunities, leverage positions. Endgames & Campaign Conclusions detects when that accumulated state coalesces into recognizable narrative trajectories and threshold-crossing events.

Arc detection derives narrative trajectories on-demand. Endgame triggers fire when specific conditions are met. Finale rendering produces structured epilogues from campaign state.

---

## Arc Detection

Arc signals are derived views — computed from current state, not stored. Each evaluation scores 10 arc kinds against accumulated simulation data.

### Arc Kinds

| Kind | Core Signal |
|------|-------------|
| `rising-power` | High rep with dominant faction, high influence, controls districts, low heat |
| `hunted` | All factions hostile, high heat, active bounties |
| `kingmaker` | High influence, competing factions, high legitimacy |
| `resistance` | Allied with minority, hostile to dominant, active pressures from dominant |
| `merchant-prince` | High legitimacy, strong supply averages, completed supply runs |
| `shadow-broker` | High blackmail/debt scores, many NPC obligations owed to player |
| `last-stand` | Low HP, many active pressures, few companions, high heat |
| `community-builder` | High companion morale, high legitimacy, allied NPCs, stable districts |
| `descent` | Losing companions, declining reputation, rising heat |
| `reckoning` | Many active obligations, consequence chains converging |

### ArcSignal

Each arc kind produces a signal with:

- **strength** (0-1): how well current state matches the arc pattern
- **momentum**: `building`, `steady`, or `waning` (derived from previous snapshot comparison)
- **primaryDrivers**: which state elements contribute most to the score
- **turnsActive**: how long this arc has been above threshold

### ArcSnapshot

`buildArcSnapshot()` evaluates all 10 arcs, derives momentum from the previous snapshot, and selects the dominant arc (highest strength above 0.2 threshold, with 0.05 hysteresis for the current dominant).

### API

```typescript
import {
  buildArcSnapshot,
  formatArcForDirector,
  formatArcForNarrator,
  type ArcSnapshot,
  type ArcSignal,
  type ArcInputs,
} from '@ai-rpg-engine/modules';
```

- `buildArcSnapshot(inputs, previous?)` — evaluate all arcs, return snapshot
- `formatArcForDirector(snapshot)` — multi-line director mode display
- `formatArcForNarrator(snapshot)` — compact ~15 token context for narration

---

## Endgame Detection

Endgame triggers fire when accumulated state crosses specific thresholds. Unlike arcs (derived on-demand), triggers are stored because they represent one-shot events that must survive save/load.

### Resolution Classes

| Class | Condition Summary |
|-------|-------------------|
| `victory` | Dominant faction allied, high influence, controls 3+ districts, few pressures, low heat |
| `tragic-stabilization` | All pressures resolved, long campaign, average reputation, low HP and legitimacy |
| `exile` | All factions hostile, very high heat, no companions, no allies |
| `overthrow` | Destroyed dominant faction, allied with rival |
| `martyrdom` | Player died with positive reputation and loyal companions |
| `quiet-retirement` | All pressures resolved, low heat, high legitimacy, loyal companions, no consequence chains |
| `puppet-master` | High blackmail/influence, controls majority districts, low heat, mixed reputation |
| `collapse` | Most districts unstable, average faction cohesion collapsed, many active pressures |

Each resolution requires ALL its conditions to be met simultaneously. Deduplication prevents the same class from triggering twice.

### EndgameTrigger

```typescript
type EndgameTrigger = {
  id: string;
  resolutionClass: ResolutionClass;
  detectedAtTick: number;
  reason: string;
  evidence: Record<string, number | string | boolean>;
  dominantArc: ArcKind | null;
  acknowledged: boolean;
};
```

### API

```typescript
import {
  evaluateEndgame,
  formatEndgameForDirector,
  formatEndgameForNarrator,
  type EndgameTrigger,
  type EndgameInputs,
} from '@ai-rpg-engine/modules';
```

- `evaluateEndgame(inputs)` — check all 8 resolution thresholds, return trigger or null
- `formatEndgameForDirector(trigger)` — detailed trigger display
- `formatEndgameForNarrator(trigger)` — compact context for narration atmosphere

---

## Finale Rendering

`buildFinaleOutline()` produces a deterministic structured epilogue from campaign state. No AI calls — pure data transformation.

### FinaleOutline

```typescript
type FinaleOutline = {
  resolutionClass: ResolutionClass;
  dominantArc: ArcKind | null;
  campaignDuration: number;
  totalChronicleEvents: number;
  keyMoments: CampaignRecord[];
  npcFates: NpcFate[];
  factionFates: FactionFate[];
  districtFates: DistrictFate[];
  companionFates: NpcFate[];
  legacy: LegacyEntry[];
  epilogueSeeds: string[];
};
```

### Fate Derivation

- **NPC fates**: loyalty breakpoint maps to outcome (allied, enemy, departed, dead, neutral, betrayed)
- **Faction fates**: reputation + cohesion maps to outcome (dominant, weakened, destroyed, allied, hostile, neutral)
- **District fates**: stability level + controlling faction + economy tone
- **Legacy entries**: derived from chronicle category frequency — most kills = "Warrior", most diplomacy = "Diplomat"
- **Epilogue seeds**: one per faction fate, one per companion fate, one for dominant arc

### API

```typescript
import {
  buildFinaleOutline,
  formatFinaleForDirector,
  formatFinaleForTerminal,
  type FinaleOutline,
} from '@ai-rpg-engine/campaign-memory';
```

---

## Narration Integration

Arc and endgame context flows through the narrator pipeline as optional string parameters:

- **arcContext**: compact arc description (~15 tokens) that colors scene atmosphere. A rising-power arc means people defer. A hunted arc means furtive glances and locked doors.
- **endgameContext**: turning point context that shifts the atmosphere dramatically. NPCs act with urgency, the world holds its breath.

The narrator receives these as additional context alongside existing pressure, economy, and opportunity context. It shows arc reality through environmental texture, never naming the arc directly.

---

## Product Layer Commands

| Command | Mode | Description |
|---------|------|-------------|
| `/arcs` | Play | Show current arc signals and dominant arc |
| `/conclude` | Play | Build finale outline, generate LLM epilogue, show legacy |
| `/arcs` | Director | Full arc signal breakdown |
| `/endgame` | Director | Endgame trigger details |
| `/finale` | Director | Full finale outline |

---

## Pipeline Position

Arc detection and endgame evaluation run after opportunity evaluation and before NPC agency:

```
... → economy tick → crafting/salvage → opportunity evaluation → arc detection → endgame evaluation → NPC agency → companion reactions
```

This ensures arcs and endgames reflect the most current world state including freshly resolved opportunities and pressures.

---

## Design Principles

1. **Arcs are derived, not stored.** Like `buildStrategicMap`, arc signals are pure functions of current state. This avoids stale data and keeps save files simple.

2. **Endgame triggers are stored.** They're one-shot threshold events that must survive save/load. Once fired, they persist in the session.

3. **No new NPC or faction fields.** Arc and endgame detection reads existing state only — reputations, obligations, pressures, districts, companions.

4. **Hybrid finale.** The engine produces deterministic structured data. The product layer optionally feeds it to Claude for prose epilogue. The deterministic summary always works, even without an AI call.

5. **Continue-or-close via flag.** The game announces the turning point but continues normally. The player chooses when to conclude, archive, or keep playing.
