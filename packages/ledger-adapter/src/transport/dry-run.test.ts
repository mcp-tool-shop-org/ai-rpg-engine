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
});
