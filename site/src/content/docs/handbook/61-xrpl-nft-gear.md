---
title: "Chapter 61 — The NFT Unique-Gear Layer"
description: "Binding a game's unique gear (equipment) to XRPL NFTs — minted at checkpoints, relic growth via NFTokenModify, entirely outside the deterministic core."
sidebar:
  order: 61
---


> Part X — On-Ledger Play (optional)

[Chapter 60](./60-xrpl-ledger-adapter.md) bound a game's **fungible** tradeable
layer — the `coin` balance and stackable consumables — to the XRPL testnet. This
chapter binds the other half: the `equipment` package's **unique gear**, the
one-of-a-kind items with rarity, provenance, an item-chronicle, and relic growth.
Fungible value is a *count*; unique gear is a *one-of-one*, so it maps to a
different XRPL primitive — an **NFT** — and rides a **distinct seam** carried
*alongside* the fungible one, never conflated with it.

Like the whole ledger adapter, it is entirely **opt-in** and **testnet-only**.

## The same determinism invariant

The NFT layer inherits Chapter 60's firewall unchanged. It **cannot perturb the
simulation**:

- NFTs are minted and modified **only at checkpoints** — never inside the
  deterministic tick.
- The read path, `equipmentSnapshotFromWorld`, is **firewall-pure**: it imports
  `@ai-rpg-engine/core` and `@ai-rpg-engine/equipment` as `import type` only (both
  erase at build time), reads a plain-data snapshot of the player's loadout, and
  **never mutates the world**. The adapter carries zero runtime coupling to the
  engine.
- The engine **never reads the adapter**. A run is **byte-identical** with or
  without the NFT flow — proven on the real `starter-gladiator` game below.

## What's on the ledger

| Game concept | XRPL primitive |
|--------------|----------------|
| A unique item (weapon, armor, relic) | An **XLS-20 NFToken**, minted `tfTransferable \| tfMutable` and transferred issuer → player. |
| Relic growth (an item earns an epithet / tier) | An **XLS-46 `NFTokenModify`** that advances the NFT's metadata URI **in place** — the NFTokenID never changes, so the asset's identity is preserved while its state evolves. |
| The item's on-ledger metadata | A deterministic URI, `buildItemNFTUri(gameId, itemId, relicVersion, relicTier)` — the NFT analogue of the settlement memo. `NFTokenModify` advancing it is the on-ledger proof a relic grew. |
| Undoing a mis-mint (the compensator) | An **`NFTokenBurn`** of the freshly-minted, not-yet-transferred token. |

**Ownership is real.** Gear is minted `tfTransferable | tfMutable` but **never
`tfBurnable`** — the studio-issuer can *evolve* an item's metadata (relic growth
requires the issuer, by XLS-46's permission model — the holder cannot mutate
their own item), but it **cannot destroy** an NFT a player owns. `tfMutable` is a
permanent, mint-time decision, so every unique item is minted mutable to
future-proof it for growth.

## The equipment seam

