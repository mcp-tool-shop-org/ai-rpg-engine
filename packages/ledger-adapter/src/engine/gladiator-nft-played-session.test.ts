// THE GLADIATOR NFT PLAYED-SESSION PROOF — the NFT sibling of
// pirate-played-session.test.ts's Phase 5 load-bearing acceptance, adapted
// from the fungible coin/inventory layer to the NFT unique-gear layer
// (contracts.ts's "NFT UNIQUE-GEAR LAYER" section, P3/P4).
//
// equipment-snapshot.test.ts proves equipmentSnapshotFromWorld against a
// hand-built WorldState fixture; nft.test.ts proves settleEquipmentNFTs
// against the real DryRunTransport but with a hand-built EquipmentSnapshot.
// This file proves the SAME read -> settle -> reconcile pipeline on the REAL
// SHIPPED starter-gladiator game (@ai-rpg-engine/starter-gladiator's
// createGame(), the full equip/unequip loop wired through
// @ai-rpg-engine/equipment's createEquipmentCore — see
// packages/starter-gladiator/src/equipment-integration.test.ts). This is L0
// "external observer" (memory/ai-rpg-engine-ledger-adapter-phase5-kickoff.md
// §1): the demo drives the game from OUTSIDE via the already-built engine
// seam (equipmentSnapshotFromWorld / settleEquipmentNFTs / reconcile) —
// nothing under packages/starter-gladiator/, packages/equipment/, or
// packages/core/ is edited.
//
// `@ai-rpg-engine/starter-gladiator` (plus `@ai-rpg-engine/equipment` for the
// catalog-formula constant + the loadout reader) is imported for REAL
// (runtime) here — same allowance pirate-played-session.test.ts's own header
// documents: this is a *.test.ts file, the one place this package's
// determinism-firewall rule permits it (the engine/*.ts non-test runtime
// code — including equipment-snapshot.ts itself — stays type-only against
// both `@ai-rpg-engine/core` and `@ai-rpg-engine/equipment`).

import { describe, expect, it } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-gladiator';
import { EQUIPMENT_CATALOG_FORMULA, getEntityLoadout } from '@ai-rpg-engine/equipment';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import type { LedgerAdapterConfig, LedgerAdapterState } from '../contracts.js';
import { buildItemNFTUri } from '../contracts.js';
import { equipmentSnapshotFromWorld } from './equipment-snapshot.js';
import { settleEquipmentNFTs } from '../settle/nft.js';
import { reconcile } from '../settle/reconcile.js';
import { createInitialState } from '../state/index.js';
import { DryRunTransport } from '../transport/index.js';

// createGame(11) is the SAME "authored player, no character creation" fixture
// packages/starter-gladiator/src/equipment-integration.test.ts pins throughout
// — the retiarius trident is guaranteed in starting inventory with no
// character-creation step required, and the fixture is already proven to
// carry a real, working equip/unequip loop against real combat formulas.
const SEED = 11;
const GAME_ID = 'iron-colosseum'; // starter-gladiator's real manifest.id (content.ts)

// The authored player's sole starting item (content.ts: `inventory:
// ['trident-and-net']`) — catalog slot 'weapon', rarity 'uncommon'. A single
// carried equippable, so a bare `submitAction('equip')` auto-resolves it
// (equipment-integration.test.ts's own comment for the identical call).
const TRIDENT = 'trident-and-net';

const LEDGER_CONFIG: LedgerAdapterConfig = {
  mode: 'ledger',
  issuerMode: 'per-run',
  settlement: 'token-escrow',
  network: 'testnet',
};

type GladiatorEngine = ReturnType<typeof createGame>;

/**
 * Resolve the pack's catalog THROUGH the published formula — the same
 * transport a real consumer uses (see equipment-integration.test.ts's own
 * "catalog transport" describe block), never a direct import of
 * starter-gladiator's `itemCatalog` value.
 */
