// inventory-core — item ownership, use, acquire, GIVE
//
// `give` (F-merchant-F) lives here rather than in a new sibling module because
// this file owns CUSTODY: what it means for an entity to hold an item, and
// every rule about an item leaving a pair of hands. Those are the things that
// change together — a future stack limit, encumbrance rule, or soulbound flag
// has to constrain `use` and `give` identically or it constrains neither. A
// separate transfer module would have had to reach in here for all of it.
//
// Before this verb, NO path anywhere in the engine moved an item from one
// entity to another. A sweep of all 62 registerVerb call sites found `use`
// (consume), `equip`/`unequip` (slot), and trade-core's `buy`/`sell` (which
// settle against a district's abstract market, not a counterparty's bag).
// `giveItem` below is add-only — it has no source to remove from and is not
// dispatcher-registered, so no player could ever reach it. A pack could
// therefore make an item obtainable and still have nothing in the world able
// to hand it to anyone.

import type {
  EngineModule,
  ActionIntent,
  EntityState,
  WorldState,
  ResolvedEvent,
} from '@ai-rpg-engine/core';
import { makeEvent } from './make-event.js';

export type ItemEffect = {
  itemId: string;
  use: (action: ActionIntent, world: WorldState) => ResolvedEvent[];
};

/**
 * A pack's veto over a specific transfer, consulted by `give` BEFORE anything
 * moves. Return `null` to allow.
 *
 * The engine owns the MECHANICS of custody — atomicity, co-location, do you
 * actually have it. A pack owns the POLICY about which of its own items may
 * change hands, because that policy is made of things the engine has never
 * heard of. Salt Road Ledger's is the motivating case: a lot already consigned
 * against a future payment cannot be made over to a third party, or the
 * obligation is laundered off the asset and the whole pack stops meaning
 * anything. Teaching inventory-core about liens to express that would put a
 * merchant's contract law inside the engine's item bag.
 */
export type TransferGuard = (ctx: {
  world: WorldState;
  itemId: string;
  from: EntityState;
  to: EntityState;
}) => { reason: string; hint: string } | null;

export type InventoryCoreOptions = {
  /** Pack policy on which items may change hands. Default: everything may. */
  transferGuard?: TransferGuard;
};

