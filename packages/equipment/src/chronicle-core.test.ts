// chronicle-core proof — the write side of the item chronicle.
//
// Two things are under test here, and only one of them is behaviour.
//
// The behaviour: an item accrues history from real play, and that history
// grows it. Before this module, `recordItemEvent` had ZERO production callers
// — its only caller in the entire repo was its own unit test — so
// `evaluateRelicGrowth` had never once run against a chronicle that a played
// session produced. The "grows across a played sequence" test below is the
// first time in this repo's history that an item earns an epithet from events
// the engine actually emitted.
//
// The invariant: turning this on must not perturb a world that does not want
// it, and turning it on must not perturb the event stream even when it does.
// That is the replay gate at the bottom of this file, and it is the reason
// this module is opt-in and registers no namespace default.

import { describe, it, expect, beforeEach } from 'vitest';
import { Engine } from '@ai-rpg-engine/core';
import type { EntityState, GameManifest, ResolvedEvent, ZoneState } from '@ai-rpg-engine/core';
import {
    statusCore,
    applyStatus,
    removeStatus,
    registerStatusDefinitions,
    clearStatusRegistry,
    evaluateItemRecognition,
    giveItem,
} from '@ai-rpg-engine/modules';
import type { ItemCatalog } from './types.js';
import { createEquipmentCore, type EquipmentStatusOps } from './equipment-core.js';
import { getItemKillCount, getItemHistory } from './item-chronicle.js';
import { evaluateRelicGrowth, type GrowthMilestone } from './relic-growth.js';
import {
    createItemChronicleCore,
    getItemChronicle,
    getRelicSummary,
    getItemDisplayName,
    refreshRelicSummaries,
    ITEM_CHRONICLE_STATE_KEY,
    type ItemRecognitionOps,
} from './chronicle-core.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const catalog: ItemCatalog = {
    items: [
        {
            id: 'trident-and-net',
            name: 'Trident & Net',
            description: 'Reach and entanglement.',
            slot: 'weapon',
            rarity: 'uncommon',
            statModifiers: { agility: 1 },
        },
        {
            id: 'gladius',
            name: 'Gladius',
            description: 'A short, brutal sword.',
            slot: 'weapon',
            rarity: 'common',
            statModifiers: { might: 1 },
        },
        {
            id: 'warden-mail',
            name: 'Warden Mail',
            description: 'Taken from a Warden who no longer needed it.',
            slot: 'armor',
            rarity: 'rare',
            statModifiers: { might: 1 },
            provenance: { factionId: 'iron-wardens', flags: ['stolen'] },
        },
    ],
};

const statusOps: EquipmentStatusOps = {
    registerDefinitions: registerStatusDefinitions,
    apply: applyStatus,
    remove: removeStatus,
};

const manifest: GameManifest = {
    id: 'chronicle-proof',
    title: 'Chronicle Proof',
    version: '0.0.1',
    engineVersion: '0.1.0',
    ruleset: 'minimal',
    modules: ['status-core', 'equipment-core'],
    contentPacks: [],
};

type EngineOpts = {
    /** Wire the chronicle module. Off = the engine exactly as it shipped before it existed. */
    chronicle?: boolean;
    milestones?: Record<string, GrowthMilestone[]>;
    /** Inject the recognition evaluator. The real one from `modules` unless overridden. */
    recognition?: ItemRecognitionOps | true;
};

/**
 * The production evaluator, injected exactly as a pack would inject it.
 * Using the real `evaluateItemRecognition` rather than a stub is the point:
 * the structural `ItemRecognitionOps` shape only proves anything if the actual
 * function satisfies it without an adapter.
 */
const realRecognition: ItemRecognitionOps = { evaluate: evaluateItemRecognition };

