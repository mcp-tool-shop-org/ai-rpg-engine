// @ai-rpg-engine/ledger-adapter — OPT-IN XRPL testnet settlement for the
// PLAYER-OWNED tradeable layer (coin -> IOU, consumables -> FT, trades settled
// via token escrow at checkpoints). Binds the tradeable layer, NOT economy-core.
//
// ── THE DETERMINISM FIREWALL (the whole point of this package) ──────────────
//   - Nothing in @ai-rpg-engine/{core,modules} imports this package.
//   - A run is BYTE-IDENTICAL whether or not the adapter is attached.
//   - The adapter READS a TradeableSnapshot at checkpoints; the engine NEVER
//     reads the adapter. Settlement fires at coordinator-invoked checkpoints
//     (town/market visits, chapter breaks, save) — never inside the tick path.
//   - @ai-rpg-engine/core is a TYPE-ONLY (dev) dependency; xrpl.js is an OPTIONAL
//     peer. Dry-run mode needs neither. Chain unavailable => "unanchored".
//
// This is the public barrel. The cross-domain seams live in ./contracts.ts
// (coordinator-owned); implementations live under ./transport, ./state,
// ./security, ./settle (wave-1 builder domains).

// Coordinator-owned contracts (the frozen seams).
export type {
  LedgerMode,
  IssuerMode,
  SettlementPrimitive,
  LedgerAdapterConfig,
  IssuedAmount,
  WalletHandle,
  TxResult,
  TrustLineInfo,
  TxEntry,
  LedgerTransport,
  TradeableSnapshot,
  SettlementStatus,
  SettlementRecord,
  LedgerAdapterState,
  SecretsSidecar,
  EnableResult,
  SettlementResult,
  ResourceCheck,
  ReconcileReport,
  ReconcileInput,
  ReconcileFn,
  LedgerAdapter,
} from './contracts.js';

export {
  ASF_DEFAULT_RIPPLE,
  ASF_ALLOW_TRUSTLINE_LOCKING,
  MEMO_SCHEMA_VERSION,
  buildSettlementMemo,
  settlementMemoPrefix,
} from './contracts.js';

// Wave-1 domain implementations (transport / state / security / settle).
export * from './transport/index.js';
export * from './state/index.js';
export * from './security/index.js';
export * from './settle/index.js';

import type { LedgerAdapterConfig } from './contracts.js';

/** Package version — single-sourced for proof packs / receipts. */
export const LEDGER_ADAPTER_VERSION = '3.1.0';

/** The safest opt-in posture: offline mode, per-run issuer, escrow settlement. */
export const DEFAULT_LEDGER_CONFIG: LedgerAdapterConfig = {
  mode: 'offline',
  issuerMode: 'per-run',
  settlement: 'token-escrow',
  network: 'testnet',
};
