// secrets.ts — the secrets sidecar (security-impl domain).
//
// Ports the "seeds out of run.json" lesson from escape-the-valley: seeds
// started out embedded in `RunState`/`run.json` and were moved to a dedicated,
// gitignored sidecar after a CRITICAL finding on that exposure. This module
// is the DECOMPOSE_BY_SECRETS boundary for ledger-adapter — `LedgerAdapterState`
// (contracts.ts) holds addresses + settlement bookkeeping and is expected to
// live in the save/run file; `SecretsSidecar` holds `address -> seed` and is
// expected to live ONLY at `sidecarPath()`, which is a gitignored convention
// path, never the save file.
//
// `assertNoSeedsInState` is the runtime gate that PROVES the boundary holds:
// it serializes a `LedgerAdapterState` and throws if anything shaped like an
// XRPL seed shows up anywhere in it, however deeply nested.

import { dirname, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { LedgerAdapterState, SecretsSidecar } from '../contracts.js';

// ── Sidecar CRUD (pure — no file IO) ────────────────────────────────────────

/** A fresh, empty secrets sidecar. */
export function createSidecar(): SecretsSidecar {
  return { seeds: {} };
}

/** Store (or overwrite) the seed for `address`. */
export function putSeed(sidecar: SecretsSidecar, address: string, seed: string): void {
  sidecar.seeds[address] = seed;
}

/** Look up the seed for `address`; `undefined` if the sidecar has none. */
export function getSeed(sidecar: SecretsSidecar, address: string): string | undefined {
  return sidecar.seeds[address];
}

// ── Serialization (pure) ─────────────────────────────────────────────────────

/** Serialize a sidecar to pretty-printed JSON (the on-disk format). */
export function serializeSidecar(sidecar: SecretsSidecar): string {
  return JSON.stringify(sidecar, null, 2);
}

/** Parse a sidecar from JSON text. Throws on malformed shape. */
export function deserializeSidecar(json: string): SecretsSidecar {
  const parsed: unknown = JSON.parse(json);
  if (!isSecretsSidecarShape(parsed)) {
    throw new Error(
      `invalid secrets sidecar JSON: expected { seeds: Record<string, string> }, got: ${json.slice(0, 120)}`,
    );
  }
  return parsed;
}

function isSecretsSidecarShape(value: unknown): value is SecretsSidecar {
  if (typeof value !== 'object' || value === null || !('seeds' in value)) {
    return false;
  }
  const seeds = (value as { seeds: unknown }).seeds;
  if (typeof seeds !== 'object' || seeds === null || Array.isArray(seeds)) {
    return false;
  }
  return Object.values(seeds).every((v) => typeof v === 'string');
}

// ── Path convention (pure — returns a string, does not touch disk) ──────────

/**
 * The gitignored sidecar path convention: `<gameDir>/.secrets/ledger-secrets.json`.
 * Callers are responsible for gitignoring `.secrets/` in the consuming game
 * project (mirrors escape-the-valley's gitignored secrets file).
 */
export function sidecarPath(gameDir: string): string {
  return join(gameDir, '.secrets', 'ledger-secrets.json');
}

// ── The DECOMPOSE_BY_SECRETS runtime gate ────────────────────────────────────

/**
 * Matches an XRPL "family seed" (classic, base58, `s` + ~28 more chars) or an
 * Ed25519 seed (`sEd` + ~20 more chars). Both alphabets are the same base58
 * charset (`1-9A-HJ-NP-Za-km-z` — no `0`, `O`, `I`, `l`), so the `sEd...`
 * alternative is listed explicitly (per spec) even though the generic family
 * seed branch alone would also catch most real Ed25519 seeds; keeping both
 * makes the intent self-documenting and adds a safety net against a shorter
 * seed encoding. `\b`...`\b` anchors so the match can't start or end mid-word
 * (e.g. inside "issuerAddress"), which keeps ordinary addresses/JSON keys from
 * producing false positives.
 */
const XRPL_SEED_RE = /\bs(?:Ed[1-9A-HJ-NP-Za-km-z]{20,}|[1-9A-HJ-NP-Za-km-z]{25,})\b/;

/** Show only the edges of a matched secret in error output — never echo it whole. */
function redact(secret: string): string {
  if (secret.length <= 8) return '*'.repeat(secret.length);
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

/**
 * Throws if `state` contains anything shaped like an XRPL seed, anywhere in
 * its (deeply nested) structure. This is the runtime proof that the
 * DECOMPOSE_BY_SECRETS boundary holds: `LedgerAdapterState` is the
 * serializable, save-file-bound shape (contracts.ts says so in a comment);
 * this function makes that a checked invariant instead of just a comment.
 *
 * Implementation: serialize to JSON and scan the whole text. A field-by-field
 * walk would need to special-case every current (and future) string field;
 * scanning the serialized form catches a seed smuggled into ANY field —
 * including ones added later — for free.
 */
export function assertNoSeedsInState(state: LedgerAdapterState): void {
  const json = JSON.stringify(state);
  const match = XRPL_SEED_RE.exec(json);
  if (match) {
    throw new Error(
      `DECOMPOSE_BY_SECRETS violation: LedgerAdapterState contains what looks like an XRPL seed ` +
        `(${redact(match[0])}). Seeds must live ONLY in the secrets sidecar (see sidecarPath()) — ` +
        `never in LedgerAdapterState, which is serialized to the save/run file.`,
    );
  }
}

// ── Optional file IO (thin wrappers over the pure functions above) ──────────

/** Read + parse a sidecar from `path`. Throws if missing or malformed. */
export function loadSidecar(path: string): SecretsSidecar {
  return deserializeSidecar(readFileSync(path, 'utf-8'));
}

/** Serialize + write a sidecar to `path`, creating parent directories. */
export function saveSidecar(path: string, sidecar: SecretsSidecar): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeSidecar(sidecar), 'utf-8');
}
