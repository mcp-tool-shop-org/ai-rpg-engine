---
title: "Chapter 18 — Writing a Module"
description: "Writing a Module"
sidebar:
  order: 18
---


> Part V — Building Modules

A guide to extending the engine.

## Module Structure

Every module implements the `EngineModule` interface. Modules can be exported as constants (for stateless modules) or as factory functions (when they need configuration):

```typescript
import type { EngineModule } from '@ai-rpg-engine/core';

// Factory function pattern (when config is needed)
export function createMyModule(config?: MyConfig): EngineModule {
  return {
    id: 'my-module',
    version: '1.0.0',
    register(ctx) {
      // register verbs, subscribe to events, register formulas
    },
    init(ctx) {
      // set up initial state after all modules are registered
    },
    teardown() {
      // clean up on engine shutdown
    },
  };
}

// Constant pattern (for stateless modules)
export const myModule: EngineModule = {
  id: 'my-module',
  version: '1.0.0',
  register(ctx) { /* ... */ },
};
```

## Lifecycle

| Phase | Method | Purpose |
|-------|--------|---------|
| Registration | `register(ctx)` | Wire event listeners, verbs, formulas, persistence namespaces |
| Initialization | `init(ctx)` | Set up module state after all modules are registered |
| Teardown | `teardown()` | Clean up on engine shutdown |

The `ctx` parameter is a `ModuleRegistrationContext` providing access to `actions`, `rules`, `events`, `content`, `persistence`, `ui`, `debug`, and `formulas` registries.

## Registering Verbs

Verbs are player-facing actions. Register them via `ctx.actions.registerVerb()`:

```typescript
ctx.actions.registerVerb('meditate', (action, world) => {
  // resolve the action, return events
  return [{ id: nextId(), tick: world.meta.tick, type: 'meditation.completed', payload: {} }];
});
```

## Subscribing to Events

Listen for simulation events to react to changes:

```typescript
ctx.events.on('combat.contact.hit', (event, world) => {
  // respond to combat hits
});
```

## Registering Formulas

Contribute calculations that other modules can use:

```typescript
ctx.formulas.register('meditation-recovery', (entity, world) => {
  return entity.stats.will * 2;
});
```

## Namespaced State

Register a persistence namespace to store module-specific data in `world.modules`:

```typescript
register(ctx) {
  ctx.persistence.registerNamespace('my-module', { activeMeditations: [] });
}
```

The engine deep-clones default state during initialization (via `structuredClone`), so module state must be serializable -- no functions, no circular references. Access your module's state at runtime via `world.modules['my-module']`.

This keeps module state organized and prevents collisions between modules.
