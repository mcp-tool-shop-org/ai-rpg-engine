// Live PIRATE testnet replay — the synthetic-vs-live ACCEPTANCE for a REAL
// shipped starter-pirate played session (Phase 5, the load-bearing proof —
// see memory/ai-rpg-engine-ledger-adapter-phase5-kickoff.md §2 item 1).
//
// live-replay.mjs proves the adapter end-to-end on REAL XRPL Testnet against
// two HARDCODED snapshots ({coin:1000,items:{potion:3}} -> {coin:750,...}).
// This script proves the SAME end-to-end path — connect -> enable -> settle
// -> reconcile -> on-chain memo verify — but the snapshots come from a REAL
// played merchant sequence run on @ai-rpg-engine/starter-pirate's actual
// createGame() engine, driven from OUTSIDE via the public engine seam
// (snapshotFromWorld / adapter.enable / adapter.settle). This is L0
// "external observer": nothing under packages/starter-pirate/ is edited —
// the game is imported and observed, exactly as a real integration would.
//
// Why this exists: an all-dry-run suite structurally cannot catch a live-path
// regression (the synthetic-vs-live doctrine), and pirate-played-session.test.ts
// (this package's engine/ dir) only proves the dry-run path on real pirate
// content. Only a real replay proves the effective txns for a REAL played
// session reach the ledger with the right amount + memo.
//
// Run:  npm run build   (from repo root — starter-pirate AND ledger-adapter
//                          must BOTH build; this imports BOTH built dist/s)
//       node packages/ledger-adapter/scripts/pirate-live-replay.mjs
// Exit 0 iff reconcile() PASSES. Writes scripts/pirate-live-replay-receipt.json.
//
// DO NOT RUN THIS FROM AN AGENT SESSION — it needs a live testnet faucet +
// network and burns real (if free) testnet transactions. The COORDINATOR
// runs this and captures the receipt; the live-tx compensator (delete/re-cut
// before any downstream publish) is coordinator-owned, matching
// live-replay.mjs's own precedent.

import { writeFileSync } from 'node:fs';
import { createGame } from '@ai-rpg-engine/starter-pirate';
import {
  TestnetTransport,
  createLedgerAdapter,
  reconcile,
  createInitialState,
  DEFAULT_LEDGER_CONFIG,
  snapshotFromWorld,
} from '../dist/index.js';

const EXPLORER = (h) => `https://testnet.xrpl.org/transactions/${h}`;
const RUN_SEED = Date.now();
const RUN_ID = `run-pirate-live-${RUN_SEED}`;
const GAME_ID = 'black-flag-requiem'; // starter-pirate's real manifest.id
const PLAYER_ID = 'captain';