export function createInventoryCore(
  itemEffects?: ItemEffect[],
  options: InventoryCoreOptions = {},
): EngineModule {
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
      ctx.actions.registerVerb('give', (action, world) => giveHandler(action, world, options.transferGuard));
      // NO namespace default, deliberately — inventory-core has never
      // registered one, and custody lives on the entities themselves. A world
      // that never gives anything away is byte-identical to one built before
      // this verb existed.
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

  // An item with no registered effect is NOT a consumable — it is an item
  // nobody taught this verb how to use.
  //
  // This used to consume it anyway: effect looked up, missing, `effectEvents`
  // set to [], item spliced out of the inventory regardless, and `item.used`
  // emitted with `consumed: true`. Success-shaped destruction. Measured across
  // the catalog before flipping it (RFC 9413's rule: retire leniency by
  // measurement, not by assumption) — 89 of 90 authored items in all eleven
  // packs took this path, and they are cutlasses, armour, deeds, signet rings.
  // Drinking a deed of title was a legal move that destroyed it and told the
  // player it had worked.
  //
  // Rejecting instead follows the house shape `giveHandler` below already uses
  // — reject BEFORE mutating, structured reason + hint — and the literature is
  // near-unanimous: Laubheimer 2015 (NN/g, Preventing User Errors) finds the
  // strongest treatment for a slip is a constraint that blocks the action
  // outright; Harley 2018 (NN/g, Visibility of System Status) makes the silent
  // path a textbook violation; the DCSS design philosophy holds that losses
  // must trace to genuine player decisions rather than hidden state; and Shore
  // 2004 (Fail Fast, IEEE Software 21(5)) turns an unregistered effect from a
  // player's destroyed goods into a visible authoring bug.
  //
  // FLAVOR CONSUMABLES ARE STILL POSSIBLE, and are now AUTHORED rather than
  // accidental — the NetHack pattern, where even a zero-effect quaff prints
  // "you have a strange feeling for a moment, then it passes" and the message
  // is itself information. A pack that wants an item consumed for flavour
  // registers an effect saying so:
  //
  //     { itemId: 'cheap-rum', use: (action) => [
  //         makeEvent(action, 'item.consumed.flavor', { itemId: 'cheap-rum' }),
  //       ] }
  //
  // One line, and the intent is in the content where a reader can see it.
  const effect = effectMap.get(itemId);
  if (!effect) {
    return reject(
      action,
      `${itemId} has no use`,
      'Nothing happens when you try to use this. Equipment is worn with `equip`; ' +
        'only items a pack registers a use-effect for can be used up.',
      { itemId },
    );
  }
  const effectEvents = effect(action, world);

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

function reject(
  action: ActionIntent,
  reason: string,
  hint: string,
  extra?: Record<string, unknown>,
): ResolvedEvent[] {
  return [makeEvent(action, 'action.rejected', { verb: action.verb, reason, hint, ...extra })];
}

/**
 * `give <recipient>` — hand an item you are carrying to someone standing with
 * you. The engine's only entity-to-entity transfer.
 *
 * ATOMIC BY CONSTRUCTION. Every rejection is decided BEFORE either side is
 * touched, and the removal and the addition happen in one synchronous block
 * with nothing between them that can throw. There is no window in which the
 * item exists in both bags (duplication) or in neither (destruction) — which
 * is the whole reason this is a single handler rather than a `use`-style
 * removal composed with the `giveItem` helper.
 *
 * Item comes from `toolId` (or `parameters.itemId`); the recipient is
 * `targetIds[0]`. That split matters: the ambiguous form — item in targetIds —
 * is exactly what made the reachability audit misread every target-taking item
 * as inert, so this verb refuses to guess.
 */
function giveHandler(
  action: ActionIntent,
  world: WorldState,
  transferGuard?: TransferGuard,
): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) {
    return reject(action, 'actor not found', 'Only a live entity in the world can hand something over.');
  }

  const recipientId = action.targetIds?.[0];
  if (!recipientId) {
    return reject(action, 'no recipient specified', 'give <recipient> --item <item>');
  }
  if (recipientId === actor.id) {
    return reject(action, 'you already have it', 'Name someone else.', { itemId: action.toolId });
  }

  const recipient = world.entities[recipientId];
  if (!recipient) {
    return reject(action, `${recipientId} not found`, 'give <recipient> --item <item>', { recipientId });
  }
  if (actor.zoneId !== recipient.zoneId) {
    return reject(action, 'recipient not in same zone', 'Stand with them first.', { recipientId });
  }

  const itemId = action.toolId ?? (action.parameters?.itemId as string | undefined);
  if (!itemId) {
    return reject(action, 'no item specified', 'give <recipient> --item <item>', { recipientId });
  }

  const inventory = actor.inventory ?? [];
  const itemIndex = inventory.indexOf(itemId);
  if (itemIndex === -1) {
    return reject(action, `you don't have ${itemId}`, 'Check your inventory.', { itemId, recipientId });
  }

  // Pack policy last, and still BEFORE any mutation — a vetoed transfer must
  // leave the world exactly as it found it.
  const veto = transferGuard?.({ world, itemId, from: actor, to: recipient });
  if (veto) {
    return reject(action, veto.reason, veto.hint, { itemId, recipientId });
  }

  // --- Past every gate. Commit both sides together. ---
  inventory.splice(itemIndex, 1);
  actor.inventory = inventory;
  if (!recipient.inventory) recipient.inventory = [];
  recipient.inventory.push(itemId);

  // Three events, one transfer. `item.given` is the action's own record;
  // `item.lost` and `item.acquired` are the per-side stamps the item chronicle
  // subscribes to, so gear history follows an object between owners WITHOUT
  // this module importing anything from the equipment package. Before this,
  // the chronicle's `lost` event had no producer anywhere in the engine.
  return [
    makeEvent(action, 'item.given', {
      itemId,
      fromEntityId: actor.id,
      fromName: actor.name,
      toEntityId: recipient.id,
      toName: recipient.name,
    }, {
      targetIds: [recipient.id],
      presentation: { channels: ['objective', 'narrator'], priority: 'normal' },
    }),
    makeEvent(action, 'item.lost', {
      itemId,
      entityId: actor.id,
      toEntityId: recipient.id,
      reason: 'given',
    }),
    makeEvent(action, 'item.acquired', {
      itemId,
      entityId: recipient.id,
      fromEntityId: actor.id,
    }, { actorId: recipient.id }),
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

