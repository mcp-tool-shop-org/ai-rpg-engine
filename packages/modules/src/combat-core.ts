// combat-core — attack, damage, defeat

import type {
  EngineModule,
  ActionIntent,
  WorldState,
  ResolvedEvent,
  EntityState,
} from '@ai-rpg-engine/core';
import { applyStatus, removeStatus, hasStatus } from './status-core.js';
import { makeEvent } from './make-event.js';
import { effectiveStat } from './status-effects.js';
import { affiliationOf } from './targeting.js';

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
  /**
   * Check if an entity is the player's ally (companion). Used for
   * interception. `world` (F-64580086) lets a caller resolve it purely from
   * live entity state (e.g. buildCombatFormulas' `tags.includes('companion')`
   * default) without needing a closure captured at pack-build time, before
   * any world exists. Optional second parameter — existing single-arg
   * closures (`(id) => id === 'companion'`, pinned by combat-states.test.ts)
   * remain valid values for this type; JS ignores the extra argument.
   */
  isAlly?: (entityId: string, world: WorldState) => boolean;
  /** Fraction of damage absorbed when guarded (0-1). Default: 0.5 + resolve bonus (cap 0.75) */
  guardReduction?: (defender: EntityState, world: WorldState) => number;
  /** Success chance for disengage (0-100). Default: 40 + precision*5 + resolve*2 */
  disengageChance?: (actor: EntityState, world: WorldState) => number;
  /** Companion interception chance (0-100). Called per ally; first ally whose roll passes intercepts. */
  interceptChance?: (ally: EntityState, target: EntityState, world: WorldState) => number;
  /** Combat morale delta for damage taken. Return negative for loss. Overrides default will-scaled formula. */
  combatMoraleDelta?: (entity: EntityState, damage: number, world: WorldState) => number;
  /** Whether a target should be eligible for ally interception. Default: player only. */
  shouldIntercept?: (target: EntityState, world: WorldState) => boolean;
};

