import { describe, expect, it } from 'vitest';
import type { ResolvedEvent, WorldState } from '@ai-rpg-engine/core';
import { inferSettleOptionsFromWorld, settleCheckpoint } from './checkpoint.js';
import { createLedgerAdapter } from '../settle/adapter.js';
import { createInitialState } from '../state/index.js';
import { DryRunTransport } from '../transport/dry-run.js';
import type { LedgerAdapterConfig } from '../contracts.js';

function event(type: string, payload: Record<string, unknown> = {}, actorId = 'player'): ResolvedEvent {
  return { id: type, tick: 0, type, actorId, payload };
}

function world(overrides: Partial<WorldState> = {}): WorldState {
  return {
    meta: {
      worldId: 'w',
      gameId: 'g',
      saveVersion: '1',
      tick: 0,
      seed: 1,
      activeRuleset: 'test',
      activeModules: [],
      idCounter: 0,
    },
    playerId: 'player',
    locationId: 'zone-a',
    entities: {
      player: {
        id: 'player',
        blueprintId: 'player',
        type: 'player',
        name: 'Hero',
        tags: ['player'],
        stats: {},
        resources: { coin: 40 },
        statuses: [],
        zoneId: 'zone-a',
        inventory: [],
      },
    },
    zones: {
      'zone-a': { id: 'zone-a', roomId: 'a', name: 'A', tags: [], neighbors: [] },
    },
    quests: {},
    factions: {},
    globals: {},
    modules: {},
    eventLog: [],
    pending: [],
    ...overrides,
  };
}

describe('inferSettleOptionsFromWorld', () => {
  it('reads the most recent buy/sell/consign/default from action.resolved', () => {
    const w = world({
      eventLog: [
        event('action.resolved', { verb: 'sell' }),
        event('action.resolved', { verb: 'buy' }),
      ],
    });
    expect(inferSettleOptionsFromWorld(w, 'player').verb).toBe('buy');
  });

  it('maps merchant contract events onto consign / default / settle', () => {
    expect(
      inferSettleOptionsFromWorld(
        world({ eventLog: [event('merchant.contract.consigned')] }),
        'player',
      ).verb,
    ).toBe('consign');
    expect(
      inferSettleOptionsFromWorld(
        world({ eventLog: [event('merchant.contract.defaulted')] }),
        'player',
      ).verb,
    ).toBe('default');
    expect(
      inferSettleOptionsFromWorld(
        world({
          eventLog: [
            event('merchant.contract.consigned'),
            event('merchant.contract.honoured'),
          ],
        }),
        'player',
      ).verb,
    ).toBe('settle');
  });

  it('infers payment from unbonded/contested district tags and escrow from lawful', () => {
    const warrens = world({
      entities: {
        player: {
          id: 'player',
          blueprintId: 'player',
          type: 'player',
          name: 'Hero',
          tags: ['player'],
          stats: {},
          resources: { coin: 40 },
          statuses: [],
          zoneId: 'crooked-stair',
          inventory: [],
        },
      },
      zones: {
        'crooked-stair': {
          id: 'crooked-stair',
          roomId: 'warrens',
          name: 'The Crooked Stair',
          tags: [],
          neighbors: [],
        },
      },
      modules: {
        'district-core': {
          zoneToDistrict: { 'crooked-stair': 'the-warrens' },
          definitions: { 'the-warrens': { tags: ['unbonded', 'contested'] } },
        },
      },
      eventLog: [event('action.resolved', { verb: 'sell' })],
    });
    expect(inferSettleOptionsFromWorld(warrens, 'player')).toEqual({
      verb: 'sell',
      primitive: 'payment',
    });

    const lawful = world({
      modules: {
        'district-core': {
          zoneToDistrict: { 'zone-a': 'saltgate' },
          definitions: { saltgate: { tags: ['lawful', 'trade'] } },
        },
      },
      eventLog: [event('action.resolved', { verb: 'sell' })],
    });
    expect(inferSettleOptionsFromWorld(lawful, 'player').primitive).toBe('token-escrow');
  });

  it('settleCheckpoint uses inferred verb when options are omitted and honours an explicit override', async () => {
    const transport = new DryRunTransport();
    const config: LedgerAdapterConfig = {
      mode: 'ledger',
      issuerMode: 'per-run',
      settlement: 'token-escrow',
      network: 'testnet',
    };
    const adapter = createLedgerAdapter(transport, config, { gameId: 'g', runId: 'r1' });
    const state = createInitialState(config);
    await adapter.enable(state, { coin: 40, items: { 'bale-of-flax': 1 } });

    const afterConsign = world({
      entities: {
        player: {
          id: 'player',
          blueprintId: 'player',
          type: 'player',
          name: 'Hero',
          tags: ['player'],
          stats: {},
          resources: { coin: 40 },
          statuses: [],
          zoneId: 'zone-a',
          inventory: [],
        },
      },
      eventLog: [event('action.resolved', { verb: 'consign' })],
    });
    const inferred = await settleCheckpoint(afterConsign, 'player', adapter, state, 1, 'The Crooked Stair');
    expect(inferred.success).toBe(true);
    expect(inferred.record?.verb).toBe('consign');
    expect(inferred.record?.memo).toContain('VERB:consign');

    const afterBuy = world({
      entities: {
        player: {
          id: 'player',
          blueprintId: 'player',
          type: 'player',
          name: 'Hero',
          tags: ['player'],
          stats: {},
          resources: { coin: 30 },
          statuses: [],
          zoneId: 'zone-a',
          inventory: [],
        },
      },
      eventLog: [event('action.resolved', { verb: 'buy' })],
    });
    const overridden = await settleCheckpoint(
      afterBuy,
      'player',
      adapter,
      state,
      2,
      'Market Row',
      { verb: 'sell' },
    );
    expect(overridden.record?.verb).toBe('sell');
    expect(overridden.record?.memo).toContain('VERB:sell');
  });
});