function resolveCatalog(engine: GladiatorEngine): ItemCatalog {
  return engine.formulas.get(EQUIPMENT_CATALOG_FORMULA)() as ItemCatalog;
}

type NFTHarness = {
  transport: DryRunTransport;
  state: LedgerAdapterState;
  deps: { gameId: string; issuerAddress: string; playerAddress: string; issuerSeed: string; playerSeed: string };
};

/**
 * Faucet a fresh issuer + player off a fresh `DryRunTransport` and wire a
 * fresh adapter state's addresses from the funded handles. Addresses MUST
 * come from `fundWallet()` — never invented literals: `DryRunTransport`
 * derives a signer's address purely from its seed, and an invented
 * `playerAddress` would make the directed transfer's destination check fail
 * `tecNO_PERMISSION` (the exact sharp edge nft.test.ts's own fixture comment
 * documents).
 */
async function setupNFTHarness(): Promise<NFTHarness> {
  const transport = new DryRunTransport();
  await transport.connect();
  const issuer = await transport.fundWallet();
  const player = await transport.fundWallet();

  const state = createInitialState(LEDGER_CONFIG);
  state.issuerAddress = issuer.address;
  state.playerAddress = player.address;

  return {
    transport,
    state,
    deps: {
      gameId: GAME_ID,
      issuerAddress: issuer.address,
      playerAddress: player.address,
      issuerSeed: issuer.seed,
      playerSeed: player.seed,
    },
  };
}

/**
 * `account_nfts(player)` -> the `ledgerNfts` shape `reconcile` expects. Every
 * NFT `accountNfts` returns for an address is, by construction of that query,
 * currently OWNED by it (real XRPL's account_nfts is queried per owner) — so
 * stamping `owner: playerAddress` on every returned entry is exactly correct,
 * not an assumption.
 */
async function buildLedgerNfts(
  transport: DryRunTransport,
  playerAddress: string,
): Promise<Record<string, { owner: string; uri: string }>> {
  const owned = await transport.accountNfts(playerAddress);
  const ledgerNfts: Record<string, { owner: string; uri: string }> = {};
  for (const nft of owned) {
    ledgerNfts[nft.nftId] = { owner: playerAddress, uri: nft.uri };
  }
  return ledgerNfts;
}

describe('THE FIREWALL — real gladiator played session: the NFT unique-gear layer never perturbs the deterministic engine', () => {
  it('equip + the full outside-the-engine NFT settle+reconcile flow is byte-identical to the same run without it', async () => {
    const engineA = createGame(SEED);
    const engineB = createGame(SEED);

    // The IDENTICAL action, submitted independently to both engines.
    for (const engine of [engineA, engineB]) {
      engine.submitAction('equip');
    }

    // Not a silent no-op: confirm the equip actually moved the trident into
    // the loadout before treating byte-identity below as a meaningful proof.
    const playerIdA = engineA.world.playerId;
    expect(getEntityLoadout(engineA.world, playerIdA)?.equipped.weapon).toBe(TRIDENT);

    // Everything below runs ONLY against engineA, entirely OUTSIDE the
    // engine: a read-only snapshot, then a settle+reconcile pass against a
    // transport/state engineB never sees and that never touches engineA's
    // world either.
    const catalog = resolveCatalog(engineA);
    const snapshot = equipmentSnapshotFromWorld(engineA.world, playerIdA, catalog);

    const { transport, state, deps } = await setupNFTHarness();
    const settleResult = await settleEquipmentNFTs(transport, state, snapshot, deps);
    expect(settleResult.minted).toContain(TRIDENT);

    const ledgerNfts = await buildLedgerNfts(transport, deps.playerAddress);
    const report = reconcile({
      runId: 'gladiator-nft-firewall-run',
      seed: SEED,
      mintedInitial: {},
      ledgerBalances: {},
      lastSettled: {},
      settlements: [],
      pending: [],
      playerAddress: deps.playerAddress,
      issuerAddress: deps.issuerAddress,
      nfts: Object.values(state.nfts ?? {}),
      ledgerNfts,
    });
    expect(report.passed).toBe(true);

    // THE FIREWALL — LOAD-BEARING. If this assertion ever fails, STOP and
    // report to the coordinator — do NOT weaken or delete it.
    expect(engineA.serialize()).toBe(engineB.serialize());
  });
});

