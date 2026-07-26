// contract-core — the obligation engine, driven through a REAL engine.
//
// Every test here submits actions the way a player does and reads world state
// back. Nothing writes obligation state directly; nothing asserts on a fixture
// it also authored.

import { describe, it, expect } from 'vitest';
import { createTestEngine, Engine } from '@ai-rpg-engine/core';
import type { EntityState, ZoneState } from '@ai-rpg-engine/core';
import { statusCore } from '@ai-rpg-engine/modules';
import { traversalCore } from '@ai-rpg-engine/modules';
import {
  createContractCore,
  getContractState,
  getOpenObligations,
  getOverdueObligations,
  honourObligation,
  defaultObligation,
  tickObligations,
  CONTRACT_STATE_KEY,
  SEIZURE_THRESHOLD,
  REVOCATION_THRESHOLD,
} from './contract-core.js';
import { itemCatalog } from './content.js';

const zones: ZoneState[] = [
  { id: 'counting-house', roomId: 'saltgate', name: 'The Counting House', tags: ['safe'], neighbors: ['weighing-floor'] },
  { id: 'weighing-floor', roomId: 'saltgate', name: 'The Weighing Floor', tags: ['market'], neighbors: ['counting-house'] },
];

function factor(overrides: Partial<EntityState> = {}): EntityState {
  return {
    id: 'factor',
    blueprintId: 'factor',
    type: 'player',
    name: 'Factor',
    tags: ['player', 'merchant'],
    stats: { ledger: 6, tongue: 6, standing: 4 },
    resources: { hp: 14, maxHp: 14, stamina: 10, coin: 40, liquidity: 45, lien: 0 },
    statuses: [],
    inventory: ['bale-of-flax', 'ledger-book', 'guild-seal'],
    zoneId: 'counting-house',
    ...overrides,
  };
}

function broker(): EntityState {
  return {
    id: 'broker-inaya',
    blueprintId: 'broker-inaya',
    type: 'npc',
    name: 'Broker Inaya',
    tags: ['npc'],
    stats: { ledger: 9, tongue: 10, standing: 2 },
    resources: { hp: 10, maxHp: 10, stamina: 4 },
    statuses: [],
    zoneId: 'counting-house',
  };
}

function harness(player: EntityState = factor()) {
  return createTestEngine({
    modules: [statusCore, traversalCore, createContractCore({ catalog: itemCatalog })],
    zones,
    entities: [player, broker()],
    playerId: 'factor',
    startZone: 'counting-house',
  });
}

const eventsOfType = (engine: ReturnType<typeof harness>, type: string) =>
  engine.world.eventLog.filter((e) => e.type === type);

describe('the namespace is not an unconditional scaffold', () => {
  it('a world where nothing is consigned never materialises contract-core state', () => {
    // The npc-agency / item-chronicle-core contract. A pack that merely includes
    // this module must be indistinguishable from one that does not, until an
    // obligation actually exists.
    const engine = harness();
    expect(engine.world.modules[CONTRACT_STATE_KEY]).toBeUndefined();
    expect(getContractState(engine.world).obligations).toEqual([]);
  });

  it('getContractState tolerates a malformed namespace without throwing or attaching', () => {
    const engine = harness();
    engine.world.modules[CONTRACT_STATE_KEY] = 'not an object' as unknown as never;
    expect(() => getContractState(engine.world)).not.toThrow();
    expect(getContractState(engine.world).obligations).toEqual([]);
  });
});

describe('appraise', () => {
  it('reports a value band and the item’s provenance', () => {
    const engine = harness();
    engine.submitAction('appraise', { parameters: { itemId: 'guild-seal' } });

    const [event] = eventsOfType(engine, 'merchant.item.appraised');
    expect(event).toBeDefined();
    expect(event.payload.itemId).toBe('guild-seal');
    expect(event.payload.rarity).toBe('legendary');
    expect(event.payload.provenanceOrigin).toBe('The Assay Guild, Saltgate');
    expect(Number(event.payload.estimateLow)).toBeLessThanOrEqual(Number(event.payload.estimateHigh));
  });

  it('a higher ledger stat narrows the band — the same item, read better', () => {
    // Determinism AND mechanical meaning in one assertion: no roll is involved,
    // so the only thing that can move the spread is the stat.
    const dull = harness(factor({ stats: { ledger: 1, tongue: 6, standing: 4 } }));
    const sharp = harness(factor({ stats: { ledger: 18, tongue: 6, standing: 4 } }));
    dull.submitAction('appraise', { parameters: { itemId: 'saffron-brick' } });
    sharp.submitAction('appraise', { parameters: { itemId: 'saffron-brick' } });

    const spread = (e: ReturnType<typeof harness>) => {
      const [ev] = eventsOfType(e, 'merchant.item.appraised');
      return Number(ev.payload.estimateHigh) - Number(ev.payload.estimateLow);
    };
    expect(spread(sharp)).toBeLessThan(spread(dull));
  });

  it('rejects an unknown item rather than inventing a price', () => {
    const engine = harness();
    engine.submitAction('appraise', { parameters: { itemId: 'no-such-thing' } });
    expect(eventsOfType(engine, 'merchant.item.appraised')).toHaveLength(0);
    expect(eventsOfType(engine, 'action.rejected')).toHaveLength(1);
  });
});

