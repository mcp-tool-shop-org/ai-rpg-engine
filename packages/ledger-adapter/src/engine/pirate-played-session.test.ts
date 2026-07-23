// THE PIRATE PLAYED-SESSION PROOF — Phase 5's load-bearing acceptance.
//
// firewall.test.ts proves the firewall on a hand-built NEUTRAL fixture
// (createTestEngine, a single district with no controllingFaction, no
// worldStack). This file proves the SAME firewall — plus a full settle +
// reconcile pass — on the REAL SHIPPED starter-pirate game
// (@ai-rpg-engine/starter-pirate's createGame(), the full buildWorldStack:
// faction-cognition, rumor-propagation, encounter-spawn, quest-core, the
// pressure lifecycle, everything). This is L0 "external observer" (see
// memory/ai-rpg-engine-ledger-adapter-phase5-kickoff.md §1): the demo drives
// the game from OUTSIDE via the already-built engine seam
// (snapshotFromWorld / enableFromWorld / settleCheckpoint) — nothing under
// packages/starter-pirate/, packages/modules/, or packages/core/ is edited.
//
// `@ai-rpg-engine/starter-pirate` (plus `@ai-rpg-engine/modules` for its two
// pricing constants) is imported for REAL (runtime) here — same allowance
// firewall.test.ts's own header documents: this is a *.test.ts file, the one
// place this package's determinism-firewall rule permits it (the engine/*.ts
// non-test runtime code stays type-only against `@ai-rpg-engine/core`).

import { describe, expect, it } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-pirate';
import { SELL_BASE_VALUE, BUY_MARKUP_MULTIPLIER } from '@ai-rpg-engine/modules';
import type { LedgerAdapterConfig } from '../contracts.js';
import { createLedgerAdapter, reconcile } from '../settle/index.js';
import { createInitialState } from '../state/index.js';
import { DryRunTransport } from '../transport/index.js';
import { enableFromWorld, settleCheckpoint } from './checkpoint.js';

const SEED = 42;
const PLAYER_ID = 'captain';
const GAME_ID = 'black-flag-requiem'; // starter-pirate's real manifest.id

// WRINKLE (verified against packages/starter-pirate/src/{setup,content}.ts):
// the captain spawns on zone 'ship-deck' (`engine.store.state.locationId =
// 'ship-deck'`), which belongs to NO district — starter-pirate's own
// `districts` roster only covers port-tavern/governors-fort (district
// 'port-haven') and open-water/sunken-shrine (district 'cursed-waters').
// trade-core's sell/buy verbs resolve price via getDistrictForZone and
// reject with 'no market here' off-district, so a trade attempted straight
// from spawn silently no-ops. Fix: one real 'move' (ship-deck IS a direct
// neighbor of port-tavern) lands the captain in district 'port-haven' before
// any trade — the same traversal verb a player would use.
const TRADE_ZONE = 'port-tavern';
const CHECKPOINT_LOCATION = 'Port Haven';

// The captain's sole starting inventory item (content.ts: `inventory:
// ['cutlass']`) — the sell target. The buy target is GENRE_BUYABLE_STOCK
// .pirate.ammunition[0] (trade-core.ts) — offered because port-haven's
// 'ammunition' supply seeds at 45 under the pirate genre profile
// (economy-core.ts's GENRE_SUPPLY_DEFAULTS.pirate), comfortably above
// BUY_SUPPLY_FLOOR (30).
const SELL_ITEM = 'cutlass';
const BUY_ITEM = 'cannon-shell';

const LEDGER_CONFIG: LedgerAdapterConfig = {
  mode: 'ledger',
  issuerMode: 'per-run',
  settlement: 'token-escrow',
  network: 'testnet',
};

/** Build a `currencyCode -> balance` map from the dry-run transport's own
 *  account_lines — exactly what a real testnet transport's accountLines
 *  would report, decimal-string balances converted to number. Same helper
 *  firewall.test.ts uses. */
async function buildLedgerBalances(
  transport: DryRunTransport,
  address: string,
): Promise<Record<string, number>> {
  const lines = await transport.accountLines(address);
  const balances: Record<string, number> = {};
  for (const line of lines) balances[line.currency] = Number(line.balance);
  return balances;
}

