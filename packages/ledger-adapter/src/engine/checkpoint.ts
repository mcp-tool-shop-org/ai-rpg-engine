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

import type { ResolvedEvent, WorldState } from '@ai-rpg-engine/core';
import type { ItemCatalog, ItemChronicleEntry } from '@ai-rpg-engine/equipment';
import type {
  EnableResult,
  LedgerAdapter,
  LedgerAdapterState,
  LedgerTransport,
  NFTTransport,
  ReconcileReport,
  SettlementPrimitive,
  SettlementResult,
  SettlementVerb,
  SettleOptions,
} from '../contracts.js';
import { snapshotFromWorld } from './snapshot.js';
import { equipmentSnapshotFromWorld } from './equipment-snapshot.js';
import { settleEquipmentNFTs } from '../settle/nft.js';
import type { NFTSettlementResult } from '../settle/nft.js';
import {
  reconcileAgainstLedger,
  type ReconcileAgainstLedgerOpts,
} from '../settle/reconcile-ledger.js';

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
  // When the host omits SettleOptions, infer verb + primitive from the live
  // world's recent eventLog / district tags so buy/sell/consign/default are
  // reachable on the documented seam. Explicit fields still win.
  const resolved = mergeSettleOptions(inferSettleOptionsFromWorld(world, playerId), options);
  return adapter.settle(state, snapshotFromWorld(world, playerId), checkpoint, location, resolved);
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

const SETTLEMENT_VERBS: readonly SettlementVerb[] = ['buy', 'sell', 'settle', 'consign', 'default'];
const PAYMENT_TAGS = new Set(['unbonded', 'contested', 'black-market', 'unlawful']);
const ESCROW_TAGS = new Set(['lawful', 'bonded']);

function isSettlementVerb(value: unknown): value is SettlementVerb {
  return typeof value === 'string' && (SETTLEMENT_VERBS as readonly string[]).includes(value);
}

function eventActorId(event: ResolvedEvent): string | undefined {
  if (typeof event.actorId === 'string' && event.actorId) return event.actorId;
  const payloadActor = event.payload?.actorId;
  return typeof payloadActor === 'string' ? payloadActor : undefined;
}

function verbFromEvent(event: ResolvedEvent): SettlementVerb | undefined {
  if (event.type === 'action.rejected') return undefined;
  if (event.type === 'action.declared' || event.type === 'action.resolved') {
    const verb = event.payload?.verb;
    return isSettlementVerb(verb) ? verb : undefined;
  }
  if (event.type === 'merchant.contract.consigned' || event.type.endsWith('.consigned')) return 'consign';
  if (event.type === 'merchant.contract.defaulted' || event.type.endsWith('.defaulted')) return 'default';
  if (event.type === 'merchant.contract.honoured' || event.type.endsWith('.honoured')) return 'settle';
  return isSettlementVerb(event.type) ? event.type : undefined;
}

function districtTagsForZone(world: WorldState, zoneId: string): string[] {
  const core = world.modules['district-core'];
  if (!core || typeof core !== 'object') return [];
  const rec = core as {
    zoneToDistrict?: Record<string, string>;
    definitions?: Record<string, { tags?: string[] }>;
  };
  const districtId = rec.zoneToDistrict?.[zoneId];
  const tags = districtId ? rec.definitions?.[districtId]?.tags : undefined;
  return Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [];
}

function primitiveFromLocation(world: WorldState, playerId: string): SettlementPrimitive | undefined {
  const entity = world.entities[playerId];
  if (!entity?.zoneId) return undefined;
  const zone = world.zones[entity.zoneId];
  const tags = [...(zone?.tags ?? []), ...districtTagsForZone(world, entity.zoneId)];
  if (tags.some((t) => PAYMENT_TAGS.has(t))) return 'payment';
  if (tags.some((t) => ESCROW_TAGS.has(t))) return 'token-escrow';
  return undefined;
}

/**
 * Read recent `eventLog` entries (buy/sell/consign/default, plus honour → settle)
 * and the player's current district/zone tags (unbonded/contested → payment,
 * lawful/bonded → token-escrow). Coordinator-only — never inside the tick.
 */
export function inferSettleOptionsFromWorld(world: WorldState, playerId: string): SettleOptions {
  const inferred: SettleOptions = {};
  const log = world.eventLog ?? [];
  for (let i = log.length - 1; i >= 0; i--) {
    const event = log[i];
    const actor = eventActorId(event);
    if (actor && actor !== playerId) continue;
    const verb = verbFromEvent(event);
    if (verb) {
      inferred.verb = verb;
      break;
    }
  }
  const primitive = primitiveFromLocation(world, playerId);
  if (primitive) inferred.primitive = primitive;
  return inferred;
}

function mergeSettleOptions(inferred: SettleOptions, explicit?: SettleOptions): SettleOptions {
  return {
    verb: explicit?.verb ?? inferred.verb,
    primitive: explicit?.primitive ?? inferred.primitive,
  };
}

/**
 * World-seam wrapper around {@link reconcileAgainstLedger}. Reads `world` only
 * for default seed/gameId; never mutates it. Coordinator checkpoint — never
 * inside the tick.
 */
export function reconcileFromWorld(
  world: WorldState,
  playerId: string,
  transport: LedgerTransport,
  state: LedgerAdapterState,
  opts: ReconcileAgainstLedgerOpts,
): Promise<ReconcileReport> {
  void playerId;
  return reconcileAgainstLedger(transport, state, {
    ...opts,
    seed: opts.seed ?? world.meta.seed,
    gameId: opts.gameId ?? world.meta.gameId,
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
