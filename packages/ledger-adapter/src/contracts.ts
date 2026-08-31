// COORDINATOR-OWNED CONTRACTS — the frozen cross-domain seams the wave-1 builder
// agents implement against. Agents own IMPLEMENTATIONS in their subdirs; the
// coordinator owns these interfaces + shared value types so parallel worktrees
// never collide on the contract (PIN_PER_STEP: the dry-run/testnet transport
// split is the pinnable seam). Do not widen a signature here without the
// coordinator — a wave is byte-for-byte replayable only if the seam is pinned.
//
// Grounded in: escape-the-valley backpack.py (BackpackManager) + ledger_proof.py
// (reconcile), xrpl-lab transport/base.py (the Transport ABC), and the Phase-0
// escrow spike's proven tesSUCCESS tx shapes (xrpl.js 5.0.0, XLS-85 token escrow).

// ── Configuration (the opt-in surface) ─────────────────────────────────────

/**
 * The three play modes.
 *
 * This union shipped in v3.3.0 with prose describing three behaviours and code
 * implementing one. `state.mode` was copied at construction and validated on
 * deserialize, and that was every read in the package — a grep for `.mode`
 * outside tests returned exactly two assignments and two validations, and no
 * branch anywhere. `diary` was a config flag wearing a feature's description,
 * the same shape `config.settlement` had one release earlier in this same file.
 *
 * What each mode actually does now:
 *
 * | mode      | enable                              | settle                                   | reconcile verifies      |
 * |-----------|-------------------------------------|------------------------------------------|-------------------------|
 * | `offline` | nothing — adapter absent IS this    | nothing                                  | nothing                 |
 * | `ledger`  | issuer + player + merchant wallets, | moves VALUE: mints/burns/escrows the     | on-ledger BALANCES      |
 * |           | AccountSet flags, trust lines,      | net delta per resource key               | (`account_lines`) vs    |
 * |           | mints the opening snapshot          |                                          | the settled baseline    |
 * | `diary`   | ONE player wallet. No issuer, no    | moves NO VALUE: writes one memo-bearing  | the ANCHOR CHAIN        |
 * |           | flags, no trust lines, no mint      | self-anchor carrying the checkpoint's    | (`account_tx` memos)    |
 * |           |                                     | deltas + state hash                      |                         |
 *
 * `diary` is for a run that wants a tamper-evident record of what happened
 * without putting the economy on-chain: the books are sealed and witnessed, not
 * custodied. It costs one transaction per checkpoint and opens no trust line,
 * so it works for any pack regardless of how many resource keys it has — which
 * is the whole reason to want it over `ledger`.
 */
export type LedgerMode = 'offline' | 'ledger' | 'diary';

/**
 * Issuer model — Director decision 2026-07-23: BOTH supported, as a config axis.
 *  - `per-run`: throwaway faucet issuer per run (safe default; no durable key
 *    custody; no cross-run economy by design).
 *  - `persistent`: one durable per-game issuer (cross-run merchant markets;
 *    requires durable testnet key custody).
 */
export type IssuerMode = 'per-run' | 'persistent';

/**
 * Settlement primitive. v1 = `token-escrow` (XLS-85), Director-chosen and proven
 * live in the Phase-0 spike. `payment` (direct issuer-mediated) is retained as a
 * comparison/fallback path.
 */
export type SettlementPrimitive = 'token-escrow' | 'payment';

/**
 * Opt-in adapter configuration. An ABSENT adapter is exactly `mode: 'offline'`.
 * `network` is fixed to `'testnet'`: a structural mainnet-impossible-in-code
 * guard (NOT a config flag) rejects any non-testnet host at construction.
 */
export type LedgerAdapterConfig = {
  mode: LedgerMode;
  issuerMode: IssuerMode;
  settlement: SettlementPrimitive;
  network: 'testnet';
};

// ── AccountSet flags (spike-verified against xrpl.js 5.0.0) ─────────────────

/** asfDefaultRipple — lets an issuer's IOU holders transfer it between each other. */
export const ASF_DEFAULT_RIPPLE = 8;
/** asfAllowTrustLineLocking — XLS-85 issuer opt-in; REQUIRED before token escrow.
 *  Verified a NAMED flag = 17 in the Phase-0 spike (AccountSetAsfFlags). */
export const ASF_ALLOW_TRUSTLINE_LOCKING = 17;

// ── Transport value types (the dry-run/testnet split speaks these) ──────────

/** An issued-currency (IOU) amount: currency code + issuer address + string value. */
export type IssuedAmount = { currency: string; issuer: string; value: string };

/** A wallet handle. `seed` is a SECRET — it lives in the secrets sidecar, never
 *  in serialized adapter state. Transports receive it per-call to sign. */
export type WalletHandle = { address: string; seed: string };

/** Result of a submitted transaction. `sequence` is the submitted tx's Sequence
 *  (an EscrowCreate's sequence is the OfferSequence an EscrowFinish consumes). */
export type TxResult = {
  ok: boolean; // engine result === 'tesSUCCESS'
  hash: string; // validated tx hash ('' on failure)
  code: string; // engine result code (tesSUCCESS / tec* / tem* / local error)
  sequence?: number;
  error?: string;
};

