// TestnetTransport — the REAL xrpl.js testnet transport (Phase 2). Sibling of
// DryRunTransport (./dry-run.ts) behind the same `LedgerTransport` contract
// (../contracts.ts): every observable shape (TxResult, TrustLineInfo, TxEntry)
// matches exactly, but every call here is a real signed submission against
// XRPL Testnet — no counters, no in-memory ledger.
//
// Grounded in:
//  - The Phase-0 spike (E:/AI/_ledger_spike/spike.mjs) for the exact
//    tesSUCCESS xrpl.js-5 tx shapes this ports 1:1: AccountSet(SetFlag),
//    TrustSet, Payment(IssuedCurrencyAmount), EscrowCreate(FinishAfter/
//    CancelAfter) -> EscrowFinish, account_lines, account_tx + hex memo
//    decode.
//  - escape-the-valley's backpack.py for the wall-clock-deadline WRITE
//    discipline (XRPL_REQUEST_TIMEOUT / XRPL_WRITE_DEADLINE): a stalled
//    testnet node must degrade this transport to a graceful `TxResult`
//    failure, never hang the caller. `withDeadline` below is this package's
//    version of backpack.py's `_submit_and_wait_bounded` (JS has no daemon
//    threads, so we race a timeout against the xrpl.js call instead of
//    running it on a killable worker — the guarantee it ports is "the CALLER
//    is never blocked past the deadline", not "the dangling network call is
//    cancelled", exactly like the Python original's own caveat).
//
// CRITICAL escrow timing (the one thing dry-run.ts does not have to solve):
// settle-impl's `executeDeltas()` calls `escrowCreate()` then
// `escrowFinish()` back-to-back, synchronously. On a real ledger a token
// escrow cannot be finished until its `FinishAfter` has actually elapsed in
// ledger-close time. The `finishAfter`/`cancelAfter` PARAMETERS the adapter
// passes into `escrowCreate` are deterministic-counter TICKS (see
// adapter.ts's `nextId()` — 0, 1, 2, ... ), not wall-clock time: meaningful to
// dry-run's clockless simulation (which ignores them outright — see
// dry-run.ts's `_finishAfter`/`_cancelAfter`), meaningless on a real chain.
// This transport therefore ALSO ignores them and computes its own real
// ripple-epoch `FinishAfter`/`CancelAfter`, tracking (owner, sequence) ->
// FinishAfter locally so a synchronous `escrowFinish` right after knows how
// long to wait before the chain will actually accept it. The timing lives
// entirely inside this transport — the adapter and its tick counter stay
// oblivious to real time (the interface stays transport-agnostic).
//
// Also implements `NFTTransport` (../contracts.ts's "NFT UNIQUE-GEAR LAYER"),
// added at P2: NFTokenMint/Burn/Modify/CreateSellOffer/AcceptSellOffer plus
// the account_nfts read — the exact tx shapes the Phase-0 spike proved LIVE
// on testnet (2026-07-23, xrpl.js 5.0.0). Unlike the escrow timing above, NFT
// operations carry NO transport-local state: every read (`accountNfts`, the
// `nft_sell_offers` fallback in `nftCreateSellOffer`) goes straight back to
// the real ledger, so there is nothing here to track between calls.

import { Buffer } from 'node:buffer';
import * as xrpl from 'xrpl';
import type {
  IssuedAmount,
  LedgerTransport,
  NFTInfo,
  NFTMintFlags,
  NFTMintResult,
  NFTOfferResult,
  NFTSellOfferInfo,
  NFTTransport,
  TrustLineInfo,
  TxEntry,
  TxResult,
  WalletHandle,
} from '../contracts.js';
import {
  assertTestnetHost,
  assertTestnetLedgerIdentity,
  networkNameFromEndpoint,
  resolveTestnetEndpoint,
} from '../security/index.js';

// ── Wall-clock write discipline (backpack.py XRPL_REQUEST_TIMEOUT/WRITE_DEADLINE) ──
// Every network call this transport makes is bounded by a wall-clock deadline
// so a stalled testnet node degrades to a graceful TxResult failure instead of
// hanging the caller forever.
const REQUEST_DEADLINE_MS = 30_000; // a single request/response round-trip (connect, account_lines, account_tx)
const WRITE_DEADLINE_MS = 60_000; // submitAndWait's own validation-poll loop (2x the request deadline)
/** Bound on account_lines / account_nfts / account_tx / nft_sell_offers marker loops. */
const MAX_LEDGER_PAGES = 32;
/** Per-page size when accountTx is asked for every page (rippled max is 400). */
const ACCOUNT_TX_PAGE = 400;
/** After the write deadline fires, observe a dangling submitAndWait this long
 *  so a late tesSUCCESS is still checkpointed. If the node is actually stalled,
 *  this second race returns `{ ok: false }` instead of hanging the caller. */
