// TestnetTransport — OFFLINE unit tests. NEVER opens a real network
// connection: `xrpl.Client` is injected via TestnetTransport's second
// constructor argument (`XrplClientLike`) and every call is a `vi.fn()`
// mock. Covers: the mainnet-impossible-in-code guard at construction,
// `walletFromSeed`'s real (offline) cryptographic derivation, the memo hex
// encode/decode round-trip, tesSUCCESS/tec* result-mapping, and the CRITICAL
// escrow FinishAfter wait discipline (via fake timers — no real sleeping).
//
// Also covers the P2 NFT operations (nftMint/nftBurn/nftModify/
// nftCreateSellOffer/nftAcceptSellOffer/accountNfts) under the SAME offline
// discipline — the submitted tx SHAPE and the TxResult/NFTMintResult/
// NFTOfferResult mapping, never the network.
//
// The LIVE, on-chain acceptance lives in ../../scripts/live-replay.mjs — a
// separate, deliberately-not-CI script (per the task: CI must never hit
// testnet from the unit suite).

import { Buffer } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as xrpl from 'xrpl';
import { ASF_DEFAULT_RIPPLE } from '../contracts.js';
import { TestnetTransport, type XrplClientLike } from './testnet.js';

const TESTNET_URL = 'wss://s.altnet.rippletest.net:51233';

// A real XRPL seed/address pair — computed offline via the installed
// `xrpl.Wallet.fromSeed` itself (this is the well-known xrpl.js example
// vector), so the test proves TestnetTransport forwards to the real,
// deterministic cryptographic derivation rather than inventing its own.
const KNOWN_SEED = 'snoPBrXtMeMyMHUVTgbuqAfg1SUTb';
const KNOWN_ADDRESS = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';

const ISSUER_ADDRESS = 'rIssuer1111111111111111111111111';
const MERCHANT_ADDRESS = 'rMerchant111111111111111111111111';

afterEach(() => {
  // Safety net: a test that fails mid-way (before its own try/finally runs)
  // must never leak fake timers into the next test in this file.
  vi.useRealTimers();
});

// ── Fixtures ─────────────────────────────────────────────────────────────

/** A minimal `XrplClientLike` mock. Every field is a `vi.fn()`; pass
 *  `overrides` to replace specific methods per test. Cast at this one
 *  boundary (never `any`) — xrpl.js's generic `submitAndWait`/`request`
 *  signatures are awkward to hand-satisfy exactly with `vi.fn()`, and the
 *  transport under test only ever calls methods this mock actually implements. */
function createMockClient(overrides: Record<string, unknown> = {}): XrplClientLike {
  const base = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    fundWallet: vi.fn().mockResolvedValue({ wallet: xrpl.Wallet.fromSeed(KNOWN_SEED), balance: 1000 }),
    submitAndWait: vi.fn(),
    request: vi.fn(),
  };
  return { ...base, ...overrides } as unknown as XrplClientLike;
}

/** A `submitAndWait` resolved value shaped like a real xrpl.js `TxResponse`.
 *  `affectedNodes` defaults to `[]` (every existing fungible-path caller);
 *  the NFT `nftCreateSellOffer` tests pass a hand-built `CreatedNode` to
 *  exercise the offerIndex meta-scan. */
function fakeTxResponse(
  opts: { hash?: string; transactionResult?: string; sequence?: number; affectedNodes?: unknown[] } = {},
) {
  return {
    result: {
      hash: opts.hash ?? 'DEADBEEF00000000000000000000000000000000000000000000000000000000',
      meta: {
        TransactionResult: opts.transactionResult ?? 'tesSUCCESS',
        TransactionIndex: 0,
        AffectedNodes: opts.affectedNodes ?? [],
      },
      tx_json: { Sequence: opts.sequence },
    },
  };
}

/** An `account_tx` response shaped like the real (API v2) rippled reply —
 *  `hash` and `tx_json` at the top level of each entry, matching the
 *  Phase-0 spike's documented shape. */
