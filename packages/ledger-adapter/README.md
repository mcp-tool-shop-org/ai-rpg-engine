<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/ledger-adapter

**Opt-in XRPL testnet settlement for the player-owned tradeable layer** — binds a
game's `coin` balance, tradeable inventory, and `trade-core`'s `buy`/`sell` verbs
to the XRP Ledger **at checkpoints**, entirely **outside** the deterministic
replayable engine core.

> **Testnet only, opt-in, and proven live.** No mainnet path exists in code — a
> structural guard rejects non-testnet hosts at construction. Assets are
> game-scoped receipts on a test network, not securities. An absent adapter is
> exactly the offline engine that ships today.

## Install

```bash
npm install @ai-rpg-engine/ledger-adapter
# xrpl.js is an OPTIONAL peer — needed only for the live testnet transport:
npm install xrpl
```

## Quick start

```ts
import {
  createLedgerAdapter,
  createInitialState,
  TestnetTransport,
  enableFromWorld,
  settleCheckpoint,
  DEFAULT_LEDGER_CONFIG,
} from '@ai-rpg-engine/ledger-adapter';

const config  = { ...DEFAULT_LEDGER_CONFIG, mode: 'ledger' };
const state   = createInitialState(config);
const adapter = createLedgerAdapter(new TestnetTransport(), config, {
  gameId: 'my-game',
  runId: 'run-1',
});

// At run start (a checkpoint): mint the player's starting coin + inventory.
await enableFromWorld(world, playerId, adapter, state);

// ...the player trades via the engine's own buy/sell verbs...

// At the next checkpoint (town / market / save): settle the net delta on testnet.
await settleCheckpoint(world, playerId, adapter, state, 1, 'Market Row');
```

For dry-run tests, swap `TestnetTransport` for `DryRunTransport` — no network, no
`xrpl` dependency.

## The determinism firewall (the whole point)

This package is deliberately isolated so that enabling it **cannot** change how a
game plays or replays:

- Nothing in `@ai-rpg-engine/core` or `@ai-rpg-engine/modules` imports it.
- A run is **byte-identical** whether or not the adapter is attached (seed-0
  identity preserved) — proven against the real `starter-pirate` `createGame()`
  merchant loop.
- The adapter **reads** engine state at coordinator-invoked checkpoints; the
  engine **never reads** the adapter. Settlement never runs inside the step/tick
  path.
- `@ai-rpg-engine/core` is a **type-only** dependency; `xrpl.js` is an
  **optional peer**. Dry-run mode needs neither. If the chain is unavailable the
  game continues, marked **"unanchored."**

## Integration levels

The firewall is a **determinism** boundary, not an anti-integration rule — a game
folds the adapter in as deeply as its design calls for, and the byte-identical
invariant holds at every level:

| Level | What depends on the adapter |
|---|---|
| **L0 — External observer** | Nothing inside the game; the adapter attaches from outside at checkpoints. |
| **L1 — Game-driven checkpoints** | The game's own save / town / meta flow calls the adapter. |
| **L2 — Ledger-native design** | The game's economy is designed *around* on-chain ownership. |

The distinction that keeps replay safe is **not** "which package imports the
adapter" but "is the call inside the tick."

## What binds to what

| Game concept | XRPL primitive | Status |
|---|---|---|
| `coin` balance | IOU over a trust line | v1 |
| Stackable consumables | fungible token | v1 |
| Buy / sell (`trade-core`) | settled via **token escrow** (XLS-85) at checkpoints | v1 |
| Unique gear (`equipment`) | **NFT** — XLS-20 mint; XLS-46 `NFTokenModify` for relic growth | **v2** |

The **issuer** is a config axis: a `per-run` throwaway faucet issuer (the safe
default) or a `persistent` per-game issuer (for cross-run merchant markets).

## Unique gear as NFTs (v2)

The fungible layer above binds `coin` and stackable consumables. Unique gear —
the `equipment` package's one-of-a-kind items, with rarity, provenance, and relic
growth — is a **distinct seam** carried *alongside* it, never conflated: a
`EquipmentSnapshot` (its own firewall-pure read path over the player's loadout),
`NFTokenRef` state keyed one-per-`gameItemId`, and `settleEquipmentNFTs`.

- **Mint at a checkpoint.** Each unique item is minted as an **XLS-20 NFT**
  (`tfTransferable | tfMutable`, never burnable — true player ownership) and
  transferred to the player. Idempotent per `gameItemId`: a fail-then-retry never
  double-mints.
- **Relic growth → `NFTokenModify`.** As an item earns its history, the issuer
  advances the NFT's metadata URI in place (**XLS-46 DynamicNFT**) — the same
  NFTokenID, so the asset's identity is preserved while its state evolves.
  (Growth fires on real content once the engine's item-chronicle is populated — a
  dormant system today; the mint path manifests on real content now.)
- **`reconcile()` verifies ownership.** The external verifier checks on-ledger
  `account_nfts` — the player owns the NFT and its URI matches the engine's relic
  version — a truth the engine cannot fake.

The whole layer honors the same firewall: mint/modify happen only at checkpoints,
the engine never reads the adapter, and a run is byte-identical with or without
it — proven on the real `starter-gladiator` game (see below).

## Play modes

1. **Offline** (default) — no chain; the engine core as it ships today.
2. **Ledger** — coin/items backed by real testnet balances; settle at checkpoints.
3. **Diary** — play offline, then anchor the run's state hash on-ledger for a receipt.

## Safety rails

Testnet-only mainnet-impossible-in-code guard · secrets sidecar (wallet seeds
never in the save file) · conservation-on-retry (idempotent per-checkpoint
settlement) · genuine on-chain memo verification (read back via `account_tx`) ·
unanchored fallback.

## Reconciliation = an external verifier

The ledger is a different system family than the engine, so the engine cannot
fake it. `reconcile()` confirms on-ledger balances match the engine's settled
economy, that `minted + Σdeltas == settled` (conservation) holds per token, and
that every on-chain memo matches — a genuine external verifier of the economy.

## Proven live

A real `starter-pirate` merchant run — sell a cutlass, buy a cannon-shell —
settles on XRPL testnet via token escrow, then reconciles against on-ledger
balances and memos (conservation holds for every token). See the
[ledger handbook chapter](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/60-xrpl-ledger-adapter/),
and run it yourself:

```bash
npm run build
node packages/ledger-adapter/scripts/pirate-live-replay.mjs
```

For the **NFT unique-gear layer**, a real `starter-gladiator` played session —
the player equips the shipped `trident-and-net`, which is minted as an NFT to
their wallet, owned on-ledger, and reconciled — with the world byte-identical
before and after. See the
[NFT gear handbook chapter](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/61-xrpl-nft-gear/),
and run it yourself:

```bash
npm run build
node packages/ledger-adapter/scripts/gladiator-nft-live-replay.mjs
```

## License

MIT © MCP Tool Shop
