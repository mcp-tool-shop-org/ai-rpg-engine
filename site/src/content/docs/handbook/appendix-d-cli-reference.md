---
title: "Appendix D — CLI Reference"
description: "Every command and flag the ai-rpg-engine CLI actually dispatches"
sidebar:
  order: 29
---

The `@ai-rpg-engine/cli` package ships one binary, `ai-rpg-engine`. Run it after installing the package, or straight from npm with `npx`:

```bash
# installed (global or as a dev dependency)
ai-rpg-engine <command>

# without installing
npx @ai-rpg-engine/cli <command>
```

With no command, the CLI runs `run` (starts a new game). Every command below is dispatched by [`packages/cli/src/bin.ts`](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/packages/cli/src/bin.ts).

> The optional AI design studio is a **separate** binary, `ai`, from
> `@ai-rpg-engine/ollama` — see [Chapter 36](36-ai-worldbuilding). This appendix
> documents the game CLI (`ai-rpg-engine`) only.

## Commands at a glance

| Command | Purpose |
|---------|---------|
| `run` *(default)* | Start a new interactive game — pick a starter, create a character, play |
| `validate <file.json>` | Validate a content-pack JSON file (errors + advisories) |
| `scaffold <kind> <name>` | Write a minimal, valid content stub (ability / zone / quest / status / dialogue) |
| `profile validate <file.json>` | Validate a profile or profile-set JSON |
| `profile scaffold <name>` | Write a starter profile stub |
| `create-starter <name>` | Scaffold a new starter package from the published template |
| `replay` | Load the save file and restore its state (`--replay` re-simulates the action log) |
| `inspect-save` | Print a summary of the save file |
| `version` | Print the version |
| `help` | Show top-level help |

## Global flags

| Flag | Effect |
|------|--------|
| `--version`, `-v` | Print the version and exit (same as the `version` command) |
| `--help`, `-h` | Show help and exit (same as the `help` command) |

`create-starter`, `validate`, `scaffold`, and `profile` own their own help screens — `ai-rpg-engine <command> --help` prints that command's help rather than the top-level help.

---

## `run`

```bash
ai-rpg-engine run     # or just: ai-rpg-engine
```

Starts a new game interactively. There are **no `--starter` or `--seed` flags** — you choose a starter world from a menu and build your character through the character-creation prompts, then play.

Inside a session, type a listed action's number to select it, or use these commands:

| Input | Action |
|-------|--------|
| `move`, `inspect`, `attack`, `speak`, `use` | Natural-language actions (parsed against the current world) |
| *a number* | Select the numbered action (or, in dialogue, the numbered choice) |
| `save` | Write the current game to `.ai-rpg-engine/save.json` |
| `help` | List the in-session commands |
| `quit`, `exit` | Leave the game |

A buggy custom module that throws mid-turn cannot crash an unsaved session — the action is reported as `That action could not be completed: <reason>` and the prompt continues, so you can still `save` or `quit`.

---

## `create-starter`

```bash
ai-rpg-engine create-starter <name> [--force] [--out=<dir>]
```

Scaffolds a new starter package from the published `@ai-rpg-engine/starter-template`. The generated starter wires combat with `buildCombatStack` and includes a marked starter-owned-systems section.

| Flag | Effect |
|------|--------|
| `--out=<dir>` | Target directory (default: `packages/starter-<name>`) |
| `--force` | Overwrite an existing target (clears it first) |

The `<name>` must be lowercase alphanumeric segments separated by single hyphens (e.g. `space-opera`) — no leading digit, no leading/trailing/consecutive hyphens. The generated scaffold is validated before it is returned; on validation failure the freshly written files are cleaned up so no half-written scaffold is left behind. See [Chapter 58 — Create Your Own Starter](./58-create-your-own-starter.md).

---

## `validate`

```bash
ai-rpg-engine validate <file.json>
```

Loads a content-pack JSON file and validates it against the engine schemas (`loadContent` + `validateGameContent`). Output:

