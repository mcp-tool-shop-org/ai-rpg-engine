import { describe, expect, it } from 'vitest';
import { createLedgerAdapter } from './adapter.js';
import { reconcileAgainstLedger } from './reconcile-ledger.js';
import { createInitialState } from '../state/index.js';
import { DryRunTransport } from '../transport/dry-run.js';
import { buildItemNFTUri } from '../contracts.js';
import { ARPG_NFT_TAXON, settleEquipmentNFTs, transferUniqueGear } from './nft.js';
import type { LedgerAdapterConfig } from '../contracts.js';

const CONFIG: LedgerAdapterConfig = {
  mode: 'ledger',
  issuerMode: 'per-run',
  settlement: 'token-escrow',
  network: 'testnet',
};

describe('reconcileAgainstLedger', () => {
  it('fetches accountLines/accountTx and passes using state.mintedInitial (not lastSettled)', async () => {
    const transport = new DryRunTransport();
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'g', runId: 'run-1' });
    const state = createInitialState(CONFIG);
    await adapter.enable(state, { coin: 100, items: { potion: 2 } });
    expect(state.mintedInitial).toEqual({ coin: 100, potion: 2 });

    const settled = await adapter.settle(state, { coin: 70, items: { potion: 2 } }, 1, 'Cedar Wake');
    expect(settled.success).toBe(true);
    expect(state.lastSettled.coin).toBe(70);

    const report = await reconcileAgainstLedger(transport, state, { runId: 'run-1', seed: 0 });
    expect(report.passed).toBe(true);
    expect(report.resources.find((r) => r.resource === 'coin')?.minted).toBe(100);
    expect(report.resources.find((r) => r.resource === 'coin')?.conservationOk).toBe(true);
    expect(report.onchainMemoOk).toBe(true);
  });

  it('when nfts are tracked, fetches accountNfts via buildLedgerNfts', async () => {
    const transport = new DryRunTransport();
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'pirate', runId: 'run-nft' });
    const state = createInitialState(CONFIG);
    await adapter.enable(state, { coin: 10, items: {} });

    const issuerSeed = adapter.getSeed(state.issuerAddress)!;
    const playerSeed = adapter.getSeed(state.playerAddress)!;
    const nft = await settleEquipmentNFTs(
      transport,
      state,
      {
        items: [
          {
            itemId: 'cutlass',
            name: 'Cutlass',
            slot: 'weapon',
            rarity: 'rare',
            equipped: true,
            relicTier: 0,
            relicVersion: 0,
          },
        ],
      },
      {
        gameId: 'pirate',
        issuerAddress: state.issuerAddress,
        playerAddress: state.playerAddress,
        issuerSeed,
        playerSeed,
      },
    );
    expect(nft.success).toBe(true);
    expect(state.nfts?.cutlass?.nftId).toBeTruthy();
    expect(state.nfts?.cutlass?.taxon).toBe(ARPG_NFT_TAXON);
    expect(state.nfts?.cutlass?.uri).toBe(buildItemNFTUri('pirate', 'cutlass', 0, 0));

    const report = await reconcileAgainstLedger(transport, state, { runId: 'run-nft', seed: 0 });
    expect(report.nftChecks).toHaveLength(1);
    expect(report.nftChecks?.[0].ok).toBe(true);
    expect(report.passed).toBe(true);
  });

  it('fetches accountNfts for NFTokenRef.ownerAddress when the player is not the holder', async () => {
    const transport = new DryRunTransport();
    const adapter = createLedgerAdapter(transport, CONFIG, { gameId: 'pirate', runId: 'run-give' });
    const state = createInitialState(CONFIG);
    await adapter.enable(state, { coin: 10, items: {} });

    const issuerSeed = adapter.getSeed(state.issuerAddress)!;
    const playerSeed = adapter.getSeed(state.playerAddress)!;
    const merchantSeed = adapter.getSeed(state.merchantAddress)!;
    await settleEquipmentNFTs(
      transport,
      state,
      {
        items: [
          {
            itemId: 'cutlass',
            name: 'Cutlass',
            slot: 'weapon',
            rarity: 'rare',
            equipped: true,
            relicTier: 0,
            relicVersion: 0,
          },
        ],
      },
      {
        gameId: 'pirate',
        issuerAddress: state.issuerAddress,
        playerAddress: state.playerAddress,
        issuerSeed,
        playerSeed,
      },
    );

    await transferUniqueGear(transport, state, 'cutlass', state.merchantAddress, {
      playerSeed,
      recipientSeed: merchantSeed,
    });
    expect(state.nfts?.cutlass.ownerAddress).toBe(state.merchantAddress);

    const report = await reconcileAgainstLedger(transport, state, { runId: 'run-give', seed: 0 });
    expect(report.nftChecks?.[0].expectedOwner).toBe(state.merchantAddress);
    expect(report.nftChecks?.[0].ok).toBe(true);
    expect(report.passed).toBe(true);
  });
});
