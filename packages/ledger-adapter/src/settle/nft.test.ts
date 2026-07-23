// settleEquipmentNFTs — the NFT unique-gear settlement path tests (P3).
// Exercises the real DryRunTransport (not a hand-rolled fake) for the happy
// paths, since NFTTransport is already fully implemented there (P1) and using
// the real thing proves this module's calls actually shape correctly against
// it (mint -> transfer -> modify, ownership moving issuer -> player). A tiny
// FlakyNFTTransport WRAPS the real DryRunTransport (never reimplements it) to
// force one call to fail on demand, for the per-item ANDON / retry-safety
// coverage the deterministic dry-run transport cannot otherwise exercise
// (nftMint/nftCreateSellOffer/nftAcceptSellOffer never fail on their own in
// dry-run once the basic preconditions are met).

import { describe, expect, it } from 'vitest';
import type {
  EquipmentSnapshot,
  LedgerAdapterState,
  NFTInfo,
  NFTMintFlags,
  NFTMintResult,
  NFTOfferResult,
  NFTTransport,
  TxResult,
  UniqueItemSnapshot,
} from '../contracts.js';
import { buildItemNFTUri } from '../contracts.js';
import { DryRunTransport } from '../transport/dry-run.js';
import { settleEquipmentNFTs, ARPG_NFT_TAXON } from './nft.js';
import type { NFTSettlementResult } from './nft.js';

// ── A thin fail-on-demand WRAPPER over the real DryRunTransport ─────────────

class FlakyNFTTransport implements NFTTransport {
  private failuresRemaining: number;

  constructor(
    private readonly inner: DryRunTransport,
    private readonly failMethod: keyof NFTTransport,
    failCount = 1,
  ) {
    this.failuresRemaining = failCount;
  }

