// Process-global ID generation — RETAINED FOR BACK-COMPAT ONLY.
//
// IMPORTANT: the engine runtime NO LONGER uses these. Event/action/world/pending
// ids are now minted from a per-WorldStore counter (`WorldStore.genId`) that
// lives in serialized state, which is what makes "same seed + same actions =>
// byte-identical ids" hold across instances and across save/load. A
// process-global counter is shared between engines (two engines, same seed =>
// different ids) and is never serialized (a reloaded game restarts at 0 and
// collides with ids already in the eventLog) — exactly the determinism bug this
// module used to cause.
//
// `nextId`/`resetIdCounter` remain exported only because external content packs,
// modules, and test fixtures still import them. Prefer `WorldStore.genId` /
// `genId(state, prefix)` / `Engine` id minting for anything new. Do not
// reintroduce the global counter into core.

import type { WorldState } from './types.js';

/**
 * Deterministic, per-world id generation for code that has a `WorldState` (e.g.
 * module verb handlers, which receive `world: WorldState` but not the WorldStore).
 * Draws from the same serialized `state.meta.idCounter` as `WorldStore.genId`, so
 * ids minted by core, modules, and content all share one per-instance counter and
 * stay byte-identical across same-seed runs and across save/load. Use this instead
 * of the deprecated global `nextId` for any id that ends up in emitted/serialized
 * output (events, statuses, memories, rumors, traces, pending effects).
 */
export function genId(state: WorldState, prefix = 'sf'): string {
  return `${prefix}_${(++state.meta.idCounter).toString(36)}`;
}

let counter = 0;

/** @deprecated Engine no longer uses the global counter. Back-compat only. */
export function resetIdCounter(value = 0): void {
  counter = value;
}

/** @deprecated Prefer `WorldStore.genId`. Back-compat only — not used by the engine runtime. */
export function nextId(prefix = 'sf'): string {
  return `${prefix}_${(++counter).toString(36)}`;
}
