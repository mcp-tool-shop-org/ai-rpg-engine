// equipmentSnapshotFromWorld — the NFT-side read-path tests (P3). Builds a
// minimal WorldState-shaped fixture directly (a plain literal typed against
// `@ai-rpg-engine/core`'s WorldState) rather than spinning up a real Engine —
// this read path only ever touches `world.modules['equipment-core']`, so a
// full engine (as firewall.test.ts builds for the fungible seam, which
// exercises actual trade verbs) would be unnecessary machinery here.
//
// `@ai-rpg-engine/core` and `@ai-rpg-engine/equipment` are imported type-only
// even in this test file — nothing here needs either package's runtime, so
// there is no reason to relax that discipline just because *.test.ts is
// allowed to (see equipment-snapshot.ts's own header, and firewall.test.ts's
// header for where the repo DOES need a real Engine import).

import { describe, expect, it } from 'vitest';
import type { WorldState } from '@ai-rpg-engine/core';
import type { ItemCatalog, ItemChronicleEntry, Loadout } from '@ai-rpg-engine/equipment';
import { equipmentSnapshotFromWorld } from './equipment-snapshot.js';

const EQUIPMENT_MODULE_KEY = 'equipment-core';

function makeWorld(modules: Record<string, unknown> = {}): WorldState {
  return {
    meta: {
      worldId: 'world-1',
      gameId: 'game-1',
      saveVersion: '1',
      tick: 0,
      seed: 0,
      activeRuleset: 'test',
      activeModules: [],
      idCounter: 0,
    },
    playerId: 'player',
    locationId: 'zone-a',
    entities: {},
    zones: {},
    quests: {},
    factions: {},
    globals: {},
    modules,
    eventLog: [],
    pending: [],
  };
}

function makeLoadout(equipped: Partial<Record<'weapon' | 'armor' | 'accessory' | 'tool' | 'trinket', string | null>>, inventory: string[]): Loadout {
  return {
    equipped: {
      weapon: null,
      armor: null,
      accessory: null,
      tool: null,
      trinket: null,
      ...equipped,
    },
    inventory,
  };
}

function worldWithLoadout(loadout: Loadout, playerId = 'player'): WorldState {
  return makeWorld({ [EQUIPMENT_MODULE_KEY]: { loadouts: { [playerId]: loadout } } });
}

const catalog: ItemCatalog = {
  items: [
    { id: 'cutlass', name: 'Cutlass', description: 'A pirate blade.', slot: 'weapon', rarity: 'rare' },
    { id: 'tricorn', name: 'Tricorn Hat', description: "A captain's hat.", slot: 'armor', rarity: 'uncommon' },
    { id: 'lucky-coin', name: 'Lucky Coin', description: 'A worn coin.', slot: 'trinket', rarity: 'common' },
  ],
};

describe('equipmentSnapshotFromWorld — loadout read (equipped + inventory)', () => {
  it('reads equipped items (sorted-slot order) then inventory items, with the correct equipped flag', () => {
    const loadout = makeLoadout({ weapon: 'cutlass', armor: 'tricorn' }, ['lucky-coin']);
    const world = worldWithLoadout(loadout);

    const snapshot = equipmentSnapshotFromWorld(world, 'player', catalog);

    // Sorted slot order is accessory, armor, tool, trinket, weapon -> armor's
    // 'tricorn' precedes weapon's 'cutlass'; the unequipped 'lucky-coin' from
    // inventory comes last.
    expect(snapshot.items.map((i) => i.itemId)).toEqual(['tricorn', 'cutlass', 'lucky-coin']);

    const byId = Object.fromEntries(snapshot.items.map((i) => [i.itemId, i]));
    expect(byId.tricorn).toMatchObject({ name: 'Tricorn Hat', slot: 'armor', rarity: 'uncommon', equipped: true });
    expect(byId.cutlass).toMatchObject({ name: 'Cutlass', slot: 'weapon', rarity: 'rare', equipped: true });
    expect(byId['lucky-coin']).toMatchObject({ name: 'Lucky Coin', slot: 'trinket', rarity: 'common', equipped: false });

    // No chronicle supplied -> every item is un-grown.
    for (const item of snapshot.items) {
      expect(item.relicVersion).toBe(0);
      expect(item.relicTier).toBe(0);
      expect(item.relicEpithet).toBeUndefined();
    }
  });

  it('dedupes an id that appears both equipped and (defensively) still listed in inventory, counting it once at its equipped position', () => {
    const loadout = makeLoadout({ weapon: 'cutlass' }, ['cutlass', 'lucky-coin']);
    const world = worldWithLoadout(loadout);

    const snapshot = equipmentSnapshotFromWorld(world, 'player', catalog);

    expect(snapshot.items.map((i) => i.itemId)).toEqual(['cutlass', 'lucky-coin']);
    expect(snapshot.items.find((i) => i.itemId === 'cutlass')?.equipped).toBe(true);
  });
});

