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

import type {
  EquipmentSnapshot,
  LedgerAdapterState,
  NFTMintFlags,
  NFTokenRef,
  NFTTransport,
} from '../contracts.js';
import { buildItemNFTUri } from '../contracts.js';

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

export type NFTSettlementResult = {
  success: boolean;
  message: string;
  /** gameItemIds newly minted-and-transferred OR whose pending transfer was
   *  resumed to completion THIS call. */
  minted: string[];
  /** gameItemIds whose on-ledger URI was advanced (relic growth) THIS call. */
  modified: string[];
  /** gameItemIds already minted, unchanged relicVersion — no-op THIS call. */
  skipped: string[];
  /** Every tx hash produced by THIS call, across all items, in call order. */
  txids: string[];
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Directed issuer -> player transfer: NFTokenCreateOffer (a 0-value sell
 * directed at the player) then NFTokenAcceptOffer. Used both right after a
 * fresh mint and to RESUME a 'pending' ref's stalled transfer — the same
 * two calls either way, since a pending ref means "minted, not yet
 * transferred" regardless of how it got there. Returns `true` only if both
 * calls succeed; any txid produced (even on a path that partially fails) is
 * still recorded in `txids`.
 */
async function transferToPlayer(
  transport: NFTTransport,
  deps: { issuerSeed: string; playerSeed: string; playerAddress: string },
  nftId: string,
  gameItemId: string,
  txids: string[],
  failures: string[],
): Promise<boolean> {
  const offerRes = await transport.nftCreateSellOffer(deps.issuerSeed, nftId, '0', deps.playerAddress);
  if (offerRes.hash) txids.push(offerRes.hash);
  if (!offerRes.ok || !offerRes.offerIndex) {
    failures.push(`createSellOffer(${gameItemId}) failed: ${offerRes.error ?? offerRes.code}`);
    return false;
  }

  const acceptRes = await transport.nftAcceptSellOffer(deps.playerSeed, offerRes.offerIndex);
  if (acceptRes.hash) txids.push(acceptRes.hash);
  if (!acceptRes.ok) {
    failures.push(`acceptSellOffer(${gameItemId}) failed: ${acceptRes.error ?? acceptRes.code}`);
    return false;
  }

  return true;
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
  deps: { gameId: string; issuerSeed: string; playerSeed: string; playerAddress: string },
  txids: string[],
  minted: string[],
  modified: string[],
  skipped: string[],
  failures: string[],
): Promise<void> {
  const gameItemId = item.itemId;
  const ref = nfts[gameItemId];

  if (!ref) {
    // MINT: no ref at all — this item has never been settled as an NFT.
    const uri = buildItemNFTUri(deps.gameId, gameItemId, item.relicVersion, item.relicTier);
    const mintRes = await transport.nftMint(deps.issuerSeed, uri, ARPG_NFT_TAXON, MINT_FLAGS);
    if (mintRes.hash) txids.push(mintRes.hash);
    if (!mintRes.ok || !mintRes.nftId) {
      failures.push(`mint(${gameItemId}) failed: ${mintRes.error ?? mintRes.code}`);
      return; // don't throw the whole batch — next item still gets a chance
    }

    // Write the ref BEFORE the transfer — IDEMPOTENCY: this is what prevents
    // a double-mint if the transfer below fails and a later call retries.
    const newRef: NFTokenRef = {
      gameItemId,
      nftId: mintRes.nftId,
      uri,
      relicVersion: item.relicVersion,
      taxon: ARPG_NFT_TAXON,
      mutable: true,
      mintTxid: mintRes.hash,
      status: 'pending',
    };
    nfts[gameItemId] = newRef;

    const transferred = await transferToPlayer(transport, deps, newRef.nftId, gameItemId, txids, failures);
    if (transferred) {
      newRef.status = 'minted';
      minted.push(gameItemId);
    }
    // else: newRef.status stays 'pending' — resumable on the next call.
    return;
  }

  if (ref.status === 'pending') {
    // RESUME: the mint already happened (never re-mint) — only the transfer
    // needs finishing.
    const transferred = await transferToPlayer(transport, deps, ref.nftId, gameItemId, txids, failures);
    if (transferred) {
      ref.status = 'minted';
      minted.push(gameItemId);
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
    return;
  }

  // Already minted, relicVersion unchanged (or, defensively, not advanced) —
  // no-op.
  skipped.push(gameItemId);
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
 * `deps.issuerAddress` is accepted for parity with `LedgerAdapterState`'s own
 * issuerAddress/playerAddress pair (and for a future caller that wants to
 * assert it against `state.issuerAddress`) but is not read by any NFTTransport
 * call this slice makes: `nftMint`/`nftModify` sign as the issuer via
 * `issuerSeed` alone (the seed IS the identity on every method in this
 * interface), and the only address either transfer call needs is the
 * player's (`nftCreateSellOffer`'s destination, `nftModify`'s owner param).
 */
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
): Promise<NFTSettlementResult> {
  if (!state.nfts) {
    state.nfts = {};
  }
  const nfts = state.nfts;

  const minted: string[] = [];
  const modified: string[] = [];
  const skipped: string[] = [];
  const txids: string[] = [];
  const failures: string[] = [];

  for (const item of snapshot.items) {
    try {
      await settleOneItem(transport, nfts, item, deps, txids, minted, modified, skipped, failures);
    } catch (err) {
      failures.push(`${item.itemId}: ${errorMessage(err)}`);
    }
  }

  const success = failures.length === 0;
  const message = success
    ? `NFT settlement complete: ${minted.length} minted, ${modified.length} modified, ${skipped.length} unchanged.`
    : `NFT settlement had ${failures.length} failure(s): ${failures.join('; ')}`;

  return { success, message, minted, modified, skipped, txids };
}
