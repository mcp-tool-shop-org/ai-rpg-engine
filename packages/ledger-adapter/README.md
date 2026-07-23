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
| Unique gear (`equipment`) | NFT | later slice |

The **issuer** is a config axis: a `per-run` throwaway faucet issuer (the safe
default) or a `persistent` per-game issuer (for cross-run merchant markets).

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
[handbook chapter](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/60-xrpl-ledger-adapter/),
and run it yourself:

```bash
npm run build
node packages/ledger-adapter/scripts/pirate-live-replay.mjs
```

## License

MIT © MCP Tool Shop
