// F-ENG008 — equipment loop, end to end in the shipped gladiator pack.
//
// The player-visible goal under test: equip the trident → combat numbers and
// the HUD move, with ZERO combat-code changes. The combat number is pinned
// through a REAL combat-builders read (buildCombatFormulas' hitChance, which
// resolves stats via effectiveStat), the aggregate is cross-checked against
// the equipment package's own computeLoadoutEffects (no duplicated math), and
// save/load runs the CLI's actual restore path (WorldStore.deserialize into a
// pack-wired engine + rebindStore — restoreSessionFromSave's exact moves).

import { describe, it, expect } from 'vitest';
import { WorldStore } from '@ai-rpg-engine/core';
import type { Engine } from '@ai-rpg-engine/core';
import { resolveEntity, type CharacterBuild } from '@ai-rpg-engine/character-creation';
import {
  buildCombatFormulas,
  effectiveStat,
  hasStatus,
} from '@ai-rpg-engine/modules';
import {
  computeLoadoutEffects,
  getEntityLoadout,
  equipStatusId,
  EQUIPMENT_CATALOG_FORMULA,
} from '@ai-rpg-engine/equipment';
import { createGame } from './setup.js';
import { gladiatorMinimalRuleset } from './ruleset.js';
import { buildCatalog, itemCatalog } from './content.js';

/** The pack's live combat stat mapping (setup.ts's buildCombatStack config). */
const gladiatorMapping = { attack: 'might', precision: 'agility', resolve: 'showmanship' };

/** Minimal valid retiarius build (first background + first flaw, as the CLI wizard would). */
function retiariusBuild(): CharacterBuild {
  const flaw = buildCatalog.traits.find((t) => t.category === 'flaw')!;
  return {
    name: 'Proof',
    archetypeId: 'retiarius',
    backgroundId: buildCatalog.backgrounds[0].id,
    traitIds: [flaw.id],
  };
}

/** bin.ts's installCreatedPlayer moves, inlined (re-key to state.playerId, keep zone). */
function insertRetiarius(engine: Engine) {
  const entity = resolveEntity(retiariusBuild(), buildCatalog, gladiatorMinimalRuleset);
  const playerId = engine.store.state.playerId;
  entity.id = playerId;
  entity.zoneId = engine.store.state.entities[playerId]?.zoneId;
  engine.store.addEntity(entity);
  return engine.store.state.entities[playerId];
}

describe('equipment loop — authored player (no character creation)', () => {
  it('the armory issues the trident to the authored player, and bare equip readies it', () => {
    const engine = createGame(11);
    const player = engine.world.entities[engine.world.playerId];
    expect(player.inventory).toContain('trident-and-net');

    engine.submitAction('equip'); // single carried equippable → auto-resolves

    expect(hasStatus(player, equipStatusId('trident-and-net'))).toBe(true);
    expect(player.inventory).not.toContain('trident-and-net');
    expect(getEntityLoadout(engine.world, player.id)?.equipped.weapon).toBe('trident-and-net');
  });

  it('pins the combat number through a real combat-builders read: hit chance vs the war-beast 63 → 68', () => {
    const engine = createGame(11);
    const world = engine.world;
    const player = world.entities[world.playerId];
    const beast = world.entities['war-beast'];
    const formulas = buildCombatFormulas(gladiatorMapping);
    expect(formulas.hitChance).toBeDefined();

    // Base: 50 + agility(5)*5 − beast.agility(4)*3 = 63
    expect(formulas.hitChance!(player, beast, world)).toBe(63);

    engine.submitAction('equip');

    // Equipped: effectiveStat(agility) = 6 → 50 + 30 − 12 = 68
    expect(effectiveStat(player, 'agility', world, 5)).toBe(6);
    expect(formulas.hitChance!(player, beast, world)).toBe(68);

    // Red-proof (one direction): remove the status carrier and the delta is gone.
    engine.submitAction('unequip');
    expect(hasStatus(player, equipStatusId('trident-and-net'))).toBe(false);
    expect(formulas.hitChance!(player, beast, world)).toBe(63);
  });

  it('cross-checks the status-carried delta against the equipment package’s own aggregate', () => {
    const engine = createGame(11);
    const world = engine.world;
    const player = world.entities[world.playerId];
    engine.submitAction('equip');

    const loadout = getEntityLoadout(world, player.id)!;
    const aggregate = computeLoadoutEffects(loadout, itemCatalog);
    // No duplicated math: the module carries stats via statuses; the package's
    // computeLoadoutEffects over the same loadout must agree stat-for-stat.
    for (const [stat, delta] of Object.entries(aggregate.statModifiers)) {
      const base = player.stats[stat] ?? 0;
      expect(effectiveStat(player, stat, world, 0)).toBe(base + delta);
    }
    expect(aggregate.statModifiers).toEqual({ agility: 1 });
  });
});

