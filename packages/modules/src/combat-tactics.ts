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
import { makeEvent } from './make-event.js';
import { applyStatus, removeStatus, hasStatus } from './status-core.js';
import { COMBAT_STATES, simpleRoll, DEFAULT_STAT_MAPPING } from './combat-core.js';
import type { CombatFormulas, CombatStatMapping } from './combat-core.js';
import { ENGAGEMENT_STATES } from './engagement-core.js';
import { affiliationOf } from './targeting.js';

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
//
// MC-02: flags used to be cleared on a `tick.start` event the engine never
// emits, so once an entity braced, the off_balance-resist roll and the
// reposition penalty fired forever. Each flag is now stamped with the tick it
// was set, and a flag counts as "active" only on that tick or the immediately
// following tick (see isRoundFlagActive). The active window spans two ticks
// because brace and the opponent's reaction are separate actions, and the engine
// advances meta.tick once per action — so a same-round interaction reads as tick
// N (brace) and tick N+1 (reaction).

/** Internal: per-flag tick stamp (the tick the flag was last set). */
type RoundFlagTicks = Partial<Record<keyof RoundFlags, number>>;

/**
 * Module persistence shape (F-80a6afa2). Round flags used to live in a
 * module-top-level `Map`, shared by EVERY Engine instance in the process —
 * the same anti-pattern combat-intent.ts's defeatLog had before its fix. Two
 * concurrent worlds (a server hosting multiple sessions, or many tests in one
 * file reusing entity ids) with an entity sharing an id would cross-
 * contaminate: an off-balance-resist roll or a reposition-vs-braced-defender
 * check could fire based on a DIFFERENT world's brace action. Flags now live
 * in `world.modules['combat-tactics']`, re-fetched fresh on every access —
 * the same pattern rumor-propagation.ts/district-core.ts use.
 */
type ModuleState = {
  version: string;
  roundFlags: Record<string, RoundFlagTicks>;
};

function getModuleState(world: WorldState): ModuleState {
  return (world.modules['combat-tactics'] ?? { version: '1.0.0', roundFlags: {} }) as ModuleState;
}

/** A round flag is active on the tick it was set or the immediately next tick. */
function isRoundFlagActiveAt(world: WorldState, entityId: string, flag: keyof RoundFlags, tick: number): boolean {
  const t = getModuleState(world).roundFlags[entityId]?.[flag];
  return t !== undefined && (t === tick || t === tick - 1);
}

/**
 * Public boolean view of an entity's round flags, scoped to `world`. A flag
 * reads `true` when it has been set at all (back-compat for callers/tests
 * that inspect set-state); tick-scoped activeness for game logic goes through
 * isRoundFlagActiveAt.
 */
export function getRoundFlags(world: WorldState, entityId: string): RoundFlags {
  const ticks = getModuleState(world).roundFlags[entityId];
  if (!ticks) return {};
  const view: RoundFlags = {};
  for (const key of Object.keys(ticks) as (keyof RoundFlags)[]) {
    if (ticks[key] !== undefined) view[key] = true;
  }
  return view;
}

/**
 * Set or clear a round flag, stamping the tick it was set. `tick` is required so
 * the flag can be aged out deterministically; callers pass world.meta.tick /
 * event.tick. (Optional only for back-compat with the re-exported signature —
 * omitting it stamps tick 0, which all internal callers avoid.)
 */
export function setRoundFlag(world: WorldState, entityId: string, flag: keyof RoundFlags, value: boolean, tick = 0): void {
  const state = getModuleState(world);
  const ticks = state.roundFlags[entityId] ?? {};
  if (value) {
    ticks[flag] = tick;
  } else {
    delete ticks[flag];
  }
  state.roundFlags[entityId] = ticks;
}

/** Clear all round flags in `world` (per-world — no longer a global reset). */
export function clearRoundFlags(world: WorldState): void {
  getModuleState(world).roundFlags = {};
}

export function clearEntityRoundFlags(world: WorldState, entityId: string): void {
  delete getModuleState(world).roundFlags[entityId];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStat(entity: EntityState, mapping: CombatStatMapping, role: keyof CombatStatMapping, fallback: number): number {
  return entity.stats[mapping[role]] ?? fallback;
}

function getEntitiesInZone(world: WorldState, zoneId: string): EntityState[] {
  return Object.values(world.entities).filter(
    e => e.zoneId === zoneId && (e.resources.hp ?? 0) > 0,
  );
}

function getEnemiesInZone(world: WorldState, entity: EntityState): EntityState[] {
  if (!entity.zoneId) return [];
  // Friend/foe via the faction predicate (M2 family): a same-faction,
  // different-`type` recruited ally is not a valid tactical target.
  return getEntitiesInZone(world, entity.zoneId).filter(
    e => e.id !== entity.id && affiliationOf(entity, e) === 'enemy',
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
  }, world));

  // Set internal braced flag — grants displacement resistance
  setRoundFlag(world, actor.id, 'braced', true, world.meta.tick);

  // Brace is stronger at chokepoints — set flag for stabilize listener
  const zone = world.zones[actor.zoneId ?? ''];
  const atChokepoint = zone?.tags?.includes('chokepoint') ?? false;
  if (atChokepoint) {
    setRoundFlag(world, actor.id, 'bracedAtChokepoint', true, world.meta.tick);
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

  setRoundFlag(world, actor.id, 'attemptedReposition', true, world.meta.tick);

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

  // Check if any enemy in zone is braced *this round* (brace counters reposition).
  // Tick-scoped: a stale braced flag from an earlier round must not apply (MC-02).
  const enemies = getEnemiesInZone(world, actor);
  const bracedDefender = enemies.find(e => isRoundFlagActiveAt(world, e.id, 'braced', world.meta.tick));
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
        }, world));
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
      }, world));
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

      // Round flags are tick-scoped (see isRoundFlagActiveAt) — no clear-on-tick
      // signal is needed. The engine never emits 'tick.start', and relying on it
      // was the MC-02 leak: flags lived forever once set.

      // Track guard action via round flags
      ctx.events.on('combat.guard.start', (event: ResolvedEvent, world: WorldState) => {
        const entityId = event.payload.entityId as string;
        setRoundFlag(world, entityId, 'guarding', true, world.meta.tick);
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
        // Only an active brace (this tick or the immediately prior tick) resists.
        // A stale braced flag from a past round must not fire (MC-02).
        if (!isRoundFlagActiveAt(world, entityId, 'braced', event.tick)) return;

        // Braced entities resist off-balance (vigor = physical force to hold ground)
        const entity = world.entities[entityId];
        if (entity) {
          const entityMapping = config?.formulas?.statMapping ?? DEFAULT_STAT_MAPPING;
          const entityVigor = entity.stats[entityMapping.attack] ?? 5;
          let stabilizeChance = config?.braceStabilizeChance ?? Math.min(90, 40 + entityVigor * 6);
          if (isRoundFlagActiveAt(world, entityId, 'bracedAtChokepoint', event.tick)) stabilizeChance += 15;
          const roll = simpleRoll(event.tick, entityId, 'stabilize');
          if (roll <= stabilizeChance) {
            removeStatus(entity, COMBAT_STATES.OFF_BALANCE, event.tick);
          }
        }
      });

      ctx.persistence.registerNamespace('combat-tactics', {
        version: '1.0.0',
        roundFlags: {},
      } as ModuleState);
    },
  };
}
