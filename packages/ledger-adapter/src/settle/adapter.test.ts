import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import { createInitialState, serializeState, deserializeState } from '../state/index.js';
import { DEFAULT_LEDGER_CONFIG } from '../index.js';
import { bindSidecar } from '../security/secrets.js';
import { accountExplorerUrl, nftExplorerUrl, txExplorerUrl } from '../contracts.js';

// ── A MINIMAL in-memory fake LedgerTransport ────────────────────────────
// Deliberately NOT importing the real transport domain (out of bounds for
// this worktree) — just enough of the interface to exercise adapter.ts's
// enable/settle/retry logic against believable balance movement.

type FakeTransport = LedgerTransport & {
  /** How many wallets `fundWallet` has issued. */
  readonly fundedWallets: number;
  /** `${address}:${currency}` -> balance. */
  balances: Map<string, number>;
  /** The next N transport-write calls (setAccountFlag/trustSet/payment/
   *  escrowCreate/escrowFinish) return a failure instead of succeeding. */
  failNext(times: number): void;
  /** The Nth subsequent write (1-indexed, counting from this call) fails.
   *  Used to fail the second mint / second resource without failing the first. */
  failOnNth(n: number): void;
  /** Next escrowCreate tesSUCCESS's, debits, and records the escrow, but
   *  omits `sequence` from the returned TxResult (the tesSUCCESS-without-
   *  sequence hatch). OfferSequence remains recoverable via accountTx. */
  omitNextEscrowSequence(): void;
  /** Next escrowCreate debits the holder then returns ok:false with no hash
   *  — a create that tesSUCCESS'd on-ledger and timed out before checkpoint. */
  debitThenFailNextEscrowCreate(): void;
  /** When true, accountTx strips `sequence` from EscrowCreate entries so a
   *  retry must fail closed until the index lands. */
  hideSequenceFromAccountTx(hide: boolean): void;
  /** True once `address` has opened a trust line for `currency`. Models the
   *  live-XRPL rule the mint path below enforces (a mint to an un-trust-lined
   *  holder fails tecPATH_DRY) — the fidelity the LIVE pirate replay needed to
   *  surface the incremental-trust-line gap the dry-run path structurally hid. */
  trustedFor(address: string, currency: string): boolean;
  /** txid -> the memo that tx carried, so a diary reconcile can read the
   *  anchor chain back off the (fake) ledger rather than trusting state. */
  memoFor(txid: string): string | undefined;
  /** Ordered log of write-method names, so a test can assert the SHAPE of the
   *  tx sequence a settlement produced (not merely its net balance effect).
   *  Needed to prove the `payment` primitive is materially different from
   *  `token-escrow` rather than a config flag with no behavioral consequence. */
  calls: string[];
};