  private forcedFailure(): TxResult | null {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining--;
      return { ok: false, hash: '', code: 'tecFAKE_FAILURE', error: 'forced test failure' };
    }
    return null;
  }

  async nftMint(seed: string, uri: string, taxon: number, flags: NFTMintFlags, transferFee?: number): Promise<NFTMintResult> {
    if (this.failMethod === 'nftMint') {
      const forced = this.forcedFailure();
      if (forced) return forced;
    }
    return this.inner.nftMint(seed, uri, taxon, flags, transferFee);
  }

  async nftBurn(seed: string, nftId: string, owner?: string): Promise<TxResult> {
    if (this.failMethod === 'nftBurn') {
      const forced = this.forcedFailure();
      if (forced) return forced;
    }
    return this.inner.nftBurn(seed, nftId, owner);
  }

  async nftModify(seed: string, nftId: string, uri: string, owner: string): Promise<TxResult> {
    if (this.failMethod === 'nftModify') {
      const forced = this.forcedFailure();
      if (forced) return forced;
    }
    return this.inner.nftModify(seed, nftId, uri, owner);
  }

  async nftCreateSellOffer(seed: string, nftId: string, amount: string, destination?: string): Promise<NFTOfferResult> {
    if (this.failMethod === 'nftCreateSellOffer') {
      const forced = this.forcedFailure();
      if (forced) return forced;
    }
    return this.inner.nftCreateSellOffer(seed, nftId, amount, destination);
  }

  async nftAcceptSellOffer(seed: string, offerIndex: string): Promise<TxResult> {
    if (this.failMethod === 'nftAcceptSellOffer') {
      const forced = this.forcedFailure();
      if (forced) return forced;
    }
    return this.inner.nftAcceptSellOffer(seed, offerIndex);
  }

  async accountNfts(address: string): Promise<NFTInfo[]> {
    return this.inner.accountNfts(address);
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────

// DryRunTransport derives a signer's address PURELY from its seed
// (deriveAddress — "no instance state, so every DryRunTransport agrees on the
// same seed -> address mapping"), and `nftAcceptSellOffer`'s directed-offer
// check compares the ACCEPTING signer's derived address against the offer's
// `destination`. So `playerAddress` must be the address that actually derives
// from `playerSeed` — an independently-invented literal (e.g. 'rPLAYER')
// would make every directed transfer in these tests fail tecNO_PERMISSION.
// `walletFromSeed` is pure/stateless, so deriving from a throwaway instance
// here is exactly as correct as deriving from the instance each test itself
// constructs.
const bootstrapTransport = new DryRunTransport();
const ISSUER_SEED = 'sISSUERSEED';
const PLAYER_SEED = 'sPLAYERSEED';
const ISSUER_ADDRESS = bootstrapTransport.walletFromSeed(ISSUER_SEED).address;
const PLAYER_ADDRESS = bootstrapTransport.walletFromSeed(PLAYER_SEED).address;

function freshState(): LedgerAdapterState {
  return {
    mode: 'ledger',
    issuerMode: 'per-run',
    enabled: true,
    issuerAddress: ISSUER_ADDRESS,
    playerAddress: PLAYER_ADDRESS,
    merchantAddress: 'rMERCHANT',
    trustLinesReady: true,
    tokenMap: {},
    lastSettled: {},
    settlements: [],
    pending: [],
    lastSettleFailed: false,
    // `nfts` intentionally omitted — proves settleEquipmentNFTs defaults it.
  };
}

function makeItem(overrides: Partial<UniqueItemSnapshot> = {}): UniqueItemSnapshot {
  return {
    itemId: 'cutlass',
    name: 'Cutlass',
    slot: 'weapon',
    rarity: 'rare',
    equipped: true,
    relicTier: 0,
    relicVersion: 0,
    ...overrides,
  };
}

const DEPS = {
  gameId: 'pirate-game',
  issuerAddress: ISSUER_ADDRESS,
  playerAddress: PLAYER_ADDRESS,
  issuerSeed: ISSUER_SEED,
  playerSeed: PLAYER_SEED,
};

describe('settleEquipmentNFTs — mint + transfer', () => {
  it('mints a fresh item and moves ownership issuer -> player', async () => {
    const transport = new DryRunTransport();
    const state = freshState();
    const snapshot: EquipmentSnapshot = { items: [makeItem()] };

    const result = await settleEquipmentNFTs(transport, state, snapshot, DEPS);

    expect(result.success).toBe(true);
    expect(result.minted).toEqual(['cutlass']);
    expect(result.modified).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.txids).toHaveLength(3); // mint + createSellOffer + acceptSellOffer

    const ref = state.nfts?.cutlass;
    expect(ref).toBeDefined();
    expect(ref?.status).toBe('minted');
    expect(ref?.taxon).toBe(ARPG_NFT_TAXON);
    expect(ref?.mutable).toBe(true);
    expect(ref?.uri).toBe(buildItemNFTUri('pirate-game', 'cutlass', 0, 0));
    expect(ref?.mintTxid).toBeTruthy();

    const playerNfts = await transport.accountNfts(DEPS.playerAddress);
    expect(playerNfts).toHaveLength(1);
    expect(playerNfts[0].nftId).toBe(ref?.nftId);
    expect(playerNfts[0].uri).toBe(ref?.uri);
    expect(playerNfts[0].taxon).toBe(ARPG_NFT_TAXON);

    const issuerNfts = await transport.accountNfts(DEPS.issuerAddress);
    expect(issuerNfts).toHaveLength(0); // transferred away, not left behind
  });

  it('mints one NFT per item for a multi-item snapshot', async () => {
    const transport = new DryRunTransport();
    const state = freshState();
    const snapshot: EquipmentSnapshot = {
      items: [makeItem({ itemId: 'cutlass' }), makeItem({ itemId: 'tricorn', slot: 'armor' })],
    };

    const result = await settleEquipmentNFTs(transport, state, snapshot, DEPS);

    expect(result.minted.sort()).toEqual(['cutlass', 'tricorn']);
    expect(Object.keys(state.nfts ?? {}).sort()).toEqual(['cutlass', 'tricorn']);
    expect(state.nfts?.cutlass.nftId).not.toBe(state.nfts?.tricorn.nftId);

    const playerNfts = await transport.accountNfts(DEPS.playerAddress);
    expect(playerNfts).toHaveLength(2);
  });
});