const LATE_SUBMIT_OBSERVE_MS = 5_000;

// ── Escrow FinishAfter timing (the CRITICAL synchronous create->finish fix) ──
const ESCROW_FINISH_BUFFER_SECONDS = 8; // FinishAfter = rippleNow() + this
const ESCROW_CANCEL_WINDOW_SECONDS = 3_600; // CancelAfter = rippleNow() + this (mandatory for a token escrow)
const ESCROW_WAIT_POLL_MS = 1_000; // poll interval while waiting out FinishAfter (pre-submit and retry)
const ESCROW_WAIT_MARGIN_MS = 2_000; // extra margin past FinishAfter before the first submit attempt
const ESCROW_WAIT_DEADLINE_MS = 40_000; // bounded ceiling on the pre-submit wait
const ESCROW_FINISH_RETRY_DEADLINE_MS = 30_000; // bounded ceiling on post-submit "too early" retries
/** The engine result XRPL returns for an EscrowFinish attempted before its
 *  escrow's FinishAfter has passed — the one code this transport retries on. */
const ESCROW_TOO_EARLY_CODE = 'tecNO_PERMISSION';

const RIPPLE_EPOCH_OFFSET_SECONDS = 946_684_800; // 2000-01-01T00:00:00Z minus the Unix epoch

const DEFAULT_TESTNET_URL = 'wss://s.altnet.rippletest.net:51233';

// ── NFToken flags (XLS-20; tf* mint/offer flags share bit positions with the
// resulting ledger object's lsf* Flags — mirrors dry-run.ts's own constants) ──
const NFT_FLAG_TRANSFERABLE = 0x8; // tfTransferable
const NFT_FLAG_MUTABLE = 0x10; // tfMutable (XLS-46 DynamicNFT)
const NFT_FLAG_SELL = 0x1; // tfSellNFToken (NFTokenCreateOffer)

// ── Small pure helpers ───────────────────────────────────────────────────

function rippleNowSeconds(): number {
  return Math.floor(Date.now() / 1000) - RIPPLE_EPOCH_OFFSET_SECONDS;
}

