import { describe, expect, it } from 'vitest';
import type { ReconcileInput, SettlementRecord } from '../contracts.js';
import { buildSettlementMemo } from '../contracts.js';
import { deriveCurrencyCode, reconcile } from './reconcile.js';

// Mirrors escape-the-valley's tests/test_ledger_proof.py drift-detection
// suite: a happy path that passes, then one test per way the ledger can lie
// to the engine (tampered balance, broken conservation, bad memo, unsettled
// pending, an unverifiable settled record).

const GAME_ID = 'pirate';
const RUN_ID = 'run-abc';
const COIN_CODE = deriveCurrencyCode('coin');
const POTION_CODE = deriveCurrencyCode('potion');

function makeSettlement(overrides: Partial<SettlementRecord> = {}): SettlementRecord {
  const checkpoint = overrides.checkpoint ?? 1;
  const deltas = overrides.deltas ?? { coin: -25, potion: 2 };
  const memo = overrides.memo ?? buildSettlementMemo(GAME_ID, RUN_ID, checkpoint, deltas, 'settle');
  return {
    checkpoint,
    location: overrides.location ?? 'Cedar Wake',
    deltas,
    txids: overrides.txids ?? ['TX1'],
    status: overrides.status ?? 'settled',
    memo,
    timestamp: overrides.timestamp ?? '1970-01-01T00:00:00.000Z',
  };
}

function baseInput(overrides: Partial<ReconcileInput> = {}): ReconcileInput {
  return {
    runId: RUN_ID,
    seed: 42,
    mintedInitial: { coin: 100, potion: 5 },
    ledgerBalances: { [COIN_CODE]: 75, [POTION_CODE]: 7 },
    lastSettled: { coin: 75, potion: 7 },
    settlements: [makeSettlement()],
    pending: [],
    playerAddress: 'rPlayer',
    issuerAddress: 'rIssuer',
    ...overrides,
  };
}

describe('reconcile', () => {
  it('passes on a fully consistent run', () => {
    const report = reconcile(baseInput());

    expect(report.passed).toBe(true);
    expect(report.resources.every((r) => r.balanceOk && r.conservationOk)).toBe(true);
    expect(report.memoOk).toBe(true);
    expect(report.memoLocalOk).toBe(true);
    expect(report.pendingCount).toBe(0);
    expect(report.notes).toEqual(['memo: no on-chain memos supplied — external integrity NOT verified; memoOk reflects local consistency only']);
    expect(report.txids).toEqual(['TX1']);
  });

  it('fails balanceOk when the on-ledger balance is tampered (drift)', () => {
    const report = reconcile(
      baseInput({ ledgerBalances: { [COIN_CODE]: 999, [POTION_CODE]: 7 } }),
    );

    expect(report.passed).toBe(false);
    const coin = report.resources.find((r) => r.resource === 'coin');
    expect(coin?.balanceOk).toBe(false);
    expect(coin?.conservationOk).toBe(true);
    expect(report.notes.some((n) => n.includes('ledger 999'))).toBe(true);
  });

  it('fails conservationOk when minted + deltas != settled', () => {
    const report = reconcile(
      baseInput({
        lastSettled: { coin: 500, potion: 7 },
        ledgerBalances: { [COIN_CODE]: 500, [POTION_CODE]: 7 },
      }),
    );

    expect(report.passed).toBe(false);
    const coin = report.resources.find((r) => r.resource === 'coin');
    // ledger (500) matches the (tampered) engine-settled baseline, but
    // minted(100) + deltas(-25) = 75 != 500 — conservation catches what a
    // balance-only check would miss.
    expect(coin?.balanceOk).toBe(true);
    expect(coin?.conservationOk).toBe(false);
  });

  it('fails when a settlement memo does not carry the expected GAME/RUN/CHECKPOINT prefix', () => {
    const badRecord = makeSettlement({
      memo: 'ARPG|GAME:other|RUN:not-the-run|CHECKPOINT:1|DELTA:coin-25,potion+2|VERB:settle|V:1',
    });
    const report = reconcile(baseInput({ settlements: [badRecord] }));

    expect(report.passed).toBe(false);
    expect(report.memoLocalOk).toBe(false);
    expect(report.memoOk).toBe(false);
    expect(report.notes.some((n) => n.includes('local consistency'))).toBe(true);
  });

  it('fails (not passed) when a settlement is still pending, even if every resource reconciles', () => {
    const report = reconcile(
      baseInput({ pending: [makeSettlement({ checkpoint: 2, status: 'pending', txids: [] })] }),
    );

    expect(report.passed).toBe(false);
    expect(report.pendingCount).toBe(1);
    expect(report.resources.every((r) => r.balanceOk && r.conservationOk)).toBe(true);
    expect(report.notes.some((n) => n.includes('still pending'))).toBe(true);
  });

  it('fails external memo integrity for a settled record with no txids when onchainMemos is supplied (no vacuous pass)', () => {
    const noTxidRecord = makeSettlement({ txids: [] });
    const report = reconcile(baseInput({ settlements: [noTxidRecord], onchainMemos: {} }));

    expect(report.onchainMemoOk).toBe(false);
    expect(report.memoOk).toBe(false);
    expect(report.passed).toBe(false);
    expect(report.notes.some((n) => n.includes('no txids to verify on-chain'))).toBe(true);
  });

  it('leaves onchainMemoOk null and falls back to memoLocalOk when no on-chain memos are supplied', () => {
    const report = reconcile(baseInput());

    expect(report.onchainMemoOk).toBeNull();
    expect(report.memoOk).toBe(report.memoLocalOk);
  });

  it('passes external memo integrity when onchainMemos correctly resolves every txid', () => {
    const record = makeSettlement({ txids: ['TX1', 'TX2'] });
    const report = reconcile(
      baseInput({
        settlements: [record],
        onchainMemos: { TX1: record.memo, TX2: record.memo },
      }),
    );

    expect(report.onchainMemoOk).toBe(true);
    expect(report.memoOk).toBe(true);
    expect(report.passed).toBe(true);
  });

  it('fails external memo integrity when the on-chain memo bytes do not match', () => {
    const record = makeSettlement({ txids: ['TX1'] });
    const report = reconcile(
      baseInput({
        settlements: [record],
        onchainMemos: { TX1: 'ARPG|GAME:tampered|RUN:tampered|CHECKPOINT:1|DELTA:coin-25|VERB:settle|V:1' },
      }),
    );

    expect(report.onchainMemoOk).toBe(false);
    expect(report.memoOk).toBe(false);
    expect(report.passed).toBe(false);
  });

  it('treats an absent ledger balance as null, not a false balance match', () => {
    const report = reconcile(baseInput({ ledgerBalances: { [POTION_CODE]: 7 } }));

    const coin = report.resources.find((r) => r.resource === 'coin');
    expect(coin?.ledger).toBeNull();
    expect(coin?.balanceOk).toBe(false);
    expect(report.passed).toBe(false);
  });
});
