// THE MERCHANT LIVE REPLAY — the showcase, on live XRPL Testnet.
//
// Drives the real shipped @ai-rpg-engine/starter-merchant game from OUTSIDE (L0
// external observer — nothing under packages/starter-merchant/ is edited) and
// settles BOTH ledger layers in ONE session:
//
//   fungible : coin -> IOU, goods -> FT, a `consign` settled under its own memo
//              verb, and the Warrens A/B (escrow at the Floor vs a direct
//              Payment in the Warrens) against ONE set of books
//   NFT      : the Guild Seal minted as an XLS-20 NFToken, then relic growth
//              through RECOGNITION advancing its URI via XLS-46 NFTokenModify
//
// The sibling replays each prove one layer on one pack: pirate-live-replay.mjs
// (fungible) and gladiator-nft-live-replay.mjs (NFT). This is the first that
// proves both together, on the pack authored backwards from the ledger.
//
// Run:  npm run build   (from repo root — starter-merchant AND ledger-adapter
//                          must BOTH build; this imports BOTH built dist/s)
//       node packages/ledger-adapter/scripts/merchant-live-replay.mjs
// Exit 0 iff every stage PASSES. Writes scripts/merchant-live-replay-receipt.json.

import { writeFileSync } from 'node:fs';
import { createGame } from '@ai-rpg-engine/starter-merchant';
import { EQUIPMENT_CATALOG_FORMULA, getItemChronicle } from '@ai-rpg-engine/equipment';
import {
  TestnetTransport,
  snapshotFromWorld,
  equipmentSnapshotFromWorld,
  enableFromWorld,
  settleCheckpoint,
  createLedgerAdapter,
  settleEquipmentNFTs,
  buildLedgerNfts,
  reconcile,
  createInitialState,
  buildItemNFTUri,
  DEFAULT_LEDGER_CONFIG,
} from '../dist/index.js';

const EXPLORER = (h) => `https://testnet.xrpl.org/transactions/${h}`;
const SEED = 71;
const PLAYER_ID = 'factor';
const GAME_ID = 'salt-road-ledger';
const RUN_ID = 'merchant-live-replay';
const SEAL = 'guild-seal';

const LEDGER_CONFIG = { ...DEFAULT_LEDGER_CONFIG, mode: 'ledger' };

/** Register with the Guild — the seal lands, checkpoint 0 is reached. */
function openTheBooks(engine) {
  engine.submitAction('speak', { targetIds: ['assay-master-corvane'] });
  engine.submitAction('choose', { parameters: { choiceId: 'register' } });
}

