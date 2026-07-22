// equipment-core — the runtime consumer loop for this package (F-ENG008).
//
// The wave-4 audits found packages/equipment shipping a complete API (Loadout,
// equipItem/unequipItem, computeLoadoutEffects, the provenance suite) with ZERO
// runtime consumers: all 10 starters author 7-item catalogs whose items are
// exported and then dropped at the CLI's PackInfo boundary. This module closes
// the loop with the audit-recommended smallest-real slice: `equip` / `unequip`
// verbs that move an item between an entity's inventory and a persisted
// per-entity Loadout, and mirror the item's statModifiers into a STATUS so the
// existing status machinery (effectiveStat's GAS band) carries the numbers into
// combat formulas and the HUD's Status line — with zero combat-code changes.
//
// WHY THIS FILE LIVES IN packages/equipment (and not packages/modules):
//  - @ai-rpg-engine/modules' dependency surface is deliberately pinned to
//    core + content-schema + character-profile (minimal-install-proof.test.ts,
//    the "New User Truth" gate). A runtime EngineModule that VALUE-imports this
//    package could never be exported from modules without breaking that pin —
//    modules' existing equipment imports (crafting-core, item-recognition) are
//    all `import type` for exactly this reason.
//  - modules/src/index.ts is the only re-export door and is owned by a sibling
//    domain this wave, so a modules-homed factory would be unreachable from any
//    starter in this change.
//  - Starters already depend on @ai-rpg-engine/equipment for their catalogs, so
//    homing the module here makes the package's own API (equipItem,
//    unequipItem, computeLoadoutEffects) load-bearing at runtime — the
//    strongest possible close of the zero-consumers finding.
//
// STATUS MACHINERY IS INJECTED, NOT IMPORTED: this package cannot depend on
// @ai-rpg-engine/modules (inverted layering; starters compose both). The pack
// passes the status operations it already imports — registerStatusDefinitions,
// applyStatus, removeStatus — via `EquipmentStatusOps`. All modifier
// AGGREGATION stays in modules' effectiveStat: one `equipped-<itemId>` status
// per equipped item, each mirroring that item's statModifiers, sums additively
// in the same GAS band as every other status. This module never re-implements
// computeLoadoutEffects — where an aggregate is wanted, call the real one.
//
// Determinism: no RNG, no clock. Ticks come from world.meta.tick; status ids
// are minted by the injected applyStatus (which draws genId from the world);
// all iteration over slots/candidates uses stable sorted orders.

import type {
  ActionIntent,
  EngineModule,
  EntityState,
  ResolvedEvent,
  ScalarValue,
  WorldState,
} from '@ai-rpg-engine/core';
import type { EquipmentSlot, ItemCatalog, ItemDefinition, Loadout } from './types.js';
import { createEmptyLoadout, equipItem, unequipItem } from './loadout.js';

// ---------------------------------------------------------------------------
// Contract constants
// ---------------------------------------------------------------------------

/**
 * Formula-registry id under which createEquipmentCore publishes the pack's
 * construction-frozen item catalog — the same per-engine transport ability-core
 * uses for ABILITY_CATALOG_FORMULA ('ability-core:catalog'). The registry lives
 * on the ModuleManager, so same-engine consumers (CLI layers, observability
 * modules) resolve the full ItemDefinition[] without every starter re-threading
 * it, while parallel engines with different packs never cross-contaminate.
 * Formulas are code, never serialized, and re-register on Engine.deserialize.
 */
export const EQUIPMENT_CATALOG_FORMULA = 'equipment-core:catalog';

/** Persisted module-state namespace key (world.modules[EQUIPMENT_STATE_KEY]). */
export const EQUIPMENT_STATE_KEY = 'equipment-core';

/**
 * Status id carried by an entity while an item is equipped. Deliberately
 * colon-free: terminal-ui's humanizeStateId strips a `namespace:` prefix, and
 * "Equipped" is player-meaningful, not a namespace — `equipped-trident-and-net`
 * renders as "Equipped Trident And Net" on the HUD Status line.
 */