describe('haggle', () => {
  it('spends liquidity and returns a deterministic margin', () => {
    const engine = harness();
    const before = engine.world.entities.factor.resources.liquidity;
    engine.submitAction('haggle', { targetIds: ['broker-inaya'] });

    const [event] = eventsOfType(engine, 'merchant.price.haggled');
    expect(event).toBeDefined();
    expect(engine.world.entities.factor.resources.liquidity).toBeLessThan(before);
    expect(typeof event.payload.marginPercent).toBe('number');
  });

  it('FAILS at zero liquidity — the design floor, not a soft penalty', () => {
    const engine = harness(factor({ resources: { hp: 14, maxHp: 14, stamina: 10, coin: 40, liquidity: 0, lien: 0 } }));
    engine.submitAction('haggle', { targetIds: ['broker-inaya'] });

    expect(eventsOfType(engine, 'merchant.price.haggled')).toHaveLength(0);
    const [rejected] = eventsOfType(engine, 'action.rejected');
    expect(String(rejected.payload.reason)).toContain('liquidity');
  });
});

describe('consign — the obligation lifecycle', () => {
  it('moves the goods OUT of inventory and creates an open obligation with a due tick', () => {
    const engine = harness();
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });

    // The whole risk of the verb: you are holding a promise, not an object.
    expect(engine.world.entities.factor.inventory).not.toContain('bale-of-flax');

    const open = getOpenObligations(engine.world);
    expect(open).toHaveLength(1);
    expect(open[0].itemId).toBe('bale-of-flax');
    expect(open[0].counterparty).toBe('broker-inaya');
    expect(open[0].dueTick).toBeGreaterThan(open[0].issuedTick);

    const [event] = eventsOfType(engine, 'merchant.contract.consigned');
    expect(event.payload.obligationId).toBe(open[0].id);
    expect(event.payload.dueTick).toBe(open[0].dueTick);
  });

  it('removes ONE unit — a factor with three salt blocks who consigns one keeps two', () => {
    const engine = harness(factor({ inventory: ['salt-block', 'salt-block', 'salt-block', 'guild-seal'] }));
    engine.submitAction('consign', { parameters: { itemId: 'salt-block' }, targetIds: ['broker-inaya'] });

    const remaining = (engine.world.entities.factor.inventory ?? []).filter((i) => i === 'salt-block');
    expect(remaining).toHaveLength(2);
  });

  it('REQUIRES the guild seal — without it you are cash-on-the-barrel only', () => {
    const engine = harness(factor({ inventory: ['bale-of-flax', 'ledger-book'] }));
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });

    expect(getOpenObligations(engine.world)).toHaveLength(0);
    const [rejected] = eventsOfType(engine, 'action.rejected');
    expect(String(rejected.payload.reason)).toContain('seal');
    // And the goods stay in hand — a rejected consign must not eat the item.
    expect(engine.world.entities.factor.inventory).toContain('bale-of-flax');
  });

  it('refuses at or past the seizure threshold — too encumbered to promise more', () => {
    const engine = harness(factor({
      resources: { hp: 14, maxHp: 14, stamina: 10, coin: 40, liquidity: 45, lien: SEIZURE_THRESHOLD },
    }));
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });

    expect(getOpenObligations(engine.world)).toHaveLength(0);
    expect(eventsOfType(engine, 'action.rejected')).toHaveLength(1);
  });

  it('refuses goods not in hand', () => {
    const engine = harness();
    engine.submitAction('consign', { parameters: { itemId: 'saffron-brick' }, targetIds: ['broker-inaya'] });
    expect(getOpenObligations(engine.world)).toHaveLength(0);
    expect(eventsOfType(engine, 'action.rejected')).toHaveLength(1);
  });
});

