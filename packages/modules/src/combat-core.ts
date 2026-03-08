// combat-core — attack, damage, defeat

import type {
  EngineModule,
  ActionIntent,
  WorldState,
  ResolvedEvent,
  EntityState,
} from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';

export type CombatFormulas = {
  /** Calculate hit chance (0-100). Default: 50 + attacker.instinct * 5 - target.instinct * 3 */
  hitChance?: (attacker: EntityState, target: EntityState, world: WorldState) => number;
  /** Calculate damage. Default: attacker.vigor + weapon bonus */
  damage?: (attacker: EntityState, target: EntityState, world: WorldState) => number;
  /** Check if an entity is the player's ally (companion). Used for interception. */
  isAlly?: (entityId: string) => boolean;
};

export function createCombatCore(formulas?: CombatFormulas): EngineModule {
  return {
    id: 'combat-core',
    version: '0.1.0',

    register(ctx) {
      ctx.actions.registerVerb('attack', (action, world) => attackHandler(action, world, formulas));

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

  // Hit check
  const hitChance = formulas?.hitChance
    ? formulas.hitChance(attacker, target, world)
    : defaultHitChance(attacker, target);

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
    : defaultDamage(attacker);

  // Ally interception: if the target is the player and has companion allies in the same zone,
  // there's a 30% chance a companion intercepts the damage
  if (formulas?.isAlly && target.id === world.playerId) {
    const allies = Object.values(world.entities).filter(
      (e) => e.zoneId === target.zoneId && e.id !== target.id && e.id !== attacker.id
        && formulas.isAlly!(e.id)
        && (e.resources.hp ?? 0) > 0,
    );
    if (allies.length > 0) {
      const interceptRoll = simpleRoll(world.meta.tick, target.id, allies[0].id);
      if (interceptRoll <= 30) {
        // Companion intercepts
        const interceptor = allies[0];
        const interceptorPrevHp = interceptor.resources.hp ?? 0;
        interceptor.resources.hp = Math.max(0, interceptorPrevHp - damage);

        events.push(makeEvent(action, 'combat.companion.intercepted', {
          interceptorId: interceptor.id,
          interceptorName: interceptor.name,
          targetId: target.id,
          attackerId: attacker.id,
          damage,
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

  const previousHp = target.resources.hp ?? 0;
  target.resources.hp = Math.max(0, previousHp - damage);

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
    damage,
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
    delta: -damage,
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

function defaultHitChance(attacker: EntityState, target: EntityState): number {
  const attackerInstinct = attacker.stats.instinct ?? 5;
  const targetInstinct = target.stats.instinct ?? 5;
  return Math.min(95, Math.max(5, 50 + attackerInstinct * 5 - targetInstinct * 3));
}

function defaultDamage(attacker: EntityState): number {
  const vigor = attacker.stats.vigor ?? 3;
  return Math.max(1, vigor);
}

/** Simple deterministic roll 1-100 based on tick and IDs */
function simpleRoll(tick: number, attackerId: string, targetId: string): number {
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
