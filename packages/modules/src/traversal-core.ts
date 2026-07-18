// traversal-core — movement between zones

import type { EngineModule, ActionIntent, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { makeEvent } from './make-event.js';

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

  // Resolve the actor from action.actorId (falling back to playerId for
  // back-compat with hand-built actions that never set it), matching every
  // sibling verb handler (attack, guard, disengage, brace, reposition,
  // use-ability). Previously this handler ignored action.actorId entirely and
  // always checked adjacency from world.locationId / moved the player — so a
  // non-player actor submitting 'move' via Engine.submitActionAs got wrong
  // adjacency checks against the PLAYER's zone and, on success, silently
  // teleported the PLAYER while leaving the real actor unmoved (F-5ce40588).
  const actorId = action.actorId || world.playerId;
  const actor = world.entities[actorId];
  if (!actor) {
    return [makeEvent(action, 'action.rejected', { reason: `actor not found: ${actorId}` })];
  }

  const actorZoneId = actor.zoneId ?? world.locationId;
  const currentZone = world.zones[actorZoneId];
  if (!currentZone) {
    return [makeEvent(action, 'action.rejected', { reason: 'current zone not found' })];
  }

  // Check adjacency from the ACTOR's own zone, not the player's.
  if (!currentZone.neighbors.includes(targetZoneId)) {
    return [makeEvent(action, 'action.rejected', { reason: `cannot reach ${targetZoneId} from ${currentZone.id}` })];
  }

  const targetZone = world.zones[targetZoneId];
  if (!targetZone) {
    return [makeEvent(action, 'action.rejected', { reason: `zone ${targetZoneId} does not exist` })];
  }

  // Move the ACTOR. world.locationId (the "current scene" pointer) only
  // follows the PLAYER — an NPC/companion moving around must never change
  // what zone the player-facing scene is anchored to.
  actor.zoneId = targetZoneId;
  if (actorId === world.playerId) {
    world.locationId = targetZoneId;
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
    // Report the ACTOR's own zone, not the player's — a non-player actor
    // issuing a targetless 'inspect' via submitActionAs should see its own
    // surroundings, not the player's (F-08f214dd).
    const actorId = action.actorId || world.playerId;
    const actorZoneId = world.entities[actorId]?.zoneId ?? world.locationId;
    const zone = world.zones[actorZoneId];
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

