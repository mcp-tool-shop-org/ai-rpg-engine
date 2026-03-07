---
title: "Chapter 5 — The Event System"
description: "The Event System"
sidebar:
  order: 5
---


> Part II — Engine Architecture

Events are the bloodstream of AI RPG Engine.

## Topics

- **Event structure** — domain, object, verb, payload
- **Event vocabulary** — naming conventions and patterns
- **Event routing** — specific listeners, domain wildcards, catch-all
- **Event presentation channels** — how events reach the player

## Event Examples

```
combat.contact.hit
combat.entity.defeated
status.applied
dialogue.node.entered
world.zone.entered
audio.cue.requested
environment.noise.changed
progression.node.unlocked
```

## How Modules Subscribe

Modules receive an `EventRegistry` during initialization. They subscribe to specific event types, domain wildcards (`combat.*`), or the catch-all (`*`) to respond to simulation changes.

Events are processed synchronously in subscription order, ensuring deterministic behavior across replays.