export function equipStatusId(itemId: string): string {
  return `equipped-${itemId}`;
}

// ---------------------------------------------------------------------------
// Injected status machinery (the pack supplies its engine build's status ops)
// ---------------------------------------------------------------------------

/**
 * Structural subset of @ai-rpg-engine/content-schema's StatusDefinition —
 * declared locally so this package adds no dependency edge. Every field is
 * assignable to the real StatusDefinition, so modules'
 * registerStatusDefinitions accepts these arrays directly.
 */
export type EquipmentStatusDefinition = {
  id: string;
  name: string;
  tags: string[];
  stacking: 'replace';
  duration: { type: 'permanent' };
  modifiers?: { stat: string; operation: 'add'; value: number }[];
  ui?: { icon?: string; color?: string; description?: string };
};

/**
 * The status operations this module needs, shaped to match what
 * @ai-rpg-engine/modules already exports — a pack wires them verbatim:
 *
 * ```ts
 * import { registerStatusDefinitions, applyStatus, removeStatus } from '@ai-rpg-engine/modules';
 * createEquipmentCore({
 *   catalog: itemCatalog,
 *   statuses: { registerDefinitions: registerStatusDefinitions, apply: applyStatus, remove: removeStatus },
 * });
 * ```
 */
export type EquipmentStatusOps = {
  /** modules' registerStatusDefinitions — idempotent content-metadata registry. */
  registerDefinitions: (defs: EquipmentStatusDefinition[]) => void;
  /** modules' applyStatus — applies an AppliedStatus instance to the entity. */
  apply: (
    entity: EntityState,
    statusId: string,
    tick: number,
    options?: {
      stacking?: 'replace' | 'stack' | 'refresh';
      sourceId?: string;
      data?: Record<string, ScalarValue>;
    },
    world?: WorldState,
  ) => ResolvedEvent;
  /** modules' removeStatus — removes the instance; null when absent. */
  remove: (entity: EntityState, statusId: string, tick: number) => ResolvedEvent | null;
};

// ---------------------------------------------------------------------------
// Module state (persisted namespace — ability-core/world-tick conventions)
// ---------------------------------------------------------------------------

/** Persistence shape: per-entity loadouts, keyed by entity id. */
export type EquipmentModuleState = {
  loadouts: Record<string, Loadout>;
};

/**
 * Synthesize-and-attach state access (world-tick's pattern): a world whose
 * namespace was never initialized (pure-WorldState harness, no engine) gets a
 * fresh default written back, so reads and writes always land on the world.
 */
export function getEquipmentState(world: WorldState): EquipmentModuleState {
  const existing = world.modules[EQUIPMENT_STATE_KEY] as EquipmentModuleState | undefined;
  if (existing && typeof existing === 'object' && existing.loadouts) return existing;
  const fresh: EquipmentModuleState = { loadouts: {} };
  world.modules[EQUIPMENT_STATE_KEY] = fresh;
  return fresh;
}

/** An entity's current loadout, or undefined when it has never equipped. */
export function getEntityLoadout(world: WorldState, entityId: string): Loadout | undefined {
  return (world.modules[EQUIPMENT_STATE_KEY] as EquipmentModuleState | undefined)?.loadouts?.[entityId];
}

// ---------------------------------------------------------------------------
// Status definitions from the catalog
// ---------------------------------------------------------------------------

/** Stable stat summary: "(+1 agility)" / "(+1 might, -1 showmanship)". */
function statSummary(item: ItemDefinition): string {
  const entries = Object.entries(item.statModifiers ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  if (entries.length === 0) return '';
  const parts = entries.map(([stat, v]) => `${v >= 0 ? '+' : ''}${v} ${stat}`);
  return ` (${parts.join(', ')})`;
}

/**
 * One StatusDefinition per catalog item: `equipped-<itemId>`, permanent,
 * replace-stacking, modifiers mirroring the item's statModifiers as `add`
 * operations. Registered at module construction AND on every re-construction
 * (Engine.deserialize re-runs register), so a restored save's applied statuses
 * always resolve their modifiers.
 *
 * Tags stay inside modules' fixed semantic vocabulary ('buff') — equipment is
 * a passive benefit, and resistance checks only run on ability-applied
 * statuses, never on this module's direct application.
 */
export function buildEquipmentStatusDefinitions(catalog: ItemCatalog): EquipmentStatusDefinition[] {
  return catalog.items.map((item) => ({
    id: equipStatusId(item.id),
    name: `Equipped: ${item.name}`,
    tags: ['buff'],
    stacking: 'replace' as const,
    duration: { type: 'permanent' as const },
    modifiers: Object.entries(item.statModifiers ?? {})
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([stat, value]) => ({ stat, operation: 'add' as const, value })),
    ui: { description: `${item.name} — ${item.description}` },
  }));
}