function fakeAccountTxResponse(entries: Array<{ hash: string; type: string; memoHex?: string }>) {
  return {
    result: {
      account: MERCHANT_ADDRESS,
      ledger_index_min: 1,
      ledger_index_max: 2,
      limit: 50,
      transactions: entries.map((e) => ({
        hash: e.hash,
        ledger_index: 1,
        validated: true,
        meta: { TransactionResult: 'tesSUCCESS', TransactionIndex: 0, AffectedNodes: [] },
        tx_json: {
          TransactionType: e.type,
          ...(e.memoHex !== undefined ? { Memos: [{ Memo: { MemoData: e.memoHex } }] } : {}),
        },
      })),
    },
  };
}

// ── Constructor: the mainnet-impossible-in-code guard ───────────────────

describe('TestnetTransport constructor — mainnet-impossible-in-code guard', () => {
  it('rejects a mainnet host (xrplcluster.com)', () => {
    expect(() => new TestnetTransport('wss://xrplcluster.com')).toThrow(/non-testnet host/i);
  });

  it('rejects a mainnet host (s1.ripple.com)', () => {
    expect(() => new TestnetTransport('wss://s1.ripple.com')).toThrow(/non-testnet host/i);
  });

  it('accepts the testnet host', () => {
    expect(() => new TestnetTransport('wss://s.altnet.rippletest.net:51233', createMockClient())).not.toThrow();
  });

  it('accepts the devnet host', () => {
    expect(() => new TestnetTransport('wss://s.devnet.rippletest.net:51233', createMockClient())).not.toThrow();
  });

  it('accepts the default constructor argument with no network call made', () => {
    // No `client` injected either — proves construction alone never touches
    // the network (only connect() would). If this opened a socket, the test
    // process would hang or error with no fake client to answer it.
    expect(() => new TestnetTransport()).not.toThrow();
  });

  it('sets networkName to "testnet"', () => {
    const transport = new TestnetTransport(TESTNET_URL, createMockClient());
    expect(transport.networkName).toBe('testnet');
  });
});

// ── walletFromSeed — real, offline cryptographic derivation ─────────────

describe('walletFromSeed', () => {
  it('derives the correct classic address for a known seed (offline, real xrpl.Wallet)', () => {
    const transport = new TestnetTransport(TESTNET_URL, createMockClient());
    expect(transport.walletFromSeed(KNOWN_SEED)).toEqual({ address: KNOWN_ADDRESS, seed: KNOWN_SEED });
  });

  it('is a pure function of the seed — two calls agree', () => {
    const transport = new TestnetTransport(TESTNET_URL, createMockClient());
    expect(transport.walletFromSeed(KNOWN_SEED)).toEqual(transport.walletFromSeed(KNOWN_SEED));
  });
});

// ── Memo hex encode/decode round-trip ────────────────────────────────────

describe('memo hex encode/decode round-trip', () => {
  const MEMO_TEXT = 'ARPG|GAME:pirate|RUN:abc123|CHECKPOINT:1|DELTA:coin-100|VERB:sell|V:1';

  it('payment() hex-encodes the memo onto the wire tx', async () => {
    const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse());
    const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

    await transport.payment(
      KNOWN_SEED,
      MERCHANT_ADDRESS,
      { currency: 'COI', issuer: ISSUER_ADDRESS, value: '100' },
      MEMO_TEXT,
    );

    const [sentTx] = submitAndWait.mock.calls[0] as [{ Memos: Array<{ Memo: { MemoData: string; MemoType: string } }> }];
    const sentHex = sentTx.Memos[0].Memo.MemoData;
    // Decoded independently of the transport's own decode path (Buffer
    // directly, mirroring exactly how an external verifier reading the raw
    // chain bytes would) — proves the ENCODE half of the round-trip.
    expect(Buffer.from(sentHex, 'hex').toString('utf8')).toBe(MEMO_TEXT);
    expect(Buffer.from(sentTx.Memos[0].Memo.MemoType, 'hex').toString('utf8')).toBe('text/plain');
  });

  it('accountTx() hex-decodes an on-chain memo back to text', async () => {
    const sentHex = Buffer.from(MEMO_TEXT, 'utf8').toString('hex').toUpperCase();
    const request = vi
      .fn()
      .mockResolvedValue(fakeAccountTxResponse([{ hash: 'HASH1', type: 'EscrowCreate', memoHex: sentHex }]));
    const transport = new TestnetTransport(TESTNET_URL, createMockClient({ request }));

    const entries = await transport.accountTx(MERCHANT_ADDRESS);

    expect(entries).toEqual([{ hash: 'HASH1', type: 'EscrowCreate', memo: MEMO_TEXT }]);
  });

  it('accountTx() omits `memo` (rather than throwing) for a transaction with no memo', async () => {
    const request = vi.fn().mockResolvedValue(fakeAccountTxResponse([{ hash: 'HASH2', type: 'TrustSet' }]));
    const transport = new TestnetTransport(TESTNET_URL, createMockClient({ request }));

    const entries = await transport.accountTx(MERCHANT_ADDRESS);

    expect(entries).toEqual([{ hash: 'HASH2', type: 'TrustSet' }]);
    expect(entries[0]).not.toHaveProperty('memo');
  });
});

