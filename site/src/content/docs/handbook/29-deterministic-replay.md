---
title: "Chapter 23 — Deterministic Replay"
description: "Deterministic Replay"
sidebar:
  order: 29
---


> Part VII — Debugging and Tools

Action log replay.

## How It Works

Every player action is recorded in an action log alongside the random seed used for that session. Because the engine is deterministic, replaying the same actions with the same seed produces the exact same sequence of events.

## Running a Replay

```bash
ai-rpg-engine replay
```

The engine re-executes every recorded action and verifies that the resulting events match the original session.

## Debugging Workflows

Replay is the primary debugging tool for AI RPG Engine:

1. **Reproduce a bug** — replay the session that triggered it
2. **Isolate the cause** — add logging or breakpoints and replay again
3. **Verify the fix** — replay the same session after changing code

Because events are deterministic, a bug that happened once will happen every time on replay.

## Regression Testing

Action logs can be committed to the repository as regression tests. If a code change causes different events from the same inputs, the replay will fail — catching unintended behavior changes automatically.

## Example

```
3 actions → 13 events (deterministic)

Action 1: move crypt    → 4 events
Action 2: attack ghoul  → 6 events
Action 3: use draught   → 3 events
```

Every replay of this session produces exactly these 13 events in the same order.
