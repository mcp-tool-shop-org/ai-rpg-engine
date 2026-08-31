// serializer.ts — ONE serializer. A snapshot is a delta from empty.
//
// Quake 3's shape (Sanglard, 2012): the full-state message is produced by the
// same code that produces incremental updates, run against an empty baseline.
// One code path means snapshot and stream CANNOT diverge — which is the bug this
// design exists to make impossible, not merely unlikely.
//
// The other half is quantization (charter §3.2, Overwatch): values crossing a
// process boundary are quantized so the boundary itself cannot introduce float
// drift between what the sim computed and what the client renders.

import { createHash } from 'node:crypto';
import type { SnapshotView, StatePatch, WireEvent } from './protocol.js';
import type { ResolvedEvent, WorldState } from '@ai-rpg-engine/core';

/**
 * Decimal places kept for a non-integer crossing the wire.
 *
 * The sim's own arithmetic is untouched — this is the WIRE's precision, and it
 * exists so two clients on different platforms cannot render subtly different
 * numbers from the same tick. Integers (which is nearly everything: this engine's
 * doctrine is small-integer damage) pass through exactly.
 */
export const WIRE_PRECISION = 6;

/** Quantize one value for the wire. Recursive over plain objects and arrays. */
export function quantize(value: unknown): unknown {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null; // NaN/Infinity are not JSON values
    if (Number.isInteger(value)) return value;
    const factor = 10 ** WIRE_PRECISION;
    return Math.round(value * factor) / factor;
  }
  if (Array.isArray(value)) return value.map(quantize);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v === undefined) continue; // matches JSON.stringify, and the hash
      out[k] = quantize(v);
    }
    return out;
  }
  return value;
}

/**
 * Structural diff, producing the patch list that turns `before` into `after`.
 *
 * Recursion is bounded by `maxDepth`: past it, the whole subtree is emitted as
 * one `set`. That is a correctness-preserving fallback (a coarser patch is still
 * a correct patch) and it bounds the work a pathological state could demand.
 */
