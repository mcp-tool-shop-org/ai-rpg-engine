// state-impl domain — the adapter's pure, serializable state model.
//
// Grounded in escape-the-valley's BackpackState (backpack_models.py) and how
// backpack.py uses `last_settled_supplies` as the settlement baseline
// (`diff = current - previous`, then folds a retried delta back into the
// baseline on success). Reimplemented in TS against the frozen contracts in
// ../contracts.ts — nothing here imports xrpl or any transport.
//
// SECURITY (DECOMPOSE_BY_SECRETS): seeds NEVER appear in this module's output.
// `LedgerAdapterState` (contracts.ts) has no seed field by construction, and
// `serializeState` below carries a runtime belt-and-suspenders check so a
// future accidental field addition fails loudly instead of leaking silently.

import type {
  LedgerAdapterConfig,
  LedgerAdapterState,
  LedgerMode,
  IssuerMode,
  NFTokenRef,
  SettlementStatus,
  SettlementRecord,
  TradeableSnapshot,
} from '../contracts.js';

// ── Initial state ────────────────────────────────────────────────────────

/**
 * Fresh adapter state for a new run. `mode`/`issuerMode` are copied from the
 * config (the only config-derived fields `LedgerAdapterState` carries — the
 * config's `settlement` primitive and `network` are not part of state, they
 * stay purely config); everything else starts empty/disabled. No wallets, no
 * settlements — `enable()` (settle-impl) is what populates addresses.
 *
 * `nfts: {}` starts the NFT unique-gear layer (contracts.ts's optional
 * `LedgerAdapterState.nfts`) empty, ALONGSIDE the fungible fields above —
 * never conflated with `tokenMap`/`lastSettled`. A fresh object literal every
 * call, exactly like `tokenMap`/`lastSettled`/etc. above (no shared mutable
 * reference across two `createInitialState` calls).
 */
export function createInitialState(config: LedgerAdapterConfig): LedgerAdapterState {
  return {
    mode: config.mode,
    issuerMode: config.issuerMode,
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
    nfts: {},
  };
}

// ── Serialization ────────────────────────────────────────────────────────

/** Any JSON object key whose name contains "seed" (case-insensitive). A
 *  belt-and-suspenders runtime guard: the `LedgerAdapterState` type has no
 *  seed field, so this should never fire on well-typed input. It exists so a
 *  future accidental widen (e.g. someone spreads a wallet handle into state)
 *  fails LOUD at serialize time instead of quietly writing a secret to disk. */
const FORBIDDEN_KEY_PATTERN = /"[^"]*seed[^"]*"\s*:/i;

/** Serialize adapter state to JSON. Throws if a seed-shaped key is present —
 *  seeds belong only in the secrets sidecar (security-impl domain), never in
 *  the (save-file-adjacent) adapter state this function produces. */
export function serializeState(state: LedgerAdapterState): string {
  const json = JSON.stringify(state);
  if (FORBIDDEN_KEY_PATTERN.test(json)) {
    throw new Error(
      'serializeState: refusing to serialize state containing a "seed"-named key — ' +
        'seeds live in the secrets sidecar, never in adapter state.',
    );
  }
  return json;
}

const REQUIRED_STATE_KEYS = [
  'mode',
  'issuerMode',
  'enabled',
  'issuerAddress',
  'playerAddress',
  'merchantAddress',
  'trustLinesReady',
  'tokenMap',
  'lastSettled',
  'settlements',
  'pending',
  'lastSettleFailed',
] as const;

const VALID_MODES: readonly LedgerMode[] = ['offline', 'ledger', 'diary'];
const VALID_ISSUER_MODES: readonly IssuerMode[] = ['per-run', 'persistent'];
const VALID_STATUSES: readonly SettlementStatus[] = ['settled', 'pending'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecordOfStrings(value: unknown): value is Record<string, string> {
  return isPlainObject(value) && Object.values(value).every((v) => typeof v === 'string');
}

function isRecordOfNumbers(value: unknown): value is Record<string, number> {
  return isPlainObject(value) && Object.values(value).every((v) => typeof v === 'number');
}

function assertSettlementRecord(value: unknown, path: string): asserts value is SettlementRecord {
  if (!isPlainObject(value)) {
    throw new Error(`deserializeState: "${path}" must be an object`);
  }
  if (typeof value.checkpoint !== 'number') {
    throw new Error(`deserializeState: "${path}.checkpoint" must be a number`);
  }
  if (typeof value.location !== 'string') {
    throw new Error(`deserializeState: "${path}.location" must be a string`);
  }
  if (!isRecordOfNumbers(value.deltas)) {
    throw new Error(`deserializeState: "${path}.deltas" must be a Record<string, number>`);
  }
  if (!Array.isArray(value.txids) || !value.txids.every((t) => typeof t === 'string')) {
    throw new Error(`deserializeState: "${path}.txids" must be a string[]`);
  }
  if (!VALID_STATUSES.includes(value.status as SettlementStatus)) {
    throw new Error(`deserializeState: "${path}.status" must be one of ${VALID_STATUSES.join('|')}`);
  }
  if (typeof value.memo !== 'string') {
    throw new Error(`deserializeState: "${path}.memo" must be a string`);
  }
  if (typeof value.timestamp !== 'string') {
    throw new Error(`deserializeState: "${path}.timestamp" must be a string`);
  }
}

function assertSettlementRecordArray(value: unknown, path: string): asserts value is SettlementRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`deserializeState: "${path}" must be an array`);
  }
  value.forEach((entry, i) => assertSettlementRecord(entry, `${path}[${i}]`));
}