/** A single trust-line as read from account_lines. */
export type TrustLineInfo = {
  account: string; // the peer (issuer, from the holder's perspective)
  currency: string;
  balance: string;
  limit: string;
};

/** A single account_tx entry — enough to read the on-chain memo back externally. */
export type TxEntry = {
  hash: string;
  type: string; // TransactionType
  /** Decoded UTF-8 memo text of the first Memo, if any (already un-hexed). */
  memo?: string;
  /** Submitted Sequence of this tx. An EscrowCreate's Sequence is the
   *  OfferSequence EscrowFinish consumes; recovered when tesSUCCESS omitted it. */
  sequence?: number;
  /** EscrowCreate Destination — used to recover OfferSequence when the
   *  submit result timed out without a hash. */
  destination?: string;
  /** EscrowCreate issued-currency code (token escrow). */
  currency?: string;
  /** EscrowCreate issued-currency value string (token escrow). */
  value?: string;
};

/**
 * The transport seam. Two implementations behind ONE interface (xrpl-lab's
 * dry_run/xrpl_testnet split): a deterministic offline `dry-run` transport
 * (Phase 1) and the real `testnet` transport (Phase 2). Only the v1 methods the
 * escrow settlement path needs — deliberately a small subset of xrpl-lab's ~40.
 */
export interface LedgerTransport {
  /** 'dry-run' | 'testnet' — identify the network without a live call. */
  readonly networkName: string;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  /** Faucet a new funded wallet (per-run issuer/player/merchant). */
  fundWallet(): Promise<WalletHandle>;
  /** Reconstruct a wallet handle from a stored seed (persistent issuer / reload). */
  walletFromSeed(seed: string): WalletHandle;

  /** AccountSet SetFlag — issuer opt-ins: ASF_DEFAULT_RIPPLE, ASF_ALLOW_TRUSTLINE_LOCKING. */
  setAccountFlag(seed: string, flag: number): Promise<TxResult>;

  /** TrustSet — a holder trusts the issuer for `currency` up to `limit`. */
  trustSet(seed: string, issuer: string, currency: string, limit: string): Promise<TxResult>;

  /** Issued-currency Payment — mint (issuer→holder) or burn (holder→issuer). */
  payment(seed: string, destination: string, amount: IssuedAmount, memo?: string): Promise<TxResult>;

  /** Token EscrowCreate (XLS-85). `cancelAfter` is MANDATORY for a token escrow;
   *  `finishAfter`/`cancelAfter` are ripple-epoch seconds. Returns the create
   *  tx's `sequence` (needed by escrowFinish). Attaches `memo` if given. */
  escrowCreate(
    seed: string,
    destination: string,
    amount: IssuedAmount,
    finishAfter: number,
    cancelAfter: number,
    memo?: string,
  ): Promise<TxResult>;

  /** EscrowFinish — `owner` is the EscrowCreate account, `offerSequence` its
   *  create-tx sequence. Anyone may finish once FinishAfter has passed. */
  escrowFinish(seed: string, owner: string, offerSequence: number): Promise<TxResult>;

  /**
   * A VALUE-FREE memo anchor: a self-payment of the network minimum carrying
   * `memo`. The `diary` mode primitive.
   *
   * Separate from `payment` because `payment` speaks IssuedAmount, and an
   * IssuedAmount needs an issuer — the exact thing diary mode exists to avoid
   * standing up. This proves a state hash existed at a point in ledger history
   * without opening a trust line, minting a token, or moving an economy.
   */
  anchorMemo(seed: string, memo: string): Promise<TxResult>;

  /** account_lines — the holder's trust-line balances. */
  accountLines(address: string): Promise<TrustLineInfo[]>;

  /** account_tx — recent transactions (for external on-chain memo verification). */
  accountTx(address: string, limit?: number): Promise<TxEntry[]>;
}

// ── The engine-read seam (THE FIREWALL) ─────────────────────────────────────

/**
 * The read-only snapshot of the player-owned tradeable layer the adapter READS
 * at a checkpoint. This is a PLAIN DATA SHAPE — deliberately NOT an import of
 * `@ai-rpg-engine/core` — so the adapter has zero runtime coupling to the engine
 * and the firewall holds: the adapter reads this snapshot; the engine NEVER reads
 * the adapter. Phase 3's trade-core wiring produces it from the player entity
 * (`coin` resource + tallied consumable inventory); Phase 1 builds against the shape.
 */
export type TradeableSnapshot = {
  /** The player's `coin` balance (→ IOU). */
  coin: number;
  /** Consumable item-id → count (the fungible layer; → FT). */
  items: Record<string, number>;
};

// ── Adapter state (serializable; seeds live in the SECRETS SIDECAR) ─────────

export type SettlementStatus = 'settled' | 'pending';

