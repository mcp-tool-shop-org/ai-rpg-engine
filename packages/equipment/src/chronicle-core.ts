// item-chronicle-core — the WRITE side of the item chronicle.
//
// The `equipment` package has shipped the READ side since v3.3: item-chronicle.ts
// (recordItemEvent / getItemKillCount / …) and relic-growth.ts
// (evaluateRelicGrowth → tier + epithet) are pure, tested, and correct. They
// were also INERT: nothing in a running game ever populated a chronicle in
// world state, so `evaluateRelicGrowth` was only ever called with fixtures.
// packages/modules/src/world-tick.ts named this directly ("item-recognition's
// chronicle never reaches the world eventLog"), and the ledger adapter's
// equipment-snapshot.ts disclosed the consequence: on real content every
// item's relicVersion is 0. This module closes that loop.
//
// ── WHY THIS LIVES IN `equipment` AND NOT IN `modules` ─────────────────────
// The producer must call `evaluateRelicGrowth` to compute a growth summary.
// `@ai-rpg-engine/modules` carries NO runtime dependency on this package —
// its three references (crafting-core.ts, crafting-recipes.ts,
// item-recognition.ts) are all `import type`, and two of them carry comments
// stating the value-import is deliberately impossible. So the producer cannot
// live there without breaking that boundary. Here it value-imports its own
// package's pure functions freely, and reaches the engine only through the
// ordinary `EngineModule` event seam that equipment-core.ts already uses.
//
// ── THE DETERMINISM GATE (the load-bearing invariant) ──────────────────────
// Recording happens IN-TICK, off the event stream — the deliberate choice
// over a checkpoint-time projection, because `combat.entity.defeated` carries
// NO weapon attribution (combat-core.ts emits entityId / defeatedBy /
// defeatedByName / defeatZoneId / wasInterceptor and nothing else). A
// projection would have to fold item.equipped/item.unequipped to reconstruct
// which weapon occupied the slot at tick N and join that against each defeat
// — a reconstruction whose failure mode is SILENT misattribution, and which
// cannot surface an epithet until the next checkpoint. Recording at the kill
// reads the loadout that is unambiguously in hand.
//
// Byte-identical legacy replay is preserved BY CONSTRUCTION, two ways:
//   1. This is a SEPARATE, OPT-IN module. A pack that does not add it to its
//      module list has exactly the engine that shipped before it existed.
//   2. It registers NO namespace default — the npc-agency contract. A world
//      that opts in but never actually records anything (no catalog item ever
//      equipped, no kill with a weapon in hand) never sees
//      world.modules['item-chronicle'] come into being at all, not even an
//      empty scaffold. ModuleManager.initializeNamespaces writes every
//      REGISTERED default unconditionally, so the only way to keep that
//      promise is to never register one.
//
//      NOT opportunity-core, which an earlier draft of this comment cited
//      alongside npc-agency: createOpportunityCore DOES register a default
//      (`{ opportunities: [], resolvedOpportunities: [] }`), so an empty
//      scaffold lands in every world from turn zero. What it shares with
//      npc-agency is the lazy, tolerant ACCESSOR style, which is a different
//      axis from whether a default is registered — npc-agency's own file
//      comment draws that distinction correctly.
// Recording itself is deterministic: driven off the resolved event stream,
// keyed on event.tick, no Math.random(), no Date.now(), no wall clock.

import type { EngineModule, EntityState, WorldState } from '@ai-rpg-engine/core';
import type { ItemCatalog, ItemChronicleEntry, ItemDefinition } from './types.js';
import { recordItemEvent } from './item-chronicle.js';
import { evaluateRelicGrowth, type GrowthMilestone } from './relic-growth.js';
import { computeItemNotoriety } from './provenance.js';
import { getEntityLoadout } from './equipment-core.js';

/** Persisted module-state namespace key (world.modules[ITEM_CHRONICLE_STATE_KEY]). */
export const ITEM_CHRONICLE_STATE_KEY = 'item-chronicle';