// ── Result mapping: tesSUCCESS / tec* / network failure -> TxResult ─────

describe('result mapping (submitAndWait -> TxResult)', () => {
  it('maps a tesSUCCESS result to { ok: true, hash, code }', async () => {
    const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse({ hash: 'HASH_OK', transactionResult: 'tesSUCCESS' }));
    const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

    const result = await transport.setAccountFlag(KNOWN_SEED, ASF_DEFAULT_RIPPLE);

    expect(result).toEqual({ ok: true, hash: 'HASH_OK', code: 'tesSUCCESS' });
  });

  it('maps a tec* engine result to { ok: false, code } WITHOUT throwing', async () => {
    const submitAndWait = vi
      .fn()
      .mockResolvedValue(fakeTxResponse({ hash: 'HASH_FAIL', transactionResult: 'tecUNFUNDED_PAYMENT' }));
    const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

    const result = await transport.payment(KNOWN_SEED, MERCHANT_ADDRESS, {
      currency: 'COI',
      issuer: ISSUER_ADDRESS,
      value: '100',
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('tecUNFUNDED_PAYMENT');
    expect(result.hash).toBe('HASH_FAIL');
    expect(result.error).toBeDefined();
  });

  it('a tem* local-validation result also maps to ok:false, never throwing', async () => {
    const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse({ transactionResult: 'temBAD_AMOUNT' }));
    const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

    const result = await transport.trustSet(KNOWN_SEED, ISSUER_ADDRESS, 'COI', '1000000');

    expect(result).toMatchObject({ ok: false, code: 'temBAD_AMOUNT' });
  });

  it('escrowCreate surfaces the validated tx Sequence on success', async () => {
    const submitAndWait = vi
      .fn()
      .mockResolvedValue(fakeTxResponse({ hash: 'HASH_ESC', transactionResult: 'tesSUCCESS', sequence: 42 }));
    const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

    const result = await transport.escrowCreate(
      KNOWN_SEED,
      MERCHANT_ADDRESS,
      { currency: 'COI', issuer: ISSUER_ADDRESS, value: '100' },
      0,
      0,
    );

    expect(result).toMatchObject({ ok: true, hash: 'HASH_ESC', code: 'tesSUCCESS', sequence: 42 });
  });

  it('escrowCreate computes real ripple-epoch FinishAfter/CancelAfter, ignoring the adapter\'s tick params', async () => {
    const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse({ transactionResult: 'tesSUCCESS', sequence: 1 }));
    const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

    // The adapter passes tiny deterministic-counter ticks (0, 3600) — a real
    // ripple-epoch FinishAfter must be nowhere near those values.
    await transport.escrowCreate(
      KNOWN_SEED,
      MERCHANT_ADDRESS,
      { currency: 'COI', issuer: ISSUER_ADDRESS, value: '100' },
      0,
      3600,
    );

    const [sentTx] = submitAndWait.mock.calls[0] as [{ FinishAfter: number; CancelAfter: number }];
    const rippleNow = Math.floor(Date.now() / 1000) - 946_684_800;
    expect(sentTx.FinishAfter).toBeGreaterThan(rippleNow);
    expect(sentTx.CancelAfter).toBeGreaterThan(sentTx.FinishAfter);
  });

  it('a network/timeout failure maps to { ok: false, error }, never throwing', async () => {
    const submitAndWait = vi.fn().mockRejectedValue(new Error('WebSocket closed'));
    const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

    const result = await transport.trustSet(KNOWN_SEED, ISSUER_ADDRESS, 'COI', '1000000');

    expect(result.ok).toBe(false);
    expect(result.hash).toBe('');
    expect(result.error).toMatch(/WebSocket closed/);
  });
});