function createFakeTransport(networkName = 'fake-dry-run'): FakeTransport {
  let walletCounter = 0;
  let txCounter = 0;
  let failRemaining = 0;
  let writeCount = 0;
  let failAt: number | null = null;
  let omitSequenceOnce = false;
  let debitThenFailOnce = false;
  let hideAccountTxSequence = false;
  const seedToAddress = new Map<string, string>();
  const balances = new Map<string, number>();
  const issuersByCurrency = new Map<string, string>();
  // `${holder}:${currency}` for every opened trust line — modeled so the mint
  // path can enforce live XRPL's "no line -> tecPATH_DRY" rule (see trustedFor).
  const trustLines = new Set<string>();
  /** txid -> memo, so a diary test can read its own anchor chain back. */
  const memos = new Map<string, string>();
  const pendingEscrows = new Map<number, { destination: string; currency: string; value: number }>();
  const calls: string[] = [];
  const txLog: TxEntry[] = [];

  function balanceKey(address: string, currency: string): string {
    return `${address}:${currency}`;
  }
  function credit(address: string, currency: string, amount: number, issuer?: string): void {
    balances.set(balanceKey(address, currency), (balances.get(balanceKey(address, currency)) ?? 0) + amount);
    if (issuer) issuersByCurrency.set(currency, issuer);
  }
  function debit(address: string, currency: string, amount: number): void {
    balances.set(balanceKey(address, currency), (balances.get(balanceKey(address, currency)) ?? 0) - amount);
  }
  function maybeFail(): TxResult | null {
    writeCount++;
    if (failAt !== null && writeCount === failAt) {
      failAt = null;
      return { ok: false, hash: '', code: 'tecFAKE_FAILURE', error: 'fake transport failure' };
    }
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
    networkName,
    balances,
    calls,
    failNext(times: number) {
      failRemaining = times;
    },
    failOnNth(n: number) {
      writeCount = 0;
      failAt = n;
    },
    omitNextEscrowSequence() {
      omitSequenceOnce = true;
    },
    debitThenFailNextEscrowCreate() {
      debitThenFailOnce = true;
    },
    hideSequenceFromAccountTx(hide: boolean) {
      hideAccountTxSequence = hide;
    },
    memoFor(txid: string): string | undefined {
      return memos.get(txid);
    },

    trustedFor(address: string, currency: string): boolean {
      return trustLines.has(`${address}:${currency}`);
    },

    get fundedWallets() {
      return walletCounter;
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

    async trustSet(seed: string, _issuer: string, currency: string, _limit: string): Promise<TxResult> {
      const failed = maybeFail();
      if (failed) return failed;
      const holder = seedToAddress.get(seed);
      if (holder) trustLines.add(`${holder}:${currency}`);
      return nextTx();
    },

    async anchorMemo(_seed: string, memo: string): Promise<TxResult> {
      calls.push('anchorMemo');
      const failed = maybeFail();
      if (failed) return failed;
      const tx = nextTx();
      memos.set(tx.hash, memo);
      return tx;
    },

    async payment(_seed: string, destination: string, amount: IssuedAmount, _memo?: string): Promise<TxResult> {
      calls.push('payment');
      const failed = maybeFail();
      if (failed) return failed;
      // BURN direction (holder -> issuer of that same currency). Live XRPL
      // treats returning an issued currency to its issuer as redemption: the
      // holder's balance is destroyed and NO trust line is required on the
      // issuer, which never trust-lines its own token. The blanket
      // trust-line check below models the MINT direction only; applying it to
      // a burn would fail tecPATH_DRY for a transaction the real ledger
      // accepts. This is the path the `payment` settlement primitive uses.
      if (destination === amount.issuer) {
        const sender = seedToAddress.get(_seed);
        if (sender) debit(sender, amount.currency, Number(amount.value));
        return nextTx();
      }
      // Live-XRPL fidelity: an issued-currency Payment to a holder that never
      // opened a trust line for this currency fails tecPATH_DRY. The real mint
      // in enable()/settle() always trust-lines the holder first (settle()'s
      // incremental ensureTrustLinesFor is the Phase-5 fix); a mint that lands
      // here without a line is the regression this models.
      if (!trustLines.has(`${destination}:${amount.currency}`)) {
        return { ok: false, hash: '', code: 'tecPATH_DRY', error: `No trust line: ${destination} for ${amount.currency}` };
      }
      credit(destination, amount.currency, Number(amount.value), amount.issuer);
      return nextTx();
    },

    async escrowCreate(
      seed: string,
      destination: string,
      amount: IssuedAmount,
      _finishAfter: number,
      _cancelAfter: number,
      memo?: string,
    ): Promise<TxResult> {
      calls.push('escrowCreate');
      const sender = seedToAddress.get(seed);
      const landCreate = (): TxResult => {
        if (sender) debit(sender, amount.currency, Number(amount.value));
        issuersByCurrency.set(amount.currency, amount.issuer);
        const tx = nextTx();
        pendingEscrows.set(tx.sequence as number, {
          destination,
          currency: amount.currency,
          value: Number(amount.value),
        });
        const entry: TxEntry = {
          hash: tx.hash,
          type: 'EscrowCreate',
          sequence: tx.sequence,
          destination,
          currency: amount.currency,
          value: amount.value,
        };
        if (memo !== undefined) {
          entry.memo = memo;
          memos.set(tx.hash, memo);
        }
        txLog.push(entry);
        return tx;
      };
      if (debitThenFailOnce) {
        debitThenFailOnce = false;
        landCreate();
        return { ok: false, hash: '', code: 'telNETWORK', error: 'timeout after tesSUCCESS' };
      }
      const failed = maybeFail();
      if (failed) return failed;
      const tx = landCreate();
      if (omitSequenceOnce) {
        omitSequenceOnce = false;
        return { ok: true, hash: tx.hash, code: tx.code };
      }
      return tx;
    },

    async escrowFinish(_seed: string, _owner: string, offerSequence: number): Promise<TxResult> {
      calls.push('escrowFinish');
      const failed = maybeFail();
      if (failed) return failed;
      const escrow = pendingEscrows.get(offerSequence);
      if (escrow) {
        credit(escrow.destination, escrow.currency, escrow.value, issuersByCurrency.get(escrow.currency));
        pendingEscrows.delete(offerSequence);
      }
      return nextTx();
    },

    async accountLines(address: string): Promise<TrustLineInfo[]> {
      const prefix = `${address}:`;
      const lines: TrustLineInfo[] = [];
      for (const [key, balance] of balances) {
        if (!key.startsWith(prefix)) continue;
        const currency = key.slice(prefix.length);
        lines.push({
          account: issuersByCurrency.get(currency) ?? '',
          currency,
          balance: String(balance),
          limit: '999999999',
        });
      }
      return lines;
    },

    async accountTx(_address: string, _limit?: number): Promise<TxEntry[]> {
      if (!hideAccountTxSequence) return txLog.map((e) => ({ ...e }));
      return txLog.map((e) => {
        const { sequence: _sequence, ...rest } = e;
        return rest;
      });
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

  it('enable checkpoints each mint: failing the second resource does not remint the first on retry', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    const snapshot: TradeableSnapshot = { coin: 100, items: { potion: 5 } };

    // 2 AccountSet flags + 4 TrustSets (player+merchant × coin+potion) + coin mint, then potion mint fails.
    transport.failOnNth(8);
    const first = await adapter.enable(state, snapshot);
    expect(first.success).toBe(false);
    expect(state.lastSettled).toEqual({ coin: 100 });
    expect(transport.balances.get(`${state.playerAddress}:${state.tokenMap.coin}`)).toBe(100);

    const second = await adapter.enable(state, snapshot);
    expect(second.success).toBe(true);
    expect(transport.balances.get(`${state.playerAddress}:${state.tokenMap.coin}`)).toBe(100);
    expect(transport.balances.get(`${state.playerAddress}:${state.tokenMap.potion}`)).toBe(5);
    expect(state.lastSettled).toEqual({ coin: 100, potion: 5 });
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
      // Thread the adapter's OWN minted codes so reconcile looks up
      // ledgerBalances by state.tokenMap.coin (a valid 3-char code from
      // assignTokenCode) rather than a re-derived 4-char 'COIN' (wave-2 fix).
      tokenMap: state.tokenMap,
    });

    expect(report.resources.find((r) => r.resource === 'coin')?.conservationOk).toBe(true);
    expect(report.resources.find((r) => r.resource === 'coin')?.sumDeltas).toBe(-30);
    expect(report.passed).toBe(true);
  });

  it('two consecutive settle failures with an intervening snapshot change do not overlap deltas', async () => {
    // Town spend fails (pending coin-30). Player keeps playing; market snapshot
    // is coin-50 vs lastSettled 100. A second pending of -50 alongside the
    // first -30 would execute both on recovery and break conservation.
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    await adapter.enable(state, { coin: 100, items: {} });
    const mintedInitial = { ...state.lastSettled };

    transport.failNext(1);
    const town = await adapter.settle(state, { coin: 70, items: {} }, 1, 'town');
    expect(town.success).toBe(false);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0].deltas).toEqual({ coin: -30 });
    expect(state.lastSettled).toEqual({ coin: 100 });

    transport.failNext(1);
    const market = await adapter.settle(state, { coin: 50, items: {} }, 2, 'market');
    expect(market.success).toBe(false);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0].deltas).toEqual({ coin: -30 });
    expect(state.lastSettled).toEqual({ coin: 100 });
    expect(state.settlements).toHaveLength(0);

    const recovered = await adapter.settle(state, { coin: 50, items: {} }, 3, 'market');
    expect(recovered.success).toBe(true);
    expect(state.pending).toHaveLength(0);
    expect(state.lastSettled.coin).toBe(50);
    expect(transport.balances.get(`${state.playerAddress}:${state.tokenMap.coin}`)).toBe(50);
    expect(state.settlements.map((r) => r.deltas.coin)).toEqual([-30, -20]);

    const report = reconcile({
      runId: 'run-1',
      seed: 0,
      mintedInitial,
      ledgerBalances: { [state.tokenMap.coin]: 50 },
      lastSettled: state.lastSettled,
      settlements: state.settlements,
      pending: state.pending,
      tokenMap: state.tokenMap,
    });
    expect(report.resources.find((r) => r.resource === 'coin')?.conservationOk).toBe(true);
    expect(report.resources.find((r) => r.resource === 'coin')?.sumDeltas).toBe(-50);
    expect(report.passed).toBe(true);
  });

  it('retryPending does not replay a key that already landed when a later key fails', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    await adapter.enable(state, { coin: 100, items: { potion: 5 } });

    // Spend both keys. token-escrow: escrowCreate+escrowFinish for coin, then potion create fails.
    transport.failOnNth(3);
    const failed = await adapter.settle(state, { coin: 90, items: { potion: 4 } }, 1, 'Cedar Wake');
    expect(failed.success).toBe(false);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0].receipts?.coin?.done).toBe(true);
    expect(transport.balances.get(`${state.playerAddress}:${state.tokenMap.coin}`)).toBe(90);
    expect(transport.balances.get(`${state.playerAddress}:${state.tokenMap.potion}`)).toBe(5);

    const retried = await adapter.settle(state, { coin: 90, items: { potion: 4 } }, 2, 'Cedar Wake');
    expect(retried.success).toBe(true);
    expect(state.pending).toHaveLength(0);
    expect(transport.balances.get(`${state.playerAddress}:${state.tokenMap.coin}`)).toBe(90);
    expect(transport.balances.get(`${state.playerAddress}:${state.tokenMap.potion}`)).toBe(4);
    expect(state.lastSettled).toEqual({ coin: 90, potion: 4 });
  });

  it('tesSUCCESS without sequence persists hash, recovers OfferSequence from account_tx, and never EscrowCreates again', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    await adapter.enable(state, { coin: 100, items: {} });
    const mintedInitial = { ...state.lastSettled };

    transport.omitNextEscrowSequence();
    transport.calls.length = 0;
    const failed = await adapter.settle(state, { coin: 70, items: {} }, 1, 'Cedar Wake');

    expect(failed.success).toBe(false);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]!.receipts?.coin?.sequence).toBeUndefined();
    expect(state.pending[0]!.receipts?.coin?.txids.length).toBeGreaterThan(0);
    expect(state.lastSettled).toEqual({ coin: 100 });
    expect(transport.calls.filter((c) => c === 'escrowCreate')).toHaveLength(1);
    expect(transport.balances.get(`${state.playerAddress}:${state.tokenMap.coin}`)).toBe(70);

    const retried = await adapter.settle(state, { coin: 70, items: {} }, 2, 'Cedar Wake');

    expect(retried.success).toBe(true);
    expect(state.pending).toHaveLength(0);
    expect(transport.calls.filter((c) => c === 'escrowCreate')).toHaveLength(1);
    expect(transport.balances.get(`${state.playerAddress}:${state.tokenMap.coin}`)).toBe(70);
    expect(transport.balances.get(`${state.merchantAddress}:${state.tokenMap.coin}`)).toBe(30);
    expect(state.lastSettled.coin).toBe(70);

    const report = reconcile({
      runId: 'run-1',
      seed: 0,
      mintedInitial,
      ledgerBalances: { [state.tokenMap.coin]: 70 },
      lastSettled: state.lastSettled,
      settlements: state.settlements,
      pending: state.pending,
      tokenMap: state.tokenMap,
    });
    expect(report.resources.find((r) => r.resource === 'coin')?.conservationOk).toBe(true);
    expect(report.passed).toBe(true);
  });

  it('tesSUCCESS without sequence fails closed until account_tx indexes OfferSequence; retry does not EscrowCreate again', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    await adapter.enable(state, { coin: 100, items: {} });

    transport.omitNextEscrowSequence();
    transport.hideSequenceFromAccountTx(true);
    transport.calls.length = 0;
    const failed = await adapter.settle(state, { coin: 70, items: {} }, 1, 'Cedar Wake');
    expect(failed.success).toBe(false);
    expect(failed.message).toContain('checkpoint 1 at Cedar Wake');
    expect(failed.message).toContain('escrowCreate(coin)');
    expect(transport.calls.filter((c) => c === 'escrowCreate')).toHaveLength(1);
    expect(state.lastSettled.coin).toBe(100);

    const stillClosed = await adapter.settle(state, { coin: 70, items: {} }, 2, 'Cedar Wake');
    expect(stillClosed.success).toBe(false);
    expect(state.pending).toHaveLength(1);
    expect(stillClosed.message).toContain('checkpoint 1 at Cedar Wake');
    expect(stillClosed.message).toContain('escrowCreate(coin)');
    expect(stillClosed.message).toMatch(/OfferSequence|account_tx/);
    expect(transport.calls.filter((c) => c === 'escrowCreate')).toHaveLength(1);
    expect(state.lastSettled.coin).toBe(100);
    expect(transport.balances.get(`${state.playerAddress}:${state.tokenMap.coin}`)).toBe(70);

    transport.hideSequenceFromAccountTx(false);
    const recovered = await adapter.settle(state, { coin: 70, items: {} }, 3, 'Cedar Wake');
    expect(recovered.success).toBe(true);
    expect(state.pending).toHaveLength(0);
    expect(transport.calls.filter((c) => c === 'escrowCreate')).toHaveLength(1);
    expect(state.lastSettled.coin).toBe(70);
    expect(transport.balances.get(`${state.merchantAddress}:${state.tokenMap.coin}`)).toBe(30);
  });

  it('create-landed with empty receipts recovers OfferSequence and finishes; lastSettled advances only after finish', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    await adapter.enable(state, { coin: 100, items: {} });
    const mintedInitial = { ...state.lastSettled };

    transport.debitThenFailNextEscrowCreate();
    transport.calls.length = 0;
    const failed = await adapter.settle(state, { coin: 70, items: {} }, 1, 'Cedar Wake');
    expect(failed.success).toBe(false);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]!.receipts?.coin).toBeUndefined();
    expect(transport.calls.filter((c) => c === 'escrowCreate')).toHaveLength(1);
    expect(transport.calls.filter((c) => c === 'escrowFinish')).toHaveLength(0);
    expect(transport.balances.get(`${state.playerAddress}:${state.tokenMap.coin}`)).toBe(70);
    expect(transport.balances.get(`${state.merchantAddress}:${state.tokenMap.coin}`) ?? 0).toBe(0);
    expect(state.lastSettled.coin).toBe(100);

    const retried = await adapter.settle(state, { coin: 70, items: {} }, 2, 'Cedar Wake');
    expect(retried.success).toBe(true);
    expect(state.pending).toHaveLength(0);
    expect(transport.calls.filter((c) => c === 'escrowCreate')).toHaveLength(1);
    expect(transport.calls.filter((c) => c === 'escrowFinish')).toHaveLength(1);
    expect(transport.balances.get(`${state.playerAddress}:${state.tokenMap.coin}`)).toBe(70);
    expect(transport.balances.get(`${state.merchantAddress}:${state.tokenMap.coin}`)).toBe(30);
    expect(state.lastSettled.coin).toBe(70);

    const report = reconcile({
      runId: 'run-1',
      seed: 0,
      mintedInitial,
      ledgerBalances: { [state.tokenMap.coin]: 70 },
      lastSettled: state.lastSettled,
      settlements: state.settlements,
      pending: state.pending,
      tokenMap: state.tokenMap,
    });
    expect(report.resources.find((r) => r.resource === 'coin')?.conservationOk).toBe(true);
    expect(report.passed).toBe(true);
  });

  it('crash after create with empty receipts (pending lost) still produces one escrow and one finish', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    await adapter.enable(state, { coin: 100, items: {} });

    transport.debitThenFailNextEscrowCreate();
    transport.calls.length = 0;
    const failed = await adapter.settle(state, { coin: 70, items: {} }, 1, 'Cedar Wake');
    expect(failed.success).toBe(false);
    expect(state.lastSettled.coin).toBe(100);

    // Process crash after CREATE landed and before the pending record persisted.
    state.pending = [];
    state.lastSettleFailed = false;

    const retried = await adapter.settle(state, { coin: 70, items: {} }, 2, 'Cedar Wake');
    expect(retried.success).toBe(true);
    expect(state.pending).toHaveLength(0);
    expect(transport.calls.filter((c) => c === 'escrowCreate')).toHaveLength(1);
    expect(transport.calls.filter((c) => c === 'escrowFinish')).toHaveLength(1);
    expect(state.lastSettled.coin).toBe(70);
    expect(transport.balances.get(`${state.merchantAddress}:${state.tokenMap.coin}`)).toBe(30);
  });

  it('create-landed empty receipts fail closed naming the record when OfferSequence cannot be recovered', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    await adapter.enable(state, { coin: 100, items: {} });

    transport.debitThenFailNextEscrowCreate();
    transport.hideSequenceFromAccountTx(true);
    const failed = await adapter.settle(state, { coin: 70, items: {} }, 1, 'Cedar Wake');
    expect(failed.success).toBe(false);
    expect(state.lastSettled.coin).toBe(100);

    const stillClosed = await adapter.settle(state, { coin: 70, items: {} }, 2, 'Cedar Wake');
    expect(stillClosed.success).toBe(false);
    expect(state.pending).toHaveLength(1);
    expect(stillClosed.message).toContain('checkpoint 1 at Cedar Wake');
    expect(stillClosed.message).toContain('escrowCreate(coin)');
    expect(stillClosed.message).toMatch(/OfferSequence could not be recovered/i);
    expect(stillClosed.message).toContain('account_tx');
    expect(transport.calls.filter((c) => c === 'escrowCreate')).toHaveLength(1);
    expect(transport.calls.filter((c) => c === 'escrowFinish')).toHaveLength(0);
    expect(state.lastSettled.coin).toBe(100);
    expect(transport.balances.get(`${state.merchantAddress}:${state.tokenMap.coin}`) ?? 0).toBe(0);
  });

  it('INCREMENTAL TRUST LINES: a token first acquired at a checkpoint is trust-lined before its mint (else tecPATH_DRY — the live-diagnosed Phase-5 fix)', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();

    // Enable with ONLY coin — the starting trust lines cover coin alone, exactly
    // like the pirate captain whose enable snapshot is {coin, cutlass} and who
    // then BUYS a cannon-shell he never started with.
    await adapter.enable(state, { coin: 30, items: {} });
    expect(state.lastSettled).toEqual({ coin: 30 });

    // A brand-new token appears for the first time at this checkpoint. Its
    // issuer->player mint would fail tecPATH_DRY on live testnet (and now on
    // this fidelity-hardened fake) if settle() did not open its trust line
    // first — the exact gap the pirate live-replay surfaced and this fix closes.
    const afterBuy: TradeableSnapshot = { coin: 27, items: { 'cannon-shell': 1 } };
    const result = await adapter.settle(state, afterBuy, 1, 'Port Haven');

    expect(result.success).toBe(true);
    expect(result.record?.deltas).toEqual({ coin: -3, 'cannon-shell': 1 });
    // The new token actually reached the player's balance — impossible unless
    // its trust line was opened before the mint (the fake fails an un-lined mint).
    expect(transport.balances.get(`${state.playerAddress}:${state.tokenMap['cannon-shell']}`)).toBe(1);
    // BOTH holders are now trust-lined for the new token (player to receive the
    // grant, merchant to receive a future escrowed spend of it).
    expect(transport.trustedFor(state.playerAddress, state.tokenMap['cannon-shell'])).toBe(true);
    expect(transport.trustedFor(state.merchantAddress, state.tokenMap['cannon-shell'])).toBe(true);
  });
  // ── P1.5 exit gate: the verb axis and the settlement primitive are REAL ──
  // Every assertion below fails against the pre-P1.5 adapter. They exist because
  // two axes shipped declared-but-inert: `SettlementVerb` had members no call
  // site could emit, and `config.settlement` had zero reads in the whole
  // implementation. Green tests on the default path do not distinguish "works"
  // from "the flag does nothing", so these pin the difference.

  it('VERB REACHES THE MEMO: a caller-supplied verb is written on-chain and persisted on the record', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    await adapter.enable(state, { coin: 100, items: {} });

    const result = await adapter.settle(state, { coin: 75, items: {} }, 1, 'Saltgate', { verb: 'consign' });

    expect(result.success).toBe(true);
    expect(result.record?.verb).toBe('consign');
    expect(result.record?.memo).toContain('VERB:consign');
    // And the default is unchanged for a caller that passes nothing.
    const plain = await adapter.settle(state, { coin: 70, items: {} }, 2, 'Saltgate');
    expect(plain.record?.verb).toBe('settle');
    expect(plain.record?.memo).toContain('VERB:settle');
  });

  it('VERB SURVIVES THE RETRY PATH un-collapsed (it used to flatten to VERB:settle)', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    await adapter.enable(state, { coin: 100, items: {} });

    // Fail this settle so it lands in `pending` carrying verb 'consign'.
    transport.failNext(1);
    const failed = await adapter.settle(state, { coin: 75, items: {} }, 1, 'Saltgate', { verb: 'consign' });
    expect(failed.success).toBe(false);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]!.verb).toBe('consign');

    // The next settle retries it first. retryPending rebuilds the memo from the
    // RECORD — hardcoding 'settle' there is what silently destroyed the artifact
    // on exactly the path that exists because the network is unreliable.
    const recovered = await adapter.settle(state, { coin: 75, items: {} }, 2, 'Saltgate');
    expect(recovered.success).toBe(true);
    expect(state.pending).toHaveLength(0);

    const replayed = state.settlements.find((r) => r.checkpoint === 1);
    expect(replayed?.verb).toBe('consign');
    expect(replayed?.memo).toContain('VERB:consign');
    expect(replayed?.memo).not.toContain('VERB:settle');
  });

  it('RECONCILE VERIFIES THE VERB: an on-chain memo whose verb disagrees with the record FAILS', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    await adapter.enable(state, { coin: 100, items: {} });
    const settled = await adapter.settle(state, { coin: 75, items: {} }, 1, 'Saltgate', { verb: 'consign' });
    const record = settled.record!;

    const honest = reconcile({
      runId: 'run-1',
      seed: 1,
      mintedInitial: { coin: 100 },
      ledgerBalances: {},
      lastSettled: state.lastSettled,
      settlements: state.settlements,
      pending: [],
      tokenMap: state.tokenMap,
      onchainMemos: Object.fromEntries(record.txids.map((t) => [t, record.memo])),
    });
    expect(honest.onchainMemoOk).toBe(true);

    // Same prefix, same checkpoint — only the VERB differs. Under prefix-only
    // matching this passed, because the prefix stops at CHECKPOINT:<n> and
    // everything after it was written and never read.
    const tampered = record.memo.replace('VERB:consign', 'VERB:settle');
    expect(tampered).not.toBe(record.memo);
    const caught = reconcile({
      runId: 'run-1',
      seed: 1,
      mintedInitial: { coin: 100 },
      ledgerBalances: {},
      lastSettled: state.lastSettled,
      settlements: state.settlements,
      pending: [],
      tokenMap: state.tokenMap,
      onchainMemos: Object.fromEntries(record.txids.map((t) => [t, tampered])),
    });
    expect(caught.onchainMemoOk).toBe(false);
    expect(caught.passed).toBe(false);
  });

  it("PRIMITIVE IS REAL: 'payment' produces a burn Payment where 'token-escrow' produces EscrowCreate+EscrowFinish", async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'testgame', runId: 'run-1' });
    const state = freshState();
    await adapter.enable(state, { coin: 100, items: {} });

    // Baseline: the construction-time config primitive (token-escrow).
    transport.calls.length = 0;
    await adapter.settle(state, { coin: 90, items: {} }, 1, 'Saltgate');
    expect(transport.calls).toEqual(['escrowCreate', 'escrowFinish']);

    // Same adapter, same state, same books — only the per-settlement override
    // differs. A spend becomes a direct holder->issuer burn, no escrow object.
    transport.calls.length = 0;
    await adapter.settle(state, { coin: 80, items: {} }, 2, 'the Warrens', { primitive: 'payment' });
    expect(transport.calls).toEqual(['payment']);
    expect(transport.calls).not.toContain('escrowCreate');

    // ONE set of books across both primitives — the reason this is a per-call
    // override and not a second adapter instance.
    expect(state.lastSettled.coin).toBe(80);
    expect(state.settlements).toHaveLength(2);
  });
});

