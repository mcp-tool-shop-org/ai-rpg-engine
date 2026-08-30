// settle-impl — the LedgerAdapter: enable/settle/disable against an INJECTED
// LedgerTransport. Ports escape-the-valley's backpack.py::BackpackManager
// (enable / settle / _retry_pending) to the generic (non-fixed-resource-set)
// TS contract, adding the XLS-85 token-escrow settlement primitive the
// Phase-0 spike proved (backpack.py's grounding predates escrow and used
// plain Payments both ways; contracts.ts's escrowCreate/escrowFinish seam is
// this package's addition).
//
// Determinism: no Date.now()/Math.random() anywhere in this module. Time and
// id generation are INJECTED (`now`, `nextId`) with deterministic-counter
// defaults, so a wave is byte-for-byte replayable (PIN_PER_STEP). Secrets
// (seeds) are NEVER written to `state` (DECOMPOSE_BY_SECRETS) — they live in
// an in-memory cache private to the returned adapter instance, plus whatever
// an injected `putSeed` callback does with them (e.g. hand them to the
// security-impl domain's secrets-sidecar writer).

import type {
  EnableResult,
  IssuedAmount,
  LedgerAdapter,
  LedgerAdapterConfig,
  LedgerAdapterState,
  LedgerTransport,
  SettleOptions,
  SettlementKeyReceipt,
  SettlementPrimitive,
  SettlementRecord,
  SettlementResult,
  TradeableSnapshot,
  WalletHandle,
} from '../contracts.js';
import {
  ASF_ALLOW_TRUSTLINE_LOCKING,
  ASF_DEFAULT_RIPPLE,
  buildSettlementMemo,
} from '../contracts.js';
import { assignTokenCode } from '../state/index.js';

/** Ripple-epoch seconds between an escrow's FinishAfter and its (mandatory,
 *  per XLS-85) CancelAfter. Named so the window is a documented design lever
 *  rather than a bare literal — see backpack_models.py's PARCEL_ACCEPT_CAP
 *  for the same convention in the Python grounding. A dry-run transport
 *  finishes synchronously regardless of the window's width; a real testnet
 *  transport (Phase 2) only needs it wide enough to outlast submit latency. */
const ESCROW_CANCEL_WINDOW_TICKS = 3600;

/** Injected dependencies. All optional with deterministic defaults — the
 *  common case is `createLedgerAdapter(transport, config)` with no 3rd arg. */
export type LedgerAdapterDeps = {
  /** Stamped into every settlement memo's `GAME:<id>` segment. */
  gameId?: string;
  /** Stamped into every settlement memo's `RUN:<id>` segment; also what
   *  reconcile() is later called with as `ReconcileInput.runId`. */
  runId?: string;
  /** Timestamp source for `SettlementRecord.timestamp`. Defaults to a
   *  monotonic deterministic counter (NOT wall-clock `Date.now()`). */
  now?: () => string;
  /** Monotonic counter, used for escrow FinishAfter/CancelAfter ticks.
   *  Defaults to a deterministic 0,1,2,... counter (NOT `Math.random()`). */
  nextId?: () => number;
  /** Called whenever a wallet is funded, address -> seed. Default: no-op.
   *  Seeds are ALSO cached in-memory (private to this adapter instance) so
   *  `settle()` can sign without ever reading a seed back out of `state`. */
  putSeed?: (address: string, seed: string) => void;
  /**
   * Inbound seed lookup for save/reload (the secrets sidecar). `putSeed` is
   * outbound-only; without this, a new adapter instance after deserialize has
   * an empty seedCache, fast-path enable claims "already online", and the
   * next settle requireSeed-throws. Fast-path enable hydrates issuer/player/
   * merchant from this before returning; a miss fails enable rather than
   * claiming the pack is online.
   */
  getSeed?: (address: string) => string | undefined;
  /**
   * The durable issuer seed for `issuerMode: 'persistent'` (F-merchant-E).
   *
   * `IssuerMode` shipped as a declared axis with no behaviour: `persistent` was
   * copied into state and validated on deserialize and read by nothing, so
   * every run — in either mode — funded a throwaway faucet issuer. A cross-run
   * market was documented and impossible.
   *
   * Supplying this makes run 2 reuse run 1's issuer: the same address, the same
   * token codes, and trust lines already open, so a market built in one session
   * is still there in the next. Read from the GITIGNORED secrets sidecar and
   * never from `state` — a durable issuer is a durable KEY, which is exactly
   * why per-run remains the documented default and this stays opt-in.
   *
   * Ignored unless `config.issuerMode === 'persistent'`, so passing it by
   * accident cannot silently change a per-run game's custody model.
   */
  persistentIssuerSeed?: string;
};

