import { beforeEach, describe, expect, it } from 'vitest';
import type {
  IssuedAmount,
  LedgerAdapterConfig,
  LedgerAdapterState,
  LedgerTransport,
  TradeableSnapshot,
  TrustLineInfo,
  TxEntry,
  TxResult,
  WalletHandle,
} from '../contracts.js';
import { createLedgerAdapter } from './adapter.js';
import { reconcile } from './reconcile.js';

// ── A MINIMAL in-memory fake LedgerTransport ────────────────────────────
// Deliberately NOT importing the real transport domain (out of bounds for
// this worktree) — just enough of the interface to exercise adapter.ts's
// enable/settle/retry logic against believable balance movement.

type FakeTransport = LedgerTransport & {
  /** `${address}:${currency}` -> balance. */
  balances: Map<string, number>;
  /** The next N transport-write calls (setAccountFlag/trustSet/payment/
   *  escrowCreate/escrowFinish) return a failure instead of succeeding. */
  failNext(times: number): void;
};

function createFakeTransport(): FakeTransport {
  let walletCounter = 0;
  let txCounter = 0;
  let failRemaining = 0;
  const seedToAddress = new Map<string, string>();
  const balances = new Map<string, number>();
  const pendingEscrows = new Map<number, { destination: string; currency: string; value: number }>();

  function balanceKey(address: string, currency: string): string {
    return `${address}:${currency}`;
  }
  function credit(address: string, currency: string, amount: number): void {
    balances.set(balanceKey(address, currency), (balances.get(balanceKey(address, currency)) ?? 0) + amount);
  }
  function debit(address: string, currency: string, amount: number): void {
    balances.set(balanceKey(address, currency), (balances.get(balanceKey(address, currency)) ?? 0) - amount);
  }
  function maybeFail(): TxResult | null {
    if (failRemaining > 0) {
      failRemaining--;
      return { ok: false, hash: '', code: 'tecFAKE_FAILURE', error: 'fake transport failure' };
    }
    return null;
  }
  function nextTx(): TxResult {
    txCounter++;
    return { ok: true, hash: `HASH${txCounter}`, code: 'tesSUCCESS', sequence: txCounter };
  }

  return {
    networkName: 'fake-dry-run',
    balances,
    failNext(times: number) {
      failRemaining = times;
    },

    async connect() {},
    async disconnect() {},

    async fundWallet(): Promise<WalletHandle> {
      walletCounter++;
      const address = `rFAKE${walletCounter}`;
      const seed = `sFAKE${walletCounter}`;
      seedToAddress.set(seed, address);
      return { address, seed };
    },

    walletFromSeed(seed: string): WalletHandle {
      const address = seedToAddress.get(seed);
      if (!address) throw new Error(`unknown seed: ${seed}`);
      return { address, seed };
    },

    async setAccountFlag(_seed: string, _flag: number): Promise<TxResult> {
      return maybeFail() ?? nextTx();
    },

    async trustSet(_seed: string, _issuer: string, _currency: string, _limit: string): Promise<TxResult> {
      return maybeFail() ?? nextTx();
    },

    async payment(_seed: string, destination: string, amount: IssuedAmount, _memo?: string): Promise<TxResult> {
      const failed = maybeFail();
      if (failed) return failed;
      credit(destination, amount.currency, Number(amount.value));
      return nextTx();
    },

    async escrowCreate(
      seed: string,
      destination: string,
      amount: IssuedAmount,
      _finishAfter: number,
      _cancelAfter: number,
      _memo?: string,
    ): Promise<TxResult> {
      const failed = maybeFail();
      if (failed) return failed;
      const sender = seedToAddress.get(seed);
      if (sender) debit(sender, amount.currency, Number(amount.value));
      const tx = nextTx();
      pendingEscrows.set(tx.sequence as number, {
        destination,
        currency: amount.currency,
        value: Number(amount.value),
      });
      return tx;
    },

    async escrowFinish(_seed: string, _owner: string, offerSequence: number): Promise<TxResult> {
      const failed = maybeFail();
      if (failed) return failed;
      const escrow = pendingEscrows.get(offerSequence);
      if (escrow) {
        credit(escrow.destination, escrow.currency, escrow.value);
        pendingEscrows.delete(offerSequence);
      }
      return nextTx();
    },

    async accountLines(_address: string): Promise<TrustLineInfo[]> {
      return [];
    },

    async accountTx(_address: string, _limit?: number): Promise<TxEntry[]> {
      return [];
    },
  };
}