const VALID_NFT_STATUSES: readonly NFTokenRef['status'][] = ['minted', 'pending'];

/** Mirrors `assertSettlementRecord` for the NFT unique-gear layer's
 *  `NFTokenRef` shape (contracts.ts). Throws a clear `Error` naming the exact
 *  offending field — never a silent `undefined`/`NaN` landing in state. */
function assertNFTokenRef(value: unknown, path: string): asserts value is NFTokenRef {
  if (!isPlainObject(value)) {
    throw new Error(`deserializeState: "${path}" must be an object`);
  }
  if (typeof value.gameItemId !== 'string') {
    throw new Error(`deserializeState: "${path}.gameItemId" must be a string`);
  }
  if (typeof value.nftId !== 'string') {
    throw new Error(`deserializeState: "${path}.nftId" must be a string`);
  }
  if (typeof value.uri !== 'string') {
    throw new Error(`deserializeState: "${path}.uri" must be a string`);
  }
  if (typeof value.relicVersion !== 'number') {
    throw new Error(`deserializeState: "${path}.relicVersion" must be a number`);
  }
  if (typeof value.taxon !== 'number') {
    throw new Error(`deserializeState: "${path}.taxon" must be a number`);
  }
  if (typeof value.mutable !== 'boolean') {
    throw new Error(`deserializeState: "${path}.mutable" must be a boolean`);
  }
  if (typeof value.mintTxid !== 'string') {
    throw new Error(`deserializeState: "${path}.mintTxid" must be a string`);
  }
  if (!VALID_NFT_STATUSES.includes(value.status as NFTokenRef['status'])) {
    throw new Error(`deserializeState: "${path}.status" must be one of ${VALID_NFT_STATUSES.join('|')}`);
  }
}

/** Validates `LedgerAdapterState.nfts` — a `Record<string, NFTokenRef>` keyed
 *  by gameItemId. Only called when the key is PRESENT (see
 *  `assertLedgerAdapterState`): `nfts` itself is optional for v3.2 back-compat. */
function assertNFTokenRefRecord(value: unknown, path: string): asserts value is Record<string, NFTokenRef> {
  if (!isPlainObject(value)) {
    throw new Error(`deserializeState: "${path}" must be an object`);
  }
  for (const key of Object.keys(value)) {
    assertNFTokenRef(value[key], `${path}.${key}`);
  }
}

/** Validate an already-parsed value against the `LedgerAdapterState` shape.
 *  Throws a clear `Error` naming the first offending field on any mismatch. */