// ---------------------------------------------------------------------------
// Shared handler helpers
// ---------------------------------------------------------------------------

/** Empty-id event; WorldStore.recordEvent stamps the deterministic id. */
function makeEvent(
  action: ActionIntent,
  type: string,
  payload: Record<string, unknown>,
  extra?: Partial<ResolvedEvent>,
): ResolvedEvent {
  return { id: '', tick: action.issuedAtTick, type, actorId: action.actorId, payload, ...extra };
}

/**
 * Structured rejection idiom: `reason` is the player-facing line (terminal-ui
 * renders it as "> You can't do that: <reason>"), `hint` is the machine-and-
 * player guidance field consumers can surface separately.
 */
function reject(action: ActionIntent, reason: string, hint: string, extra?: Record<string, unknown>): ResolvedEvent[] {
  return [makeEvent(action, 'action.rejected', { verb: action.verb, reason, hint, ...extra })];
}

function findItem(catalog: ItemCatalog, itemId: string): ItemDefinition | undefined {
  return catalog.items.find((i) => i.id === itemId);
}

/** The item reference the player supplied, from any intent field that carries one. */
function itemRefOf(action: ActionIntent): string | undefined {
  const fromParams = action.parameters?.itemId;
  if (typeof fromParams === 'string' && fromParams.length > 0) return fromParams;
  if (typeof action.toolId === 'string' && action.toolId.length > 0) return action.toolId;
  const fromTarget = action.targetIds?.[0];
  if (typeof fromTarget === 'string' && fromTarget.length > 0) return fromTarget;
  return undefined;
}

/** Unique catalog-recognized item ids in the actor's inventory (carry order). */
function carriedEquippables(actor: EntityState, catalog: ItemCatalog): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of actor.inventory ?? []) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (findItem(catalog, id)) out.push(id);
  }
  return out;
}

/** Resolve a player-supplied reference against the catalog: exact id, then exact name (case-insensitive). */
function resolveCatalogItem(catalog: ItemCatalog, ref: string): ItemDefinition | undefined {
  const exact = findItem(catalog, ref);
  if (exact) return exact;
  const lower = ref.toLowerCase();
  return catalog.items.find((i) => i.name.toLowerCase() === lower);
}

/** Equipped [slot, itemId] pairs in stable slot order. */
function equippedEntries(loadout: Loadout): [EquipmentSlot, string][] {
  return (Object.keys(loadout.equipped) as EquipmentSlot[])
    .sort()
    .filter((slot) => loadout.equipped[slot] !== null)
    .map((slot) => [slot, loadout.equipped[slot] as string]);
}

/**
 * Stage the entity's live inventory into its persisted loadout so the
 * equipment package's own transition functions (equipItem/unequipItem — swap
 * semantics, requiredTags gate) operate on current truth. The entity's
 * inventory is THE carried-items source; the loadout's inventory field is a
 * working copy synced back after each transition.
 */
function stageLoadout(state: EquipmentModuleState, actor: EntityState): Loadout {
  const stored = state.loadouts[actor.id];
  const staged: Loadout = stored
    ? { equipped: { ...stored.equipped }, inventory: [...(actor.inventory ?? [])] }
    : { ...createEmptyLoadout(), inventory: [...(actor.inventory ?? [])] };
  return staged;
}