function freshState(): LedgerAdapterState {
  return {
    mode: 'ledger',
    issuerMode: 'per-run',
    enabled: false,
    issuerAddress: '',
    playerAddress: '',
    merchantAddress: '',
    trustLinesReady: false,
    tokenMap: {},
    lastSettled: {},
    settlements: [],
    pending: [],
    lastSettleFailed: false,
  };
}

const CONFIG: LedgerAdapterConfig = {
  mode: 'ledger',
  issuerMode: 'per-run',
  settlement: 'token-escrow',
  network: 'testnet',
};

describe('createLedgerAdapter', () => {
  let transport: FakeTransport;

  beforeEach(() => {
    transport = createFakeTransport();
  });

  it('enable mints the snapshot; settle escrows a spend from player to merchant', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    const snapshot: TradeableSnapshot = { coin: 100, items: { potion: 5 } };

    const enableResult = await adapter.enable(state, snapshot);
    expect(enableResult.success).toBe(true);
    expect(state.enabled).toBe(true);
    expect(state.trustLinesReady).toBe(true);
    expect(state.lastSettled).toEqual({ coin: 100, potion: 5 });
    expect(transport.balances.get(`${state.playerAddress}:${state.tokenMap.coin}`)).toBe(100);
    expect(transport.balances.get(`${state.playerAddress}:${state.tokenMap.potion}`)).toBe(5);

    // Player spends 25 coin by the next checkpoint.
    const afterSpend: TradeableSnapshot = { coin: 75, items: { potion: 5 } };
    const settleResult = await adapter.settle(state, afterSpend, 1, 'Cedar Wake');

    expect(settleResult.success).toBe(true);
    expect(settleResult.record?.status).toBe('settled');
    expect(settleResult.record?.deltas).toEqual({ coin: -25 });
    expect(state.settlements).toHaveLength(1);
    expect(state.lastSettled).toEqual({ coin: 75, potion: 5 });
    expect(transport.balances.get(`${state.playerAddress}:${state.tokenMap.coin}`)).toBe(75);
    expect(transport.balances.get(`${state.merchantAddress}:${state.tokenMap.coin}`)).toBe(25);
  });

  it('settle grants a positive delta directly from issuer to player', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    const snapshot: TradeableSnapshot = { coin: 100, items: {} };
    await adapter.enable(state, snapshot);

    const afterGrant: TradeableSnapshot = { coin: 140, items: {} };
    const result = await adapter.settle(state, afterGrant, 1, 'Cedar Wake');

    expect(result.success).toBe(true);
    expect(result.record?.deltas).toEqual({ coin: 40 });
    expect(transport.balances.get(`${state.playerAddress}:${state.tokenMap.coin}`)).toBe(140);
  });

  it('idempotent enable: a second enable on a complete state is a no-op (no re-fund, no double mint)', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    const snapshot: TradeableSnapshot = { coin: 100, items: {} };

    await adapter.enable(state, snapshot);
    const playerAddress = state.playerAddress;
    const walletCountAfterFirst = transport.balances.get(`${playerAddress}:${state.tokenMap.coin}`);

    const second = await adapter.enable(state, snapshot);

    expect(second.success).toBe(true);
    expect(state.playerAddress).toBe(playerAddress);
    expect(transport.balances.get(`${playerAddress}:${state.tokenMap.coin}`)).toBe(walletCountAfterFirst);
  });

  it('disable then re-enable brings the same wallets back online without re-minting', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    const snapshot: TradeableSnapshot = { coin: 100, items: {} };
    await adapter.enable(state, snapshot);
    const playerAddress = state.playerAddress;

    adapter.disable(state);
    expect(state.enabled).toBe(false);

    const reenableResult = await adapter.enable(state, snapshot);
    expect(reenableResult.success).toBe(true);
    expect(state.enabled).toBe(true);
    expect(state.playerAddress).toBe(playerAddress);
    expect(transport.balances.get(`${playerAddress}:${state.tokenMap.coin}`)).toBe(100);
  });

  it('settle with no changes since the baseline returns a no-changes success and records nothing', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    const snapshot: TradeableSnapshot = { coin: 50, items: {} };
    await adapter.enable(state, snapshot);

    const result = await adapter.settle(state, snapshot, 1, 'Cedar Wake');

    expect(result.success).toBe(true);
    expect(result.message.toLowerCase()).toContain('no changes');
    expect(state.settlements).toHaveLength(0);
  });

  it('a failed settle queues a pending record and sets lastSettleFailed, without advancing the baseline', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    const snapshot: TradeableSnapshot = { coin: 100, items: {} };
    await adapter.enable(state, snapshot);

    transport.failNext(1); // fails the escrowCreate inside this settle
    const afterSpend: TradeableSnapshot = { coin: 70, items: {} };
    const result = await adapter.settle(state, afterSpend, 1, 'Cedar Wake');

    expect(result.success).toBe(false);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0].status).toBe('pending');
    expect(state.settlements).toHaveLength(0);
    expect(state.lastSettleFailed).toBe(true);
    expect(state.lastSettled).toEqual({ coin: 100 }); // baseline untouched on failure
  });

  it('CONSERVATION-ON-RETRY: a retried pending settlement is folded into the baseline exactly once', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    const snapshot: TradeableSnapshot = { coin: 100, items: {} };
    await adapter.enable(state, snapshot);
    const mintedInitial = { ...state.lastSettled };

    // First settle attempt fails at the transport level -> queued pending.
    transport.failNext(1);
    const afterSpend: TradeableSnapshot = { coin: 70, items: {} }; // spend 30
    const failedSettle = await adapter.settle(state, afterSpend, 1, 'Cedar Wake');
    expect(failedSettle.success).toBe(false);
    expect(state.pending).toHaveLength(1);
    expect(state.lastSettled).toEqual({ coin: 100 });

    // A later settle call retries pending FIRST; this time the transport
    // succeeds, so the retried record folds into the baseline.
    const secondSettle = await adapter.settle(state, afterSpend, 2, 'Cedar Wake');

    expect(state.pending).toHaveLength(0);
    expect(state.settlements).toHaveLength(1);
    expect(state.settlements[0].checkpoint).toBe(1); // the retried record, not a new one
    expect(state.settlements[0].deltas).toEqual({ coin: -30 });
    // Nothing NEW to settle since the baseline was just advanced by the retry.
    expect(secondSettle.success).toBe(true);
    expect(secondSettle.message.toLowerCase()).toContain('no changes');
    expect(state.lastSettled.coin).toBe(70); // 100 - 30, exactly once (not -60)

    // Drive the whole thing through reconcile(): a double-count bug would
    // break conservation (minted + Σdeltas !== settled) even though balances
    // "look" fine individually.
    const report = reconcile({
      runId: 'run-1',
      seed: 0,
      mintedInitial,
      ledgerBalances: { [state.tokenMap.coin]: state.lastSettled.coin },
      lastSettled: state.lastSettled,
      settlements: state.settlements,
      pending: state.pending,
    });

    expect(report.resources.find((r) => r.resource === 'coin')?.conservationOk).toBe(true);
    expect(report.resources.find((r) => r.resource === 'coin')?.sumDeltas).toBe(-30);
    expect(report.passed).toBe(true);
  });
});
