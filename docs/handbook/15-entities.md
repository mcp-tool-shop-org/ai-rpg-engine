# Chapter 15 — Entities

> Part IV — Authoring Games

Actors and objects in the world.

## Topics

- **Entity blueprints** — templates for creating entities
- **Stats** — attribute values defined by the ruleset
- **Resources** — consumable pools (hp, stamina, heat)
- **AI profiles** — behavior configuration for non-player entities
- **Inventories** — items carried by an entity
- **Statuses** — active conditions and effects

## Example Entities

**NPC — The Pilgrim**

```
id: pilgrim
name: The Pilgrim
kind: npc
stats: { vigor: 3, instinct: 5, will: 7 }
resources: { hp: 15 }
tags: [friendly, mysterious]
```

**Enemy — Ash Ghoul**

```
id: ash_ghoul
name: Ash Ghoul
kind: enemy
stats: { vigor: 6, instinct: 4, will: 2 }
resources: { hp: 20, stamina: 8 }
ai:
  profileId: aggressive
  goals: [guard-crypt]
  fears: [fire, sacred]
```

**Item — Healing Draught**

```
id: healing_draught
name: Healing Draught
kind: item
effects: [{ type: restore, resource: hp, amount: 8 }]
```

## AI Configuration

Non-player entities with an `ai` field participate in the cognition system. Their `profileId` determines intent selection behavior, while `goals` and `fears` influence which actions the AI prioritizes or avoids.

## Environmental Objects

Objects like altars, terminals, and containers are also entities. They can be inspected, used, or interacted with through the same action system that handles NPCs and enemies.