function assertLedgerAdapterState(value: unknown): asserts value is LedgerAdapterState {
  if (!isPlainObject(value)) {
    throw new Error('deserializeState: root value must be a JSON object');
  }
  for (const key of REQUIRED_STATE_KEYS) {
    if (!(key in value)) {
      throw new Error(`deserializeState: missing required key "${key}"`);
    }
  }
  if (!VALID_MODES.includes(value.mode as LedgerMode)) {
    throw new Error(`deserializeState: "mode" must be one of ${VALID_MODES.join('|')}`);
  }
  if (!VALID_ISSUER_MODES.includes(value.issuerMode as IssuerMode)) {
    throw new Error(`deserializeState: "issuerMode" must be one of ${VALID_ISSUER_MODES.join('|')}`);
  }
  if (typeof value.enabled !== 'boolean') {
    throw new Error('deserializeState: "enabled" must be a boolean');
  }
  if (typeof value.issuerAddress !== 'string') {
    throw new Error('deserializeState: "issuerAddress" must be a string');
  }
  if (typeof value.playerAddress !== 'string') {
    throw new Error('deserializeState: "playerAddress" must be a string');
  }
  if (typeof value.merchantAddress !== 'string') {
    throw new Error('deserializeState: "merchantAddress" must be a string');
  }
  if (typeof value.trustLinesReady !== 'boolean') {
    throw new Error('deserializeState: "trustLinesReady" must be a boolean');
  }
  if (!isRecordOfStrings(value.tokenMap)) {
    throw new Error('deserializeState: "tokenMap" must be a Record<string, string>');
  }
  if (!isRecordOfNumbers(value.lastSettled)) {
    throw new Error('deserializeState: "lastSettled" must be a Record<string, number>');
  }
  assertSettlementRecordArray(value.settlements, 'settlements');
  assertSettlementRecordArray(value.pending, 'pending');
  if (typeof value.lastSettleFailed !== 'boolean') {
    throw new Error('deserializeState: "lastSettleFailed" must be a boolean');
  }
  // `nfts` is OPTIONAL (v3.2 back-compat: a fungible-only save has no `nfts`
  // key at all) — deliberately NOT added to REQUIRED_STATE_KEYS above, or an
  // old save would fail to deserialize. Only validate the shape when the key
  // is actually present; `deserializeState` below defaults an absent key to
  // `{}` after this assertion passes.
  if (value.nfts !== undefined) {
    assertNFTokenRefRecord(value.nfts, 'nfts');
  }
}

/** Parse + validate JSON back into `LedgerAdapterState`. Rejects malformed
 *  JSON and any value missing/mistyping a required key with a clear `Error`
 *  (never a silent `undefined`/`NaN` field landing in adapter state).
 *
 *  `nfts` back-compat: a v3.2 (fungible-only) serialized state has no `nfts`
 *  key at all — it is NOT in `REQUIRED_STATE_KEYS` and `assertLedgerAdapterState`
 *  only validates it when present — so such a save deserializes cleanly and
 *  is defaulted to `{}` here (the reload-determinism CRITICAL: an old save
 *  round-trips unchanged, never throws for a key that didn't exist yet). */
export function deserializeState(json: string): LedgerAdapterState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`deserializeState: invalid JSON — ${reason}`);
  }
  assertLedgerAdapterState(parsed);
  if (parsed.nfts === undefined) {
    parsed.nfts = {};
  }
  return parsed;
}

// ── Token-code assignment (deterministic, no Math.random()) ────────────────

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CODE_SPACE = CODE_ALPHABET.length ** 3; // 17,576 three-letter codes

