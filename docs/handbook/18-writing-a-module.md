# Chapter 18 — Writing a Module

> Part V — Building Modules

A guide to extending the engine.

## Module Structure

Every module exports a factory function that returns a `ModuleDefinition`:

```typescript
export function createMyModule(config?: MyConfig): ModuleDefinition {
  return {
    id: 'my-module',
    register(ctx) {
      // register verbs
      // subscribe to events
      // register formulas
    },
    init(world) {
      // set up initial state
    },
    teardown(world) {
      // clean up
    },
  };
}
```

## Lifecycle

| Phase | Method | Purpose |
|-------|--------|---------|
| Registration | `register(ctx)` | Wire event listeners, verbs, formulas |
| Initialization | `init(world)` | Set up module state in world |
| Teardown | `teardown(world)` | Clean up on engine shutdown |

## Registering Verbs

Verbs are player-facing actions. Register them during `register()`:

```typescript
ctx.verbs.register('meditate', (world, action) => {
  // resolve the action, produce events
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

Store module-specific data in `world.moduleState`:

```typescript
init(world) {
  world.moduleState['my-module'] = { activeMeditations: [] };
}
```

This keeps module state organized and prevents collisions between modules.