The adapter reads the player's unique gear through a **new, separate** read path —
distinct from the fungible `TradeableSnapshot`. Unique gear lives in a different
place in world state (the `equipment-core` module's per-entity loadout), so it
gets its own snapshot:

```ts
import {
  equipmentSnapshotFromWorld,
  settleEquipmentNFTs,
  reconcile,
  createInitialState,
  TestnetTransport,
  DEFAULT_LEDGER_CONFIG,
} from '@ai-rpg-engine/ledger-adapter';
import { EQUIPMENT_CATALOG_FORMULA } from '@ai-rpg-engine/equipment';
import { createGame } from '@ai-rpg-engine/starter-gladiator';

const engine = createGame();
engine.submitAction('equip');                 // the player equips their unique gear

// Read the unique-gear snapshot (pure, read-only — the firewall).
const catalog  = engine.formulas.get(EQUIPMENT_CATALOG_FORMULA)();
const snapshot = equipmentSnapshotFromWorld(engine.world, engine.world.playerId, catalog);

// At a checkpoint: mint each unique item as an NFT to the player.
const transport = new TestnetTransport();
const issuer = await transport.fundWallet();
const player = await transport.fundWallet();
const state  = createInitialState({ ...DEFAULT_LEDGER_CONFIG, mode: 'ledger' });
state.issuerAddress = issuer.address;
state.playerAddress = player.address;

await settleEquipmentNFTs(transport, state, snapshot, {
  gameId: 'iron-colosseum',
  issuerAddress: issuer.address, playerAddress: player.address,
  issuerSeed: issuer.seed,       playerSeed: player.seed,
});
```

`settleEquipmentNFTs` is a small state machine, keyed one `NFTokenRef` per
`gameItemId`:

- **No ref yet** → **mint** the NFT (`buildItemNFTUri` at the item's current relic
  version), then transfer issuer → player. The ref is written `status: 'pending'`
  *before* the transfer, so a fail-then-retry **resumes the transfer and never
  re-mints** — the one-of-one analogue of the fungible layer's conservation-on-retry.
- **Ref exists, relic version advanced** → **`NFTokenModify`** the URI in place.
- **Ref exists, unchanged** → no-op.

## Reconciliation verifies ownership

The fungible reconciler checks balances and conservation. The NFT reconciler adds
a **1-of-1 ownership family**: for each tracked `NFTokenRef`, `reconcile()`
confirms — against on-ledger `account_nfts` — that the **player owns the NFT** and
that its **on-chain URI matches the relic version the engine expects**. Either
mismatch fails the whole report; there is no vacuous pass without on-ledger
evidence. The ledger is a different system family than the engine, so the engine
cannot fake unique-gear ownership any more than it can fake a token balance — a
genuine external verifier.

## Relic growth is dormant on shipped content (today)

An honest boundary: relic growth is driven by the `equipment` package's
**item-chronicle**, and no shipped game populates a chronicle in its running world
state yet. So on real content today, every item's relic version is `0` — **mint
manifests, growth does not**. The read path takes the chronicle as an optional
input (empty by default), and the growth → `NFTokenModify` path is proven live on
testnet and in the dry-run suite. Wiring the chronicle into play is a separate,
future engine feature — the adapter never touches the tick to do it.

## The gladiator demo — a real played session

The load-bearing proof is the real, unmodified `starter-gladiator` game
(`Iron Colosseum`), driven from outside at L0. The player is issued a
`trident-and-net`; a bare `equip` readies it. Then, entirely outside the engine:

1. `equipmentSnapshotFromWorld` reads the equipped trident (one unique item).
2. `settleEquipmentNFTs` mints it as an NFT and transfers it to the player.
3. `account_nfts` confirms the player owns it; `reconcile()` passes — the on-chain
   URI `ARPG-NFT|GAME:iron-colosseum|ITEM:trident-and-net|RELIC:0|TIER:0|V:1`
   matches the engine's expectation.
4. **The engine's serialized world is byte-identical before and after** the whole
   flow — the firewall, on real content.

### Run it yourself

```bash
npm run build
node packages/ledger-adapter/scripts/gladiator-nft-live-replay.mjs
```

The script drives the real gladiator game, faucets a testnet issuer + player,
mints the equipped gear as an NFT, reconciles against on-ledger `account_nfts`,
and asserts the world is unperturbed. It exits `0` only if every stage passes, and
writes a receipt with every transaction hash to
`scripts/gladiator-nft-live-replay-receipt.json`. Every transaction is viewable on
the [XRPL testnet explorer](https://testnet.xrpl.org/).

## Why this exists

Unique gear is where on-chain ownership matters most — a player's relic, earned
over a campaign, is exactly the kind of asset worth truly owning. Binding it to a
mutable NFT lets that item *evolve on-chain* while keeping one stable identity,
and the determinism firewall means a game can offer all of it **without** giving
up its seed-0 byte-exact replayable core. Build for the future; keep the invariant.
