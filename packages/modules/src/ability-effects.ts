// ability-effects — process EffectDefinition[] to change the world
// Handles: damage, heal, apply-status, remove-status, remove-status-by-tag, resource-modify, stat-modify
// Extensible via registerEffectHandler() for pack-defined effect types.

import type {
  EngineModule,
  ActionIntent,
  WorldState,
  ResolvedEvent,
  EntityState,
  ScalarValue,
} from '@ai-rpg-engine/core';
import { makeEvent } from './make-event.js';
import type { EffectDefinition, AbilityDefinition } from '@ai-rpg-engine/content-schema';
import { applyStatus, removeStatus } from './status-core.js';
import { checkResistance, applyResistanceToDuration, getStatusTags } from './status-semantics.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Context handed to each effect handler */
export type EffectContext = {
  ability: AbilityDefinition;
  actor: EntityState;
  targets: EntityState[];
  world: WorldState;
  tick: number;
  action: ActionIntent;
  /** Whether all stat checks passed (affects half-damage etc.) */
  allChecksPassed: boolean;
};

/** Handler for a single effect type */
export type AbilityEffectHandler = (
  effect: EffectDefinition,
  ctx: EffectContext,
) => ResolvedEvent[];

/** Config for createAbilityEffects */
export type AbilityEffectsConfig = {
  /** Additional custom effect handlers to register */
  customHandlers?: Record<string, AbilityEffectHandler>;
};

// ---------------------------------------------------------------------------
// Effect registry
// ---------------------------------------------------------------------------
//
// MC-04 assessment: this is a PROCESS-GLOBAL, append-only *handler* registry
// (effect type → pure handler function), not per-game world state. The built-in
// handlers ('damage', 'heal', 'apply-status', …) are universal code; an effect
// type means the same thing in every game, so sharing handlers across Engine
// instances is intentional. Registration is idempotent (keyed by type; last
// write wins) so a pack registering its custom handlers more than once is safe
// and never accumulates duplicates. Tests / multi-pack tooling that need to drop
// pack-added handlers call `clearEffectRegistry()` (which restores the built-in
// set). Threading a per-instance registry would require changing every call site
// that registers/dispatches effects (out of scope) and buys nothing for handler
// code that is definitionally global.

const effectRegistry = new Map<string, AbilityEffectHandler>();

/** Register a custom effect handler (used by packs to extend the system). Idempotent — re-registering a type overwrites, never duplicates. */
export function registerEffectHandler(
  type: string,
  handler: AbilityEffectHandler,
): void {
  effectRegistry.set(type, handler);
}

/** Get a registered handler (for testing/inspection) */
export function getEffectHandler(type: string): AbilityEffectHandler | undefined {
  return effectRegistry.get(type);
}

/**
 * Reset the effect registry to only the built-in handlers, dropping any
 * pack-registered custom handlers. Provided for test isolation and multi-pack
 * tooling — the supported way to keep one game's custom effect types from
 * leaking into another within the same process (see MC-04 note above).
 */
export function clearEffectRegistry(): void {
  effectRegistry.clear();
  registerBuiltinEffectHandlers();
}

// ---------------------------------------------------------------------------
// Built-in effect handlers
// ---------------------------------------------------------------------------

function resolveEffectTargets(
  effect: EffectDefinition,
  ctx: EffectContext,
): EntityState[] {
  switch (effect.target) {
    case 'actor':
      return [ctx.actor];
    case 'zone':
      // Zone effects target all entities in zone (excluding actor by default)
      return Object.values(ctx.world.entities).filter(
        (e) => e.zoneId === ctx.actor.zoneId && e.id !== ctx.actor.id && (e.resources.hp ?? 0) > 0,
      );
    case 'target':
    default:
      return ctx.targets;
  }
}