/**
 * The engine-computed growth summary for one item, persisted alongside the
 * raw entries.
 *
 * This exists so a consumer can read an item's tier WITHOUT calling
 * `evaluateRelicGrowth` itself. That matters for the ledger adapter, whose
 * equipment-snapshot.ts is type-only against this package by design (its
 * header: calling `evaluateRelicGrowth`/`getRelicTier` "would be a runtime
 * coupling this package's firewall forbids"). The engine computes; the
 * adapter reads plain data off a namespace — the same shape it already reads
 * `loadouts` with, via a locally-declared type and a duplicated string key.
 *
 * `milestoneCount` is the intended `relicVersion` axis. A raw chronicle-entry
 * count would advance an NFT's URI on an `acquired` event alone — churn, not
 * growth — whereas a milestone is by definition the moment an item's story
 * changed. XLS-46 NFTokenModify exists to record that an asset's state
 * evolved; "picked it up" is not evolution.
 */
export type ItemRelicSummary = {
    itemId: string;
    /** Growth milestones crossed — the meaningful-growth axis (the `relicVersion` source). */
    milestoneCount: number;
    /** Coarse 0–3 tier, straight from `evaluateRelicGrowth`. */
    tier: number;
    /** Epithet-resolved name for display ("Bloodied Cutlass"), or the plain name at tier 0. */
    displayName: string;
    /** The current epithet, when one has been earned. */
    epithet?: string;
    /**
     * 0–1 notoriety from `computeItemNotoriety` (F-ea6b2a41), persisted so
     * hosts and recognition injects read one number off the namespace.
     */
    notoriety: number;
};

/** The persisted shape at world.modules[ITEM_CHRONICLE_STATE_KEY]. */
export type ItemChronicleModuleState = {
    /** Raw history, keyed by item id — the `recordItemEvent` shape. */
    entries: Record<string, ItemChronicleEntry[]>;
    /** Engine-computed growth summary, keyed by item id. */
    summaries: Record<string, ItemRelicSummary>;
};

/**
 * The recognition evaluator, INJECTED rather than imported.
 *
 * `evaluateItemRecognition` lives in `@ai-rpg-engine/modules`, which this
 * package may not import at runtime (modules is a devDependency here, and the
 * dependency runs the other way). equipment-core.ts already solved exactly
 * this with `EquipmentStatusOps` — status machinery is injected by the pack
 * "so this package keeps zero runtime dependencies" — and this is the same
 * pattern applied to the same problem.
 *
 * The shape is structural and matches `evaluateItemRecognition`'s signature
 * exactly, so a pack passes the function straight through with no adapter.
 *
 * NOTE the deliberate omission: `shouldRecognize`, the PROBABILISTIC gate, is
 * not used here and must not be. It needs a seeded roll drawn from the world
 * RNG, and consuming a draw would shift every subsequent roll in the run —
 * which is precisely the byte-identical replay guarantee this module exists
 * to keep. `evaluateItemRecognition` is rule-driven (provenance + faction
 * match), reads the world seed only as a pure hash input, and draws nothing.
 */
export type ItemRecognitionOps = {
    evaluate(
        equippedItems: ItemDefinition[],
        npcFactionId: string | undefined,
        itemChronicle: Record<string, ItemChronicleEntry[]>,
        tick: number,
        worldSeed?: number,
    ): ReadonlyArray<{ itemId: string; itemName: string; narratorHint: string }>;
};

export type ItemChronicleCoreConfig = {
    /** The pack's item catalog — the same one equipment-core is built with. */
    catalog: ItemCatalog;
    /**
     * Optional per-item milestone overrides, keyed by item id. Falls back to
     * `evaluateRelicGrowth`'s slot-derived defaults (DEFAULT_WEAPON_MILESTONES
     * for weapons, DEFAULT_ARMOR_MILESTONES otherwise).
     */
    milestones?: Record<string, GrowthMilestone[]>;
    /**
     * Optional recognition evaluator. Omit it and no `recognized` entry is ever
     * written — which also means `recognition-count` milestones stay unreachable,
     * and since DEFAULT_ARMOR_MILESTONES is only `age` + `recognition-count`,
     * armor then grows on age alone.
     */
    recognition?: ItemRecognitionOps;
};

// ---------------------------------------------------------------------------
// Lazy, tolerant, NON-ATTACHING accessors (the npc-agency contract)
// ---------------------------------------------------------------------------

/** Peek the namespace WITHOUT creating it. */
function peekChronicleState(world: WorldState): ItemChronicleModuleState | undefined {
    const ns = world.modules[ITEM_CHRONICLE_STATE_KEY];
    return ns && typeof ns === 'object' && !Array.isArray(ns)
        ? (ns as ItemChronicleModuleState)
        : undefined;
}

