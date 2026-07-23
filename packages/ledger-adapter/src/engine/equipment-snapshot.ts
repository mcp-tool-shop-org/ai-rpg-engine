// engine-seam — equipmentSnapshotFromWorld: the NFT-side sibling of
// snapshot.ts's snapshotFromWorld. This is the read half of THE DETERMINISM
// FIREWALL for the NFT unique-gear layer (contracts.ts's "NFT UNIQUE-GEAR
// LAYER" section, P3): the adapter reads a plain-data EquipmentSnapshot off
// the live world (plus an injected catalog/chronicle); the engine never reads
// the adapter back, and this file never writes to `world`.
//
// The `@ai-rpg-engine/core` and `@ai-rpg-engine/equipment` imports below are
// BOTH type-only (`import type`) — they erase completely at compile time, so
// this module carries ZERO runtime dependency on either package, exactly like
// snapshot.ts's own header describes for the fungible seam. A run is
// byte-identical whether or not this package (or @ai-rpg-engine/equipment) is
// even installed at runtime; see firewall.test.ts for the analogous proof on
// the fungible side.
//
// THE CHRONICLE IS DORMANT (P3 reality): nothing in a running game's world
// state populates an item chronicle today — packages/modules/src/world-tick.ts
// documents this directly ("item-recognition's chronicle never reaches the
// world eventLog"). `chronicle` is therefore an OPTIONAL input, defaulting to
// empty: on real content today every item's `relicVersion` is 0 (no growth).
// Tests inject a chronicle to exercise the growth path. This module never
// reads a chronicle off `world` itself (there is none to read there yet), and
// never wires one into the engine — that would be a game feature, out of
// scope for the adapter, which must never touch the tick.

import type { WorldState } from '@ai-rpg-engine/core';
import type { ItemCatalog, ItemChronicleEntry, ItemDefinition, Loadout } from '@ai-rpg-engine/equipment';
import type { EquipmentSnapshot, UniqueItemSnapshot } from '../contracts.js';

/**
 * The `world.modules` namespace key equipment-core.ts persists loadouts
 * under (that package's own `EQUIPMENT_STATE_KEY`). Duplicated here as a
 * literal — deliberately NOT imported as a value — to preserve zero runtime
 * coupling to `@ai-rpg-engine/equipment` (see this file's header).
 */
const EQUIPMENT_MODULE_KEY = 'equipment-core';

/**
 * The persisted shape at `world.modules[EQUIPMENT_MODULE_KEY]` — structurally
 * identical to equipment-core.ts's `EquipmentModuleState`, declared locally
 * (not imported) for the same zero-runtime-coupling reason as the key above.
 */
type EquipmentModuleStateShape = { loadouts?: Record<string, Loadout> };

/**
 * Read-only lookup of `playerId`'s persisted Loadout off the live world.
 * `world.modules` is `Record<string, unknown>`, so every level of the chain
 * is guarded with optional chaining — a missing module, a missing `loadouts`
 * map, or a missing per-player entry all resolve to `undefined` rather than
 * throwing.
 */
function readLoadout(world: WorldState, playerId: string): Loadout | undefined {
  const moduleState = world.modules[EQUIPMENT_MODULE_KEY] as EquipmentModuleStateShape | undefined;
  return moduleState?.loadouts?.[playerId];
}

/**
 * Relic-tier banding — THIS ADAPTER'S OWN deterministic encoding of
 * `relicVersion` (a raw chronicle-entry count) into a coarse 0-3 tier.
 * Deliberately NOT a call to `@ai-rpg-engine/equipment`'s
 * `evaluateRelicGrowth`/`getRelicTier` (those band a DIFFERENT, smaller-scale
 * axis — `RelicState.milestonesReached`, typically 0-3 — and calling them
 * would be a runtime coupling this package's firewall forbids; see this
 * file's header). Thresholds are a local design choice, not a contract:
 *
 *   relicVersion 0        -> tier 0 (un-grown)
 *   relicVersion 3-5      -> tier 1
 *   relicVersion 6-9      -> tier 2
 *   relicVersion 10+      -> tier 3
 */
