# Chapter 40 — Economy, Scarcity & Trade

Districts in AI RPG Engine don't just have mood — they have material conditions. The economy system tracks supply at the category level across districts, derives scarcity and surplus, modulates item values contextually, and feeds economic pressure into faction agency, NPC behavior, narration, and strategic play.

This is not accounting cosplay. Eight supply categories, baseline-seeking decay, and lookup-table-driven modifiers produce emergent economic storytelling with minimal token overhead (~10–15 tokens per narration input).

---

## Supply Categories

Eight genre-agnostic categories cover all tradeable goods:

| Category | Examples |
|----------|----------|
| `medicine` | Bandages, antidotes, stimpacks, healing herbs |
| `weapons` | Swords, pistols, energy blades, makeshift clubs |
| `ammunition` | Arrows, bullets, power cells, throwing knives |
| `food` | Rations, water, preserved meat, fresh produce |
| `fuel` | Oil, gasoline, batteries, arcane fuel |
| `luxuries` | Jewelry, silk, spirits, art, spices |
| `components` | Scrap metal, circuits, lumber, alchemical reagents |
| `contraband` | Stolen goods, drugs, forbidden texts, illegal tech |

Categories are tracked as levels (0–100, baseline 50), not individual item inventories. A district knows "medicine is scarce" (level 22), not "there are 3 healing potions left."

## District Economy State

Each district has a `DistrictEconomy`:

| Field | Type | Description |
|-------|------|-------------|
| `supplies` | Record<SupplyCategory, SupplyLevel> | 8 category levels |
| `tradeVolume` | number (0–100) | Aggregate commerce activity |
| `blackMarketActive` | boolean | True when contraband > 30 or any supply < 20 |
| `lastUpdateTick` | number | Tick of last economy update |

Each `SupplyLevel` tracks:

| Field | Type | Description |
|-------|------|-------------|
| `category` | SupplyCategory | Which supply |
| `level` | number (0–100) | Current level. <30 = scarce, >70 = surplus |
| `trend` | rising / falling / stable | Direction of recent change |
| `cause` | string? | Most recent modifier source (e.g. "blockade") |

## Initialization

`createDistrictEconomy(genre?, districtTags?)` initializes a district economy:

1. **Genre defaults** set starting levels per category
2. **Tag modifiers** adjust based on district character
3. **Black market** is evaluated from initial state

### Genre Defaults

Each genre starts with different supply profiles reflecting its setting:

| Genre | Key Scarcities | Key Surpluses |
|-------|---------------|---------------|
| zombie | food (20), medicine (25), ammunition (30) | — |
| pirate | medicine (30), food (35) | luxuries (60) |
| cyberpunk | medicine (40) | components (60), contraband (55) |
| colony | fuel (30), components (35) | ammunition (45) |
| fantasy | components (35) | food (55) |
| detective | — | contraband (55) |
| weird-west | fuel (30), luxuries (35) | — |

### Tag Modifiers

District tags stack additively on top of genre defaults:

| Tag | Notable Effects |
|-----|----------------|
| `market` | food +15, luxuries +10, components +5 |
| `industrial` | components +15, fuel +10, weapons +5 |
| `underground` | contraband +20, weapons +10, medicine −10 |
| `sacred` | medicine +10, contraband −15 |
| `port` | luxuries +15, contraband +10, food +10 |
| `military` | weapons +15, ammunition +15, medicine +5 |
| `slums` | contraband +10, medicine −10, luxuries −15 |
| `wealthy` | luxuries +20, medicine +10, food +10 |
| `rural` | food +20, medicine −5, components −10 |

A zombie-genre `port` district starts with food at 30 (20 + 10), luxuries at 65 (50 + 15), and medicine at 25 (unchanged — no port modifier for medicine).

## Tick Processing

`tickDistrictEconomy(economy, commerce, stability, tick)` runs each game tick:

- **Baseline-seeking decay**: All supplies drift toward 50 at 1 point/tick
- **Stability acceleration**: Low stability (< 30) accelerates negative drift — unstable districts hemorrhage supplies faster
- **Commerce buffer**: High commerce slows surplus decay — prosperous markets sustain abundance
- **Trade volume**: Tracks blended commerce, representing aggregate economic activity

The result: a district hit by a blockade (food drops to 20) will slowly recover once the blockade lifts, but faster if stability is high. A wealthy market district holds onto its surpluses longer.

