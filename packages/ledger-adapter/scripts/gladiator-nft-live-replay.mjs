// THE GLADIATOR NFT PLAYED-SESSION LIVE REPLAY — P5's load-bearing acceptance.
//
// Proves the NFT unique-gear layer manifests in a REAL shipped game on LIVE
// XRPL Testnet. Unlike nft-live-replay.mjs (synthetic gear, raw transport
// exercise), this drives @ai-rpg-engine/starter-gladiator's actual createGame()
// engine from OUTSIDE via the public seam (L0 external observer — nothing under
// packages/starter-gladiator/ is edited): the player equips the shipped
// `trident-and-net`, the adapter snapshots that UNIQUE gear
// (equipmentSnapshotFromWorld), mints it as an NFT to the player at a
// checkpoint (settleEquipmentNFTs), and the shipped reconcile() confirms
// ownership against on-ledger account_nfts.
//
// RELIC GROWTH IS NOW LIVE ON REAL CONTENT (stages 8-10, the relic-chronicle
// cycle's P4). Through v3.3 the chronicle was dormant in a running game, so
// this script could only prove MINT MANIFESTS and the growth->NFTokenModify
// path had to be shown separately against synthetic gear (nft-live-replay
// Stage 7) or an injected chronicle. starter-gladiator now wires
// item-chronicle-core, so the gladiator EARNS relic growth by fighting: three
// real arena kills cross DEFAULT_WEAPON_MILESTONES' kill-count 3, relicVersion
// advances 0 -> 1, and a second settle fires a real NFTokenModify that advances
// the on-ledger URI while preserving the NFTokenID. That is the loop the NFT
// unique-gear slice shipped but could not exercise.
//
// THE FIREWALL, on real content, live: the engine's serialized world is
// byte-identical before and after the entire NFT snapshot+settle+reconcile
// flow — the adapter reads the world and writes only its OWN state, never the
// game's.
//
// Run:  npm run build   (from repo root — starter-gladiator AND ledger-adapter
//                          must BOTH build; this imports BOTH built dist/s)
//       node packages/ledger-adapter/scripts/gladiator-nft-live-replay.mjs
// Exit 0 iff every stage PASSES. Writes scripts/gladiator-nft-live-replay-receipt.json.
//
// DO NOT RUN THIS FROM AN AGENT SESSION — live testnet faucet + network. The
// COORDINATOR runs it and captures the receipt (matching pirate-live-replay's
// precedent); the live-tx compensator (NFTokenBurn) is coordinator-owned.

import { writeFileSync } from 'node:fs';
import { createGame } from '@ai-rpg-engine/starter-gladiator';
import { EQUIPMENT_CATALOG_FORMULA } from '@ai-rpg-engine/equipment';
import {
  TestnetTransport,
  equipmentSnapshotFromWorld,
  settleEquipmentNFTs,
  reconcile,
  createInitialState,
  DEFAULT_LEDGER_CONFIG,
  formatReconcileReport,
  stampLedgerReceipt,
  LEDGER_ADAPTER_VERSION,
  txExplorerUrl,
} from '../dist/index.js';

const NETWORK = 'testnet';
const explorer = (h) => txExplorerUrl(NETWORK, h) ?? h;
const SEED = 11; // the seed the gladiator equipment-integration test uses
const GAME_ID = 'iron-colosseum'; // starter-gladiator's real manifest.id (content.ts)
const EXPECT_ITEM = 'trident-and-net'; // the armory's issued gear

/** The three combatants the shipped pack places on `arena-floor`. */
const ARENA_FOES = ['war-beast', 'arena-champion', 'arena-overlord'];

/**
 * Swing until the target drops, topping up stamina as scaffolding so attrition
 * never gates on the resource economy (the device starter-gladiator's own
 * quests.test.ts / relic-played-session.test.ts both use). The kill itself is a
 * real combat.entity.defeated off the dispatcher — nothing here writes combat
 * or chronicle state directly.
 */