// ── diary mode (F-merchant-D) ───────────────────────────────────────────
//
// `LedgerMode` shipped in v3.3.0 with prose describing three behaviours and
// code implementing one. A grep for `.mode` across this package, tests
// excluded, returned exactly four hits: two assignments in createInitialState
// and two validations in deserializeState. No branch anywhere. `diary` and
// `ledger` produced byte-identical behaviour, which made `diary` a config flag
// wearing a feature's description — the same shape `config.settlement` had one
// release earlier, in this same file.
//
// The assertions below are about what the ledger DOES and DOES NOT receive,
// because that is the only thing that distinguishes the modes.

const DIARY_CONFIG: LedgerAdapterConfig = {
  mode: 'diary',
  issuerMode: 'per-run',
  settlement: 'token-escrow',
  network: 'testnet',
};

function diaryState(): LedgerAdapterState {
  return { ...freshState(), mode: 'diary' };
}

describe('diary mode: witnessed, not custodied', () => {
  let transport: FakeTransport;
  const snapshot: TradeableSnapshot = { coin: 100, items: { potion: 2 } };

  beforeEach(() => {
    transport = createFakeTransport();
  });

  it('enable opens NO trust lines and mints nothing', async () => {
    // The negative control the whole mode rests on. If a diary run opened trust
    // lines it would be `ledger` with extra steps, and its one selling point —
    // works for any pack regardless of resource-key count — would be false.
    const adapter = createLedgerAdapter(transport, DIARY_CONFIG, { gameId: 'g', runId: 'r' });
    const state = diaryState();

    const result = await adapter.enable(state, snapshot);
    expect(result.success).toBe(true);
    expect(state.enabled).toBe(true);
    expect(state.playerAddress).toBeTruthy();

    expect(transport.calls.filter((c) => c === 'payment'), 'a diary enable minted something').toEqual([]);
    expect(state.trustLinesReady, 'a diary enable opened trust lines').toBe(false);
    expect(transport.trustedFor(state.playerAddress, 'coin')).toBe(false);
    // No issuer at all — there is nothing to issue.
    expect(state.issuerAddress).toBe('');
    expect(state.merchantAddress).toBe('');
  });

  it('a ledger enable, by contrast, DOES all of it', async () => {
    // The positive half of the same control: without this, the assertions above
    // could pass because the fake transport records nothing.
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'g', runId: 'r' });
    const state = freshState();

    await adapter.enable(state, snapshot);
    expect(transport.calls.filter((c) => c === 'payment').length).toBeGreaterThan(0);
    expect(state.trustLinesReady).toBe(true);
    expect(state.issuerAddress).toBeTruthy();
  });

  it('settle writes ONE value-free anchor, not a token movement', async () => {
    const adapter = createLedgerAdapter(transport, DIARY_CONFIG, { gameId: 'g', runId: 'r' });
    const state = diaryState();
    await adapter.enable(state, snapshot);
    transport.calls.length = 0;

    const result = await adapter.settle(state, { coin: 70, items: { potion: 2 } }, 1, 'the-warrens');

    expect(result.success).toBe(true);
    expect(transport.calls, 'a diary settle must be exactly one anchor').toEqual(['anchorMemo']);
    expect(result.record?.deltas).toEqual({ coin: -30 });
    expect(result.record?.txids).toHaveLength(1);
  });

  it('the anchor chain reconciles — verdict rests on memos, not balances', async () => {
    const adapter = createLedgerAdapter(transport, DIARY_CONFIG, { gameId: 'g', runId: 'r' });
    const state = diaryState();
    await adapter.enable(state, snapshot);
    await adapter.settle(state, { coin: 70, items: { potion: 2 } }, 1, 'the-warrens');
    await adapter.settle(state, { coin: 55, items: { potion: 1 } }, 2, 'long-quay');

    // Read the memos back off the (fake) ledger, exactly as a live driver reads
    // account_tx — the engine cannot fabricate this side.
    const onchainMemos: Record<string, string> = {};
    for (const rec of state.settlements) {
      for (const txid of rec.txids) {
        const memo = transport.memoFor(txid);
        if (memo !== undefined) onchainMemos[txid] = memo;
      }
    }

    const report = reconcile({
      runId: 'r',
      seed: 71,
      mode: 'diary',
      mintedInitial: { coin: 100, potion: 2 },
      ledgerBalances: {}, // none exist, by design
      lastSettled: state.lastSettled,
      settlements: state.settlements,
      pending: state.pending,
      playerAddress: state.playerAddress,
      onchainMemos,
    });

    expect(report.passed, report.notes.join('\n')).toBe(true);
    expect(report.onchainMemoOk).toBe(true);
    expect(report.settlementsCount).toBe(2);
    // Honest reporting: no balance was verified, and the report says so rather
    // than implying custody it never had.
    for (const r of report.resources) expect(r.ledger).toBeNull();
    expect(report.notes.join(' ')).toContain('no on-ledger balances by design');
  });

  it('a TAMPERED anchor still fails — the chain is a real check', async () => {
    // Without this, "diary reconcile passes" would prove only that the balance
    // check was skipped, not that anything was verified.
    const adapter = createLedgerAdapter(transport, DIARY_CONFIG, { gameId: 'g', runId: 'r' });
    const state = diaryState();
    await adapter.enable(state, snapshot);
    await adapter.settle(state, { coin: 70, items: { potion: 2 } }, 1, 'the-warrens');

    const txid = state.settlements[0].txids[0];
    const report = reconcile({
      runId: 'r',
      seed: 71,
      mode: 'diary',
      mintedInitial: { coin: 100, potion: 2 },
      ledgerBalances: {},
      lastSettled: state.lastSettled,
      settlements: state.settlements,
      pending: state.pending,
      playerAddress: state.playerAddress,
      onchainMemos: { [txid]: 'ARPG|GAME:g|RUN:r|CHECKPOINT:1|DELTA:coin=-999|VERB:settle' },
    });

    expect(report.passed).toBe(false);
    expect(report.onchainMemoOk).toBe(false);
  });

  it('conservation is still enforced in diary — the arithmetic must hold', async () => {
    // The one thing a diary run CAN still get wrong. Skipping balances must not
    // mean skipping the link between the opening baseline and the deltas.
    const adapter = createLedgerAdapter(transport, DIARY_CONFIG, { gameId: 'g', runId: 'r' });
    const state = diaryState();
    await adapter.enable(state, snapshot);
    await adapter.settle(state, { coin: 70, items: { potion: 2 } }, 1, 'the-warrens');

    const report = reconcile({
      runId: 'r',
      seed: 71,
      mode: 'diary',
      mintedInitial: { coin: 1 }, // a lie: the run opened at 100
      ledgerBalances: {},
      lastSettled: state.lastSettled,
      settlements: state.settlements,
      pending: state.pending,
      playerAddress: state.playerAddress,
    });

    expect(report.passed).toBe(false);
    expect(report.resources.find((r) => r.resource === 'coin')?.conservationOk).toBe(false);
  });

  it('a failed anchor degrades onto the SAME pending path as a ledger settle', async () => {
    const adapter = createLedgerAdapter(transport, DIARY_CONFIG, { gameId: 'g', runId: 'r' });
    const state = diaryState();
    await adapter.enable(state, snapshot);

    transport.failNext(1);
    const result = await adapter.settle(state, { coin: 70, items: { potion: 2 } }, 1, 'the-warrens');

    expect(result.success).toBe(false);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0].deltas).toEqual({ coin: -30 });
  });

  it('two consecutive diary-anchor failures with an intervening snapshot change do not overlap deltas', async () => {
    const adapter = createLedgerAdapter(transport, DIARY_CONFIG, { gameId: 'g', runId: 'r' });
    const state = diaryState();
    await adapter.enable(state, snapshot);

    transport.failNext(1);
    const first = await adapter.settle(state, { coin: 70, items: { potion: 2 } }, 1, 'the-warrens');
    expect(first.success).toBe(false);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0].deltas).toEqual({ coin: -30 });

    transport.failNext(1);
    const second = await adapter.settle(state, { coin: 50, items: { potion: 2 } }, 2, 'long-quay');
    expect(second.success).toBe(false);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0].deltas).toEqual({ coin: -30 });
    expect(state.lastSettled.coin).toBe(100);

    const recovered = await adapter.settle(state, { coin: 50, items: { potion: 2 } }, 3, 'long-quay');
    expect(recovered.success).toBe(true);
    expect(state.pending).toHaveLength(0);
    expect(state.lastSettled.coin).toBe(50);
    expect(state.settlements.map((r) => r.deltas.coin)).toEqual([-30, -20]);

    const report = reconcile({
      runId: 'r',
      seed: 71,
      mode: 'diary',
      mintedInitial: { coin: 100, potion: 2 },
      ledgerBalances: {},
      lastSettled: state.lastSettled,
      settlements: state.settlements,
      pending: state.pending,
      playerAddress: state.playerAddress,
    });
    expect(report.passed, report.notes.join('\n')).toBe(true);
    expect(report.resources.find((r) => r.resource === 'coin')?.conservationOk).toBe(true);
    expect(report.resources.find((r) => r.resource === 'coin')?.sumDeltas).toBe(-50);
  });
});