export const COMBAT_STATES = {
  GUARDED: 'combat:guarded',
  OFF_BALANCE: 'combat:off_balance',
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
    : defaultHitChance(attacker, target, mapping, world);
  if (hasStatus(target, COMBAT_STATES.EXPOSED)) hitChance += 20;
  if (hasStatus(target, COMBAT_STATES.FLEEING)) hitChance += 10;
  if (hasStatus(target, COMBAT_STATES.OFF_BALANCE)) hitChance += 10;
  if (hasStatus(attacker, COMBAT_STATES.OFF_BALANCE)) hitChance -= 15;
  hitChance = Math.min(95, Math.max(5, hitChance));

  // Use a simple deterministic roll based on world seed + tick + entity IDs
  const roll = simpleRoll(world.meta.tick, attacker.id, target.id, world.meta.seed);

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
    : defaultDamage(attacker, mapping, world);

  // Ally interception: if the target qualifies (player or backline) and has allies in zone,
  // check if an engaged companion intercepts the damage
  const shouldCheck = formulas?.shouldIntercept
    ? formulas.shouldIntercept(target, world)
    : (target.id === world.playerId);
  if (formulas?.isAlly && shouldCheck) {
    const allies = Object.values(world.entities).filter(
      (e) => e.zoneId === target.zoneId && e.id !== target.id && e.id !== attacker.id
        && formulas.isAlly!(e.id, world)
        && (e.resources.hp ?? 0) > 0
        && !hasStatus(e, COMBAT_STATES.FLEEING)
        && (target.id === world.playerId || e.statuses.some(s => s.statusId === 'engagement:engaged')),
    );
    if (allies.length > 0) {
      // Find first ally whose interception roll passes
      let interceptor: EntityState | null = null;
      let interceptChanceUsed = 30; // default flat chance
      const mapping = formulas?.statMapping ?? DEFAULT_STAT_MAPPING;
      for (const ally of allies) {
        const chance = formulas.interceptChance
          ? formulas.interceptChance(ally, target, world)
          : defaultInterceptChance(ally, target, world, mapping);
        const interceptRoll = simpleRoll(world.meta.tick, target.id, ally.id, world.meta.seed);
        if (interceptRoll <= chance) {
          interceptor = ally;
          interceptChanceUsed = chance;
          break;
        }
      }

      if (interceptor) {
        // Recompute damage against the INTERCEPTOR's own context, and route
        // it through the SAME guard/exposed/off-balance modifier block a
        // normal hit gets (F-8da23635). Previously this reused the RAW
        // `damage` computed against the ORIGINAL target — wrong for any
        // defender-aware custom formula (guardReduction/hitChance all take
        // (attacker, target, world), so damage should too) — and never even
        // checked the interceptor's own GUARDED status, silently wasting it.
        const interceptRawDamage = formulas?.damage
          ? formulas.damage(attacker, interceptor, world)
          : defaultDamage(attacker, mapping, world);
        const interceptorPrevHp = interceptor.resources.hp ?? 0;
        const interceptDamage = applyDefenseModifiers(
          action, attacker, interceptor, interceptRawDamage, mapping, formulas, world, events,
        );
        interceptor.resources.hp = Math.max(0, interceptorPrevHp - interceptDamage);

        events.push(makeEvent(action, 'combat.companion.intercepted', {
          interceptorId: interceptor.id,
          interceptorName: interceptor.name,
          targetId: target.id,
          targetName: target.name,
          attackerId: attacker.id,
          damage: interceptDamage,
          interceptChance: interceptChanceUsed,
          interceptorHpBefore: interceptorPrevHp,
          interceptorHpAfter: interceptor.resources.hp,
          interceptorMaxHp: interceptor.resources.maxHp ?? 20,
        }, {
          targetIds: [interceptor.id, target.id],
          presentation: { channels: ['objective', 'narrator'], priority: 'high' },
        }));

        events.push(makeEvent(action, 'resource.changed', {
          entityId: interceptor.id,
          resource: 'hp',
          previous: interceptorPrevHp,
          current: interceptor.resources.hp,
          delta: -interceptDamage,
        }));

        // Check interceptor defeat
        if (interceptor.resources.hp <= 0) {
          events.push(makeEvent(action, 'combat.entity.defeated', {
            entityId: interceptor.id,
            entityName: interceptor.name,
            defeatedBy: attacker.id,
            defeatedByName: attacker.name,
            defeatZoneId: interceptor.zoneId ?? '',
            wasInterceptor: true,
          }, {
            targetIds: [interceptor.id],
            presentation: { channels: ['objective', 'narrator'], priority: 'critical', soundCues: ['combat.defeat'] },
          }));
        }

        return events;
      }
    }
  }

  // Apply combat state modifiers to damage (guard/exposed/off-balance),
  // shared with the companion-interception path above (F-8da23635).
  const finalDamage = applyDefenseModifiers(action, attacker, target, damage, mapping, formulas, world, events);

  const previousHp = target.resources.hp ?? 0;
  target.resources.hp = Math.max(0, previousHp - finalDamage);

  // Hit style: distinguish precision hits from forceful blows
  const atkAttack = getStat(attacker, mapping, 'attack', 5, world);
  const atkPrecision = getStat(attacker, mapping, 'precision', 5, world);
  const hitStyle = atkPrecision > atkAttack ? 'precise'
    : atkAttack > atkPrecision ? 'forceful'
    : 'balanced';

  events.push(makeEvent(action, 'combat.contact.hit', {
    attackerId: attacker.id,
    targetId: target.id,
    roll,
    hitChance,
    hitStyle,
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
      defeatedByName: attacker.name,
      defeatZoneId: target.zoneId ?? '',
      wasInterceptor: false,
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

/**
 * Apply guard/exposed/off-balance damage modifiers for a defender taking a
 * hit, pushing any resulting events (guard absorption, counter off-balance,
 * guard breakthrough, exposed/off-balance bonus damage) into `events`, and
 * returning the final damage. Shared by the normal attack path (defender =
 * target) and the companion-interception path (defender = interceptor) so an
 * intercepting companion's own GUARDED/EXPOSED/OFF_BALANCE status is honored
 * exactly like a direct hit's would be, instead of being silently ignored
 * (F-8da23635).
 */
function applyDefenseModifiers(
  action: ActionIntent,
  attacker: EntityState,
  defender: EntityState,
  rawDamage: number,
  mapping: CombatStatMapping,
  formulas: CombatFormulas | undefined,
  world: WorldState,
  events: ResolvedEvent[],
): number {
  let finalDamage = rawDamage;
  if (hasStatus(defender, COMBAT_STATES.GUARDED)) {
    const defenderResolve = getStat(defender, mapping, 'resolve', 3, world);
    const resolveBonus = Math.max(0, (defenderResolve - 3) * 0.03);
    const reduction = formulas?.guardReduction
      ? formulas.guardReduction(defender, world)
      : Math.min(0.75, 0.5 + resolveBonus);
    const originalDamage = finalDamage;
    finalDamage = Math.max(1, Math.floor(finalDamage * (1 - reduction)));
    // Guard absorbs one hit then clears
    const guardRemoveEvt = removeStatus(defender, COMBAT_STATES.GUARDED, world.meta.tick);
    if (guardRemoveEvt) events.push(guardRemoveEvt);
    events.push(makeEvent(action, 'combat.guard.absorbed', {
      entityId: defender.id,
      entityName: defender.name,
      originalDamage,
      reducedDamage: finalDamage,
    }, {
      targetIds: [defender.id],
      presentation: { channels: ['objective'], priority: 'normal' },
    }));

    // Soft counter: attacking into guard may off-balance the attacker
    // Instinct (timing) + will (composure) determine counter chance
    const counterRoll = simpleRoll(world.meta.tick, attacker.id, 'counter', world.meta.seed);
    const defenderInstinct = getStat(defender, mapping, 'precision', 5, world);
    const counterChance = 25 + defenderInstinct * 2 + defenderResolve * 2;
    if (counterRoll <= counterChance && !hasStatus(attacker, COMBAT_STATES.OFF_BALANCE)) {
      events.push(applyStatus(attacker, COMBAT_STATES.OFF_BALANCE, world.meta.tick, {
        duration: 1,
        sourceId: defender.id,
      }, world));
      events.push(makeEvent(action, 'combat.counter.off_balance', {
        entityId: attacker.id,
        entityName: attacker.name,
        causedBy: defender.id,
        causedByName: defender.name,
      }, {
        targetIds: [attacker.id],
        presentation: { channels: ['objective', 'narrator'], priority: 'normal' },
      }));
    }

    // Guard breakthrough: high-vigor attacker may stagger a weak-willed defender
    const attackerVigor = getStat(attacker, mapping, 'attack', 5, world);
    const breakChance = Math.min(25, Math.max(0, (attackerVigor - defenderResolve - 2) * 5));
    if (breakChance > 0) {
      const breakRoll = simpleRoll(world.meta.tick, attacker.id, 'guardbreak', world.meta.seed);
      if (breakRoll <= breakChance) {
        if (!hasStatus(defender, COMBAT_STATES.OFF_BALANCE)) {
          events.push(applyStatus(defender, COMBAT_STATES.OFF_BALANCE, world.meta.tick, {
            duration: 1,
            sourceId: attacker.id,
          }, world));
        }
        events.push(makeEvent(action, 'combat.guard.broken', {
          attackerId: attacker.id,
          attackerName: attacker.name,
          targetId: defender.id,
          targetName: defender.name,
          attackerVigor,
          defenderResolve,
          breakChance,
        }, {
          targetIds: [defender.id],
          presentation: { channels: ['objective', 'narrator'], priority: 'high' },
        }));
      }
    }
  }
  if (hasStatus(defender, COMBAT_STATES.EXPOSED)) {
    finalDamage += 2;
    const exposedRemoveEvt = removeStatus(defender, COMBAT_STATES.EXPOSED, world.meta.tick);
    if (exposedRemoveEvt) events.push(exposedRemoveEvt);
  }
  if (hasStatus(defender, COMBAT_STATES.OFF_BALANCE)) {
    finalDamage += 1;
  }
  return finalDamage;
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
  }, world));

  events.push(makeEvent(action, 'combat.guard.start', {
    entityId: actor.id,
    entityName: actor.name,
  }, {
    presentation: { channels: ['objective'], priority: 'normal' },
  }));

  return events;
}

/** Pick the safest neighbor zone to flee to. Prefers non-chokepoint zones with allies and no enemies. */
function selectBestExit(neighbors: string[], world: WorldState, actor: EntityState): string {
  if (neighbors.length <= 1) return neighbors[0];
  let bestId = neighbors[0];
  let bestScore = -1;
  for (const nid of neighbors) {
    const nzone = world.zones[nid];
    let score = 0;
    if (!nzone?.tags?.includes('chokepoint')) score += 5;
    const nEntities = Object.values(world.entities).filter(
      e => e.zoneId === nid && (e.resources.hp ?? 0) > 0,
    );
    // Friend/foe via the faction predicate (M3 family): flee toward allies —
    // a same-faction, different-`type` companion counts as an ally.
    if (nEntities.some(e => affiliationOf(actor, e) === 'ally')) score += 5;
    if (!nEntities.some(e => affiliationOf(actor, e) === 'enemy')) score += 5;
    if (score > bestScore) {
      bestScore = score;
      bestId = nid;
    }
  }
  return bestId;
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
  const precision = getStat(actor, mapping, 'precision', 5, world);
  const resolve = getStat(actor, mapping, 'resolve', 3, world);
  const chance = formulas?.disengageChance
    ? formulas.disengageChance(actor, world)
    : Math.min(90, Math.max(15, 40 + precision * 5 + resolve * 2));
  const roll = simpleRoll(world.meta.tick, actor.id, 'disengage', world.meta.seed);

  if (roll <= chance) {
    // Success — apply fleeing, move to neighbor
    events.push(applyStatus(actor, COMBAT_STATES.FLEEING, world.meta.tick, {
      duration: 2,
      sourceId: actor.id,
    }, world));

    const fromZoneId = actor.zoneId;
    const toZoneId = selectBestExit(zoneState.neighbors, world, actor);
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
    }, world));

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