/**
 * The full persisted chronicle, keyed by item id. `{}` when the namespace is
 * absent (nothing has ever been recorded in this world) or malformed — never
 * throws, never attaches. This is the value a checkpoint driver passes to the
 * ledger adapter's `equipmentSnapshotFromWorld(world, playerId, catalog, chronicle)`.
 *
 * Snapshot, not the live module object (F-fe938876): mutating the return
 * value must not rewrite `world.modules['item-chronicle'].entries`.
 */
export function getItemChronicle(world: WorldState): Record<string, ItemChronicleEntry[]> {
    const entries = peekChronicleState(world)?.entries;
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return {};
    return structuredClone(entries);
}

/** Every engine-computed relic summary, keyed by item id. `{}` when absent. Snapshot (F-fe938876). */
export function getRelicSummaries(world: WorldState): Record<string, ItemRelicSummary> {
    const summaries = peekChronicleState(world)?.summaries;
    if (!summaries || typeof summaries !== 'object' || Array.isArray(summaries)) return {};
    return structuredClone(summaries);
}

/** One item's summary, or undefined when it has no recorded history. */
export function getRelicSummary(world: WorldState, itemId: string): ItemRelicSummary | undefined {
    return getRelicSummaries(world)[itemId];
}

/**
 * The name an item should be shown under right now — its earned epithet once
 * it has grown, else `fallback`. The one call a display surface needs.
 */
export function getItemDisplayName(world: WorldState, itemId: string, fallback: string): string {
    return getRelicSummary(world, itemId)?.displayName ?? fallback;
}

/**
 * Persist the chronicle. The ONLY writer is this module's own event handlers,
 * and each gates the call on having actually produced an entry — seed-0
 * identity depends on this never being invoked for a world with no history.
 */
