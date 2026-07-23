import { describe, expect, it } from 'vitest';
import type { NFTokenRef, ReconcileInput, SettlementRecord } from '../contracts.js';
import { buildItemNFTUri, buildSettlementMemo } from '../contracts.js';
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

// ── NFT ownership check fixtures (P4) ────────────────────────────────────

// A fixed relicTier for URI construction in fixtures — NFTokenRef itself has
// no relicTier field (that lives on the equipment-side UniqueItemSnapshot);
// buildItemNFTUri just needs SOME deterministic tier to embed in the URI.
const RELIC_TIER = 0;

function makeNftRef(overrides: Partial<NFTokenRef> = {}): NFTokenRef {
  const relicVersion = overrides.relicVersion ?? 1;
  const gameItemId = overrides.gameItemId ?? 'cutlass';
  return {
    gameItemId,
    nftId: overrides.nftId ?? 'NFT_CUTLASS_1',
    uri: overrides.uri ?? buildItemNFTUri(GAME_ID, gameItemId, relicVersion, RELIC_TIER),
    relicVersion,
    taxon: overrides.taxon ?? 0,
    mutable: overrides.mutable ?? true,
    mintTxid: overrides.mintTxid ?? 'MINT_TX_1',
    status: overrides.status ?? 'minted',
  };
}

/** An input with every fungible field EMPTY — an NFT-only reconcile, where
 *  `resources` is vacuously [] and `memoOk` is true (no settlements), so the
 *  verdict is driven entirely by the NFT checks. */
function nftOnlyInput(overrides: Partial<ReconcileInput> = {}): ReconcileInput {
  return {
    runId: RUN_ID,
    seed: 42,
    mintedInitial: {},
    ledgerBalances: {},
    lastSettled: {},
    settlements: [],
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

  it('passes external memo integrity when only ONE of a record\'s txids carries the memo (the real escrow shape)', () => {
    // An escrow settlement produces EscrowCreate (carries the memo) + EscrowFinish
    // (carries NONE). Attestation requires ONE memo-bearing txid, not all of them.
    // (LIVE-FINDING-2, wave-2: caught by the live testnet replay, not the dry-run suite.)
    const record = makeSettlement({ txids: ['ESCROW_CREATE', 'ESCROW_FINISH'] });
    const report = reconcile(
      baseInput({
        settlements: [record],
        // ESCROW_FINISH carries no memo — absent from the map, skipped not failed.
        onchainMemos: { ESCROW_CREATE: record.memo },
      }),
    );
    expect(report.onchainMemoOk).toBe(true);
    expect(report.memoOk).toBe(true);
    expect(report.passed).toBe(true);
  });

  it('fails external memo integrity when NO txid in a settlement carries the expected memo', () => {
    const record = makeSettlement({ txids: ['TX_A', 'TX_B'] });
    const report = reconcile(baseInput({ settlements: [record], onchainMemos: {} }));
    expect(report.onchainMemoOk).toBe(false);
    expect(report.memoOk).toBe(false);
    expect(report.passed).toBe(false);
    expect(report.notes.some((n) => n.includes('no txid carried the expected'))).toBe(true);
  });

  it("looks up ledgerBalances by the adapter's minted codes when tokenMap is supplied", () => {
    // The adapter mints under assignTokenCode's valid 3-char codes (coin->COI);
    // reconcile must reconcile against THOSE codes, not a re-derived 4-char 'COIN'.
    const report = reconcile(
      baseInput({
        tokenMap: { coin: 'COI', potion: 'POT' },
        ledgerBalances: { COI: 75, POT: 7 },
      }),
    );
    expect(report.passed).toBe(true);
    const coin = report.resources.find((r) => r.resource === 'coin');
    expect(coin?.code).toBe('COI');
    expect(coin?.ledger).toBe(75);
    expect(coin?.balanceOk).toBe(true);
  });

  it('treats an absent ledger balance as null, not a false balance match', () => {
    const report = reconcile(baseInput({ ledgerBalances: { [POTION_CODE]: 7 } }));

    const coin = report.resources.find((r) => r.resource === 'coin');
    expect(coin?.ledger).toBeNull();
    expect(coin?.balanceOk).toBe(false);
    expect(report.passed).toBe(false);
  });
});