## Scarcity and Surplus

`deriveEconomyDescriptor(economy)` produces a structured descriptor:

### Thresholds

| Level Range | Classification |
|-------------|---------------|
| < 15 | Desperate scarcity |
| 15–24 | Scarce |
| 25–34 | Tight |
| 35–70 | Normal |
| 71–85 | Plentiful surplus |
| > 85 | Flooded |

### Overall Tone

| Condition | Tone |
|-----------|------|
| 2+ desperate categories | `crisis` |
| 3+ scarce categories | `strained` |
| 3+ surplus, 0 scarce | `thriving` |
| Otherwise | `normal` |

### Compact Phrase

The descriptor includes a compact phrase for narration context (~10 tokens):

```
medicine scarce, weapons plentiful
```

or simply `supplies normal` when nothing is notable.

## Black Market

A black market activates automatically when:

- Contraband supply > 30, OR
- Any supply drops below 20

Black market conditions enable contraband trading and signal desperation. Without a black market, contraband items are untradeable in that district.

## Trade Value

`computeItemValue(baseValue, supplyCategory, context)` calculates contextual item value through six multiplicative modifiers:

### Scarcity Multiplier (0.5–3.0)

| Supply Level | Multiplier |
|-------------|-----------|
| < 20 | ×3.0 |
| 20–29 | ×2.0 |
| 30–39 | ×1.5 |
| 40–60 | ×1.0 |
| 61–70 | ×0.8 |
| 71–80 | ×0.7 |
| > 80 | ×0.5 |

Medicine at level 15 in a crisis district? Triple the price.

### Faction Attitude (0.85–1.5)

Hostile factions gouge; friendly factions discount:

| Reputation | Multiplier |
|-----------|-----------|
| ≤ −60 | ×1.5 |
| −30 to −60 | ×1.3 |
| −10 to −30 | ×1.1 |
| −10 to 10 | ×1.0 |
| 10 to 30 | ×0.95 |
| 30 to 60 | ×0.9 |
| > 60 | ×0.85 |

### Provenance Notoriety (1.0–2.0)

Items with history command premiums:

- Relics: +0.5
- Notorious items (notoriety > 50): +0.2
- Stolen + hot (heat > 30): +0.3 (risky premium)

### Contraband Factor (0.0–1.0)

- Not contraband: ×1.0
- Contraband, no black market: ×0.0 (untradeable)
- Contraband, black market active: ×0.6 to ×1.0 (scaled by reputation)

### Pressure Modifier (0.8–1.5)

Active pressures inflate prices in relevant categories:

| Pressure | Affected Categories | Multiplier |
|----------|-------------------|-----------|
| `supply-crisis` | medicine, food, fuel | ×1.4 |
| `trade-war` | luxuries, components, food | ×1.3 |
| `black-market-boom` | contraband, weapons | ×1.2 |
| `merchant-blacklist` | luxuries, components, food | ×1.2 |
| `infection-suspicion` | medicine | ×1.4 |
| `camp-panic` | food, medicine, ammunition | ×1.25 |

### Trade Advice

After computing value, the system derives advice:

| Advice | Condition |
|--------|-----------|
| `sell-here` | Scarcity × prosperity ≥ 1.5 |
| `sell-elsewhere` | Scarcity × prosperity ≤ 0.7 |
| `hold` | Fair price range |
| `risky` | Contraband or notorious provenance |
| `untradeable` | No market available |

## Faction Economic Agency

Three faction verbs operate on economy:

| Verb | Commerce | Stability | Supply Effects |
|------|----------|-----------|----------------|
| `blockade` | −8 | — | food −10, luxuries −8 |
| `raid-supply` | −5 | −5 | — |
| `open-trade` | +5 | — | food +5, components +5 |

### Goal Derivation

Factions develop economic goals based on district conditions:

- **Controlled district supply < 25** → faction considers `smuggle` or `open-trade` to restore supply
- **Enemy faction's prosperous district** → faction considers `blockade` or `raid-supply` to weaken rival

These goals compete with existing faction priorities (patrol, recruit, sanction) through the standard goal-scoring system.

## Economy Pressures

Three economy-specific pressures emerge from supply conditions:

### supply-crisis

- **Trigger**: Any district supply < 15
- **Resolution fallout**: Rep boost + supply restoration
- **Expiry fallout**: Further degradation of the scarce supply

