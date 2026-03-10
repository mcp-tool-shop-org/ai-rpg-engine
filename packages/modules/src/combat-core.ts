// combat-core — attack, damage, defeat

import type {
  EngineModule,
  ActionIntent,
  WorldState,
  ResolvedEvent,
  EntityState,
} from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import { applyStatus, removeStatus, hasStatus } from './status-core.js';

/** Maps generic combat roles to starter-specific stat names */
export type CombatStatMapping = {
  /** Stat governing attack power / damage (default: 'vigor') */
  attack: string;
  /** Stat governing accuracy / evasion (default: 'instinct') */
  precision: string;
  /** Stat governing defense / mental resilience (default: 'will') */
  resolve: string;
};

export const DEFAULT_STAT_MAPPING: CombatStatMapping = {
  attack: 'vigor',
  precision: 'instinct',
  resolve: 'will',
};

export type CombatFormulas = {
  /** Maps generic combat roles to starter-specific stat names */
  statMapping?: CombatStatMapping;
  /** Calculate hit chance (0-100). Default: 50 + attacker.precision * 5 - target.precision * 3 */
  hitChance?: (attacker: EntityState, target: EntityState, world: WorldState) => number;
  /** Calculate damage. Default: attacker.attack stat */
  damage?: (attacker: EntityState, target: EntityState, world: WorldState) => number;
  /** Check if an entity is the player's ally (companion). Used for interception. */
  isAlly?: (entityId: string) => boolean;
  /** Fraction of damage absorbed when guarded (0-1). Default: 0.5 + resolve bonus (cap 0.75) */
  guardReduction?: (defender: EntityState, world: WorldState) => number;
  /** Success chance for disengage (0-100). Default: 40 + precision*5 + resolve*2 */
  disengageChance?: (actor: EntityState, world: WorldState) => number;
  /** Companion interception chance (0-100). Called per ally; first ally whose roll passes intercepts. */
  interceptChance?: (ally: EntityState, target: EntityState, world: WorldState) => number;
  /** Combat morale delta for damage taken. Return negative for loss. Overrides default will-scaled formula. */
  combatMoraleDelta?: (entity: EntityState, damage: number, world: WorldState) => number;
};

export const COMBAT_STATES = {
  GUARDED: 'combat:guarded',
  EXPOSED: 'combat:exposed',
  FLEEING: 'combat:fleeing',
} as const;

export function createCombatCore(formulas?: CombatFormulas): EngineModule {
  return {
    id: 'combat-core',
    version: '0.1.0',

    register(ctx) {
      ctx.actions.registerVerb('attack', (action, world) => attackHandler(action, world, formulas));
      ctx.actions.registerVerb('guard', (action, world) => guardHandler(action, world, formulas));
      ctx.actions.registerVerb('disengage', (action, world) => disengageHandler(action, world, formulas));

      ctx.persistence.registerNamespace('combat-core', {
        inCombat: false,
        combatants: [],
      });
    },
  };
}

/** Default combat module with basic formulas */
export const combatCore: EngineModule = createCombatCore();

