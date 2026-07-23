# @ai-rpg-engine/ledger-adapter

**Opt-in XRPL testnet settlement for the player-owned tradeable layer** — binds
the game's `coin` balance, tradeable inventory, and `trade-core` buy/sell verbs
to the XRP Ledger **at checkpoints**, entirely **outside** the deterministic
replayable engine core.

> ⚠️ **Testnet only. In active development (Phase 1 scaffold).** Not published
> yet. No mainnet path exists in code — a structural guard rejects non-testnet
> hosts at construction. Assets are game-scoped receipts on a test network, not
> securities.

## The determinism firewall (the whole point)

This package is deliberately isolated so that enabling it **cannot** change how a
game plays or replays:

- Nothing in `@ai-rpg-engine/core` or `@ai-rpg-engine/modules` imports it.
- A run is **byte-identical** whether or not the adapter is attached (seed-0
  identity preserved).
- The adapter **reads** engine state at coordinator-invoked checkpoints; the
  engine **never reads** the adapter. Settlement never runs inside the
  step/tick path.
- `@ai-rpg-engine/core` is a **type-only** dependency; `xrpl.js` is an
  **optional peer**. Dry-run mode needs neither. If the chain is unavailable the
  game continues, marked **"unanchored."**

## What binds to what

| Game concept | XRPL primitive | Status |
|---|---|---|
| `coin` balance | IOU over a trust line | v1 |
| Stackable consumables | fungible token (IOU / MPT) | v1 |
| Buy / sell (`trade-core`) | settled via **token escrow** (XLS-85) at checkpoints | v1 |
| Unique gear (`equipment`) | mutable NFT (NFTokenModify) | later slice |

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
fake it. A reconciliation pass confirms on-ledger balances match the engine's
settled inventory, that `minted + Σdeltas == final` (conservation), and that
every on-chain memo matches — a genuine external verifier of the economy.

## License

MIT © MCP Tool Shop