// Mirrors the fungible describe block's drift-detection discipline for the
// NFT unique-gear OWNERSHIP family (P4): a happy path that passes, then one
// test per way the ledger can lie about a unique item (wrong holder, stale
// URI, no on-ledger evidence at all), plus the non-regression + AND-fold
// cases that prove nftChecks is purely additive.
describe('reconcile — NFT ownership checks (P4)', () => {
  it('passes an NFT-only reconcile when the NFT is owned and its URI matches', () => {
    const ref = makeNftRef();
    const report = reconcile(
      nftOnlyInput({
        nfts: [ref],
        ledgerNfts: { [ref.nftId]: { owner: 'rPlayer', uri: ref.uri } },
      }),
    );

    expect(report.nftChecks).toHaveLength(1);
    expect(report.nftChecks?.[0]).toEqual({
      gameItemId: ref.gameItemId,
      nftId: ref.nftId,
      expectedOwner: 'rPlayer',
      ownedOnLedger: true,
      expectedUri: ref.uri,
      ledgerUri: ref.uri,
      uriOk: true,
      ok: true,
    });
    // resources is vacuously [] and memoOk is true (no settlements) — the
    // verdict here is driven entirely by the NFT check.
    expect(report.resources).toEqual([]);
    expect(report.memoOk).toBe(true);
    expect(report.passed).toBe(true);
  });

  it('fails ownedOnLedger (and passed) when the on-ledger owner does not match the player address', () => {
    const ref = makeNftRef();
    const report = reconcile(
      nftOnlyInput({
        nfts: [ref],
        ledgerNfts: { [ref.nftId]: { owner: 'rSomeoneElse', uri: ref.uri } },
      }),
    );

    const check = report.nftChecks?.[0];
    expect(check?.ownedOnLedger).toBe(false);
    expect(check?.uriOk).toBe(true); // URI still matches — only ownership is wrong
    expect(check?.ok).toBe(false);
    expect(report.passed).toBe(false);
    expect(report.notes.some((n) => n.includes(`not owned by rPlayer`))).toBe(true);
  });

  it('fails uriOk (and passed) when the on-ledger URI is the pre-growth URI but the ref has advanced', () => {
    // The ref reflects a relic that has grown to version 2; the ledger still
    // reports the version-1 (pre-growth) URI — NFTokenModify never landed (or
    // was rolled back), so the engine's claimed growth is unconfirmed on-chain.
    const grownRef = makeNftRef({ relicVersion: 2, uri: buildItemNFTUri(GAME_ID, 'cutlass', 2, RELIC_TIER) });
    const staleUri = buildItemNFTUri(GAME_ID, 'cutlass', 1, RELIC_TIER);
    const report = reconcile(
      nftOnlyInput({
        nfts: [grownRef],
        ledgerNfts: { [grownRef.nftId]: { owner: 'rPlayer', uri: staleUri } },
      }),
    );

    const check = report.nftChecks?.[0];
    expect(check?.ownedOnLedger).toBe(true); // owner is still correct
    expect(check?.ledgerUri).toBe(staleUri);
    expect(check?.expectedUri).toBe(grownRef.uri);
    expect(check?.uriOk).toBe(false);
    expect(check?.ok).toBe(false);
    expect(report.passed).toBe(false);
    expect(report.notes.some((n) => n.includes('on-ledger URI'))).toBe(true);
  });

  it('fails every check with no vacuous pass when ledgerNfts is omitted while nfts is present', () => {
    const ref = makeNftRef();
    const report = reconcile(nftOnlyInput({ nfts: [ref] }));

    expect(report.nftChecks).toHaveLength(1);
    const check = report.nftChecks?.[0];
    expect(check?.ownedOnLedger).toBe(false);
    expect(check?.ledgerUri).toBeNull();
    expect(check?.uriOk).toBe(false);
    expect(check?.ok).toBe(false);
    expect(report.passed).toBe(false);
    expect(report.notes.some((n) => n.includes('no on-ledger NFT data supplied'))).toBe(true);
  });

  it('leaves nftChecks undefined and a fungible-only verdict exactly unchanged when nfts is absent', () => {
    // Non-regression: baseInput() carries no `nfts` field at all — this is the
    // same fully-consistent fungible run as the top-level describe block's
    // first test, asserted again here to lock the additive contract.
    const report = reconcile(baseInput());

    expect(report.nftChecks).toBeUndefined();
    expect(report.passed).toBe(true);
  });

  it('fails overall when fungible resources pass but one NFT check fails (proves the AND)', () => {
    const ref = makeNftRef();
    const report = reconcile(
      baseInput({
        nfts: [ref],
        ledgerNfts: { [ref.nftId]: { owner: 'rWrongOwner', uri: ref.uri } },
      }),
    );

    expect(report.resources.every((r) => r.balanceOk && r.conservationOk)).toBe(true);
    expect(report.memoOk).toBe(true);
    expect(report.pendingCount).toBe(0);
    expect(report.nftChecks?.[0]?.ok).toBe(false);
    expect(report.passed).toBe(false);
  });
});
