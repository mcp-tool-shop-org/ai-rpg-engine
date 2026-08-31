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
import type { ItemCatalog, ItemChronicleEntry } from '@ai-rpg-engine/equipment';
import type {
  EnableResult,
  LedgerAdapter,
  LedgerAdapterState,
  NFTTransport,
  SettleOptions,
  SettlementResult,
} from '../contracts.js';
import { snapshotFromWorld } from './snapshot.js';
import { equipmentSnapshotFromWorld } from './equipment-snapshot.js';
import { settleEquipmentNFTs } from '../settle/nft.js';
import type { NFTSettlementResult } from '../settle/nft.js';

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
  options?: SettleOptions,
): Promise<SettlementResult> {
  // `options` MUST be forwarded. P1.5 widened `LedgerAdapter.settle` with the
  // verb + per-settlement primitive but left this wrapper at the old arity, so
  // every caller reaching the adapter through the engine seam — which is the
  // documented way to drive it — silently got `verb: 'settle'` and the
  // construction-time primitive no matter what it asked for. Both new axes were
  // reachable only by bypassing the seam. Caught by the merchant showcase, whose
  // whole point is a `consign` that reads as a consign on-chain.
  return adapter.settle(state, snapshotFromWorld(world, playerId), checkpoint, location, options);
}

/**
 * NFT-side sibling of {@link settleCheckpoint}: snapshot unique gear off the
 * live world and settle it, hydrating issuer/player seeds from the adapter
 * seed cache (`adapter.getSeed`) so the host does not pass faucet seeds per
 * call. Coordinator checkpoint only — never inside the tick.
 */
export async function settleEquipmentFromWorld(
  world: WorldState,
  playerId: string,
  adapter: LedgerAdapter,
  state: LedgerAdapterState,
  transport: NFTTransport,
  catalog: ItemCatalog,
  chronicle?: Record<string, ItemChronicleEntry[]>,
): Promise<NFTSettlementResult> {
  const snapshot = equipmentSnapshotFromWorld(world, playerId, catalog, chronicle);
  const issuerSeed = adapter.getSeed(state.issuerAddress);
  const playerSeed = adapter.getSeed(state.playerAddress);
  if (!issuerSeed || !playerSeed) {
    const missing = [
      !issuerSeed ? state.issuerAddress || 'issuer' : '',
      !playerSeed ? state.playerAddress || 'player' : '',
    ].filter(Boolean);
    const network =
      'networkName' in transport && typeof (transport as { networkName?: unknown }).networkName === 'string'
        ? (transport as { networkName: string }).networkName
        : undefined;
    return {
      success: false,
      network,
      message:
        `Could not settle unique gear: missing seed(s) for ${missing.join(', ')} — ` +
        `re-authenticate via the secrets sidecar.`,
      minted: [],
      modified: [],
      skipped: [],
      pending: [],
      released: [],
      items: [],
      txids: [],
    };
  }
  return settleEquipmentNFTs(transport, state, snapshot, {
    gameId: adapter.gameId,
    issuerAddress: state.issuerAddress,
    playerAddress: state.playerAddress,
    issuerSeed,
    playerSeed,
  });
}

/** Catalog + transport the unique-gear half of {@link settleAllFromWorld} needs. */
export type CheckpointNftOpts = {
  transport: NFTTransport;
  catalog: ItemCatalog;
  chronicle?: Record<string, ItemChronicleEntry[]>;
};

/**
 * Fungible checkpoint + unique-gear NFT settlement in one coordinator call.
 * The documented seam: a game that calls this at town/save mints, resumes
 * pending transfers, and grows relics without a second seed-injecting call.
 */
export async function settleAllFromWorld(
  world: WorldState,
  playerId: string,
  adapter: LedgerAdapter,
  state: LedgerAdapterState,
  checkpoint: number,
  location: string,
  nft: CheckpointNftOpts,
  options?: SettleOptions,
): Promise<{ settlement: SettlementResult; nft: NFTSettlementResult }> {
  const settlement = await settleCheckpoint(world, playerId, adapter, state, checkpoint, location, options);
  const nftResult = await settleEquipmentFromWorld(
    world,
    playerId,
    adapter,
    state,
    nft.transport,
    nft.catalog,
    nft.chronicle,
  );
  return { settlement, nft: nftResult };
}
