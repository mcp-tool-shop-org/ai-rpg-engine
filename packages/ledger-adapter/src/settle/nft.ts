// settle-impl — settleEquipmentNFTs: the NFT unique-gear settlement path, the
// sibling of adapter.ts's createLedgerAdapter (enable/settle) for the
// fungible layer. Mirrors that module's determinism + idempotency discipline
// exactly, adapted to a 1-of-1 mint/transfer/modify state machine instead of
// a fungible mint/escrow one:
//
//   - Determinism: no Date.now()/Math.random() anywhere in this module. Every
//     observable value (which branch runs, which txids are produced) is a
//     pure function of `state.nfts` + the injected `snapshot`/`deps` — a wave
//     is byte-for-byte replayable (PIN_PER_STEP).
//   - Idempotency (IDEMPOTENCY, the NFT analogue of the fungible
//     conservation-on-retry CRITICAL): the presence of a `NFTokenRef` for a
//     gameItemId is what prevents a double-mint on a fail-then-retry path.
//     The ref is written with `status: 'pending'` BEFORE the transfer is
//     attempted (mint succeeded, transfer not yet confirmed) — a retry that
//     finds a 'pending' ref resumes ONLY the transfer, never re-mints.
//   - Per-item ANDON, not per-batch: unlike adapter.ts's settle() (one
//     escrow-or-payment call per checkpoint, all-or-nothing), this settles a
//     SNAPSHOT of many unique items per call. One item's mint/transfer/modify
//     failure is recorded and the loop continues to the next item — a single
//     bad NFT never blocks the rest of the player's gear from settling.
//
// Secrets: `deps.issuerSeed`/`deps.playerSeed` are passed in per-call by the
// caller (mirrors adapter.ts's DECOMPOSE_BY_SECRETS discipline — this module
// never reads a seed out of `state`, and `state.nfts` never carries one).
//
// Loadout-aware release: after the snapshot loop, refs whose gameItemId is
// absent from the snapshot are transferred back to the issuer and burned
// (pending-safe on releaseOfferIndex). Leftovers are `released` / `pending`,
// never `skipped`. Give (player→counterparty) is a distinct leftover branch:
// those itemIds are directed-transferred, never burned.

import type {
  EquipmentSnapshot,
  LedgerAdapterState,
  NFTInfo,
  NFTMintFlags,
  NFTokenRef,
  NFTTransport,
} from '../contracts.js';
import { buildItemNFTUri, ledgerNetworkLabel, nftExplorerUrl } from '../contracts.js';

/**
 * The NFTokenTaxon (collection id) every unique-gear NFT this package mints
 * is stamped with. A single fixed, documented constant — v1 has no per-game
 * or per-item-type taxon scheme; taxon here just groups "this package's
 * unique gear" as one collection on-ledger. 7777 has no special meaning
 * beyond being a memorable, unambiguous placeholder.
 */
export const ARPG_NFT_TAXON = 7777;

/** Director decision (locked): mint ALL unique gear `transferable: true,
 *  mutable: true` — NOT burnable. `NFTMintFlags` has no `burnable` axis
 *  (contracts.ts), so there is nothing more to set here. */
const MINT_FLAGS: NFTMintFlags = { transferable: true, mutable: true };

/** Per-item settlement row — names + NFTokenID, not just a gameItemId. */
export type NFTItemSettlement = {
  itemId: string;
  name: string;
  nftId: string;
  status: 'minted' | 'pending' | 'modified' | 'skipped' | 'released' | 'transferred';
  explorerUrl?: string;
};

export type NFTSettlementResult = {
  success: boolean;
  message: string;
  /** `transport.networkName` when the transport exposes one ('dry-run' | 'testnet' | 'devnet'). */
  network?: string;
  /** gameItemIds newly minted-and-transferred OR whose pending transfer was
   *  resumed to completion THIS call. */
  minted: string[];
  /** gameItemIds whose on-ledger URI was advanced (relic growth) THIS call. */
  modified: string[];
  /** gameItemIds already minted, unchanged relicVersion — no-op THIS call. */
  skipped: string[];
  /** gameItemIds still transferring (issuer→player, player→issuer release, or player→recipient give). */
  pending: string[];
  /** gameItemIds that left the loadout and were transferred-back/burned THIS call. */
  released: string[];
  /** gameItemIds made over to a counterparty THIS call (give — never burned). */
  transferred: string[];
  /** Per-item rows with name + nftId — the coordinator-printable surface. */
  items: NFTItemSettlement[];
  /** Every tx hash produced by THIS call, across all items, in call order. */
  txids: string[];
};

