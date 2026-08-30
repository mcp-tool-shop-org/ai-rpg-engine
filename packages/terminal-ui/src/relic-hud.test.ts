// The HUD's relic surfacing. renderScene reads the item-chronicle and
// equipment-core namespaces as PLAIN DATA — terminal-ui has no runtime
// dependency on @ai-rpg-engine/equipment and must not grow one, so the
// namespace string keys and the read shapes are duplicated in renderer.ts.
//
// That duplication is only safe if something proves the two halves still
// agree. These tests drive the REAL producer (createItemChronicleCore) on a
// REAL engine and assert against rendered output, so a change to the
// persisted shape breaks here instead of silently rendering raw ids in
// someone's terminal. The equipment/modules packages are devDependencies
// ONLY — the exact arrangement ledger-adapter uses for its own plain-data
// reader (packages/ledger-adapter/src/engine/equipment-snapshot.ts).

import { describe, it, expect } from 'vitest';
import { Engine } from '@ai-rpg-engine/core';
import {
    createEquipmentCore,
    createItemChronicleCore,
    type ItemCatalog,
} from '@ai-rpg-engine/equipment';
import {
    statusCore,
    applyStatus,
    removeStatus,
    registerStatusDefinitions,
} from '@ai-rpg-engine/modules';
import { renderScene } from './renderer.js';
import { stripAnsi } from './styles.js';

const catalog: ItemCatalog = {
    items: [
        { id: 'gladius', name: 'Gladius', description: 'A short blade.', slot: 'weapon', rarity: 'common' },
        { id: 'warden-mail', name: 'Warden Mail', description: 'Scarred rings.', slot: 'armor', rarity: 'rare' },
        { id: 'healing-draught', name: 'Healing Draught', description: 'Bitter.', slot: 'trinket', rarity: 'common' },
    ],
};

function makeEngine(opts: { chronicle?: boolean } = {}): Engine {
    const engine = new Engine({
        manifest: {
            id: 'relic-hud', title: 'Relic HUD', version: '0.0.1',
            engineVersion: '0.1.0', ruleset: 'minimal',
            modules: ['status-core', 'equipment-core'], contentPacks: [],
        },
        seed: 7,
        modules: [
            statusCore,
            createEquipmentCore({
                catalog,
                statuses: { registerDefinitions: registerStatusDefinitions, apply: applyStatus, remove: removeStatus },
            }),
            ...(opts.chronicle === false ? [] : [createItemChronicleCore({ catalog })]),
        ],
    });
    engine.store.addZone({ id: 'arena', roomId: 'arena', name: 'Arena', tags: [], neighbors: [] });
    engine.store.addEntity({
        id: 'hero', blueprintId: 'hero', type: 'player', name: 'Hero',
        tags: ['player'], stats: {}, resources: { hp: 20, maxHp: 20 },
        statuses: [], inventory: ['gladius', 'warden-mail', 'healing-draught'], zoneId: 'arena',
    });
    engine.store.state.playerId = 'hero';
    engine.store.state.locationId = 'arena';
    return engine;
}

/** Kills credited to whatever the hero is holding, via combat-core's real payload shape. */
function slay(engine: Engine, count: number): void {
    for (let i = 0; i < count; i++) {
        engine.store.addEntity({
            id: `foe-${i}`, blueprintId: 'foe', type: 'npc', name: `Foe ${i}`,
            tags: [], stats: {}, resources: { hp: 1, maxHp: 1 }, statuses: [], zoneId: 'arena',
        });
        engine.store.recordEvent({
            id: '', tick: i + 1, type: 'combat.entity.defeated',
            payload: { entityId: `foe-${i}`, entityName: `Foe ${i}`, defeatedBy: 'hero', defeatZoneId: 'arena' },
        });
    }
}

const scene = (engine: Engine): string => stripAnsi(renderScene(engine.world));