function makeEngine(opts: EngineOpts = {}): Engine {
    const modules = [statusCore, createEquipmentCore({ catalog, statuses: statusOps })];
    if (opts.chronicle) {
        const recognition = opts.recognition === true ? realRecognition : opts.recognition;
        modules.push(
            createItemChronicleCore({
                catalog,
                ...(opts.milestones ? { milestones: opts.milestones } : {}),
                ...(recognition ? { recognition } : {}),
            }),
        );
    }

    const engine = new Engine({ manifest, seed: 7, modules });
    const zone: ZoneState = { id: 'arena', roomId: 'arena', name: 'Arena', tags: [], neighbors: [] };
    engine.store.addZone(zone);

    const player: EntityState = {
        id: 'player',
        blueprintId: 'player',
        type: 'player',
        name: 'Gladiator',
        tags: ['player', 'gladiator'],
        stats: { might: 5, agility: 5 },
        resources: { hp: 25, maxHp: 25 },
        statuses: [],
        inventory: ['trident-and-net', 'gladius', 'warden-mail'],
        zoneId: 'arena',
    };
    engine.store.addEntity(player);
    engine.store.state.playerId = 'player';
    engine.store.state.locationId = 'arena';
    return engine;
}

function addFoe(engine: Engine, id: string, name: string, extra: Partial<EntityState> = {}): void {
    engine.store.addEntity({
        id,
        blueprintId: 'foe',
        type: 'npc',
        name,
        tags: [],
        stats: { might: 3 },
        resources: { hp: 10, maxHp: 10 },
        statuses: [],
        zoneId: 'arena',
        ...extra,
    });
}

/**
 * Emit a defeat event through the store's recordEvent choke point — the same
 * path combat-core.ts's own emit takes (WorldStore.recordEvent → EventBus.emit
 * → module handlers), with combat-core's exact payload shape.
 */
function defeat(engine: Engine, foeId: string, foeName: string, tick: number, killerId = 'player'): void {
    engine.store.recordEvent({
        id: '',
        tick,
        type: 'combat.entity.defeated',
        payload: {
            entityId: foeId,
            entityName: foeName,
            defeatedBy: killerId,
            defeatedByName: 'Gladiator',
            defeatZoneId: 'arena',
            wasInterceptor: false,
        },
    });
}

beforeEach(() => {
    clearStatusRegistry();
});

// ---------------------------------------------------------------------------
// The gate: opting out changes nothing
// ---------------------------------------------------------------------------