/** Recipient of a player→counterparty unique-gear transfer (give). */
export type GivenGearRecipient = {
  recipientAddress: string;
  recipientSeed: string;
};

export type SettleEquipmentNftOpts = {
  /** gameItemId → recipient. Those ids transfer instead of releaseOneItem. */
  given?: Record<string, GivenGearRecipient>;
  /** Given ids that must not burn even when the recipient seed is missing. */
  skipRelease?: ReadonlySet<string> | readonly string[];
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function transportNetworkName(transport: NFTTransport): string {
  if (
    transport &&
    typeof transport === 'object' &&
    'networkName' in transport &&
    typeof (transport as { networkName: unknown }).networkName === 'string'
  ) {
    return (transport as { networkName: string }).networkName;
  }
  return 'dry-run';
}

function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function composeNftMessage(opts: {
  success: boolean;
  network: string;
  items: NFTItemSettlement[];
  failures: string[];
}): string {
  const label = ledgerNetworkLabel(opts.network);
  if (!opts.success) {
    return `NFT settlement on ${label} had ${opts.failures.length} failure(s): ${opts.failures.join('; ')}`;
  }
  const minted = opts.items.filter((i) => i.status === 'minted');
  const modified = opts.items.filter((i) => i.status === 'modified');
  const released = opts.items.filter((i) => i.status === 'released');
  const transferred = opts.items.filter((i) => i.status === 'transferred');
  const pending = opts.items.filter((i) => i.status === 'pending');
  const parts: string[] = [];
  const withId = (row: NFTItemSettlement): string =>
    row.nftId ? `${row.name} (${row.nftId})` : row.name;
  if (minted.length === 1) {
    parts.push(`${withId(minted[0])} is now yours on ${label}`);
  } else if (minted.length > 1) {
    parts.push(`${joinNames(minted.map(withId))} are now yours on ${label}`);
  }
  if (modified.length === 1) {
    parts.push(`${withId(modified[0])} grew on ${label}`);
  } else if (modified.length > 1) {
    parts.push(`${joinNames(modified.map(withId))} grew on ${label}`);
  }
  if (transferred.length === 1) {
    parts.push(`${withId(transferred[0])} changed hands on ${label}`);
  } else if (transferred.length > 1) {
    parts.push(`${joinNames(transferred.map(withId))} changed hands on ${label}`);
  }
  if (released.length === 1) {
    parts.push(`${withId(released[0])} left the loadout and was released on ${label}`);
  } else if (released.length > 1) {
    parts.push(`${joinNames(released.map(withId))} left the loadout and were released on ${label}`);
  }
  if (pending.length === 1) {
    parts.push(`${withId(pending[0])} is still transferring on ${label}`);
  } else if (pending.length > 1) {
    parts.push(`${joinNames(pending.map(withId))} are still transferring on ${label}`);
  }
  if (parts.length === 0) {
    return `NFT settlement complete on ${label}: nothing to change.`;
  }
  return parts.join(' ');
}

function itemRow(
  itemId: string,
  name: string,
  nftId: string,
  status: NFTItemSettlement['status'],
  network: string,
): NFTItemSettlement {
  const row: NFTItemSettlement = { itemId, name, nftId, status };
  const url = nftExplorerUrl(network, nftId);
  if (url) row.explorerUrl = url;
  return row;
}

/** Recover an NFTokenID from the issuer's account_nfts by canonical URI.
 *  Used when NFTokenMint tesSUCCESS'd but getNFTokenID could not parse meta,
 *  and on retry of an unindexed pending ref — never mint a second token. */
async function recoverNftId(
  transport: NFTTransport,
  issuerAddress: string,
  uri: string,
): Promise<string | undefined> {
  try {
    const owned = await transport.accountNfts(issuerAddress);
    return owned.find((nft) => nft.uri === uri)?.nftId;
  } catch {
    return undefined;
  }
}

/** Recover a directed issuer→player sell offer from nft_sell_offers.
 *  Prefer Destination=player; never invent a second offer. */
async function recoverOfferIndex(
  transport: NFTTransport,
  nftId: string,
  playerAddress: string,
): Promise<string | undefined> {
  try {
    const offers = await transport.nftSellOffers(nftId);
    const directed = offers.find((o) => o.destination === playerAddress);
    return directed?.offerIndex ?? offers.find((o) => o.destination === undefined)?.offerIndex;
  } catch {
    return undefined;
  }
}

type DirectedOfferField = 'offerIndex' | 'releaseOfferIndex' | 'transferOfferIndex';

/**
 * Directed 0-value CreateOffer/AcceptOffer. Offer-idempotent on `indexField`
 * (including `''` tesSUCCESS-without-index): a retry recovers via
 * nft_sell_offers and NEVER creates a second offer.
 */
async function directedZeroValueTransfer(
  transport: NFTTransport,
  ref: NFTokenRef,
  indexField: DirectedOfferField,
  fromSeed: string,
  toSeed: string,
  toAddress: string,
  gameItemId: string,
  txids: string[],
  failures: string[],
  labels: { create: string; accept: string },
): Promise<boolean> {
  const nftId = ref.nftId;
  const current = ref[indexField];
  const createAlreadyLanded = typeof current === 'string';
  let offerIndex = current && current.length > 0 ? current : undefined;

  if (!offerIndex) {
    const recovered = await recoverOfferIndex(transport, nftId, toAddress);
    if (recovered) {
      offerIndex = recovered;
      ref[indexField] = recovered;
    }
  }

  if (!offerIndex && createAlreadyLanded) {
    failures.push(
      `${labels.create}(${gameItemId}) tesSUCCESS without offerIndex; nft ${nftId} not creating again until nft_sell_offers indexes a directed offer to ${toAddress}`,
    );
    return false;
  }

  if (!offerIndex) {
    const offerRes = await transport.nftCreateSellOffer(fromSeed, nftId, '0', toAddress);
    if (offerRes.hash) txids.push(offerRes.hash);
    if (!offerRes.ok) {
      failures.push(`${labels.create}(${gameItemId}) failed: ${offerRes.error ?? offerRes.code}`);
      return false;
    }
    if (!offerRes.offerIndex) {
      ref[indexField] = '';
      failures.push(
        `${labels.create}(${gameItemId}) tesSUCCESS without offerIndex; nft ${nftId} not creating again until nft_sell_offers indexes a directed offer to ${toAddress}`,
      );
      return false;
    }
    offerIndex = offerRes.offerIndex;
    ref[indexField] = offerIndex;
  }

  const acceptRes = await transport.nftAcceptSellOffer(toSeed, offerIndex);
  if (acceptRes.hash) txids.push(acceptRes.hash);
  if (!acceptRes.ok) {
    failures.push(
      `${labels.accept}(${gameItemId}) failed: ${acceptRes.error ?? acceptRes.code} (offerIndex ${offerIndex})`,
    );
    return false;
  }
  delete ref[indexField];
  return true;
}

/**
 * Directed issuer -> player transfer: NFTokenCreateOffer (a 0-value sell
 * directed at the player) then NFTokenAcceptOffer. Offer-idempotent: a pending
 * ref that already has offerIndex (or tesSUCCESS'd without one — `offerIndex
 * === ''`) resumes ONLY the accept / recover path, never a second create.
 * Returns `true` only if accept succeeds; any txid produced is still recorded.
 */
async function transferToPlayer(
  transport: NFTTransport,
  deps: { issuerSeed: string; playerSeed: string; playerAddress: string },
  ref: NFTokenRef,
  gameItemId: string,
  txids: string[],
  failures: string[],
): Promise<boolean> {
  const ok = await directedZeroValueTransfer(
    transport,
    ref,
    'offerIndex',
    deps.issuerSeed,
    deps.playerSeed,
    deps.playerAddress,
    gameItemId,
    txids,
    failures,
    { create: 'createSellOffer', accept: 'acceptSellOffer' },
  );
  if (ok) ref.ownerAddress = deps.playerAddress;
  return ok;
}

/**
 * Directed player -> issuer transfer (unique gear that left the loadout).
 * Offer-idempotent on `releaseOfferIndex`, same empty-string hatch as
 * {@link transferToPlayer}. Issuer then holds the token so it can burn.
 */
async function transferToIssuer(
  transport: NFTTransport,
  deps: { issuerSeed: string; playerSeed: string; issuerAddress: string },
  ref: NFTokenRef,
  gameItemId: string,
  txids: string[],
  failures: string[],
): Promise<boolean> {
  return directedZeroValueTransfer(
    transport,
    ref,
    'releaseOfferIndex',
    deps.playerSeed,
    deps.issuerSeed,
    deps.issuerAddress,
    gameItemId,
    txids,
    failures,
    { create: 'releaseCreateSellOffer', accept: 'releaseAcceptSellOffer' },
  );
}

/**
 * Directed player -> recipient transfer (give). Offer-idempotent on
 * `transferOfferIndex`. Does not burn.
 */
async function transferToRecipient(
  transport: NFTTransport,
  deps: { playerSeed: string; recipientSeed: string; recipientAddress: string },
  ref: NFTokenRef,
  gameItemId: string,
  txids: string[],
  failures: string[],
): Promise<boolean> {
  const ok = await directedZeroValueTransfer(
    transport,
    ref,
    'transferOfferIndex',
    deps.playerSeed,
    deps.recipientSeed,
    deps.recipientAddress,
    gameItemId,
    txids,
    failures,
    { create: 'transferCreateSellOffer', accept: 'transferAcceptSellOffer' },
  );
  if (ok) ref.ownerAddress = deps.recipientAddress;
  return ok;
}

async function nftHeldBy(
  transport: NFTTransport,
  nftId: string,
  address: string,
): Promise<boolean> {
  try {
    const owned = await transport.accountNfts(address);
    return owned.some((nft) => nft.nftId === nftId);
  } catch {
    return false;
  }
}

function emptyNftResult(
  success: boolean,
  message: string,
  network: string,
  extra: Partial<NFTSettlementResult> = {},
): NFTSettlementResult {
  return {
    success,
    message,
    network,
    minted: [],
    modified: [],
    skipped: [],
    pending: [],
    released: [],
    transferred: [],
    items: [],
    txids: [],
    ...extra,
  };
}

/**
 * Directed player→recipient 0-value CreateOffer/AcceptOffer for unique gear
 * that was given in-world. Pending-safe on `transferOfferIndex` like
 * issuer→player {@link transferToPlayer}. Never burns. No mainnet path.
 */
export async function transferUniqueGear(
  transport: NFTTransport,
  state: LedgerAdapterState,
  gameItemId: string,
  recipientAddress: string,
  seeds: { playerSeed: string; recipientSeed: string },
): Promise<NFTSettlementResult> {
  const network = transportNetworkName(transport);
  if (!recipientAddress) {
    return emptyNftResult(false, `transferUniqueGear(${gameItemId}): missing recipientAddress`, network);
  }
  if (!state.nfts) state.nfts = {};
  const ref = state.nfts[gameItemId];
  if (!ref) {
    return emptyNftResult(false, `transferUniqueGear(${gameItemId}): no NFTokenRef`, network);
  }
  const name = ref.name ?? gameItemId;
  const txids: string[] = [];
  const failures: string[] = [];
  const items: NFTItemSettlement[] = [];

  if (!ref.nftId) {
    const recovered =
      (await recoverNftId(transport, state.playerAddress, ref.uri)) ??
      (await recoverNftId(transport, state.issuerAddress, ref.uri));
    if (!recovered) {
      failures.push(`transfer(${gameItemId}) still unindexed; not reminting`);
      items.push(itemRow(gameItemId, name, '', 'pending', network));
      return emptyNftResult(false, composeNftMessage({ success: false, network, items, failures }), network, {
        pending: [gameItemId],
        items,
        txids,
      });
    }
    ref.nftId = recovered;
  }

  if (await nftHeldBy(transport, ref.nftId, recipientAddress)) {
    const already = ref.ownerAddress === recipientAddress;
    ref.ownerAddress = recipientAddress;
    delete ref.transferOfferIndex;
    if (already) {
      items.push(itemRow(gameItemId, name, ref.nftId, 'skipped', network));
      return emptyNftResult(
        true,
        composeNftMessage({ success: true, network, items, failures: [] }),
        network,
        { skipped: [gameItemId], items, txids },
      );
    }
    items.push(itemRow(gameItemId, name, ref.nftId, 'transferred', network));
    return emptyNftResult(
      true,
      composeNftMessage({ success: true, network, items, failures: [] }),
      network,
      { transferred: [gameItemId], items, txids },
    );
  }

  const playerHolds = await nftHeldBy(transport, ref.nftId, state.playerAddress);
  if (!playerHolds) {
    failures.push(`transfer(${gameItemId}) nft ${ref.nftId} not on player or recipient`);
    items.push(itemRow(gameItemId, name, ref.nftId, 'pending', network));
    return emptyNftResult(false, composeNftMessage({ success: false, network, items, failures }), network, {
      pending: [gameItemId],
      items,
      txids,
    });
  }

  const ok = await transferToRecipient(
    transport,
    { playerSeed: seeds.playerSeed, recipientSeed: seeds.recipientSeed, recipientAddress },
    ref,
    gameItemId,
    txids,
    failures,
  );
  if (!ok) {
    items.push(itemRow(gameItemId, name, ref.nftId, 'pending', network));
    return emptyNftResult(false, composeNftMessage({ success: false, network, items, failures }), network, {
      pending: [gameItemId],
      items,
      txids,
    });
  }

  items.push(itemRow(gameItemId, name, ref.nftId, 'transferred', network));
  return emptyNftResult(
    true,
    composeNftMessage({ success: true, network, items, failures: [] }),
    network,
    { transferred: [gameItemId], items, txids },
  );
}

/**
 * Unique gear whose gameItemId is gone from the snapshot: transfer back to
 * the issuer (if the player still holds it) and burn. Never treated as skipped.
 */
async function releaseOneItem(
  transport: NFTTransport,
  nfts: Record<string, NFTokenRef>,
  gameItemId: string,
  deps: { gameId: string; issuerAddress: string; issuerSeed: string; playerSeed: string; playerAddress: string },
  txids: string[],
  released: string[],
  pending: string[],
  items: NFTItemSettlement[],
  failures: string[],
  network: string,
): Promise<void> {
  const ref = nfts[gameItemId];
  if (!ref) return;
  const name = ref.name ?? gameItemId;

  if (!ref.nftId) {
    const recovered = await recoverNftId(transport, deps.issuerAddress, ref.uri);
    if (!recovered) {
      failures.push(`release(${gameItemId}) still unindexed; not reminting`);
      pending.push(gameItemId);
      items.push(itemRow(gameItemId, name, '', 'pending', network));
      return;
    }
    ref.nftId = recovered;
  }

  const playerHolds = await nftHeldBy(transport, ref.nftId, deps.playerAddress);
  if (playerHolds) {
    const returned = await transferToIssuer(transport, deps, ref, gameItemId, txids, failures);
    if (!returned) {
      pending.push(gameItemId);
      items.push(itemRow(gameItemId, name, ref.nftId, 'pending', network));
      return;
    }
  } else {
    const issuerHolds = await nftHeldBy(transport, ref.nftId, deps.issuerAddress);
    if (!issuerHolds) {
      const recovered = await recoverNftId(transport, deps.issuerAddress, ref.uri);
      if (recovered) ref.nftId = recovered;
      const issuerNow = recovered ? true : await nftHeldBy(transport, ref.nftId, deps.issuerAddress);
      if (!issuerNow) {
        failures.push(`release(${gameItemId}) nft ${ref.nftId} not on player or issuer`);
        pending.push(gameItemId);
        items.push(itemRow(gameItemId, name, ref.nftId, 'pending', network));
        return;
      }
    }
  }

  const burnRes = await transport.nftBurn(deps.issuerSeed, ref.nftId);
  if (burnRes.hash) txids.push(burnRes.hash);
  if (!burnRes.ok) {
    failures.push(`burn(${gameItemId}) failed: ${burnRes.error ?? burnRes.code}`);
    pending.push(gameItemId);
    items.push(itemRow(gameItemId, name, ref.nftId, 'pending', network));
    return;
  }

  const nftId = ref.nftId;
  delete nfts[gameItemId];
  released.push(gameItemId);
  items.push(itemRow(gameItemId, name, nftId, 'released', network));
}

/**
 * Process exactly one snapshot item against `nfts` (mutated in place — the
 * caller's `state.nfts`). Never throws: the caller wraps this in a per-item
 * try/catch so an unexpected transport exception (as opposed to an `ok:
 * false` TxResult) also degrades to a recorded failure rather than aborting
 * the rest of the batch.
 */
async function settleOneItem(
  transport: NFTTransport,
  nfts: Record<string, NFTokenRef>,
  item: EquipmentSnapshot['items'][number],
  deps: { gameId: string; issuerAddress: string; issuerSeed: string; playerSeed: string; playerAddress: string },
  txids: string[],
  minted: string[],
  modified: string[],
  skipped: string[],
  pending: string[],
  items: NFTItemSettlement[],
  failures: string[],
  network: string,
): Promise<void> {
  const gameItemId = item.itemId;
  const displayName = item.name;
  const ref = nfts[gameItemId];
  if (ref && !ref.name) ref.name = displayName;

  // Title already moved off the player (give). Do not mint/modify/resume as
  // if they still hold it — even if a stale snapshot still lists the item.
  if (ref && ref.ownerAddress && ref.ownerAddress !== deps.playerAddress) {
    skipped.push(gameItemId);
    items.push(itemRow(gameItemId, displayName, ref.nftId, 'skipped', network));
    return;
  }

  if (!ref) {
    // MINT: no ref at all — this item has never been settled as an NFT.
    // Before submitting a new mint, recover an already-issued token with this
    // URI from the issuer's account_nfts (tesSUCCESS whose nftId was unparsed).
    const uri = buildItemNFTUri(deps.gameId, gameItemId, item.relicVersion, item.relicTier);
    const preexisting = await recoverNftId(transport, deps.issuerAddress, uri);
    if (preexisting) {
      const recovered: NFTokenRef = {
        gameItemId,
        nftId: preexisting,
        uri,
        relicVersion: item.relicVersion,
        taxon: ARPG_NFT_TAXON,
        mutable: true,
        mintTxid: '',
        status: 'pending',
      };
      recovered.name = displayName;
      nfts[gameItemId] = recovered;
      const transferred = await transferToPlayer(transport, deps, recovered, gameItemId, txids, failures);
      if (transferred) {
        recovered.status = 'minted';
        minted.push(gameItemId);
        items.push(itemRow(gameItemId, displayName, recovered.nftId, 'minted', network));
      } else {
        pending.push(gameItemId);
        items.push(itemRow(gameItemId, displayName, recovered.nftId, 'pending', network));
      }
      return;
    }

    const mintRes = await transport.nftMint(deps.issuerSeed, uri, ARPG_NFT_TAXON, MINT_FLAGS);
    if (mintRes.hash) txids.push(mintRes.hash);
    if (!mintRes.ok) {
      failures.push(`mint(${gameItemId}) failed: ${mintRes.error ?? mintRes.code}`);
      return; // don't throw the whole batch — next item still gets a chance
    }

    const nftId = mintRes.nftId ?? (await recoverNftId(transport, deps.issuerAddress, uri));
    if (!nftId) {
      // tesSUCCESS without a parsed nftId: fail CLOSED. Persist an unindexed
      // pending ref so a later checkpoint recovers via account_nfts and NEVER
      // takes the mint branch again for this item/URI.
      nfts[gameItemId] = {
        gameItemId,
        nftId: '',
        uri,
        relicVersion: item.relicVersion,
        taxon: ARPG_NFT_TAXON,
        mutable: true,
        mintTxid: mintRes.hash,
        status: 'pending',
        name: displayName,
      };
      failures.push(
        `mint(${gameItemId}) tesSUCCESS without nftId; not reminting until account_nfts indexes it`,
      );
      pending.push(gameItemId);
      items.push(itemRow(gameItemId, displayName, '', 'pending', network));
      return;
    }

    // Write the ref BEFORE the transfer — IDEMPOTENCY: this is what prevents
    // a double-mint if the transfer below fails and a later call retries.
    const newRef: NFTokenRef = {
      gameItemId,
      nftId,
      uri,
      relicVersion: item.relicVersion,
      taxon: ARPG_NFT_TAXON,
      mutable: true,
      mintTxid: mintRes.hash,
      status: 'pending',
      name: displayName,
    };
    nfts[gameItemId] = newRef;

    const transferred = await transferToPlayer(transport, deps, newRef, gameItemId, txids, failures);
    if (transferred) {
      newRef.status = 'minted';
      minted.push(gameItemId);
      items.push(itemRow(gameItemId, displayName, newRef.nftId, 'minted', network));
    } else {
      pending.push(gameItemId);
      items.push(itemRow(gameItemId, displayName, newRef.nftId, 'pending', network));
    }
    // else: newRef.status stays 'pending' — resumable on the next call.
    return;
  }

  if (ref.status === 'pending') {
    // RESUME: the mint already happened (never re-mint) — only the transfer
    // needs finishing. An empty nftId is an unindexed tesSUCCESS: recover
    // from account_nfts or fail closed again, never mint a second token.
    if (!ref.nftId) {
      const recovered = await recoverNftId(transport, deps.issuerAddress, ref.uri);
      if (!recovered) {
        failures.push(`mint(${gameItemId}) still unindexed; not reminting`);
        pending.push(gameItemId);
        items.push(itemRow(gameItemId, displayName, '', 'pending', network));
        return;
      }
      ref.nftId = recovered;
    }
    const transferred = await transferToPlayer(transport, deps, ref, gameItemId, txids, failures);
    if (transferred) {
      ref.status = 'minted';
      minted.push(gameItemId);
      items.push(itemRow(gameItemId, displayName, ref.nftId, 'minted', network));
    } else {
      pending.push(gameItemId);
      items.push(itemRow(gameItemId, displayName, ref.nftId, 'pending', network));
    }
    return;
  }

  // ref.status === 'minted' from here on.
  if (ref.relicVersion < item.relicVersion) {
    // MODIFY: relic growth — advance the URI, NFTokenID stays stable.
    const newUri = buildItemNFTUri(deps.gameId, gameItemId, item.relicVersion, item.relicTier);
    const modRes = await transport.nftModify(deps.issuerSeed, ref.nftId, newUri, deps.playerAddress);
    if (modRes.hash) txids.push(modRes.hash);
    if (!modRes.ok) {
      failures.push(`modify(${gameItemId}) failed: ${modRes.error ?? modRes.code}`);
      return;
    }
    ref.relicVersion = item.relicVersion;
    ref.uri = newUri;
    modified.push(gameItemId);
    items.push(itemRow(gameItemId, displayName, ref.nftId, 'modified', network));
    return;
  }

  // Already minted, relicVersion unchanged (or, defensively, not advanced) —
  // no-op.
  skipped.push(gameItemId);
  items.push(itemRow(gameItemId, displayName, ref.nftId, 'skipped', network));
}

/**
 * Settle the unique-gear NFT layer for one `EquipmentSnapshot` at a
 * checkpoint. For each item, mints (new gear), resumes a stalled transfer
 * (a 'pending' ref left by a prior failed settle), advances the on-ledger
 * URI (relic growth), or no-ops (already minted, unchanged) — see this
 * file's header and the per-branch comments in `settleOneItem`.
 *
 * `state.nfts` is read AND written in place (defaulted to `{}` if absent —
 * mirrors `createInitialState`'s default for a pre-P3 state object). Never
 * throws: a transport failure on any one item is recorded in the returned
 * `message`/`success:false` and the loop continues to the next item, so a
 * partial batch still returns whatever DID settle in `minted`/`modified`/
 * `skipped`/`txids`.
 *
 * `deps.issuerAddress` is the account_nfts recovery target when NFTokenMint
 * tesSUCCESS's without a parsed nftId (fail closed, never remint). Mint/modify
 * still sign via `issuerSeed`; transfer calls still need the player's address.
 */
/**
 * Shape `account_nfts` output into the `ledgerNfts` map `reconcile` expects.
 *
 * Closes the fast-follow the v3.3.0 NFT slice left open: the live-replay script
 * and both played-session proofs each hand-rolled this same six-line loop, so a
 * third consumer would have been the third copy. PURE — takes the already-fetched
 * `NFTInfo[]` rather than a transport, so it needs no network and no mocking.
 *
 * Stamping `owner` on every entry is exactly correct rather than an assumption:
 * `account_nfts` is queried PER OWNER, so every token it returns for an address
 * is by construction currently owned by that address.
 */
export function buildLedgerNfts(
  nfts: readonly NFTInfo[],
  owner: string,
): Record<string, { owner: string; uri: string }> {
  const out: Record<string, { owner: string; uri: string }> = {};
  for (const nft of nfts) {
    out[nft.nftId] = { owner, uri: nft.uri };
  }
  return out;
}

export async function settleEquipmentNFTs(
  transport: NFTTransport,
  state: LedgerAdapterState,
  snapshot: EquipmentSnapshot,
  deps: {
    gameId: string;
    issuerAddress: string;
    playerAddress: string;
    issuerSeed: string;
    playerSeed: string;
  },
  opts?: SettleEquipmentNftOpts,
): Promise<NFTSettlementResult> {
  if (!state.nfts) {
    state.nfts = {};
  }
  const nfts = state.nfts;

  const minted: string[] = [];
  const modified: string[] = [];
  const skipped: string[] = [];
  const pending: string[] = [];
  const released: string[] = [];
  const transferred: string[] = [];
  const items: NFTItemSettlement[] = [];
  const txids: string[] = [];
  const failures: string[] = [];
  const network = transportNetworkName(transport);

  const snapshotIds = new Set(snapshot.items.map((item) => item.itemId));
  const given = opts?.given ?? {};
  const skipRelease = new Set<string>([
    ...Object.keys(given),
    ...(opts?.skipRelease ? [...opts.skipRelease] : []),
  ]);

  for (const item of snapshot.items) {
    // Given items with a minted ref are title-moves, not loadout skips.
    // Still mint if this checkpoint is the first time the item is seen.
    if (given[item.itemId] && nfts[item.itemId]?.status === 'minted') {
      continue;
    }
    try {
      await settleOneItem(
        transport,
        nfts,
        item,
        deps,
        txids,
        minted,
        modified,
        skipped,
        pending,
        items,
        failures,
        network,
      );
    } catch (err) {
      failures.push(`${item.itemId}: ${errorMessage(err)}`);
    }
  }

  // Give: directed player→recipient transfer for itemIds named by the
  // coordinator (from recent item.given events). Runs even if a stale
  // snapshot still lists the item — that is not a burn. Never nftBurn.
  for (const gameItemId of Object.keys(given)) {
    const recipient = given[gameItemId];
    const ref = nfts[gameItemId];
    if (!ref || !recipient) continue;
    try {
      const result = await transferUniqueGear(
        transport,
        state,
        gameItemId,
        recipient.recipientAddress,
        { playerSeed: deps.playerSeed, recipientSeed: recipient.recipientSeed },
      );
      txids.push(...result.txids);
      items.push(...result.items);
      transferred.push(...result.transferred);
      pending.push(...result.pending);
      skipped.push(...result.skipped);
      if (!result.success) {
        failures.push(result.message);
      }
    } catch (err) {
      failures.push(`${gameItemId}: ${errorMessage(err)}`);
    }
  }

  for (const gameItemId of skipRelease) {
    if (given[gameItemId]) continue;
    const ref = nfts[gameItemId];
    if (!ref) continue;
    if (ref.ownerAddress && ref.ownerAddress !== deps.playerAddress) continue;
    failures.push(`transfer(${gameItemId}) missing recipient seed — not burning`);
    pending.push(gameItemId);
    items.push(itemRow(gameItemId, ref.name ?? gameItemId, ref.nftId, 'pending', network));
  }

  // Loadout-aware: minted refs whose gameItemId has left the snapshot are
  // transferred back / burned. Never treated as skipped. Given / already-
  // transferred ids are excluded (title moved; burning would destroy it).
  for (const gameItemId of Object.keys(nfts)) {
    if (snapshotIds.has(gameItemId)) continue;
    if (skipRelease.has(gameItemId)) continue;
    const ref = nfts[gameItemId];
    if (ref.ownerAddress && ref.ownerAddress !== deps.playerAddress) continue;
    if (typeof ref.transferOfferIndex === 'string') continue;
    try {
      await releaseOneItem(
        transport,
        nfts,
        gameItemId,
        deps,
        txids,
        released,
        pending,
        items,
        failures,
        network,
      );
    } catch (err) {
      failures.push(`${gameItemId}: ${errorMessage(err)}`);
    }
  }

  const success = failures.length === 0;
  const message = composeNftMessage({ success, network, items, failures });

  return { success, message, network, minted, modified, skipped, pending, released, transferred, items, txids };
}