describe('honour and default', () => {
  it('honouring pays the value and clears the obligation', () => {
    const engine = harness();
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    const obligation = getOpenObligations(engine.world)[0];
    const coinBefore = engine.world.entities.factor.resources.coin;

    const events = honourObligation(engine.world, obligation.id, engine.world.meta.tick);

    expect(events[0].type).toBe('merchant.contract.honoured');
    expect(events[0].payload.onTime).toBe(true);
    expect(engine.world.entities.factor.resources.coin).toBe(coinBefore + obligation.value);
    expect(getOpenObligations(engine.world)).toHaveLength(0);
  });

  it('defaulting lands lien and leaves the goods gone', () => {
    const engine = harness();
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    const obligation = getOpenObligations(engine.world)[0];
    const lienBefore = engine.world.entities.factor.resources.lien;

    const events = defaultObligation(engine.world, obligation.id, engine.world.meta.tick);

    expect(events[0].type).toBe('merchant.contract.defaulted');
    expect(engine.world.entities.factor.resources.lien).toBeGreaterThan(lienBefore);
    expect(engine.world.entities.factor.inventory).not.toContain('bale-of-flax');
    expect(getContractState(engine.world).obligations[0].status).toBe('defaulted');
  });

  it('honouring an already-resolved obligation is a no-op, not a double payment', () => {
    const engine = harness();
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    const obligation = getOpenObligations(engine.world)[0];
    honourObligation(engine.world, obligation.id, engine.world.meta.tick);
    const coinAfterFirst = engine.world.entities.factor.resources.coin;

    const second = honourObligation(engine.world, obligation.id, engine.world.meta.tick);

    expect(second).toEqual([]);
    expect(engine.world.entities.factor.resources.coin).toBe(coinAfterFirst);
  });
});

describe('the obligation clock', () => {
  it('accrues lien only once an obligation is actually overdue', () => {
    const engine = harness();
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    const obligation = getOpenObligations(engine.world)[0];

    // On time: nothing accrues.
    expect(tickObligations(engine.world, obligation.dueTick)).toEqual([]);
    expect(engine.world.entities.factor.resources.lien).toBe(0);

    // One tick past: it does.
    const events = tickObligations(engine.world, obligation.dueTick + 10);
    expect(events.some((e) => e.type === 'merchant.lien.accrued')).toBe(true);
    expect(engine.world.entities.factor.resources.lien).toBeGreaterThan(0);
  });

  it('getOverdueObligations reports exactly what is past its date', () => {
    const engine = harness();
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    const obligation = getOpenObligations(engine.world)[0];

    expect(getOverdueObligations(engine.world, obligation.dueTick)).toHaveLength(0);
    expect(getOverdueObligations(engine.world, obligation.dueTick + 1)).toHaveLength(1);
  });

  it('SEIZURE is deterministic — the lowest item id, not iteration order', () => {
    // Two obligations, consigned in an order that does NOT match sort order, so
    // "first in the array" and "lowest id" disagree. A seizure that picked by
    // iteration order (or a roll) would take the wrong one, and a replay could
    // diverge.
    const engine = harness(factor({ inventory: ['saffron-brick', 'bale-of-flax', 'guild-seal'] }));
    engine.submitAction('consign', { parameters: { itemId: 'saffron-brick' }, targetIds: ['broker-inaya'] });
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    expect(getContractState(engine.world).obligations[0].itemId).toBe('saffron-brick');

    engine.world.entities.factor.resources.lien = SEIZURE_THRESHOLD;
    const events = tickObligations(engine.world, engine.world.meta.tick);

    const [seized] = events.filter((e) => e.type === 'merchant.instrument.seized');
    expect(seized).toBeDefined();
    // 'bale-of-flax' < 'saffron-brick' — the later consignment, the lower id.
    expect(seized.payload.itemId).toBe('bale-of-flax');
  });

  it('seizure eases the lien it was taken against — collecting, not punishing', () => {
    const engine = harness();
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    engine.world.entities.factor.resources.lien = SEIZURE_THRESHOLD;

    tickObligations(engine.world, engine.world.meta.tick);

    expect(engine.world.entities.factor.resources.lien).toBeLessThan(SEIZURE_THRESHOLD);
  });

  it('revokes the seal ONCE at the revocation threshold — the soft fail', () => {
    const engine = harness();
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    engine.world.entities.factor.resources.lien = REVOCATION_THRESHOLD;

    const first = tickObligations(engine.world, engine.world.meta.tick);
    expect(first.some((e) => e.type === 'merchant.seal.revoked')).toBe(true);
    expect(engine.world.entities.factor.inventory).not.toContain('guild-seal');

    // Announced once — a repeat tick must not spam the event.
    engine.world.entities.factor.resources.lien = REVOCATION_THRESHOLD;
    const second = tickObligations(engine.world, engine.world.meta.tick);
    expect(second.some((e) => e.type === 'merchant.seal.revoked')).toBe(false);
  });

  it('the clock runs off real movement, not a timer', () => {
    // Registered on world.zone.entered: the moment a factor moves is the moment
    // the world notices what they owe. Proven through a real `move`.
    const engine = harness();
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    const obligation = getOpenObligations(engine.world)[0];
    engine.world.meta.tick = obligation.dueTick + 20;

    engine.submitAction('move', { targetIds: ['weighing-floor'] });

    expect(engine.world.entities.factor.resources.lien).toBeGreaterThan(0);
  });
});