describe('ledger mode on the real gladiator world — NFT layer manifests + reconcile passes', () => {
  it('mints the equipped trident as a real NFT and reconcile reports passed: true', async () => {
    const engine = createGame(SEED);
    const playerId = engine.world.playerId;
    const player = engine.world.entities[playerId];
    expect(player.inventory).toContain(TRIDENT);

    engine.submitAction('equip');
    expect(getEntityLoadout(engine.world, playerId)?.equipped.weapon).toBe(TRIDENT);

    const catalog = resolveCatalog(engine);
    const snapshot = equipmentSnapshotFromWorld(engine.world, playerId, catalog);
    const tridentSnapshot = snapshot.items.find((item) => item.itemId === TRIDENT);
    expect(tridentSnapshot).toMatchObject({
      itemId: TRIDENT,
      equipped: true,
      // Un-grown at the moment of acquisition. This asserted 0 back when the
      // chronicle had no producer at all; it still asserts 0 now that
      // starter-gladiator wires item-chronicle-core, and for a better reason:
      // `relicVersion` reads the engine's MILESTONE count, and readying a
      // weapon crosses no milestone. Under the old entry-count axis a bare
      // equip would already have read 1 and advanced the URI for nothing.
      relicVersion: 0,
      relicTier: 0,
    });

    const { transport, state, deps } = await setupNFTHarness();

    const result = await settleEquipmentNFTs(transport, state, snapshot, deps);
    expect(result.minted).toContain(TRIDENT);
    expect(state.nfts?.[TRIDENT]?.status).toBe('minted');

    const ledgerNfts = await buildLedgerNfts(transport, deps.playerAddress);
    const report = reconcile({
      runId: 'gladiator-nft-integration-run',
      seed: SEED,
      mintedInitial: {},
      ledgerBalances: {},
      lastSettled: {},
      settlements: [],
      pending: [],
      playerAddress: deps.playerAddress,
      issuerAddress: deps.issuerAddress,
      nfts: Object.values(state.nfts ?? {}),
      ledgerNfts,
    });

    expect(report.nftChecks?.[0]?.ok).toBe(true);
    expect(report.passed).toBe(true);
  });

  it('IDEMPOTENCY — a second settle with the same snapshot mints nothing (skipped, account_nfts count unchanged)', async () => {
    const engine = createGame(SEED);
    const playerId = engine.world.playerId;
    engine.submitAction('equip');

    const catalog = resolveCatalog(engine);
    const snapshot = equipmentSnapshotFromWorld(engine.world, playerId, catalog);

    const { transport, state, deps } = await setupNFTHarness();

    const first = await settleEquipmentNFTs(transport, state, snapshot, deps);
    expect(first.minted).toContain(TRIDENT);
    const countAfterFirst = (await transport.accountNfts(deps.playerAddress)).length;

    const second = await settleEquipmentNFTs(transport, state, snapshot, deps);
    expect(second.minted).toEqual([]);
    expect(second.skipped).toContain(TRIDENT);

    const countAfterSecond = (await transport.accountNfts(deps.playerAddress)).length;
    expect(countAfterSecond).toBe(countAfterFirst);
  });
});

/**
 * Swing until the target drops, topping up stamina as scaffolding so attrition
 * never gates on the resource economy — the device
 * starter-gladiator/src/{quests,relic-played-session}.test.ts both use. The
 * kill itself is a real `combat.entity.defeated` off the dispatcher.
 */
