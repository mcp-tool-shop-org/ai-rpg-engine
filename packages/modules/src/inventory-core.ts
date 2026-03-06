// inventory-core — item ownership, use, acquire

import type {
  EngineModule,
  ActionIntent,
  WorldState,
  ResolvedEvent,
} from '@signalfire/core';
import { nextId } from '@signalfire/core';

export type ItemEffect = {
  itemId: string;
  use: (action: ActionIntent, world: WorldState) => ResolvedEvent[];
};

export function createInventoryCore(itemEffects?: ItemEffect[]): EngineModule {
  const effectMap = new Map<string, ItemEffect['use']>();
  if (itemEffects) {
    for (const ie of itemEffects) {
      effectMap.set(ie.itemId, ie.use);
    }
  }

  return {
    id: 'inventory-core',
    version: '0.1.0',

    register(ctx) {
      ctx.actions.registerVerb('use', (action, world) => useHandler(action, world, effectMap));
    },
  };
}

export const inventoryCore: EngineModule = createInventoryCore();

function useHandler(
  action: ActionIntent,
  world: WorldState,
  effectMap: Map<string, ItemEffect['use']>,
): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) {
    return [makeEvent(action, 'action.rejected', { reason: 'actor not found' })];
  }

  const itemId = action.toolId ?? action.targetIds?.[0];
  if (!itemId) {
    return [makeEvent(action, 'action.rejected', { reason: 'no item specified' })];
  }

  const inventory = actor.inventory ?? [];
  const itemIndex = inventory.indexOf(itemId);
  if (itemIndex === -1) {
    return [makeEvent(action, 'action.rejected', { reason: `you don't have ${itemId}` })];
  }

  // Apply effect if registered
  const effect = effectMap.get(itemId);
  const effectEvents = effect ? effect(action, world) : [];

  // Remove from inventory (consumable)
  inventory.splice(itemIndex, 1);

  return [
    makeEvent(action, 'item.used', {
      entityId: actor.id,
      itemId,
      consumed: true,
    }),
    ...effectEvents,
  ];
}

/** Helper: add an item to an entity's inventory */
export function giveItem(entity: import('@signalfire/core').EntityState, itemId: string, tick: number): ResolvedEvent {
  if (!entity.inventory) entity.inventory = [];
  entity.inventory.push(itemId);
  return {
    id: nextId('evt'),
    tick,
    type: 'item.acquired',
    actorId: entity.id,
    payload: { itemId },
  };
}

function makeEvent(
  action: ActionIntent,
  type: string,
  payload: Record<string, unknown>,
): ResolvedEvent {
  return {
    id: nextId('evt'),
    tick: action.issuedAtTick,
    type,
    actorId: action.actorId,
    payload,
  };
}
