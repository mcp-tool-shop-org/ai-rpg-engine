// bindSidecar + resumeAdapter: a restarted process with only the sidecar
// bindings can settle a coin spend AND finish a pending NFT transfer.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { EquipmentSnapshot, LedgerAdapterConfig, UniqueItemSnapshot } from '../contracts.js';
import { bindSidecar } from '../security/secrets.js';
import { createInitialState, deserializeState, serializeState } from '../state/index.js';
import { DryRunTransport } from '../transport/dry-run.js';
import { createLedgerAdapter, resumeAdapter } from './adapter.js';
import { ARPG_NFT_TAXON, settleEquipmentNFTs } from './nft.js';
import { buildItemNFTUri } from '../contracts.js';

const CONFIG: LedgerAdapterConfig = {
  mode: 'ledger',
  issuerMode: 'per-run',
  settlement: 'token-escrow',
  network: 'testnet',
};

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

describe('bindSidecar + resumeAdapter — save/reload with pending NFT', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it('deserialize + new adapter with only bindSidecar settles a coin spend and finishes a pending NFT transfer', async () => {
    dir = mkdtempSync(join(tmpdir(), 'ledger-adapter-resume-'));
    const sidecar = bindSidecar(dir);
    const transport = new DryRunTransport();
    await transport.connect();

    const first = createLedgerAdapter(transport, CONFIG, {
      gameId: 'pirate-game',
      runId: 'run-1',
      ...sidecar,
    });
    const state = createInitialState(CONFIG);
    const enabled = await first.enable(state, { coin: 100, items: {} });
    expect(enabled.success).toBe(true);

    // Mint the token onto the issuer and leave the ref pending — a process
    // crash between mint and accept. resumeAdapter must finish the transfer
    // from sidecar seeds alone.
    const uri = buildItemNFTUri('pirate-game', 'cutlass', 0, 0);
    const mintRes = await transport.nftMint(
      first.getSeed(state.issuerAddress) as string,
      uri,
      ARPG_NFT_TAXON,
      { transferable: true, mutable: true },
    );
    expect(mintRes.ok).toBe(true);
    state.nfts = {
      cutlass: {
        gameItemId: 'cutlass',
        nftId: mintRes.nftId as string,
        uri,
        relicVersion: 0,
        taxon: ARPG_NFT_TAXON,
        mutable: true,
        mintTxid: mintRes.hash,
        status: 'pending',
        name: 'Cutlass',
      },
    };

    const saved = serializeState(state);
    const restored = deserializeState(saved);

    // New process: only bindSidecar, no hand-wired getSeed map.
    const resumedAdapter = createLedgerAdapter(transport, CONFIG, {
      gameId: 'pirate-game',
      runId: 'run-1',
      ...bindSidecar(dir),
    });
    const equipment: EquipmentSnapshot = { items: [makeItem()] };
    const resumed = await resumeAdapter(resumedAdapter, restored, { coin: 100, items: {} }, {
      transport,
      snapshot: equipment,
    });
    expect(resumed.enable.success).toBe(true);
    expect(resumed.nft?.success).toBe(true);
    expect(resumed.nft?.minted).toContain('cutlass');
    expect(restored.nfts?.cutlass.status).toBe('minted');
    expect((await transport.accountNfts(restored.playerAddress)).map((n) => n.nftId)).toEqual([
      restored.nfts?.cutlass.nftId,
    ]);

    const spent = await resumedAdapter.settle(restored, { coin: 90, items: {} }, 1, 'Cedar Wake');
    expect(spent.success).toBe(true);
    expect(spent.network).toBe('dry-run');
    expect(spent.message).toMatch(/^Settled on Dry-run/);
    expect(restored.lastSettled.coin).toBe(90);

    // The low-level worker was not required after resume — but a second
    // settleEquipmentNFTs would skip, proving the pending transfer finished.
    const again = await settleEquipmentNFTs(transport, restored, equipment, {
      gameId: 'pirate-game',
      issuerAddress: restored.issuerAddress,
      playerAddress: restored.playerAddress,
      issuerSeed: resumedAdapter.getSeed(restored.issuerAddress) as string,
      playerSeed: resumedAdapter.getSeed(restored.playerAddress) as string,
    });
    expect(again.skipped).toContain('cutlass');
    expect(again.minted).toEqual([]);
  });
});