function defaultClock(): () => string {
  let ticks = 0;
  // `new Date(ms)` is a pure conversion of a given number, not a read of the
  // real clock — deterministic and replayable, unlike `Date.now()`/`new Date()`.
  return () => new Date(ticks++ * 1000).toISOString();
}

function defaultCounter(): () => number {
  let n = 0;
  return () => n++;
}

/** True once enable() has completed EVERY step: wallets funded, trust lines
 *  ready, AND every snapshot key checkpointed in lastSettled. A half-minted
 *  pack (some keys receipted, a later payment failed) is NOT complete — the
 *  next enable() must resume remaining mints, not take the no-op path.
 *  Deliberately does NOT check `state.enabled` (disable() only flips that
 *  flag) so a previously-disabled-but-complete pack re-enables via the same
 *  fast, no-network no-op path as an already-enabled one. */
function isSetupComplete(state: LedgerAdapterState, snapshot: TradeableSnapshot): boolean {
  if (
    !state.issuerAddress ||
    !state.playerAddress ||
    !state.merchantAddress ||
    !state.trustLinesReady
  ) {
    return false;
  }
  return resourceKeysOf(snapshot).every((key) =>
    Object.prototype.hasOwnProperty.call(state.lastSettled, key),
  );
}

/** `coin` plus every key in `snapshot.items`, sorted for determinism. */
function resourceKeysOf(snapshot: TradeableSnapshot): string[] {
  return ['coin', ...Object.keys(snapshot.items).sort()];
}

/** The delta-computation universe: every key the CURRENT snapshot has, union
 *  every key the baseline already knows about. Needed because `items` is an
 *  open-ended record — a resource whose count drops to 0 and is dropped from
 *  the snapshot entirely must still register as a spend-to-zero delta, not
 *  silently vanish from settlement. */
function allKnownKeys(state: LedgerAdapterState, snapshot: TradeableSnapshot): string[] {
  const keys = new Set<string>(resourceKeysOf(snapshot));
  for (const key of Object.keys(state.lastSettled)) keys.add(key);
  return Array.from(keys).sort();
}