describe('settleEquipmentNFTs — IDEMPOTENCY', () => {
  it('a second settle with the same snapshot re-mints nothing (skipped, account_nfts count unchanged)', async () => {
    const transport = new DryRunTransport();
    const state = freshState();
    const snapshot: EquipmentSnapshot = { items: [makeItem()] };

    await settleEquipmentNFTs(transport, state, snapshot, DEPS);
    const firstNftId = state.nfts?.cutlass.nftId;
    const countAfterFirst = (await transport.accountNfts(DEPS.playerAddress)).length;
    expect(countAfterFirst).toBe(1);

    const second = await settleEquipmentNFTs(transport, state, snapshot, DEPS);

    expect(second.success).toBe(true);
    expect(second.minted).toEqual([]);
    expect(second.modified).toEqual([]);
    expect(second.skipped).toEqual(['cutlass']);
    expect(second.txids).toEqual([]); // no transport calls made at all

    expect(state.nfts?.cutlass.nftId).toBe(firstNftId); // unchanged

    const countAfterSecond = (await transport.accountNfts(DEPS.playerAddress)).length;
    expect(countAfterSecond).toBe(1); // still exactly one — no re-mint
  });
});

describe('settleEquipmentNFTs — relic growth', () => {
  it('a higher relicVersion triggers exactly one nftModify (same nftId, new URI)', async () => {
    const transport = new DryRunTransport();
    const state = freshState();
    const initial: EquipmentSnapshot = { items: [makeItem({ relicVersion: 0, relicTier: 0 })] };
    await settleEquipmentNFTs(transport, state, initial, DEPS);
    const originalNftId = state.nfts?.cutlass.nftId;

    const grown: EquipmentSnapshot = { items: [makeItem({ relicVersion: 3, relicTier: 1 })] };
    const result = await settleEquipmentNFTs(transport, state, grown, DEPS);

    expect(result.modified).toEqual(['cutlass']);
    expect(result.minted).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.txids).toHaveLength(1); // exactly one nftModify call

    expect(state.nfts?.cutlass.nftId).toBe(originalNftId); // identity preserved across growth
    expect(state.nfts?.cutlass.relicVersion).toBe(3);
    expect(state.nfts?.cutlass.uri).toBe(buildItemNFTUri('pirate-game', 'cutlass', 3, 1));

    const playerNfts = await transport.accountNfts(DEPS.playerAddress);
    expect(playerNfts).toHaveLength(1); // still just the one token, mutated in place
    expect(playerNfts[0].nftId).toBe(originalNftId);
    expect(playerNfts[0].uri).toBe(state.nfts?.cutlass.uri);
  });

  it('a THIRD settle at the same (already-reflected) relicVersion no-ops (skip, not a second modify)', async () => {
    const transport = new DryRunTransport();
    const state = freshState();
    await settleEquipmentNFTs(transport, state, { items: [makeItem({ relicVersion: 0, relicTier: 0 })] }, DEPS);
    await settleEquipmentNFTs(transport, state, { items: [makeItem({ relicVersion: 3, relicTier: 1 })] }, DEPS);

    const third = await settleEquipmentNFTs(transport, state, { items: [makeItem({ relicVersion: 3, relicTier: 1 })] }, DEPS);

    expect(third.modified).toEqual([]);
    expect(third.skipped).toEqual(['cutlass']);
    expect(third.txids).toEqual([]);
  });
});