// Derived, not guessed (mirrors firewall.test.ts's own SHORT_SWORD_PRICE =
// SELL_BASE_VALUE*BUY_MARKUP_MULTIPLIER derivation) — verified against the
// live pricing pipeline (trade-value.ts's computeItemValue, trade-core.ts's
// sellHandler/buyHandler) rather than assumed:
//   - SELL_ITEM 'cutlass' infers to SupplyCategory 'components'
//     (inferSupplyCategory finds no CATEGORY_HINTS keyword match — 'cutlass'
//     hits none of 'sword'/'blade'/'cutter'/etc). port-haven's 'components'
//     supply is untouched by GENRE_SUPPLY_DEFAULTS.pirate (no 'components'
//     entry there -> BASELINE 50) and by port-haven's own tags
//     (['colonial','trade'], neither key is in TAG_SUPPLY_MODIFIERS) ->
//     computeScarcityMultiplier(50) = 1.0.
//   - BUY_ITEM 'cannon-shell' is category 'ammunition', seeded at 45 by the
//     pirate genre profile — still inside the <=60 neutral bucket ->
//     scarcity x1.0 too.
//   - playerReputation stays 0 throughout: port-haven DOES have a real
//     controllingFaction ('colonial-navy', unlike firewall.test.ts's
//     factionless fixture), but nothing in this sequence (no attack/bribe/
//     intimidate) ever changes it -> factionAttitude x1.0.
//   - No pressure ever applies a category multiplier here, however the raw
//     district economy/stability numbers read: world-tick.ts's
//     HEAT_WAKE_THRESHOLD (10) gates EVERY new pressure spawn behind player
//     heat, and heat only accrues from combat kills (defeat-fallout) — this
//     sequence never attacks, so heat stays 0 and activePressureKinds is
//     empty for the whole run -> pressureModifier x1.0 (no 'trade-war'/
//     'black-market-boom'/etc can apply).
//   - districtProsperity reads off tradeVolume (seeded 50, the <=55 neutral
//     bucket) -> x1.0.
// Every modifier the pricing pipeline can apply is therefore x1.0 (buy's own
// markup aside) — the SAME neutral arithmetic firewall.test.ts's fixture
// produces, even though this is the real shipped pirate world complete with
// genre-skewed economy and a real controllingFaction, not a hand-built
// neutral fixture. Both integration-test assertions below independently
// confirm this against the live engine's own coin ledger.
const SELL_CREDIT = SELL_BASE_VALUE;
const CANNON_SHELL_PRICE = Math.round(SELL_BASE_VALUE * BUY_MARKUP_MULTIPLIER);

describe('THE FIREWALL — real pirate played session: attaching the ledger adapter never perturbs the deterministic engine', () => {
  it('a captain-driven move+sell+buy run with the adapter enabled + settled is byte-identical to the same run without it', async () => {
    const withoutAdapter = createGame(SEED);
    const withAdapter = createGame(SEED);

    const transport = new DryRunTransport();
    const adapter = createLedgerAdapter(transport, LEDGER_CONFIG, {
      gameId: GAME_ID,
      runId: 'pirate-firewall-run',
    });
    const state = createInitialState(LEDGER_CONFIG);

    // Mint the STARTING snapshot before any trades (the realistic "ledger
    // mode turned on at run start" shape) — reads withAdapter's world, never
    // writes it.
    const enableResult = await enableFromWorld(withAdapter.store.state, PLAYER_ID, adapter, state);
    expect(enableResult.success).toBe(true);

    // The IDENTICAL action sequence, submitted independently to both
    // engines: move off ship-deck (no district) into port-tavern (district
    // 'port-haven'), then sell the starting cutlass, then buy pirate stock.
    for (const engine of [withoutAdapter, withAdapter]) {
      engine.submitAction('move', { targetIds: [TRADE_ZONE] });
      engine.submitAction('sell', { targetIds: [SELL_ITEM] });
      engine.submitAction('buy', { targetIds: [BUY_ITEM] });
    }

    // Not a silent no-op: the ship-deck/district wrinkle would otherwise
    // make sell/buy quietly reject and this whole proof would pass
    // vacuously (both engines "agreeing" on an unperturbed starting state).
    const noAdapterPlayer = withoutAdapter.store.state.entities[PLAYER_ID];
    expect(noAdapterPlayer.resources.coin).not.toBe(30);
    expect(noAdapterPlayer.inventory).not.toEqual(['cutlass']);

    // Settle at a checkpoint AFTER the trades: snapshotFromWorld reads
    // withAdapter's world one more time, then the adapter escrows/pays
    // against its OWN transport + state — never against withAdapter's world
    // itself.
    const settleResult = await settleCheckpoint(withAdapter.store.state, PLAYER_ID, adapter, state, 1, CHECKPOINT_LOCATION);
    expect(settleResult.success).toBe(true);

    // THE FIREWALL — LOAD-BEARING. If this assertion ever fails, STOP and
    // report to the coordinator — do NOT weaken or delete it.
    expect(withAdapter.store.state).toEqual(withoutAdapter.store.state);
  });
});