/**
 * Resolve an entity's combat stat mapping (CR-1, per-entity rule resolution).
 *
 * When the entity carries a `ruleProfileId` that resolves to a profile in
 * `world.ruleProfiles`, that profile's `statMapping` wins — so a `might` fighter
 * and a `will` mystic read their OWN `attack`/`precision`/`resolve` stat names in
 * the same fight, off ONE formula set (feature-architecture §C, finding 1). When
 * the entity has no profile (or the id doesn't resolve) the passed-in `fallback`
 * is returned unchanged. The fallback is always the world/formula mapping, never a
 * bare DEFAULT_STAT_MAPPING, which preserves custom-mapping starters (e.g.
 * weird-west's attack→grit) — the real chain is
 * `entity profile → world mapping → DEFAULT`.
 *
 * Pure and deterministic — a plain map lookup, no clock/RNG. Exported so
 * buildCombatFormulas' pluggable closures resolve per-entity too (Change B); a
 * `RuleProfile.statMapping` is structurally identical to `CombatStatMapping`.
 */
export function resolveEntityMapping(
  entity: EntityState,
  world: WorldState,
  fallback: CombatStatMapping,
): CombatStatMapping {
  const pid = entity.ruleProfileId;
  if (pid) {
    const prof = world.ruleProfiles?.[pid];
    if (prof?.statMapping) return prof.statMapping;
  }
  return fallback;
}

