---
title: "Chapter 31 — Character Profiles"
description: "Character Profiles"
sidebar:
  order: 31
---

> Part VII — Systems

Persistent character identity with progression, injuries, milestones, and save/load.

## Package

`@ai-rpg-engine/character-profile` — depends on `character-creation` and `equipment`.

```bash
npm install @ai-rpg-engine/character-profile
```

## Architecture

```
CharacterBuild + Stats + Resources + Tags
        ↓
  createProfile()
        ↓
  CharacterProfile
  ├── build         (original choices)
  ├── stats/resources/tags (live state)
  ├── loadout       (equipment)
  ├── progression   (XP, level, ranks)
  ├── injuries      (active + healed)
  ├── milestones    (history)
  ├── reputation    (factions)
  └── portraitRef   (asset hash)
```

## Progression

XP thresholds follow a curved scale from level 1 (0 XP) to level 10 (16,000 XP).

- `grantXp(profile, amount)` — add XP with auto-leveling
- `advanceArchetypeRank(profile)` — rank up archetype (max 5)
- `advanceDisciplineRank(profile)` — rank up discipline (max 3)
- `evolveTrait(profile, original, evolved, at)` — record trait upgrade

## Injuries

Injuries apply stat/resource penalties and grant tags while active.

- `addInjury(profile, injury)` — sustain an injury
- `healInjury(profile, injuryId)` — heal by ID
- `getActiveInjuries(profile)` — unhealed injuries
- `computeInjuryPenalties(profile)` — aggregate active penalties

## Milestones

Record notable events in the character's history.

- `recordMilestone(profile, milestone)` — add event
- `getMilestonesByTag(profile, tag)` — filter by tag

## Reputation

Track faction standing with clamped [-100, 100] values.

- `adjustReputation(profile, factionId, delta)` — change reputation
- `getReputation(profile, factionId)` — get current value

## Serialization

- `serializeProfile(profile)` — JSON string
- `deserializeProfile(json)` — parse with validation
- `validateSerializedProfile(json)` — check without parsing

## Profile Summary

`getProfileSummary(profile)` returns a display-ready object with name, level, XP, archetype, background, discipline, active injuries, milestone count, and total turns.