// ── persistent issuer (F-merchant-E) ────────────────────────────────────
//
// `IssuerMode` shipped as a declared axis with no behaviour. Like `mode`, it
// was copied into state at construction and validated on deserialize, and read
// by nothing — so every run in either mode fauceted a throwaway issuer, and the
// documented cross-run market was impossible. Two runs of the "same game" had
// two different issuers, two token codes, and no shared economy.
//
// Custody stays deliberate: per-run remains the documented default (no durable
// key at all), and `persistent` is opt-in, gated on the config axis rather than
// on the seed merely being present, and demonstrated only where a testnet-only
// warning and a gitignored sidecar are in play.

const PERSISTENT_CONFIG: LedgerAdapterConfig = {
  mode: 'ledger',
  issuerMode: 'persistent',
  settlement: 'token-escrow',
  network: 'testnet',
};

describe('persistent issuer: a market that outlives the run', () => {
  let transport: FakeTransport;
  const snapshot: TradeableSnapshot = { coin: 100, items: { potion: 2 } };

  beforeEach(() => {
    transport = createFakeTransport();
  });

  it('per-run (the default) gives two runs two DIFFERENT issuers', async () => {
    // The control. This is what shipped, and what `persistent` was supposed to
    // change — without this half, the run-2 assertion below would prove nothing.
    const runOne = createLedgerAdapter(transport, CONFIG, { gameId: 'g', runId: 'r1' });
    const stateOne = freshState();
    await runOne.enable(stateOne, snapshot);

    const runTwo = createLedgerAdapter(transport, CONFIG, { gameId: 'g', runId: 'r2' });
    const stateTwo = freshState();
    await runTwo.enable(stateTwo, snapshot);

    expect(stateOne.issuerAddress).toBeTruthy();
    expect(stateTwo.issuerAddress).not.toBe(stateOne.issuerAddress);
  });

  it('persistent reuses ONE issuer across two runs of the same game', async () => {
    // Run 1 fauces the issuer and records its seed (in production: into the
    // gitignored sidecar).
    const seeds = new Map<string, string>();
    const runOne = createLedgerAdapter(transport, PERSISTENT_CONFIG, {
      gameId: 'g',
      runId: 'r1',
      putSeed: (address, seed) => seeds.set(address, seed),
    });
    const stateOne = freshState();
    stateOne.issuerMode = 'persistent';
    await runOne.enable(stateOne, snapshot);

    const durableSeed = seeds.get(stateOne.issuerAddress);
    expect(durableSeed, 'run 1 never surfaced an issuer seed to persist').toBeTruthy();

    // Run 2 is a FRESH state — a new session, nothing carried in memory — that
    // supplies the durable seed and finds the same issuer waiting.
    const runTwo = createLedgerAdapter(transport, PERSISTENT_CONFIG, {
      gameId: 'g',
      runId: 'r2',
      persistentIssuerSeed: durableSeed,
    });
    const stateTwo = freshState();
    stateTwo.issuerMode = 'persistent';
    await runTwo.enable(stateTwo, snapshot);

    expect(stateTwo.issuerAddress).toBe(stateOne.issuerAddress);
    // And the market run 1 built is still there: the same issuer means the same
    // trust lines, so run 2's player can hold run 1's tokens.
    expect(stateTwo.tokenMap).toEqual(stateOne.tokenMap);
    expect(transport.trustedFor(stateTwo.playerAddress, stateTwo.tokenMap.coin)).toBe(true);
  });

  it('a seed handed to a PER-RUN game is ignored — custody cannot change by accident', async () => {
    // Gated on the config axis, not on the seed's presence. A stray seed in the
    // deps must not silently convert a throwaway-custody game into a durable-key
    // one; that is a custody decision, not a parameter.
    const seeds = new Map<string, string>();
    const first = createLedgerAdapter(transport, PERSISTENT_CONFIG, {
      gameId: 'g',
      runId: 'r1',
      putSeed: (address, seed) => seeds.set(address, seed),
    });
    const stateOne = freshState();
    stateOne.issuerMode = 'persistent';
    await first.enable(stateOne, snapshot);
    const durableSeed = seeds.get(stateOne.issuerAddress)!;

    const perRun = createLedgerAdapter(transport, CONFIG, {
      gameId: 'g',
      runId: 'r2',
      persistentIssuerSeed: durableSeed,
    });
    const stateTwo = freshState();
    await perRun.enable(stateTwo, snapshot);

    expect(stateTwo.issuerAddress).not.toBe(stateOne.issuerAddress);
  });

  it('a resumed run still resumes — persistence does not break in-run recovery', async () => {
    // state.issuerAddress already set means "this run already has its issuer",
    // and that path must keep winning over the durable seed, or a mid-run
    // resume would silently re-point the economy at a different issuer.
    const seeds = new Map<string, string>();
    const adapter = createLedgerAdapter(transport, PERSISTENT_CONFIG, {
      gameId: 'g',
      runId: 'r1',
      putSeed: (address, seed) => seeds.set(address, seed),
    });
    const state = freshState();
    state.issuerMode = 'persistent';
    await adapter.enable(state, snapshot);
    const firstIssuer = state.issuerAddress;

    await adapter.enable(state, snapshot); // resume
    expect(state.issuerAddress).toBe(firstIssuer);
  });
});