/**
 * What a settlement WAS — written into the on-chain memo's `VERB:` field and
 * verified back by `reconcile`.
 *
 * `settle` is the generic net-delta checkpoint. `buy`/`sell` distinguish a
 * directed trade. `consign`/`default` are the obligation lifecycle: goods handed
 * to a counterparty against future payment, and that obligation lapsing unpaid.
 *
 * Every member must be REACHABLE — a verb the adapter can never emit is an inert
 * axis, and this union had exactly that problem: `buy` and `sell` existed but both
 * call sites passed the literal `'settle'`, so no run could ever produce them.
 * Adding members to a union nothing writes just makes more dead ones, which is why
 * `settle()` now takes the verb from its caller.
 */
export type SettlementVerb = 'buy' | 'sell' | 'settle' | 'consign' | 'default';

/**
 * Per-resource write receipt. Persisted on the settlement record BEFORE the
 * next key is submitted so a fail-then-retry path can skip keys whose tx
 * already landed (hash / escrow sequence) instead of replaying the whole set.
 */
export type SettlementKeyReceipt = {
  txids: string[];
  /** EscrowCreate sequence, so a retry can EscrowFinish without creating a second escrow. */
  sequence?: number;
  /** True once this key's on-ledger write is complete (payment landed, or escrow finished). */
  done?: boolean;
};

/** One checkpoint settlement — signed deltas + the txids + the exact on-chain memo. */
export type SettlementRecord = {
  checkpoint: number;
  location: string;
  /** resource-key → signed delta (e.g. `coin: -25`, `potion: +2`). */
  deltas: Record<string, number>;
  txids: string[];
  status: SettlementStatus;
  /** The exact on-chain memo TEXT (so the record matches the ledger byte-for-byte). */
  memo: string;
  timestamp: string;
  /**
   * Per-key receipts for idempotent retry. OPTIONAL: records written before
   * this field existed have none, and a retry without receipts falls back to
   * on-ledger balance / account_tx comparison.
   */
  receipts?: Record<string, SettlementKeyReceipt>;
  /**
   * The verb this settlement was made under.
   *
   * PERSISTED because the retry path rebuilds the memo from the record: without
   * it, `retryPending` had no choice but to hardcode `'settle'`, so a `consign`
   * that went pending and later cleared landed on-chain as a generic settle —
   * the distinct artifact silently collapsing on precisely the path that exists
   * because the network is unreliable.
   *
   * OPTIONAL for back-compat: a serialized state written before this field
   * existed has no `verb`, and `deserializeState` leaves it undefined rather
   * than inventing one. Consumers treat absent as `'settle'` (what those older
   * records were in fact all written as).
   */
  verb?: SettlementVerb;
  /**
   * Last retry/settle error for THIS record. OPTIONAL: older saves omit it.
   * The still-pending SettlementResult interpolates this so a sidecar miss,
   * tecPATH_DRY, unindexed OfferSequence, and a stalled node are distinguishable.
   */
  lastError?: string;
};

/**
 * The adapter's serializable state. **Seeds are NEVER here** — they live in the
 * secrets sidecar (DECOMPOSE_BY_SECRETS). This holds ADDRESSES + settlement
 * bookkeeping and must round-trip across save/load without perturbing engine
 * determinism (the reload-determinism CRITICAL from Ledger Trail).
 */
export type LedgerAdapterState = {
  mode: LedgerMode;
  issuerMode: IssuerMode;
  enabled: boolean;
  issuerAddress: string;
  playerAddress: string;
  /** Escrow destination (the merchant/Merchant-Authority; may equal issuer for per-run). */
  merchantAddress: string;
  trustLinesReady: boolean;
  /** game resource-key → XRPL currency code (coin→'COI', potion→'POT', …). */
  tokenMap: Record<string, string>;
  /** resource-key → last-settled balance — the baseline delta is measured against. */
  lastSettled: Record<string, number>;
  /**
   * Opening mint per resource-key, snapshotted once at first enable checkpoint.
   * `lastSettled` advances on every settle; conservation (`minted + Σdeltas ===
   * lastSettled`) needs this stash after save/reload. OPTIONAL for back-compat:
   * a pre-field save has none; `deserializeState` defaults it to `{}`.
   */
  mintedInitial?: Record<string, number>;
  settlements: SettlementRecord[];
  pending: SettlementRecord[];
  /** Degraded signal: the last settle attempt failed (testnet unreachable). */
  lastSettleFailed: boolean;
  /**
   * The NFT unique-gear layer (v2 slice), keyed by gameItemId — carried
   * ALONGSIDE the fungible tokenMap/lastSettled fields above, never conflated.
   * OPTIONAL for back-compat: a v3.2 (fungible-only) serialized state has no
   * `nfts` key; `deserializeState` defaults it to `{}` so old saves round-trip
   * unchanged (the reload-determinism CRITICAL). See {@link NFTokenRef}.
   */
  nfts?: Record<string, NFTokenRef>;
};

/**
 * The secrets sidecar: `address → seed`. Persisted to a GITIGNORED file
 * (`.<game>/secrets.json`), NEVER to the save/run/adapter-state file. Throwaway
 * faucet wallets, testnet only. This is the security boundary the `security-impl`
 * domain owns.
 */
export type SecretsSidecar = { seeds: Record<string, string> };

