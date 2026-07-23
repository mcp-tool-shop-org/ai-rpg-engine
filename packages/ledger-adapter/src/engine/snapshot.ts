// engine-seam — snapshotFromWorld: the adapter's ONLY read of the engine's
// world. This is one half of THE DETERMINISM FIREWALL (contracts.ts's own
// header, ../index.ts's header): the adapter reads a plain-data
// TradeableSnapshot off the live world; the engine never reads the adapter
// back, and this file never writes to `world`.
//
// The `@ai-rpg-engine/core` import below is TYPE-ONLY (`import type`) — it
// erases completely at compile time, so this module (and everything else
// under src/engine/*.ts, non-test) carries ZERO runtime dependency on
// `@ai-rpg-engine/core` or `@ai-rpg-engine/modules`. A run is therefore
// byte-identical whether or not this package is even installed at runtime;
// see firewall.test.ts for the load-bearing proof.

import type { EntityState, WorldState } from '@ai-rpg-engine/core';
import type { TradeableSnapshot } from '../contracts.js';

/** The `resources` key snapshotted as the player's coin balance (-> IOU). */
const COIN_RESOURCE_KEY = 'coin';

/**
 * Read-only snapshot of the player-owned tradeable layer: `coin` (a
 * `resources` entry, defaulting to 0) plus a tally of `inventory` (a flat
 * `string[]` of item ids, inventory-core's own shape) collapsed into
 * `itemId -> count`.
 *
 * PURE + READ-ONLY: never mutates `world`, the resolved player `EntityState`,
 * its `resources`, or its `inventory` array. Safe to call at any point in a
 * run — including mid-tick — without perturbing engine determinism.
 *
 * A player entity absent from `world.entities` yields `{ coin: 0, items: {} }`
 * rather than throwing (the checkpoint driver may be called before the player
 * has spawned, or with a stale id after a reload). An entity present but with
 * no `inventory` array (it is optional on `EntityState`) simply tallies to
 * `{}` — `coin` is still read normally off `resources` in that case, since
 * the two fields are independent.
 */
export function snapshotFromWorld(world: WorldState, playerId: string): TradeableSnapshot {
  const entity: EntityState | undefined = world.entities[playerId];
  if (!entity) {
    return { coin: 0, items: {} };
  }

  const coin = entity.resources[COIN_RESOURCE_KEY] ?? 0;

  const items: Record<string, number> = {};
  for (const itemId of entity.inventory ?? []) {
    items[itemId] = (items[itemId] ?? 0) + 1;
  }

  return { coin, items };
}