// WRINKLE (verified against packages/starter-pirate/src/{setup,content}.ts,
// same as pirate-played-session.test.ts's own header): the captain spawns on
// zone 'ship-deck', which belongs to NO district — trade-core's sell/buy
// verbs resolve price via getDistrictForZone and reject 'no market here'
// off-district. One real 'move' (ship-deck IS a direct neighbor of
// port-tavern) lands the captain in district 'port-haven' before any trade.
const TRADE_ZONE = 'port-tavern';
const CHECKPOINT_LOCATION = 'Port Haven';
const SELL_ITEM = 'cutlass'; // the captain's sole starting inventory item
const BUY_ITEM = 'cannon-shell'; // GENRE_BUYABLE_STOCK.pirate.ammunition[0]

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

  // The REAL shipped pirate world — driven from OUTSIDE, exactly like a
  // player would: no game-content edits, only the public engine seam below.
  const engine = createGame(RUN_SEED);

  const receipt = { network: 'testnet', gameId: GAME_ID, runId: RUN_ID, seed: RUN_SEED, stages: [] };
  const stage = (name, ok, note) => {
    receipt.stages.push({ stage: name, ok, note });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${note ? '  — ' + note : ''}`);
  };

  try {
    console.log('=== Stage 1: connect (mainnet guard enforced at construction) ===');
    await transport.connect();
    stage('1-connect', true, 'connected to testnet');

    console.log('\n=== Stage 2: enable (faucet issuer/player/merchant + mint the STARTING snapshot) ===');
    // STARTING snapshot: read straight off the live engine BEFORE any trade
    // — the realistic "ledger mode turned on at run start" shape
    // (snapshotFromWorld never mutates `engine.store.state`).
    const startSnapshot = snapshotFromWorld(engine.store.state, PLAYER_ID);
    receipt.startSnapshot = startSnapshot;
    const enableResult = await adapter.enable(state, startSnapshot);
    receipt.enableResult = enableResult;
    receipt.wallets = { issuer: state.issuerAddress, player: state.playerAddress, merchant: state.merchantAddress };
    receipt.tokenMap = { ...state.tokenMap };
    stage('2-enable', enableResult.success, enableResult.message);
    if (!enableResult.success) throw new Error('enable failed');

    console.log('\n=== Stage 3: play a real merchant sequence on the engine ===');
    // The ship-deck/district wrinkle (see file header): move into a zone
    // with a real district before trading, using the real traversal verb.
    engine.submitAction('move', { targetIds: [TRADE_ZONE] });
    console.log(`  moved captain -> ${engine.store.state.entities[PLAYER_ID]?.zoneId}`);
    engine.submitAction('sell', { targetIds: [SELL_ITEM] });
    engine.submitAction('buy', { targetIds: [BUY_ITEM] });
    const playerAfterTrades = engine.store.state.entities[PLAYER_ID];
    console.log(`  coin ${startSnapshot.coin} -> ${playerAfterTrades?.resources.coin}  inventory=${JSON.stringify(playerAfterTrades?.inventory)}`);
    stage('3-play', playerAfterTrades !== undefined, `coin ${startSnapshot.coin} -> ${playerAfterTrades?.resources.coin}`);

    console.log('\n=== Stage 4: settle the real trade delta (a REAL token escrow) ===');
    // POST-TRADE snapshot: read the live engine again, after the trades.
    const spendSnapshot = snapshotFromWorld(engine.store.state, PLAYER_ID);
    receipt.spendSnapshot = spendSnapshot;
    const settleResult = await adapter.settle(state, spendSnapshot, 1, CHECKPOINT_LOCATION);
    receipt.settleResult = settleResult;
    stage('4-settle', settleResult.success, settleResult.message);
    if (!settleResult.success) throw new Error('settle failed');

    console.log('\n=== Stage 5: fetch on-chain balances + memos ===');
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
    // Capture the first txid of each TransactionType across the run — same
    // xrpl-knowledge v_proven proof-pack shape live-replay.mjs's own Phase 4
    // capture uses (Payment / EscrowCreate / EscrowFinish / TrustSet /
    // AccountSet), now sourced from a REAL played session instead of a
    // hardcoded snapshot pair.
    receipt.proofTxids = {};
    for (const addr of [state.issuerAddress, state.playerAddress, state.merchantAddress]) {
      for (const e of await transport.accountTx(addr, 50)) {
        if (e.type && !receipt.proofTxids[e.type]) receipt.proofTxids[e.type] = e.hash;
      }
    }
    console.log('  proof txids by type:', receipt.proofTxids);
    stage('5-onchain', true, `${playerLines.length} trust line(s), ${Object.keys(onchainMemos).length} memo(s)`);

    console.log('\n=== Stage 6: reconcile() — the EXTERNAL VERIFIER (strict, on-chain memos) ===');
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
    stage('6-reconcile', report.passed, report.passed ? 'PASS — on-ledger balances + memos confirm the real played session' : 'FAIL');

    receipt.passed = report.passed;
  } finally {
    await transport.disconnect();
    writeFileSync(new URL('./pirate-live-replay-receipt.json', import.meta.url), JSON.stringify(receipt, null, 2));
  }

  const pass = receipt.stages.every((s) => s.ok) && receipt.passed;
  console.log(`\n=== PIRATE LIVE REPLAY ${pass ? 'PASSED' : 'FAILED'} ===`);
  if (receipt.txLog?.length) console.log('Settlement receipts:', receipt.txLog.map((t) => t.explorer).join('  '));
  console.log('Receipt: packages/ledger-adapter/scripts/pirate-live-replay-receipt.json');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
