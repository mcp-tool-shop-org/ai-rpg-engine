// combat-core — attack, damage, defeat

import type {
  EngineModule,
  ActionIntent,
  WorldState,
  ResolvedEvent,
  EntityState,
} from '@signalfire/core';
import { nextId } from '@signalfire/core';

export type CombatFormulas = {
  /** Calculate hit chance (0-100). Default: 50 + attacker.instinct * 5 - target.instinct * 3 */
  hitChance?: (attacker: EntityState, target: EntityState, world: WorldState) => number;
  /** Calculate damage. Default: attacker.vigor + weapon bonus */
  damage?: (attacker: EntityState, target: EntityState, world: WorldState) => number;
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
