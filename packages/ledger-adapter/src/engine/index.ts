// engine-seam barrel — the adapter's ONLY read of the engine's world
// (snapshotFromWorld) plus the thin checkpoint-driver wrappers built on it
// (enableFromWorld, settleCheckpoint, settleEquipmentFromWorld,
// settleAllFromWorld, inferSettleOptionsFromWorld, reconcileFromWorld,
// witnessStateHash).
// See snapshot.ts and checkpoint.ts for
// the determinism-firewall contract every export here upholds: type-only
// `@ai-rpg-engine/core` import, zero runtime engine dependency, never a
// mutation of `world`. firewall.test.ts is the load-bearing proof.
//
// equipmentSnapshotFromWorld (P3) is the NFT-side sibling read: same
// firewall discipline, type-only `@ai-rpg-engine/core` +
// `@ai-rpg-engine/equipment` imports, zero runtime coupling to either.

export { snapshotFromWorld } from './snapshot.js';
export {
  enableFromWorld,
  settleCheckpoint,
  settleEquipmentFromWorld,
  settleAllFromWorld,
  inferSettleOptionsFromWorld,
  reconcileFromWorld,
  witnessStateHash,
} from './checkpoint.js';
export type { CheckpointNftOpts } from './checkpoint.js';
export { equipmentSnapshotFromWorld } from './equipment-snapshot.js';
