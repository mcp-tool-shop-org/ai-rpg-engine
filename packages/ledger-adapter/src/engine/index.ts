// engine-seam barrel — the adapter's ONLY read of the engine's world
// (snapshotFromWorld) plus the thin checkpoint-driver wrappers built on it
// (enableFromWorld, settleCheckpoint). See snapshot.ts and checkpoint.ts for
// the determinism-firewall contract every export here upholds: type-only
// `@ai-rpg-engine/core` import, zero runtime engine dependency, never a
// mutation of `world`. firewall.test.ts is the load-bearing proof.

export { snapshotFromWorld } from './snapshot.js';
export { enableFromWorld, settleCheckpoint } from './checkpoint.js';