// ── Adapter operation results ───────────────────────────────────────────────

/**
 * Operator-facing network badge. Derived from `LedgerTransport.networkName`
 * (`dry-run` | `testnet` | `devnet`) — never mainnet. Used in EnableResult /
 * SettlementResult copy so a faucet session is distinguishable from a local
 * fake. `fake-dry-run` is the in-test FakeTransport alias of dry-run.
 */
export function ledgerNetworkLabel(networkName: string): string {
  if (networkName === 'testnet') return 'XRPL Testnet';
  if (networkName === 'devnet') return 'XRPL Devnet';
  if (networkName === 'dry-run' || networkName === 'fake-dry-run') return 'Dry-run';
  return networkName;
}

/** Longer qualifier for enable-success copy (faucet / no real value). */
export function ledgerNetworkQualifier(networkName: string): string {
  if (networkName === 'testnet') return 'XRPL Testnet — faucet wallets, no real value';
  if (networkName === 'devnet') return 'XRPL Devnet — faucet wallets, no real value';
  if (networkName === 'dry-run' || networkName === 'fake-dry-run') return 'Dry-run — no real value';
  return `${ledgerNetworkLabel(networkName)} — this is not mainnet value`;
}

export type EnableResult = {
  success: boolean;
  message: string;
  playerAddress?: string;
  /** `transport.networkName` — 'dry-run' | 'testnet' | 'devnet'. */
  network?: string;
  /** Testnet/devnet account explorer for `playerAddress`. Omitted on dry-run; never mainnet. */
  playerExplorerUrl?: string;
};
export type SettlementResult = {
  success: boolean;
  message: string;
  txids?: string[];
  record?: SettlementRecord;
  /** `transport.networkName` — 'dry-run' | 'testnet' | 'devnet'. */
  network?: string;
  /** Testnet/devnet transaction explorer URLs for `txids`, in order. Omitted on dry-run; never mainnet. */
  explorerUrls?: string[];
};

/** Testnet / devnet explorer origins — never mainnet. */
const EXPLORER_ORIGINS: Record<string, string> = {
  testnet: 'https://testnet.xrpl.org',
  devnet: 'https://devnet.xrpl.org',
};

function explorerOrigin(network: string): string | undefined {
  return EXPLORER_ORIGINS[network];
}

/** Transaction explorer URL for a submitted hash. Undefined on dry-run / unknown / empty. */
export function txExplorerUrl(network: string, hash: string): string | undefined {
  if (!hash) return undefined;
  const origin = explorerOrigin(network);
  return origin ? `${origin}/transactions/${hash}` : undefined;
}

/** Account explorer URL. Undefined on dry-run / unknown / empty. */
export function accountExplorerUrl(network: string, address: string): string | undefined {
  if (!address) return undefined;
  const origin = explorerOrigin(network);
  return origin ? `${origin}/accounts/${address}` : undefined;
}

/** NFT explorer URL. Undefined on dry-run / unknown / empty. Shared with the unique-gear layer. */
export function nftExplorerUrl(network: string, nftId: string): string | undefined {
  if (!nftId) return undefined;
  const origin = explorerOrigin(network);
  return origin ? `${origin}/nft/${nftId}` : undefined;
}

// ── Reconciliation (the EXTERNAL_VERIFIER — ported from ledger_proof.py) ─────

/** Per-resource reconciliation of ledger vs engine. */
export type ResourceCheck = {
  resource: string;
  code: string;
  minted: number;
  sumDeltas: number;
  engineSettled: number;
  ledger: number | null;
  balanceOk: boolean; // ledger === engineSettled
  conservationOk: boolean; // minted + sumDeltas === engineSettled
};

/** Full reconciliation verdict for one proof run. */
export type ReconcileReport = {
  runId: string;
  seed: number;
  playerAddress: string;
  issuerAddress: string;
  settlementsCount: number;
  pendingCount: number;
  txids: string[];
  resources: ResourceCheck[];
  memoOk: boolean; // authoritative (external when available, else local)
  memoLocalOk: boolean; // engine-stored record memo is internally consistent
  onchainMemoOk: boolean | null; // decoded ON-CHAIN memo matches (null if none fetched)
  /** The NFT unique-gear OWNERSHIP checks (P4). OPTIONAL/additive: present only
   *  when NFT inputs were supplied — a fungible-only reconcile omits it, and the
   *  existing resource/memo verdict is unchanged. When present, every check must
   *  pass for `passed` to be true. */
  nftChecks?: NFTCheck[];
  passed: boolean;
  notes: string[];
};