/** Commit a transitioned loadout: entity inventory, persisted state, and the core-typed equipment mirror. */
function commitLoadout(
  world: WorldState,
  state: EquipmentModuleState,
  actor: EntityState,
  loadout: Loadout,
): void {
  actor.inventory = [...loadout.inventory];
  state.loadouts[actor.id] = loadout;
  world.modules[EQUIPMENT_STATE_KEY] = state;
  // EntityState.equipment is core's own serialized slot map — mirror it so any
  // consumer (save inspectors, future UI) sees the loadout without this
  // module's state. Occupied slots only: content-schema's ref validator
  // iterates equipment entries against the item registry, and a null slot
  // value would read as an unknown-item reference there. The namespace
  // remains the source of truth (it keeps the full slot record).
  const occupied: Record<string, string | null> = {};
  for (const [slot, itemId] of Object.entries(loadout.equipped)) {
    if (itemId !== null) occupied[slot] = itemId;
  }
  actor.equipment = occupied;
}

function presentation(channels: ('objective' | 'narrator')[], priority: 'low' | 'normal'): ResolvedEvent['presentation'] {
  return { channels, priority };
}

// ---------------------------------------------------------------------------
// Verb handlers
// ---------------------------------------------------------------------------

function equipHandler(
  action: ActionIntent,
  world: WorldState,
  readCatalog: () => ItemCatalog,
  statuses: EquipmentStatusOps,
): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) {
    return reject(action, 'actor not found', 'Only a live entity in the world can equip.');
  }
  if ((actor.resources.hp ?? 0) <= 0) {
    return reject(action, 'actor is defeated', 'The defeated equip nothing.');
  }

  const catalog = readCatalog();
  const carried = carriedEquippables(actor, catalog);

  // Resolve the item: explicit reference, or the single carried equippable.
  let item: ItemDefinition | undefined;
  const ref = itemRefOf(action);
  if (ref === undefined) {
    if (carried.length === 0) {
      return reject(
        action,
        'nothing to equip — no equipment in inventory',
        'Equipment comes from the pack armory; check your inventory.',
      );
    }
    if (carried.length > 1) {
      return reject(
        action,
        `equip what? carrying: ${carried.join(', ')}`,
        'equip <item-id>',
        { candidates: carried },
      );
    }
    item = findItem(catalog, carried[0]);
  } else {
    item = resolveCatalogItem(catalog, ref);
    if (!item) {
      const carriedNote = carried.length > 0 ? ` — carrying: ${carried.join(', ')}` : '';
      return reject(
        action,
        `no equipment called '${ref}'${carriedNote}`,
        "equip <item-id> (or bare 'equip' when carrying exactly one)",
        { itemRef: ref },
      );
    }
  }
  if (!item) {
    // Unreachable in practice (carried ids come from the catalog); keep the
    // rejection structured rather than throwing.
    return reject(action, 'nothing to equip — no equipment in inventory', 'Check your inventory.');
  }

  // Possession gate: the equipment package's equipItem is a pure state helper
  // and does not model possession; the game rule here is "you equip what you
  // carry". (Slot mechanics below are the package's own.)
  if (!(actor.inventory ?? []).includes(item.id)) {
    const carriedNote = carried.length > 0 ? ` — carrying: ${carried.join(', ')}` : ' — carrying nothing equippable';
    return reject(
      action,
      `not carrying '${item.id}'${carriedNote}`,
      'Pick it up first, then equip it.',
      { itemId: item.id },
    );
  }

  const state = getEquipmentState(world);
  const staged = stageLoadout(state, actor);
  const displacedId = staged.equipped[item.slot];

  // The equipment package's OWN transition: occupied slot → swap (displaced
  // item returns to inventory), requiredTags gate → error strings verbatim.
  const result = equipItem(staged, item.id, catalog, actor.tags);
  if (result.errors.length > 0) {
    return reject(action, result.errors[0], `Requires: ${(item.requiredTags ?? []).join(', ') || 'nothing'} — check your tags.`, {
      itemId: item.id,
      errors: result.errors,
    });
  }

  commitLoadout(world, state, actor, result.loadout);

  const tick = world.meta.tick;
  const events: ResolvedEvent[] = [];

  // Swap: retire the displaced item's status first so the log reads in order.
  if (displacedId && displacedId !== item.id) {
    const displaced = findItem(catalog, displacedId);
    const removed = statuses.remove(actor, equipStatusId(displacedId), tick);
    if (removed) {
      removed.payload.description = `Unequipped: ${displaced?.name ?? displacedId}.`;
      removed.payload.itemId = displacedId;
      removed.payload.slot = item.slot;
      removed.presentation = presentation(['objective'], 'normal');
      events.push(removed);
    }
  }

  // The stat carrier: one status per equipped item; effectiveStat aggregates.
  const applied = statuses.apply(
    actor,
    equipStatusId(item.id),
    tick,
    { stacking: 'replace', sourceId: actor.id, data: { itemId: item.id, slot: item.slot } },
    world,
  );
  applied.payload.description = `Equipped: ${item.name}.${statSummary(item)}`;
  applied.payload.itemId = item.id;
  applied.payload.slot = item.slot;
  applied.presentation = presentation(['objective', 'narrator'], 'normal');
  events.push(applied);

  // Objective record for consumers/tests (terminal-ui renders unknown types
  // as nothing; the visible lines above ride the status events).
  events.push(
    makeEvent(action, 'item.equipped', {
      entityId: actor.id,
      entityName: actor.name,
      itemId: item.id,
      itemName: item.name,
      slot: item.slot,
      ...(displacedId && displacedId !== item.id ? { displacedItemId: displacedId } : {}),
      ...(item.statModifiers ? { statModifiers: { ...item.statModifiers } } : {}),
      ...(item.resourceModifiers ? { resourceModifiers: { ...item.resourceModifiers } } : {}),
      ...(item.grantedTags ? { grantedTags: [...item.grantedTags] } : {}),
      ...(item.grantedVerbs ? { grantedVerbs: [...item.grantedVerbs] } : {}),
    }, {
      targetIds: [actor.id],
      tags: ['equipment'],
      presentation: presentation(['objective'], 'low'),
    }),
  );

  return events;
}

