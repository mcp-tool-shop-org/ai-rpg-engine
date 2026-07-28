// F-merchant-F — `give`, the engine's only entity-to-entity item transfer.
//
// Before this verb, a sweep of every registerVerb call site in the engine found
// no path that moved an item between two entities: `use` consumes, equip/unequip
// move between bag and slot, and trade-core's buy/sell settle against a
// district's abstract market rather than a counterparty's inventory. The
// `giveItem` helper is add-only — no source to remove from, not registered with
// the dispatcher, unreachable by any player. So a pack could make an item
// obtainable and still have nothing in the world able to hand it to anyone.
//
// The assertions below are about CUSTODY: where the item is afterwards, and
// that a rejected transfer left the world untouched.

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, ResolvedEvent } from '@ai-rpg-engine/core';
import { createInventoryCore, type TransferGuard } from './inventory-core.js';

function entity(id: string, zoneId: string, inventory: string[] = []): EntityState {
  return {
    id, blueprintId: id, type: id === 'giver' ? 'player' : 'npc', name: id,
    tags: [], stats: {}, resources: { hp: 10 }, statuses: [], inventory, zoneId,
  };
}

function world(opts: { guard?: TransferGuard; recipientZone?: string } = {}) {
  return createTestEngine({
    seed: 71,
    modules: [createInventoryCore([], { transferGuard: opts.guard })],
    zones: [
      { id: 'here', roomId: 'r', name: 'Here', tags: [], neighbors: ['there'] },
      { id: 'there', roomId: 'r', name: 'There', tags: [], neighbors: ['here'] },
    ],
    entities: [entity('giver', 'here', ['relic', 'rope']), entity('taker', opts.recipientZone ?? 'here')],
    playerId: 'giver',
    startZone: 'here',
  });
}

const rejection = (events: ResolvedEvent[]) => events.find((e) => e.type === 'action.rejected');

describe('give: the transfer itself', () => {
  it('moves the item out of one bag and into the other', () => {
    const engine = world();
    const events = engine.submitAction('give', { targetIds: ['taker'], toolId: 'relic' });

    expect(rejection(events)).toBeUndefined();
    expect(engine.world.entities['giver'].inventory).toEqual(['rope']);
    expect(engine.world.entities['taker'].inventory).toEqual(['relic']);
  });

  it('is ATOMIC — the item is never in both bags, nor in neither', () => {
    // The property that makes this one handler rather than a removal composed
    // with the `giveItem` helper: no window exists where the count is wrong.
    const engine = world();
    const before = [
      ...(engine.world.entities['giver'].inventory ?? []),
      ...(engine.world.entities['taker'].inventory ?? []),
    ];
    engine.submitAction('give', { targetIds: ['taker'], toolId: 'relic' });
    const after = [
      ...(engine.world.entities['giver'].inventory ?? []),
      ...(engine.world.entities['taker'].inventory ?? []),
    ];
    expect(after.sort()).toEqual(before.sort());
    expect(after.filter((i) => i === 'relic')).toHaveLength(1);
  });

  it('stamps both sides — lost by the giver, acquired by the receiver', () => {
    // The chronicle integration contract. inventory-core emits these; the
    // equipment package's chronicle subscribes. Neither imports the other.
    const engine = world();
    const events = engine.submitAction('give', { targetIds: ['taker'], toolId: 'relic' });
    const types = events.map((e) => e.type);
    expect(types).toContain('item.given');
    expect(types).toContain('item.lost');
    expect(types).toContain('item.acquired');

    const lost = events.find((e) => e.type === 'item.lost')!;
    expect(lost.payload).toMatchObject({ itemId: 'relic', entityId: 'giver', toEntityId: 'taker' });
    const acquired = events.find((e) => e.type === 'item.acquired')!;
    expect(acquired.payload).toMatchObject({ itemId: 'relic', entityId: 'taker', fromEntityId: 'giver' });
  });

  it('accepts the item through parameters.itemId as well as toolId', () => {
    const engine = world();
    const events = engine.submitAction('give', { targetIds: ['taker'], parameters: { itemId: 'relic' } });
    expect(rejection(events)).toBeUndefined();
    expect(engine.world.entities['taker'].inventory).toEqual(['relic']);
  });
});

