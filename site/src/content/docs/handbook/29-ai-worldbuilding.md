---
title: "Chapter 26 — AI-Assisted Worldbuilding"
description: "Using the Ollama package to scaffold, diagnose, and repair simulation content"
sidebar:
  order: 29
---


> Part VIII — Future Directions

The `@ai-rpg-engine/ollama` package connects to a local [Ollama](https://ollama.ai) instance to assist with content creation and simulation inspection. It never mutates engine state directly — AI assists, the engine governs.

## Philosophy

Three rules govern the AI layer:

1. **Stdout-first.** All output goes to stdout by default. Use `--write <path>` only when you're ready to persist.
2. **Schema before trust.** Generated YAML is validated against engine schemas. Invalid output is flagged, not silently accepted.
3. **Soft failure.** Commands return `{ ok: false, error }` instead of throwing. The tool never crashes your pipeline.

## Install

```bash
npm install @ai-rpg-engine/ollama
```

Requires a running Ollama instance (default: `http://localhost:11434`).

## Three Workflows

### Scaffold

Generate content from a theme description. The AI produces engine-schema-compliant YAML.

**Single objects:**
```bash
ai create-room     --theme "haunted library"
ai create-district  --theme "underground fungal caverns"
ai create-faction   --theme "paranoid merchant cartel"
ai create-quest     --theme "investigate disappearances"
```

**Bundles** — coherent multi-object sets in a single prompt call:
```bash
# District + 2-4 rooms with interconnected zones
ai create-location-pack --theme "coastal watchtower" --factions harbor_watch

# Room + 1-3 entities + quest seed
ai create-encounter-pack --theme "goblin ambush" --difficulty medium
```

Bundles produce more coherent content than generating objects separately because the model sees the full context.

### Diagnose

Explain what the simulation is doing in narrative terms.

```bash
# Why do these two NPCs believe different things?
echo '{"traceA":{...},"traceB":{...}}' | ai explain-belief-divergence

# What's happening in this district?
echo '{"districtId":"harbor_quarter","metrics":{...}}' | ai explain-district-state

# Why is this faction on high alert?
echo '{"factionId":"temple_guard","alertLevel":72,...}' | ai explain-faction-alert

# Summarize a belief trace (plain, forensic, or author format)
cat belief-trace.json | ai summarize-belief-trace --format forensic

# Explain validation errors or lint findings
cat errors.json | ai explain-validation-error
cat lint.json   | ai explain-lint
```

### Repair

Commands that produce schema-validated content (`create-room`, `create-quest`) support `--repair`:

```bash
ai create-room --theme "haunted library" --repair
# Repaired: 3 validation error(s) fixed.
```

The repair loop:
1. Generate content from the theme
2. Validate against the engine schema
3. If invalid and `--repair` is set: feed validation errors back to the model
4. Single correction pass — not an infinite retry loop
5. Result includes a `repairNote` explaining what happened

## Writing to Files

By default, output goes to stdout. This keeps generation safe and composable — pipe through `less`, `jq`, or into another tool.

When you're ready to persist:

```bash
ai create-location-pack --theme "dwarven forge" --write content/locations/forge.yaml
```

`--write` creates parent directories automatically. The file path confirmation goes to stderr.

## Command Reference

### Scaffold Commands

| Command | Input | Output |
|---------|-------|--------|
| `create-room` | `--theme` | Room YAML (validated, repairable) |
| `create-district` | `--theme` | District config YAML |
| `create-faction` | `--theme` | Faction config YAML |
| `create-quest` | `--theme` | Quest YAML (validated, repairable) |
| `create-location-pack` | `--theme` | District + rooms bundle |
| `create-encounter-pack` | `--theme` | Room + entities + quest bundle |

### Diagnose Commands

| Command | Input | Output |
|---------|-------|--------|
| `explain-validation-error` | JSON via stdin | Plain text explanation |
| `explain-lint` | JSON via stdin | Plain text explanation |
| `explain-belief-divergence` | JSON via stdin | Divergence analysis |
| `explain-district-state` | JSON via stdin | District narrative |
| `explain-faction-alert` | JSON via stdin | Alert explanation |
| `summarize-belief-trace` | JSON via stdin | Trace summary |

### Common Flags

| Flag | Description |
|------|-------------|
| `--theme <text>` | Theme for content generation |
| `--model <name>` | Ollama model (default: `qwen2.5-coder`) |
| `--url <url>` | Ollama base URL (default: `http://localhost:11434`) |
| `--repair` | Attempt single-pass fix on validation failure |
| `--write <path>` | Write to file instead of stdout |
| `--format <fmt>` | Output format: `plain`, `forensic`, `author` |
| `--factions <ids>` | Comma-separated faction IDs for context |
| `--districts <ids>` | Comma-separated district IDs for context |
| `--difficulty <level>` | Encounter difficulty hint |

## Programmatic API

All commands are available as typed async functions:

```typescript
import { createClient, resolveConfig, createLocationPack, explainDistrictState } from '@ai-rpg-engine/ollama';

const client = createClient(resolveConfig());

// Scaffold
const pack = await createLocationPack(client, {
  theme: 'abandoned dwarven mine',
  factions: ['miners_guild'],
});
if (pack.ok) console.log(pack.yaml);

// Diagnose
const explanation = await explainDistrictState(client, {
  districtId: 'harbor_quarter',
  metrics: { alertPressure: 65, rumorDensity: 40, intruderLikelihood: 20, surveillance: 55, stability: 0.4 },
  threatLevel: 52,
  onAlert: true,
});
if (explanation.ok) console.log(explanation.text);
```

## Model Selection

The default model is `qwen2.5-coder`. Override per-command with `--model` or globally via environment:

```bash
export AI_RPG_ENGINE_OLLAMA_MODEL=deepseek-coder-v2
export AI_RPG_ENGINE_OLLAMA_URL=http://localhost:11434
export AI_RPG_ENGINE_OLLAMA_TIMEOUT_MS=30000
```

## Design Principles

The AI layer follows the same philosophy as the engine:

- **AI suggests, the engine decides.** Generated content is a draft. Schema validation is the gatekeeper.
- **No core contamination.** The ollama package depends on core and content-schema for types and validators, but the engine has no knowledge of AI. Removing the package changes nothing.
- **No CI/model drag.** All tests use a mocked client. No live Ollama instance is required in CI.
- **Zero external dependencies.** Uses native `fetch` and `AbortSignal.timeout`. No YAML parser dependency — a minimal inline parser handles the subset the engine schemas use.