- **Errors** print as `✗ <path>: <message>` — the message carries the actionable hint inline.
- **Advisories** print in a separate section and never affect the exit code.

**Exit code:** `0` when valid, `1` when there are errors (or a usage problem).

```bash
ai-rpg-engine validate ./content/zones.json
```

---

## `scaffold`

```bash
ai-rpg-engine scaffold <kind> <name> [--force] [--out=<file>]
```

Writes a minimal, valid content stub you can fill in — the stub passes `ai-rpg-engine validate` out of the box.

| Argument / flag | Meaning |
|-----------------|---------|
| `<kind>` | One of: `ability`, `zone`, `quest`, `status`, `dialogue` |
| `<name>` | Lowercase hyphen-separated id (e.g. `fire-bolt`) |
| `--out=<file>` | Output path (default: `<name>.json`) |
| `--force` | Overwrite an existing file |

```bash
ai-rpg-engine scaffold ability fire-bolt
ai-rpg-engine scaffold zone harbor-district --out=./content/harbor.json
ai-rpg-engine scaffold status on-fire --force
```

---

## `profile`

Validate and scaffold [Plug-in Profile](./59-plugin-profiles.md) files.

```bash
ai-rpg-engine profile validate <file.json>
ai-rpg-engine profile scaffold <name> [--force] [--out=<file>]
```

**`profile validate <file.json>`** accepts a single profile object, an array of profiles, or `{ "profiles": [ … ] }`. It runs the real library validators:

- Per-profile **build warnings** (`buildProfile`) — printed, never block.
- Cross-profile **errors** (`validateProfileSet` — duplicate profile ids, duplicate ability ids, conflicting resource caps) — **exit code 1**.
- Cross-profile **advisories** — printed separately, never block.

**`profile scaffold <name>`** writes `<name>.profile.json` (override with `--out=<file>`); the stub passes `profile validate` with zero errors and zero warnings. `--force` overwrites.

```bash
ai-rpg-engine profile scaffold storm-mystic
ai-rpg-engine profile validate storm-mystic.profile.json
```

---

## `replay`

```bash
ai-rpg-engine replay [--replay]
```

Loads the save at `.ai-rpg-engine/save.json`, selects the starter pack whose id matches the saved `gameId`, and prints the restored final tick, player location, and resources.

- **Default:** restores the saved world state (entities, event log, globals, RNG state) into a fully wired engine.
- **`--replay`:** instead re-simulates the saved action log through a fresh game (`Re-simulating N actions…` → `Replay complete.`).

Fails with exit code `1` (and a structured `[CODE]` message + hint) if there is no save file, the save is corrupt JSON, no installed pack matches the saved `gameId`, or the save fails to deserialize. See [Chapter 33 — Deterministic Replay](./33-deterministic-replay.md).

---

## `inspect-save`

```bash
ai-rpg-engine inspect-save
```

Prints a summary of `.ai-rpg-engine/save.json` without loading a full engine:

```
Game: <gameId>
Tick: <tick>
Seed: <seed>
Location: <locationId>
Entities: <count>
Events: <count>
Actions: <count>
Globals: <json>
```

---

## `version` / `help`

```bash
ai-rpg-engine version    # or --version / -v
ai-rpg-engine help       # or --help / -h
```

---

## Notes

- **Save file location.** The interactive `save` command, `replay`, and `inspect-save` all use `.ai-rpg-engine/save.json` relative to the current working directory. There is no `--file` flag — the path is fixed.
- **Structured errors.** Command failures print a single bounded line in the engine's `[CODE] message` + `Hint:` shape; a raw stack never escapes. CLI commands that can fail set a non-zero exit code.
- **Determinism.** `validate`, `scaffold`, and `profile` are pure functions of their inputs (no clock, RNG, or network), and every scaffold writes byte-identical bytes for the same inputs.

## Development commands

For working inside the monorepo:

```bash
npx tsc --build     # build all packages
npx vitest run      # run the full test suite
npx vitest          # watch mode
```
