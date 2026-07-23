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
// The chronicle is dormant in a running game (see equipment-snapshot.ts), so
// relic growth does not fire on real content — this proves the load-bearing
// claim MINT MANIFESTS ON REAL CONTENT; the growth->NFTokenModify path is
// proven separately (nft-live-replay Stage 7 + the dry-run tests).
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
} from '../dist/index.js';

const EXPLORER = (h) => `https://testnet.xrpl.org/transactions/${h}`;
const SEED = 11; // the seed the gladiator equipment-integration test uses
const GAME_ID = 'iron-colosseum'; // starter-gladiator's real manifest.id (content.ts)
const EXPECT_ITEM = 'trident-and-net'; // the armory's issued gear

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
    receipt.txLog = (settleRes.txids ?? []).map((h) => ({ hash: h, explorer: EXPLORER(h) }));
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
    const nftCheck = report.nftChecks?.find((c) => c.gameItemId === EXPECT_ITEM);
    console.log(`  nftCheck: owned=${nftCheck?.ownedOnLedger} uriOk=${nftCheck?.uriOk} ok=${nftCheck?.ok} | report.passed=${report.passed}`);
    stage('6-reconcile', report.passed && nftCheck?.ok === true,
      report.passed ? 'PASS — on-ledger account_nfts confirms the real gladiator gear is owned by the player' : 'FAIL');

    console.log('\n=== Stage 7: THE FIREWALL — the engine world is byte-identical after the NFT flow ===');
    const worldAfter = engine.serialize();
    stage('7-firewall', worldAfter === worldBefore,
      worldAfter === worldBefore ? 'byte-identical — the adapter never mutated the game world' : 'WORLD MUTATED — firewall breach');

    receipt.passed = receipt.stages.every((s) => s.ok);
  } finally {
    await transport.disconnect();
    writeFileSync(new URL('./gladiator-nft-live-replay-receipt.json', import.meta.url), JSON.stringify(receipt, null, 2));
  }

  const pass = receipt.stages.every((s) => s.ok) && receipt.passed;
  console.log(`\n=== GLADIATOR NFT LIVE REPLAY ${pass ? 'PASSED' : 'FAILED'} ===`);
  if (receipt.txLog?.length) console.log('NFT receipts:', receipt.txLog.map((t) => t.explorer).join('  '));
  console.log('Receipt: packages/ledger-adapter/scripts/gladiator-nft-live-replay-receipt.json');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
