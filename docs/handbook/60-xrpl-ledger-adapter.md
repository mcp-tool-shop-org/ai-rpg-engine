# Chapter 60 — The XRPL Ledger Adapter

> Part X — On-Ledger Play (optional)

`@ai-rpg-engine/ledger-adapter` is an **optional** package that binds a game's
**player-owned tradeable layer** — the `coin` balance and consumable inventory
that `trade-core`'s `buy`/`sell` verbs already move — to the **XRPL testnet**, so
those assets can be backed by real on-ledger tokens and settled at checkpoints.
It is entirely opt-in: an absent adapter is exactly the offline engine that ships
today.

It binds the *tradeable* layer, not the abstract district economy
(`economy-core`), which stays a pure simulation. The pattern is adapted from the
studio's shipped `escape-the-valley` "ledger backpack" and proven live on
testnet.

## The determinism invariant

The whole point of the adapter is that it **cannot perturb the simulation**. It
is a side channel:

- It is **never invoked inside the deterministic tick** — only at
  **checkpoints** (save, town/market entry, chapter break).
- Nothing in `@ai-rpg-engine/core` or `@ai-rpg-engine/modules` imports it. Its
  only engine dependency is a compile-time `import type` that erases at build
  time, so the adapter carries **zero runtime coupling** to the engine.
- The adapter **reads** a plain-data snapshot of the tradeable layer at a
  checkpoint; the engine **never reads the adapter**.

**A run is byte-identical with or without the adapter.** A firewall test runs the
real `starter-pirate` `createGame()` merchant loop on two independently
constructed engines — one with the adapter enabled and settling at a checkpoint —
and asserts `withAdapter.store.state` deep-equals `withoutAdapter.store.state`.
Seed-0 replay is untouched.

## Integration levels

The firewall is a **determinism boundary, not an anti-integration rule.** A game
may fold the adapter in as deeply as *that game's* design calls for. The
invariant above holds at every level:

| Level | What depends on the adapter | Fits |
|-------|-----------------------------|------|
| **L0 — External observer** | Nothing inside the game; the adapter attaches from outside at checkpoints and the game is unaware. | Retrofitting an existing game (the shipped pirate demo). |
| **L1 — Game-driven checkpoints** | The game's own save / town / meta-progression flow calls the adapter at defined moments. | A game that wants deliberate ledger moments. |
| **L2 — Ledger-native design** | The game's economy or identity is designed *around* on-chain ownership (persistent issuer, real markets). | A ledger-first merchant game. |

The distinction that keeps replay safe is **not** "which package imports the
adapter" but "is the call inside the tick." A game package may import and drive
the adapter freely, as long as every call lands at a checkpoint outside the
seed-driven replay loop. The shipped demo is L0; L1 and L2 are supported,
first-class designs — not violations.

## Three play modes

| Mode | Behavior |
|------|----------|
| `offline` | Default. No chain. Coin and items are tracked purely in engine state — the engine exactly as it ships. |
| `ledger` | Coin and items are backed by real testnet balances; the net trade delta is settled at each checkpoint. |
| `diary` | Play fully offline, then anchor the run's state hash on-ledger for a cheap, tamper-evident receipt (no per-item trust lines). |

## What's on the ledger