/** Pure inputs to `reconcile` — no network, no xrpl import (unit-testable offline). */
export type ReconcileInput = {
  runId: string;
  seed: number;
  /**
   * Which mode produced these settlements. Omit for `'ledger'` — the historical
   * behaviour and every pre-diary caller.
   *
   * In `'diary'` there ARE no on-ledger balances to compare against, by design:
   * the run opened no trust lines and minted nothing. Comparing anyway would
   * fail every resource for the honest reason that nothing was ever custodied,
   * so a diary reconcile rests its verdict on the ANCHOR CHAIN instead — the
   * per-checkpoint memos read back off the ledger. Conservation is still
   * checked: the arithmetic linking the opening baseline to the recorded deltas
   * has to hold whether or not anyone moved a token.
   */
  mode?: LedgerMode;
  mintedInitial: Record<string, number>;
  ledgerBalances: Record<string, number>; // keyed by XRPL currency code
  lastSettled: Record<string, number>;
  settlements: SettlementRecord[];
  pending: SettlementRecord[];
  playerAddress?: string;
  issuerAddress?: string;
  /** txid → decoded on-chain memo text; omit for a network-free local reconcile. */
  onchainMemos?: Record<string, string>;
  /**
   * resource-key → XRPL currency code — the SAME map the adapter minted/settled
   * with (`LedgerAdapterState.tokenMap`, assigned via the valid, collision-safe
   * `assignTokenCode`). When supplied, `reconcile` looks up `ledgerBalances` by
   * these codes so the verifier and the on-ledger truth speak the same currency
   * codes. Omit for a synthetic/local reconcile whose test controls both sides;
   * reconcile then falls back to a stateless derivation.
   */
  tokenMap?: Record<string, string>;
  /**
   * The NFT unique-gear refs the engine tracks (P4). Omit for a fungible-only
   * reconcile. When supplied, `reconcile` emits an `NFTCheck` per ref, matching
   * `expectedUri` (from the ref's relicVersion) + ownership against `ledgerNfts`.
   */
  nfts?: NFTokenRef[];
  /**
   * nftId -> the on-ledger owner + decoded URI (from `account_nfts`), supplied
   * by the driver. Omit for a network-free local reconcile: each NFTCheck's
   * `ownedOnLedger` is then false and `ledgerUri` null (honestly unverified),
   * exactly as `ledgerBalances`/`onchainMemos` degrade for the fungible side.
   */
  ledgerNfts?: Record<string, { owner: string; uri: string }>;
};

/** The pure reconciliation function signature (settle-impl owns the body). */
export type ReconcileFn = (input: ReconcileInput) => ReconcileReport;

// ── The adapter public API (settle-impl owns the body) ──────────────────────

/**
 * The opt-in adapter. All methods are async (the testnet transport is networked);
 * the dry-run transport resolves synchronously. `enable`/`settle` are idempotent
 * and conservation-safe on the fail-then-retry path (Ledger Trail's CRITICAL).
 * The engine is never passed in — only a read-only `TradeableSnapshot`.
 */
/**
 * Per-settlement overrides — the axes a single checkpoint can vary from the
 * adapter's construction-time config.
 *
 * WHY PER-CALL AND NOT PER-ADAPTER: `settlement` lives on `LedgerAdapterConfig`,
 * fixed at `createLedgerAdapter()`. Varying it by spinning up a second adapter
 * would mean a second `LedgerAdapterState` — two baselines, two trust-line sets,
 * two conservation invariants, and two `reconcile()` reports over one game's
 * economy. That fragments the single ledger truth into shards, and a verifier
 * pointed at one shard is structurally blind to the other. One state, one
 * conservation invariant, one reconcile; the primitive is a property of the
 * settlement, not of the adapter.
 */
export type SettleOptions = {
  /**
   * What this settlement WAS, written into the memo's `VERB:` field.
   * Defaults to `'settle'` (the generic net-delta checkpoint).
   */
  verb?: SettlementVerb;
  /**
   * Override the settlement primitive for THIS call only; falls back to
   * `config.settlement`. Lets one game settle escrowed trades in a lawful market
   * and direct payments in a black market, against one set of books.
   */
  primitive?: SettlementPrimitive;
};

/**
 * The opt-in adapter. All methods are async (the testnet transport is networked);
 * the dry-run transport resolves synchronously. `enable`/`settle` are idempotent
 * and conservation-safe on the fail-then-retry path (Ledger Trail's CRITICAL).
 * The engine is never passed in — only a read-only `TradeableSnapshot`.
 */
export interface LedgerAdapter {
  readonly config: LedgerAdapterConfig;
  /** Stamped into settlement memos / NFT URIs — same value passed to createLedgerAdapter. */
  readonly gameId: string;
  /** Stamped into settlement memos — same value passed to createLedgerAdapter. */
  readonly runId: string;
  /**
   * Inbound seed lookup (in-memory cache, then the injected sidecar `getSeed`).
   * Public so checkpoint NFT wrappers and resumeAdapter can hydrate issuer/player
   * seeds without the host re-plumbing secrets per call. NEVER serializes.
   */
  getSeed(address: string): string | undefined;
  /** Create/reuse wallets, set issuer flags + trust lines, mint the starting snapshot. */
  enable(state: LedgerAdapterState, snapshot: TradeableSnapshot): Promise<EnableResult>;
  /**
   * Settle the net delta since the last checkpoint (idempotent per checkpoint).
   * `options` is optional — omitting it is exactly the previous behavior
   * (`verb: 'settle'`, `primitive: config.settlement`).
   */
  settle(
    state: LedgerAdapterState,
    snapshot: TradeableSnapshot,
    checkpoint: number,
    location: string,
    options?: SettleOptions,
  ): Promise<SettlementResult>;
  /** Turn the adapter off; keep wallets for a potential re-enable. */
  disable(state: LedgerAdapterState): void;
}