describe('offline mode (DEFAULT_LEDGER_CONFIG)', () => {
  let transport: FakeTransport;

  beforeEach(() => {
    transport = createFakeTransport();
  });

  it('DEFAULT enable does not call fundWallet and never mints', async () => {
    const adapter = createLedgerAdapter(transport, DEFAULT_LEDGER_CONFIG, { gameId: 'g', runId: 'r1' });
    const state = freshState();
    state.mode = 'offline';
    const result = await adapter.enable(state, { coin: 100, items: { potion: 1 } });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/offline/i);
    expect(transport.fundedWallets).toBe(0);
    expect(state.issuerAddress).toBe('');
    expect(state.playerAddress).toBe('');
    expect(transport.calls).toEqual([]);
  });

  it('offline settle is a success no-op (no submit)', async () => {
    const adapter = createLedgerAdapter(transport, DEFAULT_LEDGER_CONFIG, { gameId: 'g', runId: 'r1' });
    const state = freshState();
    state.mode = 'offline';
    await adapter.enable(state, { coin: 100, items: {} });
    const settled = await adapter.settle(state, { coin: 70, items: {} }, 1, 'town');

    expect(settled.success).toBe(true);
    expect(settled.message).toMatch(/offline/i);
    expect(transport.calls).toEqual([]);
    expect(state.pending).toHaveLength(0);
    expect(state.settlements).toHaveLength(0);
  });
});