async function main() {
  const transport = new TestnetTransport();
  const receipt = { network: 'testnet', gameId: GAME_ID, runId: RUN_ID, seed: SEED, stages: [], proofTxids: {}, txLog: [] };
  const stage = (name, ok, note) => {
    receipt.stages.push({ stage: name, ok, note });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${note ? '  — ' + note : ''}`);
    return ok;
  };
  const capture = (res, label) => {
    for (const h of res?.txids ?? []) {
      receipt.txLog.push({ hash: h, explorer: EXPLORER(h), label });
      if (!receipt.proofTxids[label]) receipt.proofTxids[label] = h;
    }
    return res;
  };

  try {
    console.log('=== Stage 1: connect (mainnet guard enforced at construction) ===');
    await transport.connect();
    stage('1-connect', true, 'connected to testnet');

    console.log('\n=== Stage 2: real merchant createGame() + open the books ===');
    const engine = createGame(SEED);
    openTheBooks(engine);
    const sealed = (engine.world.entities[PLAYER_ID]?.inventory ?? []).includes(SEAL);
    stage('2-open-books', sealed && engine.world.globals['books-opened'] === true,
      `seal issued=${sealed}, merchant.books.opened=${engine.world.eventLog.filter((e) => e.type === 'merchant.books.opened').length}`);

    // Firewall baseline for the whole session.
    const worldBefore = engine.serialize();

    console.log('\n=== Stage 3: enable — mint the factor’s opening books ===');
    const adapter = createLedgerAdapter(transport, LEDGER_CONFIG, { gameId: GAME_ID, runId: RUN_ID });
    const state = createInitialState(LEDGER_CONFIG);
    const opening = snapshotFromWorld(engine.world, PLAYER_ID);
    const enableRes = await enableFromWorld(engine.world, PLAYER_ID, adapter, state);
    receipt.wallets = { issuer: state.issuerAddress, player: state.playerAddress, merchant: state.merchantAddress };
    receipt.opening = opening;
    stage('3-enable', enableRes.success, `${enableRes.message} coin=${opening.coin} goods=${Object.keys(opening.items).length}`);

    console.log('\n=== Stage 4: CONSIGN — settled under its own memo verb ===');
    engine.submitAction('move', { targetIds: ['long-quay'] });
    engine.submitAction('move', { targetIds: ['crooked-stair'] });
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    const consignRes = capture(
      await settleCheckpoint(engine.world, PLAYER_ID, adapter, state, 1, 'The Crooked Stair', { verb: 'consign' }),
      'consign',
    );
    receipt.consign = consignRes.record;
    stage('4-consign', consignRes.success && consignRes.record?.verb === 'consign' && consignRes.record?.memo.includes('VERB:consign'),
      `verb=${consignRes.record?.verb} memo="${consignRes.record?.memo}"`);

    console.log('\n=== Stage 5: the WARRENS A/B — escrow vs direct payment, one set of books ===');
    const player = engine.world.entities[PLAYER_ID];
    player.resources.coin = Math.max(0, player.resources.coin - 8);
    const escrowRes = capture(
      await settleCheckpoint(engine.world, PLAYER_ID, adapter, state, 2, 'The Weighing Floor', { verb: 'sell', primitive: 'token-escrow' }),
      'escrow-sell',
    );
    player.resources.coin = Math.max(0, player.resources.coin - 6);
    const cashRes = capture(
      await settleCheckpoint(engine.world, PLAYER_ID, adapter, state, 3, 'The Crooked Stair', { verb: 'sell', primitive: 'payment' }),
      'cash-sell',
    );
    receipt.primitiveAB = {
      escrowTxids: escrowRes.txids ?? [],
      cashTxids: cashRes.txids ?? [],
      settlements: state.settlements.length,
    };
    // Escrow is create+finish (2 tx); a direct burn Payment is 1. Identical
    // counts would mean the primitive override is still the inert config axis it
    // was before P1.5.
    stage('5-primitive-AB',
      escrowRes.success && cashRes.success && (escrowRes.txids?.length ?? 0) === 2 && (cashRes.txids?.length ?? 0) === 1,
      `escrow=${escrowRes.txids?.length} tx, payment=${cashRes.txids?.length} tx, one state with ${state.settlements.length} settlements`);

    console.log('\n=== Stage 6: reconcile the FUNGIBLE layer against live account_lines ===');
    const lines = await transport.accountLines(state.playerAddress);
    const ledgerBalances = {};
    for (const line of lines) ledgerBalances[line.currency] = Number(line.balance);
    const txEntries = await transport.accountTx(state.playerAddress, 60);
    const onchainMemos = {};
    for (const entry of txEntries) if (entry.memo) onchainMemos[entry.hash] = entry.memo;
    const ftReport = reconcile({
      runId: RUN_ID, seed: SEED,
      mintedInitial: { ...receipt.opening.items, coin: receipt.opening.coin },
      ledgerBalances,
      lastSettled: state.lastSettled,
      settlements: state.settlements,
      pending: state.pending,
      tokenMap: state.tokenMap,
      playerAddress: state.playerAddress,
      issuerAddress: state.issuerAddress,
      onchainMemos,
    });
    receipt.fungibleReconcile = ftReport;
    console.log(`  memoOk=${ftReport.memoOk} onchainMemoOk=${ftReport.onchainMemoOk} passed=${ftReport.passed}`);
    for (const r of ftReport.resources) {
      console.log(`   ${r.resource.padEnd(14)} ledger=${r.ledger} engine=${r.engineSettled} balOk=${r.balanceOk} consOk=${r.conservationOk}`);
    }
    // The FULL memo is verified post-P1.5 (deltas AND verb), not just the prefix.
    stage('6-fungible-reconcile', ftReport.passed, ftReport.passed ? 'conservation + on-chain memo verified, verb included' : `notes: ${ftReport.notes.join(' | ')}`);

    console.log('\n=== Stage 7: mint the GUILD SEAL as an XLS-20 NFT ===');
    // Wear it — equipmentSnapshotFromWorld reads the equipment-core loadout,
    // which does not exist until a first equip. (Corvane: a hidden mark is
    // worth nothing.)
    engine.submitAction('equip', { parameters: { itemId: SEAL } });
    const catalog = engine.formulas.get(EQUIPMENT_CATALOG_FORMULA)();

    // enable() faucets its own wallets and keeps their SEEDS private to the
    // adapter instance (DECOMPOSE_BY_SECRETS — `putSeed` is an outbound sink, not
    // a way back in), while settleEquipmentNFTs needs seeds per call. So the NFT
    // half faucets its own pair. The proof is that both layers settle in one
    // session against one game, not that they share a wallet.
    const nftIssuer = await transport.fundWallet();
    const nftPlayer = await transport.fundWallet();
    receipt.nftWallets = { issuer: nftIssuer.address, player: nftPlayer.address };
    const nftDeps = {
      gameId: GAME_ID,
      issuerAddress: nftIssuer.address,
      playerAddress: nftPlayer.address,
      issuerSeed: nftIssuer.seed,
      playerSeed: nftPlayer.seed,
    };

    const nftState = createInitialState(LEDGER_CONFIG);
    nftState.issuerAddress = nftIssuer.address;
    nftState.playerAddress = nftPlayer.address;

    const atIssue = equipmentSnapshotFromWorld(engine.world, PLAYER_ID, catalog);
    receipt.sealAtIssue = atIssue.items.find((i) => i.itemId === SEAL);
    const mintRes = capture(await settleEquipmentNFTs(transport, nftState, atIssue, nftDeps), 'mint');
    const ref = nftState.nfts?.[SEAL];
    stage('7-mint-seal', mintRes.success && mintRes.minted.includes(SEAL) && ref?.status === 'minted',
      `nftId=${ref?.nftId} uri="${ref?.uri}"`);
    if (!ref) throw new Error('no NFTokenRef minted for the guild seal');

    console.log('\n=== Stage 8: EARN relic growth through RECOGNITION (not kills) ===');
    // A factor's seal earns its name by being SEEN. Corvane shares the counting
    // house and the seal carries an `heirloom` provenance flag, so each showing
    // records a `recognized` chronicle entry. This is the OTHER growth-trigger
    // family from gladiator's kill-count path.
    for (let i = 0; i < 4; i++) {
      engine.submitAction('unequip', { parameters: { itemId: SEAL } });
      engine.submitAction('equip', { parameters: { itemId: SEAL } });
    }
    const chronicle = getItemChronicle(engine.world)[SEAL] ?? [];
    const recognitions = chronicle.filter((e) => e.event === 'recognized').length;
    const grown = equipmentSnapshotFromWorld(engine.world, PLAYER_ID, catalog);
    const grownSeal = grown.items.find((i) => i.itemId === SEAL);
    receipt.sealGrown = grownSeal;
    receipt.recognitions = recognitions;
    stage('8-earn-growth', (grownSeal?.relicVersion ?? 0) > (receipt.sealAtIssue?.relicVersion ?? 0),
      `${recognitions} recognition(s); relicVersion ${receipt.sealAtIssue?.relicVersion} -> ${grownSeal?.relicVersion}, tier ${grownSeal?.relicTier}`);

    console.log('\n=== Stage 9: NFTokenModify — the URI advances, NFTokenID preserved ===');
    const uriBefore = ref.uri;
    const nftIdBefore = ref.nftId;
    const growthRes = capture(await settleEquipmentNFTs(transport, nftState, grown, nftDeps), 'modify');
    const refAfter = nftState.nfts?.[SEAL];
    stage('9-modify',
      growthRes.success && growthRes.modified.includes(SEAL) && growthRes.minted.length === 0
        && refAfter?.nftId === nftIdBefore && refAfter?.uri !== uriBefore,
      `modified=[${growthRes.modified}] minted=[${growthRes.minted}] uri "${uriBefore}" -> "${refAfter?.uri}" nftId ${refAfter?.nftId === nftIdBefore ? 'PRESERVED' : 'CHANGED — identity lost'}`);

    console.log('\n=== Stage 10: reconcile the NFT layer against live account_nfts ===');
    const ownedNfts = await transport.accountNfts(nftPlayer.address);
    const nftReport = reconcile({
      runId: RUN_ID, seed: SEED,
      mintedInitial: {}, ledgerBalances: {}, lastSettled: {},
      settlements: [], pending: [],
      playerAddress: nftPlayer.address, issuerAddress: nftIssuer.address,
      nfts: Object.values(nftState.nfts ?? {}),
      ledgerNfts: buildLedgerNfts(ownedNfts, nftPlayer.address),
    });
    receipt.nftReconcile = nftReport;
    const check = nftReport.nftChecks?.find((c) => c.gameItemId === SEAL);
    const expectedUri = buildItemNFTUri(GAME_ID, SEAL, grownSeal.relicVersion, grownSeal.relicTier);
    console.log(`  on-ledger uri="${ownedNfts.find((n) => n.nftId === nftIdBefore)?.uri}"`);
    console.log(`  expected     ="${expectedUri}" uriOk=${check?.uriOk} owned=${check?.ownedOnLedger}`);
    stage('10-nft-reconcile', nftReport.passed && check?.uriOk === true && check?.ownedOnLedger === true,
      nftReport.passed ? 'the chain agrees the seal grew, and the factor still holds it' : `notes: ${nftReport.notes.join(' | ')}`);

    console.log('\n=== Stage 11: THE FIREWALL — the game world is byte-identical ===');
    // Every settle, mint, modify and reconcile above read the world and wrote
    // only adapter-owned state. The gameplay between stages legitimately changed
    // the world, so the baseline is re-taken at the last gameplay action: what
    // must not differ is the adapter's footprint.
    const worldAfter = engine.serialize();
    const replay = createGame(SEED);
    openTheBooks(replay);
    replay.submitAction('move', { targetIds: ['long-quay'] });
    replay.submitAction('move', { targetIds: ['crooked-stair'] });
    replay.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    const replayPlayer = replay.world.entities[PLAYER_ID];
    replayPlayer.resources.coin = Math.max(0, replayPlayer.resources.coin - 8);
    replayPlayer.resources.coin = Math.max(0, replayPlayer.resources.coin - 6);
    replay.submitAction('equip', { parameters: { itemId: SEAL } });
    for (let i = 0; i < 4; i++) {
      replay.submitAction('unequip', { parameters: { itemId: SEAL } });
      replay.submitAction('equip', { parameters: { itemId: SEAL } });
    }
    const identical = worldAfter === replay.serialize();
    stage('11-firewall', identical,
      identical
        ? 'byte-identical to an adapter-free replay of the same script — the adapter left no trace'
        : 'WORLD DIVERGED — firewall breach');
    receipt.firewallBaselineBytes = worldBefore.length;

    receipt.passed = receipt.stages.every((s) => s.ok);
  } finally {
    await transport.disconnect();
    writeFileSync(new URL('./merchant-live-replay-receipt.json', import.meta.url), JSON.stringify(receipt, null, 2));
  }

  const pass = receipt.stages.every((s) => s.ok) && receipt.passed;
  console.log(`\n=== MERCHANT LIVE REPLAY ${pass ? 'PASSED' : 'FAILED'} ===`);
  if (receipt.txLog.length) {
    console.log('Proof receipts:');
    for (const [label, hash] of Object.entries(receipt.proofTxids)) {
      console.log(`  ${label.padEnd(12)} ${EXPLORER(hash)}`);
    }
  }
  console.log('Receipt: packages/ledger-adapter/scripts/merchant-live-replay-receipt.json');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
