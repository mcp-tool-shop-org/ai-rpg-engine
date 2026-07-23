import { describe, it, expect } from 'vitest';
import type { IssuedAmount } from '../contracts.js';
import { ASF_DEFAULT_RIPPLE, ASF_ALLOW_TRUSTLINE_LOCKING } from '../contracts.js';
import { DryRunTransport } from './dry-run.js';

const CURRENCY = 'COI';

/** Read a holder's COI balance off accountLines (0 if no line is open yet). */
async function coiBalance(transport: DryRunTransport, holder: string): Promise<number> {
  const lines = await transport.accountLines(holder);
  const line = lines.find((l) => l.currency === CURRENCY);
  return line ? Number(line.balance) : 0;
}

describe('DryRunTransport', () => {
  describe('escrow lifecycle (mirrors the proven live spike, in-memory)', () => {
    it('mints, escrows, and finishes a token escrow end-to-end', async () => {
      const transport = new DryRunTransport();
      await transport.connect();
      expect(transport.networkName).toBe('dry-run');

      const issuer = await transport.fundWallet();
      const player = await transport.fundWallet();
      const merchant = await transport.fundWallet();

      const rippleFlag = await transport.setAccountFlag(issuer.seed, ASF_DEFAULT_RIPPLE);
      expect(rippleFlag).toMatchObject({ ok: true, code: 'tesSUCCESS' });

      const lockingFlag = await transport.setAccountFlag(issuer.seed, ASF_ALLOW_TRUSTLINE_LOCKING);
      expect(lockingFlag).toMatchObject({ ok: true, code: 'tesSUCCESS' });

      const trustLimit = '1000000';
      const playerTrust = await transport.trustSet(player.seed, issuer.address, CURRENCY, trustLimit);
      expect(playerTrust).toMatchObject({ ok: true, code: 'tesSUCCESS' });
      const merchantTrust = await transport.trustSet(merchant.seed, issuer.address, CURRENCY, trustLimit);
      expect(merchantTrust).toMatchObject({ ok: true, code: 'tesSUCCESS' });

      const mintAmount: IssuedAmount = { currency: CURRENCY, issuer: issuer.address, value: '1000' };
      const mint = await transport.payment(issuer.seed, player.address, mintAmount);
      expect(mint).toMatchObject({ ok: true, code: 'tesSUCCESS' });
      expect(await coiBalance(transport, player.address)).toBe(1000);

      const escrowAmount: IssuedAmount = { currency: CURRENCY, issuer: issuer.address, value: '100' };
      const escrowMemo = 'ARPG|GAME:pirate|RUN:abc123|CHECKPOINT:1|DELTA:coin-100|VERB:sell|V:1';
      const escrow = await transport.escrowCreate(
        player.seed,
        merchant.address,
        escrowAmount,
        0,
        0,
        escrowMemo,
      );
      expect(escrow.ok).toBe(true);
      expect(escrow.code).toBe('tesSUCCESS');
      expect(typeof escrow.sequence).toBe('number');

      // Locking the escrow immediately reduces the player's live balance.
      expect(await coiBalance(transport, player.address)).toBe(900);

      const finish = await transport.escrowFinish(merchant.seed, player.address, escrow.sequence as number);
      expect(finish).toMatchObject({ ok: true, code: 'tesSUCCESS' });

      expect(await coiBalance(transport, merchant.address)).toBe(100);
      expect(await coiBalance(transport, player.address)).toBe(900);
    });
  });

  describe('conservation', () => {
    it('total minted equals the sum of trust-line balances plus the escrowed amount at every step', async () => {
      const transport = new DryRunTransport();
      const issuer = await transport.fundWallet();
      const player = await transport.fundWallet();
      const merchant = await transport.fundWallet();

      await transport.setAccountFlag(issuer.seed, ASF_ALLOW_TRUSTLINE_LOCKING);
      await transport.trustSet(player.seed, issuer.address, CURRENCY, '1000000');
      await transport.trustSet(merchant.seed, issuer.address, CURRENCY, '1000000');

      const totalMinted = 500;
      const mint = await transport.payment(issuer.seed, player.address, {
        currency: CURRENCY,
        issuer: issuer.address,
        value: String(totalMinted),
      });
      expect(mint.ok).toBe(true);

      const sumLineBalances = async () =>
        (await coiBalance(transport, player.address)) + (await coiBalance(transport, merchant.address));

      // Checkpoint 1 — nothing escrowed yet: all minted value sits in lines.
      expect(await sumLineBalances()).toBe(totalMinted);

      const escrowedValue = 200;
      const escrow = await transport.escrowCreate(
        player.seed,
        merchant.address,
        { currency: CURRENCY, issuer: issuer.address, value: String(escrowedValue) },
        0,
        0,
      );
      expect(escrow.ok).toBe(true);

      // Checkpoint 2 — escrowedValue left the visible line balances (it is
      // locked in-flight); adding it back must restore the total-minted identity.
      expect(await sumLineBalances()).toBe(totalMinted - escrowedValue);
      expect((await sumLineBalances()) + escrowedValue).toBe(totalMinted);

      const finish = await transport.escrowFinish(merchant.seed, player.address, escrow.sequence as number);
      expect(finish.ok).toBe(true);

      // Checkpoint 3 — the escrow released back into a line: conservation
      // holds again with nothing separately escrowed.
      expect(await sumLineBalances()).toBe(totalMinted);
    });
  });

  describe('escrow gate (XLS-85 ASF_ALLOW_TRUSTLINE_LOCKING)', () => {
    it('fails escrowCreate with tecNO_PERMISSION when the issuer never enabled ALLOW_TRUSTLINE_LOCKING', async () => {
      const transport = new DryRunTransport();
      const issuer = await transport.fundWallet();
      const player = await transport.fundWallet();
      const merchant = await transport.fundWallet();

      // Deliberately no setAccountFlag(issuer.seed, ASF_ALLOW_TRUSTLINE_LOCKING).
      await transport.trustSet(player.seed, issuer.address, CURRENCY, '1000000');
      const mint = await transport.payment(issuer.seed, player.address, {
        currency: CURRENCY,
        issuer: issuer.address,
        value: '100',
      });
      expect(mint.ok).toBe(true);

      const result = await transport.escrowCreate(
        player.seed,
        merchant.address,
        { currency: CURRENCY, issuer: issuer.address, value: '50' },
        0,
        0,
      );
      expect(result).toEqual(
        expect.objectContaining({ ok: false, code: 'tecNO_PERMISSION', hash: '' }),
      );

      // The gate fires before any funds move.
      expect(await coiBalance(transport, player.address)).toBe(100);
    });
  });

  describe('memo round-trip', () => {
    it('records an escrowCreate memo readable back via accountTx, for both parties', async () => {
      const transport = new DryRunTransport();
      const issuer = await transport.fundWallet();
      const player = await transport.fundWallet();
      const merchant = await transport.fundWallet();

      await transport.setAccountFlag(issuer.seed, ASF_ALLOW_TRUSTLINE_LOCKING);
      await transport.trustSet(player.seed, issuer.address, CURRENCY, '1000000');
      await transport.payment(issuer.seed, player.address, {
        currency: CURRENCY,
        issuer: issuer.address,
        value: '100',
      });

      const memo = 'ARPG|GAME:pirate|RUN:abc123|CHECKPOINT:3|DELTA:coin-25|VERB:sell|V:1';
      const escrow = await transport.escrowCreate(
        player.seed,
        merchant.address,
        { currency: CURRENCY, issuer: issuer.address, value: '25' },
        0,
        0,
        memo,
      );
      expect(escrow.ok).toBe(true);

      const playerTx = await transport.accountTx(player.address);
      const createdFromPlayer = playerTx.find((tx) => tx.type === 'EscrowCreate');
      expect(createdFromPlayer?.memo).toBe(memo);
      expect(createdFromPlayer?.hash).toBe(escrow.hash);

      const merchantTx = await transport.accountTx(merchant.address);
      const createdFromMerchant = merchantTx.find((tx) => tx.type === 'EscrowCreate');
      expect(createdFromMerchant?.memo).toBe(memo);
      expect(createdFromMerchant?.hash).toBe(escrow.hash);

      // accountTx's optional limit truncates to the most recent N entries.
      const limited = await transport.accountTx(player.address, 1);
      expect(limited).toHaveLength(1);
    });
  });

  describe('determinism', () => {
    it('two fresh transports yield identical addresses/hashes for the same call sequence', async () => {
      const runSequence = async () => {
        const transport = new DryRunTransport();
        await transport.connect();
        const issuer = await transport.fundWallet();
        const player = await transport.fundWallet();
        const merchant = await transport.fundWallet();
        const flag1 = await transport.setAccountFlag(issuer.seed, ASF_DEFAULT_RIPPLE);
        const flag2 = await transport.setAccountFlag(issuer.seed, ASF_ALLOW_TRUSTLINE_LOCKING);
        const trust1 = await transport.trustSet(player.seed, issuer.address, CURRENCY, '1000000');
        const trust2 = await transport.trustSet(merchant.seed, issuer.address, CURRENCY, '1000000');
        const mint = await transport.payment(issuer.seed, player.address, {
          currency: CURRENCY,
          issuer: issuer.address,
          value: '1000',
        });
        const escrow = await transport.escrowCreate(
          player.seed,
          merchant.address,
          { currency: CURRENCY, issuer: issuer.address, value: '100' },
          0,
          0,
          'memo',
        );
        const finish = await transport.escrowFinish(merchant.seed, player.address, escrow.sequence as number);
        return { issuer, player, merchant, flag1, flag2, trust1, trust2, mint, escrow, finish };
      };

      const runA = await runSequence();
      const runB = await runSequence();

      expect(runA.issuer).toEqual(runB.issuer);
      expect(runA.player).toEqual(runB.player);
      expect(runA.merchant).toEqual(runB.merchant);
      expect(runA.flag1.hash).toBe(runB.flag1.hash);
      expect(runA.flag2.hash).toBe(runB.flag2.hash);
      expect(runA.trust1.hash).toBe(runB.trust1.hash);
      expect(runA.trust2.hash).toBe(runB.trust2.hash);
      expect(runA.mint.hash).toBe(runB.mint.hash);
      expect(runA.escrow.hash).toBe(runB.escrow.hash);
      expect(runA.escrow.sequence).toBe(runB.escrow.sequence);
      expect(runA.finish.hash).toBe(runB.finish.hash);

      // And hashes are never blank/colliding across distinct operations.
      const hashesA = [runA.flag1.hash, runA.flag2.hash, runA.trust1.hash, runA.trust2.hash, runA.mint.hash, runA.escrow.hash, runA.finish.hash];
      expect(new Set(hashesA).size).toBe(hashesA.length);
      expect(hashesA.every((h) => h.length > 0)).toBe(true);
    });

    it('walletFromSeed is a pure function of the seed alone, independent of instance counter state', async () => {
      const fresh = new DryRunTransport();
      const busy = new DryRunTransport();
      // Advance `busy`'s internal counters so it is no longer "fresh", proving
      // derivation depends only on the seed string, not on call-time state.
      await busy.fundWallet();
      await busy.fundWallet();
      await busy.fundWallet();

      const counterSeed = 'sDRYRUN0000000001';
      expect(fresh.walletFromSeed(counterSeed)).toEqual(busy.walletFromSeed(counterSeed));

      const arbitrarySeed = 'sEdSomeArbitraryTestnetLookingSeedValue';
      expect(fresh.walletFromSeed(arbitrarySeed)).toEqual(busy.walletFromSeed(arbitrarySeed));
    });
  });

  describe('NFT operations (NFTTransport)', () => {
    const TAXON = 0;
    const URI_V1 = 'ARPG-NFT|GAME:pirate|ITEM:cutlass|RELIC:0|TIER:0|V:1';
    const URI_V2 = 'ARPG-NFT|GAME:pirate|ITEM:cutlass|RELIC:1|TIER:1|V:1';

    it('mints an NFT owned by the issuer; accountNfts reports it with the mutable+transferable flag combination (24)', async () => {
      const transport = new DryRunTransport();
      const issuer = await transport.fundWallet();

      const mint = await transport.nftMint(issuer.seed, URI_V1, TAXON, { transferable: true, mutable: true });
      expect(mint.ok).toBe(true);
      expect(mint.code).toBe('tesSUCCESS');
      expect(typeof mint.nftId).toBe('string');
      expect(mint.nftId).toHaveLength(64);

      const owned = await transport.accountNfts(issuer.address);
      expect(owned).toHaveLength(1);
      expect(owned[0]).toEqual({
        nftId: mint.nftId,
        uri: URI_V1,
        taxon: TAXON,
        issuer: issuer.address,
        flags: 24, // transferable (8) | mutable (16)
      });
    });

    it('createSellOffer -> acceptSellOffer moves ownership from seller to accepter (accountNfts confirms both sides)', async () => {
      const transport = new DryRunTransport();
      const issuer = await transport.fundWallet();
      const player = await transport.fundWallet();

      const mint = await transport.nftMint(issuer.seed, URI_V1, TAXON, { transferable: true, mutable: true });
      const nftId = mint.nftId as string;

      const offer = await transport.nftCreateSellOffer(issuer.seed, nftId, '0', player.address);
      expect(offer.ok).toBe(true);
      expect(offer.code).toBe('tesSUCCESS');
      expect(typeof offer.offerIndex).toBe('string');

      const accept = await transport.nftAcceptSellOffer(player.seed, offer.offerIndex as string);
      expect(accept).toMatchObject({ ok: true, code: 'tesSUCCESS' });

      expect(await transport.accountNfts(issuer.address)).toEqual([]);
      const playerNfts = await transport.accountNfts(player.address);
      expect(playerNfts).toHaveLength(1);
      expect(playerNfts[0].nftId).toBe(nftId);
      expect(playerNfts[0].issuer).toBe(issuer.address); // issuer role never transfers
    });

    it('a directed sell offer rejects an accept from anyone other than its destination', async () => {
      const transport = new DryRunTransport();
      const issuer = await transport.fundWallet();
      const player = await transport.fundWallet();
      const rando = await transport.fundWallet();

      const mint = await transport.nftMint(issuer.seed, URI_V1, TAXON, { transferable: true, mutable: true });
      const nftId = mint.nftId as string;
      const offer = await transport.nftCreateSellOffer(issuer.seed, nftId, '0', player.address);

      const rejected = await transport.nftAcceptSellOffer(rando.seed, offer.offerIndex as string);
      expect(rejected).toEqual(expect.objectContaining({ ok: false, code: 'tecNO_PERMISSION', hash: '' }));

      // Ownership never moved.
      expect(await transport.accountNfts(issuer.address)).toHaveLength(1);
      expect(await transport.accountNfts(rando.address)).toEqual([]);
      expect(await transport.accountNfts(player.address)).toEqual([]);
    });

    it('accepting an unknown offerIndex fails tecOBJECT_NOT_FOUND', async () => {
      const transport = new DryRunTransport();
      const someone = await transport.fundWallet();
      const result = await transport.nftAcceptSellOffer(someone.seed, 'DOES-NOT-EXIST');
      expect(result).toEqual(expect.objectContaining({ ok: false, code: 'tecOBJECT_NOT_FOUND', hash: '' }));
    });

    it('only the current holder may create a sell offer for an NFT (tecNO_PERMISSION otherwise)', async () => {
      const transport = new DryRunTransport();
      const issuer = await transport.fundWallet();
      const rando = await transport.fundWallet();

      const mint = await transport.nftMint(issuer.seed, URI_V1, TAXON, { transferable: true, mutable: true });
      const nftId = mint.nftId as string;

      const result = await transport.nftCreateSellOffer(rando.seed, nftId, '0');
      expect(result).toEqual(expect.objectContaining({ ok: false, code: 'tecNO_PERMISSION', hash: '' }));
    });

    it('NFTokenModify: the issuer modifies a player-owned mutable NFT, changing only the uri (NFTokenID/owner unchanged)', async () => {
      const transport = new DryRunTransport();
      const issuer = await transport.fundWallet();
      const player = await transport.fundWallet();

      const mint = await transport.nftMint(issuer.seed, URI_V1, TAXON, { transferable: true, mutable: true });
      const nftId = mint.nftId as string;

      // Transfer to the player first — the real-world relic-growth scenario is
      // the issuer mutating an NFT the PLAYER holds, not one it still holds.
      const offer = await transport.nftCreateSellOffer(issuer.seed, nftId, '0', player.address);
      await transport.nftAcceptSellOffer(player.seed, offer.offerIndex as string);

      const modify = await transport.nftModify(issuer.seed, nftId, URI_V2, player.address);
      expect(modify).toMatchObject({ ok: true, code: 'tesSUCCESS' });

      const playerNfts = await transport.accountNfts(player.address);
      expect(playerNfts).toHaveLength(1);
      expect(playerNfts[0].nftId).toBe(nftId); // identity preserved
      expect(playerNfts[0].uri).toBe(URI_V2); // uri advanced
      expect(playerNfts[0].issuer).toBe(issuer.address);
      expect(playerNfts[0].flags).toBe(24); // flags untouched by modify
    });

    it('NFTokenModify by a NON-issuer (even the current holder) fails tecNO_PERMISSION and leaves the uri untouched', async () => {
      const transport = new DryRunTransport();
      const issuer = await transport.fundWallet();
      const player = await transport.fundWallet();

      const mint = await transport.nftMint(issuer.seed, URI_V1, TAXON, { transferable: true, mutable: true });
      const nftId = mint.nftId as string;

      const result = await transport.nftModify(player.seed, nftId, URI_V2, issuer.address);
      expect(result).toEqual(expect.objectContaining({ ok: false, code: 'tecNO_PERMISSION', hash: '' }));

      const owned = await transport.accountNfts(issuer.address);
      expect(owned[0].uri).toBe(URI_V1); // unchanged
    });

    it('NFTokenModify on a non-mutable NFT fails tecNO_PERMISSION even for the issuer', async () => {
      const transport = new DryRunTransport();
      const issuer = await transport.fundWallet();

      const mint = await transport.nftMint(issuer.seed, URI_V1, TAXON, { transferable: true, mutable: false });
      const nftId = mint.nftId as string;

      const result = await transport.nftModify(issuer.seed, nftId, URI_V2, issuer.address);
      expect(result).toEqual(expect.objectContaining({ ok: false, code: 'tecNO_PERMISSION', hash: '' }));

      const owned = await transport.accountNfts(issuer.address);
      expect(owned[0].uri).toBe(URI_V1); // unchanged
      expect(owned[0].flags).toBe(8); // transferable only — never minted mutable
    });

    it('NFTokenBurn removes the NFT (the named compensator for a bad mint); a non-holder cannot burn it first', async () => {
      const transport = new DryRunTransport();
      const issuer = await transport.fundWallet();
      const rando = await transport.fundWallet();

      const mint = await transport.nftMint(issuer.seed, URI_V1, TAXON, { transferable: true, mutable: true });
      const nftId = mint.nftId as string;

      const deniedBurn = await transport.nftBurn(rando.seed, nftId);
      expect(deniedBurn).toEqual(expect.objectContaining({ ok: false, code: 'tecNO_PERMISSION', hash: '' }));
      expect(await transport.accountNfts(issuer.address)).toHaveLength(1);

      const burn = await transport.nftBurn(issuer.seed, nftId);
      expect(burn).toMatchObject({ ok: true, code: 'tesSUCCESS' });
      expect(await transport.accountNfts(issuer.address)).toEqual([]);

      // Burning again now fails "no such NFT" — the compensator is not a
      // silent no-op success on replay.
      const again = await transport.nftBurn(issuer.seed, nftId);
      expect(again).toEqual(expect.objectContaining({ ok: false, code: 'tecNO_ENTRY' }));
    });

    it('accountNfts reports owned NFTs in mint order, stable across an intervening transfer', async () => {
      const transport = new DryRunTransport();
      const issuer = await transport.fundWallet();
      const player = await transport.fundWallet();

      const first = await transport.nftMint(issuer.seed, 'uri-1', TAXON, { transferable: true, mutable: true });
      const second = await transport.nftMint(issuer.seed, 'uri-2', TAXON, { transferable: true, mutable: true });
      const third = await transport.nftMint(issuer.seed, 'uri-3', TAXON, { transferable: true, mutable: true });

      // Transfer the FIRST-minted item away — the remaining two must still
      // report back in their original mint order.
      const offer = await transport.nftCreateSellOffer(issuer.seed, first.nftId as string, '0', player.address);
      await transport.nftAcceptSellOffer(player.seed, offer.offerIndex as string);

      const remaining = await transport.accountNfts(issuer.address);
      expect(remaining.map((n) => n.nftId)).toEqual([second.nftId, third.nftId]);
    });

    describe('determinism', () => {
      it('two fresh transports yield identical nftIds/offerIndexes/hashes for the same NFT call sequence', async () => {
        const runSequence = async () => {
          const transport = new DryRunTransport();
          const issuer = await transport.fundWallet();
          const player = await transport.fundWallet();

          const mint = await transport.nftMint(issuer.seed, URI_V1, TAXON, { transferable: true, mutable: true });
          const offer = await transport.nftCreateSellOffer(issuer.seed, mint.nftId as string, '0', player.address);
          const accept = await transport.nftAcceptSellOffer(player.seed, offer.offerIndex as string);
          const modify = await transport.nftModify(issuer.seed, mint.nftId as string, URI_V2, player.address);
          return { issuer, player, mint, offer, accept, modify };
        };

        const runA = await runSequence();
        const runB = await runSequence();

        expect(runA.issuer).toEqual(runB.issuer);
        expect(runA.player).toEqual(runB.player);
        expect(runA.mint.nftId).toBe(runB.mint.nftId);
        expect(runA.mint.hash).toBe(runB.mint.hash);
        expect(runA.offer.offerIndex).toBe(runB.offer.offerIndex);
        expect(runA.offer.hash).toBe(runB.offer.hash);
        expect(runA.accept.hash).toBe(runB.accept.hash);
        expect(runA.modify.hash).toBe(runB.modify.hash);

        // Every id/hash produced is unique within a single run — no blank,
        // no accidental collision between the NFTokenID/offerIndex/tx-hash
        // sequences (each uses its own counter + prefix).
        const idsA = [
          runA.mint.nftId as string,
          runA.offer.offerIndex as string,
          runA.mint.hash,
          runA.offer.hash,
          runA.accept.hash,
          runA.modify.hash,
        ];
        expect(new Set(idsA).size).toBe(idsA.length);
        expect(idsA.every((v) => v.length > 0)).toBe(true);
      });
    });
  });
});