describe('ledger mode on the real pirate world — manifests + reconcile passes', () => {
  it('settles a real cutlass-sell / cannon-shell-buy delta on the dry-run ledger and reconcile reports passed: true', async () => {
    const engine = createGame(SEED);

    const transport = new DryRunTransport();
    const adapter = createLedgerAdapter(transport, LEDGER_CONFIG, {
      gameId: GAME_ID,
      runId: 'pirate-integration-run',
    });
    const state = createInitialState(LEDGER_CONFIG);

    await enableFromWorld(engine.store.state, PLAYER_ID, adapter, state);
    const mintedInitial = { ...state.lastSettled };
    expect(mintedInitial).toEqual({ coin: 30, cutlass: 1 });

    // The ship-deck/district wrinkle (see file header): move into a zone
    // with a real district before trading, using the real traversal verb.
    engine.submitAction('move', { targetIds: [TRADE_ZONE] });
    expect(engine.store.state.entities[PLAYER_ID]?.zoneId).toBe(TRADE_ZONE);

    engine.submitAction('sell', { targetIds: [SELL_ITEM] }); // +SELL_CREDIT coin, -cutlass
    expect(engine.store.state.entities[PLAYER_ID]?.resources.coin).toBe(30 + SELL_CREDIT);
    expect(engine.store.state.entities[PLAYER_ID]?.inventory).toEqual([]);

    engine.submitAction('buy', { targetIds: [BUY_ITEM] }); // -CANNON_SHELL_PRICE coin, +cannon-shell
    expect(engine.store.state.entities[PLAYER_ID]?.resources.coin).toBe(30 + SELL_CREDIT - CANNON_SHELL_PRICE);
    expect(engine.store.state.entities[PLAYER_ID]?.inventory).toEqual([BUY_ITEM]);

    const settleResult = await settleCheckpoint(engine.store.state, PLAYER_ID, adapter, state, 1, CHECKPOINT_LOCATION);

    expect(settleResult.success).toBe(true);
    expect(settleResult.record?.status).toBe('settled');
    expect(settleResult.record?.deltas).toEqual({
      coin: SELL_CREDIT - CANNON_SHELL_PRICE,
      cutlass: -1,
      [BUY_ITEM]: 1,
    });
    expect(state.pending).toHaveLength(0);

    const ledgerBalances = await buildLedgerBalances(transport, state.playerAddress);

    const report = reconcile({
      runId: 'pirate-integration-run',
      seed: SEED,
      mintedInitial,
      ledgerBalances,
      lastSettled: state.lastSettled,
      settlements: state.settlements,
      pending: state.pending,
      playerAddress: state.playerAddress,
      issuerAddress: state.issuerAddress,
      // The adapter's OWN minted codes (state.tokenMap), so reconcile looks
      // up ledgerBalances by the exact currency codes that reached the
      // ledger — same convention firewall.test.ts's own reconcile call uses.
      tokenMap: state.tokenMap,
    });

    expect(report.passed).toBe(true);
    expect(report.resources.every((r) => r.balanceOk && r.conservationOk)).toBe(true);
    expect(report.memoOk).toBe(true);
    expect(report.pendingCount).toBe(0);
  });
});
