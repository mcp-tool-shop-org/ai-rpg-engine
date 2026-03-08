# Appendix B — Schema Reference

Formal schema definitions for content files.

## GameManifest

Top-level game definition containing metadata, ruleset reference, and content references.

## EntityBlueprint

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Unique identifier |
| name | string | yes | Display name |
| kind | enum | yes | npc, enemy, item, object |
| stats | Record | no | Stat values per ruleset |
| resources | Record | no | Resource pools |
| tags | string[] | no | Classification tags |
| ai | AIConfig | no | Cognition configuration |
| inventory | string[] | no | Item references |

## RoomDefinition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Unique identifier |
| name | string | yes | Display name |
| zones | ZoneDefinition[] | yes | Sub-areas |

## ZoneDefinition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Unique identifier |
| name | string | yes | Display name |
| description | string | yes | Narrative description |
| exits | Exit[] | no | Connections to other zones |
| entities | string[] | no | Entity references |
| interactables | string[] | no | Interactable object references |
| properties | Record | no | Base zone properties |
| hazards | HazardDefinition[] | no | Environmental hazards |

## DialogueDefinition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Unique identifier |
| startNode | string | yes | Entry point node ID |
| nodes | DialogueNode[] | yes | Conversation nodes |

## ProgressionTreeDefinition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Unique identifier |
| currency | string | yes | Currency used to unlock nodes |
| nodes | TreeNode[] | yes | Unlock nodes |

## StatusDefinition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Unique identifier |
| duration | number | yes | Ticks until expiry |
| effect | EffectDefinition | yes | Per-tick effect |
| stackable | boolean | no | Whether multiple can coexist |

## AbilityDefinition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Unique identifier |
| verb | string | yes | Action verb |
| cost | ResourceCost | no | Resource cost to use |
| effects | EffectDefinition[] | yes | Effects on use |

## RulesetDefinition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| stats | string[] | yes | Available stat names |
| resources | string[] | yes | Available resource names |
| verbs | string[] | yes | Available action verbs |
| formulas | FormulaMap | yes | Named formula definitions |

## CampaignRecord (@ai-rpg-engine/campaign-memory)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Auto-generated identifier |
| tick | number | yes | When the event occurred |
| category | RecordCategory | yes | action, combat, kill, betrayal, gift, theft, debt, discovery, alliance, insult, rescue, death |
| actorId | string | yes | Who performed the action |
| targetId | string | no | Who was affected |
| zoneId | string | no | Where it happened |
| description | string | yes | What happened |
| significance | number (0-1) | yes | How important this event is |
| witnesses | string[] | yes | Entity IDs who observed it |
| data | Record | yes | Additional event-specific data |

## RelationshipAxes (@ai-rpg-engine/campaign-memory)

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| trust | number | -1 to 1 | Distrust → Trust |
| fear | number | 0 to 1 | Unafraid → Terrified |
| admiration | number | -1 to 1 | Contempt → Admiration |
| familiarity | number | 0 to 1 | Stranger → Intimate |

## MemoryFragment (@ai-rpg-engine/campaign-memory)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| recordId | string | yes | Links to CampaignRecord |
| salience | number (0-1) | yes | How vivid/important to this NPC |
| emotionalCharge | number (-1 to 1) | yes | Negative to positive sentiment |
| consolidation | enum | yes | vivid, faded, dim |
| tick | number | yes | When this memory was formed |

## DistrictEconomy (@ai-rpg-engine/modules)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| supplies | Record<SupplyCategory, SupplyLevel> | yes | 8 category supply levels |
| tradeVolume | number (0-100) | yes | Aggregate trade activity |
| blackMarketActive | boolean | yes | True when contraband > 30 or any supply < 20 |
| lastUpdateTick | number | yes | Tick of last update |

## SupplyLevel (@ai-rpg-engine/modules)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| category | SupplyCategory | yes | medicine, weapons, ammunition, food, fuel, luxuries, components, contraband |
| level | number (0-100) | yes | Current supply level. <30 = scarce, >70 = surplus |
| trend | enum | yes | rising, falling, stable |
| cause | string | no | Most recent modifier source |