describe('equipment loop — created character (startingInventory → inventory at build)', () => {
  it('resolveEntity carries the retiarius startingInventory into the created player', () => {
    const engine = createGame(11);
    const player = insertRetiarius(engine);
    expect(player.inventory).toContain('trident-and-net');
  });

  it('a created retiarius equips the trident and the pinned number moves (agility 6 → 7)', () => {
    const engine = createGame(11);
    const player = insertRetiarius(engine);
    const beast = engine.world.entities['war-beast'];
    const formulas = buildCombatFormulas(gladiatorMapping);
    expect(formulas.hitChance).toBeDefined();

    // Retiarius agility 6: 50 + 30 − 12 = 68 base.
    expect(formulas.hitChance!(player, beast, engine.world)).toBe(68);

    engine.submitAction('equip');

    expect(effectiveStat(player, 'agility', engine.world, 5)).toBe(7);
    expect(formulas.hitChance!(player, beast, engine.world)).toBe(73); // 50 + 35 − 12
  });
});

describe('catalog transport — the starter publishes, consumers read the formula', () => {
  it('EQUIPMENT_CATALOG_FORMULA resolves to the pack’s own frozen catalog', () => {
    const engine = createGame(11);
    expect(engine.formulas.has(EQUIPMENT_CATALOG_FORMULA)).toBe(true);
    const published = engine.formulas.get(EQUIPMENT_CATALOG_FORMULA)();
    expect(published).toBe(itemCatalog); // identity, not a copy
  });
});

describe('save/load — the CLI restore path preserves the loadout and the numbers', () => {
  it('WorldStore.deserialize into a pack-wired engine (restoreSessionFromSave’s moves)', () => {
    const engine = createGame(11);
    engine.submitAction('equip');
    const saved = JSON.parse(engine.serialize()) as { world: unknown };

    // The CLI's restore: fresh pack engine (modules registered, definitions +
    // formulas re-registered by createGame), saved world swapped in, emit path
    // rebound. See packages/cli/src/bin.ts restoreSessionFromSave.
    const fresh = createGame(11);
    const restored = WorldStore.deserialize(
      JSON.stringify(saved.world),
      fresh.store.events,
      gladiatorMinimalRuleset,
    );
    (fresh as unknown as { store: WorldStore }).store = restored;
    fresh.moduleManager.rebindStore(restored);

    const player = restored.state.entities[restored.state.playerId];
    expect(hasStatus(player, equipStatusId('trident-and-net'))).toBe(true);
    expect(getEntityLoadout(restored.state, player.id)?.equipped.weapon).toBe('trident-and-net');
    expect(effectiveStat(player, 'agility', restored.state, 5)).toBe(6);

    // The loop stays live post-restore: unequip through the restored engine.
    fresh.submitAction('unequip');
    expect(effectiveStat(player, 'agility', restored.state, 5)).toBe(5);
    expect(player.inventory).toContain('trident-and-net');
  });
});

describe('help-row honesty — the advertised verbs are the registered ones', () => {
  it('equip and unequip appear in the ruleset help table AND resolve to handlers', () => {
    const registered = new Set(createGame(11).getAvailableActions());
    const helped = new Set(gladiatorMinimalRuleset.verbs.map((v) => v.id));
    expect(helped.has('equip')).toBe(true);
    expect(helped.has('unequip')).toBe(true);
    expect(registered.has('equip')).toBe(true);
    expect(registered.has('unequip')).toBe(true);
  });
});
