// @ai-rpg-engine/ledger-adapter — OPT-IN XRPL testnet settlement for the
// PLAYER-OWNED tradeable layer (coin -> IOU, consumables -> FT, trades settled
// via token escrow at checkpoints). Binds the tradeable layer, NOT economy-core.
//
// ── THE DETERMINISM FIREWALL (the whole point of this package) ──────────────
//   - Nothing in @ai-rpg-engine/{core,modules} imports this package.
//   - A run is BYTE-IDENTICAL whether or not the adapter is attached.
//   - The adapter READS engine state at checkpoints; the engine NEVER reads the
//     adapter. Settlement fires at coordinator-invoked checkpoints (town/market
//     visits, chapter breaks, save) — never inside the replayable step/tick path.
//   - @ai-rpg-engine/core is a TYPE-ONLY (dev) dependency; xrpl.js is an OPTIONAL
//     peer. Dry-run mode needs neither. Chain unavailable => the game continues,
//     marked "unanchored"; nothing bricks.
//
// ── SAFETY RAILS (lifted from Ledger Trail's dogfood-swarm) ─────────────────
//   testnet-only mainnet-impossible-in-code guard · secrets sidecar (seeds never
//   in the save/run file) · conservation-on-retry (settle() idempotent per
//   checkpoint) · genuine on-chain memo verification (AccountTx, not the engine
//   string) · unanchored fallback.
//
// Status: Phase 1 SCAFFOLD. Feature waves (dry-run transport, mode/state model,
// secrets sidecar, mainnet guard, settle/reconcile) land through the
// dogfood-swarm control plane. The Phase-0 spike proved the escrow settlement
// path live on testnet (xrpl.js 5.0.0, XLS-85 token escrow).

/** Package version — single-sourced for proof packs / receipts. */
export const LEDGER_ADAPTER_VERSION = '3.1.0';

/**
 * The three play modes (adapted from Ledger Trail §4):
 *  - `offline`: default. No chain. Coin/items tracked purely in engine state.
 *    This is what the engine core ships today; the adapter absent == this mode.
 *  - `ledger`: coin/items backed by real testnet balances; settle at checkpoints.
 *  - `diary`: play fully offline, then anchor the run's state hash on-ledger for
 *    a tamper-evident receipt (cheap, no per-item trust lines).
 */
export type LedgerMode = 'offline' | 'ledger' | 'diary';

/**
 * Issuer model — Director decision 2026-07-23: BOTH supported, as a config axis.
 *  - `per-run`: throwaway faucet issuer per run (Ledger Trail's model). Safe
 *    default: no durable key custody, smallest secrets surface. No cross-run
 *    economy by design.
 *  - `persistent`: one durable per-game issuer. Enables cross-run / persistent
 *    merchant markets; requires durable testnet key custody.
 */
export type IssuerMode = 'per-run' | 'persistent';

/**
 * Settlement primitive. v1 = `token-escrow` (XLS-85), Director-chosen and proven
 * live in the Phase-0 spike (issuer opts into asfAllowTrustLineLocking; escrow
 * carries a mandatory CancelAfter reclaim). `payment` (direct issuer-mediated,
 * escape-the-valley's model) is retained as a comparison/fallback path.
 */
export type SettlementPrimitive = 'token-escrow' | 'payment';

/**
 * Opt-in adapter configuration. An ABSENT adapter is exactly `mode: 'offline'`
 * — the pure deterministic engine. `network` is fixed to `'testnet'`: a
 * structural mainnet-impossible-in-code guard (not a config flag) rejects any
 * non-testnet host at construction.
 */
export type LedgerAdapterConfig = {
  mode: LedgerMode;
  issuerMode: IssuerMode;
  settlement: SettlementPrimitive;
  network: 'testnet';
};

/** The safest opt-in posture: offline mode, per-run issuer, escrow settlement. */
export const DEFAULT_LEDGER_CONFIG: LedgerAdapterConfig = {
  mode: 'offline',
  issuerMode: 'per-run',
  settlement: 'token-escrow',
  network: 'testnet',
};