/**
 * Read a mapped stat from an entity, resolving the mapping PER-ENTITY first
 * (CR-1) then through `effectiveStat` so passive status modifiers (buffs/debuffs)
 * still reach combat (design-lock capability 1). The `mapping` argument is now the
 * FALLBACK: each read resolves against the passed entity's own RuleProfile mapping
 * when it has one, else `mapping`. Because every call site already passes the
 * specific entity for the read (`getStat(attacker, …)` vs `getStat(target, …)`),
 * this makes attacker reads use the attacker's mapping and target reads use the
 * target's — the Source-vs-Target split — with no call-site change. When the entity
 * has no profile and no status modifiers, the result is `entity.stats[statId] ??
 * fallback`, byte-identical to the pre-CR-1 read, so existing callers are unchanged.
 */
function getStat(
  entity: EntityState,
  mapping: CombatStatMapping,
  role: keyof CombatStatMapping,
  fallback: number,
  world: WorldState,
): number {
  const resolved = resolveEntityMapping(entity, world, mapping);
  return effectiveStat(entity, resolved[role], world, fallback);
}

function defaultHitChance(attacker: EntityState, target: EntityState, mapping: CombatStatMapping, world: WorldState): number {
  const attackerPrecision = getStat(attacker, mapping, 'precision', 5, world);
  const targetPrecision = getStat(target, mapping, 'precision', 5, world);
  return Math.min(95, Math.max(5, 50 + attackerPrecision * 5 - targetPrecision * 3));
}

