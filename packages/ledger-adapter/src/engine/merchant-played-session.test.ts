// THE MERCHANT PLAYED-SESSION PROOF — the showcase.
//
// pirate-played-session.test.ts proves the FUNGIBLE layer on real content.
// gladiator-nft-played-session.test.ts proves the NFT layer on real content.
// This is the first proof that exercises BOTH in one session, on the one pack
// authored backwards from the ledger — where `consign` is a settlement primitive
// wearing a plot device, `audit` is the external verifier as a playable verb, and
// a lien seizure is the named NFTokenBurn compensator arriving in fiction.
//
// L0 EXTERNAL OBSERVER: every assertion drives the real shipped
// `@ai-rpg-engine/starter-merchant` `createGame()` from OUTSIDE, through the
// public seam (snapshotFromWorld / equipmentSnapshotFromWorld / settle /
// settleEquipmentNFTs / reconcile). Nothing under packages/starter-merchant/ is
// edited, and the pack has no idea this file exists — its own firewall.test.ts
// asserts it carries no reference to this package in any form.
//
// The runtime import of the starter is permitted here for the same reason the
// two sibling proofs document: this is a `*.test.ts`, the one place this
// package's determinism-firewall rule allows it. The non-test `engine/*.ts`
// modules stay type-only against core and equipment.

import { describe, expect, it } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-merchant';
import {
  getOpenObligations,
  getContractState,
  honourObligation,
  defaultObligation,
  SEIZURE_THRESHOLD,
} from '@ai-rpg-engine/starter-merchant';
import { EQUIPMENT_CATALOG_FORMULA, getItemChronicle } from '@ai-rpg-engine/equipment';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import type { LedgerAdapterConfig, LedgerAdapterState } from '../contracts.js';
import { buildItemNFTUri, buildSettlementMemo } from '../contracts.js';
import { snapshotFromWorld } from './snapshot.js';
import { equipmentSnapshotFromWorld } from './equipment-snapshot.js';
import { enableFromWorld, settleCheckpoint } from './checkpoint.js';
import { createLedgerAdapter, reconcile } from '../settle/index.js';
import { settleEquipmentNFTs, buildLedgerNfts } from '../settle/nft.js';
import { createInitialState } from '../state/index.js';
import { DryRunTransport } from '../transport/index.js';

const SEED = 71;
const PLAYER_ID = 'factor';
const GAME_ID = 'salt-road-ledger';
const RUN_ID = 'merchant-showcase-run';

const LEDGER_CONFIG: LedgerAdapterConfig = {
  mode: 'ledger',
  issuerMode: 'per-run',
  settlement: 'token-escrow',
  network: 'testnet',
};

type MerchantEngine = ReturnType<typeof createGame>;

function resolveCatalog(engine: MerchantEngine): ItemCatalog {
  return engine.formulas.get(EQUIPMENT_CATALOG_FORMULA)() as ItemCatalog;
}

/** Register with the Guild: the seal lands and checkpoint 0 is reached. */
function openTheBooks(engine: MerchantEngine): void {
  engine.submitAction('speak', { targetIds: ['assay-master-corvane'] });
  engine.submitAction('choose', { parameters: { choiceId: 'register' } });
}

/**
 * Fungible harness: state with EMPTY addresses, so `enable` faucets its own
 * issuer/player/merchant wallets and registers their seeds in the adapter's
 * internal cache.
 *
 * Presetting the addresses here — the shape the NFT harness below needs — breaks
 * the fungible path outright: `fundOrResume` calls `requireSeed(address)` for any
 * non-empty address, and the seed cache is private to the adapter instance, so a
 * caller cannot populate it. `putSeed` is an outbound sink, not an inbound
 * source. Every fungible assertion in this file failed on that before the split.
 */
async function harness(config: LedgerAdapterConfig = LEDGER_CONFIG) {
  const transport = new DryRunTransport();
  await transport.connect();
  const state = createInitialState(config);
  const adapter = createLedgerAdapter(transport, config, { gameId: GAME_ID, runId: RUN_ID });
  return { transport, state, adapter };
}

