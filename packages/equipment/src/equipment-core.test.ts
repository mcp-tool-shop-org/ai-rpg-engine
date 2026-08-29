// equipment-core — module-level tests (F-ENG008 equipment loop plumbing).
//
// Engine-level coverage of the equip/unequip verbs over this package's own
// Loadout model: status carry (effectiveStat delta), swap semantics (parity
// with equipItem — the module calls the real function, and these tests pin
// that the observable transitions match an independent equipItem run),
// structured rejections with hints, catalog-formula transport, persisted
// namespace state, save/load round-trip, and the red-proof direction (no
// status → no delta).
//
// The status machinery is @ai-rpg-engine/modules' (injected exactly the way a
// pack injects it); core supplies the Engine. Both are declared
// devDependencies of this package — runtime source stays dependency-free.

import { describe, it, expect, beforeEach } from 'vitest';
import { Engine } from '@ai-rpg-engine/core';
import type { EntityState, GameManifest, ResolvedEvent, ZoneState } from '@ai-rpg-engine/core';
import {
  statusCore,
  applyStatus,
  removeStatus,
  registerStatusDefinitions,
  clearStatusRegistry,
  getStatusDefinition,
  effectiveStat,
  hasStatus,
  giveItem,
} from '@ai-rpg-engine/modules';
import type { ItemCatalog, Loadout } from './types.js';
import { createEmptyLoadout, equipItem } from './loadout.js';
import {
  createEquipmentCore,
  buildEquipmentStatusDefinitions,
  getEquipmentState,
  getEntityLoadout,
  equipStatusId,
  EQUIPMENT_CATALOG_FORMULA,
  EQUIPMENT_STATE_KEY,
  type EquipmentModuleState,
  type EquipmentStatusOps,
} from './equipment-core.js';

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
      grantedTags: ['armed', 'entangler'],
      grantedVerbs: ['ensnare'],
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
      id: 'champion-helm',
      name: 'Champion Helm',
      description: 'Only champions may wear it.',
      slot: 'armor',
      rarity: 'rare',
      statModifiers: { showmanship: 2 },
      requiredTags: ['champion'],
    },
    {
      id: 'penitent-mail',
      name: 'Penitent Mail',
      description: 'Chain links inscribed with prayers of atonement.',
      slot: 'armor',
      rarity: 'common',
      resourceModifiers: { hp: 5 },
    },
  ],
};

const statusOps: EquipmentStatusOps = {
  registerDefinitions: registerStatusDefinitions,
  apply: applyStatus,
  remove: removeStatus,
};

const manifest: GameManifest = {
  id: 'equipment-proof',
  title: 'Equipment Proof',
  version: '0.0.1',
  engineVersion: '0.1.0',
  ruleset: 'minimal',
  modules: ['status-core', 'equipment-core'],
  contentPacks: [],
};

function makePlayer(): EntityState {
  return {
    id: 'player',
    blueprintId: 'player',
    type: 'player',
    name: 'Gladiator',
    tags: ['player', 'gladiator'],
    stats: { might: 5, agility: 5, showmanship: 4 },
    resources: { hp: 25, maxHp: 25 },
    statuses: [],
    inventory: ['trident-and-net'],
    zoneId: 'cell',
  };
}

function makeEngine(mutate?: (player: EntityState) => void, statusesOverride: EquipmentStatusOps = statusOps): Engine {
  const engine = new Engine({
    manifest,
    seed: 7,
    modules: [statusCore, createEquipmentCore({ catalog, statuses: statusesOverride })],
  });
  const zone: ZoneState = { id: 'cell', roomId: 'cell', name: 'Cell', tags: [], neighbors: [] };
  engine.store.addZone(zone);
  const player = makePlayer();
  mutate?.(player);
  engine.store.addEntity(player);
  engine.store.state.playerId = 'player';
  engine.store.state.locationId = 'cell';
  return engine;
}

function eventsOfType(engine: Engine, type: string): ResolvedEvent[] {
  return engine.world.eventLog.filter((e) => e.type === type);
}

function lastRejection(engine: Engine): ResolvedEvent | undefined {
  const all = eventsOfType(engine, 'action.rejected');
  return all[all.length - 1];
}

beforeEach(() => {
  clearStatusRegistry();
});

