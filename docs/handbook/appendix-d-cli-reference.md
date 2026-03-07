# Appendix D — CLI Reference

All commands and flags.

## Commands

### `signalfire run`

Start a game session.

```bash
signalfire run [--starter <name>] [--seed <number>]
```

| Flag | Description |
|------|-------------|
| `--starter` | Starter world to load (default: fantasy) |
| `--seed` | Random seed for deterministic sessions |

### `signalfire replay`

Replay a recorded session.

```bash
signalfire replay [--file <path>] [--verbose]
```

| Flag | Description |
|------|-------------|
| `--file` | Path to action log file |
| `--verbose` | Print all events during replay |

### `signalfire inspect-save`

Print a save file in readable format.

```bash
signalfire inspect-save [--file <path>] [--section <name>]
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