describe('HUD — equipped line', () => {
    it('renders nothing extra when the player has equipped nothing', () => {
        // A pack that never wires equipment-core, and a player who has never
        // equipped, must render the HUD exactly as it did before this cycle.
        const out = scene(makeEngine());
        expect(out).not.toContain('Equipped:');
        expect(out).toContain('Items: Gladius, Warden Mail, Healing Draught');
    });

    it('shows equipped gear by slot, and drops it from Items', () => {
        // Load-bearing: equipping MOVES the item out of entity.inventory, so
        // without this line a wielded weapon is invisible in the HUD — and a
        // wielded weapon is exactly what grows.
        const engine = makeEngine();
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });

        const out = scene(engine);
        expect(out).toContain('Equipped: Weapon: Gladius');
        expect(out).not.toMatch(/Items:.*gladius/);
    });

    it('orders slots deterministically regardless of equip order', () => {
        const a = makeEngine();
        a.submitAction('equip', { parameters: { itemId: 'gladius' } });
        a.submitAction('equip', { parameters: { itemId: 'warden-mail' } });

        const b = makeEngine();
        b.submitAction('equip', { parameters: { itemId: 'warden-mail' } });
        b.submitAction('equip', { parameters: { itemId: 'gladius' } });

        const line = (out: string) => out.split('\n').find(l => l.includes('Equipped:'));
        expect(line(scene(a))).toBe(line(scene(b)));
        expect(line(scene(a))).toContain('Armor: Warden Mail, Weapon: Gladius');
    });
});

describe('HUD — earned names', () => {
    it('a weapon that crosses a milestone is shown under its earned name', () => {
        // The payoff of the whole cycle, at the surface a player actually reads.
        const engine = makeEngine();
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
        slay(engine, 3);

        const out = scene(engine);
        expect(out).toContain('Equipped: Weapon: Bloodied Gladius');
        expect(out).not.toContain('weapon: gladius');
    });

    it('the name keeps growing as the chronicle does', () => {
        const engine = makeEngine();
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
        slay(engine, 10);

        expect(scene(engine)).toContain('Equipped: Weapon: Gladius the Reaper');
    });

    it('an item below its first milestone is title-cased, not kebab-id', () => {
        // Tier 0 has become nothing yet. The catalog id is humanized the same
        // way statuses are (gladius → Gladius); grown epithets appear later.
        const engine = makeEngine();
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
        slay(engine, 2);

        const out = scene(engine);
        expect(out).toContain('Equipped: Weapon: Gladius');
        expect(out).not.toContain('Bloodied');
    });

    it('a grown item carried rather than worn is named on the Items line too', () => {
        const engine = makeEngine();
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
        slay(engine, 3);
        engine.submitAction('unequip', { parameters: { itemId: 'gladius' } });

        const out = scene(engine);
        expect(out).toContain('Bloodied Gladius');
        expect(out).not.toContain('Equipped:');
    });
});

describe('HUD — tolerance of a missing or malformed chronicle', () => {
    it('humanizes ungrown ids when no chronicle module is wired', () => {
        // The accessor is non-attaching: reading must never create the
        // namespace, or an unwired pack would start serializing empty state.
        const engine = makeEngine({ chronicle: false });
        engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
        slay(engine, 3);

        const out = scene(engine);
        expect(out).toContain('Equipped: Weapon: Gladius');
        expect(engine.world.modules['item-chronicle']).toBeUndefined();
    });

    it('survives a corrupt namespace instead of throwing mid-frame', () => {
        // A half-written save must degrade to raw ids, not take down the frame.
        for (const corrupt of [null, 'nonsense', [], { summaries: 'nope' }, { summaries: { gladius: null } }]) {
            const engine = makeEngine();
            engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
            (engine.world.modules as Record<string, unknown>)['item-chronicle'] = corrupt;

            expect(() => renderScene(engine.world)).not.toThrow();
            expect(scene(engine)).toContain('Equipped: Weapon: Gladius');
        }
    });

    it('survives a corrupt equipment namespace', () => {
        for (const corrupt of [null, 42, { loadouts: 'nope' }, { loadouts: { hero: { equipped: null } } }]) {
            const engine = makeEngine();
            engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
            (engine.world.modules as Record<string, unknown>)['equipment-core'] = corrupt;

            expect(() => renderScene(engine.world)).not.toThrow();
            expect(stripAnsi(renderScene(engine.world))).not.toContain('Equipped:');
        }
    });
});
