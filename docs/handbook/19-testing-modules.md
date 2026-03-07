# Chapter 19 — Testing Modules

> Part V — Building Modules

Use the test harness for deterministic module testing.

## The Test Harness

AI RPG Engine provides `createTestEngine()` to spin up isolated engine instances for testing:

```typescript
import { createTestEngine } from '@ai-rpg-engine/core';

const engine = createTestEngine({
  modules: [createMyModule()],
  ruleset: myRuleset,
  content: myContent,
});
```

## Harness Utilities

| Utility | Purpose |
|---------|---------|
| `engine.store` | Access world state and emit events |
| `engine.world` | Read current world state |
| `drainEvents()` | Collect and clear pending events |
| `entity(id)` | Quick access to an entity |
| `player()` | Quick access to the player entity |
| `currentZone()` | Get the player's current zone |

## Writing Deterministic Tests

Because the engine uses seeded randomness, tests produce identical results on every run:

```typescript
test('meditation restores will', () => {
  const engine = createTestEngine({ ... });

  engine.store.dispatch({ verb: 'meditate', actor: 'player' });

  const events = drainEvents();
  expect(events).toContainEqual(
    expect.objectContaining({ type: 'meditation.completed' })
  );
  expect(entity('player').resources.stamina).toBeGreaterThan(0);
});
```

## Testing Module Interactions

The harness supports loading multiple modules together, allowing you to test cross-module behavior:

```typescript
const engine = createTestEngine({
  modules: [
    createCombatCore(),
    createCognitionCore(),
    createPerceptionFilter(),
  ],
  // ...
});
```

This is how the Phase 3 integration tests verify that combat events flow through perception into cognition updates.