function unequipHandler(
  action: ActionIntent,
  world: WorldState,
  readCatalog: () => ItemCatalog,
  statuses: EquipmentStatusOps,
): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) {
    return reject(action, 'actor not found', 'Only a live entity in the world can unequip.');
  }
  if ((actor.resources.hp ?? 0) <= 0) {
    return reject(action, 'actor is defeated', 'The defeated carry their gear to the sand.');
  }

  const catalog = readCatalog();
  const state = getEquipmentState(world);
  const staged = stageLoadout(state, actor);
  const equipped = equippedEntries(staged);

  const describeEquipped = () => equipped.map(([slot, id]) => `${slot}: ${id}`).join(', ');

  // Resolve which slot to clear: explicit slot name, explicit item id/name,
  // or the single equipped item.
  let slot: EquipmentSlot | undefined;
  const ref = itemRefOf(action);
  if (ref === undefined) {
    if (equipped.length === 0) {
      return reject(action, 'nothing is equipped', 'equip <item> first.');
    }
    if (equipped.length > 1) {
      return reject(
        action,
        `unequip what? equipped: ${describeEquipped()}`,
        'unequip <item-id-or-slot>',
        { equipped: equipped.map(([s, id]) => ({ slot: s, itemId: id })) },
      );
    }
    slot = equipped[0][0];
  } else {
    const lower = ref.toLowerCase();
    const bySlot = equipped.find(([s]) => s === lower);
    if (bySlot) {
      slot = bySlot[0];
    } else {
      const byItem = equipped.find(([, id]) => {
        if (id === ref || id.toLowerCase() === lower) return true;
        const def = findItem(catalog, id);
        return def !== undefined && def.name.toLowerCase() === lower;
      });
      if (!byItem) {
        const note = equipped.length > 0 ? ` — equipped: ${describeEquipped()}` : ' — nothing is equipped';
        return reject(action, `'${ref}' is not equipped${note}`, 'unequip <item-id-or-slot>', { itemRef: ref });
      }
      slot = byItem[0];
    }
  }

  const itemId = staged.equipped[slot] as string;
  const item = findItem(catalog, itemId);

  // The equipment package's OWN transition: slot → inventory.
  const next = unequipItem(staged, slot);
  commitLoadout(world, state, actor, next);

  const tick = world.meta.tick;
  const events: ResolvedEvent[] = [];

  const removed = statuses.remove(actor, equipStatusId(itemId), tick);
  if (removed) {
    removed.payload.description = `Unequipped: ${item?.name ?? itemId}.`;
    removed.payload.itemId = itemId;
    removed.payload.slot = slot;
    removed.presentation = presentation(['objective'], 'normal');
    events.push(removed);
  }

  events.push(
    makeEvent(action, 'item.unequipped', {
      entityId: actor.id,
      entityName: actor.name,
      itemId,
      itemName: item?.name ?? itemId,
      slot,
    }, {
      targetIds: [actor.id],
      tags: ['equipment'],
      presentation: presentation(['objective'], 'low'),
    }),
  );

  return events;
}