/**
 * NFT harness: explicit faucet wallets, because `settleEquipmentNFTs` takes
 * seeds per call rather than reading them from state (DECOMPOSE_BY_SECRETS).
 * Addresses MUST come from `fundWallet()` — DryRunTransport derives a signer's
 * address from its seed, so an invented address makes the directed transfer fail
 * `tecNO_PERMISSION`.
 */
async function nftHarness() {
  const transport = new DryRunTransport();
  await transport.connect();
  const issuer = await transport.fundWallet();
  const playerWallet = await transport.fundWallet();

  const state = createInitialState(LEDGER_CONFIG);
  state.issuerAddress = issuer.address;
  state.playerAddress = playerWallet.address;

  return {
    transport,
    state,
    issuer,
    playerWallet,
    deps: {
      gameId: GAME_ID,
      issuerAddress: issuer.address,
      playerAddress: playerWallet.address,
      issuerSeed: issuer.seed,
      playerSeed: playerWallet.seed,
    },
  };
}

async function balancesOf(transport: DryRunTransport, address: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const line of await transport.accountLines(address)) out[line.currency] = Number(line.balance);
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
describe('the fungible layer on real merchant content', () => {
  it('enable mints the factor’s opening books — coin plus carried goods', async () => {
    const engine = createGame(SEED);
    const { state, adapter } = await harness();

    const snapshot = snapshotFromWorld(engine.world, PLAYER_ID);
    // The authored opening position: 40 coin, a bale of flax, a ledger book.
    expect(snapshot.coin).toBe(40);
    expect(snapshot.items['bale-of-flax']).toBe(1);

    const result = await enableFromWorld(engine.world, PLAYER_ID, adapter, state);

    expect(result.success).toBe(true);
    expect(state.lastSettled.coin).toBe(40);
    expect(state.tokenMap.coin).toBeTruthy();
  });

  it('a CONSIGN settles under its own memo verb, not a generic settle', async () => {
    // The P1.5 payoff, on real content. `consign` is the one verb in the catalog
    // whose offline semantics match a settlement primitive, and the memo is now
    // where that shows up on-ledger.
    const engine = createGame(SEED);
    openTheBooks(engine);
    const { state, adapter } = await harness();
    await enableFromWorld(engine.world, PLAYER_ID, adapter, state);

    engine.submitAction('move', { targetIds: ['long-quay'] });
    engine.submitAction('move', { targetIds: ['crooked-stair'] });
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    const obligation = getOpenObligations(engine.world)[0];
    expect(obligation).toBeDefined();

    const result = await settleCheckpoint(
      engine.world, PLAYER_ID, adapter, state, 1, 'The Crooked Stair',
      { verb: 'consign' },
    );

    expect(result.success).toBe(true);
    expect(result.record?.verb).toBe('consign');
    expect(result.record?.memo).toContain('VERB:consign');
    // The flax left the factor's hands, so the FT delta is negative.
    expect(result.record?.deltas['bale-of-flax']).toBe(-1);
  });

  it('honouring the obligation settles as a distinct verb again, and pays', async () => {
    const engine = createGame(SEED);
    openTheBooks(engine);
    const { state, adapter } = await harness();
    await enableFromWorld(engine.world, PLAYER_ID, adapter, state);

    engine.submitAction('move', { targetIds: ['long-quay'] });
    engine.submitAction('move', { targetIds: ['crooked-stair'] });
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    await settleCheckpoint(engine.world, PLAYER_ID, adapter, state, 1, 'The Crooked Stair', { verb: 'consign' });

    const obligation = getContractState(engine.world).obligations[0];
    honourObligation(engine.world, obligation.id, engine.world.meta.tick);

    const result = await settleCheckpoint(
      engine.world, PLAYER_ID, adapter, state, 2, 'The Crooked Stair',
      { verb: 'settle' },
    );

    expect(result.success).toBe(true);
    // The counterparty paid: coin went UP by the obligation's value.
    expect(result.record?.deltas.coin).toBe(obligation.value);
  });

  it('a DEFAULT is a distinct on-ledger artifact from a settle', async () => {
    const engine = createGame(SEED);
    openTheBooks(engine);
    const { state, adapter } = await harness();
    await enableFromWorld(engine.world, PLAYER_ID, adapter, state);

    engine.submitAction('move', { targetIds: ['long-quay'] });
    engine.submitAction('move', { targetIds: ['crooked-stair'] });
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    await settleCheckpoint(engine.world, PLAYER_ID, adapter, state, 1, 'The Crooked Stair', { verb: 'consign' });

    const obligation = getContractState(engine.world).obligations[0];
    defaultObligation(engine.world, obligation.id, engine.world.meta.tick);

    // A default moves no tradeable value (the goods are already gone and nobody
    // paid) — it moves LIEN, which is not on the tradeable layer. So the honest
    // outcome is "nothing to settle", and that is itself worth pinning: the
    // adapter must not invent a transfer for a purely reputational event.
    const result = await settleCheckpoint(
      engine.world, PLAYER_ID, adapter, state, 2, 'The Crooked Stair',
      { verb: 'default' },
    );
    expect(result.success).toBe(true);
    expect(result.record).toBeUndefined();
    expect(result.message).toContain('No changes');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('the Warrens A/B — both settlement primitives, one set of books', () => {
  it('an escrowed sale at Saltgate and a cash sale in the Warrens settle differently but reconcile together', async () => {
    // The pack's built-in comparison of the two primitives, and the reason
    // SettleOptions.primitive is a per-call override rather than a second
    // adapter: TWO adapters would mean two states, two baselines and two
    // reconcile reports over one economy — a verifier pointed at either would be
    // structurally blind to the other half.
    const engine = createGame(SEED);
    openTheBooks(engine);
    const { transport, state, adapter } = await harness();
    await enableFromWorld(engine.world, PLAYER_ID, adapter, state);

    // Lawful market: escrowed.
    engine.submitAction('move', { targetIds: ['weighing-floor'] });
    const player = engine.world.entities[PLAYER_ID];
    player.resources.coin = 30; // a spend at the Floor
    const escrowed = await settleCheckpoint(
      engine.world, PLAYER_ID, adapter, state, 1, 'The Weighing Floor',
      { verb: 'sell', primitive: 'token-escrow' },
    );
    expect(escrowed.success).toBe(true);
    const escrowTxCount = escrowed.txids?.length ?? 0;

    // The Warrens: cash on the barrel, no escrow object at all.
    player.resources.coin = 20;
    const cash = await settleCheckpoint(
      engine.world, PLAYER_ID, adapter, state, 2, 'The Crooked Stair',
      { verb: 'sell', primitive: 'payment' },
    );
    expect(cash.success).toBe(true);

    // Materially different tx shapes: escrow is create+finish (2), a burn
    // Payment is 1. If `primitive` were still the inert config axis it was
    // before P1.5, these counts would be identical.
    expect(escrowTxCount).toBe(2);
    expect(cash.txids?.length).toBe(1);

    // ONE set of books. Both settlements are in the same state, and one
    // reconcile covers the whole economy.
    expect(state.settlements).toHaveLength(2);
    expect(state.settlements.map((s) => s.verb)).toEqual(['sell', 'sell']);

    const report = reconcile({
      runId: RUN_ID,
      seed: SEED,
      mintedInitial: { coin: 40 },
      ledgerBalances: await balancesOf(transport, state.playerAddress),
      lastSettled: state.lastSettled,
      settlements: state.settlements,
      pending: state.pending,
      tokenMap: state.tokenMap,
      playerAddress: state.playerAddress,
      issuerAddress: state.issuerAddress,
    });
    expect(report.resources.find((r) => r.resource === 'coin')?.conservationOk).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('the NFT layer — instruments, not swords', () => {
  it('the Guild Seal mints as a real NFT once the books are open', async () => {
    const engine = createGame(SEED);
    openTheBooks(engine);
    expect(engine.world.entities[PLAYER_ID].inventory).toContain('guild-seal');

    // WEAR it. equipmentSnapshotFromWorld reads
    // world.modules['equipment-core'].loadouts[playerId], and equipment-core does
    // not create a loadout until the first equip — so a factor who has never
    // equipped anything snapshots as `{ items: [] }` and nothing mints. Diegetic
    // anyway: Corvane's parting line is that a hidden mark is worth nothing.
    engine.submitAction('equip', { parameters: { itemId: 'guild-seal' } });

    const catalog = resolveCatalog(engine);
    const snapshot = equipmentSnapshotFromWorld(engine.world, PLAYER_ID, catalog);
    const seal = snapshot.items.find((i) => i.itemId === 'guild-seal');
    expect(seal).toMatchObject({ itemId: 'guild-seal', rarity: 'legendary', relicVersion: 0 });

    const { transport, state, deps } = await nftHarness();
    const result = await settleEquipmentNFTs(transport, state, snapshot, deps);

    expect(result.minted).toContain('guild-seal');
    expect(state.nfts?.['guild-seal']?.uri).toBe(buildItemNFTUri(GAME_ID, 'guild-seal', 0, 0));
  });

  it('RELIC GROWTH through RECOGNITION advances the URI — a different trigger family than the arena', async () => {
    // gladiator drives growth by kill-count. A factor never kills anything worth
    // remembering; a seal earns its name by being SEEN. The chronicle producer's
    // `recognized` path fires because Corvane shares the counting house and the
    // seal carries an `heirloom` provenance flag, so the two shipped packs
    // together exercise both halves of the growth surface.
    const engine = createGame(SEED);
    openTheBooks(engine);
    const catalog = resolveCatalog(engine);

    const { transport, state, playerWallet, deps } = await nftHarness();

    // Wear it once so a loadout exists (see the mint test above), then mint at
    // relicVersion 0 — the seal as it is the day it is issued.
    engine.submitAction('equip', { parameters: { itemId: 'guild-seal' } });
    const atIssue = equipmentSnapshotFromWorld(engine.world, PLAYER_ID, catalog);
    await settleEquipmentNFTs(transport, state, atIssue, deps);
    const nftId = state.nfts?.['guild-seal']?.nftId;
    expect(nftId).toBeTruthy();

    // Wear it in company. Each showing is a `recognized` chronicle entry; the
    // engine decides when that crosses a milestone, not this test.
    for (let i = 0; i < 4; i++) {
      engine.submitAction('equip', { parameters: { itemId: 'guild-seal' } });
      engine.submitAction('unequip', { parameters: { itemId: 'guild-seal' } });
    }
    const chronicle = getItemChronicle(engine.world)['guild-seal'] ?? [];
    expect(chronicle.filter((e) => e.event === 'recognized').length).toBeGreaterThanOrEqual(3);

    const grown = equipmentSnapshotFromWorld(engine.world, PLAYER_ID, catalog);
    const grownSeal = grown.items.find((i) => i.itemId === 'guild-seal')!;
    expect(grownSeal.relicVersion).toBe(1);
    expect(grownSeal.relicTier).toBe(1);

    // The growth reaches the ledger as a MODIFY, identity preserved.
    const growth = await settleEquipmentNFTs(transport, state, grown, deps);
    expect(growth.modified).toContain('guild-seal');
    expect(growth.minted).toEqual([]);
    expect(state.nfts?.['guild-seal']?.nftId).toBe(nftId);
    expect(state.nfts?.['guild-seal']?.uri).toBe(buildItemNFTUri(GAME_ID, 'guild-seal', 1, 1));

    // And the ledger itself agrees — read back, not trusted from state.
    const onLedger = await transport.accountNfts(playerWallet.address);
    expect(onLedger.find((n) => n.nftId === nftId)?.uri)
      .toBe(buildItemNFTUri(GAME_ID, 'guild-seal', 1, 1));
  });

  it('reconcile confirms the grown seal against account_nfts', async () => {
    const engine = createGame(SEED);
    openTheBooks(engine);
    const catalog = resolveCatalog(engine);
    const { transport, state, issuer, playerWallet, deps } = await nftHarness();

    engine.submitAction('equip', { parameters: { itemId: 'guild-seal' } });
    await settleEquipmentNFTs(transport, state, equipmentSnapshotFromWorld(engine.world, PLAYER_ID, catalog), deps);
    for (let i = 0; i < 4; i++) {
      engine.submitAction('equip', { parameters: { itemId: 'guild-seal' } });
      engine.submitAction('unequip', { parameters: { itemId: 'guild-seal' } });
    }
    await settleEquipmentNFTs(transport, state, equipmentSnapshotFromWorld(engine.world, PLAYER_ID, catalog), deps);

    const report = reconcile({
      runId: RUN_ID,
      seed: SEED,
      mintedInitial: {},
      ledgerBalances: {},
      lastSettled: {},
      settlements: [],
      pending: [],
      playerAddress: playerWallet.address,
      issuerAddress: issuer.address,
      nfts: Object.values(state.nfts ?? {}),
      // The export that closes v3.3.0's fast-follow — previously hand-rolled in
      // every consumer.
      ledgerNfts: buildLedgerNfts(await transport.accountNfts(playerWallet.address), playerWallet.address),
    });

    const check = report.nftChecks?.find((c) => c.gameItemId === 'guild-seal');
    expect(check?.expectedUri).toBe(buildItemNFTUri(GAME_ID, 'guild-seal', 1, 1));
    expect(check?.uriOk).toBe(true);
    expect(check?.ownedOnLedger).toBe(true);
    expect(report.passed).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('degraded and idempotent paths', () => {
  it('a second settle at the same position moves nothing', async () => {
    const engine = createGame(SEED);
    openTheBooks(engine);
    const { state, adapter } = await harness();
    await enableFromWorld(engine.world, PLAYER_ID, adapter, state);

    engine.world.entities[PLAYER_ID].resources.coin = 25;
    const first = await settleCheckpoint(engine.world, PLAYER_ID, adapter, state, 1, 'Saltgate', { verb: 'sell' });
    expect(first.record).toBeDefined();

    const second = await settleCheckpoint(engine.world, PLAYER_ID, adapter, state, 2, 'Saltgate', { verb: 'sell' });
    expect(second.record).toBeUndefined();
    expect(state.settlements).toHaveLength(1);
  });

  it('an unreachable ledger leaves the run playable and the settlement pending', async () => {
    const engine = createGame(SEED);
    openTheBooks(engine);
    const { transport, state, adapter } = await harness();
    await enableFromWorld(engine.world, PLAYER_ID, adapter, state);

    // Break the transport mid-session.
    transport.escrowCreate = async () => ({ ok: false, hash: '', code: 'telNETWORK', error: 'unreachable' });

    engine.world.entities[PLAYER_ID].resources.coin = 10;
    const result = await settleCheckpoint(engine.world, PLAYER_ID, adapter, state, 1, 'Saltgate', { verb: 'sell' });

    expect(result.success).toBe(false);
    expect(state.lastSettleFailed).toBe(true);
    expect(state.pending).toHaveLength(1);
    // The pending record keeps its verb, so the retry cannot flatten it.
    expect(state.pending[0].verb).toBe('sell');

    // And the GAME is unaffected — the factor can still act.
    engine.submitAction('audit');
    expect(engine.world.eventLog.some((e) => e.type === 'merchant.audit.requested')).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('THE FIREWALL on real merchant content', () => {
  it('the whole two-layer flow leaves the world byte-identical', async () => {
    // The load-bearing guard. Two engines play the SAME script; only engineA
    // additionally runs the entire outside-the-engine flow against it —
    // fungible enable/settle, NFT mint, relic growth, modify, and two
    // reconciles. If the adapter touched the world anywhere, these diverge.
    const script = (engine: MerchantEngine) => {
      openTheBooks(engine);
      engine.submitAction('appraise', { parameters: { itemId: 'guild-seal' } });
      engine.submitAction('move', { targetIds: ['long-quay'] });
      engine.submitAction('move', { targetIds: ['crooked-stair'] });
      engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
      engine.submitAction('audit');
      for (let i = 0; i < 4; i++) {
        engine.submitAction('equip', { parameters: { itemId: 'guild-seal' } });
        engine.submitAction('unequip', { parameters: { itemId: 'guild-seal' } });
      }
    };

    const engineA = createGame(SEED);
    const engineB = createGame(SEED);
    script(engineA);
    script(engineB);

    const catalog = resolveCatalog(engineA);
    const { transport, state, adapter } = await harness();

    // enable() faucets the wallets and records their addresses in `state`; the
    // NFT path then needs their SEEDS, which the adapter keeps private. So the
    // NFT half of this flow runs on its own harness — the point of the test is
    // that neither half touches the world, not that they share a wallet.
    await enableFromWorld(engineA.world, PLAYER_ID, adapter, state);
    await settleCheckpoint(engineA.world, PLAYER_ID, adapter, state, 1, 'The Crooked Stair', { verb: 'consign' });

    const nft = await nftHarness();
    await settleEquipmentNFTs(
      nft.transport, nft.state,
      equipmentSnapshotFromWorld(engineA.world, PLAYER_ID, catalog),
      nft.deps,
    );
    reconcile({
      runId: RUN_ID, seed: SEED,
      mintedInitial: { coin: 40 },
      ledgerBalances: await balancesOf(transport, state.playerAddress),
      lastSettled: state.lastSettled,
      settlements: state.settlements,
      pending: state.pending,
      tokenMap: state.tokenMap,
      playerAddress: state.playerAddress,
      issuerAddress: state.issuerAddress,
      nfts: Object.values(nft.state.nfts ?? {}),
      ledgerNfts: buildLedgerNfts(await nft.transport.accountNfts(nft.playerWallet.address), nft.playerWallet.address),
    });

    expect(engineA.serialize()).toBe(engineB.serialize());
  });

  it('the memo the engine records is the memo reconcile predicts, verb included', async () => {
    // Post-P1.5 the verifier matches the FULL memo, so this is a real assertion
    // rather than a prefix that stopped before the interesting part.
    const engine = createGame(SEED);
    openTheBooks(engine);
    const { transport, state, adapter } = await harness();
    await enableFromWorld(engine.world, PLAYER_ID, adapter, state);

    engine.world.entities[PLAYER_ID].resources.coin = 28;
    const result = await settleCheckpoint(engine.world, PLAYER_ID, adapter, state, 1, 'Saltgate', { verb: 'sell' });
    const record = result.record!;

    expect(record.memo).toBe(
      buildSettlementMemo(GAME_ID, RUN_ID, 1, record.deltas, 'sell'),
    );

    const onchain = Object.fromEntries(record.txids.map((t) => [t, record.memo]));
    const report = reconcile({
      runId: RUN_ID, seed: SEED,
      mintedInitial: { coin: 40 },
      ledgerBalances: await balancesOf(transport, state.playerAddress),
      lastSettled: state.lastSettled,
      settlements: state.settlements,
      pending: state.pending,
      tokenMap: state.tokenMap,
      onchainMemos: onchain,
    });
    expect(report.memoOk).toBe(true);
    expect(report.onchainMemoOk).toBe(true);
  });

  it('SEIZURE is the burn compensator arriving in fiction', async () => {
    // At lien 70 the Guild takes a consigned asset. The pack does this as a game
    // mechanic with no knowledge of ledgers; a driver hearing
    // `merchant.instrument.seized` is what turns it into an NFTokenBurn. This
    // pins the game half — that the event fires from real play with a real
    // itemId a driver could act on.
    const engine = createGame(SEED);
    openTheBooks(engine);
    engine.submitAction('move', { targetIds: ['long-quay'] });
    engine.submitAction('move', { targetIds: ['crooked-stair'] });
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });

    engine.world.entities[PLAYER_ID].resources.lien = SEIZURE_THRESHOLD;
    engine.submitAction('move', { targetIds: ['long-quay'] });

    const seized = engine.world.eventLog.filter((e) => e.type === 'merchant.instrument.seized');
    expect(seized).toHaveLength(1);
    expect(seized[0].payload.itemId).toBe('bale-of-flax');
  });
});