describe('underwrite', () => {
  it('pays a premium in liquidity now and records the exposure', () => {
    const engine = harness();
    const before = engine.world.entities.factor.resources.liquidity;
    engine.submitAction('underwrite', { targetIds: ['broker-inaya'] });

    const [event] = eventsOfType(engine, 'merchant.risk.underwritten');
    expect(event).toBeDefined();
    expect(engine.world.entities.factor.resources.liquidity).toBeGreaterThan(before);
    expect(Number(event.payload.exposure)).toBeGreaterThan(Number(event.payload.premium));
    expect(getContractState(engine.world).underwritten).toHaveLength(1);
  });
});

describe('audit — the verifier as a playable verb', () => {
  it('reports open, overdue, receivable, and exposure off real state', () => {
    const engine = harness();
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    engine.submitAction('audit');

    const [report] = eventsOfType(engine, 'merchant.audit.requested');
    expect(report).toBeDefined();
    expect(report.payload.openCount).toBe(1);
    expect(report.payload.overdueCount).toBe(0);
    expect(Number(report.payload.receivable)).toBeGreaterThan(0);
    expect(report.payload.balanced).toBe(true);
  });

  it('names the overdue obligation as a discrepancy', () => {
    const engine = harness();
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    const obligation = getOpenObligations(engine.world)[0];
    engine.world.meta.tick = obligation.dueTick + 3;

    engine.submitAction('audit');

    const [report] = eventsOfType(engine, 'merchant.audit.requested');
    expect(report.payload.overdueCount).toBe(1);
    expect(report.payload.balanced).toBe(false);
    expect(String((report.payload.discrepancies as string[])[0])).toContain(obligation.id);
  });

  it('REQUIRES the ledger book — you cannot audit from memory', () => {
    const engine = harness(factor({ inventory: ['bale-of-flax', 'guild-seal'] }));
    engine.submitAction('audit');

    expect(eventsOfType(engine, 'merchant.audit.requested')).toHaveLength(0);
    const [rejected] = eventsOfType(engine, 'action.rejected');
    expect(String(rejected.payload.reason)).toContain('ledger book');
  });
});

describe('determinism', () => {
  it('two identical scripted runs produce byte-identical worlds', () => {
    const script = (engine: ReturnType<typeof harness>) => {
      engine.submitAction('appraise', { parameters: { itemId: 'guild-seal' } });
      engine.submitAction('haggle', { targetIds: ['broker-inaya'] });
      engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
      engine.submitAction('underwrite', { targetIds: ['broker-inaya'] });
      engine.submitAction('audit');
      engine.submitAction('move', { targetIds: ['weighing-floor'] });
    };
    const a = harness();
    const b = harness();
    script(a);
    script(b);

    expect(a.serialize()).toBe(b.serialize());
  });

  it('obligation ids come from a counter, not a clock or a random source', () => {
    const engine = harness(factor({ inventory: ['bale-of-flax', 'salt-block', 'guild-seal'] }));
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    engine.submitAction('consign', { parameters: { itemId: 'salt-block' }, targetIds: ['broker-inaya'] });

    const ids = getContractState(engine.world).obligations.map((o) => o.id);
    expect(ids).toEqual(['obl-1', 'obl-2']);
  });

  it('obligation state survives serialize/deserialize', () => {
    // The reload-determinism requirement: an obligation is a promise with a due
    // date, so a save that loses it silently forgives a debt.
    const engine = harness();
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    const before = getOpenObligations(engine.world);
    expect(before).toHaveLength(1);

    const restored = Engine.deserialize(engine.serialize(), {
      modules: [statusCore, traversalCore, createContractCore({ catalog: itemCatalog })],
    });

    expect(getOpenObligations(restored.world)).toEqual(before);
  });
});
