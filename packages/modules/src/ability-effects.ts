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
import { nextId } from '@ai-rpg-engine/core';
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

const effectRegistry = new Map<string, AbilityEffectHandler>();

/** Register a custom effect handler (used by packs to extend the system) */
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
    // Use max from stats if available (e.g., stats.maxHp), otherwise no cap
    const maxKey = `max${resource.charAt(0).toUpperCase()}${resource.slice(1)}`;
    const max = target.stats[maxKey] ?? Infinity;
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
    });
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
    const maxKey = `max${resource.charAt(0).toUpperCase()}${resource.slice(1)}`;
    const max = target.stats[maxKey] ?? Infinity;
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

effectRegistry.set('damage', handleDamage);
effectRegistry.set('heal', handleHeal);
effectRegistry.set('apply-status', handleApplyStatus);
effectRegistry.set('remove-status', handleRemoveStatus);
effectRegistry.set('remove-status-by-tag', handleRemoveStatusByTag);
effectRegistry.set('resource-modify', handleResourceModify);
effectRegistry.set('stat-modify', handleStatModify);

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

// ---------------------------------------------------------------------------
// Event helper
// ---------------------------------------------------------------------------

function makeEvent(
  action: ActionIntent,
  type: string,
  payload: Record<string, unknown>,
  extra?: Partial<ResolvedEvent>,
): ResolvedEvent {
  return {
    id: nextId('evt'),
    tick: action.issuedAtTick,
    type,
    actorId: action.actorId,
    payload,
    ...extra,
  };
}
