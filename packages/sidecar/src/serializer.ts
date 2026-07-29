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
import type { StatePatch, WireEvent } from './protocol.js';
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

  // Arrays are replaced wholesale. Element-wise array patching needs stable
  // identity the engine's arrays do not carry (an event log is append-only, a
  // tag list is a set), and a wrong guess about identity is a rendering bug that
  // looks like a sim bug. Wholesale is honest and, for these shapes, cheap.
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
export function snapshotDelta(state: WorldState): StatePatch[] {
  return diffState({}, state);
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
 * DIRECTOR'S RULING (2026-07-29), so the future slice starts from the right shape:
 * the limitation is STRUCTURAL, not cosmetic — every non-JS client inherits it, so
 * the eventual UE5 client hits this same wall, and the item stays on the roadmap
 * rather than being closed. When it is built it lands as a SECOND,
 * capability-negotiated hash — `canonicalStateHash`, sorted keys and normalized
 * numbers, requested at `initialize` by clients that want it — and NEVER as a
 * replacement for this one. That is the additive-evolution path this protocol already
 * lives by (`protocol.ts`: capabilities not version numbers, additive-only events),
 * and it gets its own slice with a same-seed review rather than a ride-along.
 */
export function stateHash(state: WorldState): string {
  return createHash('sha256').update(JSON.stringify(quantize(state))).digest('hex').slice(0, 32);
}

/** A `ResolvedEvent` on the wire: quantized, key-ordered, undefined-free. */
export function toWireEvent(event: ResolvedEvent): WireEvent {
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
  return wire;
}