// ── Memo convention (shared: transport attaches it, reconcile verifies it) ──

export const MEMO_SCHEMA_VERSION = 1;

/**
 * Canonical settlement memo — the exact bytes written on-chain (adapts Ledger
 * Trail's `TRAIL|RUN:…` grammar). The `ARPG|GAME:<id>|RUN:<id>|CHECKPOINT:<n>`
 * prefix is what the external verifier matches; deltas + version follow.
 * Example: `ARPG|GAME:pirate|RUN:abc|CHECKPOINT:3|DELTA:coin-25,potion+2|VERB:sell|V:1`
 */
export function buildSettlementMemo(
  gameId: string,
  runId: string,
  checkpoint: number,
  deltas: Record<string, number>,
  verb: SettlementVerb,
): string {
  return `ARPG|GAME:${gameId}|RUN:${runId}|CHECKPOINT:${checkpoint}|DELTA:${settlementMemoDeltas(deltas)}|VERB:${verb}|V:${MEMO_SCHEMA_VERSION}`;
}

/** The canonical `DELTA:` field body — sorted keys, explicit sign. */
function settlementMemoDeltas(deltas: Record<string, number>): string {
  return Object.keys(deltas)
    .sort()
    .map((k) => `${k}${deltas[k] >= 0 ? '+' : ''}${deltas[k]}`)
    .join(',');
}

/** The prefix a settlement memo must begin with (for external verification). */
export function settlementMemoPrefix(gameId: string, runId: string, checkpoint: number): string {
  return `ARPG|GAME:${gameId}|RUN:${runId}|CHECKPOINT:${checkpoint}`;
}

/**
 * The FULL memo a record implies — prefix plus the `DELTA:`/`VERB:`/`V:` tail.
 *
 * `settlementMemoPrefix` terminates at `CHECKPOINT:<n>`, and `reconcile` matched
 * on that prefix alone — so everything after it was written on-chain and never
 * read back. The deltas were unverified (the engine already holds them, so
 * checking them against the chain is free) and the verb was unverified entirely,
 * which made it an annotation rather than a proof.
 *
 * This is what a verifier should match to claim the on-chain memo agrees with the
 * engine's record. `verb` defaults to `'settle'` for pre-verb records, which is
 * what all of them were written as.
 */