function writeChronicleState(
    world: WorldState,
    entries: Record<string, ItemChronicleEntry[]>,
    summaries: Record<string, ItemRelicSummary>,
): void {
    world.modules[ITEM_CHRONICLE_STATE_KEY] = { entries, summaries } satisfies ItemChronicleModuleState;
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

function findItem(catalog: ItemCatalog, itemId: string): ItemDefinition | undefined {
    return catalog.items.find((i) => i.id === itemId);
}

/**
 * Author the free-text `detail` for a kill entry.
 *
 * Load-bearing, and not merely flavour: relic-growth.ts resolves two of the
 * five GrowthTrigger members by SUBSTRING-MATCHING this field —
 * `faction-kills` counts entries whose detail contains "faction",
 * `boss-kill` counts entries containing "boss". That authoring convention is
 * documented in relic-growth.ts's own comments, but nothing enforced it, so
 * both triggers were unreachable in practice. Emitting the literals here is
 * what makes them fire on real play; chronicle-core.test.ts pins it, so a
 * later reword of this string cannot silently kill two triggers.
 */
function buildKillDetail(defeatedName: string, defeated: EntityState | undefined): string {
    const parts = [`Slew ${defeatedName}`];
    if (isBoss(defeated)) parts.push('— a boss');
    if (defeated?.faction) parts.push(`— faction ${defeated.faction}`);
    return parts.join(' ');
}

/**
 * Is this a boss, by the convention SHIPPED CONTENT actually uses?
 *
 * Every one of the ten starter packs tags its boss `role:boss` — never a bare
 * `boss` (grep `tags: \[.*boss` across packages/starter-*: ten hits, all
 * `role:boss`). An `Array.includes('boss')` check is exact membership, so it
 * matches none of them, and the `boss-kill` trigger stayed unreachable on real
 * content even after the detail-literal convention was enforced. Accepting the
 * `role:` prefix is what actually lights it up. The bare form is still honored
 * for hand-built worlds and fixtures that predate the convention.
 */
function isBoss(defeated: EntityState | undefined): boolean {
    return (defeated?.tags ?? []).some((t) => t === 'boss' || t === 'role:boss');
}

/** Recompute one item's growth summary from its full chronicle. */
function summarize(
    item: ItemDefinition,
    chronicle: ItemChronicleEntry[],
    tick: number,
    milestones?: GrowthMilestone[],
): ItemRelicSummary {
    const relic = evaluateRelicGrowth(item, chronicle, tick, milestones);
    return {
        itemId: item.id,
        milestoneCount: relic.milestonesReached.length,
        tier: relic.tier,
        displayName: relic.currentEpithet ?? item.name,
        notoriety: computeItemNotoriety(item, chronicle),
        ...(relic.currentEpithet ? { epithet: relic.currentEpithet } : {}),
    };
}

/**
 * Rebuild EVERY item's summary, not just the one that changed.
 *
 * This is what makes the `age` trigger reachable. Age is the one growth axis
 * that advances without anything happening to the item — `getItemAge` is
 * `currentTick - firstEntry.tick` — so a summary computed once at write time
 * and never revisited would freeze an item's age at zero forever. There is no
 * per-tick event to hang a refresh on (cognition-core.ts:140 records the
 * reason: `advanceTick` only does `meta.tick++`, it emits nothing), so the
 * refresh rides every chronicle write instead: anything happening to any item
 * re-ages all of them. A world where nothing at all happens for 100 ticks
 * ages nothing, which is the honest reading of "nothing happened";
 * `refreshRelicSummaries` is the explicit out for a checkpoint driver that
 * needs current ages on demand.
 *
 * Keys are emitted in sorted order so the persisted object serializes
 * identically across runs regardless of the order events arrived in.
 */
function rebuildSummaries(
    config: ItemChronicleCoreConfig,
    entries: Record<string, ItemChronicleEntry[]>,
    tick: number,
): Record<string, ItemRelicSummary> {
    const summaries: Record<string, ItemRelicSummary> = {};
    for (const itemId of Object.keys(entries).sort()) {
        const item = findItem(config.catalog, itemId);
        if (!item) continue;
        summaries[itemId] = summarize(item, entries[itemId] ?? [], tick, config.milestones?.[itemId]);
    }
    return summaries;
}

/** One pending chronicle write, before it is committed. */
type PendingEntry = {
    itemId: string;
    event: ItemChronicleEntry['event'];
    detail: string;
    zoneId?: string;
};

/**
 * Commit a batch of chronicle entries in ONE transaction against the
 * namespace, then refresh every summary.
 *
 * Batched rather than one-at-a-time because a single equip can produce an
 * `acquired` plus several `recognized` entries, and each separate commit
 * would rebuild every summary again for no gain.
 *
 * Returns false — writing NOTHING — when no pending entry resolves against the
 * catalog. An id we cannot resolve has no growth story, and must never be the
 * reason an otherwise-legacy world gains a namespace.
 */
function applyEntries(
    world: WorldState,
    config: ItemChronicleCoreConfig,
    pending: readonly PendingEntry[],
    tick: number,
): boolean {
    const resolved = pending.filter((p) => findItem(config.catalog, p.itemId));
    if (resolved.length === 0) return false;

    let entries = getItemChronicle(world);
    for (const p of resolved) {
        entries = recordItemEvent(
            entries,
            p.itemId,
            { event: p.event, detail: p.detail, ...(p.zoneId ? { zoneId: p.zoneId } : {}) },
            tick,
        );
    }

    writeChronicleState(world, entries, rebuildSummaries(config, entries, tick));
    return true;
}

/** Has this item already been chronicled as acquired? */
function alreadyAcquired(world: WorldState, itemId: string): boolean {
    return (getItemChronicle(world)[itemId] ?? []).some((e) => e.event === 'acquired');
}

/**
 * Re-age every chronicled item against `tick` without recording anything.
 *
 * For callers that need current ages at a moment no chronicle write happened
 * to land on — principally a checkpoint driver about to snapshot for the
 * ledger, where a stale tier would be minted into an NFT URI. Takes the config
 * because milestones and catalog are the pack's, not the world's.
 *
 * No-ops (returning false, attaching nothing) on a world with no chronicle —
 * refreshing must never be what brings the namespace into being.
 */
export function refreshRelicSummaries(
    world: WorldState,
    config: ItemChronicleCoreConfig,
    tick: number,
): boolean {
    const entries = getItemChronicle(world);
    if (Object.keys(entries).length === 0) return false;
    writeChronicleState(world, entries, rebuildSummaries(config, entries, tick));
    return true;
}

/**
 * item-chronicle-core — populates the item chronicle from real play so relic
 * growth manifests during a session.
 *
 * OPT-IN: a pack adds this to its module list to turn gear history on. Packs
 * that do not are byte-identical to the engine as it shipped without it.
 * Requires equipment-core, whose persisted loadout is how a kill is attributed
 * to the weapon that landed it.
 *
 * Records:
 *   - `acquired`     — the first time an item is picked up OR equipped
 *   - `used-in-kill` — on `combat.entity.defeated`, against the killer's
 *                      currently-equipped weapon
 *   - `recognized`   — when an NPC sharing the wearer's zone reacts to
 *                      equipped provenance (requires `config.recognition`)
 */
export function createItemChronicleCore(config: ItemChronicleCoreConfig): EngineModule {
    return {
        id: 'item-chronicle-core',
        version: '1.0.0',
        dependsOn: ['equipment-core'],

        register(ctx) {
            // Picked up but not yet worn. inventory-core's `giveItem` is the loot
            // path, and an item's story starts when it comes into your hands, not
            // when it first reaches a slot — otherwise a blade carried for a
            // hundred ticks and then drawn reads as brand new, and `age` (measured
            // from the FIRST entry) silently restarts at the moment of equipping.
            ctx.events.on('item.acquired', (event, world) => {
                const itemId = event.payload.itemId as string | undefined;
                if (!itemId || alreadyAcquired(world, itemId)) return;

                const holder = event.actorId ? world.entities[event.actorId] : undefined;
                applyEntries(
                    world,
                    config,
                    [
                        {
                            itemId,
                            event: 'acquired',
                            detail: `Picked up by ${holder?.name ?? 'someone'}`,
                            ...(holder?.zoneId ? { zoneId: holder.zoneId } : {}),
                        },
                    ],
                    event.tick,
                );
            });

            // Changing hands. `lost` has been a member of ItemChronicleEvent
            // since the type was written and had NO producer anywhere in the
            // engine until inventory-core's `give` verb existed — there was no
            // way for an item to leave one entity for another, so nothing could
            // ever stamp it.
            //
            // Reached by EVENT, not by import: inventory-core lives in
            // @ai-rpg-engine/modules and knows nothing about this package or
            // about chronicles. It emits `item.lost` alongside `item.acquired`
            // and both sides of a transfer land in the item's history, while a
            // pack that never opts into chronicling is unaffected.
            //
            // No `alreadyAcquired`-style guard: an object can change hands many
            // times and each is a real event in its story, unlike acquisition
            // which is once by definition.
            ctx.events.on('item.lost', (event, world) => {
                const itemId = event.payload.itemId as string | undefined;
                if (!itemId) return;

                const formerHolder = world.entities[event.payload.entityId as string];
                const recipient = world.entities[event.payload.toEntityId as string];
                const detail = recipient
                    ? `Handed to ${recipient.name} by ${formerHolder?.name ?? 'someone'}`
                    : `Lost by ${formerHolder?.name ?? 'someone'}`;

                applyEntries(
                    world,
                    config,
                    [
                        {
                            itemId,
                            event: 'lost',
                            detail,
                            ...(formerHolder?.zoneId ? { zoneId: formerHolder.zoneId } : {}),
                        },
                    ],
                    event.tick,
                );
            });

            // Equipping does two things at once: it may be the first time the item
            // enters its owner's story, and it is the moment anyone nearby gets a
            // look at what they are carrying. Both are collected and committed in
            // one batch.
            ctx.events.on('item.equipped', (event, world) => {
                const itemId = event.payload.itemId as string | undefined;
                if (!itemId) return;
                // F-ff179b5b: already-equipped no-op is not a new look.
                if (event.payload.alreadyEquipped === true) return;

                const holder = world.entities[event.payload.entityId as string];
                const pending: PendingEntry[] = [];

                // Recorded once: a re-equip is not a second acquisition, and letting
                // it repeat would inflate every count derived from the chronicle.
                if (!alreadyAcquired(world, itemId)) {
                    pending.push({
                        itemId,
                        event: 'acquired',
                        detail: `Taken up by ${(event.payload.entityName as string) ?? 'someone'}`,
                        ...(holder?.zoneId ? { zoneId: holder.zoneId } : {}),
                    });
                }

                pending.push(...collectRecognitions(world, config, holder, event.tick));
                applyEntries(world, config, pending, event.tick);
            });

            // The kill is credited to the weapon in the killer's hand at the moment
            // it lands. `defeatedBy` is an ENTITY id — the event carries no weapon
            // attribution — so the equipped weapon comes from equipment-core's
            // persisted loadout, which is authoritative right now and needs no
            // reconstruction.
            ctx.events.on('combat.entity.defeated', (event, world) => {
                const killerId = event.payload.defeatedBy as string | undefined;
                if (!killerId) return;

                const weaponId = getEntityLoadout(world, killerId)?.equipped?.weapon;
                if (!weaponId) return; // barehanded, or a killer with no loadout — nothing grows

                const defeatedId = event.payload.entityId as string | undefined;
                const defeated = defeatedId ? world.entities[defeatedId] : undefined;
                const defeatedName = (event.payload.entityName as string) ?? defeated?.name ?? 'a foe';
                const zoneId = event.payload.defeatZoneId as string | undefined;

                applyEntries(
                    world,
                    config,
                    [
                        {
                            itemId: weaponId,
                            event: 'used-in-kill',
                            detail: buildKillDetail(defeatedName, defeated),
                            ...(zoneId ? { zoneId } : {}),
                        },
                    ],
                    event.tick,
                );
            });
        },
    };
}

/**
 * Who noticed what the wearer is carrying, this equip.
 *
 * Scoped to OTHER entities sharing the wearer's zone. Iteration follows
 * `world.entities` insertion order, which is deterministic across same-seed
 * runs.
 *
 * NOT gated on the onlooker having a faction — and that distinction is the
 * whole difference between this trigger working and not. `EntityState.faction`
 * is optional and **no entity in any of the ten shipped starter packs sets it**
 * (grep `^\s*faction: '` across packages/starter-*: zero hits). An earlier
 * `if (!npc.faction) continue` guard therefore made `recognized` unreachable on
 * every shipped pack — and with it `recognition-count`, and with THAT armor
 * growth entirely, since DEFAULT_ARMOR_MILESTONES is only age +
 * recognition-count.
 *
 * The guard was also unnecessary on its own terms: `evaluateItemRecognition`
 * types `npcFactionId` as `string | undefined` and only consults it on the
 * faction-match path. Its flag-based path (stolen / cursed / trophy / heirloom /
 * blessed) and its notoriety path both fire with no faction at all — and
 * shipped content does carry those flags (gladiator's `iron-manacles` is
 * `flags: ['trophy']`, `patron-token` is `factionId: 'patron-circle'` +
 * `heirloom`). Passing `undefined` straight through is what the signature asks
 * for.
 *
 * At most ONE entry per item per equip, no matter how many onlookers react:
 * `recognition-count` milestones sit at 3 and 8, and letting a crowded room
 * mint an entry per NPC would clear both in a single step. The cap makes the
 * axis mean "how many times has this been noticed", not "how many people were
 * standing there".
 *
 * Fires on equip rather than continuously. A wearer who equips in an empty
 * room and later walks into a crowded one is not noticed until they next
 * change gear — a real ceiling, and the honest one to accept here: a
 * continuous scan needs a per-tick perception pass, which does not exist
 * (there is no tick event) and belongs with the NPC reaction loop, not with
 * the chronicle's write side.
 */
function collectRecognitions(
    world: WorldState,
    config: ItemChronicleCoreConfig,
    holder: EntityState | undefined,
    tick: number,
): PendingEntry[] {
    const ops = config.recognition;
    if (!ops || !holder?.zoneId) return [];

    const loadout = getEntityLoadout(world, holder.id);
    if (!loadout) return [];

    const equippedItems = Object.values(loadout.equipped)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
        .map((id) => findItem(config.catalog, id))
        .filter((item): item is ItemDefinition => item !== undefined);
    if (equippedItems.length === 0) return [];

    const chronicle = getItemChronicle(world);
    const seen = new Set<string>();
    const pending: PendingEntry[] = [];

    for (const npc of Object.values(world.entities)) {
        if (npc.id === holder.id || npc.zoneId !== holder.zoneId) continue;

        for (const result of ops.evaluate(equippedItems, npc.faction, chronicle, tick, world.meta.seed)) {
            if (seen.has(result.itemId)) continue;
            seen.add(result.itemId);
            pending.push({
                itemId: result.itemId,
                event: 'recognized',
                detail: `Recognized by ${npc.name} — ${result.narratorHint}`,
                zoneId: holder.zoneId,
            });
        }
    }

    return pending;
}