| Game concept | XRPL primitive |
|--------------|----------------|
| `coin` balance | An issued-currency **IOU** over a trust line (issuer = the game's "Merchant Authority"). |
| Consumable items (potions, ammunition, provisions) | **Fungible tokens.** |
| A checkpoint's net `buy`/`sell` delta | A settled transfer via **XLS-85 token escrow** (a spend escrows player → merchant and finishes; a grant mints issuer → player). |
| Unique equipment | **NFTs** — a deliberate later slice; v1 is the fungible coin + consumable layer. |

The **issuer** is a config axis: a `per-run` throwaway faucet issuer (the safe
default — no durable key custody) or a `persistent` per-game issuer (for
cross-run merchant markets).

## The engine seam

The adapter reads the world through three thin, read-only seam functions. The
engine is never handed to the adapter — only a plain `TradeableSnapshot`.

```ts
import {
  createLedgerAdapter,
  createInitialState,
  TestnetTransport,
  enableFromWorld,
  settleCheckpoint,
  DEFAULT_LEDGER_CONFIG,
} from '@ai-rpg-engine/ledger-adapter';
import { createGame } from '@ai-rpg-engine/starter-pirate';

const engine  = createGame();                       // the real, unmodified game
const config  = { ...DEFAULT_LEDGER_CONFIG, mode: 'ledger' };
const state   = createInitialState(config);
const adapter = createLedgerAdapter(new TestnetTransport(), config, {
  gameId: 'black-flag-requiem',
  runId: 'run-1',
});

// At run start (a checkpoint): mint the captain's starting coin + inventory.
await enableFromWorld(engine.store.state, 'captain', adapter, state);

// ...the player plays: real buy/sell verbs move coin + inventory...
engine.submitAction('move', { targetIds: ['port-tavern'] });
engine.submitAction('sell', { targetIds: ['cutlass'] });
engine.submitAction('buy',  { targetIds: ['cannon-shell'] });

// At the next checkpoint (town / market / save): settle the net delta on testnet.
await settleCheckpoint(engine.store.state, 'captain', adapter, state, 1, 'Port Haven');
```

`snapshotFromWorld(world, playerId)` is the read; `enableFromWorld` and
`settleCheckpoint` wrap it and drive the adapter. None of them mutate the world.

## Safety rails

Every rail is lifted from the shipped `escape-the-valley` ledger work — earned,
not optional:

- **Testnet only, mainnet-impossible-in-code.** A structural guard (not a config
  flag) rejects any non-testnet host at construction. You cannot point this at
  mainnet.
- **Secrets sidecar.** Wallet seeds live in a gitignored `secrets.json`, never in
  the save/run file. Throwaway faucet wallets, local only.
- **Conservation on retry.** A failed settlement is queued and retried; `settle()`
  is idempotent per checkpoint, so a delta is never double-applied.
- **Real on-chain memo verification.** Reconciliation fetches the actual on-ledger
  memo via `account_tx`, not the engine's own string.
- **Unanchored fallback.** If the chain is unreachable, the run continues and is
  marked *unanchored*. Nothing bricks.

## The pirate demo — a real played session

The load-bearing proof is not a synthetic fixture: it is the real, unmodified
`starter-pirate` game (`Black Flag Requiem`), driven from outside at L0.

The captain starts with **30 coin** and a **cutlass**. He sails into port and
trades:

1. `move` into `port-tavern` (his spawn zone has no market district).
2. `sell` the cutlass → **+10 coin** (coin 30 → 40), inventory now empty.
3. `buy` a `cannon-shell` (pirate ammunition) → **−13 coin** (coin 40 → 27),
   inventory `['cannon-shell']`.

At the checkpoint, `settleCheckpoint` reads the net delta —
`{ coin: -3, cutlass: -1, cannon-shell: +1 }` — and settles it on testnet. The
on-chain memo records exactly that:

```text
ARPG|GAME:black-flag-requiem|RUN:...|CHECKPOINT:1|DELTA:cannon-shell+1,coin-3,cutlass-1|VERB:settle|V:1
```

### Reconciliation is the external verifier

After settling, `reconcile()` checks the on-ledger balances and the real on-chain
memo against the engine's settled economy. Conservation
(`minted + Σdeltas == settled`) must hold for **every** token:

```text
cannon-shell  CAN  minted=0   Σ=+1   engine=1   ledger=1   balance=OK  conserv=OK
coin          COI  minted=30  Σ=-3   engine=27  ledger=27  balance=OK  conserv=OK
cutlass       CUT  minted=1   Σ=-1   engine=0   ledger=0   balance=OK  conserv=OK
memoOk=true (local + on-chain)   passed=true
```

The ledger is a different system family than the engine, so the engine cannot
fake it. That is what makes reconciliation a genuine *external verifier* of the
game economy — the same principle as a cross-family test jury, but on-chain.

The `cannon-shell` line is worth noting: it is a token the captain **bought
mid-run**, not one he started with. The adapter opens its trust line
incrementally, at the checkpoint, right before it is first minted — the exact
path a real merchant loop exercises constantly, and one that only a **live**
testnet replay (not the dry-run suite) can fully prove.

### Run it yourself

```bash
npm run build
node packages/ledger-adapter/scripts/pirate-live-replay.mjs
```

The script faucets three testnet wallets, plays the merchant sequence above,
settles via token escrow, and reconciles against on-chain balances and memos. It
exits `0` only if `reconcile()` passes, and writes a full receipt with every
transaction hash to `scripts/pirate-live-replay-receipt.json`. Every transaction
is viewable on the [XRPL testnet explorer](https://testnet.xrpl.org/).

## Why this exists

The future of on-chain play is real, but a deterministic RPG engine cannot
compromise its foundation to reach for it. The ledger adapter is the answer: a
game gets real, player-owned, tradeable on-chain assets **and** keeps a
seed-0 byte-exact, fully replayable core — because the two never touch inside the
tick. Build for the future; keep the invariant.
