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
import { deriveCurrencyCode } from './reconcile.js';

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
 *  ready, starting snapshot minted. Mirrors backpack.py's `_setup_complete`.
 *  Deliberately does NOT check `state.enabled` (disable() only flips that
 *  flag) so a previously-disabled-but-complete pack re-enables via the same
 *  fast, no-network no-op path as an already-enabled one. */
function isSetupComplete(state: LedgerAdapterState): boolean {
  return Boolean(
    state.issuerAddress &&
      state.playerAddress &&
      state.merchantAddress &&
      state.trustLinesReady &&
      Object.keys(state.lastSettled).length > 0,
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

  // Private to this adapter instance — NEVER part of `state`. Populated on
  // every fund/resume so `settle()` can sign across checkpoint calls without
  // `state` ever carrying a secret (DECOMPOSE_BY_SECRETS).
  const seedCache = new Map<string, string>();

  function registerSeed(address: string, seed: string): void {
    seedCache.set(address, seed);
    putSeed(address, seed);
  }

  function requireSeed(address: string): string {
    const seed = seedCache.get(address);
    if (seed === undefined) {
      throw new Error(
        `no seed cached in-memory for address ${address} — cannot sign without re-authenticating via the secrets sidecar`,
      );
    }
    return seed;
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

  function currencyCodeFor(state: LedgerAdapterState, key: string): string {
    const existing = state.tokenMap[key];
    if (existing) return existing;
    const derived = deriveCurrencyCode(key);
    state.tokenMap[key] = derived;
    return derived;
  }

  /** Executes one checkpoint's worth of signed deltas against the transport:
   *  a SPEND (negative) escrows player->merchant then finishes it; a GRANT
   *  (positive) is a direct issuer->player Payment. Returns every tx hash
   *  produced. Throws on the first transport failure — callers translate that
   *  into the pending/failure degradation path. */
  async function executeDeltas(
    state: LedgerAdapterState,
    deltas: Record<string, number>,
    memo: string,
  ): Promise<string[]> {
    const txids: string[] = [];
    const issuerSeed = requireSeed(state.issuerAddress);
    const playerSeed = requireSeed(state.playerAddress);

    for (const key of Object.keys(deltas).sort()) {
      const diff = deltas[key];
      if (diff === 0) continue;
      const code = currencyCodeFor(state, key);

      if (diff < 0) {
        const amount: IssuedAmount = { currency: code, issuer: state.issuerAddress, value: String(-diff) };
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
          throw new Error(`escrowCreate(${key}) failed: ${createRes.error ?? createRes.code}`);
        }
        if (createRes.sequence === undefined) {
          throw new Error(`escrowCreate(${key}) succeeded without a sequence — cannot finish it`);
        }
        if (createRes.hash) txids.push(createRes.hash);

        const finishRes = await transport.escrowFinish(playerSeed, state.playerAddress, createRes.sequence);
        if (!finishRes.ok) {
          throw new Error(`escrowFinish(${key}) failed: ${finishRes.error ?? finishRes.code}`);
        }
        if (finishRes.hash) txids.push(finishRes.hash);
      } else {
        const amount: IssuedAmount = { currency: code, issuer: state.issuerAddress, value: String(diff) };
        const payRes = await transport.payment(issuerSeed, state.playerAddress, amount, memo);
        if (!payRes.ok) {
          throw new Error(`payment(${key}) failed: ${payRes.error ?? payRes.code}`);
        }
        if (payRes.hash) txids.push(payRes.hash);
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
   *  reconcile(), breaking `minted + Σdeltas == settled`. */
  async function retryPending(state: LedgerAdapterState): Promise<void> {
    if (state.pending.length === 0) return;

    const stillPending: SettlementRecord[] = [];
    let moved = 0;

    for (const record of state.pending) {
      try {
        const memo = buildSettlementMemo(gameId, runId, record.checkpoint, record.deltas, 'settle');
        const txids = await executeDeltas(state, record.deltas, memo);

        record.txids = txids;
        record.status = 'settled';
        record.memo = memo;
        record.timestamp = now();
        state.settlements.push(record);

        for (const [key, val] of Object.entries(record.deltas)) {
          state.lastSettled[key] = (state.lastSettled[key] ?? 0) + val;
        }
        moved++;
      } catch {
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
    // Fast idempotent path: a COMPLETE pack (funded, trust lines, minted)
    // flips back on in place, whether it was already enabled or freshly
    // disabled. No network calls, no re-fund, no re-mint (that would strand
    // the old wallets' tokens and double-mint). Mirrors backpack.py's
    // `_setup_complete` check exactly (it does not gate on `enabled` either).
    if (isSetupComplete(state)) {
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
      // Wallets: reuse-by-address or fund fresh, one at a time, persisting
      // each address into `state` immediately (not after all three succeed)
      // so a failure partway leaves a resumable partial state, exactly like
      // backpack.py's step-by-step field writes.
      const issuer = await fundOrResume(state.issuerAddress);
      state.issuerAddress = issuer.address;

      const player = await fundOrResume(state.playerAddress);
      state.playerAddress = player.address;

      const merchant = await fundOrResume(state.merchantAddress);
      state.merchantAddress = merchant.address;

      // Token map: pure/local, always refreshed for the current snapshot's
      // keys (cheap; no network). New item keys introduced AFTER trust lines
      // are already marked ready won't get their own trust line until a
      // future phase adds incremental trust-line auditing — out of scope here.
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

      // Mint the starting snapshot, issuer -> player. Guarded on
      // `lastSettled` being empty — CRITICAL: unlike flags/trust-lines, a
      // repeat mint is NOT idempotent, it doubles the player's balance and
      // breaks conservation. Only set `lastSettled` after the FULL mint loop
      // completes, so a half-minted pack stays "incomplete" and resumes the
      // remaining mints on the next enable() rather than being declared done.
      if (Object.keys(state.lastSettled).length === 0) {
        const amounts = amountsOf(snapshot);
        for (const key of resourceKeysOf(snapshot)) {
          const amount = amounts[key] ?? 0;
          if (amount > 0) {
            const code = currencyCodeFor(state, key);
            const mintRes = await transport.payment(issuer.seed, player.address, {
              currency: code,
              issuer: issuer.address,
              value: String(amount),
            });
            if (!mintRes.ok) throw new Error(`mint payment(${key}) failed: ${mintRes.error ?? mintRes.code}`);
          }
        }
        const settled: Record<string, number> = {};
        for (const key of resourceKeysOf(snapshot)) settled[key] = amounts[key] ?? 0;
        state.lastSettled = settled;
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
  ): Promise<SettlementResult> {
    if (!state.enabled) {
      return { success: false, message: 'Ledger adapter is not enabled.' };
    }

    // Retry pending FIRST (conservation-on-retry folds any cleared deltas
    // into the baseline before the fresh delta computation below runs).
    await retryPending(state);

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

    const memo = buildSettlementMemo(gameId, runId, checkpoint, deltas, 'settle');

    try {
      const txids = await executeDeltas(state, deltas, memo);

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
        txids: [],
        status: 'pending',
        memo,
        timestamp: now(),
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