function relicTierFromVersion(relicVersion: number): number {
  if (relicVersion >= 10) return 3;
  if (relicVersion >= 6) return 2;
  if (relicVersion >= 3) return 1;
  return 0;
}

/**
 * Unique item ids carried by a loadout, in a STABLE deterministic order:
 * equipped slots first (iterated in sorted slot-name order), then the
 * inventory array's own order, deduplicated (an id appearing in both — which
 * should not normally happen, since equipItem/unequipItem keep the two
 * disjoint — counts once, at its first-seen position, handled safely rather
 * than assumed impossible).
 */
function collectUniqueItemIds(loadout: Loadout): { orderedIds: string[]; equippedIds: Set<string> } {
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  const equippedIds = new Set<string>();

  // `loadout.equipped` types as Record<EquipmentSlot, string | null> (a fixed
  // literal-key mapped type); widened to a plain string-keyed record here so
  // sorted-slot iteration needs no @ai-rpg-engine/equipment import of
  // EquipmentSlot itself (this module's type-import allowlist is
  // ItemCatalog/ItemDefinition/ItemChronicleEntry/Loadout only).
  const equipped = loadout.equipped as Record<string, string | null>;
  for (const slot of Object.keys(equipped).sort()) {
    const id = equipped[slot];
    if (id === null || id === undefined) continue;
    equippedIds.add(id);
    if (!seen.has(id)) {
      seen.add(id);
      orderedIds.push(id);
    }
  }

  for (const id of loadout.inventory ?? []) {
    if (!seen.has(id)) {
      seen.add(id);
      orderedIds.push(id);
    }
  }

  return { orderedIds, equippedIds };
}

/**
 * Read-only snapshot of the player's UNIQUE equipment — the NFT-side sibling
 * of `snapshotFromWorld` (contracts.ts's `EquipmentSnapshot`, the "NFT
 * UNIQUE-GEAR LAYER"). Reads `world.modules['equipment-core'].loadouts[playerId]`
 * (equipped slots + carried inventory), resolves each unique item id against
 * `catalog` (an id absent from the catalog is not unique gear and is
 * skipped), and stamps each with a `relicVersion` derived from the optional,
 * currently-dormant `chronicle` (see this file's header) — 0 for every item
 * when `chronicle` is omitted.
 *
 * PURE + READ-ONLY: never mutates `world`, the resolved `Loadout`, `catalog`,
 * or `chronicle`. A player with no module/loadout yields `{ items: [] }`
 * rather than throwing (mirrors snapshot.ts's absent-entity handling). Safe
 * to call at any point in a run — including mid-tick — without perturbing
 * engine determinism.
 */
export function equipmentSnapshotFromWorld(
  world: WorldState,
  playerId: string,
  catalog: ItemCatalog,
  chronicle?: Record<string, ItemChronicleEntry[]>,
): EquipmentSnapshot {
  const loadout = readLoadout(world, playerId);
  if (!loadout || !loadout.equipped || !Array.isArray(loadout.inventory)) {
    return { items: [] };
  }

  const catalogItems = catalog?.items ?? [];
  const byId = new Map<string, ItemDefinition>(catalogItems.map((item) => [item.id, item] as const));
  const { orderedIds, equippedIds } = collectUniqueItemIds(loadout);

  const snapshotItems: UniqueItemSnapshot[] = [];
  for (const itemId of orderedIds) {
    const item = byId.get(itemId);
    if (!item) continue; // not in the catalog -> not unique gear, skip

    const relicVersion = chronicle?.[itemId]?.length ?? 0;
    snapshotItems.push({
      itemId: item.id,
      name: item.name,
      slot: item.slot,
      rarity: item.rarity,
      equipped: equippedIds.has(itemId),
      relicTier: relicTierFromVersion(relicVersion),
      relicVersion,
    });
  }

  return { items: snapshotItems };
}