function attackHandler(
  action: ActionIntent,
  world: WorldState,
  formulas?: CombatFormulas,
): ResolvedEvent[] {
  const events: ResolvedEvent[] = [];
  const attacker = world.entities[action.actorId];
  const targetId = action.targetIds?.[0];

  if (!attacker) {
    return [makeEvent(action, 'action.rejected', { reason: 'attacker not found' })];
  }

  if (!targetId) {
    return [makeEvent(action, 'action.rejected', { reason: 'no target specified' })];
  }

  const target = world.entities[targetId];
  if (!target) {
    return [makeEvent(action, 'action.rejected', { reason: `target ${targetId} not found` })];
  }

  // Check same zone
  if (attacker.zoneId !== target.zoneId) {
    return [makeEvent(action, 'action.rejected', { reason: 'target not in same zone' })];
  }

  // Check target is alive
  if ((target.resources.hp ?? 0) <= 0) {
    return [makeEvent(action, 'action.rejected', { reason: 'target is already defeated' })];
  }

  // Stamina cost
  const staminaCost = 1;
  const currentStamina = attacker.resources.stamina ?? 0;
  if (currentStamina < staminaCost) {
    return [makeEvent(action, 'action.rejected', { reason: 'not enough stamina' })];
  }
  attacker.resources.stamina = currentStamina - staminaCost;
  events.push(makeEvent(action, 'resource.changed', {
    entityId: attacker.id,
    resource: 'stamina',
    previous: currentStamina,
    current: attacker.resources.stamina,
    delta: -staminaCost,
  }));

  // Attacking clears own guarded status
  if (hasStatus(attacker, COMBAT_STATES.GUARDED)) {
    const removeEvt = removeStatus(attacker, COMBAT_STATES.GUARDED, world.meta.tick);
    if (removeEvt) events.push(removeEvt);
  }

  // Hit check with state modifiers
  const mapping = formulas?.statMapping ?? DEFAULT_STAT_MAPPING;
  let hitChance = formulas?.hitChance
    ? formulas.hitChance(attacker, target, world)
    : defaultHitChance(attacker, target, mapping);
  if (hasStatus(target, COMBAT_STATES.EXPOSED)) hitChance += 20;
  if (hasStatus(target, COMBAT_STATES.FLEEING)) hitChance += 10;
  hitChance = Math.min(95, Math.max(5, hitChance));

  // Use a simple deterministic roll based on tick + entity IDs
  const roll = simpleRoll(world.meta.tick, attacker.id, target.id);

  if (roll > hitChance) {
    events.push(makeEvent(action, 'combat.contact.miss', {
      attackerId: attacker.id,
      targetId: target.id,
      roll,
      hitChance,
    }, {
      targetIds: [target.id],
      presentation: { channels: ['objective'], priority: 'normal' },
    }));
    return events;
  }

  // Damage
  const damage = formulas?.damage
    ? formulas.damage(attacker, target, world)
    : defaultDamage(attacker, mapping);

  // Ally interception: if the target is the player and has companion allies in the same zone,
  // check if a companion intercepts the damage
  if (formulas?.isAlly && target.id === world.playerId) {
    const allies = Object.values(world.entities).filter(
      (e) => e.zoneId === target.zoneId && e.id !== target.id && e.id !== attacker.id
        && formulas.isAlly!(e.id)
        && (e.resources.hp ?? 0) > 0,
    );
    if (allies.length > 0) {
      // Find first ally whose interception roll passes
      let interceptor: EntityState | null = null;
      let interceptChanceUsed = 30; // default flat chance
      for (const ally of allies) {
        const chance = formulas.interceptChance
          ? formulas.interceptChance(ally, target, world)
          : 30;
        const interceptRoll = simpleRoll(world.meta.tick, target.id, ally.id);
        if (interceptRoll <= chance) {
          interceptor = ally;
          interceptChanceUsed = chance;
          break;
        }
      }

      if (interceptor) {
        const interceptorPrevHp = interceptor.resources.hp ?? 0;
        interceptor.resources.hp = Math.max(0, interceptorPrevHp - damage);

        events.push(makeEvent(action, 'combat.companion.intercepted', {
          interceptorId: interceptor.id,
          interceptorName: interceptor.name,
          targetId: target.id,
          attackerId: attacker.id,
          damage,
          interceptChance: interceptChanceUsed,
          interceptorHpBefore: interceptorPrevHp,
          interceptorHpAfter: interceptor.resources.hp,
        }, {
          targetIds: [interceptor.id, target.id],
          presentation: { channels: ['objective', 'narrator'], priority: 'high' },
        }));

        events.push(makeEvent(action, 'resource.changed', {
          entityId: interceptor.id,
          resource: 'hp',
          previous: interceptorPrevHp,
          current: interceptor.resources.hp,
          delta: -damage,
        }));

        // Check interceptor defeat
        if (interceptor.resources.hp <= 0) {
          events.push(makeEvent(action, 'combat.entity.defeated', {
            entityId: interceptor.id,
            entityName: interceptor.name,
            defeatedBy: attacker.id,
          }, {
            targetIds: [interceptor.id],
            presentation: { channels: ['objective', 'narrator'], priority: 'critical', soundCues: ['combat.defeat'] },
          }));
        }

        return events;
      }
    }
  }

  // Apply combat state modifiers to damage
  let finalDamage = damage;
  if (hasStatus(target, COMBAT_STATES.GUARDED)) {
    const targetResolve = getStat(target, mapping, 'resolve', 3);
    const resolveBonus = Math.max(0, (targetResolve - 3) * 0.03);
    const reduction = formulas?.guardReduction
      ? formulas.guardReduction(target, world)
      : Math.min(0.75, 0.5 + resolveBonus);
    const originalDamage = finalDamage;
    finalDamage = Math.max(1, Math.floor(finalDamage * (1 - reduction)));
    // Guard absorbs one hit then clears
    const guardRemoveEvt = removeStatus(target, COMBAT_STATES.GUARDED, world.meta.tick);
    if (guardRemoveEvt) events.push(guardRemoveEvt);
    events.push(makeEvent(action, 'combat.guard.absorbed', {
      entityId: target.id,
      entityName: target.name,
      originalDamage,
      reducedDamage: finalDamage,
    }, {
      targetIds: [target.id],
      presentation: { channels: ['objective'], priority: 'normal' },
    }));
  }
  if (hasStatus(target, COMBAT_STATES.EXPOSED)) {
    finalDamage += 2;
    const exposedRemoveEvt = removeStatus(target, COMBAT_STATES.EXPOSED, world.meta.tick);
    if (exposedRemoveEvt) events.push(exposedRemoveEvt);
  }

  const previousHp = target.resources.hp ?? 0;
  target.resources.hp = Math.max(0, previousHp - finalDamage);

  events.push(makeEvent(action, 'combat.contact.hit', {
    attackerId: attacker.id,
    targetId: target.id,
    roll,
    hitChance,
  }, {
    targetIds: [target.id],
    presentation: { channels: ['objective'], priority: 'normal' },
  }));

  events.push(makeEvent(action, 'combat.damage.applied', {
    attackerId: attacker.id,
    targetId: target.id,
    damage: finalDamage,
    previousHp,
    currentHp: target.resources.hp,
  }, {
    targetIds: [target.id],
    presentation: {
      channels: ['objective'],
      priority: 'high',
      soundCues: ['combat.hit'],
    },
  }));

  events.push(makeEvent(action, 'resource.changed', {
    entityId: target.id,
    resource: 'hp',
    previous: previousHp,
    current: target.resources.hp,
    delta: -finalDamage,
  }));

  // Defeat check
  if (target.resources.hp <= 0) {
    events.push(makeEvent(action, 'combat.entity.defeated', {
      entityId: target.id,
      entityName: target.name,
      defeatedBy: attacker.id,
    }, {
      targetIds: [target.id],
      presentation: {
        channels: ['objective', 'narrator'],
        priority: 'critical',
        soundCues: ['combat.defeat'],
      },
    }));
  }

  return events;
}