function amountsOf(snapshot: TradeableSnapshot): Record<string, number> {
  return { coin: snapshot.coin, ...snapshot.items };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createLedgerAdapter(
  transport: LedgerTransport,
  config: LedgerAdapterConfig,
  deps: LedgerAdapterDeps = {},
): LedgerAdapter {
  const gameId = deps.gameId ?? 'default-game';
  const runId = deps.runId ?? 'default-run';
  const now = deps.now ?? defaultClock();
  const nextId = deps.nextId ?? defaultCounter();
  const putSeed = deps.putSeed ?? ((_address: string, _seed: string) => {});
  const getSeed = deps.getSeed;

  // Private to this adapter instance — NEVER part of `state`. Populated on
  // every fund/resume so `settle()` can sign across checkpoint calls without
  // `state` ever carrying a secret (DECOMPOSE_BY_SECRETS).
  const seedCache = new Map<string, string>();

  function registerSeed(address: string, seed: string): void {
    seedCache.set(address, seed);
    putSeed(address, seed);
  }

  /** Pull a seed into the in-memory cache from getSeed / persistentIssuerSeed. */
  function hydrateSeed(address: string): string | undefined {
    if (!address) return undefined;
    const cached = seedCache.get(address);
    if (cached !== undefined) return cached;
    const fromSidecar = getSeed?.(address);
    if (fromSidecar !== undefined) {
      seedCache.set(address, fromSidecar);
      return fromSidecar;
    }
    if (config.issuerMode === 'persistent' && deps.persistentIssuerSeed) {
      const wallet = transport.walletFromSeed(deps.persistentIssuerSeed);
      if (wallet.address === address) {
        registerSeed(address, wallet.seed);
        return wallet.seed;
      }
    }
    return undefined;
  }

  function requireSeed(address: string): string {
    const seed = hydrateSeed(address);
    if (seed === undefined) {
      throw new Error(
        `no seed cached in-memory for address ${address} — cannot sign without re-authenticating via the secrets sidecar`,
      );
    }
    return seed;
  }

  /** Hydrate issuer/player/merchant before a fast-path enable claims "already
   *  online". Returns role+address strings for every miss so the operator can
   *  re-auth the sidecar for the named wallet. */
  function missingSetupSeeds(state: LedgerAdapterState): string[] {
    const missing: string[] = [];
    const roles: Array<['issuer' | 'player' | 'merchant', string]> = [
      ['issuer', state.issuerAddress],
      ['player', state.playerAddress],
      ['merchant', state.merchantAddress],
    ];
    for (const [role, address] of roles) {
      if (!address) continue;
      if (hydrateSeed(address) === undefined) {
        missing.push(`${role} ${address}`);
      }
    }
    return missing;
  }

  /** Reuse an existing wallet (by address, resolving its seed from the cache)
   *  or fund a fresh one. Registers the seed either way so the caller can
   *  immediately sign with the returned handle. */
  async function fundOrResume(currentAddress: string): Promise<WalletHandle> {
    if (currentAddress) {
      const seed = requireSeed(currentAddress);
      return transport.walletFromSeed(seed);
    }
    const wallet = await transport.fundWallet();
    registerSeed(wallet.address, wallet.seed);
    return wallet;
  }

  /**
   * The issuer specifically (F-merchant-E). Identical to `fundOrResume` except
   * that a persistent game reconstructs its DURABLE issuer from the sidecar
   * seed instead of fauceting a new one — which is the entire difference
   * between a market that outlives a run and one that does not.
   *
   * Gated on `config.issuerMode`, not merely on the seed being present: a seed
   * passed to a per-run game must not quietly convert it to persistent custody.
   */
  async function issuerWallet(currentAddress: string): Promise<WalletHandle> {
    if (config.issuerMode === 'persistent' && deps.persistentIssuerSeed && !currentAddress) {
      const wallet = transport.walletFromSeed(deps.persistentIssuerSeed);
      registerSeed(wallet.address, wallet.seed);
      return wallet;
    }
    return fundOrResume(currentAddress);
  }

  function currencyCodeFor(state: LedgerAdapterState, key: string): string {
    const existing = state.tokenMap[key];
    if (existing) return existing;
    // assignTokenCode (state-impl) produces a VALID 3-char, collision-safe XRPL
    // currency code and records it in state.tokenMap — the SINGLE code source
    // both the adapter mints with and reconcile() reconciles against (threaded
    // in via ReconcileInput.tokenMap). reconcile.ts's stateless
    // deriveCurrencyCode produced invalid codes here (e.g. 'coin' -> 'COIN', 4
    // chars) that xrpl.js rejects client-side — caught only by the LIVE testnet
    // replay, never by the dry-run suite. (LIVE-FINDING-1, wave-2.)
    return assignTokenCode(state, key);
  }

  /** Player's issued-currency balance from account_lines, or null if unknown
   *  (network error). A missing line is a known 0 — not unknown. */
  async function readIssuedBalance(address: string, currency: string): Promise<number | null> {
    try {
      const lines = await transport.accountLines(address);
      const line = lines.find((l) => l.currency === currency);
      if (!line) return 0;
      const n = Number(line.balance);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  async function onLedgerAlreadyMatches(
    state: LedgerAdapterState,
    key: string,
    expected: number,
  ): Promise<boolean> {
    const code = currencyCodeFor(state, key);
    const bal = await readIssuedBalance(state.playerAddress, code);
    return bal !== null && bal === expected;
  }

  /** Recover an EscrowCreate OfferSequence from account_tx by the persisted
   *  tesSUCCESS hash. Used when create returned ok:true without `sequence`
   *  — never submit a second EscrowCreate for the same delta. */
  async function recoverOfferSequence(address: string, hash: string): Promise<number | undefined> {
    try {
      const entries = await transport.accountTx(address);
      const hit = entries.find(
        (e) => e.hash === hash && e.type === 'EscrowCreate' && typeof e.sequence === 'number',
      );
      return hit?.sequence;
    } catch {
      return undefined;
    }
  }

  function markReceipt(
    receipts: Record<string, SettlementKeyReceipt>,
    key: string,
    patch: SettlementKeyReceipt,
  ): void {
    const prev = receipts[key];
    receipts[key] = {
      txids: [...(prev?.txids ?? []), ...patch.txids],
      sequence: patch.sequence ?? prev?.sequence,
      done: patch.done ?? prev?.done,
    };
  }

  /** Ensure player + merchant both trust the issuer for every given key's
   *  token code, opening any line not up yet. INCREMENTAL trust lines: enable()
   *  opens lines only for the tokens in the ENABLE snapshot, but a real
   *  merchant run acquires NEW tokens mid-run (buying an item the player didn't
   *  start with). Minting such a token to the player — or escrowing it to the
   *  merchant — fails `tecPATH_DRY` on live testnet when its trust line was
   *  never opened. The dry-run transport does NOT model this (it credits
   *  balances with no trust line), so ONLY the pirate live-replay caught it
   *  (the captain buys a `cannon-shell` absent from the starting inventory).
   *  enable()'s comment previously deferred this to "a future phase" — this is
   *  that phase (the live-diagnosed Phase-5 fix).
   *
   *  Registry = the KEYS of `state.lastSettled`: enable() seeds it with exactly
   *  the minted (trust-lined) keys, and settle()/retryPending fold every
   *  settled key into it — so `key in state.lastSettled` ⟺ "its trust line is
   *  already open", an invariant that also survives save/load with NO new
   *  serialized field (the reload-determinism CRITICAL). `trustSet` is itself
   *  idempotent on-ledger, so a redundant re-open would be harmless; the
   *  registry check just spares the extra round-trips. */
  async function ensureTrustLinesFor(state: LedgerAdapterState, keys: string[]): Promise<void> {
    const playerSeed = requireSeed(state.playerAddress);
    const merchantSeed = requireSeed(state.merchantAddress);
    const trustLimit = '999999999';
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(state.lastSettled, key)) continue;
      const code = currencyCodeFor(state, key);
      const playerTrust = await transport.trustSet(playerSeed, state.issuerAddress, code, trustLimit);
      if (!playerTrust.ok) {
        throw new Error(`trustSet(player, ${code}) failed: ${playerTrust.error ?? playerTrust.code}`);
      }
      const merchantTrust = await transport.trustSet(merchantSeed, state.issuerAddress, code, trustLimit);
      if (!merchantTrust.ok) {
        throw new Error(`trustSet(merchant, ${code}) failed: ${merchantTrust.error ?? merchantTrust.code}`);
      }
    }
  }

  /** Executes one checkpoint's worth of signed deltas against the transport:
   *  a SPEND (negative) escrows player->merchant then finishes it; a GRANT
   *  (positive) is a direct issuer->player Payment. Returns every tx hash
   *  produced. Throws on the first transport failure — callers translate that
   *  into the pending/failure degradation path. */
  /**
   * The `diary` counterpart to executeDeltas: write the checkpoint's memo as a
   * single value-free anchor and return its hash.
   *
   * Throws on transport failure exactly as executeDeltas does, so a diary run
   * degrades onto the SAME pending/retry path — an unreachable ledger leaves a
   * pending record that the next checkpoint replays, rather than silently
   * losing a link in the anchor chain.
   */
  async function anchorDeltas(state: LedgerAdapterState, memo: string): Promise<string[]> {
    const res = await transport.anchorMemo(requireSeed(state.playerAddress), memo);
    if (!res.ok) throw new Error(`anchorMemo failed: ${res.error ?? res.code}`);
    return [res.hash];
  }

  async function executeDeltas(
    state: LedgerAdapterState,
    deltas: Record<string, number>,
    memo: string,
    primitive: SettlementPrimitive = config.settlement,
    receipts: Record<string, SettlementKeyReceipt> = {},
  ): Promise<string[]> {
    const txids: string[] = [];
    const issuerSeed = requireSeed(state.issuerAddress);
    const playerSeed = requireSeed(state.playerAddress);

    // Incremental trust lines FIRST: any token new since enable needs its
    // player+merchant trust lines opened before we mint/escrow it, or live
    // testnet rejects the transfer with tecPATH_DRY (see ensureTrustLinesFor).
    // Runs on both the settle() and retryPending() paths (both call this).
    await ensureTrustLinesFor(state, Object.keys(deltas));

    for (const key of Object.keys(deltas).sort()) {
      const diff = deltas[key];
      if (diff === 0) continue;
      const code = currencyCodeFor(state, key);
      const expected = (state.lastSettled[key] ?? 0) + diff;

      // Skip a key whose receipt already marks the write complete, or whose
      // on-ledger player balance already equals lastSettled+delta (a tesSUCCESS
      // that timed out before we checkpointed). Never remint/re-escrow it.
      // An unfinished escrow receipt (hash persisted, sequence not yet known)
      // must NOT take this skip — recover OfferSequence and finish instead.
      if (receipts[key]?.done) {
        txids.push(...receipts[key].txids);
        continue;
      }
      const unfinishedEscrow =
        diff < 0 && primitive !== 'payment' && receipts[key] !== undefined && receipts[key].done !== true;
      if (!unfinishedEscrow && (await onLedgerAlreadyMatches(state, key, expected))) {
        if (receipts[key]) receipts[key].done = true;
        else receipts[key] = { txids: [], done: true };
        txids.push(...(receipts[key].txids ?? []));
        continue;
      }

      if (diff < 0 && primitive === 'payment') {
        // The `payment` primitive: a SPEND is a direct holder->issuer burn
        // Payment, with no escrow object created at all. This branch is what
        // makes `SettlementPrimitive` real — `config.settlement` was declared,
        // defaulted, and never read by any code path, so selecting 'payment'
        // produced byte-identical behavior to 'token-escrow': an inert config
        // axis that looked like a feature. A game can now settle escrowed trades
        // in a lawful market and direct cash sales in a black market against ONE
        // set of books (see SettleOptions.primitive).
        const amount: IssuedAmount = { currency: code, issuer: state.issuerAddress, value: String(-diff) };
        const burnRes = await transport.payment(playerSeed, state.issuerAddress, amount, memo);
        if (!burnRes.ok) {
          if (burnRes.hash) markReceipt(receipts, key, { txids: [burnRes.hash] });
          throw new Error(`payment(burn ${key}) failed: ${burnRes.error ?? burnRes.code}`);
        }
        if (burnRes.hash) txids.push(burnRes.hash);
        markReceipt(receipts, key, { txids: burnRes.hash ? [burnRes.hash] : [], done: true });
      } else if (diff < 0) {
        const amount: IssuedAmount = { currency: code, issuer: state.issuerAddress, value: String(-diff) };
        const existing = receipts[key];
        let sequence = existing?.sequence;

        if (sequence === undefined && existing) {
          // tesSUCCESS without sequence: recover OfferSequence from account_tx
          // by the persisted hash. Never EscrowCreate again for this key.
          const priorHash = existing.txids.find((h) => h.length > 0);
          if (priorHash) {
            sequence = await recoverOfferSequence(state.playerAddress, priorHash);
          }
          if (sequence === undefined) {
            throw new Error(
              `escrowCreate(${key}) tesSUCCESS without sequence; not creating again until account_tx indexes OfferSequence`,
            );
          }
          markReceipt(receipts, key, { txids: [], sequence });
        }

        if (sequence === undefined) {
          const tick = nextId();
          const finishAfter = tick;
          const cancelAfter = tick + ESCROW_CANCEL_WINDOW_TICKS;

          const createRes = await transport.escrowCreate(
            playerSeed,
            state.merchantAddress,
            amount,
            finishAfter,
            cancelAfter,
            memo,
          );
          if (!createRes.ok) {
            if (createRes.hash) markReceipt(receipts, key, { txids: [createRes.hash] });
            throw new Error(`escrowCreate(${key}) failed: ${createRes.error ?? createRes.code}`);
          }
          if (createRes.hash) txids.push(createRes.hash);
          if (createRes.sequence === undefined) {
            // Persist hash, fail closed. Retry recovers OfferSequence from
            // account_tx and never submits a second EscrowCreate.
            markReceipt(receipts, key, {
              txids: createRes.hash ? [createRes.hash] : [],
            });
            throw new Error(
              `escrowCreate(${key}) tesSUCCESS without sequence; not creating again until account_tx indexes OfferSequence`,
            );
          }
          // Persist sequence BEFORE escrowFinish so a finish failure retries
          // only the finish, never a second EscrowCreate.
          markReceipt(receipts, key, {
            txids: createRes.hash ? [createRes.hash] : [],
            sequence: createRes.sequence,
          });
          sequence = createRes.sequence;
        } else {
          txids.push(...(existing?.txids ?? []));
        }

        const finishRes = await transport.escrowFinish(playerSeed, state.playerAddress, sequence);
        if (!finishRes.ok) {
          if (finishRes.hash) markReceipt(receipts, key, { txids: [finishRes.hash] });
          throw new Error(`escrowFinish(${key}) failed: ${finishRes.error ?? finishRes.code}`);
        }
        if (finishRes.hash) txids.push(finishRes.hash);
        markReceipt(receipts, key, { txids: finishRes.hash ? [finishRes.hash] : [], sequence, done: true });
      } else {
        const amount: IssuedAmount = { currency: code, issuer: state.issuerAddress, value: String(diff) };
        const payRes = await transport.payment(issuerSeed, state.playerAddress, amount, memo);
        if (!payRes.ok) {
          if (payRes.hash) markReceipt(receipts, key, { txids: [payRes.hash] });
          throw new Error(`payment(${key}) failed: ${payRes.error ?? payRes.code}`);
        }
        if (payRes.hash) txids.push(payRes.hash);
        markReceipt(receipts, key, { txids: payRes.hash ? [payRes.hash] : [], done: true });
      }
    }

    return txids;
  }

  /** Retries every currently-pending settlement BEFORE a fresh settle() looks
   *  at deltas. CONSERVATION-ON-RETRY (the backpack.py `_retry_pending` fix):
   *  a record that clears on retry has its signed deltas folded into
   *  `state.lastSettled` immediately, so the fresh delta computation that
   *  follows measures against a baseline that already accounts for the
   *  retried portion. Without this, the next settle() recomputes
   *  (current - baseline) across the WHOLE interval — including the
   *  just-retried delta — paying it on-chain twice and double-summing it in
   *  reconcile(), breaking `minted + Σdeltas == settled`.
   *
   *  Per-key receipts (and on-ledger balance comparison) make a PARTIAL
   *  multi-key failure idempotent: keys whose tx already landed are skipped
   *  instead of replaying the whole record. */
  async function retryPending(state: LedgerAdapterState): Promise<void> {
    if (state.pending.length === 0) return;

    const stillPending: SettlementRecord[] = [];
    let moved = 0;

    for (const record of state.pending) {
      try {
        // Replay the record's OWN verb. Hardcoding 'settle' here meant a
        // `consign` that went pending and later cleared landed on-chain as a
        // generic settle — the distinct artifact collapsing on exactly the path
        // that exists because the network is unreliable. Absent verb (a record
        // serialized before the field existed) is 'settle', which is what all
        // such records were in fact written as.
        const memo = buildSettlementMemo(gameId, runId, record.checkpoint, record.deltas, record.verb ?? 'settle');
        if (!record.receipts) record.receipts = {};
        // Diary pending records were written by a failed anchorMemo, not a
        // token movement. Replaying them through executeDeltas would try to
        // sign as an issuer that diary mode never funded.
        const txids = config.mode === 'diary'
          ? await anchorDeltas(state, memo)
          : await executeDeltas(state, record.deltas, memo, config.settlement, record.receipts);

        record.txids = txids;
        record.status = 'settled';
        record.memo = memo;
        record.timestamp = now();
        state.settlements.push(record);

        for (const [key, val] of Object.entries(record.deltas)) {
          state.lastSettled[key] = (state.lastSettled[key] ?? 0) + val;
        }
        delete record.lastError;
        moved++;
      } catch (err) {
        record.lastError = errorMessage(err);
        stillPending.push(record);
      }
    }

    state.pending = stillPending;
    if (stillPending.length > 0) {
      state.lastSettleFailed = true;
    } else if (moved > 0) {
      state.lastSettleFailed = false;
    }
  }

  async function enable(state: LedgerAdapterState, snapshot: TradeableSnapshot): Promise<EnableResult> {
    // `offline` is the documented no-op: an absent adapter IS this mode.
    // DEFAULT_LEDGER_CONFIG.mode is 'offline' because this branch exists —
    // enable never faucets, never mints, never submits.
    if (config.mode === 'offline') {
      state.enabled = true;
      return {
        success: true,
        message: 'Offline mode — no chain. Adapter stays off the ledger.',
      };
    }

    // Fast idempotent path: a COMPLETE pack (funded, trust lines, minted)
    // flips back on in place, whether it was already enabled or freshly
    // disabled. No network calls, no re-fund, no re-mint (that would strand
    // the old wallets' tokens and double-mint). Mirrors backpack.py's
    // `_setup_complete` check exactly (it does not gate on `enabled` either).
    // Seeds MUST be hydrated from the sidecar first: without getSeed a new
    // instance would claim "already online" then fail the next settle.
    if (isSetupComplete(state, snapshot)) {
      const missing = missingSetupSeeds(state);
      if (missing.length > 0) {
        state.enabled = false;
        return {
          success: false,
          message:
            `Could not enable the ledger adapter: missing seed(s) for ${missing.join(', ')} — ` +
            `re-authenticate via the secrets sidecar. Adapter stays off — you can try again at the next checkpoint.`,
        };
      }
      try {
        await transport.connect();
      } catch (err) {
        return {
          success: false,
          message: `Could not enable the ledger adapter: ${errorMessage(err)}. Adapter stays off — you can try again at the next checkpoint.`,
        };
      }
      state.enabled = true;
      return {
        success: true,
        message: 'Ledger adapter re-enabled — existing setup is already online.',
        playerAddress: state.playerAddress,
      };
    }

    const resuming = Boolean(
      state.issuerAddress || state.playerAddress || state.merchantAddress || state.trustLinesReady,
    );

    try {
      await transport.connect();
      // ── diary: seal the books, do not custody them ──────────────────────
      // One player wallet and nothing else. No issuer, no AccountSet flags, no
      // trust lines, no opening mint — a diary run never puts the economy
      // on-chain, it only witnesses it. Returning here is what makes `diary` a
      // behaviour rather than a label: before this branch existed, every mode
      // ran the full ledger setup below and `mode` was read by nothing.
      if (config.mode === 'diary') {
        const diarist = await fundOrResume(state.playerAddress);
        state.playerAddress = diarist.address;
        // Baseline the opening snapshot WITHOUT minting it. Diary deltas are
        // computed against this exactly as ledger deltas are; the difference is
        // that nothing is moved to make them true.
        if (Object.keys(state.lastSettled).length === 0) {
          const amounts = amountsOf(snapshot);
          const settled: Record<string, number> = {};
          for (const key of resourceKeysOf(snapshot)) settled[key] = amounts[key] ?? 0;
          state.lastSettled = settled;
        }
        state.enabled = true;
        return {
          success: true,
          message: resuming
            ? 'Diary resumed — this run is witnessed, not custodied.'
            : 'Diary opened — checkpoints will be anchored on-ledger, no trust lines needed.',
          playerAddress: diarist.address,
        };
      }

      // Wallets: reuse-by-address or fund fresh, one at a time, persisting
      // each address into `state` immediately (not after all three succeed)
      // so a failure partway leaves a resumable partial state, exactly like
      // backpack.py's step-by-step field writes.
      const issuer = await issuerWallet(state.issuerAddress);
      state.issuerAddress = issuer.address;

      const player = await fundOrResume(state.playerAddress);
      state.playerAddress = player.address;

      const merchant = await fundOrResume(state.merchantAddress);
      state.merchantAddress = merchant.address;

      // Token map: pure/local, always refreshed for the current snapshot's
      // keys (cheap; no network). New item keys introduced AFTER enable (an
      // item bought mid-run) get their trust lines opened incrementally by
      // settle()'s executeDeltas -> ensureTrustLinesFor, right before the token
      // is first minted/escrowed (the live-diagnosed Phase-5 fix).
      for (const key of resourceKeysOf(snapshot)) {
        currencyCodeFor(state, key);
      }

      // Issuer AccountSet opt-ins. No dedicated state flag gates this step
      // (unlike trust lines / mint) — both flags are idempotent to re-set on
      // XRPL, so repeating them on a resume is safe, just a couple of extra
      // round-trips.
      const flag1 = await transport.setAccountFlag(issuer.seed, ASF_DEFAULT_RIPPLE);
      if (!flag1.ok) throw new Error(`setAccountFlag(ASF_DEFAULT_RIPPLE) failed: ${flag1.error ?? flag1.code}`);
      const flag2 = await transport.setAccountFlag(issuer.seed, ASF_ALLOW_TRUSTLINE_LOCKING);
      if (!flag2.ok) {
        throw new Error(`setAccountFlag(ASF_ALLOW_TRUSTLINE_LOCKING) failed: ${flag2.error ?? flag2.code}`);
      }

      // Trust lines: player + merchant each trust the issuer for every token
      // code. Guarded on `trustLinesReady` — safe to skip on resume (unlike
      // flags, we bother to avoid these round-trips) and CRITICAL to guard
      // the mint step below on, since re-minting is NOT safe (double supply).
      if (!state.trustLinesReady) {
        const trustLimit = '999999999';
        for (const key of resourceKeysOf(snapshot)) {
          const code = currencyCodeFor(state, key);
          const playerTrust = await transport.trustSet(player.seed, issuer.address, code, trustLimit);
          if (!playerTrust.ok) {
            throw new Error(`trustSet(player, ${code}) failed: ${playerTrust.error ?? playerTrust.code}`);
          }
          const merchantTrust = await transport.trustSet(merchant.seed, issuer.address, code, trustLimit);
          if (!merchantTrust.ok) {
            throw new Error(`trustSet(merchant, ${code}) failed: ${merchantTrust.error ?? merchantTrust.code}`);
          }
        }
        state.trustLinesReady = true;
      }

      // Mint the starting snapshot, issuer -> player. Checkpoint EACH
      // successful mint into lastSettled BEFORE the next payment so a
      // fail-then-retry enable skips keys already issued. A half-minted
      // pack stays incomplete (isSetupComplete requires every snapshot key)
      // and resumes only the remaining mints — never remints a key whose
      // on-ledger balance already matches the opening snapshot.
      const amounts = amountsOf(snapshot);
      for (const key of resourceKeysOf(snapshot)) {
        if (Object.prototype.hasOwnProperty.call(state.lastSettled, key)) continue;
        const amount = amounts[key] ?? 0;
        const code = currencyCodeFor(state, key);
        const onLedger = await readIssuedBalance(player.address, code);
        if (onLedger !== null && onLedger === amount) {
          state.lastSettled[key] = amount;
          continue;
        }
        if (amount > 0) {
          const mintRes = await transport.payment(issuer.seed, player.address, {
            currency: code,
            issuer: issuer.address,
            value: String(amount),
          });
          if (!mintRes.ok) throw new Error(`mint payment(${key}) failed: ${mintRes.error ?? mintRes.code}`);
        }
        state.lastSettled[key] = amount;
      }

      state.enabled = true;

      return {
        success: true,
        message: resuming ? 'Ledger adapter setup resumed — pack is now receipted.' : 'Ledger adapter enabled — pack is now receipted.',
        playerAddress: player.address,
      };
    } catch (err) {
      return {
        success: false,
        message: `Could not enable the ledger adapter: ${errorMessage(err)}. Adapter stays off — you can try again at the next checkpoint.`,
      };
    }
  }

  async function settle(
    state: LedgerAdapterState,
    snapshot: TradeableSnapshot,
    checkpoint: number,
    location: string,
    options: SettleOptions = {},
  ): Promise<SettlementResult> {
    if (config.mode === 'offline') {
      return { success: true, message: 'Offline mode — no chain. Nothing to settle.' };
    }

    if (!state.enabled) {
      return { success: false, message: 'Ledger adapter is not enabled.' };
    }

    // Retry pending FIRST (conservation-on-retry folds any cleared deltas
    // into the baseline before the fresh delta computation below runs).
    await retryPending(state);

    // lastSettled only advances when a pending record clears. Snapshot-vs-
    // lastSettled while a spend is still pending would queue a second overlapping
    // record (town -30 still pending, market snapshot 50 vs baseline 100 → -50)
    // and execute both when the ledger recovers.
    if (state.pending.length > 0) {
      const stuck = state.pending[0];
      const where = `checkpoint ${stuck.checkpoint} at ${stuck.location}`;
      const why = stuck.lastError ? `${where} still pending: ${stuck.lastError}` : `${where} is still pending`;
      return {
        success: false,
        message: `The ledger is quiet — couldn't settle this checkpoint (${why}). Your run continues offline for now; we'll retry at the next checkpoint.`,
        record: stuck,
      };
    }

    const amounts = amountsOf(snapshot);
    const keys = allKnownKeys(state, snapshot);
    const deltas: Record<string, number> = {};
    for (const key of keys) {
      const current = amounts[key] ?? 0;
      const baseline = state.lastSettled[key] ?? 0;
      const diff = current - baseline;
      if (diff !== 0) deltas[key] = diff;
    }

    if (Object.keys(deltas).length === 0) {
      return { success: true, message: 'No changes to settle.' };
    }

    // The verb comes from the CALLER now. It used to be the literal 'settle'
    // here and in retryPending — the only two writers — so `buy`/`sell` were
    // unreachable members of the union and the memo's VERB: field carried no
    // information any run could vary.
    const verb = options.verb ?? 'settle';
    const primitive = options.primitive ?? config.settlement;
    const memo = buildSettlementMemo(gameId, runId, checkpoint, deltas, verb);
    const receipts: Record<string, SettlementKeyReceipt> = {};

    try {
      // In `diary` the deltas above are the RECORD of what happened, not
      // instructions to move anything: one memo-bearing self-anchor, no
      // trust line touched, no token minted or escrowed. The settlement
      // record that lands in state is otherwise identical to a ledger one,
      // which is what lets reconcile check an anchor chain with the same
      // machinery it uses for balances.
      const txids = config.mode === 'diary'
        ? await anchorDeltas(state, memo)
        : await executeDeltas(state, deltas, memo, primitive, receipts);

      for (const key of keys) {
        state.lastSettled[key] = amounts[key] ?? 0;
      }

      const record: SettlementRecord = {
        checkpoint,
        location,
        deltas,
        txids,
        status: 'settled',
        memo,
        timestamp: now(),
        verb,
        receipts,
      };
      state.settlements.push(record);
      state.lastSettleFailed = false;

      return {
        success: true,
        message: `Checkpoint settled. Receipt: ${txids[0] ?? 'none'}`,
        txids,
        record,
      };
    } catch (err) {
      const record: SettlementRecord = {
        checkpoint,
        location,
        deltas,
        txids: Object.values(receipts).flatMap((r) => r.txids),
        status: 'pending',
        memo,
        timestamp: now(),
        // Carried onto the pending record so retryPending can replay the
        // ORIGINAL verb instead of flattening it to 'settle'.
        verb,
        // Per-key receipts so retryPending skips writes that already landed.
        receipts,
        lastError: errorMessage(err),
      };
      state.pending.push(record);
      state.lastSettleFailed = true;

      return {
        success: false,
        message: `The ledger is quiet — couldn't settle this checkpoint (${errorMessage(err)}). Your run continues offline for now; we'll retry at the next checkpoint.`,
        record,
      };
    }
  }

  function disable(state: LedgerAdapterState): void {
    state.enabled = false;
  }

  return {
    config,
    enable,
    settle,
    disable,
  };
}
