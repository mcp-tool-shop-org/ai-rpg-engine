// traversal-core — movement between zones

import type { EngineModule, ActionIntent, WorldState, ResolvedEvent } from '@signalfire/core';
import { nextId } from '@signalfire/core';

export const traversalCore: EngineModule = {
  id: 'traversal-core',
  version: '0.1.0',

  register(ctx) {
    ctx.actions.registerVerb('move', moveHandler);

    ctx.actions.registerVerb('inspect', inspectHandler);
  },
};

function moveHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  const targetZoneId = action.targetIds?.[0];
  if (!targetZoneId) {
    return [makeEvent(action, 'action.rejected', { reason: 'no target zone specified' })];
  }

  const currentZone = world.zones[world.locationId];
  if (!currentZone) {
    return [makeEvent(action, 'action.rejected', { reason: 'current zone not found' })];
  }

  // Check adjacency
  if (!currentZone.neighbors.includes(targetZoneId)) {
    return [makeEvent(action, 'action.rejected', { reason: `cannot reach ${targetZoneId} from ${currentZone.id}` })];
  }

  const targetZone = world.zones[targetZoneId];
  if (!targetZone) {
    return [makeEvent(action, 'action.rejected', { reason: `zone ${targetZoneId} does not exist` })];
  }

  // Update location
  world.locationId = targetZoneId;
  const player = world.entities[world.playerId];
  if (player) {
    player.zoneId = targetZoneId;
  }

  return [
    makeEvent(action, 'world.zone.entered', {
      zoneId: targetZoneId,
      zoneName: targetZone.name,
      previousZoneId: currentZone.id,
      tags: targetZone.tags,
    }, {
      presentation: {
        channels: ['objective'],
        priority: 'normal',
        soundCues: ['scene.enter'],
      },
    }),
  ];
}

function inspectHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  const targetId = action.targetIds?.[0];

  // Inspect current zone if no target
  if (!targetId) {
    const zone = world.zones[world.locationId];
    if (!zone) {
      return [makeEvent(action, 'action.rejected', { reason: 'no zone to inspect' })];
    }

    const entities = Object.values(world.entities).filter(e => e.zoneId === zone.id);

    return [makeEvent(action, 'world.zone.inspected', {
      zoneId: zone.id,
      zoneName: zone.name,
      tags: zone.tags,
      entities: entities.map(e => ({ id: e.id, name: e.name, type: e.type, tags: e.tags })),
      interactables: zone.interactables ?? [],
      exits: zone.neighbors,
      hazards: zone.hazards ?? [],
    })];
  }

  // Inspect a specific entity
  const entity = world.entities[targetId];
  if (!entity) {
    return [makeEvent(action, 'action.rejected', { reason: `nothing to inspect: ${targetId}` })];
  }

  return [makeEvent(action, 'world.entity.inspected', {
    entityId: entity.id,
    name: entity.name,
    type: entity.type,
    tags: entity.tags,
    stats: entity.stats,
    resources: entity.resources,
    statuses: entity.statuses.map(s => s.statusId),
  })];
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