function guardHandler(
  action: ActionIntent,
  world: WorldState,
  _formulas?: CombatFormulas,
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

  // Clear existing guarded (no double-guard)
  if (hasStatus(actor, COMBAT_STATES.GUARDED)) {
    const removeEvt = removeStatus(actor, COMBAT_STATES.GUARDED, world.meta.tick);
    if (removeEvt) events.push(removeEvt);
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

  // Apply guarded status (expires after 2 ticks as safety net)
  events.push(applyStatus(actor, COMBAT_STATES.GUARDED, world.meta.tick, {
    duration: 2,
    sourceId: actor.id,
  }));

  events.push(makeEvent(action, 'combat.guard.start', {
    entityId: actor.id,
    entityName: actor.name,
  }, {
    presentation: { channels: ['objective'], priority: 'normal' },
  }));

  return events;
}

function disengageHandler(
  action: ActionIntent,
  world: WorldState,
  formulas?: CombatFormulas,
): ResolvedEvent[] {
  const events: ResolvedEvent[] = [];
  const actor = world.entities[action.actorId];

  if (!actor) {
    return [makeEvent(action, 'action.rejected', { reason: 'actor not found' })];
  }
  if ((actor.resources.hp ?? 0) <= 0) {
    return [makeEvent(action, 'action.rejected', { reason: 'actor is defeated' })];
  }

  const zoneState = world.zones[actor.zoneId ?? ''];
  if (!zoneState?.neighbors.length) {
    return [makeEvent(action, 'action.rejected', { reason: 'no exit from current zone' })];
  }

  const staminaCost = 1;
  const currentStamina = actor.resources.stamina ?? 0;
  if (currentStamina < staminaCost) {
    return [makeEvent(action, 'action.rejected', { reason: 'not enough stamina' })];
  }

  // Clear guarded (taking an action clears guard)
  if (hasStatus(actor, COMBAT_STATES.GUARDED)) {
    const removeEvt = removeStatus(actor, COMBAT_STATES.GUARDED, world.meta.tick);
    if (removeEvt) events.push(removeEvt);
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

  // Roll disengage chance
  const mapping = formulas?.statMapping ?? DEFAULT_STAT_MAPPING;
  const precision = getStat(actor, mapping, 'precision', 5);
  const resolve = getStat(actor, mapping, 'resolve', 3);
  const chance = formulas?.disengageChance
    ? formulas.disengageChance(actor, world)
    : Math.min(90, Math.max(15, 40 + precision * 5 + resolve * 2));
  const roll = simpleRoll(world.meta.tick, actor.id, 'disengage');

  if (roll <= chance) {
    // Success — apply fleeing, move to neighbor
    events.push(applyStatus(actor, COMBAT_STATES.FLEEING, world.meta.tick, {
      duration: 2,
      sourceId: actor.id,
    }));

    const fromZoneId = actor.zoneId;
    const toZoneId = zoneState.neighbors[0];
    actor.zoneId = toZoneId;

    events.push(makeEvent(action, 'combat.disengage.success', {
      entityId: actor.id,
      entityName: actor.name,
      fromZoneId,
      toZoneId,
    }, {
      presentation: { channels: ['objective'], priority: 'normal' },
    }));
  } else {
    // Failure — apply exposed
    events.push(applyStatus(actor, COMBAT_STATES.EXPOSED, world.meta.tick, {
      duration: 1,
      sourceId: actor.id,
    }));

    events.push(makeEvent(action, 'combat.disengage.fail', {
      entityId: actor.id,
      entityName: actor.name,
      roll,
      needed: chance,
    }, {
      presentation: { channels: ['objective'], priority: 'normal' },
    }));
  }

  return events;
}

/** Read a mapped stat from an entity, with fallback */
function getStat(entity: EntityState, mapping: CombatStatMapping, role: keyof CombatStatMapping, fallback: number): number {
  return entity.stats[mapping[role]] ?? fallback;
}

function defaultHitChance(attacker: EntityState, target: EntityState, mapping: CombatStatMapping): number {
  const attackerPrecision = getStat(attacker, mapping, 'precision', 5);
  const targetPrecision = getStat(target, mapping, 'precision', 5);
  return Math.min(95, Math.max(5, 50 + attackerPrecision * 5 - targetPrecision * 3));
}

function defaultDamage(attacker: EntityState, mapping: CombatStatMapping): number {
  const attack = getStat(attacker, mapping, 'attack', 3);
  return Math.max(1, attack);
}

/** Simple deterministic roll 1-100 based on tick and IDs */
export function simpleRoll(tick: number, attackerId: string, targetId: string): number {
  let hash = tick * 2654435761;
  for (const char of attackerId + targetId) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return (Math.abs(hash) % 100) + 1;
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
