# Chapter 39 — Companions & Party Dynamics

Companions in AI RPG Engine are not a separate entity type — they are NPCs with a `CompanionState` sidecar. Every companion already has an `EntityState`, can have `CognitionState`, and participates in NPC agency. The companion system adds party membership, role-based reactions, morale tracking, ability tags, and departure triggers on top of existing NPC infrastructure.

---

## Companion State

A companion is defined by `CompanionState`:

| Field | Type | Description |
|-------|------|-------------|
| `npcId` | string | Same ID as their EntityState |
| `role` | CompanionRole | fighter, scout, healer, diplomat, smuggler, scholar |
| `joinedAtTick` | number | When they joined the party |
| `personalGoal` | string? | "Find her brother", "Clear her name" |
| `abilityTags` | string[] | Gameplay-modifying tags |
| `morale` | number | 0–100, how they feel about traveling with the player |
| `active` | boolean | In the active party vs dismissed/away |

The party itself is tracked by `PartyState`:

| Field | Type | Default |
|-------|------|---------|
| `companions` | CompanionState[] | [] |
| `maxSize` | number | 3 |
| `cohesion` | number | Average morale of active companions |

## Recruitment

An NPC is recruitable if their entity has the `recruitable` or `companion-ready` tag. The product layer validates:

1. Entity exists and is alive
2. Entity is in the same zone as the player
3. Party is not full (< maxSize)
4. Entity has `recruitable` tag

On recruitment, the NPC gets a `companion` tag added to their entity and a `CompanionState` is created. Role is inferred from entity tags or specified explicitly.

## Morale vs Cognition Morale

These are distinct systems tracking different relationships:

| System | Tracks | Drives |
|--------|--------|--------|
| Cognition morale | NPC's feelings about the world | NPC agency goals, faction behavior |
| Companion morale | Companion's feelings about traveling with the player | Departure, party cohesion |

A companion can have high cognition morale (the world is fine) but low companion morale (the player keeps doing things they disapprove of). Departure is driven by companion morale, not cognition morale.

## Role-Based Reactions

When significant events occur, each companion evaluates a reaction based on their role. The reaction table maps 12 trigger types to 6 roles:

| Trigger | Fighter | Scout | Healer | Diplomat | Smuggler | Scholar |
|---------|---------|-------|--------|----------|----------|---------|
| leverage-sabotage | +0 | +2 | -3 | -5 | +3 | -2 |
| leverage-diplomacy | -1 | +0 | +2 | +5 | +0 | +3 |
| leverage-rumor | -1 | +1 | -1 | +0 | +3 | +0 |
| combat-won | +3 | +1 | -1 | +0 | +0 | +0 |
| combat-lost | -2 | -2 | -1 | -3 | -3 | -2 |
| betrayal-witnessed | -5 | -3 | -5 | -8 | -2 | -5 |
| district-grim | -1 | -1 | -2 | -2 | +0 | -1 |
| obligation-betrayed | -8 | -5 | -8 | -10 | -3 | -5 |

Each reaction produces a morale delta and a narrator hint (e.g., "Mira frowns", "Kael nods approvingly").

### Departure

After applying morale delta, if companion morale falls to 10 or below AND their loyalty breakpoint is `hostile` or `wavering`, the companion departs. Departure removes them from the party and records a chronicle event. If the breakpoint is `hostile`, this is recorded as a betrayal instead.

## Ability Tags

Companion abilities produce gameplay effects through composable tags:

| Tag | Effect |
|-----|--------|
| `intimidation-backup` | Leverage sabotage costs -1 |
| `medical-support` | Player HP recovery +2 after combat |
| `smuggling-contact` | Leverage social/rumor costs -1 |
| `witness-calming` | Rumor spread slowed (x0.7) |
| `faction-route` | Diplomacy actions with companion's faction get +10 reputation |
| `trade-advantage` | Commerce leverage gains +1 |
| `rumor-suppression` | 30% chance negative rumors about player are buried |
| `scholarly-insight` | Perception clarity +0.1 for all entities in zone |

Tags are pack-agnostic. `medical-support` works the same in fantasy and cyberpunk.

## Combat Interception

When a companion with the `fighter` role is in the same zone as the player, there is a 30% chance they intercept incoming damage. The companion takes the damage instead of the player. This is handled by the `isAlly` callback in `CombatFormulas`.

If the intercepting companion's HP reaches 0, they are defeated and removed from the party. Both interception and death are recorded as chronicle events.

## Director Commands

### `/party`

Shows full party state with companion details, ability tags, morale, departure risk, and active goals.

### `/recruit <npc-id> [role]`

Recruits an NPC into the party. The NPC must be in the same zone, alive, and have the `recruitable` tag.

### `/dismiss <npc-id>`

Removes a companion from the party. The entity stays in the current zone.

## Session Recaps

The session recap includes a COMPANION CHANGES section when party composition changed during a session:

```
  COMPANION CHANGES
  Mira (fighter): joined
  Kael (diplomat): departed
```

## Narration Integration

The narrator receives party presence as context:

```
Party: Accompanied by Mira the Bold (fighter, confident) and Kael Whisper (diplomat, uneasy)
```

The narration system prompt instructs the narrator to reference companions naturally — a fighter scanning for threats, a diplomat reading the room — through small behavioral details rather than mechanical descriptions.

## Play Mode Display

The play screen shows a compact party status line:

```
  Party: Mira (fighter, 72) | Kael (diplomat, 85) | Cohesion: 78
```

## Chronicle Events

Companion lifecycle events are recorded in the campaign chronicle:

| Category | Significance | When |
|----------|-------------|------|
| companion-joined | 0.6 | Recruited into party |
| companion-departed | 0.7 | Left the party (morale or dismissed) |
| companion-betrayed | 0.9 | Turned hostile and departed |
| companion-saved-player | 0.8 | Intercepted damage meant for player |
| companion-died | 1.0 | Fell in battle |

## Making NPCs Recruitable

To make an NPC recruitable in a content pack, add these to the entity definition:

```typescript
{
  id: 'brother-aldric',
  name: 'Brother Aldric',
  tags: ['npc', 'recruitable', 'healer'],
  custom: {
    companionRole: 'healer',
    companionAbilities: 'medical-support,witness-calming',
    personalGoal: 'Redeem the fallen brothers of the chapel',
  },
  // ... stats, resources, etc.
}
```

The `recruitable` tag makes them eligible. `custom.companionRole` and `custom.companionAbilities` provide defaults for recruitment.

## Design Constraints

**Max 3 companions**: More than 3 makes the party status line unwieldy, increases reaction evaluation overhead, and dilutes the emotional weight of each companion.

**Tags, not skill trees**: Tags are composable, pack-agnostic, and produce effects through multiplication into existing systems. A skill tree would require per-pack progression design.

**NPCs, not a new type**: Companions reuse NPC agency, obligations, loyalty breakpoints, consequence chains, and chronicle hooks. The delta is a `CompanionState` sidecar with role, morale, and abilities.