/**
 * Resolve the maximum for a resource, resources-first.
 *
 * The engine convention is that content stores caps alongside the resource
 * (e.g. `resources.maxHp`). We prefer that, fall back to `stats.maxHp` for
 * legacy fixtures, then to Infinity (no cap). Reading only `stats[maxKey]`
 * previously let heals and resource gains silently overheal real content,
 * because content never put maxHp in `stats` (MOD-PH-01). Mirrors the
 * precedence in ability-intent.ts `entityHpRatio`.
 */
function resourceMax(target: EntityState, resource: string): number {
  const maxKey = `max${resource.charAt(0).toUpperCase()}${resource.slice(1)}`;
  return target.resources[maxKey] ?? target.stats[maxKey] ?? Infinity;
}

/** damage — reduce HP, emit damage events, trigger defeat if HP <= 0 */
function handleDamage(effect: EffectDefinition, ctx: EffectContext): ResolvedEvent[] {
  const events: ResolvedEvent[] = [];
  const baseDamage = (effect.params.amount as number) ?? 0;
  const damageType = (effect.params.damageType as string) ?? 'ability';
  const targets = resolveEffectTargets(effect, ctx);

  // Half damage if any check failed (and ability didn't abort)
  const multiplier = ctx.allChecksPassed ? 1.0 : 0.5;
  const finalDamage = Math.max(1, Math.round(baseDamage * multiplier));

  for (const target of targets) {
    const hpBefore = target.resources.hp ?? 0;
    target.resources.hp = Math.max(0, hpBefore - finalDamage);
    const hpAfter = target.resources.hp;

    events.push(makeEvent(ctx.action, 'ability.damage.applied', {
      abilityId: ctx.ability.id,
      abilityName: ctx.ability.name,
      actorId: ctx.actor.id,
      targetId: target.id,
      targetName: target.name,
      baseDamage,
      finalDamage,
      damageType,
      halfDamage: !ctx.allChecksPassed,
      hpBefore,
      hpAfter,
    }, {
      targetIds: [target.id],
      tags: ['ability', 'damage', damageType],
    }));

    // Check for defeat
    if (hpAfter <= 0 && hpBefore > 0) {
      events.push(makeEvent(ctx.action, 'combat.entity.defeated', {
        entityId: target.id,
        entityName: target.name,
        cause: 'ability',
        abilityId: ctx.ability.id,
        abilityName: ctx.ability.name,
        attackerId: ctx.actor.id,
        attackerName: ctx.actor.name,
      }, {
        targetIds: [target.id],
        tags: ['combat', 'defeat', 'ability'],
        presentation: { channels: ['objective', 'narrator'], priority: 'high' },
      }));
    }
  }

  return events;
}

/** heal — restore HP or other resources, capped at max */
function handleHeal(effect: EffectDefinition, ctx: EffectContext): ResolvedEvent[] {
  const events: ResolvedEvent[] = [];
  const amount = (effect.params.amount as number) ?? 0;
  const resource = (effect.params.resource as string) ?? 'hp';
  const targets = resolveEffectTargets(effect, ctx);

  for (const target of targets) {
    const before = target.resources[resource] ?? 0;
    // Resources-first cap precedence (matches ability-intent.ts entityHpRatio):
    // content stores the max in resources.maxHp (the engine convention); fall
    // back to stats.maxHp for legacy fixtures, then to no cap. Reading only
    // stats.maxHp made heals silently overheal for real content (MOD-PH-01).
    const max = resourceMax(target, resource);
    target.resources[resource] = Math.min(max, before + amount);
    const after = target.resources[resource];

    events.push(makeEvent(ctx.action, 'ability.heal.applied', {
      abilityId: ctx.ability.id,
      abilityName: ctx.ability.name,
      actorId: ctx.actor.id,
      targetId: target.id,
      targetName: target.name,
      resource,
      amount,
      actual: after - before,
      before,
      after,
    }, {
      targetIds: [target.id],
      tags: ['ability', 'heal'],
    }));
  }

  return events;
}

