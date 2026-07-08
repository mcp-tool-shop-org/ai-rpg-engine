// status-core — apply, remove, expire, stack statuses

import type {
  EngineModule,
  ResolvedEvent,
  WorldState,
  AppliedStatus,
  EntityState,
  ScalarValue,
} from '@ai-rpg-engine/core';
import { genId } from '@ai-rpg-engine/core';
import { PERIODIC_KEYS, processPeriodicStatuses, processStatusTriggers, makeProcContext } from './status-effects.js';

export const statusCore: EngineModule = {
  id: 'status-core',
  version: '0.1.0',

  register(ctx) {
    // One game tick == one resolved action (the engine advances the tick counter
    // after each action), so 'action.resolved' is the per-tick hook. We run the
    // periodic (DoT/HoT) pass FIRST so a lethal tick records its damage + defeat
    // before tick-based expirations clean up the now-finished instances.
    //
    // This is purely additive: only statuses carrying periodic bookkeeping in
    // `data` (the new opt-in fields) do anything here, so no existing content
    // changes behaviour. Periodic events are emitted via the same recordEvent
    // choke point as every other status event (deterministic ids, eventLog).
    ctx.events.on('action.resolved', (_event: ResolvedEvent, world: WorldState) => {
      const tick = world.meta.tick;

      // Reactive status triggers (thorns / reflect). React to THIS action's own
      // damage events, snapshotted BEFORE the periodic pass emits more (so periodic
      // DoT isn't re-seeded). processStatusTriggers drains the full reflect chain
      // internally (dedup set + PROC_DEPTH_LIMIT fiat halt), so seeding the action's
      // direct damage is sufficient and terminating. Purely additive: an entity with
      // no matching `triggers` produces zero reactions, so content without reactive
      // statuses is unchanged. Driven off action.resolved (not off damage events
      // themselves), so trigger-produced events cannot re-enter this hook this tick.
      const seedDamage = world.eventLog.filter(
        (e) => e.tick === tick &&
          (e.type === 'combat.damage.applied' || e.type === 'ability.damage.applied'),
      );
      if (seedDamage.length > 0) {
        const procCtx = makeProcContext();
        for (const dmg of seedDamage) {
          for (const ev of processStatusTriggers(dmg, world, procCtx, tick)) ctx.events.emit(ev);
        }
      }

      const periodicEvents = processPeriodicStatuses(world, tick);
      for (const ev of periodicEvents) ctx.events.emit(ev);
      processExpirations(world, ctx);
    });
  },
};

/**
 * Deterministic AppliedStatus id when no WorldState is available to draw from
 * the per-instance counter. The id only needs to be unique within one entity's
 * status list (its sole use is the expiry-filter dedup in processExpirations),
 * and an entity holds at most one entry per statusId — so this is collision-free
 * and reproducible across same-seed runs. Used as the back-compat path for
 * callers that have not yet been threaded a `world` (see applyStatus).
 */
function deriveStatusId(entity: EntityState, statusId: string, tick: number): string {
  return `status_${entity.id}_${statusId}_${tick}`;
}

/**
 * For periodic (DoT/HoT) statuses, freeze the magnitude at apply-tick and record
 * the duration in ticks, both inside `AppliedStatus.data` (a ScalarValue record)
 * so the core AppliedStatus type stays untouched. "Snapshot" semantics (design-lock
 * finding 3): the DoT/HoT magnitude is captured once at application and not
 * recomputed live, so a later change to the source's stats or the definition does
 * not retroactively alter ticks already scheduled.
 *
 *  - If `data.periodicKind` is set and `data.snapshotAmount` is absent, copy
 *    `data.amount` → `data.snapshotAmount` (the captured magnitude).
 *  - If a `duration` is given, record it as `data.durationTicks` so the periodic
 *    engine can compute expiry without depending on `expiresAtTick`.
 *
 * A non-periodic status (no `periodicKind`) is returned unchanged — back-compat:
 * existing callers that pass plain `data` (or none) see identical behaviour.
 */
function withPeriodicSnapshot(
  data: Record<string, ScalarValue> | undefined,
  duration: number | undefined,
): Record<string, ScalarValue> | undefined {
  if (!data || typeof data[PERIODIC_KEYS.KIND] !== 'string') return data;
  const next: Record<string, ScalarValue> = { ...data };
  if (next[PERIODIC_KEYS.SNAPSHOT] === undefined && typeof next[PERIODIC_KEYS.AMOUNT] === 'number') {
    next[PERIODIC_KEYS.SNAPSHOT] = next[PERIODIC_KEYS.AMOUNT];
  }
  if (duration !== undefined && next[PERIODIC_KEYS.DURATION] === undefined) {
    next[PERIODIC_KEYS.DURATION] = duration;
  }
  return next;
}