function killByAttrition(engine: GladiatorEngine, targetId: string, maxSwings = 400): void {
  for (let i = 0; i < maxSwings; i++) {
    if ((engine.world.entities[targetId]?.resources.hp ?? 0) <= 0) return;
    engine.submitAction('attack', { targetIds: [targetId] });
    const hero = engine.world.entities[engine.world.playerId];
    if (hero) hero.resources.stamina = 20;
  }
  throw new Error(`${targetId} still standing after ${maxSwings} swings`);
}

describe('THE LEDGER LOOP CLOSES — relic growth from real play advances the on-ledger URI', () => {
  // The loop the NFT unique-gear slice (v3.3.0) shipped but could not exercise.
  // Its own P3 note recorded the gap honestly: NFTokenModify was proven LIVE on
  // testnet and in dry-run with an INJECTED chronicle, but on real content every
  // relicVersion was 0, because nothing populated a chronicle in world state.
  // The producer now exists (@ai-rpg-engine/equipment's item-chronicle-core) and
  // starter-gladiator wires it, so this is the first proof that the modify
  // branch is reachable from a PLAYED SESSION rather than a fixture.
  //
  // The sequence is also the natural one: gear is minted when you receive it,
  // and grows later because of what you do with it.
  it('mints at acquisition, then NFTokenModify advances the URI after three real kills — same NFTokenID', async () => {
    const engine = createGame(SEED);
    const playerId = engine.world.playerId;

    // ── Act I: receive and ready the trident, and mint it as it is today ──
    engine.submitAction('equip');
    const catalog = resolveCatalog(engine);

    const atAcquisition = equipmentSnapshotFromWorld(engine.world, playerId, catalog);
    expect(atAcquisition.items.find((i) => i.itemId === TRIDENT)?.relicVersion).toBe(0);

    const { transport, state, deps } = await setupNFTHarness();
    const mint = await settleEquipmentNFTs(transport, state, atAcquisition, deps);
    expect(mint.minted).toContain(TRIDENT);
    expect(mint.modified).toEqual([]);

    const mintedId = state.nfts?.[TRIDENT]?.nftId;
    expect(mintedId).toBeTruthy();
    expect(state.nfts?.[TRIDENT]?.uri).toBe(buildItemNFTUri(GAME_ID, TRIDENT, 0, 0));

    // ── Act II: earn a reputation with it, through real combat ──
    engine.submitAction('move', { targetIds: ['armory'] });
    engine.submitAction('move', { targetIds: ['patron-gallery'] });
    engine.submitAction('move', { targetIds: ['arena-floor'] });
    killByAttrition(engine, 'war-beast');
    killByAttrition(engine, 'arena-champion');
    killByAttrition(engine, 'arena-overlord');

    // The engine, not this test, decided the trident grew: three real
    // `used-in-kill` entries crossed DEFAULT_WEAPON_MILESTONES' kill-count 3.
    const afterArena = equipmentSnapshotFromWorld(engine.world, playerId, catalog);
    const grown = afterArena.items.find((i) => i.itemId === TRIDENT);
    expect(grown?.relicVersion).toBe(1);
    expect(grown?.relicTier).toBe(1);

    // ── Act III: the growth reaches the ledger as a MODIFY, not a re-mint ──
    const growth = await settleEquipmentNFTs(transport, state, afterArena, deps);
    expect(growth.modified).toContain(TRIDENT);
    expect(growth.minted).toEqual([]); // identity preserved, nothing re-issued

    // Same token, advanced metadata — the whole point of XLS-46 tfMutable.
    expect(state.nfts?.[TRIDENT]?.nftId).toBe(mintedId);
    expect(state.nfts?.[TRIDENT]?.uri).toBe(buildItemNFTUri(GAME_ID, TRIDENT, 1, 1));

    // And the ledger itself agrees — read back through account_nfts, not state.
    const onLedger = await transport.accountNfts(deps.playerAddress);
    const token = onLedger.find((n) => n.nftId === mintedId);
    expect(token?.uri).toBe(buildItemNFTUri(GAME_ID, TRIDENT, 1, 1));
  });

  it('the external verifier confirms the grown URI against account_nfts', async () => {
    const engine = createGame(SEED);
    const playerId = engine.world.playerId;
    engine.submitAction('equip');
    const catalog = resolveCatalog(engine);

    const { transport, state, deps } = await setupNFTHarness();
    await settleEquipmentNFTs(transport, state, equipmentSnapshotFromWorld(engine.world, playerId, catalog), deps);

    engine.submitAction('move', { targetIds: ['armory'] });
    engine.submitAction('move', { targetIds: ['patron-gallery'] });
    engine.submitAction('move', { targetIds: ['arena-floor'] });
    killByAttrition(engine, 'war-beast');
    killByAttrition(engine, 'arena-champion');
    killByAttrition(engine, 'arena-overlord');

    await settleEquipmentNFTs(transport, state, equipmentSnapshotFromWorld(engine.world, playerId, catalog), deps);

    // reconcile() predicts the URI from the engine's relicVersion and matches it
    // against what the ledger reports. Passing here means the on-chain metadata
    // and the played session agree about how far the trident has come — the
    // check that was structurally unreachable while relicVersion was always 0.
    const report = reconcile({
      runId: 'gladiator-relic-growth-run',
      seed: SEED,
      mintedInitial: {},
      ledgerBalances: {},
      lastSettled: {},
      settlements: [],
      pending: [],
      playerAddress: deps.playerAddress,
      issuerAddress: deps.issuerAddress,
      nfts: Object.values(state.nfts ?? {}),
      ledgerNfts: await buildLedgerNfts(transport, deps.playerAddress),
    });

    const check = report.nftChecks?.find((c) => c.gameItemId === TRIDENT);
    expect(check?.expectedUri).toBe(buildItemNFTUri(GAME_ID, TRIDENT, 1, 1));
    expect(check?.uriOk).toBe(true);
    expect(check?.ownedOnLedger).toBe(true);
    expect(report.passed).toBe(true);
  });

  it('THE FIREWALL STILL HOLDS — the whole loop leaves the world byte-identical', async () => {
    // The load-bearing guard, re-run with the chronicle live and a modify in the
    // mix. Two engines play the SAME arena script; only engineA additionally
    // runs the entire outside-the-engine mint -> grow -> modify -> reconcile
    // flow against it. If the adapter has touched the world in any way — and it
    // now reads a second namespace to find the growth summary — these diverge.
    const script = (engine: GladiatorEngine) => {
      engine.submitAction('equip');
      engine.submitAction('move', { targetIds: ['armory'] });
      engine.submitAction('move', { targetIds: ['patron-gallery'] });
      engine.submitAction('move', { targetIds: ['arena-floor'] });
      killByAttrition(engine, 'war-beast');
      killByAttrition(engine, 'arena-champion');
      killByAttrition(engine, 'arena-overlord');
    };

    const engineA = createGame(SEED);
    const engineB = createGame(SEED);
    script(engineA);
    script(engineB);

    const catalog = resolveCatalog(engineA);
    const { transport, state, deps } = await setupNFTHarness();
    const snapshot = equipmentSnapshotFromWorld(engineA.world, engineA.world.playerId, catalog);
    await settleEquipmentNFTs(transport, state, snapshot, deps);
    reconcile({
      runId: 'gladiator-firewall-run',
      seed: SEED,
      mintedInitial: {},
      ledgerBalances: {},
      lastSettled: {},
      settlements: [],
      pending: [],
      playerAddress: deps.playerAddress,
      issuerAddress: deps.issuerAddress,
      nfts: Object.values(state.nfts ?? {}),
      ledgerNfts: await buildLedgerNfts(transport, deps.playerAddress),
    });

    expect(engineA.serialize()).toBe(engineB.serialize());
  });
});