/** apply-status — delegates to status-core applyStatus(), with resistance checking */
function handleApplyStatus(effect: EffectDefinition, ctx: EffectContext): ResolvedEvent[] {
  const events: ResolvedEvent[] = [];
  const statusId = effect.params.statusId as string;
  const baseDuration = (effect.params.duration as number) ?? undefined;
  const stacking = (effect.params.stacking as 'replace' | 'stack' | 'refresh') ?? 'replace';
  const maxStacks = (effect.params.maxStacks as number) ?? undefined;
  const targets = resolveEffectTargets(effect, ctx);

  for (const target of targets) {
    // --- Unregistered-status warning (warn-and-degrade) ---
    // If the status carries no registered semantic tags, it was never added via
    // registerStatusDefinitions(). Resistance checks and tag-based cleanses can't
    // see it, so surface a structured dev signal (mirrors 'ability.effect.unknown')
    // naming the id and how to fix it — but still apply the status (MOD-PH-04).
    if (getStatusTags(statusId).length === 0) {
      events.push(makeEvent(ctx.action, 'ability.status.unregistered', {
        abilityId: ctx.ability.id,
        abilityName: ctx.ability.name,
        actorId: ctx.actor.id,
        targetId: target.id,
        targetName: target.name,
        statusId,
        reason: `status "${statusId}" is not registered (no semantic tags found); ` +
          `resistance and tag-cleanse will not apply to it. ` +
          `Register it via registerStatusDefinitions([{ id: "${statusId}", ... }]).`,
      }, {
        targetIds: [target.id],
        tags: ['ability', 'status', 'dev-warning'],
      }));
    }

    // --- Resistance check ---
    const resistance = checkResistance(target, statusId);

    if (resistance === 'immune') {
      events.push(makeEvent(ctx.action, 'ability.status.immune', {
        abilityId: ctx.ability.id,
        abilityName: ctx.ability.name,
        actorId: ctx.actor.id,
        targetId: target.id,
        targetName: target.name,
        statusId,
        resistance: 'immune',
      }, {
        targetIds: [target.id],
        tags: ['ability', 'status', 'resistance'],
      }));
      continue; // Skip application entirely
    }

    const adjustedDuration = applyResistanceToDuration(baseDuration, resistance);

    // Emit resistance interaction events (resisted or vulnerable)
    if (resistance === 'resistant') {
      events.push(makeEvent(ctx.action, 'ability.status.resisted', {
        abilityId: ctx.ability.id,
        abilityName: ctx.ability.name,
        actorId: ctx.actor.id,
        targetId: target.id,
        targetName: target.name,
        statusId,
        resistance: 'resistant',
        baseDuration,
        adjustedDuration,
      }, {
        targetIds: [target.id],
        tags: ['ability', 'status', 'resistance'],
      }));
    } else if (resistance === 'vulnerable') {
      events.push(makeEvent(ctx.action, 'ability.status.vulnerable', {
        abilityId: ctx.ability.id,
        abilityName: ctx.ability.name,
        actorId: ctx.actor.id,
        targetId: target.id,
        targetName: target.name,
        statusId,
        resistance: 'vulnerable',
        baseDuration,
        adjustedDuration,
      }, {
        targetIds: [target.id],
        tags: ['ability', 'status', 'resistance'],
      }));
    }

    const statusEvent = applyStatus(target, statusId, ctx.tick, {
      stacking,
      maxStacks,
      duration: adjustedDuration,
      sourceId: ctx.actor.id,
    }, ctx.world);
    events.push(statusEvent);

    // Also emit an ability-scoped status event for tracing
    events.push(makeEvent(ctx.action, 'ability.status.applied', {
      abilityId: ctx.ability.id,
      abilityName: ctx.ability.name,
      actorId: ctx.actor.id,
      targetId: target.id,
      targetName: target.name,
      statusId,
      duration: adjustedDuration,
      baseDuration,
      resistance: resistance ?? 'normal',
      stacking,
    }, {
      targetIds: [target.id],
      tags: ['ability', 'status'],
    }));
  }

  return events;
}