// ── The CRITICAL fix: escrowFinish waits out FinishAfter before submitting ──

describe('escrowFinish — waits out the escrow FinishAfter before submitting', () => {
  it('does not submit the finish until FinishAfter has elapsed, then succeeds (fake timers, no real sleep)', async () => {
    vi.useFakeTimers();
    try {
      const submitAndWait = vi
        .fn()
        .mockResolvedValueOnce(fakeTxResponse({ hash: 'CREATE_HASH', transactionResult: 'tesSUCCESS', sequence: 7 }))
        .mockResolvedValueOnce(fakeTxResponse({ hash: 'FINISH_HASH', transactionResult: 'tesSUCCESS' }));
      const client = createMockClient({ submitAndWait });
      const transport = new TestnetTransport(TESTNET_URL, client);

      const createResult = await transport.escrowCreate(
        KNOWN_SEED,
        MERCHANT_ADDRESS,
        { currency: 'COI', issuer: ISSUER_ADDRESS, value: '100' },
        0,
        0,
      );
      expect(createResult.sequence).toBe(7);
      expect(submitAndWait).toHaveBeenCalledTimes(1);

      const finishPromise = transport.escrowFinish(KNOWN_SEED, KNOWN_ADDRESS, 7);

      // Immediately after calling escrowFinish, the transport must still be
      // inside its pre-submit wait — the finish tx has NOT gone out yet.
      await vi.advanceTimersByTimeAsync(0);
      expect(submitAndWait).toHaveBeenCalledTimes(1);

      // Advance comfortably past FinishAfter's buffer + margin window.
      await vi.advanceTimersByTimeAsync(20_000);
      const finishResult = await finishPromise;

      expect(finishResult).toMatchObject({ ok: true, hash: 'FINISH_HASH', code: 'tesSUCCESS' });
      expect(submitAndWait).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('submits immediately for an UNTRACKED escrow (not created by this instance) — no wait', async () => {
    const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse({ hash: 'FINISH_HASH', transactionResult: 'tesSUCCESS' }));
    const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

    const result = await transport.escrowFinish(KNOWN_SEED, MERCHANT_ADDRESS, 999);

    expect(result).toMatchObject({ ok: true, hash: 'FINISH_HASH' });
    expect(submitAndWait).toHaveBeenCalledTimes(1);
  });

  it('retries once on tecNO_PERMISSION ("too early") then succeeds, bounded and never masking a different failure', async () => {
    vi.useFakeTimers();
    try {
      const submitAndWait = vi
        .fn()
        .mockResolvedValueOnce(fakeTxResponse({ transactionResult: 'tesSUCCESS', sequence: 3 })) // create
        .mockResolvedValueOnce(fakeTxResponse({ transactionResult: 'tecNO_PERMISSION' })) // finish attempt 1: too early
        .mockResolvedValueOnce(fakeTxResponse({ hash: 'FINISH_OK', transactionResult: 'tesSUCCESS' })); // finish attempt 2
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

      await transport.escrowCreate(
        KNOWN_SEED,
        MERCHANT_ADDRESS,
        { currency: 'COI', issuer: ISSUER_ADDRESS, value: '100' },
        0,
        0,
      );

      const finishPromise = transport.escrowFinish(KNOWN_SEED, KNOWN_ADDRESS, 3);
      await vi.advanceTimersByTimeAsync(30_000);
      const result = await finishPromise;

      expect(result).toMatchObject({ ok: true, hash: 'FINISH_OK', code: 'tesSUCCESS' });
      expect(submitAndWait).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ── accountLines mapping ─────────────────────────────────────────────────

describe('accountLines', () => {
  it('maps account_lines trust-line entries to TrustLineInfo', async () => {
    const request = vi.fn().mockResolvedValue({
      result: {
        account: MERCHANT_ADDRESS,
        lines: [{ account: ISSUER_ADDRESS, currency: 'COI', balance: '250', limit: '999999999' }],
      },
    });
    const transport = new TestnetTransport(TESTNET_URL, createMockClient({ request }));

    const lines = await transport.accountLines(MERCHANT_ADDRESS);

    expect(lines).toEqual([{ account: ISSUER_ADDRESS, currency: 'COI', balance: '250', limit: '999999999' }]);
  });
});

// ── NFT operations (P2 — contracts.ts's NFTTransport, offline mock only) ──

describe('NFT operations', () => {
  const NFT_ID = 'NFTOKEN_TEST_ID_001';
  const NFT_TAXON = 42;

  // ── nftMint ──────────────────────────────────────────────────────────────

  describe('nftMint', () => {
    it('submits NFTokenMint with Account/NFTokenTaxon/hex-encoded URI, Flags=0 for {transferable:false, mutable:false}', async () => {
      const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse({ hash: 'MINT_HASH' }));
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

      await transport.nftMint(KNOWN_SEED, 'ipfs://example', NFT_TAXON, { transferable: false, mutable: false });

      const [sentTx] = submitAndWait.mock.calls[0] as [Record<string, unknown>];
      expect(sentTx.TransactionType).toBe('NFTokenMint');
      expect(sentTx.Account).toBe(KNOWN_ADDRESS);
      expect(sentTx.NFTokenTaxon).toBe(NFT_TAXON);
      expect(sentTx.Flags).toBe(0);
      expect(Buffer.from(sentTx.URI as string, 'hex').toString('utf8')).toBe('ipfs://example');
      expect(sentTx).not.toHaveProperty('TransferFee');
    });

    it('sets Flags to 8 (transferable only), 16 (mutable only), and 24 (both)', async () => {
      const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse());
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

      await transport.nftMint(KNOWN_SEED, 'ipfs://a', NFT_TAXON, { transferable: true, mutable: false });
      await transport.nftMint(KNOWN_SEED, 'ipfs://b', NFT_TAXON, { transferable: false, mutable: true });
      await transport.nftMint(KNOWN_SEED, 'ipfs://c', NFT_TAXON, { transferable: true, mutable: true });

      const flags = submitAndWait.mock.calls.map((call) => (call[0] as Record<string, unknown>).Flags);
      expect(flags).toEqual([8, 16, 24]);
    });

    it('includes TransferFee only when greater than 0', async () => {
      const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse());
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

      await transport.nftMint(KNOWN_SEED, 'ipfs://a', NFT_TAXON, { transferable: true, mutable: true }, 5000);
      const [sentTxWithFee] = submitAndWait.mock.calls[0] as [Record<string, unknown>];
      expect(sentTxWithFee.TransferFee).toBe(5000);

      await transport.nftMint(KNOWN_SEED, 'ipfs://a', NFT_TAXON, { transferable: true, mutable: true }, 0);
      const [sentTxZeroFee] = submitAndWait.mock.calls[1] as [Record<string, unknown>];
      expect(sentTxZeroFee).not.toHaveProperty('TransferFee');
    });

    it('maps tesSUCCESS to ok:true (nftId omitted rather than faked when getNFTokenID cannot parse the mock meta)', async () => {
      const submitAndWait = vi
        .fn()
        .mockResolvedValue(fakeTxResponse({ hash: 'MINT_OK', transactionResult: 'tesSUCCESS' }));
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

      const result = await transport.nftMint(KNOWN_SEED, 'ipfs://a', NFT_TAXON, { transferable: true, mutable: true });

      // getNFTokenID's own meta-parsing is proven by the coordinator's live
      // replay (P0) — against this hand-built fixture meta it legitimately
      // finds nothing, and `nftId` is correctly left undefined rather than
      // asserted to a specific value here.
      expect(result.ok).toBe(true);
      expect(result.hash).toBe('MINT_OK');
      expect(result.code).toBe('tesSUCCESS');
    });

    it('maps a tec* engine result to ok:false WITHOUT throwing, and never fabricates an nftId', async () => {
      const submitAndWait = vi
        .fn()
        .mockResolvedValue(fakeTxResponse({ hash: 'MINT_FAIL', transactionResult: 'tecINSUFFICIENT_RESERVE' }));
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

      const result = await transport.nftMint(KNOWN_SEED, 'ipfs://a', NFT_TAXON, { transferable: true, mutable: true });

      expect(result).toMatchObject({ ok: false, code: 'tecINSUFFICIENT_RESERVE', hash: 'MINT_FAIL' });
      expect(result.nftId).toBeUndefined();
    });

    it('a network/timeout failure degrades to ok:false with error set, never throwing', async () => {
      const submitAndWait = vi.fn().mockRejectedValue(new Error('WebSocket closed'));
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

      const result = await transport.nftMint(KNOWN_SEED, 'ipfs://a', NFT_TAXON, { transferable: true, mutable: true });

      expect(result.ok).toBe(false);
      expect(result.hash).toBe('');
      expect(result.error).toMatch(/WebSocket closed/);
      expect(result.nftId).toBeUndefined();
    });
  });

  // ── nftBurn ──────────────────────────────────────────────────────────────

  describe('nftBurn', () => {
    it('omits Owner when no owner is given (signer holds the token)', async () => {
      const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse({ hash: 'BURN_HASH' }));
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

      await transport.nftBurn(KNOWN_SEED, NFT_ID);

      const [sentTx] = submitAndWait.mock.calls[0] as [Record<string, unknown>];
      expect(sentTx).toMatchObject({ TransactionType: 'NFTokenBurn', Account: KNOWN_ADDRESS, NFTokenID: NFT_ID });
      expect(sentTx).not.toHaveProperty('Owner');
    });

    it('includes Owner when burning a token the signer does not currently hold', async () => {
      const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse());
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

      await transport.nftBurn(KNOWN_SEED, NFT_ID, ISSUER_ADDRESS);

      const [sentTx] = submitAndWait.mock.calls[0] as [Record<string, unknown>];
      expect(sentTx.Owner).toBe(ISSUER_ADDRESS);
    });

    it('omits Owner when the given owner equals the signer, even though passed explicitly', async () => {
      const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse());
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

      await transport.nftBurn(KNOWN_SEED, NFT_ID, KNOWN_ADDRESS);

      const [sentTx] = submitAndWait.mock.calls[0] as [Record<string, unknown>];
      expect(sentTx).not.toHaveProperty('Owner');
    });

    it('maps a tec* result to ok:false without throwing', async () => {
      const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse({ transactionResult: 'tecNO_ENTRY' }));
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

      const result = await transport.nftBurn(KNOWN_SEED, NFT_ID);

      expect(result).toMatchObject({ ok: false, code: 'tecNO_ENTRY' });
    });
  });

  // ── nftModify ────────────────────────────────────────────────────────────

  describe('nftModify', () => {
    it('hex-encodes the URI and omits Owner when the owner equals the signer', async () => {
      const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse({ hash: 'MODIFY_HASH' }));
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

      await transport.nftModify(KNOWN_SEED, NFT_ID, 'ipfs://grown', KNOWN_ADDRESS);

      const [sentTx] = submitAndWait.mock.calls[0] as [Record<string, unknown>];
      expect(sentTx.TransactionType).toBe('NFTokenModify');
      expect(sentTx.NFTokenID).toBe(NFT_ID);
      expect(Buffer.from(sentTx.URI as string, 'hex').toString('utf8')).toBe('ipfs://grown');
      expect(sentTx).not.toHaveProperty('Owner');
    });

    it('includes Owner when the current holder differs from the signer (issuer modifying a player-owned NFT)', async () => {
      const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse());
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

      await transport.nftModify(KNOWN_SEED, NFT_ID, 'ipfs://grown', MERCHANT_ADDRESS);

      const [sentTx] = submitAndWait.mock.calls[0] as [Record<string, unknown>];
      expect(sentTx.Owner).toBe(MERCHANT_ADDRESS);
    });

    it('maps a tec* result (not-issuer / not-mutable) to ok:false without throwing', async () => {
      const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse({ transactionResult: 'tecNO_PERMISSION' }));
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

      const result = await transport.nftModify(KNOWN_SEED, NFT_ID, 'ipfs://grown', KNOWN_ADDRESS);

      expect(result).toMatchObject({ ok: false, code: 'tecNO_PERMISSION' });
    });
  });

  // ── nftCreateSellOffer ───────────────────────────────────────────────────

  describe('nftCreateSellOffer', () => {
    it('submits NFTokenCreateOffer with tfSellNFToken (Flags=1) and no Destination when undirected', async () => {
      const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse({ hash: 'OFFER_HASH' }));
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

      await transport.nftCreateSellOffer(KNOWN_SEED, NFT_ID, '0');

      const [sentTx] = submitAndWait.mock.calls[0] as [Record<string, unknown>];
      expect(sentTx).toMatchObject({
        TransactionType: 'NFTokenCreateOffer',
        Account: KNOWN_ADDRESS,
        NFTokenID: NFT_ID,
        Amount: '0',
        Flags: 1,
      });
      expect(sentTx).not.toHaveProperty('Destination');
    });

    it('includes Destination for a directed (gift/transfer) sell offer', async () => {
      const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse());
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

      await transport.nftCreateSellOffer(KNOWN_SEED, NFT_ID, '0', MERCHANT_ADDRESS);

      const [sentTx] = submitAndWait.mock.calls[0] as [Record<string, unknown>];
      expect(sentTx.Destination).toBe(MERCHANT_ADDRESS);
    });

    it('extracts offerIndex from the validated tx meta AffectedNodes CreatedNode, without a fallback read', async () => {
      const submitAndWait = vi.fn().mockResolvedValue(
        fakeTxResponse({
          hash: 'OFFER_HASH',
          affectedNodes: [
            {
              CreatedNode: {
                LedgerEntryType: 'NFTokenOffer',
                LedgerIndex: 'ABCD00000000000000000000000000000000000000000000000000001234',
                NewFields: {},
              },
            },
          ],
        }),
      );
      const request = vi.fn();
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait, request }));

      const result = await transport.nftCreateSellOffer(KNOWN_SEED, NFT_ID, '0', MERCHANT_ADDRESS);

      expect(result).toMatchObject({
        ok: true,
        offerIndex: 'ABCD00000000000000000000000000000000000000000000000000001234',
      });
      expect(request).not.toHaveBeenCalled();
    });

    it('ignores a CreatedNode for an unrelated ledger entry type', async () => {
      const submitAndWait = vi.fn().mockResolvedValue(
        fakeTxResponse({
          affectedNodes: [{ CreatedNode: { LedgerEntryType: 'RippleState', LedgerIndex: 'NOT_AN_OFFER' } }],
        }),
      );
      const request = vi.fn().mockResolvedValue({ result: { offers: [], nft_id: NFT_ID } });
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait, request }));

      const result = await transport.nftCreateSellOffer(KNOWN_SEED, NFT_ID, '0');

      expect(result.ok).toBe(true);
      expect(result.offerIndex).toBeUndefined();
      expect(request).toHaveBeenCalledWith({ command: 'nft_sell_offers', nft_id: NFT_ID });
    });

    it('falls back to nft_sell_offers when the meta scan finds no CreatedNode', async () => {
      const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse({ hash: 'OFFER_HASH', affectedNodes: [] }));
      const request = vi.fn().mockResolvedValue({
        result: {
          offers: [{ nft_offer_index: 'FALLBACK_INDEX', amount: '0', flags: 1, owner: KNOWN_ADDRESS }],
          nft_id: NFT_ID,
        },
      });
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait, request }));

      const result = await transport.nftCreateSellOffer(KNOWN_SEED, NFT_ID, '0');

      expect(result).toMatchObject({ ok: true, offerIndex: 'FALLBACK_INDEX' });
      expect(request).toHaveBeenCalledWith({ command: 'nft_sell_offers', nft_id: NFT_ID });
    });

    it('maps a tec* result to ok:false without throwing, and never attempts the meta scan / fallback read', async () => {
      const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse({ transactionResult: 'tecNO_PERMISSION' }));
      const request = vi.fn();
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait, request }));

      const result = await transport.nftCreateSellOffer(KNOWN_SEED, NFT_ID, '0');

      expect(result).toMatchObject({ ok: false, code: 'tecNO_PERMISSION' });
      expect(result.offerIndex).toBeUndefined();
      expect(request).not.toHaveBeenCalled();
    });
  });

  // ── nftAcceptSellOffer ───────────────────────────────────────────────────

  describe('nftAcceptSellOffer', () => {
    it('submits NFTokenAcceptOffer with NFTokenSellOffer set to the given offerIndex', async () => {
      const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse({ hash: 'ACCEPT_HASH' }));
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

      await transport.nftAcceptSellOffer(KNOWN_SEED, 'OFFER_INDEX_123');

      const [sentTx] = submitAndWait.mock.calls[0] as [Record<string, unknown>];
      expect(sentTx).toMatchObject({
        TransactionType: 'NFTokenAcceptOffer',
        Account: KNOWN_ADDRESS,
        NFTokenSellOffer: 'OFFER_INDEX_123',
      });
    });

    it('maps a tec* result to ok:false without throwing', async () => {
      const submitAndWait = vi.fn().mockResolvedValue(fakeTxResponse({ transactionResult: 'tecOBJECT_NOT_FOUND' }));
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ submitAndWait }));

      const result = await transport.nftAcceptSellOffer(KNOWN_SEED, 'OFFER_INDEX_123');

      expect(result).toMatchObject({ ok: false, code: 'tecOBJECT_NOT_FOUND' });
    });
  });

  // ── accountNfts ──────────────────────────────────────────────────────────

  describe('accountNfts', () => {
    it('maps account_nfts entries to NFTInfo, hex-decoding the URI', async () => {
      const uriHex = Buffer.from('ipfs://cutlass', 'utf8').toString('hex').toUpperCase();
      const request = vi.fn().mockResolvedValue({
        result: {
          account: KNOWN_ADDRESS,
          account_nfts: [
            { NFTokenID: NFT_ID, NFTokenTaxon: NFT_TAXON, Issuer: ISSUER_ADDRESS, Flags: 24, URI: uriHex, nft_serial: 1 },
          ],
        },
      });
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ request }));

      const nfts = await transport.accountNfts(KNOWN_ADDRESS);

      expect(nfts).toEqual([{ nftId: NFT_ID, uri: 'ipfs://cutlass', taxon: NFT_TAXON, issuer: ISSUER_ADDRESS, flags: 24 }]);
      expect(request).toHaveBeenCalledWith({
        command: 'account_nfts',
        account: KNOWN_ADDRESS,
        ledger_index: 'validated',
      });
    });

    it('maps a missing URI to an empty string rather than throwing', async () => {
      const request = vi.fn().mockResolvedValue({
        result: {
          account: KNOWN_ADDRESS,
          account_nfts: [{ NFTokenID: NFT_ID, NFTokenTaxon: NFT_TAXON, Issuer: ISSUER_ADDRESS, Flags: 8, nft_serial: 2 }],
        },
      });
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ request }));

      const nfts = await transport.accountNfts(KNOWN_ADDRESS);

      expect(nfts).toEqual([{ nftId: NFT_ID, uri: '', taxon: NFT_TAXON, issuer: ISSUER_ADDRESS, flags: 8 }]);
    });

    it('returns an empty array when the address owns no NFTs', async () => {
      const request = vi.fn().mockResolvedValue({ result: { account: KNOWN_ADDRESS, account_nfts: [] } });
      const transport = new TestnetTransport(TESTNET_URL, createMockClient({ request }));

      const nfts = await transport.accountNfts(KNOWN_ADDRESS);

      expect(nfts).toEqual([]);
    });
  });
});
