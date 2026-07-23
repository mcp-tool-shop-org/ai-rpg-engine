// THE FIREWALL TEST — the load-bearing proof for Phase 3 (the engine seam).
//
// Builds a real trade-core world via @ai-rpg-engine/core's createTestEngine
// (the same fixture shape packages/modules/src/trade-core.test.ts pins) and
// runs an IDENTICAL buy/sell action sequence on two independently-constructed
// engines. On one of them, the ledger adapter also reads a snapshot and
// settles a checkpoint against a DryRunTransport. The two engines' resulting
// `.world` must be deep-equal: the adapter's read + settle must not perturb
// the deterministic engine by so much as one field.
//
// `@ai-rpg-engine/core` and `@ai-rpg-engine/modules` are imported for REAL
// (runtime) here — that is fine and expected: this is a *.test.ts file, the
// one place this package's determinism-firewall rule explicitly allows it
// (see ../../src/engine/snapshot.ts / checkpoint.ts, whose non-test runtime
// code imports @ai-rpg-engine/core type-only only). The grep in this wave's
// acceptance check excludes *.test.ts for exactly this reason.

import { describe, expect, it } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, ZoneState } from '@ai-rpg-engine/core';
import {
  createEnvironmentCore,
  createDistrictCore,
  createEconomyCore,
  createTradeCore,
  SELL_BASE_VALUE,
  BUY_MARKUP_MULTIPLIER,
} from '@ai-rpg-engine/modules';
import type { LedgerAdapterConfig } from '../contracts.js';
import { createLedgerAdapter, reconcile } from '../settle/index.js';
import { createInitialState } from '../state/index.js';
import { DryRunTransport } from '../transport/index.js';
import { snapshotFromWorld } from './snapshot.js';
import { enableFromWorld, settleCheckpoint } from './checkpoint.js';

// ── Shared world fixture (mirrors trade-core.test.ts's makeSellEngine /
// makeBuyEngine exactly: a single neutral district with NO controllingFaction,
// so reputation/heat stay neutral and scarcity is the only price driver — the
// buy/sell numbers below are the same ones trade-core.test.ts itself pins). ──

const zones: ZoneState[] = [{ id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: [] }];
const districts = [{ id: 'district-1', name: 'Market', zoneIds: ['zone-a'], tags: [] }];

function makePlayer(coin: number, inventory: string[]): EntityState {
  return {
    id: 'player',
    blueprintId: 'player',
    type: 'player',
    name: 'Hero',
    tags: ['player'],
    stats: {},
    resources: { hp: 20, coin },
    statuses: [],
    zoneId: 'zone-a',
    inventory,
  };
}

function makeEngine(coin: number, inventory: string[]) {
  return createTestEngine({
    modules: [
      createEnvironmentCore(),
      createDistrictCore({ districts }),
      createEconomyCore({ districts: districts.map((d) => ({ id: d.id, tags: d.tags })) }),
      createTradeCore(),
    ],
    entities: [makePlayer(coin, inventory)],
    zones,
  });
}

const LEDGER_CONFIG: LedgerAdapterConfig = {
  mode: 'ledger',
  issuerMode: 'per-run',
  settlement: 'token-escrow',
  network: 'testnet',
};

/** Build a `currencyCode -> balance` map from the dry-run transport's own
 *  account_lines — exactly what a real testnet transport's accountLines
 *  would report, decimal-string balances converted to number. */
async function buildLedgerBalances(
  transport: DryRunTransport,
  address: string,
): Promise<Record<string, number>> {
  const lines = await transport.accountLines(address);
  const balances: Record<string, number> = {};
  for (const line of lines) balances[line.currency] = Number(line.balance);
  return balances;
}

// Baseline district, 'weapons' at 50 supply, no faction/pressures: buy price
// is SELL_BASE_VALUE(10) * BUY_MARKUP_MULTIPLIER(1.3) = 13, same arithmetic
// packages/modules/src/trade-core.test.ts's own buy-verb suite pins.
const SHORT_SWORD_PRICE = Math.round(SELL_BASE_VALUE * BUY_MARKUP_MULTIPLIER);

describe('THE FIREWALL — attaching the ledger adapter never perturbs the deterministic engine', () => {
  it('a run with the adapter enabled + settled at a checkpoint is byte-identical to the same run without it', async () => {
    const withoutAdapter = makeEngine(50, ['rum-barrel']);
    const withAdapter = makeEngine(50, ['rum-barrel']);

    const transport = new DryRunTransport();
    const adapter = createLedgerAdapter(transport, LEDGER_CONFIG, {
      gameId: 'firewall-game',
      runId: 'firewall-run',
    });
    const state = createInitialState(LEDGER_CONFIG);

    // Mint the STARTING snapshot before any trades (the realistic "ledger
    // mode turned on at run start" shape) — reads withAdapter.world, never
    // writes it.
    const enableResult = await enableFromWorld(withAdapter.world, 'player', adapter, state);
    expect(enableResult.success).toBe(true);

    // The IDENTICAL action sequence, submitted independently to both engines.
    for (const engine of [withoutAdapter, withAdapter]) {
      engine.submitAction('sell', { targetIds: ['rum-barrel'] });
      engine.submitAction('buy', { targetIds: ['short-sword'] });
    }

    // Settle at a checkpoint AFTER the trades: snapshotFromWorld reads
    // withAdapter.world one more time, then the adapter escrows/pays against
    // its OWN transport + state — never against withAdapter.world itself.
    const settleResult = await settleCheckpoint(withAdapter.world, 'player', adapter, state, 1, 'Market Row');
    expect(settleResult.success).toBe(true);

    // THE FIREWALL: the adapter-attached run must be byte-identical to the
    // adapter-free run — reading + settling perturbed nothing.
    expect(withAdapter.world).toEqual(withoutAdapter.world);
  });
});