export function expectedSettlementMemo(
  gameId: string,
  runId: string,
  record: Pick<SettlementRecord, 'checkpoint' | 'deltas' | 'verb'>,
): string {
  return buildSettlementMemo(
    gameId,
    runId,
    record.checkpoint,
    record.deltas,
    record.verb ?? 'settle',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  NFT UNIQUE-GEAR LAYER (the v2 slice — coordinator-owned, frozen at P1)
// ═══════════════════════════════════════════════════════════════════════════
//
// A DISTINCT shape carried ALONGSIDE the fungible TradeableSnapshot/tokenMap
// layer above — never conflated with it. This binds the `equipment` package's
// UNIQUE 1-of-1 gear (rarity / provenance / item-chronicle / relic-growth) to
// XLS-20 NFTs, with the XLS-46 DynamicNFT mutation (NFTokenModify) for relic
// growth. Proven LIVE on testnet at P0 (2026-07-23): NFTokenMint(tfMutable) +
// directed transfer + NFTokenModify (issuer mutates a player-OWNED NFT) +
// NFTokenBurn (the named compensator). DynamicNFT amendment is enabled on
// testnet — relic growth uses NFTokenModify as the PRIMARY path.
//
// THE FIREWALL HOLDS (unchanged law): the read shape below is PLAIN DATA — it
// is deliberately NOT an import of `@ai-rpg-engine/equipment` (rarity/slot are
// `string`, not the package's enums) — so the adapter keeps ZERO runtime
// coupling to the engine. The equipment read-path (engine/equipment-snapshot.ts,
// P3) produces it from `world.modules['equipment-core']` with a TYPE-ONLY
// import, exactly as engine/snapshot.ts does for TradeableSnapshot. Mint/modify
// happen only at CHECKPOINTS, never in the tick; a run is byte-identical
// with/without the adapter.
//
// KEY DESIGN CONSTRAINTS (KB gotchas + P0):
//  - tfMutable is decided AT MINT and cannot be retrofitted -> mint ALL gear
//    mutable (Director decision) to future-proof relic growth.
//  - Only the URI is mutable; "leveling" = pointing the URI at new metadata
//    while the NFTokenID stays STABLE (identity preserved across growth).
//  - Only the ISSUER / authorized minter may submit NFTokenModify — the holder
//    cannot. The adapter's `issuerAddress` (state) signs modifications.

// ── The engine-read seam for unique gear (THE FIREWALL, NFT side) ───────────

/**
 * The read-only snapshot of ONE unique item the adapter mints / relic-grows as
 * an NFT. PLAIN DATA (rarity/slot are strings, not equipment-package enums) so
 * contracts.ts stays decoupled from `@ai-rpg-engine/equipment`.
 */
export type UniqueItemSnapshot = {
  /** Game item id (the equipment catalog id) — the STABLE key across relic growth. */
  itemId: string;
  /** Display name at snapshot time (may already carry a relic epithet). */
  name: string;
  /** Equipment slot ('weapon'|'armor'|'accessory'|'tool'|'trinket') as a string. */
  slot: string;
  /** Rarity ('common'|'uncommon'|'rare'|'legendary') as a string. */
  rarity: string;
  /** Equipped (vs merely carried) at snapshot time — metadata, not identity. */
  equipped: boolean;
  /** Current relic tier (0-3); 0 = un-grown. */
  relicTier: number;
  /** Current relic epithet, if earned (e.g. 'Bloodied Cutlass'). */
  relicEpithet?: string;
  /**
   * MONOTONIC relic version supplied by the read path — bumps whenever the
   * item's relic state advances. The adapter compares it to the last-minted
   * `NFTokenRef.relicVersion` to decide MINT (new item) vs NFTokenModify (grown
   * item) vs no-op (unchanged) at a checkpoint. A DETERMINISTIC function of the
   * equipment RelicState (never a clock/RNG); the read path uses
   * `milestonesReached.length`. The contract only requires monotonic-per-item.
   */
  relicVersion: number;
};

/**
 * The read-only snapshot of the player's UNIQUE equipment the NFT layer reads at
 * a checkpoint — the NFT-side sibling of TradeableSnapshot, and a SEPARATE read
 * path: produced from `world.modules['equipment-core'].loadouts[playerId]`
 * (equipped slots + carried inventory) resolved against the pack catalog + each
 * item's chronicle -> RelicState, NOT from the `coin`+`inventory[]` the fungible
 * TradeableSnapshot reads.
 */
export type EquipmentSnapshot = {
  items: UniqueItemSnapshot[];
};

// ── NFT metadata URI (shared: mint/modify write it, reconcile predicts it) ──

export const NFT_URI_SCHEMA_VERSION = 1;

/**
 * Canonical on-ledger metadata URI for a unique-gear NFT — the exact bytes the
 * mint/modify writes and the external verifier predicts. Deterministic in
 * (gameId, itemId, relicVersion, relicTier) ONLY (no free-text epithet — kept
 * out of the canonical URI so `reconcile`'s expected URI is exactly
 * predictable). The NFT analogue of `buildSettlementMemo`: NFTokenModify
 * advancing this URI (same NFTokenID) is the on-ledger PROOF a relic grew.
 * Example: `ARPG-NFT|GAME:pirate|ITEM:cutlass|RELIC:1|TIER:1|V:1`
 */
export function buildItemNFTUri(
  gameId: string,
  itemId: string,
  relicVersion: number,
  relicTier: number,
): string {
  return `ARPG-NFT|GAME:${gameId}|ITEM:${itemId}|RELIC:${relicVersion}|TIER:${relicTier}|V:${NFT_URI_SCHEMA_VERSION}`;
}

// ── NFT transport value types (the dry-run/testnet split speaks these) ──────

/** Mint flags. Director decision: mint ALL unique gear `mutable:true` (tfMutable
 *  is permanent-at-mint and cannot be retrofitted — future-proof every item for
 *  relic growth); `transferable:true` for player-tradeable gear. */
export type NFTMintFlags = { transferable: boolean; mutable: boolean };

/** One NFT as read back from `account_nfts` — the on-ledger truth the reconciler
 *  checks OWNERSHIP + URI against (the external verifier for the NFT layer). */
export type NFTInfo = {
  nftId: string; // NFTokenID (content-addressed; STABLE across NFTokenModify)
  uri: string; // decoded URI text ('' if none)
  taxon: number; // NFTokenTaxon (collection id)
  issuer: string; // the minting issuer
  flags: number; // ledger flags (lsfMutable 0x10, lsfTransferable 0x8, ...)
};

/** NFTokenMint result — `nftId` is the newly-minted NFTokenID on success. */
export type NFTMintResult = TxResult & { nftId?: string };

/** NFTokenCreateOffer result — `offerIndex` is the created offer's ledger index
 *  (the argument NFTokenAcceptOffer consumes). */
export type NFTOfferResult = TxResult & { offerIndex?: string };

/** One live sell offer as read back from `nft_sell_offers` — used to recover a
 *  tesSUCCESS CreateOffer whose `offerIndex` was missing from submit meta. */
export type NFTSellOfferInfo = {
  offerIndex: string;
  nftId: string;
  destination?: string;
  owner?: string;
};

/**
 * The NFT transport seam — a SEPARATE interface from `LedgerTransport` (the
 * fungible seam) so the NFT capability is additive: DryRunTransport and
 * TestnetTransport add `implements NFTTransport` when they implement it (P1
 * dry-run, P2 testnet), and the fungible seam + its existing tests are
 * untouched (DECOMPOSE_BY_SECRETS: the NFT concern groups separately). Only the
 * v1 methods the unique-gear path needs — the exact tx shapes proven at P0.
 */
export interface NFTTransport {
  /** NFTokenMint. `flags` -> tfTransferable|tfMutable; `transferFee` in units of
   *  1/100000 (0..50000 = 0..50%), requires transferable. Returns the minted
   *  NFTokenID on success. */
  nftMint(
    seed: string,
    uri: string,
    taxon: number,
    flags: NFTMintFlags,
    transferFee?: number,
  ): Promise<NFTMintResult>;

  /** NFTokenBurn — the named COMPENSATOR for a mint. `owner` is required when
   *  burning a token the signer no longer holds (issuer-burnable); omit when the
   *  signer owns it. */
  nftBurn(seed: string, nftId: string, owner?: string): Promise<TxResult>;

  /** NFTokenModify — advance a mutable NFT's URI (relic growth). The signer MUST
   *  be the issuer/authorized-minter (the holder cannot). `owner` is the current
   *  NFT holder; the impl omits the on-tx Owner field when it equals the signer. */
  nftModify(seed: string, nftId: string, uri: string, owner: string): Promise<TxResult>;

  /** NFTokenCreateOffer (sell). A directed 0-value sell (`amount:'0'` +
   *  `destination`) is the gift/transfer path used to move minted gear to the
   *  player. Returns the created offer's ledger index. */
  nftCreateSellOffer(
    seed: string,
    nftId: string,
    amount: string,
    destination?: string,
  ): Promise<NFTOfferResult>;

  /** NFTokenAcceptOffer — accept a sell offer by its ledger index (settles the
   *  transfer atomically). */
  nftAcceptSellOffer(seed: string, offerIndex: string): Promise<TxResult>;

  /** nft_sell_offers — live sell offers against `nftId` (recover a tesSUCCESS
   *  CreateOffer whose offerIndex never made it into submit meta). */
  nftSellOffers(nftId: string): Promise<NFTSellOfferInfo[]>;

  /** account_nfts — the NFTs an address owns (the external-verifier read). */
  accountNfts(address: string): Promise<NFTInfo[]>;
}

// ── NFT adapter state (serializable; carried ALONGSIDE the fungible layer) ──

/**
 * One minted unique-gear NFT the adapter tracks in state, keyed by `gameItemId`
 * (1-of-1, NOT a fungible count). IDEMPOTENCY: the presence of a ref for a
 * gameItemId is what prevents a double-mint on the fail-then-retry path — the
 * NFT analogue of the fungible conservation-on-retry CRITICAL. `nftId` is stable
 * across relic growth (NFTokenModify changes only the URI, never the NFTokenID).
 */
export type NFTokenRef = {
  gameItemId: string; // equipment catalog id (the key)
  nftId: string; // on-ledger NFTokenID (stable across relic growth)
  uri: string; // current metadata URI (advanced by NFTokenModify)
  relicVersion: number; // the relic version this NFT's URI currently reflects
  taxon: number; // collection id
  mutable: boolean; // minted tfMutable (always true per the mint-all-mutable decision)
  mintTxid: string; // the NFTokenMint tx hash (provenance)
  /**
   * Directed sell-offer ledger index for a pending issuer→player transfer.
   * Present (including `''`) once NFTokenCreateOffer tesSUCCESS'd: a nonempty
   * value is accepted on resume; `''` means tesSUCCESS without a parsed index
   * (recover via nft_sell_offers, never create a second offer). Absent means
   * no offer has been submitted yet.
   */
  offerIndex?: string;
  /**
   * Directed player→issuer sell-offer ledger index while unique gear that
   * left the loadout is being transferred back (then burned). Same empty-string
   * hatch as `offerIndex`: tesSUCCESS without a parsed index recovers via
   * nft_sell_offers, never a second offer.
   */
  releaseOfferIndex?: string;
  /** Display name from the last EquipmentSnapshot — used when the item later leaves the loadout. */
  name?: string;
  /** 'pending' = mint submitted but not yet confirmed owned on-ledger (retry-safe);
   *  'minted' = confirmed. A retry sees the existing ref and never re-mints. */
  status: 'minted' | 'pending';
};

// ── NFT reconciliation (the 1-of-1 OWNERSHIP check family, distinct from
//    the fungible ResourceCheck balance/conservation family) ────────────────

/**
 * Per-item NFT reconciliation of ledger vs engine. A PASS means `account_nfts`
 * independently confirms the player OWNS the tracked NFT AND its on-chain URI
 * matches the relic version the engine expects — the engine cannot fake either.
 */
export type NFTCheck = {
  gameItemId: string;
  nftId: string;
  expectedOwner: string; // the player's address
  ownedOnLedger: boolean; // account_nfts(player) contains nftId
  expectedUri: string; // the URI the engine's relicVersion implies (buildItemNFTUri)
  ledgerUri: string | null; // the URI account_nfts reports (null if the NFT is absent)
  uriOk: boolean; // ledgerUri === expectedUri (relic version matches on-chain)
  ok: boolean; // ownedOnLedger && uriOk
};