// ---------------------------------------------------------------------------
// Module factory
// ---------------------------------------------------------------------------

export type EquipmentCoreConfig = {
  /** The pack's item catalog — published under EQUIPMENT_CATALOG_FORMULA at construction. */
  catalog: ItemCatalog;
  /** The engine build's status machinery (modules' registerStatusDefinitions / applyStatus / removeStatus). */
  statuses: EquipmentStatusOps;
};

/**
 * Equip/unequip verbs over this package's Loadout model.
 *
 * - Catalog transport: publishes the construction-frozen catalog under
 *   {@link EQUIPMENT_CATALOG_FORMULA}; its own handlers read back through the
 *   formula registry (the per-engine transport), falling back to the frozen
 *   config only if the registry is unavailable.
 * - Loadout state: persisted under the 'equipment-core' namespace
 *   ({@link EquipmentModuleState}), one Loadout per entity.
 * - Stat carry: `equipped-<itemId>` statuses (one per equipped item) whose
 *   modifiers mirror the item's statModifiers; modules' effectiveStat
 *   aggregates them into every combat formula read. Definitions re-register on
 *   every construction, so save/load restores the numbers.
 * - Slot semantics: this package's own equipItem/unequipItem — occupied slot
 *   swaps the displaced item back to inventory; requiredTags gate rejects with
 *   the package's own error strings.
 *
 * Non-goals of this slice (reported in item.equipped payloads, not applied):
 * grantedTags, grantedVerbs, and resourceModifiers.
 */
export function createEquipmentCore(config: EquipmentCoreConfig): EngineModule {
  return {
    id: 'equipment-core',
    version: '0.1.0',
    dependsOn: ['status-core'],

    register(ctx) {
      // Publish the construction-frozen catalog (per-engine formula registry).
      ctx.formulas.register(EQUIPMENT_CATALOG_FORMULA, () => config.catalog);

      // Content-metadata: one status definition per catalog item. Idempotent,
      // and re-runs on Engine.deserialize so restored statuses keep modifiers.
      config.statuses.registerDefinitions(buildEquipmentStatusDefinitions(config.catalog));

      // Handlers resolve the catalog THROUGH the registry at handle time —
      // the same transport consumers use — so there is one read path.
      const readCatalog = (): ItemCatalog => {
        if (ctx.formulas.has(EQUIPMENT_CATALOG_FORMULA)) {
          const published = ctx.formulas.get(EQUIPMENT_CATALOG_FORMULA)() as ItemCatalog | undefined;
          if (published && Array.isArray(published.items)) return published;
        }
        return config.catalog;
      };

      ctx.actions.registerVerb('equip', (action, world) =>
        equipHandler(action, world, readCatalog, config.statuses),
      );
      ctx.actions.registerVerb('unequip', (action, world) =>
        unequipHandler(action, world, readCatalog, config.statuses),
      );

      ctx.persistence.registerNamespace(EQUIPMENT_STATE_KEY, {
        loadouts: {},
      } satisfies EquipmentModuleState);
    },
  };
}