/**
 * Apply a status to an entity. Returns the event to record.
 *
 * `world` is optional: when provided, the AppliedStatus id is minted from the
 * per-instance deterministic counter (genId) — preferred, and what keeps status
 * ids byte-identical across same-seed runs and save/load. When omitted (legacy
 * call sites not yet threaded), a deterministic id is derived from the entity +
 * statusId + tick instead. The deprecated global nextId() is never used.
 */
export function applyStatus(
  entity: EntityState,
  statusId: string,
  tick: number,
  options?: {
    stacking?: 'replace' | 'stack' | 'refresh';
    maxStacks?: number;
    duration?: number;
    sourceId?: string;
    data?: Record<string, import('@ai-rpg-engine/core').ScalarValue>;
  },
  world?: WorldState,
): ResolvedEvent {
  const stacking = options?.stacking ?? 'replace';
  const existing = entity.statuses.find(s => s.statusId === statusId);

  if (existing) {
    switch (stacking) {
      case 'stack': {
        const max = options?.maxStacks ?? 99;
        if ((existing.stacks ?? 1) < max) {
          existing.stacks = (existing.stacks ?? 1) + 1;
          return makeStatusEvent('status.stacked', entity.id, statusId, tick, {
            stacks: existing.stacks,
          });
        }
        // At max stacks, just refresh. `!== undefined` (not truthiness): a
        // duration of 0 means "expires now", only undefined means "no expiry" (M5).
        if (options?.duration !== undefined) {
          existing.expiresAtTick = tick + options.duration;
        }
        return makeStatusEvent('status.stacked', entity.id, statusId, tick, {
          stacks: existing.stacks ?? 1,
          atMax: true,
        });
      }
      case 'refresh': {
        // `!== undefined` (not truthiness): duration 0 refreshes the expiry to
        // the current tick; only undefined leaves the expiry untouched (M5).
        if (options?.duration !== undefined) {
          existing.expiresAtTick = tick + options.duration;
        }
        return makeStatusEvent('status.applied', entity.id, statusId, tick, {
          refreshed: true,
        });
      }
      case 'replace':
      default: {
        // Remove old, add new
        entity.statuses = entity.statuses.filter(s => s.statusId !== statusId);
        break;
      }
    }
  }

  const applied: AppliedStatus = {
    id: world ? genId(world, 'status') : deriveStatusId(entity, statusId, tick),
    statusId,
    stacks: 1,
    sourceId: options?.sourceId,
    appliedAtTick: tick,
    // `!== undefined` (not truthiness): duration 0 expires at the CURRENT tick,
    // it is not "permanent". Only an absent duration means no expiry (M5).
    expiresAtTick: options?.duration !== undefined ? tick + options.duration : undefined,
    data: withPeriodicSnapshot(options?.data, options?.duration),
  };

  entity.statuses.push(applied);

  return makeStatusEvent('status.applied', entity.id, statusId, tick, {
    stacks: 1,
    expiresAtTick: applied.expiresAtTick,
  });
}

/** Remove a status from an entity. Returns the event to record. */
export function removeStatus(
  entity: EntityState,
  statusId: string,
  tick: number,
): ResolvedEvent | null {
  const idx = entity.statuses.findIndex(s => s.statusId === statusId);
  if (idx === -1) return null;

  entity.statuses.splice(idx, 1);

  return makeStatusEvent('status.removed', entity.id, statusId, tick, {});
}

/** Check if an entity has a specific status */
export function hasStatus(entity: EntityState, statusId: string): boolean {
  return entity.statuses.some(s => s.statusId === statusId);
}

/** Get status stacks for an entity */
export function getStatusStacks(entity: EntityState, statusId: string): number {
  return entity.statuses.find(s => s.statusId === statusId)?.stacks ?? 0;
}

function processExpirations(
  world: WorldState,
  ctx: import('@ai-rpg-engine/core').ModuleRegistrationContext,
): void {
  const tick = world.meta.tick;
  for (const entity of Object.values(world.entities)) {
    const expired = entity.statuses.filter(s => s.expiresAtTick !== undefined && s.expiresAtTick <= tick);
    for (const status of expired) {
      entity.statuses = entity.statuses.filter(s => s.id !== status.id);
      const event = makeStatusEvent('status.expired', entity.id, status.statusId, tick, {
        stacks: status.stacks,
      });
      ctx.events.emit(event);
    }
  }
}

function makeStatusEvent(
  type: string,
  entityId: string,
  statusId: string,
  tick: number,
  payload: Record<string, unknown>,
): ResolvedEvent {
  // id: '' — every consumer of these events records them via store.recordEvent
  // (verb handlers return them → ActionDispatcher records each; processExpirations
  // emits via ctx.events.emit → recordEvent). recordEvent assigns a deterministic
  // per-instance id when the id is empty, so the global nextId() is not needed.
  return {
    id: '',
    tick,
    type,
    actorId: entityId,
    payload: { statusId, ...payload },
    tags: ['status'],
  };
}
