// Live NFT unique-gear testnet replay — the synthetic-vs-live ACCEPTANCE for
// the P2 testnet NFTTransport (the AC-001 / tecPATH_DRY lesson: NFT has
// live-only gotchas the dry-run suite structurally cannot show — the minter
// permission model, the tfMutable flag, the DynamicNFT amendment status).
//
// Unlike the P0 spike (throwaway, raw xrpl.js), this drives the SHIPPED
// `TestnetTransport` class methods — nftMint / nftCreateSellOffer /
// nftAcceptSellOffer / nftModify / nftBurn / accountNfts — so it proves the
// PACKAGE'S OWN code works live, plus the deterministic on-ledger URI scheme
// (`buildItemNFTUri`) round-trips through NFTokenModify byte-for-byte.
//
// Proves end-to-end on REAL XRPL Testnet:
//   mint(tfTransferable|tfMutable) -> account_nfts owns + lsfMutable
//   -> directed 0-value sell offer -> accept -> ownership moved issuer->player
//   -> NFTokenModify by the ISSUER on the PLAYER-owned NFT (relic growth:
//      same NFTokenID, URI advanced relic 0 -> 1) -> account_nfts confirms
//   -> NFTokenBurn compensator (mint #2 -> burn -> gone).
//
// Run:  npm run build   (from repo root — imports the built ../dist/index.js)
//       node packages/ledger-adapter/scripts/nft-live-replay.mjs
// Exit 0 iff every stage PASSES. Writes scripts/nft-live-replay-receipt.json.
//
// DO NOT RUN THIS FROM AN AGENT SESSION — it needs a live testnet faucet +
// network and burns real (if free) testnet transactions. The COORDINATOR runs
// it and captures the receipt; the live-tx compensator (NFTokenBurn, and
// delete/re-cut any downstream tag/release before publish) is coordinator-
// owned, matching pirate-live-replay.mjs's own precedent.

import { writeFileSync } from 'node:fs';
import { TestnetTransport, buildItemNFTUri, reconcile } from '../dist/index.js';

const EXPLORER = (h) => `https://testnet.xrpl.org/transactions/${h}`;
const GAME_ID = 'nft-replay';
const ITEM_ID = 'cutlass';
const TAXON = 7777;

const LSF_MUTABLE = 0x10; // 16
const LSF_TRANSFERABLE = 0x8; // 8

