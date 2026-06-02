// inventory-core — item ownership, use, acquire

import type {
  EngineModule,
  ActionIntent,
  WorldState,
  ResolvedEvent,
} from '@ai-rpg-engine/core';
import { makeEvent } from './make-event.js';

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

/**
 * Helper: add an item to an entity's inventory.
 *
 * Returns the event with an empty id: every caller routes it through
 * `store.recordEvent`, the single choke point that stamps a deterministic
 * per-instance id (`genId('evt')`) when none is present — which is what keeps
 * event ids byte-identical across same-seed runs. Minting an id here from the
 * deprecated process-global `nextId` would reintroduce the cross-instance /
 * non-serialized id-collision footgun.
 */
export function giveItem(entity: import('@ai-rpg-engine/core').EntityState, itemId: string, tick: number): ResolvedEvent {
  if (!entity.inventory) entity.inventory = [];
  entity.inventory.push(itemId);
  return {
    id: '',
    tick,
    type: 'item.acquired',
    actorId: entity.id,
    payload: { itemId },
  };
}

