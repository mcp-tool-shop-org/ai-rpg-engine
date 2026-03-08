# Appendix D — CLI Reference

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

## In-Session Commands

Commands available during a game session. Play-mode commands do not consume a turn.

### Play Mode

| Command | Description |
|---------|-------------|
| `/help` | Verb reference — available actions and how to use them |
| `/help leverage` | Full leverage sub-action reference with costs and cooldowns |
| `/help <pack-id>` | Pack-specific quickstart card (e.g. `/help chapel-threshold`) |
| `/status` | Compact strategic snapshot: character, leverage, threat, suggested move |
| `/map` | Strategic map: districts, factions, hotspots, vulnerabilities |
| `/leverage` | Current leverage currencies with cooldown status |
| `/director` or `/d` | Enter director mode |
| `quit` or `exit` | End session |

### Director Mode

Inspect the simulation truth — hidden state, faction internals, belief provenance.

| Command | Description |
|---------|-------------|
| `/inspect <entity-id>` | Show entity cognition state |
| `/faction <faction-id>` | Show faction beliefs and alert |
| `/zone <zone-id>` | Show zone properties |
| `/trace <entity> <subject> <key>` | Trace belief provenance |
| `/rumors [faction-id]` | Show player rumors (optionally filtered) |
| `/pressures` | Show active world pressures |
| `/world` | Show resolved pressures and fallout |
| `/factions` | Show faction agency (goals, actions, profiles) |
| `/leverage` | Show player leverage currencies |
| `/map` | Show strategic map (districts + factions) |
| `/status` | Compact strategic snapshot |
| `/stats` | Session balance metrics (action counts, leverage flow) |
| `/chronicle [mode]` | View campaign chronicle (timeline\|bardic\|director) |
| `/history [entity-id]` | View event history for an entity |
| `/snapshot` | Full simulation snapshot |
| `/divergences` | Show perception divergences |
| `/help [subcommand]` | Help (leverage reference, pack quickstart) |
| `/back` or `/b` | Return to play mode |

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