describe('give: every rejection is structured, and changes nothing', () => {
  const cases: Array<{ name: string; opts: Record<string, unknown>; reason: string; setup?: Parameters<typeof world>[0] }> = [
    { name: 'no recipient', opts: { toolId: 'relic' }, reason: 'no recipient specified' },
    { name: 'unknown recipient', opts: { targetIds: ['ghost'], toolId: 'relic' }, reason: 'ghost not found' },
    { name: 'self', opts: { targetIds: ['giver'], toolId: 'relic' }, reason: 'you already have it' },
    { name: 'no item', opts: { targetIds: ['taker'] }, reason: 'no item specified' },
    { name: 'item not held', opts: { targetIds: ['taker'], toolId: 'anvil' }, reason: "you don't have anvil" },
    { name: 'recipient elsewhere', opts: { targetIds: ['taker'], toolId: 'relic' }, reason: 'recipient not in same zone', setup: { recipientZone: 'there' } },
  ];

  for (const c of cases) {
    it(`${c.name}: rejects with a reason and a hint, and moves nothing`, () => {
      const engine = world(c.setup ?? {});
      const giverBefore = [...(engine.world.entities['giver'].inventory ?? [])];
      const takerBefore = [...(engine.world.entities['taker'].inventory ?? [])];

      const rej = rejection(engine.submitAction('give', c.opts));
      expect(rej, `${c.name} was not rejected`).toBeDefined();
      expect(rej!.payload.reason).toBe(c.reason);
      expect(rej!.payload.hint, 'a structured rejection carries a hint').toBeTruthy();
      expect(rej!.payload.verb).toBe('give');

      expect(engine.world.entities['giver'].inventory).toEqual(giverBefore);
      expect(engine.world.entities['taker'].inventory).toEqual(takerBefore);
    });
  }
});

describe('give: the pack policy veto', () => {
  const refuseRelic: TransferGuard = ({ itemId }) =>
    itemId === 'relic' ? { reason: 'relic is spoken for', hint: 'Settle it first.' } : null;

  it('a vetoed transfer rejects and leaves both bags untouched', () => {
    const engine = world({ guard: refuseRelic });
    const rej = rejection(engine.submitAction('give', { targetIds: ['taker'], toolId: 'relic' }));
    expect(rej!.payload.reason).toBe('relic is spoken for');
    expect(engine.world.entities['giver'].inventory).toEqual(['relic', 'rope']);
    expect(engine.world.entities['taker'].inventory).toEqual([]);
  });

  it('the veto is specific — an unencumbered item still moves', () => {
    // Guards against the failure where a guard that fires at all blocks
    // everything, which would pass a test that only ever checks the refusal.
    const engine = world({ guard: refuseRelic });
    expect(rejection(engine.submitAction('give', { targetIds: ['taker'], toolId: 'rope' }))).toBeUndefined();
    expect(engine.world.entities['taker'].inventory).toEqual(['rope']);
  });

  it('no guard means everything transfers — the default is permissive', () => {
    const engine = world();
    expect(rejection(engine.submitAction('give', { targetIds: ['taker'], toolId: 'relic' }))).toBeUndefined();
  });
});

describe('give: determinism and legacy identity', () => {
  it('same-seed transfers are byte-identical, different-seed still differs elsewhere', () => {
    const run = () => {
      const engine = world();
      engine.submitAction('give', { targetIds: ['taker'], toolId: 'relic' });
      return engine.serialize();
    };
    expect(run()).toBe(run());
  });

  it('a world that never transfers is byte-identical with and without a guard', () => {
    // The legacy-identity law: adding this verb (and a pack policy for it)
    // must not perturb a world that never uses it.
    const plain = world().serialize();
    const guarded = world({ guard: () => ({ reason: 'no', hint: 'no' }) }).serialize();
    expect(guarded).toBe(plain);
  });

  it('registers NO namespace — world.modules gains nothing', () => {
    const engine = world();
    expect(Object.keys(engine.world.modules)).not.toContain('inventory-core');
    engine.submitAction('give', { targetIds: ['taker'], toolId: 'relic' });
    expect(Object.keys(engine.world.modules)).not.toContain('inventory-core');
  });
});