/** Strip a resource key down to the characters a currency code may use. */
function normalizeKey(resourceKey: string): string {
  return resourceKey.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** The "obvious" code for a key: its first 3 normalized characters, padded
 *  with 'X' when the key is shorter than 3 characters. `coin` -> `COI`,
 *  `potion` -> `POT` — matches escape-the-valley's XRPL_TOKEN_MAP convention
 *  of a short human-recognizable prefix, generalized to arbitrary keys. */
function naiveCode(resourceKey: string): string {
  const normalized = normalizeKey(resourceKey);
  const padded = (normalized + 'XXX').slice(0, 3);
  return padded;
}

/** Deterministic 32-bit FNV-1a hash — used only to pick a reproducible
 *  starting point in the collision-probe sequence below. Not a security hash;
 *  just a stable, non-random seed derived from the resource key's bytes. */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function codeFromIndex(index: number): string {
  const a = Math.floor(index / (CODE_ALPHABET.length * CODE_ALPHABET.length)) % CODE_ALPHABET.length;
  const b = Math.floor(index / CODE_ALPHABET.length) % CODE_ALPHABET.length;
  const c = index % CODE_ALPHABET.length;
  return CODE_ALPHABET[a] + CODE_ALPHABET[b] + CODE_ALPHABET[c];
}

/**
 * Assign (or return the existing) 3-char uppercase XRPL currency code for a
 * game resource key, storing it in `state.tokenMap`. Idempotent: calling this
 * again for a key that already has a code returns that same code unchanged.
 *
 * Collision handling is fully deterministic — no `Math.random()` anywhere.
 * The naive first-3-letters code is tried first (readable, matches
 * escape-the-valley's convention); if it's already taken by a DIFFERENT key
 * in this state's `tokenMap`, a hash-seeded linear probe walks the full
 * 26^3 = 17,576-code space (seeded by the key's own FNV-1a hash, so the same
 * key always starts probing from the same slot) until a free code is found.
 * Two different keys can therefore never collide within one state.
 */
export function assignTokenCode(state: LedgerAdapterState, resourceKey: string): string {
  const existing = state.tokenMap[resourceKey];
  if (existing !== undefined) {
    return existing;
  }

  const used = new Set(Object.values(state.tokenMap));
  let code = naiveCode(resourceKey);

  if (used.has(code)) {
    const start = fnv1a(resourceKey) % CODE_SPACE;
    let index = start;
    let attempts = 0;
    do {
      code = codeFromIndex(index);
      index = (index + 1) % CODE_SPACE;
      attempts++;
    } while (used.has(code) && attempts < CODE_SPACE);

    if (used.has(code)) {
      // Only reachable if all 17,576 codes are already assigned.
      throw new Error(`assignTokenCode: exhausted the 3-letter code space for "${resourceKey}"`);
    }
  }

  state.tokenMap[resourceKey] = code;
  return code;
}

/** Look up an already-assigned token code, if any. Does not assign. */
export function getTokenCode(state: LedgerAdapterState, resourceKey: string): string | undefined {
  return state.tokenMap[resourceKey];
}

// ── Delta helpers (the settlement-baseline math) ────────────────────────────

/**
 * Signed delta of the tradeable snapshot (`coin` + every `items` entry, PLUS
 * any resource-key still carried in `state.lastSettled` but no longer present
 * in the snapshot — e.g. a fully-consumed consumable dropped from the tally)
 * against the `state.lastSettled` baseline. Keys whose delta is exactly 0 are
 * omitted, mirroring backpack.py's `if diff != 0: deltas[key] = diff`.
 *
 * Comparing the UNION of current and baseline keys (rather than only the
 * snapshot's own keys) matters for conservation: if trade-core's tally omits
 * zero-count items instead of keeping an explicit 0, a resource that drops to
 * zero must still register a negative delta the checkpoint after it vanishes,
 * or the ledger side would silently over-report a balance the engine no
 * longer holds.
 */
export function computeDeltas(state: LedgerAdapterState, snapshot: TradeableSnapshot): Record<string, number> {
  const current: Record<string, number> = { coin: snapshot.coin, ...snapshot.items };
  const keys = new Set<string>([...Object.keys(current), ...Object.keys(state.lastSettled)]);

  const deltas: Record<string, number> = {};
  for (const key of keys) {
    const curr = current[key] ?? 0;
    const prev = state.lastSettled[key] ?? 0;
    const diff = curr - prev;
    if (diff !== 0) {
      deltas[key] = diff;
    }
  }
  return deltas;
}

/**
 * Fold signed deltas into `state.lastSettled` in place (mutates `state`).
 * Ports backpack.py's retry-fold: `baseline[key] = baseline.get(key, 0) +
 * val` — advancing BY the delta (not resetting TO the current snapshot) so a
 * partially-retried settlement's baseline stays correct even if the caller
 * only advances a subset of a larger delta set.
 */
export function advanceBaseline(state: LedgerAdapterState, deltas: Record<string, number>): void {
  for (const key of Object.keys(deltas)) {
    state.lastSettled[key] = (state.lastSettled[key] ?? 0) + deltas[key];
  }
}
