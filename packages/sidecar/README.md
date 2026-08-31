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
import { MessageReader, encodeMessage, METHODS, connectSocketClient } from '@ai-rpg-engine/sidecar';

// 1. Handshake. Capabilities are exchanged — there is no protocol version.
await request(METHODS.INITIALIZE, {
  clientName: 'my-renderer',
  clientVersion: '1.0.0',
  capabilities: { notifications: true, hashes: true, canonicalHashes: true },
});

// 2. Load the world. A snapshot is a delta from an empty baseline, produced by
//    the same serializer as every incremental update. Call this before listening
//    for sim/tick — incremental ticks are withheld until SNAPSHOT (snapshotSeq).
const snap = await request(METHODS.SNAPSHOT);
let world = applyPatches({}, snap.delta);

// 3. Submit an intent. The simulation validates it; the client never decides.
const result = await request(METHODS.SUBMIT_ACTION, { verb: 'move' });

// 4. Tick notifications arrive as server PUSH, carrying events, a state delta,
//    and the hash you use to detect staleness. Drop ticks whose snapshotSeq is
//    below the last applied snapshot.
```

A JS host attaching over TCP should use the exported helper, not copy test glue:

```ts
const { client } = await connectSocketClient(7731);
await client.initialize({ notifications: true, hashes: true, canonicalHashes: true });
await client.snapshot();
```

### Godot attach (TCP, not stdio pipes)

GDScript subprocess pipes are documented-buggy upstream (godot#102340). Attach
over localhost TCP — the same wire Godot's own editor uses. The shipped host kit
lives in `gdscript/` (`SidecarFraming` + `SidecarAttachClient`).

```bash
ai-rpg-engine sidecar chapel-threshold --seed 71 --listen 7731
```

```gdscript
var client := SidecarAttachClient.new()
client.connect_to_host("127.0.0.1", 7731)
var init_id := client.initialize({
  "notifications": true,
  "hashes": true,
  "canonicalHashes": true,  # cross-language hash; do not JSON.stringify
  "writes": true,           # false = observer overlay (ticks only)
  "listActions": true,
  "presentation": true,     # presentAll + FOW; omit for raw ticks
})
# await client.completed for init_id, then:
client.snapshot({ "omitEventLog": true })  # replay covers presentation
client.advance(1)  # sends METHOD_ADVANCE with a JSON-RPC id
# per-frame: client.poll()  # watches StreamPeerTCP.get_status(); STATUS_NONE/ERROR emits closing and clears _pending
# Save is Engine.serialize (rngState + actionLog), not a SNAPSHOT delta:
# client.save() / client.load_save(serialized)
```

## Design

| Property | Shape |
|---|---|
| **Commands in, events out** | The client submits intents; the simulation resolves them. Nothing the client knows reaches the sim except as an explicit command. |
| **Capabilities, not versions** | `initialize` exchanges capability flags, so a partial client and a fuller server interoperate without either bumping a number. |
| **Push, not poll** | Derived state arrives as tick-stamped notifications. Clients never gate tick advancement. |
| **One serializer** | A snapshot is `diff({}, state)` — the incremental path against an empty baseline. Snapshot and stream cannot diverge, because there is only one of them. |
| **Per-tick hashes** | Clients detect staleness and report it. They never correct the simulation. `SidecarClient` records `stalenessReports` and fires an optional `onStale` hook (and a stderr line if you omit the hook). Hosts must call `snapshot()` on staleness and re-render from that delta — never patch the mirror locally. |
| **Strict in, tolerant out** | Unknown commands *and* unknown command fields are refused: a silently dropped field means the sim ran a different intent than you submitted. Events only ever gain fields, so a client that ignores what it does not know loses nothing. Methods are request/response: a known method with no JSON-RPC `id` is refused and does not run. `shutdown` is the one fire-and-forget exception (an orderly stop should still run if the id was dropped). |
| **Additive-only events** | With a reserved graveyard, so a removed field's name is never recycled with a new meaning. |
| **Side-effect-free preview** | Run a command on a copy, get the events, discard. The world hash before equals the world hash after. |

Transport is a constructor argument. `stdio.ts` is the only module that names
one, so a socket server is the same two calls with a different pair of streams.
Attach (TCP) logs framing errors, bind address/port, accepts, cap-refusals, and
disconnects to stderr by default — the same visibility stdio already had for
framing. Pass a hook to replace a default; you do not have to opt the library
into logging.

`SidecarClient.request` times out (30s default) and `sim/closing` / `disconnect()`
reject every in-flight Promise with `SESSION_CLOSED`, so a dead peer cannot hang
the renderer.

## Methods

| Method | Purpose |
|---|---|
| `initialize` | Capability handshake. Required first. Returns `packId` / `playerId` additively. |
| `snapshot` | The whole world, as a delta from empty. Optional `omitEventLog` / `collections` window the resync. |
| `submitAction` | Submit a player intent. Optional `actorId` (else `world.playerId`). Observers (`writes: false`) are refused. |
| `advance` | Advance the world without a player action. Observers refused. |
| `preview` | Evaluate a command with no side effects. |
| `replay` | Re-emit a closed tick window. Optional `typePrefix` / `actorId` / `limit` via `queryEvents`. |
| `listActions` | Legal-action catalog (`getAvailableActionsFor`). Observers may call it. |
| `save` | `Engine.serialize` checkpoint (rngState + actionLog). Not a SNAPSHOT delta. Writers only. |
| `load` | `Engine.deserialize`, rebase every live session, push a snapshot-shaped baseline. Writers only. |
| `shutdown` | Orderly stop. May omit `id` (fire-and-forget). Observers refused. |

Notifications: `sim/tick` (events + delta + hash + `snapshotSeq`; `canonicalHash` when negotiated), `sim/closing`.

`initialize` capabilities: `notifications`, `hashes`, `canonicalHashes` (second hash, never a replacement for the JS `hash`), `writes` / `role` (`writer` \| `observer`), `listActions`, `presentation` (tick/replay events are `engine.presentAll`; hidden events dropped). Incremental ticks are withheld until that session has served `snapshot`. Two `writes: true` sessions serialize mutations by session-order then JSON-RPC id.

## License

MIT