// ---------------------------------------------------------------------------
// Registration + catalog transport
// ---------------------------------------------------------------------------

describe('registration and catalog-formula transport', () => {
  it('registers equip/unequip verbs and the persisted namespace default', () => {
    const engine = makeEngine();
    expect(engine.getAvailableActions()).toContain('equip');
    expect(engine.getAvailableActions()).toContain('unequip');
    const state = engine.world.modules[EQUIPMENT_STATE_KEY] as EquipmentModuleState;
    expect(state).toEqual({ loadouts: {} });
  });

  it('publishes the construction-frozen catalog under EQUIPMENT_CATALOG_FORMULA', () => {
    const engine = makeEngine();
    expect(engine.formulas.has(EQUIPMENT_CATALOG_FORMULA)).toBe(true);
    const published = engine.formulas.get(EQUIPMENT_CATALOG_FORMULA)() as ItemCatalog;
    expect(published).toBe(catalog); // identity — the frozen pack catalog, not a copy
    expect(published.items.map((i) => i.id)).toEqual([
      'trident-and-net',
      'gladius',
      'champion-helm',
      'penitent-mail',
    ]);
  });

  it('registers one status definition per catalog item, modifiers mirroring statModifiers', () => {
    makeEngine();
    const def = getStatusDefinition(equipStatusId('trident-and-net'));
    expect(def).toBeDefined();
    expect(def!.name).toBe('Equipped: Trident & Net');
    expect(def!.modifiers).toEqual([{ stat: 'agility', operation: 'add', value: 1 }]);
    expect(def!.duration).toEqual({ type: 'permanent' });
    expect(def!.stacking).toBe('replace');
    // buildEquipmentStatusDefinitions is the single source those came from
    const built = buildEquipmentStatusDefinitions(catalog);
    expect(built.map((d) => d.id)).toEqual([
      'equipped-trident-and-net',
      'equipped-gladius',
      'equipped-champion-helm',
      'equipped-penitent-mail',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Equip — the stat carry
// ---------------------------------------------------------------------------

describe('equip applies the status and the stat moves', () => {
  it('bare equip resolves the single carried equippable and moves effectiveStat', () => {
    const engine = makeEngine();
    const player = engine.world.entities['player'];
    expect(effectiveStat(player, 'agility', engine.world, 0)).toBe(5);

    engine.submitAction('equip');

    expect(hasStatus(player, equipStatusId('trident-and-net'))).toBe(true);
    expect(effectiveStat(player, 'agility', engine.world, 0)).toBe(6); // 5 + 1 (equipped)
    expect(player.inventory).toEqual([]); // moved out of carried inventory
    const loadout = getEntityLoadout(engine.world, 'player');
    expect(loadout?.equipped.weapon).toBe('trident-and-net');
    // core-typed mirror for external consumers
    expect(player.equipment?.weapon).toBe('trident-and-net');
  });

  it('emits the telegraph-voice status line and the objective item.equipped record', () => {
    const engine = makeEngine();
    engine.submitAction('equip', { parameters: { itemId: 'trident-and-net' } });

    const applied = eventsOfType(engine, 'status.applied');
    expect(applied).toHaveLength(1);
    expect(applied[0].payload.description).toBe('Equipped: Trident & Net. (+1 agility)');
    expect(applied[0].payload.itemId).toBe('trident-and-net');
    expect(applied[0].payload.slot).toBe('weapon');
    expect(applied[0].presentation).toEqual({ channels: ['objective', 'narrator'], priority: 'normal' });

    const record = eventsOfType(engine, 'item.equipped');
    expect(record).toHaveLength(1);
    expect(record[0].payload).toMatchObject({
      entityId: 'player',
      itemId: 'trident-and-net',
      itemName: 'Trident & Net',
      slot: 'weapon',
      statModifiers: { agility: 1 },
      grantedTags: ['armed', 'entangler'],
      grantedVerbs: ['ensnare'],
    });
  });

  it('resolves an item by exact name, case-insensitively', () => {
    const engine = makeEngine();
    engine.submitAction('equip', { parameters: { itemId: 'trident & net' } });
    expect(hasStatus(engine.world.entities['player'], equipStatusId('trident-and-net'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Slot semantics — the equipment package's own model (swap)
// ---------------------------------------------------------------------------

describe('slot semantics follow equipItem (occupied slot swaps to inventory)', () => {
  it('equipping a second weapon displaces the first back to inventory and retires its status', () => {
    const engine = makeEngine((p) => {
      p.inventory = ['trident-and-net', 'gladius'];
    });
    const player = engine.world.entities['player'];

    engine.submitAction('equip', { parameters: { itemId: 'trident-and-net' } });
    engine.submitAction('equip', { parameters: { itemId: 'gladius' } });

    const loadout = getEntityLoadout(engine.world, 'player')!;
    expect(loadout.equipped.weapon).toBe('gladius');
    expect(player.inventory).toEqual(['trident-and-net']); // swapped back
    expect(hasStatus(player, equipStatusId('gladius'))).toBe(true);
    expect(hasStatus(player, equipStatusId('trident-and-net'))).toBe(false);
    expect(effectiveStat(player, 'might', engine.world, 0)).toBe(6); // gladius +1
    expect(effectiveStat(player, 'agility', engine.world, 0)).toBe(5); // trident retired

    // The swap narrates in order: retire line, then equip line.
    const removedEvents = eventsOfType(engine, 'status.removed');
    expect(removedEvents).toHaveLength(1);
    expect(removedEvents[0].payload.description).toBe('Unequipped: Trident & Net.');
    const record = eventsOfType(engine, 'item.equipped')[1];
    expect(record.payload.displacedItemId).toBe('trident-and-net');
  });

  it('the committed transition matches an independent equipItem run on the same staged input (parity)', () => {
    const engine = makeEngine((p) => {
      p.inventory = ['trident-and-net', 'gladius'];
    });
    const before = engine.world.entities['player'];

    // Independent expectation straight from the package API.
    const staged: Loadout = { ...createEmptyLoadout(), inventory: [...(before.inventory ?? [])] };
    const expected = equipItem(staged, 'gladius', catalog, before.tags);
    expect(expected.errors).toEqual([]);

    engine.submitAction('equip', { parameters: { itemId: 'gladius' } });

    expect(getEntityLoadout(engine.world, 'player')).toEqual(expected.loadout);
    expect(engine.world.entities['player'].inventory).toEqual(expected.loadout.inventory);
  });

  it('rejects a requiredTags miss with the package’s own error string', () => {
    const engine = makeEngine((p) => {
      p.inventory = ['champion-helm'];
    });
    engine.submitAction('equip', { parameters: { itemId: 'champion-helm' } });

    const rejection = lastRejection(engine)!;
    expect(rejection.payload.reason).toBe('Missing required tags to equip Champion Helm: champion');
    expect(rejection.payload.hint).toBe('Requires: champion — check your tags.');
    expect(hasStatus(engine.world.entities['player'], equipStatusId('champion-helm'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rejections — structured idiom with hints
// ---------------------------------------------------------------------------

describe('structured rejections carry reason + hint', () => {
  it('unknown item', () => {
    const engine = makeEngine();
    engine.submitAction('equip', { parameters: { itemId: 'flaming-zweihander' } });
    const rejection = lastRejection(engine)!;
    expect(rejection.payload.reason).toBe(
      "no equipment called 'flaming-zweihander' — carrying: trident-and-net",
    );
    expect(rejection.payload.hint).toBe("equip <item-id> (or bare 'equip' when carrying exactly one)");
  });

  it('catalog item that is not carried', () => {
    const engine = makeEngine();
    engine.submitAction('equip', { parameters: { itemId: 'gladius' } });
    const rejection = lastRejection(engine)!;
    expect(rejection.payload.reason).toBe("not carrying 'gladius' — carrying: trident-and-net");
    expect(rejection.payload.hint).toBe('Pick it up first, then equip it.');
  });

  it('bare equip with empty hands', () => {
    const engine = makeEngine((p) => {
      p.inventory = [];
    });
    engine.submitAction('equip');
    const rejection = lastRejection(engine)!;
    expect(rejection.payload.reason).toBe('nothing to equip — no equipment in inventory');
    expect(rejection.payload.hint).toBe('Equipment comes from the pack armory; check your inventory.');
  });

  it('bare equip with multiple candidates lists them', () => {
    const engine = makeEngine((p) => {
      p.inventory = ['trident-and-net', 'gladius'];
    });
    engine.submitAction('equip');
    const rejection = lastRejection(engine)!;
    expect(rejection.payload.reason).toBe('equip what? carrying: trident-and-net, gladius');
    expect(rejection.payload.hint).toBe('equip <item-id>');
    expect(rejection.payload.candidates).toEqual(['trident-and-net', 'gladius']);
  });

  it('a defeated actor cannot equip', () => {
    const engine = makeEngine((p) => {
      p.resources.hp = 0;
    });
    engine.submitAction('equip');
    expect(lastRejection(engine)!.payload.reason).toBe('actor is defeated');
  });

  it('unequip with nothing equipped', () => {
    const engine = makeEngine();
    engine.submitAction('unequip');
    const rejection = lastRejection(engine)!;
    expect(rejection.payload.reason).toBe('nothing is equipped');
    expect(rejection.payload.hint).toBe('equip <item> first.');
  });

  it('unequip a reference that is not equipped', () => {
    const engine = makeEngine();
    engine.submitAction('equip');
    engine.submitAction('unequip', { parameters: { itemId: 'gladius' } });
    const rejection = lastRejection(engine)!;
    expect(rejection.payload.reason).toBe(
      "'gladius' is not equipped — equipped: weapon: trident-and-net",
    );
    expect(rejection.payload.hint).toBe('unequip <item-id-or-slot>');
  });

  it('bare unequip with multiple equipped lists slots', () => {
    const engine = makeEngine((p) => {
      p.tags.push('champion');
      p.inventory = ['trident-and-net', 'champion-helm'];
    });
    engine.submitAction('equip', { parameters: { itemId: 'trident-and-net' } });
    engine.submitAction('equip', { parameters: { itemId: 'champion-helm' } });
    engine.submitAction('unequip');
    const rejection = lastRejection(engine)!;
    expect(rejection.payload.reason).toBe(
      'unequip what? equipped: armor: champion-helm, weapon: trident-and-net',
    );
    expect(rejection.payload.hint).toBe('unequip <item-id-or-slot>');
  });
});

// ---------------------------------------------------------------------------
// Resource carry — entity.resources (F-823b8574)
// ---------------------------------------------------------------------------

describe('equip applies resourceModifiers to entity.resources (F-823b8574)', () => {
  it('equipping +hp armor moves hp and maxHp', () => {
    const engine = makeEngine((p) => {
      p.inventory = ['penitent-mail'];
    });
    const player = engine.world.entities['player'];
    expect(player.resources.hp).toBe(25);
    expect(player.resources.maxHp).toBe(25);

    engine.submitAction('equip', { parameters: { itemId: 'penitent-mail' } });

    expect(player.resources.hp).toBe(30);
    expect(player.resources.maxHp).toBe(30);
    expect(hasStatus(player, equipStatusId('penitent-mail'))).toBe(true);
  });

  it('unequip reverses hp and maxHp (red-proof: numbers return to base)', () => {
    const engine = makeEngine((p) => {
      p.inventory = ['penitent-mail'];
    });
    const player = engine.world.entities['player'];
    engine.submitAction('equip', { parameters: { itemId: 'penitent-mail' } });
    expect(player.resources.hp).toBe(30);
    expect(player.resources.maxHp).toBe(30);

    engine.submitAction('unequip');

    expect(player.resources.hp).toBe(25);
    expect(player.resources.maxHp).toBe(25);
    expect(hasStatus(player, equipStatusId('penitent-mail'))).toBe(false);
  });

  it('unequip after damage shrinks maxHp and clamps current instead of dealing the bonus (F-bf0de04d)', () => {
    // 25/25 → equip 30/30 → damage 3/30 → unequip 3/25, not 0/25.
    // Subtracting the +hp bonus from current hp treats taking the armor off
    // as damage and the defeated gate (hp <= 0) would then mark the wearer dead.
    const engine = makeEngine((p) => {
      p.inventory = ['penitent-mail'];
    });
    const player = engine.world.entities['player'];
    engine.submitAction('equip', { parameters: { itemId: 'penitent-mail' } });
    expect(player.resources.hp).toBe(30);
    expect(player.resources.maxHp).toBe(30);

    player.resources.hp = 3;

    engine.submitAction('unequip');

    expect(player.resources.hp).toBe(3);
    expect(player.resources.maxHp).toBe(25);
    expect(hasStatus(player, equipStatusId('penitent-mail'))).toBe(false);
  });

  it('hp-without-maxHp reverse restores a wearer that has no maxHp (F-b90e156c)', () => {
    // Ash-ghoul / crypt-stalker / pilgrim shape: { hp } only. Reverse used
    // to skip the hp debit (F-bf0de04d) AND the maxHp shrink when the cap
    // was missing, so equip left a permanent +5 — farmable on re-equip.
    const engine = makeEngine((p) => {
      p.inventory = ['penitent-mail'];
      p.resources = { hp: 12 };
    });
    const player = engine.world.entities['player'];
    expect(player.resources.maxHp).toBeUndefined();

    engine.submitAction('equip', { parameters: { itemId: 'penitent-mail' } });
    expect(player.resources.hp).toBe(17);

    engine.submitAction('unequip');
    expect(player.resources.hp).toBe(12);

    engine.submitAction('equip', { parameters: { itemId: 'penitent-mail' } });
    expect(player.resources.hp).toBe(17);
    engine.submitAction('unequip');
    expect(player.resources.hp).toBe(12);
  });

  it('hp-without-maxHp reverse after damage does not defeat a no-maxHp wearer (F-b90e156c)', () => {
    const engine = makeEngine((p) => {
      p.inventory = ['penitent-mail'];
      p.resources = { hp: 12 };
    });
    const player = engine.world.entities['player'];
    engine.submitAction('equip', { parameters: { itemId: 'penitent-mail' } });
    player.resources.hp = 3;
    engine.submitAction('unequip');
    expect(player.resources.hp).toBe(3);
    expect(player.resources.maxHp).toBe(12);
  });

  it('displacing +hp armor with a different armor reverses the first bonus', () => {
    const engine = makeEngine((p) => {
      p.tags.push('champion');
      p.inventory = ['penitent-mail', 'champion-helm'];
    });
    const player = engine.world.entities['player'];
    engine.submitAction('equip', { parameters: { itemId: 'penitent-mail' } });
    expect(player.resources.hp).toBe(30);
    expect(player.resources.maxHp).toBe(30);

    engine.submitAction('equip', { parameters: { itemId: 'champion-helm' } });

    expect(player.resources.hp).toBe(25);
    expect(player.resources.maxHp).toBe(25);
    expect(hasStatus(player, equipStatusId('penitent-mail'))).toBe(false);
    expect(hasStatus(player, equipStatusId('champion-helm'))).toBe(true);
  });

  it('swapping +hp armor onto a non-hp item after damage does not defeat (F-bf0de04d)', () => {
    const engine = makeEngine((p) => {
      p.tags.push('champion');
      p.inventory = ['penitent-mail', 'champion-helm'];
    });
    const player = engine.world.entities['player'];
    engine.submitAction('equip', { parameters: { itemId: 'penitent-mail' } });
    player.resources.hp = 3;

    engine.submitAction('equip', { parameters: { itemId: 'champion-helm' } });

    expect(player.resources.hp).toBe(3);
    expect(player.resources.maxHp).toBe(25);
    expect(hasStatus(player, equipStatusId('penitent-mail'))).toBe(false);
    expect(hasStatus(player, equipStatusId('champion-helm'))).toBe(true);
  });

  it('equip: statuses.apply throwing leaves resourceModifiers unapplied', () => {
    const throwingApply: EquipmentStatusOps = {
      registerDefinitions: registerStatusDefinitions,
      apply: () => {
        throw new Error('boom');
      },
      remove: removeStatus,
    };
    const engine = makeEngine((p) => {
      p.inventory = ['penitent-mail'];
    }, throwingApply);
    const player = engine.world.entities['player'];

    engine.submitAction('equip', { parameters: { itemId: 'penitent-mail' } });

    expect(player.resources.hp).toBe(25);
    expect(player.resources.maxHp).toBe(25);
  });

  it('re-equipping a second copy of the same item id does not double-apply resourceModifiers (F-b6e5274a)', () => {
    const engine = makeEngine((p) => {
      p.inventory = [];
    });
    const player = engine.world.entities['player'];
    const tick = engine.world.meta.tick;
    engine.store.recordEvent(giveItem(player, 'penitent-mail', tick));
    engine.store.recordEvent(giveItem(player, 'penitent-mail', tick));
    expect(player.inventory).toEqual(['penitent-mail', 'penitent-mail']);
    expect(player.resources.hp).toBe(25);
    expect(player.resources.maxHp).toBe(25);

    engine.submitAction('equip', { parameters: { itemId: 'penitent-mail' } });
    expect(player.resources.hp).toBe(30);
    expect(player.resources.maxHp).toBe(30);
    expect(player.inventory).toEqual(['penitent-mail']);

    engine.submitAction('equip', { parameters: { itemId: 'penitent-mail' } });
    expect(player.resources.hp).toBe(30);
    expect(player.resources.maxHp).toBe(30);
    expect(hasStatus(player, equipStatusId('penitent-mail'))).toBe(true);
    expect(getEntityLoadout(engine.world, 'player')?.equipped.armor).toBe('penitent-mail');
    expect(player.inventory).toEqual(['penitent-mail']);
    expect(eventsOfType(engine, 'item.equipped')).toHaveLength(1);

    engine.submitAction('equip', { parameters: { itemId: 'penitent-mail' } });
    expect(player.resources.hp).toBe(30);
    expect(player.resources.maxHp).toBe(30);
    expect(eventsOfType(engine, 'item.equipped')).toHaveLength(1);
    expect(eventsOfType(engine, 'item.already-equipped')).toHaveLength(2);

    engine.submitAction('unequip');
    expect(player.resources.hp).toBe(25);
    expect(player.resources.maxHp).toBe(25);
    expect(hasStatus(player, equipStatusId('penitent-mail'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unequip — reversal and the red-proof direction
// ---------------------------------------------------------------------------

describe('unequip reverses the carry (red-proof: no status, no delta)', () => {
  it('bare unequip with one equipped item removes the status and the delta', () => {
    const engine = makeEngine();
    const player = engine.world.entities['player'];
    engine.submitAction('equip');
    expect(effectiveStat(player, 'agility', engine.world, 0)).toBe(6);

    engine.submitAction('unequip');

    expect(hasStatus(player, equipStatusId('trident-and-net'))).toBe(false);
    expect(effectiveStat(player, 'agility', engine.world, 0)).toBe(5); // red-proof
    expect(player.inventory).toEqual(['trident-and-net']); // back in inventory
    expect(getEntityLoadout(engine.world, 'player')?.equipped.weapon).toBeNull();
    // The core-typed mirror carries occupied slots only (ref-validator safety).
    expect(player.equipment?.weapon).toBeUndefined();

    const removedEvents = eventsOfType(engine, 'status.removed');
    expect(removedEvents[removedEvents.length - 1].payload.description).toBe('Unequipped: Trident & Net.');
    expect(eventsOfType(engine, 'item.unequipped')).toHaveLength(1);
  });

  it('unequip by slot name and by item id both resolve', () => {
    const engine = makeEngine();
    engine.submitAction('equip');
    engine.submitAction('unequip', { parameters: { itemId: 'weapon' } });
    expect(getEntityLoadout(engine.world, 'player')?.equipped.weapon).toBeNull();

    engine.submitAction('equip');
    engine.submitAction('unequip', { parameters: { itemId: 'trident-and-net' } });
    expect(getEntityLoadout(engine.world, 'player')?.equipped.weapon).toBeNull();
  });

  it('an entity that never equipped shows base stats throughout (control)', () => {
    const engine = makeEngine();
    const bystander: EntityState = { ...makePlayer(), id: 'bystander', name: 'Bystander' };
    engine.store.addEntity(bystander);
    engine.submitAction('equip'); // player equips; bystander untouched
    const control = engine.world.entities['bystander'];
    expect(effectiveStat(control, 'agility', engine.world, 0)).toBe(5);
    expect(control.statuses).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// F-8a09a07b (red-proof): a throwing injected status op must never leave a
// committed loadout behind a dispatcher-degraded action.rejected.
//
// commitLoadout used to run BEFORE the fallible statuses.remove/apply calls.
// ActionDispatcher.dispatch catches any handler throw and degrades it to a
// generic 'action.rejected' event, but it cannot undo a mutation the handler
// already made before throwing — so a throwing status op left the actor's
// loadout/inventory/equipment changed while the event log said the action
// was rejected. These fail without the fix (the mutation is observable
// despite the rejection) and pass with it (the commit never ran).
// ---------------------------------------------------------------------------

describe('F-8a09a07b: throwing status ops never leave a committed loadout behind action.rejected', () => {
  it('equip: statuses.apply throwing leaves inventory/loadout/equipment uncommitted', () => {
    const throwingApply: EquipmentStatusOps = {
      registerDefinitions: registerStatusDefinitions,
      apply: () => {
        throw new Error('boom');
      },
      remove: removeStatus,
    };
    const engine = makeEngine(undefined, throwingApply);
    const player = engine.world.entities['player'];

    engine.submitAction('equip');

    const rejected = eventsOfType(engine, 'action.rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].payload.reason).toBe('handler for "equip" threw: boom');

    // RED without the fix: commitLoadout ran before statuses.apply threw, so
    // the item was already moved out of inventory and into equipment despite
    // the action being reported as rejected.
    expect(player.inventory).toEqual(['trident-and-net']); // untouched
    expect(player.equipment).toBeUndefined();
    expect(getEntityLoadout(engine.world, 'player')).toBeUndefined();
  });

  it('unequip: statuses.remove throwing leaves the prior committed loadout unchanged', () => {
    const throwingRemove: EquipmentStatusOps = {
      registerDefinitions: registerStatusDefinitions,
      apply: applyStatus,
      remove: () => {
        throw new Error('boom');
      },
    };
    const engine = makeEngine(undefined, throwingRemove);
    const player = engine.world.entities['player'];

    engine.submitAction('equip'); // succeeds — apply does not throw here
    expect(player.inventory).toEqual([]);
    expect(getEntityLoadout(engine.world, 'player')?.equipped.weapon).toBe('trident-and-net');

    engine.submitAction('unequip'); // statuses.remove throws

    const rejected = eventsOfType(engine, 'action.rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].payload.reason).toBe('handler for "unequip" threw: boom');

    // RED without the fix: commitLoadout ran before statuses.remove threw, so
    // the item was already swapped back into inventory and the loadout
    // cleared despite the action being reported as rejected.
    expect(player.inventory).toEqual([]); // still equipped, not reverted
    expect(getEntityLoadout(engine.world, 'player')?.equipped.weapon).toBe('trident-and-net');
    expect(player.equipment?.weapon).toBe('trident-and-net');
  });
});

// ---------------------------------------------------------------------------
// Save/load round-trip
// ---------------------------------------------------------------------------

describe('save/load preserves loadout + status (and re-registers code-side pieces)', () => {
  it('round-trips through Engine.serialize/deserialize', () => {
    const engine = makeEngine();
    engine.submitAction('equip');
    const saved = engine.serialize();

    clearStatusRegistry(); // simulate a fresh process — definitions are code, re-registered below

    const restored = Engine.deserialize(saved, {
      modules: [statusCore, createEquipmentCore({ catalog, statuses: statusOps })],
    });

    const player = restored.world.entities['player'];
    expect(hasStatus(player, equipStatusId('trident-and-net'))).toBe(true);
    expect(effectiveStat(player, 'agility', restored.world, 0)).toBe(6); // modifiers re-resolved
    expect(getEntityLoadout(restored.world, 'player')?.equipped.weapon).toBe('trident-and-net');
    expect(restored.formulas.has(EQUIPMENT_CATALOG_FORMULA)).toBe(true);

    // And the loop continues on the restored world: unequip reverses it.
    restored.submitAction('unequip');
    expect(effectiveStat(player, 'agility', restored.world, 0)).toBe(5);
    expect(player.inventory).toEqual(['trident-and-net']);
  });

  it('getEquipmentState synthesizes-and-attaches on a bare world (harness path)', () => {
    const engine = makeEngine();
    delete (engine.world.modules as Record<string, unknown>)[EQUIPMENT_STATE_KEY];
    const state = getEquipmentState(engine.store.state);
    expect(state).toEqual({ loadouts: {} });
    expect(engine.world.modules[EQUIPMENT_STATE_KEY]).toBe(state);
  });
});
