// Canonical world-state hash — sorted keys, quantized numbers.
// Additive to the sidecar's legacy JS-insertion-order wire hash (Director
// ruling 2026-07-29): this is the cross-language identity check hosts can
// run without taking a sidecar dependency.

import { createHash } from 'node:crypto';
import type { WorldState } from './types.js';

/** Decimal places kept for non-integers. Matches sidecar WIRE_PRECISION. */
export const STATE_HASH_PRECISION = 6;

/** Quantize + sort keys so the same world hashes the same regardless of insertion order. */
export function canonicalizeForHash(value: unknown): unknown {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    if (Number.isInteger(value)) return value;
    const factor = 10 ** STATE_HASH_PRECISION;
    return Math.round(value * factor) / factor;
  }
  if (Array.isArray(value)) return value.map(canonicalizeForHash);
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) {
      const v = src[k];
      if (v === undefined) continue;
      out[k] = canonicalizeForHash(v);
    }
    return out;
  }
  return value;
}

/**
 * Deterministic identity of a world: sha256 of canonical JSON, truncated to
 * 32 hex chars (same width as the sidecar legacy hash, different contract —
 * sorted keys + quantized numbers).
 */
export function stateHash(world: WorldState): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalizeForHash(world)))
    .digest('hex')
    .slice(0, 32);
}

/** Alias matching the capability-negotiated name from the 2026-07-29 ruling. */
export const canonicalStateHash = stateHash;
