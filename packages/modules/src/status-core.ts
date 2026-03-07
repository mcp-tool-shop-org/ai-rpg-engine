// status-core — apply, remove, expire, stack statuses

import type {
  EngineModule,
  ResolvedEvent,
  WorldState,
  AppliedStatus,
  EntityState,
} from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';

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

/** Apply a status to an entity. Returns the event to record. */
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
    id: nextId('status'),
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
  return {
    id: nextId('evt'),
    tick,
    type,
    actorId: entityId,
    payload: { statusId, ...payload },
    tags: ['status'],
  };
}