function rippleSecondsToUnixMs(rippleSeconds: number): number {
  return (rippleSeconds + RIPPLE_EPOCH_OFFSET_SECONDS) * 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function hexEncode(text: string): string {
  return Buffer.from(text, 'utf8').toString('hex').toUpperCase();
}

function hexDecode(hexText: string): string {
  return Buffer.from(hexText, 'hex').toString('utf8');
}

/** Never let a malformed on-chain memo blow up account_tx reads. */
function safeHexDecode(hexText: string): string | undefined {
  try {
    return hexDecode(hexText);
  } catch {
    return undefined;
  }
}

function memoEntry(memo: string): xrpl.Memo {
  return { Memo: { MemoData: hexEncode(memo), MemoType: hexEncode('text/plain') } };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Best-effort engine result code out of a submitAndWait response's `meta`
 *  (`TransactionMetadata<T> | string | undefined` — binary mode returns a
 *  hex string, which we never request, but this stays honest about the type
 *  rather than assuming the object shape). */
function resultCodeOf(meta: unknown): string {
  if (typeof meta === 'object' && meta !== null && 'TransactionResult' in meta) {
    const value = (meta as { TransactionResult: unknown }).TransactionResult;
    if (typeof value === 'string') return value;
  }
  return 'unknown';
}

/**
 * Races `work` against a wall-clock timeout so a stalled node degrades to a
 * rejection instead of hanging the caller forever (the module doc's
 * backpack.py `XRPL_WRITE_DEADLINE` discipline, ported to JS). The dangling
 * underlying xrpl.js call cannot be cancelled — `submitAndWait`/`request`
 * expose no abort signal in this xrpl.js version — but racing means it can
 * never block the CALLER past `ms`, which is the "degrade, never freeze"
 * guarantee this ports, not "the socket write disappears".
 */
function withDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} exceeded its ${ms}ms deadline (testnet stalled)`));
    }, ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(errorMessage(err)));
      },
    );
  });
}

function escrowKey(owner: string, sequence: number): string {
  return `${owner} ${sequence}`;
}

// ── The mockable slice of xrpl.js's Client ──────────────────────────────
//
// Kept narrow (only the 5 calls this transport actually makes) so the
// offline test suite can inject a plain object built with `vi.fn()` instead
// of opening a real WebSocket connection. `xrpl.Client` satisfies this
// structurally — production code always gets the real thing via the
// constructor; tests inject a mock through `forTests`. `fundWallet` is redeclared without xrpl.js's own
// `this: Client` parameter (the only method on `Client` that carries one) so
// a plain mock object — which has no `Client` identity to bind `this` to —
// can implement it directly.
export interface XrplClientLike {
  connect: xrpl.Client['connect'];
  disconnect: xrpl.Client['disconnect'];
  fundWallet(): Promise<{ wallet: xrpl.Wallet; balance: number }>;
  submitAndWait: xrpl.Client['submitAndWait'];
  request: xrpl.Client['request'];
}


function injectedClientUrl(client: XrplClientLike): string | undefined {
  const conn = (client as { connection?: { getUrl?: () => string; url?: unknown } }).connection;
  if (conn && typeof conn.getUrl === 'function') {
    const url = conn.getUrl();
    if (url) return url;
  }
  if (conn && typeof conn.url === 'string' && conn.url.length > 0) {
    return conn.url;
  }
  if ('url' in client && typeof (client as { url: unknown }).url === 'string') {
    const url = (client as { url: string }).url;
    return url.length > 0 ? url : undefined;
  }
  return undefined;
}

function mapSubmitResponse(res: {
  result: { hash?: string; meta?: unknown; tx_json?: { Sequence?: number } };
}): { result: TxResult; meta: unknown } {
  const code = resultCodeOf(res.result.meta);
  const hash = res.result.hash ?? '';
  if (code !== 'tesSUCCESS') {
    return { result: { ok: false, hash, code, error: `engine result ${code}` }, meta: res.result.meta };
  }
  const sequence = res.result.tx_json?.Sequence;
  const result: TxResult = sequence !== undefined ? { ok: true, hash, code, sequence } : { ok: true, hash, code };
  return { result, meta: res.result.meta };
}

/**
 * The real testnet transport. Constructing one performs NO network I/O
 * (`xrpl.Client`'s constructor just configures a connection; `connect()` is
 * the first call that touches the wire) — only `resolveTestnetEndpoint`
 * validates `url` synchronously, so a non-testnet host throws immediately at
 * construction, before any transport method could ever be called.
 */
export class TestnetTransport implements LedgerTransport, NFTTransport {
  readonly networkName: 'testnet' | 'devnet';

  private client: XrplClientLike;
  private connected = false;

  /** (owner, sequence) -> the real ripple-epoch FinishAfter `escrowCreate`
   *  computed for that escrow, so a synchronous `escrowFinish` right after
   *  knows how long to wait before the chain will actually accept it.
   *  Consumed (deleted) by `escrowFinish` on first lookup — an escrow this
   *  transport instance did not itself create (e.g. a cross-process resume)
   *  simply isn't tracked, and `escrowFinish` submits immediately without a
   *  wait, exactly like DryRunTransport's clockless "always finishable". */
  private readonly escrowFinishAfter = new Map<string, number>();

  constructor(url: string = DEFAULT_TESTNET_URL) {
    const resolved = resolveTestnetEndpoint(url);
    this.networkName = networkNameFromEndpoint(resolved);
    this.client = new xrpl.Client(resolved);
  }

  /**
   * Test-only injection seam. NOT on the public package barrel — production
   * callers construct `new TestnetTransport(url)` and always get a real
   * `xrpl.Client` pointed at a host that passed `resolveTestnetEndpoint`.
   * An injected client that itself exposes a URL/connection must ALSO pass
   * `assertTestnetHost` so `forTests(testnetUrl, new xrpl.Client(mainnet))`
   * cannot punch through the mainnet-impossible guard.
   */
  static forTests(url: string, client: XrplClientLike): TestnetTransport {
    resolveTestnetEndpoint(url);
    const injectedUrl = injectedClientUrl(client);
    if (injectedUrl !== undefined) {
      assertTestnetHost(injectedUrl);
    }
    const transport = new TestnetTransport(url);
    transport.client = client;
    return transport;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await withDeadline(this.client.connect(), REQUEST_DEADLINE_MS, 'connect()');
    try {
      const res = await withDeadline(
        this.client.request({ command: 'server_info' } as xrpl.ServerInfoRequest),
        REQUEST_DEADLINE_MS,
        'server_info',
      );
      const info = (res as { result?: { info?: { network_id?: unknown; network?: unknown } } }).result
        ?.info;
      assertTestnetLedgerIdentity(info ?? {});
    } catch (err) {
      this.connected = false;
      try {
        await withDeadline(this.client.disconnect(), REQUEST_DEADLINE_MS, 'disconnect() after identity miss');
      } catch {
        // Best-effort close — the identity failure is what the caller sees.
      }
      throw err instanceof Error ? err : new Error(errorMessage(err));
    }
    this.connected = true;
  }

  /** Auto-connect once, like xrpl.js clients that open the socket on first use. */
  private async ensureConnected(): Promise<void> {
    if (!this.connected) await this.connect();
  }

  /** Follow result.marker until exhausted or `maxItems` collected. Page failures
   *  name the command so a stalled node is distinguishable from an empty book. */
  private async collectPages<T>(
    label: string,
    fetchPage: (marker: unknown | undefined) => Promise<{ items: T[]; marker?: unknown }>,
    maxItems?: number,
  ): Promise<T[]> {
    const out: T[] = [];
    let marker: unknown | undefined;
    for (let page = 0; page < MAX_LEDGER_PAGES; page++) {
      let items: T[];
      let next: unknown | undefined;
      try {
        const res = await fetchPage(marker);
        items = res.items;
        next = res.marker;
      } catch (err) {
        throw new Error(`${label} page ${page + 1} failed: ${errorMessage(err)}`);
      }
      out.push(...items);
      if (maxItems !== undefined && out.length >= maxItems) return out.slice(0, maxItems);
      if (next === undefined) return out;
      marker = next;
    }
    return out;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    this.connected = false;
    try {
      await withDeadline(this.client.disconnect(), REQUEST_DEADLINE_MS, 'disconnect()');
    } catch {
      // Graceful degradation: nothing left to clean up on our side either
      // way — `connected` is already flipped false above.
    }
  }

  async fundWallet(): Promise<WalletHandle> {
    await this.ensureConnected();
    const { wallet } = await withDeadline(this.client.fundWallet(), WRITE_DEADLINE_MS, 'fundWallet()');
    if (wallet.seed === undefined) {
      throw new Error(
        'fundWallet(): xrpl.js returned a wallet with no seed — cannot reconstruct it later via walletFromSeed()',
      );
    }
    return { address: wallet.address, seed: wallet.seed };
  }

  walletFromSeed(seed: string): WalletHandle {
    const wallet = xrpl.Wallet.fromSeed(seed);
    return { address: wallet.address, seed };
  }

  async setAccountFlag(seed: string, flag: number): Promise<TxResult> {
    const wallet = xrpl.Wallet.fromSeed(seed);
    const tx: xrpl.AccountSet = {
      TransactionType: 'AccountSet',
      Account: wallet.address,
      SetFlag: flag as xrpl.AccountSetAsfFlags,
    };
    return this.submit(tx, wallet);
  }

  async trustSet(seed: string, issuer: string, currency: string, limit: string): Promise<TxResult> {
    const wallet = xrpl.Wallet.fromSeed(seed);
    const tx: xrpl.TrustSet = {
      TransactionType: 'TrustSet',
      Account: wallet.address,
      LimitAmount: { currency, issuer, value: limit },
    };
    return this.submit(tx, wallet);
  }

  /**
   * The `diary` mode primitive: a value-free anchor carrying a memo.
   *
   * A no-op `AccountSet` — no flags set, no value moved — with the memo
   * attached. The only cost is the transaction fee.
   *
   * NOT a 1-drop self-payment, which is the obvious shape and the one this
   * started as: live XRPL rejects a Payment whose Account equals its
   * Destination with `temREDUNDANT`. The DryRunTransport happily accepted it,
   * so the whole diary suite and a full dry-run replay went green before a
   * live testnet run failed at the first anchor. DryRunTransport now models
   * that rule too (see its own anchorMemo), which is what stops the next
   * transport-shaped bug from reaching the network.
   */
  async anchorMemo(seed: string, memo: string): Promise<TxResult> {
    const wallet = xrpl.Wallet.fromSeed(seed);
    const tx: xrpl.AccountSet = {
      TransactionType: 'AccountSet',
      Account: wallet.address,
      Memos: [memoEntry(memo)],
    };
    return this.submit(tx, wallet);
  }

  async payment(seed: string, destination: string, amount: IssuedAmount, memo?: string): Promise<TxResult> {
    const wallet = xrpl.Wallet.fromSeed(seed);
    const tx: xrpl.Payment = {
      TransactionType: 'Payment',
      Account: wallet.address,
      Destination: destination,
      Amount: { currency: amount.currency, issuer: amount.issuer, value: amount.value },
      ...(memo !== undefined ? { Memos: [memoEntry(memo)] } : {}),
    };
    return this.submit(tx, wallet);
  }

  async escrowCreate(
    seed: string,
    destination: string,
    amount: IssuedAmount,
    _finishAfter: number,
    _cancelAfter: number,
    memo?: string,
  ): Promise<TxResult> {
    // _finishAfter/_cancelAfter are the adapter's deterministic-counter TICKS
    // (see the module doc) — deliberately unused. Real ripple-epoch values
    // are computed here instead, exactly as dry-run.ts's own same-named
    // underscored params are accepted-but-ignored for interface parity.
    const wallet = xrpl.Wallet.fromSeed(seed);
    const rNow = rippleNowSeconds();
    const finishAfter = rNow + ESCROW_FINISH_BUFFER_SECONDS;
    const cancelAfter = rNow + ESCROW_CANCEL_WINDOW_SECONDS;

    const tx: xrpl.EscrowCreate = {
      TransactionType: 'EscrowCreate',
      Account: wallet.address,
      Destination: destination,
      Amount: { currency: amount.currency, issuer: amount.issuer, value: amount.value },
      FinishAfter: finishAfter,
      CancelAfter: cancelAfter,
      ...(memo !== undefined ? { Memos: [memoEntry(memo)] } : {}),
    };

    const result = await this.submit(tx, wallet);
    if (result.ok && result.sequence !== undefined) {
      this.escrowFinishAfter.set(escrowKey(wallet.address, result.sequence), finishAfter);
    }
    return result;
  }

  async escrowFinish(seed: string, owner: string, offerSequence: number): Promise<TxResult> {
    const wallet = xrpl.Wallet.fromSeed(seed);

    const key = escrowKey(owner, offerSequence);
    const finishAfter = this.escrowFinishAfter.get(key);
    if (finishAfter !== undefined) {
      this.escrowFinishAfter.delete(key);
      try {
        await this.waitForFinishAfter(finishAfter);
      } catch (err) {
        // Bounded wait exceeded its ceiling: degrade to a graceful failure,
        // never hang the caller (the same discipline `withDeadline` gives
        // every network call, applied to this transport-local wait).
        return { ok: false, hash: '', code: 'local-wait-timeout', error: errorMessage(err) };
      }
    }

    const tx: xrpl.EscrowFinish = {
      TransactionType: 'EscrowFinish',
      Account: wallet.address,
      Owner: owner,
      OfferSequence: offerSequence,
    };

    // Belt-and-suspenders: the pre-submit wait above should already clear
    // FinishAfter, but ledger-close jitter can still land a first attempt a
    // beat early. Retry ONLY on the specific "too early" engine result,
    // bounded by its own deadline — any other failure (including a second,
    // different tec/tem code) returns immediately, never masked by a retry.
    const retryDeadline = Date.now() + ESCROW_FINISH_RETRY_DEADLINE_MS;
    for (;;) {
      const result = await this.submit(tx, wallet);
      if (result.ok || result.code !== ESCROW_TOO_EARLY_CODE || Date.now() >= retryDeadline) {
        return result;
      }
      await sleep(ESCROW_WAIT_POLL_MS);
    }
  }

  async accountLines(address: string): Promise<TrustLineInfo[]> {
    await this.ensureConnected();
    return this.collectPages(`account_lines(${address})`, async (marker) => {
      const req: xrpl.AccountLinesRequest = { command: 'account_lines', account: address };
      if (marker !== undefined) req.marker = marker as xrpl.AccountLinesRequest['marker'];
      const res = await withDeadline(
        this.client.request<xrpl.AccountLinesRequest>(req),
        REQUEST_DEADLINE_MS,
        'account_lines',
      );
      return {
        items: res.result.lines.map((line) => ({
          account: line.account,
          currency: line.currency,
          balance: line.balance,
          limit: line.limit,
        })),
        marker: res.result.marker,
      };
    });
  }

  /** account_tx — most recent first (rippled's default `forward: false`),
   *  matching DryRunTransport's own "most recent first" convention.
   *  Omitted `limit` follows every marker page (bounded); a numeric limit
   *  still paginates until that many entries are collected. */
  async accountTx(address: string, limit?: number): Promise<TxEntry[]> {
    await this.ensureConnected();
    const pageLimit = limit !== undefined ? Math.min(Math.max(limit, 1), ACCOUNT_TX_PAGE) : ACCOUNT_TX_PAGE;
    return this.collectPages(
      `account_tx(${address})`,
      async (marker) => {
        const req: xrpl.AccountTxRequest = { command: 'account_tx', account: address, limit: pageLimit };
        if (marker !== undefined) req.marker = marker as xrpl.AccountTxRequest['marker'];
        const res = await withDeadline(
          this.client.request<xrpl.AccountTxRequest>(req),
          REQUEST_DEADLINE_MS,
          'account_tx',
        );
        const entries: TxEntry[] = [];
        for (const raw of res.result.transactions) {
          const tx = (raw as {
            tx_json?: {
              hash?: string;
              TransactionType?: string;
              Sequence?: number;
              Destination?: string;
              Amount?: { currency?: string; value?: string } | string;
              Memos?: Array<{ Memo?: { MemoData?: string } }>;
            };
            hash?: string;
          }).tx_json;
          const hash = (raw as { hash?: string }).hash ?? tx?.hash ?? '';
          const type = tx?.TransactionType ?? 'Unknown';
          const memoHex = tx?.Memos?.[0]?.Memo?.MemoData;
          const memo = memoHex !== undefined ? safeHexDecode(memoHex) : undefined;
          const sequence = typeof tx?.Sequence === 'number' ? tx.Sequence : undefined;
          const mapped: TxEntry = { hash, type };
          if (memo !== undefined) mapped.memo = memo;
          if (sequence !== undefined) mapped.sequence = sequence;
          if (typeof tx?.Destination === 'string') mapped.destination = tx.Destination;
          const amount = tx?.Amount;
          if (amount && typeof amount === 'object') {
            if (typeof amount.currency === 'string') mapped.currency = amount.currency;
            if (typeof amount.value === 'string') mapped.value = amount.value;
          }
          entries.push(mapped);
        }
        return { items: entries, marker: res.result.marker };
      },
      limit,
    );
  }

  // ── NFT operations (XLS-20 mint/transfer/burn, XLS-46 NFTokenModify) ─────
  //
  // The tx shapes below are the exact tesSUCCESS shapes the Phase-0 spike
  // proved LIVE on testnet (2026-07-23, xrpl.js 5.0.0) — see contracts.ts's
  // "NFT UNIQUE-GEAR LAYER" section for the full grounding. A SEPARATE
  // capability from the fungible `LedgerTransport` methods above
  // (DECOMPOSE_BY_SECRETS: the NFT concern never shares state with the
  // trust-line/escrow bookkeeping) — this transport carries no NFT state of
  // its own at all, unlike DryRunTransport's in-memory `nfts`/`nftOffers`
  // maps, because every read here goes straight back to the real ledger.

  /** NFTokenMint. `flags` -> tfTransferable|tfMutable; `transferFee` (only
   *  sent when > 0) is in units of 1/100000. Extracts the minted NFTokenID
   *  from the validated tx's metadata via `xrpl.getNFTokenID` on success. */
  async nftMint(
    seed: string,
    uri: string,
    taxon: number,
    flags: NFTMintFlags,
    transferFee?: number,
  ): Promise<NFTMintResult> {
    const wallet = xrpl.Wallet.fromSeed(seed);
    const tx: xrpl.NFTokenMint = {
      TransactionType: 'NFTokenMint',
      Account: wallet.address,
      URI: hexEncode(uri),
      NFTokenTaxon: taxon,
      Flags: (flags.transferable ? NFT_FLAG_TRANSFERABLE : 0) | (flags.mutable ? NFT_FLAG_MUTABLE : 0),
      ...(transferFee !== undefined && transferFee > 0 ? { TransferFee: transferFee } : {}),
    };
    const { result, meta } = await this.submitWithMeta(tx, wallet);
    if (!result.ok) return result;
    // Single localized cast (this file's one such boundary, alongside the
    // test file's own `XrplClientLike` cast comment): `submitWithMeta` keeps
    // `meta` as `unknown` (the same honesty `resultCodeOf` already keeps
    // about this field) but `getNFTokenID` wants xrpl.js's own metadata
    // union type. We never assume the shape ourselves — `getNFTokenID` does
    // its own internal parsing and returns `undefined` on anything it can't
    // read, which is exactly how a network/parse miss degrades here too.
    const nftId = xrpl.getNFTokenID(meta as xrpl.TransactionMetadata | string | undefined);
    return nftId !== undefined ? { ...result, nftId } : result;
  }

  /** NFTokenBurn — the named compensator for a mint. `owner` is put on the
   *  wire tx only when burning a token the signer no longer holds. */
  async nftBurn(seed: string, nftId: string, owner?: string): Promise<TxResult> {
    const wallet = xrpl.Wallet.fromSeed(seed);
    const tx: xrpl.NFTokenBurn = {
      TransactionType: 'NFTokenBurn',
      Account: wallet.address,
      NFTokenID: nftId,
      ...(owner && owner !== wallet.address ? { Owner: owner } : {}),
    };
    return this.submit(tx, wallet);
  }

  /** NFTokenModify (XLS-46 DynamicNFT) — advances a mutable NFT's URI (relic
   *  growth). The signer must be the issuer/authorized-minter; that's the
   *  caller's concern (the adapter signs with `state.issuerAddress`'s seed) —
   *  this transport only builds and submits the tx. `owner` (the current
   *  holder) is omitted from the wire tx when it equals the signer. */
  async nftModify(seed: string, nftId: string, uri: string, owner: string): Promise<TxResult> {
    const wallet = xrpl.Wallet.fromSeed(seed);
    const tx: xrpl.NFTokenModify = {
      TransactionType: 'NFTokenModify',
      Account: wallet.address,
      NFTokenID: nftId,
      URI: hexEncode(uri),
      ...(owner && owner !== wallet.address ? { Owner: owner } : {}),
    };
    return this.submit(tx, wallet);
  }

  /** NFTokenCreateOffer (sell-only, tfSellNFToken). A directed 0-value sell
   *  (`amount:'0'` + `destination`) is the gift/transfer path used to move
   *  minted gear to the player. Extracts the created offer's ledger index by
   *  scanning the validated tx's `AffectedNodes` for the new NFTokenOffer;
   *  falls back to an `nft_sell_offers` read if the meta scan comes up empty. */
  async nftCreateSellOffer(
    seed: string,
    nftId: string,
    amount: string,
    destination?: string,
  ): Promise<NFTOfferResult> {
    const wallet = xrpl.Wallet.fromSeed(seed);
    const tx: xrpl.NFTokenCreateOffer = {
      TransactionType: 'NFTokenCreateOffer',
      Account: wallet.address,
      NFTokenID: nftId,
      Amount: amount,
      Flags: NFT_FLAG_SELL, // tfSellNFToken
      ...(destination !== undefined ? { Destination: destination } : {}),
    };
    const { result, meta } = await this.submitWithMeta(tx, wallet);
    if (!result.ok) return result;
    const offerIndex = this.extractCreatedOfferIndex(meta) ?? (await this.lookupSellOfferIndex(nftId));
    return offerIndex !== undefined ? { ...result, offerIndex } : result;
  }

  /** NFTokenAcceptOffer — accept a sell offer by its ledger index (settles
   *  the transfer atomically). */
  async nftAcceptSellOffer(seed: string, offerIndex: string): Promise<TxResult> {
    const wallet = xrpl.Wallet.fromSeed(seed);
    const tx: xrpl.NFTokenAcceptOffer = {
      TransactionType: 'NFTokenAcceptOffer',
      Account: wallet.address,
      NFTokenSellOffer: offerIndex,
    };
    return this.submit(tx, wallet);
  }

  async nftSellOffers(nftId: string): Promise<NFTSellOfferInfo[]> {
    await this.ensureConnected();
    return this.collectPages(`nft_sell_offers(${nftId})`, async (marker) => {
      const req: xrpl.NFTSellOffersRequest = { command: 'nft_sell_offers', nft_id: nftId };
      if (marker !== undefined) req.marker = marker as xrpl.NFTSellOffersRequest['marker'];
      const res = await withDeadline(
        this.client.request<xrpl.NFTSellOffersRequest>(req),
        REQUEST_DEADLINE_MS,
        'nft_sell_offers',
      );
      return {
        items: (res.result.offers ?? []).map((o) => ({
          offerIndex: o.nft_offer_index,
          nftId,
          destination: o.destination,
          owner: o.owner,
        })),
        marker: res.result.marker,
      };
    });
  }

  /** account_nfts — the external-verifier read: every NFT `address` owns. */
  async accountNfts(address: string): Promise<NFTInfo[]> {
    await this.ensureConnected();
    return this.collectPages(`account_nfts(${address})`, async (marker) => {
      const req: xrpl.AccountNFTsRequest = {
        command: 'account_nfts',
        account: address,
        ledger_index: 'validated',
      };
      if (marker !== undefined) req.marker = marker as xrpl.AccountNFTsRequest['marker'];
      const res = await withDeadline(
        this.client.request<xrpl.AccountNFTsRequest>(req),
        REQUEST_DEADLINE_MS,
        'account_nfts',
      );
      return {
        items: res.result.account_nfts.map((n) => ({
          nftId: n.NFTokenID,
          uri: n.URI ? safeHexDecode(n.URI) ?? '' : '',
          taxon: n.NFTokenTaxon,
          issuer: n.Issuer,
          flags: n.Flags,
        })),
        marker: res.result.marker,
      };
    });
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  /** Blocks (bounded) until `finishAfterRipple` (+ a small margin) has
   *  passed in wall-clock time. Testnet ledger `close_time` tracks real UTC
   *  closely enough that a local `Date.now()` proxy is the same approach the
   *  Phase-0 spike used (`sleep(14000)` after a `+10s` FinishAfter). */
  private async waitForFinishAfter(finishAfterRipple: number): Promise<void> {
    const targetMs = rippleSecondsToUnixMs(finishAfterRipple) + ESCROW_WAIT_MARGIN_MS;
    const deadlineMs = Date.now() + ESCROW_WAIT_DEADLINE_MS;
    while (Date.now() < targetMs) {
      if (Date.now() >= deadlineMs) {
        throw new Error(`waitForFinishAfter: exceeded ${ESCROW_WAIT_DEADLINE_MS}ms bound waiting for FinishAfter`);
      }
      await sleep(Math.min(ESCROW_WAIT_POLL_MS, targetMs - Date.now()));
    }
  }

  /** Submit + wait for validation, mapped to `TxResult`. A thin wrapper over
   *  `submitWithMeta` that drops the raw meta — every fungible method above,
   *  plus `nftBurn`/`nftModify`/`nftAcceptSellOffer`, only need the mapped
   *  fields. NEVER throws on a tec/tem engine result (contracts.ts: those map
   *  to `{ ok: false, code }`) — only a network/timeout failure produces the
   *  `error`-carrying branch. Signature and behavior UNCHANGED from before
   *  `submitWithMeta` existed — every existing caller/test is unaffected. */
  private async submit<T extends xrpl.SubmittableTransaction>(tx: T, wallet: xrpl.Wallet): Promise<TxResult> {
    return (await this.submitWithMeta(tx, wallet)).result;
  }

  /** The same withDeadline + try/catch + resultCodeOf discipline `submit`
   *  uses (in fact `submit` now delegates here) — but ALSO surfaces the raw
   *  `meta` alongside the mapped `TxResult`. Needed by `nftMint` (to pull the
   *  minted NFTokenID via `xrpl.getNFTokenID`) and `nftCreateSellOffer` (to
   *  scan `AffectedNodes` for the created offer's ledger index). `meta` is
   *  `undefined` on the network/timeout failure branch (no response to read
   *  one from) and otherwise whatever xrpl.js's own `TxResponse.result.meta`
   *  was — kept `unknown` rather than assumed, exactly like `resultCodeOf`
   *  already stays honest about this same field. */
  private async submitWithMeta<T extends xrpl.SubmittableTransaction>(
    tx: T,
    wallet: xrpl.Wallet,
  ): Promise<{ result: TxResult; meta: unknown }> {
    await this.ensureConnected();
    const work = this.client.submitAndWait<T>(tx, { wallet, autofill: true });
    try {
      const res = await withDeadline(work, WRITE_DEADLINE_MS, `submitAndWait(${tx.TransactionType})`);
      return mapSubmitResponse(res);
    } catch (err) {
      // Deadline fired, but the dangling submitAndWait cannot be cancelled and
      // may still (or may already) have validated tesSUCCESS. Observe that
      // result so a retry does not submit a second write for a tx that landed.
      // Bound the observe window: an unbounded `await work` would freeze the
      // caller if the testnet node is actually stalled (the case the deadline
      // exists for).
      try {
        const res = await withDeadline(
          work,
          LATE_SUBMIT_OBSERVE_MS,
          `submitAndWait(${tx.TransactionType}) late observe`,
        );
        return mapSubmitResponse(res);
      } catch {
        return { result: { ok: false, hash: '', code: 'local-error', error: errorMessage(err) }, meta: undefined };
      }
    }
  }

  /** Scan a NFTokenCreateOffer's validated `AffectedNodes` for the
   *  CreatedNode whose ledger entry is the new NFTokenOffer, returning its
   *  ledger index (the argument NFTokenAcceptOffer consumes). `undefined` if
   *  the shape isn't there — the caller falls back to an `nft_sell_offers`
   *  read rather than failing. */
  private extractCreatedOfferIndex(meta: unknown): string | undefined {
    if (typeof meta === 'object' && meta !== null && 'AffectedNodes' in meta) {
      const nodes = (meta as { AffectedNodes: unknown }).AffectedNodes;
      if (Array.isArray(nodes)) {
        for (const node of nodes) {
          if (typeof node === 'object' && node !== null && 'CreatedNode' in node) {
            const created = (node as { CreatedNode: { LedgerEntryType?: unknown; LedgerIndex?: unknown } })
              .CreatedNode;
            if (created?.LedgerEntryType === 'NFTokenOffer' && typeof created.LedgerIndex === 'string') {
              return created.LedgerIndex;
            }
          }
        }
      }
    }
    return undefined;
  }

  /** Fallback when the meta scan above comes up empty: re-read the offer
   *  straight from `nft_sell_offers`. Best-effort — bounded by the same
   *  request deadline as every other read, and degrades to `undefined`
   *  (never throws) on any failure: the caller already has its `tesSUCCESS`
   *  TxResult either way, a missing `offerIndex` just means the caller must
   *  re-look-up the offer itself later. */
  private async lookupSellOfferIndex(nftId: string): Promise<string | undefined> {
    try {
      const offers = await this.nftSellOffers(nftId);
      return offers[0]?.offerIndex;
    } catch {
      return undefined;
    }
  }
}
