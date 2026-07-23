// engine-seam — checkpoint.ts: thin seam wrappers that produce a
// TradeableSnapshot from the LIVE world (via snapshotFromWorld) and drive the
// adapter's enable/settle against it. Neither wrapper ever mutates `world` —
// each only READS it, then hands the resulting plain-data snapshot to the
// adapter, which itself never receives `world` at all (contracts.ts's
// `LedgerAdapter` interface takes a `TradeableSnapshot`, never a
// `WorldState`). This is the other half of the determinism firewall: the
// engine's own tick path never calls into this module — a coordinator (or a
// game's own checkpoint hook) calls these at town/market visits, chapter
// breaks, or save points, entirely outside the deterministic replay loop.
//
// Same type-only `@ai-rpg-engine/core` import as snapshot.ts — see that
// file's header for the firewall rationale.

import type { WorldState } from '@ai-rpg-engine/core';
import type {
  EnableResult,
  LedgerAdapter,
  LedgerAdapterState,
  SettlementResult,
} from '../contracts.js';
import { snapshotFromWorld } from './snapshot.js';

/**
 * Enable the ledger adapter using the CURRENT live snapshot of `playerId`'s
 * tradeable layer as the starting mint (or, on a resume, the idempotent
 * fast-path — see settle-impl's `enable`). Typically called once per run,
 * at (or before) the first checkpoint that wants ledger-backed settlement.
 * Never mutates `world`; only reads it via {@link snapshotFromWorld}.
 */
export function enableFromWorld(
  world: WorldState,
  playerId: string,
  adapter: LedgerAdapter,
  state: LedgerAdapterState,
): Promise<EnableResult> {
  return adapter.enable(state, snapshotFromWorld(world, playerId));
}

/**
 * Settle the net delta since the last checkpoint using the CURRENT live
 * snapshot of `playerId`'s tradeable layer. Call at coordinator-invoked
 * checkpoints (town/market visits, chapter breaks, save) — never inside the
 * engine's own tick path. Never mutates `world`; only reads it via
 * {@link snapshotFromWorld}.
 */
export function settleCheckpoint(
  world: WorldState,
  playerId: string,
  adapter: LedgerAdapter,
  state: LedgerAdapterState,
  checkpoint: number,
  location: string,
): Promise<SettlementResult> {
  return adapter.settle(state, snapshotFromWorld(world, playerId), checkpoint, location);
}
