---
title: "Appendix D — CLI Reference"
description: "Appendix D — CLI Reference"
sidebar:
  order: 29
---


All commands and flags.

## Commands

### `ai-rpg-engine run`

Start a game session.

```bash
ai-rpg-engine run [--starter <name>] [--seed <number>]
```

| Flag | Description |
|------|-------------|
| `--starter` | Starter world to load (default: fantasy) |
| `--seed` | Random seed for deterministic sessions |

### `ai-rpg-engine replay`

Replay a recorded session.

```bash
ai-rpg-engine replay [--file <path>] [--verbose]
```

| Flag | Description |
|------|-------------|
| `--file` | Path to action log file |
| `--verbose` | Print all events during replay |

### `ai-rpg-engine inspect-save`

Print a save file in readable format.

```bash
ai-rpg-engine inspect-save [--file <path>] [--section <name>]
```

| Flag | Description |
|------|-------------|
| `--file` | Path to save file |
| `--section` | Filter to a specific section (entities, zones, modules) |

## Development Commands

### `npm run build`

Build all packages.

```bash
npx tsc --build
```

### `npm test`

Run the full test suite.

```bash
npx vitest run
```

### `npm run test:watch`

Run tests in watch mode during development.

```bash
npx vitest
```
