// Live testnet replay — the synthetic-vs-live ACCEPTANCE for @ai-rpg-engine/ledger-adapter.
//
// Drives the FULL adapter end-to-end on REAL XRPL Testnet (the run_proof analogue,
// ported from escape-the-valley's ledger_proof.py): construct a TestnetTransport,
// build the adapter, enable() (faucet + mint), settle() a spend (a REAL token
// escrow create->finish), then reconcile() against on-chain balances + memos.
//
// Why this exists: an all-dry-run suite structurally cannot catch a live-path
// regression (the synthetic-vs-live doctrine). Only a real replay proves the
// effective txns reach the ledger with the right amount + memo. Wave-2 caught
// two live-only bugs this way (invalid 4-char currency codes; the escrow
// EscrowFinish-carries-no-memo integrity gap) — both fixed; this script now
// threads the adapter's real tokenMap into reconcile and expects a strict PASS.
//
// Run:  npm run build   (from repo root — this imports the BUILT dist/)
//       node packages/ledger-adapter/scripts/live-replay.mjs
// Exit 0 iff reconcile() PASSES. Writes scripts/live-replay-receipt.json.

import { writeFileSync } from 'node:fs';
import {
  TestnetTransport,
  createLedgerAdapter,
  reconcile,
  createInitialState,
  DEFAULT_LEDGER_CONFIG,
} from '../dist/index.js';

const EXPLORER = (h) => `https://testnet.xrpl.org/transactions/${h}`;
const RUN_SEED = Date.now();
const RUN_ID = `run-live-${RUN_SEED}`;
const GAME_ID = 'live-replay';

async function fetchOnchainMemos(transport, addresses) {
  const memos = {};
  for (const addr of addresses) {
    const entries = await transport.accountTx(addr, 50);
    for (const e of entries) {
      if (e.memo !== undefined && !(e.hash in memos)) memos[e.hash] = e.memo;
    }
  }
  return memos;
}

async function main() {
  const transport = new TestnetTransport(); // default testnet wss; the guard routes it
  const config = { ...DEFAULT_LEDGER_CONFIG, mode: 'ledger' };
  const state = createInitialState(config);
  const adapter = createLedgerAdapter(transport, config, { gameId: GAME_ID, runId: RUN_ID });

  const receipt = { network: 'testnet', gameId: GAME_ID, runId: RUN_ID, stages: [] };
  const stage = (name, ok, note) => {
    receipt.stages.push({ stage: name, ok, note });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${note ? '  — ' + note : ''}`);
  };

  try {
    console.log('=== Stage 1: connect (mainnet guard enforced at construction) ===');
    await transport.connect();
    stage('1-connect', true, 'connected to testnet');

    console.log('\n=== Stage 2: enable (faucet issuer/player/merchant + mint the snapshot) ===');
    const startSnapshot = { coin: 1000, items: { potion: 3 } };
    const enableResult = await adapter.enable(state, startSnapshot);
    receipt.enableResult = enableResult;
    receipt.wallets = { issuer: state.issuerAddress, player: state.playerAddress, merchant: state.merchantAddress };
    receipt.tokenMap = { ...state.tokenMap };
    stage('2-enable', enableResult.success, enableResult.message);
    if (!enableResult.success) throw new Error('enable failed');

    console.log('\n=== Stage 3: settle a spend (coin 1000 -> 750, via a REAL token escrow) ===');
    const spendSnapshot = { coin: 750, items: { potion: 3 } };
    const settleResult = await adapter.settle(state, spendSnapshot, 1, 'live-replay-market');
    receipt.settleResult = settleResult;
    stage('3-settle', settleResult.success, settleResult.message);
    if (!settleResult.success) throw new Error('settle failed');

    console.log('\n=== Stage 4: fetch on-chain balances + memos ===');
    const playerLines = await transport.accountLines(state.playerAddress);
    const ledgerBalances = {};
    for (const line of playerLines) ledgerBalances[line.currency] = Number(line.balance);
    const onchainMemos = await fetchOnchainMemos(transport, [
      state.issuerAddress,
      state.playerAddress,
      state.merchantAddress,
    ]);
    receipt.ledgerBalances = ledgerBalances;
    receipt.txLog = (settleResult.txids ?? []).map((h) => ({ hash: h, explorer: EXPLORER(h) }));
    // Capture the first txid of each TransactionType across the run — the proof
    // artifacts for xrpl-knowledge v_proven ingest (Phase 4): Payment (the
    // issuer->player IOU mint), EscrowCreate/EscrowFinish (the token-escrow
    // settlement), TrustSet, AccountSet.
    receipt.proofTxids = {};
    for (const addr of [state.issuerAddress, state.playerAddress, state.merchantAddress]) {
      for (const e of await transport.accountTx(addr, 50)) {
        if (e.type && !receipt.proofTxids[e.type]) receipt.proofTxids[e.type] = e.hash;
      }
    }
    console.log('  proof txids by type:', receipt.proofTxids);
    stage('4-onchain', true, `${playerLines.length} trust line(s), ${Object.keys(onchainMemos).length} memo(s)`);

    console.log('\n=== Stage 5: reconcile() — the EXTERNAL VERIFIER (strict, on-chain memos) ===');
    const report = reconcile({
      runId: RUN_ID,
      seed: RUN_SEED,
      mintedInitial: { coin: startSnapshot.coin, ...startSnapshot.items },
      ledgerBalances,
      lastSettled: state.lastSettled,
      settlements: state.settlements,
      pending: state.pending,
      playerAddress: state.playerAddress,
      issuerAddress: state.issuerAddress,
      onchainMemos,
      tokenMap: state.tokenMap, // the adapter's OWN minted codes — the wave-2 fix
    });
    receipt.reconcile = report;
    for (const r of report.resources) {
      console.log(`  ${r.resource.padEnd(8)} ${r.code.padEnd(5)} minted=${r.minted} Σ=${r.sumDeltas} engine=${r.engineSettled} ledger=${r.ledger} balance=${r.balanceOk ? 'OK' : 'FAIL'} conserv=${r.conservationOk ? 'OK' : 'FAIL'}`);
    }
    console.log(`  memoOk=${report.memoOk} (local=${report.memoLocalOk} onchain=${report.onchainMemoOk})  passed=${report.passed}`);
    for (const note of report.notes) console.log(`    - ${note}`);
    stage('5-reconcile', report.passed, report.passed ? 'PASS — on-ledger balances + memos confirm the engine economy' : 'FAIL');

    receipt.passed = report.passed;
  } finally {
    await transport.disconnect();
    writeFileSync(new URL('./live-replay-receipt.json', import.meta.url), JSON.stringify(receipt, null, 2));
  }

  const pass = receipt.stages.every((s) => s.ok) && receipt.passed;
  console.log(`\n=== ${pass ? 'LIVE REPLAY PASSED' : 'LIVE REPLAY FAILED'} ===`);
  if (receipt.txLog?.length) console.log('Settlement receipts:', receipt.txLog.map((t) => t.explorer).join('  '));
  console.log('Receipt: packages/ledger-adapter/scripts/live-replay-receipt.json');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
