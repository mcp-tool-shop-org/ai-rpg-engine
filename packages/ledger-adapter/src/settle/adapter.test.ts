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
  /** True once `address` has opened a trust line for `currency`. Models the
   *  live-XRPL rule the mint path below enforces (a mint to an un-trust-lined
   *  holder fails tecPATH_DRY) — the fidelity the LIVE pirate replay needed to
   *  surface the incremental-trust-line gap the dry-run path structurally hid. */
  trustedFor(address: string, currency: string): boolean;
  /** Ordered log of write-method names, so a test can assert the SHAPE of the
   *  tx sequence a settlement produced (not merely its net balance effect).
   *  Needed to prove the `payment` primitive is materially different from
   *  `token-escrow` rather than a config flag with no behavioral consequence. */
  calls: string[];
};

function createFakeTransport(): FakeTransport {
  let walletCounter = 0;
  let txCounter = 0;
  let failRemaining = 0;
  const seedToAddress = new Map<string, string>();
  const balances = new Map<string, number>();
  // `${holder}:${currency}` for every opened trust line — modeled so the mint
  // path can enforce live XRPL's "no line -> tecPATH_DRY" rule (see trustedFor).
  const trustLines = new Set<string>();
  const pendingEscrows = new Map<number, { destination: string; currency: string; value: number }>();
  const calls: string[] = [];

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
    calls,
    failNext(times: number) {
      failRemaining = times;
    },
    trustedFor(address: string, currency: string): boolean {
      return trustLines.has(`${address}:${currency}`);
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
      calls.push('escrowCreate');
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
      calls.push('escrowFinish');
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
      // Thread the adapter's OWN minted codes so reconcile looks up
      // ledgerBalances by state.tokenMap.coin (a valid 3-char code from
      // assignTokenCode) rather than a re-derived 4-char 'COIN' (wave-2 fix).
      tokenMap: state.tokenMap,
    });

    expect(report.resources.find((r) => r.resource === 'coin')?.conservationOk).toBe(true);
    expect(report.resources.find((r) => r.resource === 'coin')?.sumDeltas).toBe(-30);
    expect(report.passed).toBe(true);
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