/** remove-status — delegates to status-core removeStatus() */
function handleRemoveStatus(effect: EffectDefinition, ctx: EffectContext): ResolvedEvent[] {
  const events: ResolvedEvent[] = [];
  const statusId = effect.params.statusId as string;
  const targets = resolveEffectTargets(effect, ctx);

  for (const target of targets) {
    const statusEvent = removeStatus(target, statusId, ctx.tick);
    if (statusEvent) {
      events.push(statusEvent);

      events.push(makeEvent(ctx.action, 'ability.status.removed', {
        abilityId: ctx.ability.id,
        abilityName: ctx.ability.name,
        targetId: target.id,
        targetName: target.name,
        statusId,
      }, {
        targetIds: [target.id],
        tags: ['ability', 'status'],
      }));
    }
  }

  return events;
}

/** resource-modify — add or subtract any resource */
function handleResourceModify(effect: EffectDefinition, ctx: EffectContext): ResolvedEvent[] {
  const events: ResolvedEvent[] = [];
  const resource = effect.params.resource as string;
  const delta = (effect.params.amount as number) ?? 0;
  const targets = resolveEffectTargets(effect, ctx);

  for (const target of targets) {
    const before = target.resources[resource] ?? 0;
    // Same resources-first cap precedence as handleHeal (MOD-PH-01).
    const max = resourceMax(target, resource);
    target.resources[resource] = Math.min(max, Math.max(0, before + delta));
    const after = target.resources[resource];

    events.push(makeEvent(ctx.action, 'ability.resource.modified', {
      abilityId: ctx.ability.id,
      abilityName: ctx.ability.name,
      targetId: target.id,
      targetName: target.name,
      resource,
      delta,
      actual: after - before,
      before,
      after,
    }, {
      targetIds: [target.id],
      tags: ['ability', 'resource'],
    }));
  }

  return events;
}

/** stat-modify — temporarily adjust stats (persists until removed by other means) */
function handleStatModify(effect: EffectDefinition, ctx: EffectContext): ResolvedEvent[] {
  const events: ResolvedEvent[] = [];
  const stat = effect.params.stat as string;
  const delta = (effect.params.amount as number) ?? 0;
  const targets = resolveEffectTargets(effect, ctx);

  for (const target of targets) {
    const before = target.stats[stat] ?? 0;
    target.stats[stat] = before + delta;
    const after = target.stats[stat];

    events.push(makeEvent(ctx.action, 'ability.stat.modified', {
      abilityId: ctx.ability.id,
      abilityName: ctx.ability.name,
      targetId: target.id,
      targetName: target.name,
      stat,
      delta,
      before,
      after,
    }, {
      targetIds: [target.id],
      tags: ['ability', 'stat'],
    }));
  }

  return events;
}