describe('seed restore and attributable retry', () => {
  let transport: FakeTransport;
  const snapshot: TradeableSnapshot = { coin: 100, items: {} };

  beforeEach(() => {
    transport = createFakeTransport();
  });

  it('deserialize + new adapter hydrates seedCache from getSeed and can settle', async () => {
    const seeds = new Map<string, string>();
    const first = createLedgerAdapter(transport, CONFIG, {
      gameId: 'g',
      runId: 'r1',
      putSeed: (address, seed) => seeds.set(address, seed),
    });
    const state = freshState();
    const enabled = await first.enable(state, snapshot);
    expect(enabled.success).toBe(true);

    const restored = deserializeState(serializeState(state));
    const resumed = createLedgerAdapter(transport, CONFIG, {
      gameId: 'g',
      runId: 'r1',
      getSeed: (address) => seeds.get(address),
    });
    const reenable = await resumed.enable(restored, snapshot);
    expect(reenable.success).toBe(true);
    expect(reenable.message).toMatch(/already online/);

    const settled = await resumed.settle(restored, { coin: 90, items: {} }, 1, 'Cedar Wake');
    expect(settled.success).toBe(true);
    expect(restored.lastSettled.coin).toBe(90);
  });

  it('fast-path enable fails closed when the sidecar has no seed for a named wallet', async () => {
    const seeds = new Map<string, string>();
    const first = createLedgerAdapter(transport, CONFIG, {
      gameId: 'g',
      runId: 'r1',
      putSeed: (address, seed) => seeds.set(address, seed),
    });
    const state = freshState();
    await first.enable(state, snapshot);
    const restored = deserializeState(serializeState(state));

    const orphan = createLedgerAdapter(transport, CONFIG, { gameId: 'g', runId: 'r1' });
    const result = await orphan.enable(restored, snapshot);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/missing seed/);
    expect(result.message).toMatch(restored.playerAddress);
    expect(result.message).toMatch(/sidecar/);
    expect(restored.enabled).toBe(false);
  });

  it('a requireSeed miss on retry is visible in the still-pending message and names the record', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'g', runId: 'r1' });
    const state = freshState();
    await adapter.enable(state, snapshot);

    transport.failNext(1);
    const failed = await adapter.settle(state, { coin: 70, items: {} }, 1, 'Cedar Wake');
    expect(failed.success).toBe(false);
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0].lastError).toBeTruthy();

    const orphan = createLedgerAdapter(transport, CONFIG, { gameId: 'g', runId: 'r1' });
    const retried = await orphan.settle(state, { coin: 70, items: {} }, 2, 'Market Row');
    expect(retried.success).toBe(false);
    expect(retried.message).toMatch(/checkpoint 1 at Cedar Wake/);
    expect(retried.message).toMatch(/no seed cached/);
    expect(retried.record?.lastError).toMatch(/no seed cached/);
    expect(retried.record?.lastError).toMatch(/rFAKE/);
  });

  it('enable names connect() when the transport cannot connect', async () => {
    transport.connect = async () => {
      throw new Error('connect() failed: websocket is down');
    };
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'g', runId: 'r1' });
    const result = await adapter.enable(freshState(), snapshot);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/connect\(\)/);
  });
});

