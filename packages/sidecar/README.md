<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="300" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ai-rpg-engine/sidecar"><img src="https://img.shields.io/npm/v/@ai-rpg-engine/sidecar.svg" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# @ai-rpg-engine/sidecar

**One authoritative simulation process. Any number of rendering clients.**

Run the AI RPG Engine as a JSON-RPC server over stdio, and talk to it from a
renderer that is not a terminal — a game client, an editor, a debug overlay, a
test harness. The client submits intents; the simulation decides; events come
back tick-stamped with a per-tick state hash.

The point is what stays true across the process boundary: a scripted session run
over the wire produces a **byte-identical** event stream and the same end-state
hash as the same session run in-process.

## Install

```bash
npm install @ai-rpg-engine/sidecar
```

## Run a simulation as a server

```bash
ai-rpg-engine sidecar chapel-threshold --seed 71
```

`stdout` carries framed protocol messages only; diagnostics go to `stderr`.

## Talk to it

```ts
import { MessageReader, encodeMessage, METHODS } from '@ai-rpg-engine/sidecar';

// 1. Handshake. Capabilities are exchanged — there is no protocol version.
await request(METHODS.INITIALIZE, {
  clientName: 'my-renderer',
  clientVersion: '1.0.0',
  capabilities: { notifications: true, hashes: true },
});

// 2. Load the world. A snapshot is a delta from an empty baseline, produced by
//    the same serializer as every incremental update.
const snap = await request(METHODS.SNAPSHOT);
let world = applyPatches({}, snap.delta);

// 3. Submit an intent. The simulation validates it; the client never decides.
const result = await request(METHODS.SUBMIT_ACTION, { verb: 'move' });

// 4. Tick notifications arrive as server PUSH, carrying events, a state delta,
//    and the hash you use to detect staleness.
```

## Design

| Property | Shape |
|---|---|
| **Commands in, events out** | The client submits intents; the simulation resolves them. Nothing the client knows reaches the sim except as an explicit command. |
| **Capabilities, not versions** | `initialize` exchanges capability flags, so a partial client and a fuller server interoperate without either bumping a number. |
| **Push, not poll** | Derived state arrives as tick-stamped notifications. Clients never gate tick advancement. |
| **One serializer** | A snapshot is `diff({}, state)` — the incremental path against an empty baseline. Snapshot and stream cannot diverge, because there is only one of them. |
| **Per-tick hashes** | Clients detect staleness and report it. They never correct the simulation. |
| **Strict in, tolerant out** | Unknown commands *and* unknown command fields are refused: a silently dropped field means the sim ran a different intent than you submitted. Events only ever gain fields, so a client that ignores what it does not know loses nothing. |
| **Additive-only events** | With a reserved graveyard, so a removed field's name is never recycled with a new meaning. |
| **Side-effect-free preview** | Run a command on a copy, get the events, discard. The world hash before equals the world hash after. |

Transport is a constructor argument. `stdio.ts` is the only module that names
one, so a socket server is the same two calls with a different pair of streams.

## Methods

| Method | Purpose |
|---|---|
| `initialize` | Capability handshake. Required first. |
| `snapshot` | The whole world, as a delta from empty. |
| `submitAction` | Submit a player intent. |
| `advance` | Advance the world without a player action. |
| `preview` | Evaluate a command with no side effects. |
| `replay` | Re-emit a closed tick window. Idempotent by `(tick, event id)`. |
| `shutdown` | Orderly stop. |

Notifications: `sim/tick` (events + delta + hash), `sim/closing`.

## License

MIT