async function main() {
  const transport = new TestnetTransport(); // default testnet wss; the guard routes it
  const receipt = { network: 'testnet', gameId: GAME_ID, itemId: ITEM_ID, stages: [], proofTxids: {} };
  const stage = (name, ok, note) => {
    receipt.stages.push({ stage: name, ok, note });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${note ? '  — ' + note : ''}`);
    return ok;
  };
  const capture = (type, res) => {
    if (res?.hash && !receipt.proofTxids[type]) receipt.proofTxids[type] = res.hash;
    return res;
  };

  try {
    console.log('=== Stage 1: connect (mainnet guard enforced at construction) ===');
    await transport.connect();
    stage('1-connect', true, 'connected to testnet');

    console.log('\n=== Stage 2: faucet issuer + player ===');
    const issuer = await transport.fundWallet();
    const player = await transport.fundWallet();
    receipt.wallets = { issuer: issuer.address, player: player.address };
    console.log(`  issuer=${issuer.address}  player=${player.address}`);
    stage('2-fund', !!issuer.seed && !!player.seed, 'both funded');

    console.log('\n=== Stage 3: mint (tfTransferable | tfMutable) ===');
    const uriV1 = buildItemNFTUri(GAME_ID, ITEM_ID, 0, 0);
    const mint = capture('NFTokenMint', await transport.nftMint(issuer.seed, uriV1, TAXON, { transferable: true, mutable: true }));
    receipt.nftId = mint.nftId;
    receipt.uriV1 = uriV1;
    console.log(`  code=${mint.code}  nftId=${mint.nftId}  uri="${uriV1}"`);
    if (!stage('3-mint', mint.ok && !!mint.nftId, `${mint.code} ${EXPLORER(mint.hash)}`)) throw new Error('mint failed');

    console.log('\n=== Stage 4: verify issuer owns + lsfMutable on-ledger ===');
    let issuerNfts = await transport.accountNfts(issuer.address);
    const minted = issuerNfts.find((n) => n.nftId === mint.nftId);
    const mutableOk = !!minted && (minted.flags & LSF_MUTABLE) === LSF_MUTABLE;
    const transferableOk = !!minted && (minted.flags & LSF_TRANSFERABLE) === LSF_TRANSFERABLE;
    stage('4-mint-verify', mutableOk && transferableOk, `flags=${minted?.flags} mutable=${mutableOk} transferable=${transferableOk}`);

    console.log('\n=== Stage 5: directed 0-value sell offer -> accept (transfer) ===');
    const offer = capture('NFTokenCreateOffer', await transport.nftCreateSellOffer(issuer.seed, mint.nftId, '0', player.address));
    console.log(`  offer code=${offer.code}  offerIndex=${offer.offerIndex}`);
    if (!stage('5a-offer', offer.ok && !!offer.offerIndex, offer.code)) throw new Error('create offer failed');
    const accept = capture('NFTokenAcceptOffer', await transport.nftAcceptSellOffer(player.seed, offer.offerIndex));
    if (!stage('5b-accept', accept.ok, `${accept.code} ${EXPLORER(accept.hash)}`)) throw new Error('accept failed');

    console.log('\n=== Stage 6: verify transfer (player owns, issuer gone) ===');
    let playerNfts = await transport.accountNfts(player.address);
    issuerNfts = await transport.accountNfts(issuer.address);
    const playerOwns = playerNfts.some((n) => n.nftId === mint.nftId);
    const issuerGone = !issuerNfts.some((n) => n.nftId === mint.nftId);
    stage('6-transfer-verify', playerOwns && issuerGone, `playerOwns=${playerOwns} issuerGone=${issuerGone}`);

    console.log('\n=== Stage 7: relic growth — issuer NFTokenModify on player-owned NFT ===');
    const uriV2 = buildItemNFTUri(GAME_ID, ITEM_ID, 1, 1);
    receipt.uriV2 = uriV2;
    const modify = capture('NFTokenModify', await transport.nftModify(issuer.seed, mint.nftId, uriV2, player.address));
    console.log(`  modify code=${modify.code}  uri -> "${uriV2}"`);
    if (!stage('7a-modify', modify.ok, `${modify.code} ${EXPLORER(modify.hash)}`)) throw new Error('modify failed');
    playerNfts = await transport.accountNfts(player.address);
    const grown = playerNfts.find((n) => n.nftId === mint.nftId);
    const identityPreserved = !!grown && grown.nftId === mint.nftId;
    const uriAdvanced = !!grown && grown.uri === uriV2;
    stage('7b-modify-verify', identityPreserved && uriAdvanced, `sameNftId=${identityPreserved} uriNow="${grown?.uri}"`);

    console.log('\n=== Stage 8: NFTokenBurn compensator (mint #2 -> burn -> gone) ===');
    const mint2 = capture('NFTokenMint', await transport.nftMint(issuer.seed, buildItemNFTUri(GAME_ID, 'compensator-probe', 0, 0), TAXON, { transferable: true, mutable: true }));
    const burn = capture('NFTokenBurn', await transport.nftBurn(issuer.seed, mint2.nftId));
    issuerNfts = await transport.accountNfts(issuer.address);
    const burnGone = burn.ok && !issuerNfts.some((n) => n.nftId === mint2.nftId);
    stage('8-burn-compensator', burnGone, `${burn.code} nftId=${mint2.nftId}`);

    console.log('\n=== Stage 9: reconcile() — the EXTERNAL VERIFIER on live on-chain NFT ownership ===');
    // Feed the shipped pure reconcile() the engine-side NFTokenRef for the
    // grown gear + the REAL on-ledger truth (account_nfts). A PASS means the
    // ledger independently confirms the player OWNS the NFT and its on-chain
    // URI matches the relic version the engine expects — the engine can't fake
    // either. This is the P4 acceptance: the verifier proven against live data.
    const ref = {
      gameItemId: ITEM_ID, nftId: mint.nftId, uri: uriV2, relicVersion: 1,
      taxon: TAXON, mutable: true, mintTxid: mint.hash, status: 'minted',
    };
    const playerNftsNow = await transport.accountNfts(player.address);
    const ledgerNfts = {};
    for (const n of playerNftsNow) ledgerNfts[n.nftId] = { owner: player.address, uri: n.uri };
    const report = reconcile({
      runId: 'nft-live-replay', seed: 0,
      mintedInitial: {}, ledgerBalances: {}, lastSettled: {},
      settlements: [], pending: [],
      playerAddress: player.address, issuerAddress: issuer.address,
      nfts: [ref], ledgerNfts,
    });
    receipt.reconcile = report;
    const nftCheck = report.nftChecks?.[0];
    console.log(`  nftCheck: owned=${nftCheck?.ownedOnLedger} uriOk=${nftCheck?.uriOk} ok=${nftCheck?.ok} | report.passed=${report.passed}`);
    stage('9-reconcile', report.passed && nftCheck?.ok === true,
      report.passed ? 'PASS — on-ledger account_nfts confirms ownership + relic-version URI' : 'FAIL');

    receipt.passed = receipt.stages.every((s) => s.ok);
  } finally {
    await transport.disconnect();
    writeFileSync(new URL('./nft-live-replay-receipt.json', import.meta.url), JSON.stringify(receipt, null, 2));
  }

  const pass = receipt.stages.every((s) => s.ok) && receipt.passed;
  console.log(`\n=== NFT LIVE REPLAY ${pass ? 'PASSED' : 'FAILED'} ===`);
  console.log('Proof txids by type:', receipt.proofTxids);
  for (const [type, hash] of Object.entries(receipt.proofTxids)) console.log(`  ${type.padEnd(22)} ${EXPLORER(hash)}`);
  console.log('Receipt: packages/ledger-adapter/scripts/nft-live-replay-receipt.json');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(2); });