describe('network-named copy and public getSeed', () => {
  let transport: FakeTransport;
  const snapshot: TradeableSnapshot = { coin: 100, items: {} };

  beforeEach(() => {
    transport = createFakeTransport();
  });

  it('stamps network on enable/settle and names Dry-run in success and quiet-ledger copy', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'g', runId: 'r1' });
    const state = freshState();
    const enabled = await adapter.enable(state, snapshot);
    expect(enabled.success).toBe(true);
    expect(enabled.network).toBe('fake-dry-run');
    expect(enabled.message).toMatch(/Dry-run — no real value/);
    expect(enabled.message).toMatch(/receipted/i);

    const settled = await adapter.settle(state, { coin: 90, items: {} }, 1, 'Cedar Wake');
    expect(settled.success).toBe(true);
    expect(settled.network).toBe('fake-dry-run');
    expect(settled.message).toMatch(/^Settled on Dry-run\. Receipt:/);

    transport.failNext(1);
    const quiet = await adapter.settle(state, { coin: 80, items: {} }, 2, 'Market Row');
    expect(quiet.success).toBe(false);
    expect(quiet.network).toBe('fake-dry-run');
    expect(quiet.message).toMatch(/^Dry-run was quiet/);
    expect(quiet.message).toMatch(/not mainnet value/);
    expect(quiet.message).toMatch(/fake transport failure|tecFAKE/);
  });

  it('exposes getSeed after enable so a host can hydrate NFT settlement without re-plumbing', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'g', runId: 'r1' });
    const state = freshState();
    await adapter.enable(state, snapshot);
    expect(adapter.gameId).toBe('g');
    expect(adapter.runId).toBe('r1');
    expect(adapter.getSeed(state.playerAddress)).toBeTruthy();
    expect(adapter.getSeed(state.issuerAddress)).toBeTruthy();
    expect(adapter.getSeed('rNobody')).toBeUndefined();
  });
});

