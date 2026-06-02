---
title: "Chapter 38 — District Life"
description: "District Life"
sidebar:
  order: 38
---

# Chapter 38 — District Life

Districts in AI RPG Engine are not just map labels — they are living neighborhoods with economic pulse, social morale, and atmospheric identity. The district life system derives expressive mood from raw metrics, flows that mood into narration, modifies gameplay through district-aware scaling, and exposes everything through director commands and session recaps.

---

## Raw Metrics

Each district tracks 7 metrics in `DistrictMetrics`:

| Metric | Range | Baseline | Decay |
|--------|-------|----------|-------|
| `alertPressure` | 0–100 | 0 | Toward 0 |
| `rumorDensity` | 0–100 | 0 | Toward 0 |
| `intruderLikelihood` | 0–100 | 0 | Toward 0 |
| `surveillance` | 0–100 | computed | From faction presence |
| `stability` | 0–10 | zone average | Averaged |
| `commerce` | 0–100 | 50 | Toward 50 |
| `morale` | 0–100 | 50 | Toward 50 |

The first five metrics are security-oriented and decay toward 0 (or are computed). Commerce and morale are social/economic metrics that use **baseline-seeking decay** — they drift toward 50 at 0.5/tick, representing a natural equilibrium. A district left alone settles to average commerce and neutral morale.

## Mood Derivation

The mood system (`district-mood.ts`) is a pure-function layer that converts raw metrics into expressive descriptors. No state — just computation.

### Three Mood Axes

| Axis | Derived From | Meaning |
|------|-------------|---------|
| **Safety** | alertPressure (inverse), stability | How secure does this place feel? |
| **Prosperity** | commerce, stability | Is trade flowing? Are people fed? |
| **Spirit** | morale, surveillance (inverse), stability | Are people hopeful or broken? |

Base formulas:
- `safety = (100 - alertPressure) × 0.5 + stability × 5`
- `prosperity = commerce × 0.6 + stability × 4`
- `spirit = morale × 0.6 + (100 - surveillance) × 0.2 + stability × 2`

### Tag-Driven Weighting

District tags modify mood derivation without explicit configuration per pack. A `sacred` district amplifies spirit, a `secure` district amplifies safety, a `cursed` district suppresses both:

| Tag | Safety | Prosperity | Spirit |
|-----|--------|-----------|--------|
| sacred | ×0.8 | ×1.0 | ×1.5 |
| public | ×1.0 | ×1.3 | ×1.1 |
| secure | ×1.5 | ×0.7 | ×1.0 |
| underground | ×0.7 | ×0.8 | ×0.8 |
| networked | ×1.1 | ×1.2 | ×1.0 |
| cursed | ×0.6 | ×1.0 | ×0.5 |
| exterior | ×1.0 | ×1.1 | ×1.0 |

### Descriptors

A priority cascade produces compact atmospheric phrases (~3–5 words):

- `safety < 20 && spirit < 30` → "dangerous and despairing"
- `safety < 30` → "on edge, jumpy"
- `prosperity > 70 && spirit > 60` → "busy and cheerful"
- `safety > 70 && spirit > 50` → "calm and watchful"
- `spirit < 30` → "subdued, fearful"
- default → "unremarkable"

### Tone

Each mood maps to a tone enum: `calm`, `tense`, `prosperous`, `grim`, `volatile`, `oppressive`.

## Gameplay Modifiers

District mood produces four scaling factors that affect gameplay:

| Modifier | Affected By | Effect |
|----------|-----------|--------|
| `leverageCostScale` | Safety | Dangerous districts (safety < 30) increase costs ×1.3; safe districts (> 70) reduce to ×0.85 |
| `rumorSpreadScale` | Spirit | Low-spirit districts (< 30) accelerate spread ×1.5; high-spirit (> 70) slow to ×0.7 |
| `npcCooperationBias` | Prosperity | Prosperous districts bias NPC trust checks positively |
| `pressureUrgencyBias` | Safety + Spirit | Doubly-stressed districts (both < 30) add +0.15 urgency to new pressures |

## Drift Sources

District metrics change through multiple systems:

### Event Hooks (Engine)
- `combat.entity.defeated` → morale −3
- `inventory.item.received` → commerce +3
- `dialogue.choice.selected` → morale +1

### Faction Actions (Engine)
- `recruit` → morale +2 in target district
- `smuggle` → commerce +3, stability −3
- `hoard` → commerce −3 in target district
- `fortify`, `patrol`, `sanction` → existing security metric effects

### Player Leverage (Product)
- `sabotage` → stability −3, alertPressure +5
- `diplomacy` → morale +3, alertPressure −2
- `rumor` → rumorDensity +3
- `social` → commerce +2

### NPC Consequence Chains (Product)
- `retaliation`/`vendetta` → alertPressure +5, morale −3
- `extortion` → commerce −3, morale −2
- `abandonment` → commerce −3
- `plea` → morale −1
- `sacrifice` → morale +3

## Narration Integration

The narrator receives a single-line district descriptor in the scene context:

```
District: Chapel Grounds: calm and watchful
```

The system prompt instructs Claude to weave this into environmental descriptions through sensory detail — showing crowds, emptiness, tension, commerce, morale through what the character perceives. The descriptor adds ~8 tokens to the narration input.

## Director Commands

### `/districts`

Overview of all districts with mood:

```
  DISTRICTS

  Chapel Grounds (chapel-grounds) — "calm and watchful"
    Safety: 72 | Prosperity: 55 | Spirit: 61
    Tags: sacred | Faction: none

  Crypt Depths (crypt-depths) — "on edge, jumpy"
    Safety: 28 | Prosperity: 31 | Spirit: 22
    Tags: cursed, underground | Faction: chapel-undead
```

### `/district <id>`

Deep inspection with mood, modifiers, raw metrics, and more.

## Session Recaps

When districts change during a session, the recap includes a DISTRICT CHANGES section:

```
  DISTRICT CHANGES

  Chapel Grounds: "calm and watchful" → "on edge, jumpy"
    alertPressure rose sharply, morale fell sharply
  Crypt Depths: unchanged
```

Changes are detected by comparing mood descriptors and looking for metric shifts above threshold (>15 for most metrics, >2 for stability).

## Strategic Map

The `/map` command shows mood descriptors alongside each district:

```
  Chapel Grounds (chapel-grounds) — "calm and watchful"
    Threat: 15 | Stability: 7 | Surveillance: 30
```

## Design Philosophy

Districts should feel inhabited, not spreadsheet-heavy. The system achieves this through:

- **7 raw metrics** — compact enough to fit in a single inspection line
- **3 derived mood axes** — human-readable compression of 7 metrics
- **Tag-driven weighting** — packs define district character through tags, not per-metric config
- **Compact descriptors** — 3–5 word phrases that Claude can naturally weave into prose
- **Baseline-seeking decay** — districts recover naturally, making player/NPC impact visible as deviation from equilibrium

The goal is not municipal simulation — it is atmospheric consequence.