export function diffState(before: unknown, after: unknown, maxDepth = 12): StatePatch[] {
  const patches: StatePatch[] = [];
  walk(before, after, [], patches, maxDepth);
  return patches;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function walk(
  before: unknown,
  after: unknown,
  path: (string | number)[],
  out: StatePatch[],
  depthLeft: number,
): void {
  if (before === after) return;

  if (after === undefined) {
    out.push({ op: 'remove', path: [...path] });
    return;
  }

  // eventLog is append-only (engine contract). Clients already receive the new
  // events on `sim/tick` and can `replay` a window; a wholesale SET of the log
  // on every tick is O(N) on the wire and will eventually exceed the reader's
  // 16 MiB ceiling. Emit only the new tail so the incremental patch is O(k).
  if (Array.isArray(before) && Array.isArray(after) && path.length === 1 && path[0] === 'eventLog') {
    if (after.length >= before.length) {
      for (let i = before.length; i < after.length; i++) {
        out.push({ op: 'set', path: [...path, i], value: quantize(after[i]) });
      }
      return;
    }
    out.push({ op: 'set', path: [...path], value: quantize(after) });
    return;
  }

  // Other arrays are replaced wholesale. Element-wise array patching needs
  // stable identity the engine's arrays do not carry (a tag list is a set), and
  // a wrong guess about identity is a rendering bug that looks like a sim bug.
  if (depthLeft <= 0 || Array.isArray(before) !== Array.isArray(after) || Array.isArray(after)) {
    if (!deepEqual(before, after)) out.push({ op: 'set', path: [...path], value: quantize(after) });
    return;
  }

  if (!isPlainObject(before) || !isPlainObject(after)) {
    if (!deepEqual(before, after)) out.push({ op: 'set', path: [...path], value: quantize(after) });
    return;
  }

  // Sorted key order so the SAME state change always produces the SAME patch
  // list. Byte-identical replay through the wire depends on it.
  for (const key of Object.keys(before).sort()) {
    if (!(key in after) || after[key] === undefined) {
      out.push({ op: 'remove', path: [...path, key] });
    }
  }
  for (const key of Object.keys(after).sort()) {
    if (after[key] === undefined) continue;
    walk(before[key], after[key], [...path, key], out, depthLeft - 1);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(quantize(a)) === JSON.stringify(quantize(b));
}

/**
 * A full snapshot: the delta from an EMPTY baseline.
 *
 * This is not "like" the incremental path — it IS the incremental path, called
 * with `{}`. There is deliberately no separate snapshot serializer to keep in
 * sync, because keeping two serializers in sync is the failure mode.
 */
export function snapshotDelta(state: WorldState | unknown): StatePatch[] {
  return diffState({}, state);
}

/**
 * Project a world onto a snapshot view. SNAPSHOT and incremental ticks share
 * this so a session that omitted `eventLog` (or scoped `collections`) never
 * has a later tick assume the client holds the omitted keys.
 */
export function projectState(state: unknown, view: SnapshotView = {}): unknown {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) return state;
  const src = state as Record<string, unknown>;
  let out: Record<string, unknown>;
  if (view.collections && view.collections.length > 0) {
    out = {};
    for (const key of view.collections) {
      if (Object.hasOwn(src, key) && src[key] !== undefined) out[key] = src[key];
    }
  } else {
    out = { ...src };
  }
  if (view.omitEventLog) delete out.eventLog;
  return out;
}

/** Apply patches. The client's half — and what the conformance harness uses. */
export function applyPatches(target: unknown, patches: readonly StatePatch[]): unknown {
  let root: unknown = target;
  for (const patch of patches) {
    if (patch.path.length === 0) {
      root = patch.op === 'set' ? patch.value : undefined;
      continue;
    }
    const parent = resolveParent(root, patch.path);
    if (parent === undefined) continue;
    const key = patch.path[patch.path.length - 1];
    if (patch.op === 'remove') {
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete (parent as Record<string, unknown>)[String(key)];
    } else {
      (parent as Record<string | number, unknown>)[key] = patch.value;
    }
  }
  return root;
}

function resolveParent(root: unknown, path: readonly (string | number)[]): unknown {
  let node = root;
  for (let i = 0; i < path.length - 1; i++) {
    if (node === null || typeof node !== 'object') return undefined;
    const key = path[i];
    let next = (node as Record<string | number, unknown>)[key];
    if (next === undefined) {
      // Create the missing container. The NEXT segment's type decides which:
      // a numeric key means an array. Without this, applying a snapshot delta to
      // `{}` would drop every nested path.
      next = typeof path[i + 1] === 'number' ? [] : {};
      (node as Record<string | number, unknown>)[key] = next;
    }
    node = next;
  }
  return node;
}

/**
 * The per-tick state hash clients use to DETECT staleness (charter §3.3).
 *
 * Computed over the quantized state, so the hash is reproducible rather than a
 * function of pre-quantization float noise — a staleness detector that always
 * fires is the same as none.
 *
 * ⚠ REPRODUCIBLE BY A JAVASCRIPT CLIENT, AND ONLY BY ONE. This function's earlier
 * comment said "the hash a client can recompute from what it received matches the
 * hash the server sent", full stop. C4 measured that against a real non-JS client
 * and it is false, for two independent reasons, both in `JSON.stringify`:
 *
 *   1. KEY ORDER is insertion order here. Godot's `JSON.stringify` sorts keys
 *      alphabetically, so the same object serializes to different bytes.
 *   2. NUMBER FORM. Godot's JSON parser produces a float for every number, and
 *      re-serializes `5` as `5.0`.
 *
 * Measured on Godot 4.7.stable: `{"tick":5,...}` round-trips to
 * `{"flag":true,...,"tick":5.0}` — different key order AND a different number
 * literal, hence a different sha256.
 *
 * So a non-JS client cannot verify its own mirror against this value. What it CAN
 * do, and what `ai-rpg-stage` does, is verify its POSITION: request a snapshot and
 * require the server's reported tick and hash to equal the tick and hash the client
 * recorded for where it believes it is. That fires on real client drift — a missed
 * delta leaves the client's tick behind — without needing to reproduce these bytes.
 *
 * A canonical, cross-language hash (sorted keys, normalized number form) would let
 * ANY client verify its mirror directly. It is a determinism-visible addition to a
 * shipped wire and was ANDON'd rather than slipped into C4.
 *
 * DIRECTOR'S RULING (2026-07-29): the JS hash is NEVER replaced. The second,
 * capability-negotiated hash is {@link canonicalStateHash} — sorted keys and
 * normalized numbers, requested at `initialize` as `canonicalHashes`.
 */
export function stateHash(state: WorldState | unknown): string {
  return createHash('sha256').update(JSON.stringify(quantize(state))).digest('hex').slice(0, 32);
}

/**
 * Canonical JSON for a quantized value. Integers stay integers (`5`, never
 * `5.0`); non-integers are `WIRE_PRECISION` with trailing zeros stripped;
 * object keys are sorted. A Godot host implements this encoder rather than
 * `JSON.stringify`, which alphabetizes keys AND emits `5.0`.
 */
export function canonicalJson(value: unknown): string {
  return writeCanonical(quantize(value));
}

function writeCanonical(value: unknown): string {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'null';
    if (Object.is(value, -0)) return '0';
    if (Number.isInteger(value)) return String(value);
    let s = value.toFixed(WIRE_PRECISION);
    s = s.replace(/0+$/, '');
    if (s.endsWith('.')) s += '0';
    return s;
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(writeCanonical).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const v = (value as Record<string, unknown>)[k];
      if (v === undefined) continue;
      parts.push(`${JSON.stringify(k)}:${writeCanonical(v)}`);
    }
    return `{${parts.join(',')}}`;
  }
  return 'null';
}

/**
 * Capability-negotiated cross-language hash. SHA-256 of {@link canonicalJson},
 * hex-truncated to 32 like {@link stateHash}. Requested as
 * `capabilities.canonicalHashes`; never a replacement for `stateHash`.
 */
export function canonicalStateHash(state: WorldState | unknown): string {
  return createHash('sha256').update(canonicalJson(state), 'utf8').digest('hex').slice(0, 32);
}

/** A `ResolvedEvent` on the wire: quantized, key-ordered, undefined-free. */
export function toWireEvent(event: ResolvedEvent & { _channel?: string; _filtered?: boolean }): WireEvent {
  const wire: WireEvent = {
    id: event.id,
    tick: event.tick,
    type: event.type,
    payload: (quantize(event.payload ?? {}) ?? {}) as Record<string, unknown>,
  };
  if (event.actorId !== undefined) wire.actorId = event.actorId;
  if (event.targetIds !== undefined) wire.targetIds = [...event.targetIds];
  if (event.tags !== undefined) wire.tags = [...event.tags];
  if (event.visibility !== undefined) wire.visibility = event.visibility;
  if (event.presentation !== undefined) {
    wire.presentation = quantize(event.presentation) as Record<string, unknown>;
  }
  if (event.causedBy !== undefined) wire.causedBy = event.causedBy;
  if (event._channel !== undefined) wire._channel = event._channel;
  if (event._filtered !== undefined) wire._filtered = event._filtered;
  return wire;
}
