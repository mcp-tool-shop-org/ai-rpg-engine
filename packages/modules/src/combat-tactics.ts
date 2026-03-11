/**
 * Combat Tactics — tactical triangle: attack / guard / brace / disengage / reposition.
 *
 * Adds `brace` and `reposition` verbs to the combat system.
 * Brace grants GUARDED + anti-displacement (internal braced flag).
 * Reposition moves for tactical advantage within combat zones.
 *
 * Soft counter relationships:
 * - guard soft-counters attack (attacker may become off-balance)
 * - brace soft-counters reposition and forceful attacks
 * - attack soft-counters disengage (existing)
 * - reposition soft-counters static guard
 * - disengage soft-counters stalled engagements
 *
 * Only 4 visible combat states: guarded, off_balance, exposed, fleeing.
 * Brace uses an internal round flag, not a 5th visible state.
 */

import type {
  EngineModule,
  ActionIntent,
  WorldState,
  ResolvedEvent,
  EntityState,
} from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import { applyStatus, removeStatus, hasStatus } from './status-core.js';
import { COMBAT_STATES, simpleRoll, DEFAULT_STAT_MAPPING } from './combat-core.js';
import type { CombatFormulas, CombatStatMapping } from './combat-core.js';
import { ENGAGEMENT_STATES } from './engagement-core.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CombatActionKind =
  | 'attack'
  | 'guard'
  | 'brace'
  | 'disengage'
  | 'reposition';

export type CombatZone = 'engaged' | 'protected' | 'exposed';

export type CombatRole = 'frontliner' | 'backliner';

export type BattlefieldTag = 'chokepoint' | 'ambush_entry';

export type CombatIntent = {
  actorId: string;
  action: CombatActionKind;
  targetId?: string;
  destinationZone?: CombatZone;
};

export type RoundFlags = {
  braced?: boolean;
  bracedAtChokepoint?: boolean;
  guarding?: boolean;
  attemptedDisengage?: boolean;
  attemptedReposition?: boolean;
};

/** Hook points for pack-specific resource modifiers */
export type TacticalHooks = {
  /** Modify action outcome before resolution. Return adjusted values. */
  preAction?: (action: CombatActionKind, actor: EntityState, world: WorldState) => {
    hitBonus?: number;
    damageBonus?: number;
    guardBonus?: number;
    repositionBonus?: number;
  };
  /** Modify defense calculation. */
  defenseModifier?: (defender: EntityState, action: CombatActionKind, world: WorldState) => {
    damageReduction?: number;
    displacementResist?: number;
  };
  /** Modify movement/repositioning outcomes. */
  movementModifier?: (actor: EntityState, action: CombatActionKind, world: WorldState) => {
    successBonus?: number;
    exposureReduction?: boolean;
  };
  /** Post-resolution trigger for resource effects. */
  afterAction?: (action: CombatActionKind, actor: EntityState, events: ResolvedEvent[], world: WorldState) => ResolvedEvent[];
};

export type CombatTacticsConfig = {
  formulas?: CombatFormulas;
  hooks?: TacticalHooks;
  /** Chance (0-100) that brace negates off-balance application. Default: 70 */
  braceStabilizeChance?: number;
  /** Chance (0-100) that reposition succeeds. Default: base 45 + precision*5 */
  repositionBaseChance?: number;
  /** Chance (0-100) that reposition against guarded target outflanks. Default: 60 */
  outflankChance?: number;
};

// ---------------------------------------------------------------------------
// Round flags — per-entity per-tick tracking
// ---------------------------------------------------------------------------

const roundFlagsMap = new Map<string, RoundFlags>();

export function getRoundFlags(entityId: string): RoundFlags {
  return roundFlagsMap.get(entityId) ?? {};
}

export function setRoundFlag(entityId: string, flag: keyof RoundFlags, value: boolean): void {
  const flags = roundFlagsMap.get(entityId) ?? {};
  flags[flag] = value;
  roundFlagsMap.set(entityId, flags);
}

export function clearRoundFlags(): void {
  roundFlagsMap.clear();
}