function defaultDamage(attacker: EntityState, mapping: CombatStatMapping, world: WorldState): number {
  const attack = getStat(attacker, mapping, 'attack', 3, world);
  return Math.max(1, attack);
}

// ---------------------------------------------------------------------------
// Interception formula
// ---------------------------------------------------------------------------

const INTERCEPT_ROLE_BONUS: Record<string, number> = {
  'role:bodyguard': 15, 'role:brute': 5, 'role:elite': 5, 'role:sentinel': 8,
  'role:skirmisher': -8, 'role:backliner': -10, 'role:coward': -12, 'role:minion': -5,
  'companion:fighter': 8, 'companion:scout': -5, 'companion:healer': -8,
  'companion:diplomat': -10, 'companion:smuggler': -5, 'companion:scholar': -10,
};

function getInterceptRoleBonus(entity: EntityState): number {
  const roleTag = entity.tags.find(t => t.startsWith('role:'));
  if (roleTag && INTERCEPT_ROLE_BONUS[roleTag] !== undefined) return INTERCEPT_ROLE_BONUS[roleTag];
  const compTag = entity.tags.find(t => t.startsWith('companion:'));
  if (compTag && INTERCEPT_ROLE_BONUS[compTag] !== undefined) return INTERCEPT_ROLE_BONUS[compTag];
  return 0;
}

/** Scored interception chance based on stats, HP, morale, combat states, and role. */
export function defaultInterceptChance(
  ally: EntityState, _target: EntityState, world: WorldState, mapping: CombatStatMapping,
): number {
  const instinct = getStat(ally, mapping, 'precision', 5, world);
  const will = getStat(ally, mapping, 'resolve', 3, world);
  const hp = ally.resources.hp ?? 0;
  const maxHp = ally.resources.maxHp ?? 20;
  const hpRatio = maxHp > 0 ? hp / maxHp : 0;

  // Morale from cognition-core (default 70 if not loaded)
  const cogMod = (world.modules?.['cognition-core'] ?? undefined) as
    { entityCognition?: Record<string, { morale?: number }> } | undefined;
  const morale = cogMod?.entityCognition?.[ally.id]?.morale ?? 70;

  let chance = 8;
  chance += Math.floor(instinct * 2.5);                    // reaction speed
  chance += Math.max(0, Math.floor((will - 3) * 1.5));    // composure
  chance += Math.floor(hpRatio * 8);                       // health
  if (hpRatio < 0.25) chance -= 15;                        // critical HP penalty
  chance += Math.floor((morale - 50) * 0.15);             // morale
  if (hasStatus(ally, COMBAT_STATES.FLEEING)) return 0;    // hard block
  if (hasStatus(ally, COMBAT_STATES.OFF_BALANCE)) chance -= 10;
  if (hasStatus(ally, COMBAT_STATES.GUARDED)) chance += 8;
  chance += getInterceptRoleBonus(ally);                   // role tags

  return Math.max(5, Math.min(90, chance));
}

/**
 * Simple deterministic roll 1-100 based on tick, IDs, and the world seed.
 *
 * `seed` (world.meta.seed) is a PURE hash input, deliberately NOT drawn from
 * the store's stateful RNG: consuming store.rng here would couple every roll
 * to global draw ORDER (an extra NPC turn would shift all later rolls),
 * breaking the stateless-per-tick property — same world state, same outcome —
 * that replay and save/load parity depend on.
 *
 * seed 0 (the default) preserves the legacy stream byte-for-byte, so callers
 * that do not thread a seed keep their historical outcomes. 40503 is odd, so
 * seed mixing is a bijection mod 2^32 — no two seeds in range share a stream.
 * The roll range is unchanged: 1-100 inclusive.
 */
export function simpleRoll(tick: number, attackerId: string, targetId: string, seed = 0): number {
  let hash = tick * 2654435761 + seed * 40503;
  for (const char of attackerId + targetId) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return (Math.abs(hash) % 100) + 1;
}