describe('settleEquipmentNFTs — retry-safety (a pending ref resumes without re-minting)', () => {
  it('resumes a hand-seeded pending ref by finishing only the transfer', async () => {
    const transport = new DryRunTransport();
    const state = freshState();

    // Simulate "a prior settle minted the token but the process died before
    // the transfer completed": mint directly against the transport (issuer
    // still holds it) and hand-seed a 'pending' ref pointing at it.
    const preUri = buildItemNFTUri('pirate-game', 'cutlass', 0, 0);
    const mintRes = await transport.nftMint(DEPS.issuerSeed, preUri, ARPG_NFT_TAXON, { transferable: true, mutable: true });
    expect(mintRes.ok).toBe(true);

    state.nfts = {
      cutlass: {
        gameItemId: 'cutlass',
        nftId: mintRes.nftId as string,
        uri: preUri,
        relicVersion: 0,
        taxon: ARPG_NFT_TAXON,
        mutable: true,
        mintTxid: mintRes.hash,
        status: 'pending',
      },
    };

    expect(await transport.accountNfts(DEPS.issuerAddress)).toHaveLength(1); // still with the issuer
    expect(await transport.accountNfts(DEPS.playerAddress)).toHaveLength(0);

    const result = await settleEquipmentNFTs(transport, state, { items: [makeItem({ relicVersion: 0, relicTier: 0 })] }, DEPS);

    expect(result.minted).toEqual(['cutlass']);
    expect(result.txids).toHaveLength(2); // createSellOffer + acceptSellOffer only — no re-mint
    expect(state.nfts.cutlass.status).toBe('minted');
    expect(state.nfts.cutlass.nftId).toBe(mintRes.nftId); // same nftId throughout

    expect(await transport.accountNfts(DEPS.issuerAddress)).toHaveLength(0);
    const playerNfts = await transport.accountNfts(DEPS.playerAddress);
    expect(playerNfts).toHaveLength(1);
    expect(playerNfts[0].nftId).toBe(mintRes.nftId);
  });

  it('end-to-end: a forced transfer failure leaves the ref pending, does not block a second item in the same batch, and a later retry resumes it without re-minting', async () => {
    const inner = new DryRunTransport();
    const flaky = new FlakyNFTTransport(inner, 'nftCreateSellOffer', 1);
    const state = freshState();
    const snapshot: EquipmentSnapshot = {
      items: [makeItem({ itemId: 'cutlass' }), makeItem({ itemId: 'tricorn', slot: 'armor' })],
    };

    const first = await settleEquipmentNFTs(flaky, state, snapshot, DEPS);

    expect(first.success).toBe(false);
    expect(first.minted).toEqual(['tricorn']); // the second item is unaffected by the first item's failure
    expect(state.nfts?.cutlass.status).toBe('pending');
    expect(state.nfts?.tricorn.status).toBe('minted');
    const cutlassNftId = state.nfts?.cutlass.nftId;
    expect(cutlassNftId).toBeTruthy(); // the mint itself DID happen; only the transfer failed

    const retry = await settleEquipmentNFTs(flaky, state, snapshot, DEPS);

    expect(retry.success).toBe(true);
    expect(retry.minted).toEqual(['cutlass']);
    expect(retry.skipped).toEqual(['tricorn']);
    expect(state.nfts?.cutlass.nftId).toBe(cutlassNftId); // never re-minted
    expect(state.nfts?.cutlass.status).toBe('minted');

    const playerNfts = await inner.accountNfts(DEPS.playerAddress);
    expect(playerNfts).toHaveLength(2);
  });
});

describe('settleEquipmentNFTs — determinism', () => {
  it('two independent fresh runs against fresh transports produce identical results', async () => {
    async function run(): Promise<{ result: NFTSettlementResult; nftId: string; uri: string }> {
      const transport = new DryRunTransport();
      const state = freshState();
      const snapshot: EquipmentSnapshot = { items: [makeItem()] };
      const result = await settleEquipmentNFTs(transport, state, snapshot, DEPS);
      return { result, nftId: state.nfts?.cutlass.nftId as string, uri: state.nfts?.cutlass.uri as string };
    }

    const a = await run();
    const b = await run();

    expect(a).toEqual(b);
  });
});