### trade-war

- **Trigger**: Competing blockade and open-trade actions on the same district
- **Resolution fallout**: Winner gets commerce boost
- **Expiry fallout**: Both sides suffer commerce loss

### black-market-boom

- **Trigger**: 2+ districts with active black markets
- **Resolution fallout**: Contraband normalized, stability recovers
- **Expiry fallout**: Stability drops across affected districts

All three produce `economy-shift` fallout effects that modify district supply levels.

## Strategic Map

The `/map` command includes economy data:

- Each district shows `scarcities`, `surpluses`, `blackMarketActive`, and `economyTone`
- A `hotGoods` section lists categories that are especially valuable or dangerous across the map

## Director Commands

### `/market`

Overview of all district economies at a glance:

```
────────────────────────────────────────────────────────────
  MARKET OVERVIEW
────────────────────────────────────────────────────────────
  Chapel Grounds (chapel-grounds): strained
    medicine scarce, food tight
  Crypt Depths (crypt-depths): crisis [BLACK MARKET]
    medicine desperate, ammunition scarce, weapons plentiful
────────────────────────────────────────────────────────────
```

### `/trade <district-id>`

Detailed economy view for a single district with supply bars, trends, and scarcity/surplus breakdown.

## Narration Integration

The narrator receives a compact economy context:

```
Economy: medicine scarce, weapons plentiful
```

The system prompt instructs the narrator to show economic conditions through sensory detail:

- **Scarcity**: Empty stalls, rationing queues, hoarded goods, desperate vendors
- **Surplus**: Overflowing markets, careless abundance, wasted goods
- **Black market**: Whispered offers, coded language, furtive exchanges in alleys

Economy context adds ~10–15 tokens to the narration input. The narrator never states supply levels directly.

## NPC Dialogue

NPCs react to economic conditions in their district:

- **Scarce districts**: Desperate merchants demand supplies as payment, guards demand bribes, civilians hoard and share reluctantly
- **Surplus districts**: Generous merchants offer deals freely, goods are abundant, conversation turns to plenty and waste
- **Black market active**: Coded language about "special goods," contraband offered in whispers, watching for authorities

### Merchant NPC Priority

When a `supply-crisis` pressure is active, merchant NPCs boost their `bargain` goal priority by +0.25, making them more aggressive about negotiating trades.

## District Mood Integration

The district mood system gains a `tradePriceScale` modifier (0.8–2.0) derived from prosperity:

| Prosperity | tradePriceScale |
|-----------|----------------|
| < 30 | 2.0 |
| 30–49 | 1.3 |
| 50–70 | 1.0 |
| > 70 | 0.8 |

Low-prosperity districts inflate prices as a gameplay modifier; high-prosperity districts offer deals.

## Move Advisor

The move advisor includes `diplomacy.negotiate-trade` in its action pool. This action gets urgency-boosted (+0.3) when `supply-crisis` or `trade-war` pressures are active, surfacing trade negotiation as a contextual suggestion during economic crises.

## Session Recaps

When district economies change during a session, the recap includes an ECONOMY CHANGES section:

```
  ECONOMY CHANGES

  Chapel Grounds: medicine 45 -> 22 (scarce), food 50 -> 35 (tight)
  Crypt Depths: weapons 40 -> 75 (plentiful), black market activated
```

## Chronicle Events

Economy events are recorded in the campaign chronicle:

| Category | Significance | When |
|----------|-------------|------|
| supply-crisis | 0.7 | A supply category hits desperate levels |
| trade-completed | 0.4 | A significant trade interaction |
| black-market-opened | 0.6 | Black market conditions activate |

## Design Philosophy

Economy should create narrative friction, not bookkeeping burden. The system achieves this through:

- **8 categories, not item inventories** — "medicine is scarce" is a story hook; "3 healing potions remain" is inventory management
- **Genre sensitivity via lookup tables** — zombie worlds start desperate, pirate worlds start scarce on medicine, cyberpunk worlds have abundant components. No per-pack economic configuration needed
- **Baseline-seeking decay** — districts recover naturally, making disruption visible as deviation from equilibrium
- **Contextual value, not fixed prices** — the same sword is worth triple in a weapons-starved district under siege
- **Pure functions throughout** — all economy logic is deterministic with no side effects, enabling replay and testing
- **~15 token narration budget** — economy context costs less than a single sentence to include