export function clearEntityRoundFlags(entityId: string): void {
  roundFlagsMap.delete(entityId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStat(entity: EntityState, mapping: CombatStatMapping, role: keyof CombatStatMapping, fallback: number): number {
  return entity.stats[mapping[role]] ?? fallback;
}

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

function getEntitiesInZone(world: WorldState, zoneId: string): EntityState[] {
  return Object.values(world.entities).filter(
    e => e.zoneId === zoneId && (e.resources.hp ?? 0) > 0,
  );
}

function getEnemiesInZone(world: WorldState, entity: EntityState): EntityState[] {
  if (!entity.zoneId) return [];
  return getEntitiesInZone(world, entity.zoneId).filter(
    e => e.id !== entity.id && e.type !== entity.type,
  );
}

// ---------------------------------------------------------------------------
// Brace handler
// ---------------------------------------------------------------------------

function braceHandler(
  action: ActionIntent,
  world: WorldState,
  config?: CombatTacticsConfig,
): ResolvedEvent[] {
  const events: ResolvedEvent[] = [];
  const actor = world.entities[action.actorId];

  if (!actor) {
    return [makeEvent(action, 'action.rejected', { reason: 'actor not found' })];
  }
  if ((actor.resources.hp ?? 0) <= 0) {
    return [makeEvent(action, 'action.rejected', { reason: 'actor is defeated' })];
  }

  const staminaCost = 1;
  const currentStamina = actor.resources.stamina ?? 0;
  if (currentStamina < staminaCost) {
    return [makeEvent(action, 'action.rejected', { reason: 'not enough stamina' })];
  }

  // Deduct stamina
  actor.resources.stamina = currentStamina - staminaCost;
  events.push(makeEvent(action, 'resource.changed', {
    entityId: actor.id,
    resource: 'stamina',
    previous: currentStamina,
    current: actor.resources.stamina,
    delta: -staminaCost,
  }));

  // Clear existing guarded (will be re-applied)
  if (hasStatus(actor, COMBAT_STATES.GUARDED)) {
    const removeEvt = removeStatus(actor, COMBAT_STATES.GUARDED, world.meta.tick);
    if (removeEvt) events.push(removeEvt);
  }

  // Apply GUARDED status (same as guard, duration 2)
  events.push(applyStatus(actor, COMBAT_STATES.GUARDED, world.meta.tick, {
    duration: 2,
    sourceId: actor.id,
  }));

  // Set internal braced flag — grants displacement resistance
  setRoundFlag(actor.id, 'braced', true);

  // Brace is stronger at chokepoints — set flag for stabilize listener
  const zone = world.zones[actor.zoneId ?? ''];
  const atChokepoint = zone?.tags?.includes('chokepoint') ?? false;
  if (atChokepoint) {
    setRoundFlag(actor.id, 'bracedAtChokepoint', true);
  }

  // Brace clears off-balance (stabilization)
  if (hasStatus(actor, COMBAT_STATES.OFF_BALANCE)) {
    const removeEvt = removeStatus(actor, COMBAT_STATES.OFF_BALANCE, world.meta.tick);
    if (removeEvt) events.push(removeEvt);
    events.push(makeEvent(action, 'combat.brace.stabilized', {
      entityId: actor.id,
      entityName: actor.name,
    }, {
      presentation: { channels: ['objective'], priority: 'normal' },
    }));
  }

  events.push(makeEvent(action, 'combat.brace.start', {
    entityId: actor.id,
    entityName: actor.name,
    atChokepoint,
  }, {
    presentation: { channels: ['objective', 'narrator'], priority: 'normal' },
  }));

  // Apply hook aftermath
  if (config?.hooks?.afterAction) {
    const hookEvents = config.hooks.afterAction('brace', actor, events, world);
    events.push(...hookEvents);
  }

  return events;
}

// ---------------------------------------------------------------------------
// Reposition handler
// ---------------------------------------------------------------------------

function repositionHandler(
  action: ActionIntent,
  world: WorldState,
  config?: CombatTacticsConfig,
): ResolvedEvent[] {
  const events: ResolvedEvent[] = [];
  const actor = world.entities[action.actorId];

  if (!actor) {
    return [makeEvent(action, 'action.rejected', { reason: 'actor not found' })];
  }
  if ((actor.resources.hp ?? 0) <= 0) {
    return [makeEvent(action, 'action.rejected', { reason: 'actor is defeated' })];
  }

  const staminaCost = 1;
  const currentStamina = actor.resources.stamina ?? 0;
  if (currentStamina < staminaCost) {
    return [makeEvent(action, 'action.rejected', { reason: 'not enough stamina' })];
  }

  // Deduct stamina
  actor.resources.stamina = currentStamina - staminaCost;
  events.push(makeEvent(action, 'resource.changed', {
    entityId: actor.id,
    resource: 'stamina',
    previous: currentStamina,
    current: actor.resources.stamina,
    delta: -staminaCost,
  }));

  // Repositioning clears own guarded (you're moving, not defending)
  if (hasStatus(actor, COMBAT_STATES.GUARDED)) {
    const removeEvt = removeStatus(actor, COMBAT_STATES.GUARDED, world.meta.tick);
    if (removeEvt) events.push(removeEvt);
  }

  setRoundFlag(actor.id, 'attemptedReposition', true);

  const mapping = config?.formulas?.statMapping ?? { attack: 'vigor', precision: 'instinct', resolve: 'will' };
  const precision = getStat(actor, mapping, 'precision', 5);

  // Base reposition chance
  const baseChance = config?.repositionBaseChance ?? (45 + precision * 5);
  let chance = baseChance;

  // Modifiers
  if (hasStatus(actor, COMBAT_STATES.OFF_BALANCE)) chance -= 20;
  if (hasStatus(actor, ENGAGEMENT_STATES.ENGAGED)) chance -= 10;
  if (hasStatus(actor, ENGAGEMENT_STATES.BACKLINE)) chance += 10;
  const repoZone = world.zones[actor.zoneId ?? ''];
  if (repoZone?.tags?.includes('chokepoint')) chance -= 15;

  // Hook modifier
  if (config?.hooks?.movementModifier) {
    const mod = config.hooks.movementModifier(actor, 'reposition', world);
    chance += mod.successBonus ?? 0;
  }

  chance = Math.min(90, Math.max(10, chance));

  // Check if any enemy in zone is braced (brace counters reposition)
  const enemies = getEnemiesInZone(world, actor);
  const bracedDefender = enemies.find(e => getRoundFlags(e.id).braced);
  if (bracedDefender) {
    chance -= 20; // Braced defender makes repositioning harder
  }

  // Check if target is guarded (reposition soft-counters static guard)
  const targetId = action.targetIds?.[0];
  const target = targetId ? world.entities[targetId] : null;
  const targetGuarded = target && hasStatus(target, COMBAT_STATES.GUARDED);
  if (targetGuarded) {
    chance += 15; // Easier to outmaneuver a static guard
  }

  const roll = simpleRoll(world.meta.tick, actor.id, 'reposition');

  if (roll <= chance) {
    // Success — reposition grants tactical advantage
    events.push(makeEvent(action, 'combat.reposition.success', {
      entityId: actor.id,
      entityName: actor.name,
      targetId: targetId ?? null,
      roll,
      needed: chance,
    }, {
      presentation: { channels: ['objective', 'narrator'], priority: 'normal' },
    }));

    // If targeting a specific enemy, make them exposed (outflanked)
    if (target && (target.resources.hp ?? 0) > 0) {
      // Outflank check — repositioning around a target can expose them
      const outflankChance = config?.outflankChance ?? 60;
      const outflankRoll = simpleRoll(world.meta.tick, actor.id, target.id + '-outflank');
      if (outflankRoll <= outflankChance && !hasStatus(target, COMBAT_STATES.EXPOSED)) {
        events.push(applyStatus(target, COMBAT_STATES.EXPOSED, world.meta.tick, {
          duration: 1,
          sourceId: actor.id,
        }));
        events.push(makeEvent(action, 'combat.reposition.outflank', {
          entityId: actor.id,
          entityName: actor.name,
          targetId: target.id,
          targetName: target.name,
        }, {
          targetIds: [target.id],
          presentation: { channels: ['objective', 'narrator'], priority: 'high' },
        }));

        // If target was guarded, clear it (outmaneuvered)
        if (targetGuarded) {
          const guardRemove = removeStatus(target, COMBAT_STATES.GUARDED, world.meta.tick);
          if (guardRemove) events.push(guardRemove);
          events.push(makeEvent(action, 'combat.reposition.guard_broken', {
            entityId: target.id,
            entityName: target.name,
            brokenBy: actor.id,
          }, {
            targetIds: [target.id],
            presentation: { channels: ['objective', 'narrator'], priority: 'high' },
          }));
        }
      }
    }

    // If no target, actor is repositioning for positional advantage
    // Clear actor's own exposed/off-balance if present
    if (!target) {
      if (hasStatus(actor, COMBAT_STATES.EXPOSED)) {
        const removeEvt = removeStatus(actor, COMBAT_STATES.EXPOSED, world.meta.tick);
        if (removeEvt) events.push(removeEvt);
      }
      if (hasStatus(actor, COMBAT_STATES.OFF_BALANCE)) {
        const removeEvt = removeStatus(actor, COMBAT_STATES.OFF_BALANCE, world.meta.tick);
        if (removeEvt) events.push(removeEvt);
      }
    }
  } else {
    // Failure — exposed while repositioning under pressure
    if (!hasStatus(actor, COMBAT_STATES.EXPOSED)) {
      events.push(applyStatus(actor, COMBAT_STATES.EXPOSED, world.meta.tick, {
        duration: 1,
        sourceId: actor.id,
      }));
    }

    events.push(makeEvent(action, 'combat.reposition.fail', {
      entityId: actor.id,
      entityName: actor.name,
      targetId: targetId ?? null,
      roll,
      needed: chance,
    }, {
      presentation: { channels: ['objective', 'narrator'], priority: 'normal' },
    }));
  }

  // Apply hook aftermath
  if (config?.hooks?.afterAction) {
    const hookEvents = config.hooks.afterAction('reposition', actor, events, world);
    events.push(...hookEvents);
  }

  return events;
}

// ---------------------------------------------------------------------------
// Module factory
// ---------------------------------------------------------------------------

export function createCombatTactics(config?: CombatTacticsConfig): EngineModule {
  return {
    id: 'combat-tactics',
    version: '1.0.0',
    dependsOn: ['combat-core', 'status-core'],

    register(ctx) {
      ctx.actions.registerVerb('brace', (action, world) => braceHandler(action, world, config));
      ctx.actions.registerVerb('reposition', (action, world) => repositionHandler(action, world, config));

      // Clear round flags at the start of each tick
      ctx.events.on('tick.start', () => {
        clearRoundFlags();
      });

      // Track guard action via round flags
      ctx.events.on('combat.guard.start', (event: ResolvedEvent) => {
        const entityId = event.payload.entityId as string;
        setRoundFlag(entityId, 'guarding', true);
      });

      // Guard action clears off-balance (spending a turn to stabilize)
      ctx.events.on('combat.guard.start', (event: ResolvedEvent, world: WorldState) => {
        const entityId = event.payload.entityId as string;
        const entity = world.entities[entityId];
        if (entity && hasStatus(entity, COMBAT_STATES.OFF_BALANCE)) {
          removeStatus(entity, COMBAT_STATES.OFF_BALANCE, event.tick);
        }
      });

      // Brace resists off-balance application
      ctx.events.on('status.applied', (event: ResolvedEvent, world: WorldState) => {
        const statusId = event.payload.statusId as string;
        if (statusId !== COMBAT_STATES.OFF_BALANCE) return;

        const entityId = event.actorId ?? (event.payload.entityId as string);
        if (!entityId) return;
        const flags = getRoundFlags(entityId);
        if (!flags.braced) return;

        // Braced entities resist off-balance (vigor = physical force to hold ground)
        const entity = world.entities[entityId];
        if (entity) {
          const entityMapping = config?.formulas?.statMapping ?? DEFAULT_STAT_MAPPING;
          const entityVigor = entity.stats[entityMapping.attack] ?? 5;
          let stabilizeChance = config?.braceStabilizeChance ?? Math.min(90, 40 + entityVigor * 6);
          if (flags.bracedAtChokepoint) stabilizeChance += 15;
          const roll = simpleRoll(event.tick, entityId, 'stabilize');
          if (roll <= stabilizeChance) {
            removeStatus(entity, COMBAT_STATES.OFF_BALANCE, event.tick);
          }
        }
      });

      ctx.persistence.registerNamespace('combat-tactics', {
        version: '1.0.0',
      });
    },
  };
}