describe('equipmentSnapshotFromWorld — catalog resolution', () => {
  it('skips an item id not present in the catalog (not unique gear)', () => {
    const loadout = makeLoadout({ weapon: 'cutlass' }, ['mystery-trinket', 'lucky-coin']);
    const world = worldWithLoadout(loadout);

    const snapshot = equipmentSnapshotFromWorld(world, 'player', catalog);

    expect(snapshot.items.map((i) => i.itemId)).toEqual(['cutlass', 'lucky-coin']);
    expect(snapshot.items.some((i) => i.itemId === 'mystery-trinket')).toBe(false);
  });
});

describe('equipmentSnapshotFromWorld — absence handling (never throws)', () => {
  it('returns an empty snapshot when the equipment-core module is entirely absent', () => {
    const world = makeWorld();
    expect(equipmentSnapshotFromWorld(world, 'player', catalog)).toEqual({ items: [] });
  });

  it('returns an empty snapshot when the module exists but has no loadout for this player', () => {
    const loadout = makeLoadout({ weapon: 'cutlass' }, []);
    const world = worldWithLoadout(loadout, 'someone-else');
    expect(equipmentSnapshotFromWorld(world, 'player', catalog)).toEqual({ items: [] });
  });

  it('returns an empty snapshot for a malformed module namespace rather than throwing', () => {
    const world = makeWorld({ [EQUIPMENT_MODULE_KEY]: 'not-an-object' });
    expect(() => equipmentSnapshotFromWorld(world, 'player', catalog)).not.toThrow();
    expect(equipmentSnapshotFromWorld(world, 'player', catalog)).toEqual({ items: [] });
  });
});

describe('equipmentSnapshotFromWorld — relicVersion from an injected chronicle', () => {
  it('is 0 when the chronicle is omitted (the dormant-chronicle default)', () => {
    const loadout = makeLoadout({ weapon: 'cutlass' }, []);
    const world = worldWithLoadout(loadout);

    const snapshot = equipmentSnapshotFromWorld(world, 'player', catalog);
    expect(snapshot.items[0].relicVersion).toBe(0);
    expect(snapshot.items[0].relicTier).toBe(0);
  });

  it('equals the injected chronicle entry count for that item, banded into a relicTier', () => {
    const loadout = makeLoadout({ weapon: 'cutlass' }, ['tricorn']);
    const world = worldWithLoadout(loadout);

    const entry = (event: ItemChronicleEntry['event'], tick: number): ItemChronicleEntry => ({ event, tick, detail: 'test' });

    const chronicle: Record<string, ItemChronicleEntry[]> = {
      cutlass: [entry('acquired', 0), entry('used-in-kill', 1), entry('used-in-kill', 2)], // 3 entries
      tricorn: [entry('acquired', 0), entry('recognized', 5)], // 2 entries
    };

    const snapshot = equipmentSnapshotFromWorld(world, 'player', catalog, chronicle);
    const byId = Object.fromEntries(snapshot.items.map((i) => [i.itemId, i]));

    expect(byId.cutlass.relicVersion).toBe(3);
    expect(byId.cutlass.relicTier).toBe(1); // >= 3 -> tier 1
    expect(byId.tricorn.relicVersion).toBe(2);
    expect(byId.tricorn.relicTier).toBe(0); // < 3 -> tier 0
  });

  it('is monotonic-banded across the documented thresholds (0, 3, 6, 10)', () => {
    const loadout = makeLoadout({ weapon: 'cutlass' }, []);
    const world = worldWithLoadout(loadout);
    const entry: ItemChronicleEntry = { event: 'acquired', tick: 0, detail: 'x' };

    const tierFor = (count: number): number => {
      const chronicle = { cutlass: Array.from({ length: count }, () => entry) };
      const snapshot = equipmentSnapshotFromWorld(world, 'player', catalog, chronicle);
      return snapshot.items[0].relicTier;
    };

    expect(tierFor(0)).toBe(0);
    expect(tierFor(2)).toBe(0);
    expect(tierFor(3)).toBe(1);
    expect(tierFor(5)).toBe(1);
    expect(tierFor(6)).toBe(2);
    expect(tierFor(9)).toBe(2);
    expect(tierFor(10)).toBe(3);
    expect(tierFor(20)).toBe(3);
  });
});

describe('equipmentSnapshotFromWorld — PURE + READ-ONLY', () => {
  it('never mutates world or the resolved loadout object', () => {
    const loadout = makeLoadout({ weapon: 'cutlass', armor: 'tricorn' }, ['lucky-coin']);
    const world = worldWithLoadout(loadout);

    const worldBefore = structuredClone(world);
    const loadoutBefore = structuredClone(loadout);

    const chronicle: Record<string, ItemChronicleEntry[]> = {
      cutlass: [{ event: 'acquired', tick: 0, detail: 'looted' }],
    };
    equipmentSnapshotFromWorld(world, 'player', catalog, chronicle);

    expect(world).toEqual(worldBefore);
    expect(loadout).toEqual(loadoutBefore);
  });
});
