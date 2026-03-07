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