## EconomyShift (@ai-rpg-engine/modules)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| districtId | string | yes | Target district |
| category | SupplyCategory | yes | Which supply to modify |
| delta | number | yes | Amount to change (positive or negative) |
| cause | string | yes | What caused the shift |
| sourceFactionId | string | no | Faction responsible |

## MaterialYield (@ai-rpg-engine/modules)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| category | SupplyCategory | yes | medicine, weapons, etc. |
| quantity | number | yes | Amount yielded |
| quality | enum | yes | poor, standard, fine |

## SalvageResult (@ai-rpg-engine/modules)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| yields | MaterialYield[] | yes | Materials produced |
| byproducts | string[] | yes | Special byproducts (occult-residue, etc.) |
| economyShifts | EconomyShift[] | yes | District supply changes |
| chronicleDetail | string | yes | Human-readable description |

## CraftingRecipe (@ai-rpg-engine/modules)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Recipe identifier |
| name | string | yes | Display name |
| category | enum | yes | craft, repair, modify |
| inputs | { category, quantity }[] | yes | Required materials |
| outputSlot | EquipmentSlot | yes | Slot of crafted item |
| outputRarity | ItemRarity | yes | Base rarity of output |
| requiredTags | string[] | no | District/player tags required |
| genreFilter | string[] | no | Genres this recipe appears in |
| modificationKind | string | no | For modify recipes: enhancement, blessed, cursed, etc. |

## CraftingContext (@ai-rpg-engine/modules)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| districtEconomy | DistrictEconomy | yes | Local economy state |
| districtId | string | yes | Current district |
| districtTags | string[] | yes | District tags |
| prosperity | number | yes | District commerce level |
| stability | number | yes | District stability |
| playerHeat | number | yes | Player heat level |
| isBlackMarket | boolean | yes | Black market active in district |
| factionAccess | string | no | Faction ID if player has access |

## CraftEffect (@ai-rpg-engine/modules)

Discriminated union of crafting side effects:

| Type | Fields | Description |
|------|--------|-------------|
| economy-shift | districtId, category, delta, cause | Adjust district supply |
| rumor | claim, valence | Generate player rumor |
| heat | delta | Adjust player heat |
| reputation | factionId, delta | Adjust faction reputation |
| suspicion | districtId, delta | Raise district alert |

## TradeContext (@ai-rpg-engine/modules)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| districtEconomy | DistrictEconomy | yes | District economy state |
| factionId | string | no | Seller/buyer faction |
| playerReputation | number (-100 to 100) | yes | Player rep with relevant faction |
| playerHeat | number (0-100) | yes | Player heat level |
| isContraband | boolean | yes | Whether the item is contraband |
| itemProvenance | object | no | isStolen, isRelic, notoriety (0-100) |
| activePressureKinds | PressureKind[] | yes | Active pressure kinds in district |

## ItemValueResult (@ai-rpg-engine/modules)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| baseValue | number | yes | Original item value |
| finalValue | number | yes | Contextually adjusted value |
| modifiers | ValueModifiers | yes | Breakdown of all multipliers |
| tradeAdvice | enum | yes | sell-here, sell-elsewhere, hold, risky, untradeable |
| reason | string | yes | Human-readable explanation |

## Rumor (@ai-rpg-engine/rumor-system)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Auto-generated identifier |
| claim | string | yes | Human-readable claim |
| subject | string | yes | Entity/topic the rumor is about |
| key | string | yes | Belief key |
| value | unknown | yes | Current claimed value (may have mutated) |
| originalValue | unknown | yes | What was originally claimed |
| sourceId | string | yes | Original witness entity ID |
| originTick | number | yes | When the rumor was created |
| confidence | number (0-1) | yes | How confident spreaders are |
| emotionalCharge | number (-1 to 1) | yes | Outrage to admiration |
| spreadPath | string[] | yes | Entity IDs it passed through |
| mutationCount | number | yes | How many times value changed |
| factionUptake | string[] | yes | Factions that absorbed this |
| status | enum | yes | spreading, established, fading, dead |
| lastSpreadTick | number | yes | Last tick this rumor was spread |