describe('chronicle-core — the opt-in gate', () => {
    it('never creates the namespace when the module is not wired', () => {
        const engine = makeEngine(); // no chronicle module
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
        addFoe(engine, 'foe-1', 'Bone Collector');
        defeat(engine, 'foe-1', 'Bone Collector', 1);

        expect(engine.world.modules[ITEM_CHRONICLE_STATE_KEY]).toBeUndefined();
        expect(getItemChronicle(engine.world)).toEqual({});
    });

    it('never creates the namespace when wired but nothing is ever recorded', () => {
        // Seed-0 identity: ModuleManager.initializeNamespaces writes every
        // REGISTERED namespace default into world.modules unconditionally, for
        // every world. This module registers none, so a world that opts in and
        // then does nothing worth chronicling is byte-identical to one that never
        // opted in at all — not even an empty scaffold appears.
        const engine = makeEngine({ chronicle: true });
        expect(engine.world.modules[ITEM_CHRONICLE_STATE_KEY]).toBeUndefined();
    });

    it('records nothing for a barehanded kill', () => {
        const engine = makeEngine({ chronicle: true });
        addFoe(engine, 'foe-1', 'Bone Collector');
        defeat(engine, 'foe-1', 'Bone Collector', 1); // player has equipped nothing

        expect(engine.world.modules[ITEM_CHRONICLE_STATE_KEY]).toBeUndefined();
    });

    it('records nothing for a killer with no loadout at all', () => {
        const engine = makeEngine({ chronicle: true });
        addFoe(engine, 'brawler', 'Pit Brawler');
        addFoe(engine, 'foe-1', 'Bone Collector');
        defeat(engine, 'foe-1', 'Bone Collector', 1, 'brawler');

        expect(engine.world.modules[ITEM_CHRONICLE_STATE_KEY]).toBeUndefined();
    });

    it('ignores an item id that is not in the catalog', () => {
        const engine = makeEngine({ chronicle: true });
        engine.store.recordEvent({
            id: '',
            tick: 1,
            type: 'item.equipped',
            payload: { entityId: 'player', entityName: 'Gladiator', itemId: 'ghost-blade' },
        });

        expect(engine.world.modules[ITEM_CHRONICLE_STATE_KEY]).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

describe('chronicle-core — acquisition', () => {
    it('records `acquired` the first time an item is equipped', () => {
        const engine = makeEngine({ chronicle: true });
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });

        const history = getItemHistory(getItemChronicle(engine.world), 'gladius');
        expect(history).toHaveLength(1);
        expect(history[0]!.event).toBe('acquired');
        expect(history[0]!.detail).toContain('Gladiator');
        expect(history[0]!.zoneId).toBe('arena');
    });

    it('does not record a second `acquired` when an item is re-equipped', () => {
        // A re-equip is not a second acquisition. Letting it repeat would inflate
        // every count derived from the chronicle — including the age baseline,
        // which is measured from the FIRST entry.
        const engine = makeEngine({ chronicle: true });
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
        engine.submitAction('unequip', { parameters: { itemId: 'gladius' } });
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });

        expect(getItemHistory(getItemChronicle(engine.world), 'gladius')).toHaveLength(1);
    });

    it('records `acquired` on pickup, before the item is ever equipped', () => {
        // inventory-core's giveItem is the loot path. An item's story starts when
        // it comes into your hands.
        const engine = makeEngine({ chronicle: true });
        const player = engine.world.entities['player']!;
        engine.store.recordEvent(giveItem(player, 'gladius', 3));

        const history = getItemHistory(getItemChronicle(engine.world), 'gladius');
        expect(history).toHaveLength(1);
        expect(history[0]!.event).toBe('acquired');
        expect(history[0]!.tick).toBe(3);
        expect(history[0]!.detail).toContain('Picked up');
    });

    it('does not re-acquire on equip when the item was already picked up', () => {
        // The age baseline must stay pinned to the pickup tick, not restart when
        // the item first reaches a slot.
        const engine = makeEngine({ chronicle: true });
        const player = engine.world.entities['player']!;
        engine.store.recordEvent(giveItem(player, 'gladius', 3));
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });

        const history = getItemHistory(getItemChronicle(engine.world), 'gladius');
        expect(history.filter((e) => e.event === 'acquired')).toHaveLength(1);
        expect(history[0]!.tick).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// Age — the trigger that advances when nothing happens to the item
// ---------------------------------------------------------------------------

describe('chronicle-core — age', () => {
    const ageMilestone: Record<string, GrowthMilestone[]> = {
        gladius: [{ trigger: 'age', threshold: 100, epithet: 'Old {name}' }],
    };

    it('re-ages every item on any chronicle write, not just the item written', () => {
        // Age is the one growth axis that advances without anything happening to
        // the item itself. A summary computed once at write time and never
        // revisited would freeze every item's age at zero forever — and there is
        // no tick event to hang a refresh on, so the refresh rides writes.
        const engine = makeEngine({ chronicle: true, milestones: ageMilestone });
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
        expect(getRelicSummary(engine.world, 'gladius')!.milestoneCount).toBe(0);

        // Something happens to a DIFFERENT item, 150 ticks later.
        const player = engine.world.entities['player']!;
        engine.store.recordEvent(giveItem(player, 'trident-and-net', 150));

        const summary = getRelicSummary(engine.world, 'gladius')!;
        expect(summary.milestoneCount).toBe(1);
        expect(summary.displayName).toBe('Old Gladius');
    });

    it('refreshRelicSummaries re-ages on demand without recording anything', () => {
        const engine = makeEngine({ chronicle: true, milestones: ageMilestone });
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
        const before = getItemHistory(getItemChronicle(engine.world), 'gladius').length;

        expect(refreshRelicSummaries(engine.world, { catalog, milestones: ageMilestone }, 200)).toBe(true);

        expect(getRelicSummary(engine.world, 'gladius')!.displayName).toBe('Old Gladius');
        expect(getItemHistory(getItemChronicle(engine.world), 'gladius')).toHaveLength(before);
    });

    it('refreshRelicSummaries never brings the namespace into being', () => {
        const engine = makeEngine({ chronicle: true });
        expect(refreshRelicSummaries(engine.world, { catalog }, 500)).toBe(false);
        expect(engine.world.modules[ITEM_CHRONICLE_STATE_KEY]).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Recognition — injected, never RNG-consuming
// ---------------------------------------------------------------------------

describe('chronicle-core — recognition', () => {
    function addWarden(engine: Engine, id = 'warden'): void {
        addFoe(engine, id, 'Warden Captain', { faction: 'iron-wardens' });
    }

    it('records `recognized` when a faction NPC sees stolen provenance', () => {
        const engine = makeEngine({ chronicle: true, recognition: true });
        addWarden(engine);
        engine.submitAction('equip', { parameters: { itemId: 'warden-mail' } });

        const history = getItemHistory(getItemChronicle(engine.world), 'warden-mail');
        const recognized = history.filter((e) => e.event === 'recognized');
        expect(recognized).toHaveLength(1);
        expect(recognized[0]!.detail).toContain('Warden Captain');
    });

    it('records nothing when no recognition evaluator is injected', () => {
        // Recognition is opt-in WITHIN the opt-in module. Without it,
        // recognition-count milestones stay unreachable — which for armor
        // (DEFAULT_ARMOR_MILESTONES is age + recognition-count only) means it
        // grows on age alone.
        const engine = makeEngine({ chronicle: true });
        addWarden(engine);
        engine.submitAction('equip', { parameters: { itemId: 'warden-mail' } });

        const history = getItemHistory(getItemChronicle(engine.world), 'warden-mail');
        expect(history.filter((e) => e.event === 'recognized')).toHaveLength(0);
    });

    it('ignores NPCs in another zone', () => {
        const engine = makeEngine({ chronicle: true, recognition: true });
        engine.store.addZone({ id: 'gate', roomId: 'gate', name: 'Gate', tags: [], neighbors: [] });
        addFoe(engine, 'elsewhere', 'Distant Warden', { faction: 'iron-wardens', zoneId: 'gate' });
        engine.submitAction('equip', { parameters: { itemId: 'warden-mail' } });

        const history = getItemHistory(getItemChronicle(engine.world), 'warden-mail');
        expect(history.filter((e) => e.event === 'recognized')).toHaveLength(0);
    });

    it('a FACTIONLESS bystander in the room still recognizes flagged provenance', () => {
        // The regression guard for the defect the played-session proof caught
        // (starter-gladiator/src/relic-played-session.test.ts). This assertion
        // was previously inverted — bundled into the zone test above as "…and
        // factionless bystanders", pinning a `!npc.faction` skip as correct.
        //
        // It was not correct, and the cost was total: NO entity in ANY of the
        // ten shipped starter packs sets `EntityState.faction`, so that skip
        // made `recognized` unreachable on every shipped pack, and with it
        // `recognition-count`, and with THAT all armor growth (armor's default
        // milestones are age + recognition-count and nothing else).
        //
        // `evaluateItemRecognition` never required a faction: it types
        // `npcFactionId` as `string | undefined` and consults it only on the
        // faction-match path. `warden-mail` is `flags: ['stolen']`, and the
        // flag path fires for any onlooker at all.
        const engine = makeEngine({ chronicle: true, recognition: true });
        addFoe(engine, 'nobody', 'Drunk'); // no faction, same zone
        engine.submitAction('equip', { parameters: { itemId: 'warden-mail' } });

        const history = getItemHistory(getItemChronicle(engine.world), 'warden-mail');
        const recognized = history.filter((e) => e.event === 'recognized');
        expect(recognized).toHaveLength(1);
        expect(recognized[0]!.detail).toContain('Drunk');
    });

    it('records at most one recognition per item per equip, however big the crowd', () => {
        // recognition-count milestones sit at 3 and 8. A crowded room minting one
        // entry per onlooker would clear both in a single step, making the axis
        // measure bystanders rather than notoriety.
        const engine = makeEngine({ chronicle: true, recognition: true });
        for (let i = 0; i < 5; i++) addWarden(engine, `warden-${i}`);
        engine.submitAction('equip', { parameters: { itemId: 'warden-mail' } });

        const history = getItemHistory(getItemChronicle(engine.world), 'warden-mail');
        expect(history.filter((e) => e.event === 'recognized')).toHaveLength(1);
    });

    it('drives armor to a recognition milestone across repeated equips', () => {
        // The payoff: before this, armor could not grow at all — its default
        // milestones are age and recognition-count, and neither had a producer.
        const engine = makeEngine({
            chronicle: true,
            recognition: true,
            milestones: { 'warden-mail': [{ trigger: 'recognition-count', threshold: 3, epithet: 'Infamous {name}' }] },
        });
        addWarden(engine);
        for (let i = 0; i < 3; i++) {
            engine.submitAction('equip', { parameters: { itemId: 'warden-mail' } });
            engine.submitAction('unequip', { parameters: { itemId: 'warden-mail' } });
        }

        expect(getItemDisplayName(engine.world, 'warden-mail', 'Warden Mail')).toBe('Infamous Warden Mail');
    });

    it('consumes no RNG — the seeded stream is untouched by recognition', () => {
        // shouldRecognize (the probabilistic gate) is deliberately NOT used here:
        // it needs a seeded roll, and drawing one would shift every subsequent
        // roll in the run, breaking the replay guarantee this module rests on.
        const withRecognition = makeEngine({ chronicle: true, recognition: true });
        const without = makeEngine({ chronicle: true });
        for (const engine of [withRecognition, without]) {
            addFoe(engine, 'warden', 'Warden Captain', { faction: 'iron-wardens' });
            engine.submitAction('equip', { parameters: { itemId: 'warden-mail' } });
        }

        // The real cursor, not a property that happens not to exist: SeededRNG's
        // state advances on every draw, so equal states means zero draws taken.
        expect(withRecognition.store.rng.getState()).toBe(without.store.rng.getState());
        expect(JSON.stringify(withRecognition.world.eventLog)).toBe(JSON.stringify(without.world.eventLog));

        // And recognition did in fact happen — otherwise this proves nothing.
        expect(
            getItemHistory(getItemChronicle(withRecognition.world), 'warden-mail').filter(
                (e) => e.event === 'recognized',
            ),
        ).toHaveLength(1);
    });
});

describe('chronicle-core — kill attribution', () => {
    it('credits the kill to the weapon in the killer\'s hand', () => {
        const engine = makeEngine({ chronicle: true });
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
        addFoe(engine, 'foe-1', 'Bone Collector');
        defeat(engine, 'foe-1', 'Bone Collector', 1);

        const chronicle = getItemChronicle(engine.world);
        expect(getItemKillCount(chronicle, 'gladius')).toBe(1);
        expect(getItemKillCount(chronicle, 'trident-and-net')).toBe(0);
        expect(getItemHistory(chronicle, 'gladius')[1]!.detail).toContain('Bone Collector');
    });

    it('follows the loadout when the killer swaps weapons mid-run', () => {
        // This is the case a checkpoint-time projection gets wrong. The defeat
        // event carries no weapon attribution at all, so a projection would have
        // to fold item.equipped/item.unequipped to reconstruct which weapon held
        // the slot at each tick. Recording in-tick reads the loadout in hand.
        const engine = makeEngine({ chronicle: true });
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
        addFoe(engine, 'foe-1', 'First');
        defeat(engine, 'foe-1', 'First', 1);

        engine.submitAction('equip', { parameters: { itemId: 'trident-and-net' } });
        addFoe(engine, 'foe-2', 'Second');
        defeat(engine, 'foe-2', 'Second', 2);

        const chronicle = getItemChronicle(engine.world);
        expect(getItemKillCount(chronicle, 'gladius')).toBe(1);
        expect(getItemKillCount(chronicle, 'trident-and-net')).toBe(1);
    });
});

describe('chronicle-core — the detail authoring convention', () => {
    // relic-growth.ts resolves `faction-kills` and `boss-kill` by SUBSTRING-
    // MATCHING the free-text `detail` field (.includes('faction') /
    // .includes('boss')). That convention was documented but unenforced, so
    // both triggers were unreachable on real content. These tests pin the
    // literals so a later reword cannot silently kill two of the five triggers.

    it('emits the "boss" literal so the boss-kill trigger can fire', () => {
        const milestones: Record<string, GrowthMilestone[]> = {
            gladius: [{ trigger: 'boss-kill', threshold: 1, epithet: '{name}, Champion-Slayer' }],
        };
        const engine = makeEngine({ chronicle: true, milestones });
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
        addFoe(engine, 'boss-1', 'The Undefeated', { tags: ['boss'] });
        defeat(engine, 'boss-1', 'The Undefeated', 1);

        const entry = getItemHistory(getItemChronicle(engine.world), 'gladius')[1]!;
        expect(entry.detail.toLowerCase()).toContain('boss');

        const summary = getRelicSummary(engine.world, 'gladius')!;
        expect(summary.milestoneCount).toBe(1);
        expect(summary.displayName).toBe('Gladius, Champion-Slayer');
    });

    it('emits the "faction" literal so the faction-kills trigger can fire', () => {
        const milestones: Record<string, GrowthMilestone[]> = {
            gladius: [{ trigger: 'faction-kills', threshold: 2, epithet: 'Hated {name}' }],
        };
        const engine = makeEngine({ chronicle: true, milestones });
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
        addFoe(engine, 'a', 'Warden A', { faction: 'iron-wardens' });
        addFoe(engine, 'b', 'Warden B', { faction: 'iron-wardens' });
        defeat(engine, 'a', 'Warden A', 1);
        defeat(engine, 'b', 'Warden B', 2);

        const history = getItemHistory(getItemChronicle(engine.world), 'gladius');
        expect(history[1]!.detail.toLowerCase()).toContain('faction');
        expect(getRelicSummary(engine.world, 'gladius')!.milestoneCount).toBe(1);
    });

    it('leaves the literals out for an ordinary foe', () => {
        const engine = makeEngine({ chronicle: true });
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
        addFoe(engine, 'foe-1', 'Bone Collector');
        defeat(engine, 'foe-1', 'Bone Collector', 1);

        const detail = getItemHistory(getItemChronicle(engine.world), 'gladius')[1]!.detail.toLowerCase();
        expect(detail).not.toContain('boss');
        expect(detail).not.toContain('faction');
    });
});

// ---------------------------------------------------------------------------
// The payoff: growth from a played sequence
// ---------------------------------------------------------------------------

describe('chronicle-core — relic growth from real play', () => {
    it('earns an epithet once the default kill-count milestone is crossed', () => {
        const engine = makeEngine({ chronicle: true });
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });

        // DEFAULT_WEAPON_MILESTONES: kill-count 3 → "Bloodied {name}".
        for (const [i, name] of ['Bone Collector', 'Pit Dog', 'The Butcher'].entries()) {
            addFoe(engine, `foe-${i}`, name);
            defeat(engine, `foe-${i}`, name, i + 1);
        }

        const summary = getRelicSummary(engine.world, 'gladius')!;
        expect(summary.milestoneCount).toBe(1);
        expect(summary.tier).toBe(1);
        expect(summary.epithet).toBe('Bloodied Gladius');
        expect(getItemDisplayName(engine.world, 'gladius', 'Gladius')).toBe('Bloodied Gladius');
    });

    it('shows the plain name until a milestone is actually crossed', () => {
        const engine = makeEngine({ chronicle: true });
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
        addFoe(engine, 'foe-1', 'Bone Collector');
        defeat(engine, 'foe-1', 'Bone Collector', 1);

        const summary = getRelicSummary(engine.world, 'gladius')!;
        expect(summary.milestoneCount).toBe(0);
        expect(summary.tier).toBe(0);
        expect(summary.epithet).toBeUndefined();
        expect(getItemDisplayName(engine.world, 'gladius', 'Gladius')).toBe('Gladius');
    });

    it('agrees with a direct evaluateRelicGrowth call on the same chronicle', () => {
        // The persisted summary exists so a consumer can read an item's tier
        // WITHOUT calling evaluateRelicGrowth — the ledger adapter's
        // equipment-snapshot.ts is type-only against this package by design and
        // its header forbids that runtime coupling outright. The summary is only
        // safe to read as plain data if it cannot drift from the function it
        // stands in for, so pin them together.
        const engine = makeEngine({ chronicle: true });
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
        for (const [i, name] of ['A', 'B', 'C', 'D'].entries()) {
            addFoe(engine, `foe-${i}`, name);
            defeat(engine, `foe-${i}`, name, i + 1);
        }

        const item = catalog.items.find((it) => it.id === 'gladius')!;
        const direct = evaluateRelicGrowth(item, getItemHistory(getItemChronicle(engine.world), 'gladius'), 4);
        const summary = getRelicSummary(engine.world, 'gladius')!;

        expect(summary.tier).toBe(direct.tier);
        expect(summary.milestoneCount).toBe(direct.milestonesReached.length);
        expect(summary.epithet).toBe(direct.currentEpithet);
    });
});

// ---------------------------------------------------------------------------
// The replay gate — the load-bearing invariant
// ---------------------------------------------------------------------------

describe('chronicle-core — determinism', () => {
    function playSequence(engine: Engine): void {
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
        for (const [i, name] of ['Bone Collector', 'Pit Dog', 'The Butcher'].entries()) {
            addFoe(engine, `foe-${i}`, name);
            defeat(engine, `foe-${i}`, name, i + 1);
        }
        engine.submitAction('unequip', { parameters: { itemId: 'gladius' } });
        engine.submitAction('equip', { parameters: { itemId: 'trident-and-net' } });
    }

    it('produces a byte-identical event stream with and without the chronicle', () => {
        // The whole design rests on this. Chronicle recording is a pure write into
        // world.modules — it emits nothing, consumes no RNG, and reads no clock —
        // so the same seed and the same inputs must yield the same eventLog down
        // to the byte whether or not the module is wired. If this ever fails, the
        // producer has started influencing the run and the opt-in gate is a lie.
        const without = makeEngine();
        const withChronicle = makeEngine({ chronicle: true });
        playSequence(without);
        playSequence(withChronicle);

        // Guard against a vacuous pass: two empty logs are trivially identical.
        expect(without.world.eventLog.length).toBeGreaterThan(5);

        const strip = (log: readonly ResolvedEvent[]): string => JSON.stringify(log);
        expect(strip(withChronicle.world.eventLog)).toBe(strip(without.world.eventLog));
    });

    it('leaves every other module namespace untouched', () => {
        const without = makeEngine();
        const withChronicle = makeEngine({ chronicle: true });
        playSequence(without);
        playSequence(withChronicle);

        const others = (engine: Engine): string =>
            JSON.stringify(
                Object.fromEntries(
                    Object.entries(engine.world.modules)
                        .filter(([k]) => k !== ITEM_CHRONICLE_STATE_KEY)
                        .sort(([a], [b]) => a.localeCompare(b)),
                ),
            );
        expect(others(withChronicle)).toBe(others(without));
    });

    it('is reproducible across two identical runs', () => {
        const a = makeEngine({ chronicle: true });
        const b = makeEngine({ chronicle: true });
        playSequence(a);
        playSequence(b);

        expect(JSON.stringify(a.world.modules[ITEM_CHRONICLE_STATE_KEY])).toBe(
            JSON.stringify(b.world.modules[ITEM_CHRONICLE_STATE_KEY]),
        );
    });

    it('survives serialize/deserialize with its history intact', () => {
        const engine = makeEngine({ chronicle: true });
        playSequence(engine);
        const before = getRelicSummary(engine.world, 'gladius')!;

        const restored = Engine.deserialize(engine.serialize(), {
            modules: [
                statusCore,
                createEquipmentCore({ catalog, statuses: statusOps }),
                createItemChronicleCore({ catalog }),
            ],
        });

        expect(getItemKillCount(getItemChronicle(restored.world), 'gladius')).toBe(3);
        expect(getRelicSummary(restored.world, 'gladius')).toEqual(before);
    });
});
