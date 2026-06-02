// status-core — apply, remove, expire, stack statuses

import type {
  EngineModule,
  ResolvedEvent,
  WorldState,
  AppliedStatus,
  EntityState,
} from '@ai-rpg-engine/core';
import { genId } from '@ai-rpg-engine/core';

export const statusCore: EngineModule = {
  id: 'status-core',
  version: '0.1.0',

  register(ctx) {
    // Tick-based expiration
    ctx.events.on('action.resolved', (_event: ResolvedEvent, world: WorldState) => {
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
        // At max stacks, just refresh
        if (options?.duration) {
          existing.expiresAtTick = tick + options.duration;
        }
        return makeStatusEvent('status.stacked', entity.id, statusId, tick, {
          stacks: existing.stacks ?? 1,
          atMax: true,
        });
      }
      case 'refresh': {
        if (options?.duration) {
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
    expiresAtTick: options?.duration ? tick + options.duration : undefined,
    data: options?.data,
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
