---
title: "Chapter 5 — The Event System"
description: "The Event System"
sidebar:
  order: 5
---


> Part II — Engine Architecture

Events are the bloodstream of AI RPG Engine. Every meaningful state change produces a `ResolvedEvent`, and every module reacts by listening for events it cares about.

---

## Event Structure

Each event carries a standard shape:

| Field | Type | Purpose |
|-------|------|---------|
| `id` | `string` | Unique event identifier |
| `tick` | `number` | When the event occurred |
| `type` | `string` | Domain-qualified event name |
| `actorId` | `string?` | Entity that caused the event |
| `targetIds` | `string[]?` | Entities affected |
| `payload` | `Record<string, unknown>` | Event-specific data |
| `tags` | `string[]?` | Searchable labels |
| `visibility` | `'public' \| 'private' \| 'hidden'` | Who can see the event |
| `presentation` | `EventPresentation?` | Channels, priority, sound cues |
| `causedBy` | `string?` | ID of the event that triggered this one |

---

## Event Naming Convention

Events follow the pattern: `domain.object.verb`

```
combat.contact.hit       — an attack connected
combat.entity.defeated   — an entity's HP reached zero
status.applied           — a status effect was added
dialogue.node.entered    — conversation reached a new node
world.zone.entered       — entity moved into a zone
environment.noise.changed — zone noise level changed
progression.node.unlocked — tree node was unlocked
```

The `domain` groups related events (combat, status, dialogue, world, environment). The `object` narrows the scope. The `verb` describes what happened.

---

## Event Routing

Modules subscribe to events during registration through the `EventRegistry`:

```typescript
// Exact match — react only to combat hits
ctx.events.on('combat.contact.hit', (event, world) => {
  // update beliefs, compute noise, etc.
});

// All events (catch-all) — useful for logging or replay
ctx.events.on('*', (event, world) => {
  console.log(`[tick ${event.tick}] ${event.type}`);
});
```

Events are processed synchronously in subscription order within a single tick. This guarantees deterministic behavior: given the same modules registered in the same order, the same events will trigger the same listeners in the same sequence.

---

## Presentation Channels

Events can specify how they should be presented to the player through the `presentation` field:

| Channel | Purpose |
|---------|---------|
| `objective` | Factual game state changes (damage numbers, movement) |
| `narrator` | Narrative descriptions for the presentation layer |
| `dialogue` | Conversation content |
| `system` | Engine-level messages |
| `glitch` | Distortion and unreliable signals |

Priority levels (`low`, `normal`, `high`, `critical`) help the presentation layer decide which events to emphasize. Sound cues can be attached to events for audio integration.

---

## The Event Log

Every emitted event is recorded in `world.eventLog`. This complete history supports:

- **Debugging** — inspect what happened and in what order
- **Replay** — reproduce exact event sequences from the same actions
- **Querying** — modules can search past events to inform decisions
- **Observability** — tooling can display event streams filtered by domain, entity, or zone

See [Appendix A](./appendix-a-event-vocabulary.md) for the full list of built-in event types.