/** remove-status-by-tag — removes all statuses matching any of the given semantic tags */
function handleRemoveStatusByTag(effect: EffectDefinition, ctx: EffectContext): ResolvedEvent[] {
  const events: ResolvedEvent[] = [];
  const targets = resolveEffectTargets(effect, ctx);

  // Accept 'tag' (single) or 'tags' (comma-separated string) params
  // Note: EffectDefinition.params uses ScalarValue, so arrays aren't supported — use comma-separated strings
  const tagsParam = effect.params.tags as string | undefined;
  const tagParam = effect.params.tag as string | undefined;
  const rawTags = tagsParam ?? tagParam ?? '';
  const cleanTags: string[] = rawTags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (cleanTags.length === 0) return events;

  const tagSet = new Set(cleanTags);

  for (const target of targets) {
    // Find statuses whose registered tags overlap with the cleanse tags
    const toRemove = target.statuses.filter((status) => {
      const statusTags = getStatusTags(status.statusId);
      return statusTags.some((t) => tagSet.has(t));
    });

    for (const status of toRemove) {
      const removeEvent = removeStatus(target, status.statusId, ctx.tick);
      if (removeEvent) {
        events.push(removeEvent);

        events.push(makeEvent(ctx.action, 'ability.status.removed', {
          abilityId: ctx.ability.id,
          abilityName: ctx.ability.name,
          targetId: target.id,
          targetName: target.name,
          statusId: status.statusId,
          removedByTag: true,
          matchedTags: getStatusTags(status.statusId).filter((t) => tagSet.has(t)),
        }, {
          targetIds: [target.id],
          tags: ['ability', 'status', 'cleanse'],
        }));
      }
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Register built-in handlers
// ---------------------------------------------------------------------------

/** (Re)install the universal built-in effect handlers. Idempotent. */
function registerBuiltinEffectHandlers(): void {
  effectRegistry.set('damage', handleDamage);
  effectRegistry.set('heal', handleHeal);
  effectRegistry.set('apply-status', handleApplyStatus);
  effectRegistry.set('remove-status', handleRemoveStatus);
  effectRegistry.set('remove-status-by-tag', handleRemoveStatusByTag);
  effectRegistry.set('resource-modify', handleResourceModify);
  effectRegistry.set('stat-modify', handleStatModify);
}

registerBuiltinEffectHandlers();

// ---------------------------------------------------------------------------
// Core resolution function
// ---------------------------------------------------------------------------

/**
 * Resolve all effects of an ability against the world.
 * Called from ability-core after costs are deducted and checks pass.
 */
export function resolveEffects(
  ability: AbilityDefinition,
  actor: EntityState,
  targets: EntityState[],
  world: WorldState,
  tick: number,
  action: ActionIntent,
  allChecksPassed: boolean,
): ResolvedEvent[] {
  if (!ability.effects || ability.effects.length === 0) return [];

  const ctx: EffectContext = {
    ability,
    actor,
    targets,
    world,
    tick,
    action,
    allChecksPassed,
  };

  const events: ResolvedEvent[] = [];

  for (const effect of ability.effects) {
    const handler = effectRegistry.get(effect.type);
    if (!handler) {
      events.push(makeEvent(action, 'ability.effect.unknown', {
        abilityId: ability.id,
        effectType: effect.type,
        reason: `no handler registered for effect type: ${effect.type}`,
      }));
      continue;
    }
    events.push(...handler(effect, ctx));
  }

  // Emit resolved event after all effects
  events.push(makeEvent(action, 'ability.resolved', {
    abilityId: ability.id,
    abilityName: ability.name,
    actorId: actor.id,
    targetIds: targets.map((t) => t.id),
    effectCount: ability.effects.length,
    allChecksPassed,
  }, {
    targetIds: targets.map((t) => t.id),
    tags: ['ability'],
    presentation: { channels: ['objective'], priority: 'normal' },
  }));

  return events;
}

// ---------------------------------------------------------------------------
// Module factory
// ---------------------------------------------------------------------------

/**
 * Create the ability-effects module.
 * Listens for `ability.used` events and resolves effects.
 * Must be registered AFTER ability-core.
 */
export function createAbilityEffects(config?: AbilityEffectsConfig): EngineModule {
  // Register any custom handlers from config
  if (config?.customHandlers) {
    for (const [type, handler] of Object.entries(config.customHandlers)) {
      effectRegistry.set(type, handler);
    }
  }

  return {
    id: 'ability-effects',
    version: '0.1.0',
    dependsOn: ['ability-core', 'status-core'],

    register(_ctx) {
      // Effects are resolved inline by ability-core calling resolveEffects().
      // This module's register just validates the dependency chain.
      // Custom handlers are registered via the config or registerEffectHandler().
    },
  };
}