describe('mintedInitial — opening mint persisted on state', () => {
  let transport: FakeTransport;

  beforeEach(() => {
    transport = createFakeTransport();
  });

  it('enable checkpoints mintedInitial once; settle advances lastSettled only', async () => {
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'g', runId: 'r1' });
    const state = freshState();
    await adapter.enable(state, { coin: 100, items: { potion: 2 } });
    expect(state.mintedInitial).toEqual({ coin: 100, potion: 2 });
    expect(state.lastSettled).toEqual({ coin: 100, potion: 2 });

    const settled = await adapter.settle(state, { coin: 70, items: { potion: 2 } }, 1, 'town');
    expect(settled.success).toBe(true);
    expect(state.lastSettled.coin).toBe(70);
    expect(state.mintedInitial).toEqual({ coin: 100, potion: 2 });

    const restored = deserializeState(serializeState(state));
    expect(restored.mintedInitial).toEqual({ coin: 100, potion: 2 });
    expect(restored.lastSettled.coin).toBe(70);
  });
});

describe('explorer URLs on EnableResult / SettlementResult', () => {
  it('stamps testnet explorer URLs and interpolates the receipt URL', async () => {
    const transport = createFakeTransport('testnet');
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'g', runId: 'r1' });
    const state = freshState();
    const enabled = await adapter.enable(state, { coin: 100, items: {} });
    expect(enabled.playerExplorerUrl).toBe(accountExplorerUrl('testnet', state.playerAddress));
    expect(enabled.playerExplorerUrl).toMatch(/^https:\/\/testnet\.xrpl\.org\/accounts\//);

    const settled = await adapter.settle(state, { coin: 90, items: {} }, 1, 'Cedar Wake');
    expect(settled.success).toBe(true);
    expect(settled.explorerUrls?.[0]).toBe(txExplorerUrl('testnet', settled.txids![0]));
    expect(settled.message).toContain(`Receipt: ${settled.explorerUrls![0]}`);
    expect(settled.explorerUrls![0]).toMatch(/^https:\/\/testnet\.xrpl\.org\//);
  });

  it('omits explorer URLs on dry-run and never invents a mainnet explorer', async () => {
    const transport = createFakeTransport();
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'g', runId: 'r1' });
    const state = freshState();
    const enabled = await adapter.enable(state, { coin: 100, items: {} });
    expect(enabled.playerExplorerUrl).toBeUndefined();
    const settled = await adapter.settle(state, { coin: 90, items: {} }, 1, 'Cedar Wake');
    expect(settled.explorerUrls).toBeUndefined();
    expect(settled.message).toMatch(/^Settled on Dry-run\. Receipt: HASH/);
    expect(txExplorerUrl('mainnet', 'ABCD')).toBeUndefined();
    expect(accountExplorerUrl('mainnet', 'rPlayer')).toBeUndefined();
    expect(nftExplorerUrl('mainnet', 'NFT1')).toBeUndefined();
    expect(nftExplorerUrl('testnet', 'NFT1')).toBe('https://testnet.xrpl.org/nft/NFT1');
    expect(nftExplorerUrl('devnet', 'NFT1')).toBe('https://devnet.xrpl.org/nft/NFT1');
    expect(nftExplorerUrl('dry-run', 'NFT1')).toBeUndefined();
  });
});

describe('bindSidecar persistent issuer — two createInitialState runs share one issuer', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it('run 2 with only bindSidecar reuses run 1 issuer; per-run does not', async () => {
    dir = mkdtempSync(join(tmpdir(), 'ledger-adapter-issuer-alias-'));
    const transport = createFakeTransport();
    const snapshot: TradeableSnapshot = { coin: 40, items: {} };

    const runOne = createLedgerAdapter(transport, PERSISTENT_CONFIG, {
      gameId: 'g',
      runId: 'r1',
      ...bindSidecar(dir, { issuerMode: 'persistent' }),
    });
    const stateOne = createInitialState(PERSISTENT_CONFIG);
    await runOne.enable(stateOne, snapshot);
    expect(stateOne.issuerAddress).toBeTruthy();

    const runTwo = createLedgerAdapter(transport, PERSISTENT_CONFIG, {
      gameId: 'g',
      runId: 'r2',
      ...bindSidecar(dir, { issuerMode: 'persistent' }),
    });
    const stateTwo = createInitialState(PERSISTENT_CONFIG);
    await runTwo.enable(stateTwo, snapshot);
    expect(stateTwo.issuerAddress).toBe(stateOne.issuerAddress);
    expect(stateTwo.tokenMap).toEqual(stateOne.tokenMap);

    const perDir = mkdtempSync(join(dir, 'per-run-'));
    const perOne = createInitialState(CONFIG);
    const perTwo = createInitialState(CONFIG);
    await createLedgerAdapter(transport, CONFIG, {
      gameId: 'g',
      runId: 'p1',
      ...bindSidecar(perDir),
    }).enable(perOne, snapshot);
    await createLedgerAdapter(transport, CONFIG, {
      gameId: 'g',
      runId: 'p2',
      ...bindSidecar(perDir),
    }).enable(perTwo, snapshot);
    expect(perTwo.issuerAddress).not.toBe(perOne.issuerAddress);
  });
});