function killByAttrition(engine, targetId, maxSwings = 400) {
  for (let i = 0; i < maxSwings; i++) {
    if ((engine.world.entities[targetId]?.resources.hp ?? 0) <= 0) return;
    engine.submitAction('attack', { targetIds: [targetId] });
    const hero = engine.world.entities[engine.world.playerId];
    if (hero) hero.resources.stamina = 20;
  }
  throw new Error(`${targetId} still standing after ${maxSwings} swings`);
}

async function main() {
  const transport = new TestnetTransport();
  const receipt = { network: 'testnet', gameId: GAME_ID, seed: SEED, stages: [], proofTxids: {} };
  const stage = (name, ok, note) => {
    receipt.stages.push({ stage: name, ok, note });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${note ? '  — ' + note : ''}`);
    return ok;
  };
  const capture = (res) => {
    for (const h of res?.txids ?? []) {
      // best-effort: the settler returns txids in call order (mint, offer, accept)
    }
    return res;
  };

  try {
    console.log('=== Stage 1: connect (mainnet guard enforced at construction) ===');
    await transport.connect();
    stage('1-connect', true, 'connected to testnet');

    console.log('\n=== Stage 2: real gladiator createGame() + equip the shipped trident ===');
    const engine = createGame(SEED);
    const playerId = engine.world.playerId;
    const carried = engine.world.entities[playerId]?.inventory ?? [];
    if (!carried.includes(EXPECT_ITEM)) throw new Error(`player does not carry ${EXPECT_ITEM}: ${JSON.stringify(carried)}`);
    engine.submitAction('equip'); // single carried equippable → auto-resolves
    stage('2-play', true, `equipped ${EXPECT_ITEM}`);

    // Serialize the world NOW — the firewall baseline (nothing NFT has touched it yet).
    const worldBefore = engine.serialize();

    console.log('\n=== Stage 3: snapshot the player’s UNIQUE equipment (the NFT read path) ===');
    const catalog = engine.formulas.get(EQUIPMENT_CATALOG_FORMULA)();
    const snapshot = equipmentSnapshotFromWorld(engine.world, playerId, catalog);
    receipt.snapshot = snapshot;
    const trident = snapshot.items.find((i) => i.itemId === EXPECT_ITEM);
    stage('3-snapshot', !!trident && trident.equipped, `${snapshot.items.length} unique item(s); trident relicVersion=${trident?.relicVersion}`);

    console.log('\n=== Stage 4: faucet issuer + player, mint the unique gear as an NFT (settle) ===');
    const issuer = await transport.fundWallet();
    const player = await transport.fundWallet();
    const state = createInitialState({ ...DEFAULT_LEDGER_CONFIG, mode: 'ledger' });
    state.issuerAddress = issuer.address;
    state.playerAddress = player.address;
    receipt.wallets = { issuer: issuer.address, player: player.address };
    const settleRes = capture(await settleEquipmentNFTs(transport, state, snapshot, {
      gameId: GAME_ID,
      issuerAddress: issuer.address,
      playerAddress: player.address,
      issuerSeed: issuer.seed,
      playerSeed: player.seed,
    }));
    receipt.settle = settleRes;
    receipt.nfts = state.nfts;
    receipt.txLog = (settleRes.txids ?? []).map((h) => ({ hash: h, explorer: explorer(h) }));
    for (const h of settleRes.txids ?? []) if (!receipt.proofTxids.mint) receipt.proofTxids.mint = h;
    const ref = state.nfts?.[EXPECT_ITEM];
    stage('4-settle', settleRes.success && settleRes.minted.includes(EXPECT_ITEM) && ref?.status === 'minted',
      `${settleRes.message} nftId=${ref?.nftId}`);
    if (!ref) throw new Error('no NFTokenRef minted for the trident');

    console.log('\n=== Stage 5: verify ownership on-ledger (account_nfts) ===');
    const playerNfts = await transport.accountNfts(player.address);
    const owned = playerNfts.find((n) => n.nftId === ref.nftId);
    stage('5-ownership', !!owned, `player owns ${playerNfts.length} NFT(s); trident uri="${owned?.uri}"`);

    console.log('\n=== Stage 6: reconcile() — the EXTERNAL VERIFIER against live account_nfts ===');
    const ledgerNfts = {};
    for (const n of playerNfts) ledgerNfts[n.nftId] = { owner: player.address, uri: n.uri };
    const report = reconcile({
      runId: 'gladiator-nft-live', seed: SEED,
      mintedInitial: {}, ledgerBalances: {}, lastSettled: {},
      settlements: [], pending: [],
      playerAddress: player.address, issuerAddress: issuer.address,
      nfts: Object.values(state.nfts), ledgerNfts,
    });
    receipt.reconcile = report;
    const formatted = formatReconcileReport(report, NETWORK);
    console.log(formatted.message);
    const nftCheck = report.nftChecks?.find((c) => c.gameItemId === EXPECT_ITEM);
    console.log(`  nftCheck: owned=${nftCheck?.ownedOnLedger} uriOk=${nftCheck?.uriOk} ok=${nftCheck?.ok} | report.passed=${report.passed}`);
    stage('6-reconcile', report.passed && nftCheck?.ok === true,
      report.passed ? 'PASS — on-ledger account_nfts confirms the real gladiator gear is owned by the player' : 'FAIL');

    console.log('\n=== Stage 7: THE FIREWALL — the engine world is byte-identical after the NFT flow ===');
    const worldAfter = engine.serialize();
    stage('7-firewall', worldAfter === worldBefore,
      worldAfter === worldBefore ? 'byte-identical — the adapter never mutated the game world' : 'WORLD MUTATED — firewall breach');

    // ── RELIC GROWTH ON REAL CONTENT (the relic-chronicle cycle's P4) ────────
    console.log('\n=== Stage 8: EARN the growth — three real arena kills with the trident ===');
    engine.submitAction('move', { targetIds: ['armory'] });
    engine.submitAction('move', { targetIds: ['patron-gallery'] });
    engine.submitAction('move', { targetIds: ['arena-floor'] });
    for (const foe of ARENA_FOES) killByAttrition(engine, foe);

    const grownSnapshot = equipmentSnapshotFromWorld(engine.world, playerId, catalog);
    const grownTrident = grownSnapshot.items.find((i) => i.itemId === EXPECT_ITEM);
    receipt.grownSnapshot = grownSnapshot;
    // The ENGINE decided this, not the script: item-chronicle-core recorded three
    // real `used-in-kill` entries and evaluateRelicGrowth crossed kill-count 3.
    stage('8-earn-growth', grownTrident?.relicVersion === 1 && grownTrident?.relicTier === 1,
      `relicVersion ${trident?.relicVersion} -> ${grownTrident?.relicVersion}, tier ${grownTrident?.relicTier}`);

    console.log('\n=== Stage 9: NFTokenModify — the on-ledger URI advances, NFTokenID preserved ===');
    // The firewall baseline for the GROWTH half: the world as the arena left it,
    // before the adapter reads the chronicle summary namespace or modifies
    // anything on-chain. Stage 7 proved the mint path leaves the world alone;
    // stage 11 proves the same for modify, which reads one namespace more.
    const worldBeforeGrowth = engine.serialize();
    const uriBefore = state.nfts?.[EXPECT_ITEM]?.uri;
    const nftIdBefore = state.nfts?.[EXPECT_ITEM]?.nftId;
    const growthRes = capture(await settleEquipmentNFTs(transport, state, grownSnapshot, {
      gameId: GAME_ID,
      issuerAddress: issuer.address,
      playerAddress: player.address,
      issuerSeed: issuer.seed,
      playerSeed: player.seed,
    }));
    receipt.growthSettle = growthRes;
    receipt.nftsAfterGrowth = state.nfts;
    for (const h of growthRes.txids ?? []) {
      receipt.txLog.push({ hash: h, explorer: explorer(h) });
      if (!receipt.proofTxids.modify) receipt.proofTxids.modify = h;
    }
    const refAfter = state.nfts?.[EXPECT_ITEM];
    const identityHeld = refAfter?.nftId === nftIdBefore;
    const uriAdvanced = refAfter?.uri !== uriBefore;
    stage('9-modify',
      growthRes.success && growthRes.modified.includes(EXPECT_ITEM) && growthRes.minted.length === 0
        && identityHeld && uriAdvanced,
      `modified=[${growthRes.modified}] minted=[${growthRes.minted}] uri "${uriBefore}" -> "${refAfter?.uri}" nftId ${identityHeld ? 'PRESERVED' : 'CHANGED — identity lost'}`);

    console.log('\n=== Stage 10: the LEDGER confirms the grown URI (account_nfts + reconcile) ===');
    const nftsAfterGrowth = await transport.accountNfts(player.address);
    const grownOnLedger = nftsAfterGrowth.find((n) => n.nftId === refAfter?.nftId);
    const ledgerNftsAfter = {};
    for (const n of nftsAfterGrowth) ledgerNftsAfter[n.nftId] = { owner: player.address, uri: n.uri };
    const growthReport = reconcile({
      runId: 'gladiator-relic-growth-live', seed: SEED,
      mintedInitial: {}, ledgerBalances: {}, lastSettled: {},
      settlements: [], pending: [],
      playerAddress: player.address, issuerAddress: issuer.address,
      nfts: Object.values(state.nfts), ledgerNfts: ledgerNftsAfter,
    });
    receipt.growthReconcile = growthReport;
    const growthFormatted = formatReconcileReport(growthReport, NETWORK);
    console.log(growthFormatted.message);
    const growthCheck = growthReport.nftChecks?.find((c) => c.gameItemId === EXPECT_ITEM);
    console.log(`  on-ledger uri="${grownOnLedger?.uri}" | expected="${growthCheck?.expectedUri}" uriOk=${growthCheck?.uriOk} passed=${growthReport.passed}`);
    stage('10-verify-growth', growthReport.passed && growthCheck?.uriOk === true && growthCheck?.ownedOnLedger === true,
      growthReport.passed
        ? 'PASS — the chain agrees the trident grew, and the player still owns it'
        : 'FAIL');

    console.log('\n=== Stage 11: THE FIREWALL, around the MODIFY path ===');
    const worldAfterGrowth = engine.serialize();
    stage('11-firewall-growth', worldAfterGrowth === worldBeforeGrowth,
      worldAfterGrowth === worldBeforeGrowth
        ? 'byte-identical — reading the chronicle summary + firing NFTokenModify mutated nothing in the game world'
        : 'WORLD MUTATED — firewall breach on the growth path');

    receipt.passed = receipt.stages.every((s) => s.ok);
  } finally {
    await transport.disconnect();
    writeFileSync(new URL('./gladiator-nft-live-replay-receipt.json', import.meta.url), JSON.stringify({
      ...receipt,
      ...stampLedgerReceipt({
        version: LEDGER_ADAPTER_VERSION,
        network: receipt.network,
        nft: receipt.settle,
        reconcile: [receipt.reconcile, receipt.growthReconcile].filter(Boolean),
      }),
    }, null, 2));
  }

  const pass = receipt.stages.every((s) => s.ok) && receipt.passed;
  console.log(`\n=== GLADIATOR NFT LIVE REPLAY ${pass ? 'PASSED' : 'FAILED'} ===`);
  if (receipt.txLog?.length) console.log('NFT receipts:', receipt.txLog.map((t) => t.explorer).join('  '));
  console.log('Receipt: packages/ledger-adapter/scripts/gladiator-nft-live-replay-receipt.json');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
