---
title: "Chapter 66 — Visual Clients"
description: "Sidecar hosts, the felt payload, and the Godot 4 dimetric client — presentation may lie, occupancy stays a zone id."
sidebar:
  order: 66
---

> Part VIII — Debugging and Tools / Hosts

The engine is a **composition simulation**. It does not draw pixels. A host attaches over the sidecar, submits intents, and renders events. The terminal `run` loop is one host. The Godot 4 client [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage) is another.

This chapter is the contract those hosts share. It is not a Godot tutorial.

## Truth stays in the sim

- Occupancy is **zone-id**. `move` takes an adjacent zone id. There is no cell, path, or pixel in `WorldState`.
- Presentation may lie: a sprite can tween, a camera can shake, a toast can flash. Those lies are never hashed.
- Hash mismatch means the client is stale. The client announces it and re-snapshots. It never patches the sim.

Chapter 51 (zone positioning) is the combat overlay on that same zone graph. A dimetric diamond under a click is a **view** of a zone, not a second spatial sim.

## Sidecar attach

`@ai-rpg-engine/sidecar` is JSON-RPC over stdio or localhost TCP. Godot must attach over TCP (upstream stdio pipes are buggy: godot#102340).

Handshake capabilities are additive:

| Flag | What the host gets |
|---|---|
| `hashes` / `canonicalHashes` | Per-tick staleness |
| `presentation` | `presentAll` events, FOW applied |
| `audio` | `felt` payload on submit / advance / matching `sim/tick` |

`felt` is `AudioCommand[]` (cue ids; overlay stings do not replace the zone stem), optional `speaker` (the spoken line once), and `uiEffects`. It is omitted when `audio` is off so exact-match clients stay stable. It is **never** in the state hash. Writers play it from the submit/advance result and ignore `sim/tick.felt` so overlay stings do not double. Observers never get those RPC results; they play the tick.

`audio` negotiation ships from **v3.12.0**. A host that does not ask for it sees the same
bytes it saw before, which is the point of an additive capability.

A `--content` sidecar boot still needs `--manifest` (`SIDECAR_MANIFEST_REQUIRED`).

## The Godot client (ai-rpg-stage)

Play camera is **2:1 dimetric**, not Octopath fourth-wall interiors and not a graph of postage-stamp rectangles.

- TileMapLayer, `TILE_SHAPE_ISOMETRIC`, `TILE_LAYOUT_DIAMOND_DOWN`, 256×128.
- Foundry HD characters: 8 directions, pivot `[0.5, 1]`, albedo / normal / mask / depth. Depth has no Godot 2D consumer yet.
- Buildings are plates that pass a projection ANDON, then slice into 128 px strips so Y-sort is one drawable per diamond. Multi-cell tiles are the wrong slice (Godot #92682).
- Contact blob at the actor's `z_index` with `show_behind_parent`. Not `z_index -1` (that draws under the floor).
- Click a diamond to walk **inside** the current zone (presentation, fixed speed, not hashed). A click in a neighbour zone submits `move`. A reject faces the door and does not walk back — the actor never left.
- HUD is a plaque (zone + doors) plus a short toast. The prose log is summoned, not a panel that eats the dirt.
- Do not put `CharacterBody2D` WASD on this client. That is a second physics world.

Art for the town kit is authored outside the engine (Blender orthographic camera at X 60° / Z 45°, Film Transparent). The engine does not generate tiles.

## Lie budget (what a client may do)

**Hashed:** `zoneId`, facing bucket at rest, who is in which zone at tick T.

**Allowed lies:** destination highlight on the input frame; walk tween after a committed zone change; camera trauma and HUD flash from `felt.uiEffects`; intra-zone walking that the sim never hears.

**Forbidden:** analog velocity as truth; hashing tween `t`; interpolating occupancy; a physics body that collides independently; juice that writes hashed entity/zone state.

## Where the lever lives

A host does not grow a new room by drawing one. Salt Road is the worked example: the harbour you can walk is three layers, and each lever has one owner.

| Lever | Owner | Reaches this engine? |
|---|---|---|
| Zone graph, neighbours, gate reason | World Forge, then `ContentPack.zones` | Yes. The gate is enforced here. The host only prints the reason. |
| Who is in which zone | `entityPlacements` → placements | Yes. Hashed. |
| Give an item to an entity | `itemPlacements` of `{ itemId, entityId }` | Yes. A prop standing on a floor is not this record. |
| Dimetric cell, facing, floor plate | `WorldProject.presentation` | No. Not a `ContentPack` key. The stage pack carries it. |
| Cue playback, camera shake | host, from the `felt` payload | The cue id is composed here and never hashed. The wav and the shake stay in the host. |

The authoring map is [World Forge's levers](https://mcp-tool-shop-org.github.io/world-forge/handbook/levers/) and the stage's [authoring levers](https://mcp-tool-shop-org.github.io/ai-rpg-stage/handbook/levers/).

## What this is not

- Not a grid combat engine. If a pack needs cells in the sim, that is a future occupancy module, not a Godot feature.
- Not permission to mix 2D Foundry packs with GridMap + Sprite3D on the same actors.
- Not a replacement for the terminal player. `run` remains the shipped no-GPU path.
