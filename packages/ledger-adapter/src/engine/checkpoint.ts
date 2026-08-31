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

import { createHash } from 'node:crypto';
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
  TradeableSnapshot,
} from '../contracts.js';
import { snapshotFromWorld } from './snapshot.js';
import { equipmentSnapshotFromWorld } from './equipment-snapshot.js';
import { settleEquipmentNFTs } from '../settle/nft.js';
import type { GivenGearRecipient, NFTSettlementResult } from '../settle/nft.js';
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
  const snapshot = snapshotFromWorld(world, playerId);
  const resolved = mergeSettleOptions(inferSettleOptionsFromWorld(world, playerId), options);
  // Diary writes a firewall-pure witness hash of { seed, tick, snapshot }.
  // Ledger may omit — only attach a default when the host did not pass one
  // and this run is witnessed-not-custodied.
  if (!resolved.stateHash && state.mode === 'diary') {
    resolved.stateHash = witnessStateHash(world, snapshot);
  }
  return adapter.settle(state, snapshot, checkpoint, location, resolved);
}

const DIARY_NFT_MESSAGE = 'Diary mode — unique gear is witnessed, not minted';

function transportNetworkName(transport: NFTTransport): string | undefined {
  if (
    transport &&
    typeof transport === 'object' &&
    'networkName' in transport &&
    typeof (transport as { networkName?: unknown }).networkName === 'string'
  ) {
    return (transport as { networkName: string }).networkName;
  }
  return undefined;
}

function diaryNftNoOp(transport: NFTTransport): NFTSettlementResult {
  return {
    success: true,
    network: transportNetworkName(transport),
    message: DIARY_NFT_MESSAGE,
    minted: [],
    modified: [],
    skipped: [],
    pending: [],
    released: [],
    transferred: [],
    items: [],
    txids: [],
  };
}

/**
 * Firewall-pure hex digest of `{ seed: world.meta.seed, tick: world.meta.tick, snapshot }`.
 * Type-only `WorldState` — never `Engine.serialize` / runtime core.
 */
export function witnessStateHash(world: Pick<WorldState, 'meta'>, snapshot: TradeableSnapshot): string {
  const items: Record<string, number> = {};
  for (const key of Object.keys(snapshot.items).sort()) items[key] = snapshot.items[key];
  const body = JSON.stringify({ seed: world.meta.seed, tick: world.meta.tick, snapshot: { coin: snapshot.coin, items } });
  return createHash('sha256').update(body).digest('hex');
}

/**
 * NFT-side sibling of {@link settleCheckpoint}: snapshot unique gear off the
 * live world and settle it, hydrating issuer/player seeds from the adapter
 * seed cache (`adapter.getSeed`) so the host does not pass faucet seeds per
 * call. Coordinator checkpoint only — never inside the tick.
 *
 * Diary (and any run with no issuer) returns a successful NFT no-op — unique
 * gear is witnessed, not minted. Ledger-mode missing-seed stays a sidecar failure.
 */
export async function settleEquipmentFromWorld(
  world: WorldState,
  playerId: string,
  adapter: LedgerAdapter,
  state: LedgerAdapterState,
  transport: NFTTransport,
  catalog: ItemCatalog,
  chronicle?: Record<string, ItemChronicleEntry[]>,
  recipientAddresses?: Record<string, string>,
): Promise<NFTSettlementResult> {
  // Diary (and any run with no issuer) witnesses unique gear; it does not mint.
  // Ledger-mode missing-seed below stays a real sidecar failure.
  if (state.mode === 'diary' || !state.issuerAddress) {
    return diaryNftNoOp(transport);
  }
  const snapshot = equipmentSnapshotFromWorld(world, playerId, catalog, chronicle);
  const issuerSeed = adapter.getSeed(state.issuerAddress);
  const playerSeed = adapter.getSeed(state.playerAddress);
  if (!issuerSeed || !playerSeed) {
    const missing = [
      !issuerSeed ? state.issuerAddress || 'issuer' : '',
      !playerSeed ? state.playerAddress || 'player' : '',
    ].filter(Boolean);
    return {
      success: false,
      network: transportNetworkName(transport),
      message:
        `Could not settle unique gear: missing seed(s) for ${missing.join(', ')} — ` +
        `re-authenticate via the secrets sidecar.`,
      minted: [],
      modified: [],
      skipped: [],
      pending: [],
      released: [],
      transferred: [],
      items: [],
      txids: [],
    };
  }
  const givenByEntity = giveRecipientsFromWorld(world, playerId);
  const given: Record<string, GivenGearRecipient> = {};
  const skipRelease: string[] = [];
  for (const [itemId, entityId] of Object.entries(givenByEntity)) {
    skipRelease.push(itemId);
    const recipientAddress = recipientAddresses?.[entityId] ?? state.merchantAddress;
    if (!recipientAddress) continue;
    const recipientSeed = adapter.getSeed(recipientAddress);
    if (!recipientSeed) continue;
    given[itemId] = { recipientAddress, recipientSeed };
  }
  return settleEquipmentNFTs(
    transport,
    state,
    snapshot,
    {
      gameId: adapter.gameId,
      issuerAddress: state.issuerAddress,
      playerAddress: state.playerAddress,
      issuerSeed,
      playerSeed,
    },
    { given, skipRelease },
  );
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

function stringPayload(event: ResolvedEvent, key: string): string | undefined {
  const value = event.payload?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function eventTargetId(event: ResolvedEvent): string | undefined {
  if (Array.isArray(event.targetIds) && typeof event.targetIds[0] === 'string' && event.targetIds[0]) {
    return event.targetIds[0];
  }
  const payloadTargets = event.payload?.targetIds;
  if (Array.isArray(payloadTargets) && typeof payloadTargets[0] === 'string' && payloadTargets[0]) {
    return payloadTargets[0];
  }
  return stringPayload(event, 'toEntityId');
}

/**
 * Recent successful give records: gameItemId (toolId / itemId) → recipient
 * entity id (targetIds[0] / toEntityId). Later events overwrite earlier ones
 * for the same item. `item.given` is the successful-transfer record;
 * action.declared is ignored (a later reject must not look like a give).
 */
export function giveRecipientsFromWorld(world: WorldState, playerId: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const event of world.eventLog ?? []) {
    const isGiven =
      event.type === 'item.given' ||
      (event.type === 'item.lost' && event.payload?.reason === 'given');
    if (!isGiven) continue;
    const fromId = stringPayload(event, 'fromEntityId') ?? eventActorId(event);
    if (fromId && fromId !== playerId) continue;
    if (event.type === 'item.lost') {
      const entityId = stringPayload(event, 'entityId');
      if (entityId && entityId !== playerId) continue;
    }
    const toolId = stringPayload(event, 'toolId') ?? stringPayload(event, 'itemId');
    const targetId = eventTargetId(event);
    if (!toolId || !targetId) continue;
    out[toolId] = targetId;
  }
  return out;
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
    stateHash: explicit?.stateHash ?? inferred.stateHash,
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
  /** Optional entityId → XRPL address map for L2 give recipients. Default is `state.merchantAddress`. */
  recipientAddresses?: Record<string, string>;
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
    nft.recipientAddresses,
  );
  return { settlement, nft: nftResult };
}
