// The equipment loop, end to end in the shipped pack — and the two instruments
// that gate mechanics rather than stats.
//
// In most starters equipment moves combat numbers. Here it moves ACCESS: the
// Guild Seal grants `consign` and the Ledger Book grants `audit`, so equipping
// or losing an instrument adds or removes a verb. That makes the equip loop
// load-bearing for the pack's identity, not decoration — and it is why a seizure
// costs a mechanic.

import { describe, it, expect } from 'vitest';
import { hasStatus } from '@ai-rpg-engine/modules';
import {
  getEntityLoadout,
  equipStatusId,
  EQUIPMENT_CATALOG_FORMULA,
  computeLoadoutEffects,
} from '@ai-rpg-engine/equipment';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import { createGame } from './setup.js';
import { itemCatalog } from './content.js';
import { getOpenObligations } from './contract-core.js';

/** Resolve the catalog THROUGH the published formula — the transport a real
 *  consumer uses — rather than importing the value directly. */
function resolveCatalog(engine: ReturnType<typeof createGame>): ItemCatalog {
  return engine.formulas.get(EQUIPMENT_CATALOG_FORMULA)() as ItemCatalog;
}

describe('equipment loop — the shipped pack', () => {
  it('publishes its catalog through the formula registry', () => {
    const engine = createGame(71);
    const published = resolveCatalog(engine);
    expect(published.items.map((i) => i.id).sort()).toEqual(itemCatalog.items.map((i) => i.id).sort());
  });

  it('equipping the ledger book moves it into the loadout and mirrors a status', () => {
    const engine = createGame(71);
    const player = engine.world.entities.factor;
    expect(player.inventory).toContain('ledger-book');

    engine.submitAction('equip', { parameters: { itemId: 'ledger-book' } });

    expect(getEntityLoadout(engine.world, 'factor')?.equipped.tool).toBe('ledger-book');
    expect(hasStatus(engine.world.entities.factor, equipStatusId('ledger-book'))).toBe(true);
    expect(engine.world.entities.factor.inventory).not.toContain('ledger-book');
  });

  it('unequipping returns it to inventory', () => {
    const engine = createGame(71);
    engine.submitAction('equip', { parameters: { itemId: 'ledger-book' } });
    engine.submitAction('unequip', { parameters: { itemId: 'ledger-book' } });

    expect(getEntityLoadout(engine.world, 'factor')?.equipped.tool).toBeNull();
    expect(engine.world.entities.factor.inventory).toContain('ledger-book');
  });

  it('the loupe’s +2 ledger reaches the aggregate effect computation', () => {
    const engine = createGame(71);
    const player = engine.world.entities.factor;
    player.inventory = [...(player.inventory ?? []), 'assayers-loupe'];
    engine.submitAction('equip', { parameters: { itemId: 'assayers-loupe' } });

    const loadout = getEntityLoadout(engine.world, 'factor')!;
    const effects = computeLoadoutEffects(loadout, resolveCatalog(engine));
    expect(effects.statModifiers.ledger).toBeGreaterThanOrEqual(2);
  });
});

describe('instruments gate MECHANICS, not stats', () => {
  it('an EQUIPPED seal satisfies consign just as a carried one does', () => {
    // contract-core resolves verb-granting items from inventory AND from the
    // `equipped-<itemId>` statuses equipment-core mirrors. If it only read
    // inventory, equipping your seal — the natural thing to do with a seal you
    // want seen — would silently disable consigning.
    const engine = createGame(71);
    const player = engine.world.entities.factor;
    player.inventory = [...(player.inventory ?? []), 'guild-seal'];
    engine.submitAction('equip', { parameters: { itemId: 'guild-seal' } });
    expect(getEntityLoadout(engine.world, 'factor')?.equipped.trinket).toBe('guild-seal');
    expect(player.inventory).not.toContain('guild-seal');

    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });

    expect(getOpenObligations(engine.world)).toHaveLength(1);
  });

  it('losing the seal removes the ability to consign at all', () => {
    const engine = createGame(71);
    const player = engine.world.entities.factor;
    player.inventory = (player.inventory ?? []).filter((i) => i !== 'guild-seal');

    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });

    expect(getOpenObligations(engine.world)).toHaveLength(0);
    const rejected = engine.world.eventLog.filter((e) => e.type === 'action.rejected');
    expect(rejected.length).toBeGreaterThan(0);
    expect(String(rejected[rejected.length - 1].payload.reason)).toContain('seal');
  });

  it('losing the ledger book removes the ability to audit', () => {
    const engine = createGame(71);
    const player = engine.world.entities.factor;
    player.inventory = (player.inventory ?? []).filter((i) => i !== 'ledger-book');

    engine.submitAction('audit');

    expect(engine.world.eventLog.filter((e) => e.type === 'merchant.audit.requested')).toHaveLength(0);
  });
});