describe('snapshotFromWorld — correctness against a real trade', () => {
  it('reflects the exact coin balance and a duplicate-aware inventory tally after a sell', () => {
    const engine = makeEngine(0, ['rum-barrel', 'rum-barrel', 'trinket']);

    engine.submitAction('sell', { targetIds: ['rum-barrel'] });

    // One 'rum-barrel' sold (credited + removed); the second 'rum-barrel'
    // and the untouched 'trinket' must both still be tallied.
    expect(snapshotFromWorld(engine.world, 'player')).toEqual({
      coin: SELL_BASE_VALUE,
      items: { 'rum-barrel': 1, trinket: 1 },
    });
  });

  it('returns a zeroed snapshot for a missing player entity', () => {
    const engine = makeEngine(50, ['rum-barrel']);
    expect(snapshotFromWorld(engine.world, 'nobody-here')).toEqual({ coin: 0, items: {} });
  });

  it('tallies a missing inventory as {} while still reading coin normally off resources', () => {
    const engine = createTestEngine({
      modules: [
        createEnvironmentCore(),
        createDistrictCore({ districts }),
        createEconomyCore({ districts: districts.map((d) => ({ id: d.id, tags: d.tags })) }),
        createTradeCore(),
      ],
      entities: [
        {
          id: 'player',
          blueprintId: 'player',
          type: 'player',
          name: 'Hero',
          tags: ['player'],
          stats: {},
          resources: { hp: 20, coin: 30 },
          statuses: [],
          zoneId: 'zone-a',
          // inventory intentionally omitted — it is optional on EntityState.
        },
      ],
      zones,
    });

    expect(snapshotFromWorld(engine.world, 'player')).toEqual({ coin: 30, items: {} });
  });
});

describe('integration — settleCheckpoint settles the net trade delta, reconcile passes', () => {
  it('settles coin + inventory deltas on the dry-run ledger and reconcile reports passed: true', async () => {
    const engine = makeEngine(50, ['rum-barrel']);

    const transport = new DryRunTransport();
    const adapter = createLedgerAdapter(transport, LEDGER_CONFIG, {
      gameId: 'integration-game',
      runId: 'integration-run',
    });
    const state = createInitialState(LEDGER_CONFIG);

    await enableFromWorld(engine.world, 'player', adapter, state);
    const mintedInitial = { ...state.lastSettled };
    expect(mintedInitial).toEqual({ coin: 50, 'rum-barrel': 1 });

    engine.submitAction('sell', { targetIds: ['rum-barrel'] }); // +10 coin, -rum-barrel
    engine.submitAction('buy', { targetIds: ['short-sword'] }); // -13 coin, +short-sword

    expect(engine.world.entities.player.resources.coin).toBe(50 + SELL_BASE_VALUE - SHORT_SWORD_PRICE);
    expect(engine.world.entities.player.inventory).toEqual(['short-sword']);

    const settleResult = await settleCheckpoint(engine.world, 'player', adapter, state, 1, 'Market Row');

    expect(settleResult.success).toBe(true);
    expect(settleResult.record?.status).toBe('settled');
    expect(settleResult.record?.deltas).toEqual({
      coin: SELL_BASE_VALUE - SHORT_SWORD_PRICE,
      'rum-barrel': -1,
      'short-sword': 1,
    });
    expect(state.pending).toHaveLength(0);

    const ledgerBalances = await buildLedgerBalances(transport, state.playerAddress);

    const report = reconcile({
      runId: 'integration-run',
      seed: 0,
      mintedInitial,
      ledgerBalances,
      lastSettled: state.lastSettled,
      settlements: state.settlements,
      pending: state.pending,
      playerAddress: state.playerAddress,
      issuerAddress: state.issuerAddress,
      // The adapter's OWN minted codes (state.tokenMap), so reconcile looks
      // up ledgerBalances by the exact currency codes that reached the
      // ledger — same convention adapter.test.ts's own reconcile call uses.
      tokenMap: state.tokenMap,
    });

    expect(report.passed).toBe(true);
    expect(report.resources.every((r) => r.balanceOk && r.conservationOk)).toBe(true);
    expect(report.memoOk).toBe(true);
    expect(report.pendingCount).toBe(0);
  });
});
