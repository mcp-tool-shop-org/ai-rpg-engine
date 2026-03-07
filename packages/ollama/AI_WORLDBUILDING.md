# AI Worldbuilding Handbook

> How to use `@ai-rpg-engine/ollama` to scaffold, diagnose, and repair simulation content.

## Philosophy

The engine is the lawful keeper of reality. AI assists humans in *creating* and *understanding* the world — it never mutates canonical simulation truth directly.

**Three rules:**
1. **Stdout-first.** All output goes to stdout by default. Use `--write <path>` explicitly when you're ready to persist.
2. **Schema before trust.** Generated YAML is validated against engine schemas. Invalid output is flagged, not silently accepted.
3. **Soft failure.** Commands return `{ ok: false, error }` instead of throwing. The tool never crashes your pipeline.

---

## Workflows

### 1. Scaffold a Location

Generate a coherent district with rooms:

```bash
# Single district
ai create-district --theme "underground fungal caverns" --factions underdark_cult

# Full location pack (district + rooms + connected zones)
ai create-location-pack --theme "abandoned dwarven mine" --factions miners_guild,deep_crawlers

# Write directly to a content file
ai create-location-pack --theme "coastal watchtower" --write content/locations/watchtower.yaml
```

### 2. Scaffold an Encounter

Generate a room, enemies, and a quest seed in one shot:

```bash
# Basic encounter
ai create-encounter-pack --theme "goblin ambush in the forest" --difficulty medium

# With district and faction context
ai create-encounter-pack \
  --theme "temple heist gone wrong" \
  --district temple_ward \
  --factions temple_guard,thieves_guild \
  --difficulty hard
```

### 3. Build a Faction

```bash
ai create-faction --theme "paranoid merchant cartel" --districts harbor_quarter,market_square
```

### 4. Scaffold a Quest

```bash
# Generate with auto-repair
ai create-quest \
  --theme "investigate disappearances in the lower ward" \
  --factions city_watch,shadow_court \
  --districts lower_ward \
  --repair
```

### 5. Diagnose Validation Errors

Pipe errors from the engine's validator:

```bash
cat validation-errors.json | ai explain-validation-error
```

### 6. Diagnose Lint Findings

```bash
cat lint-output.json | ai explain-lint
```

### 7. Inspect District State

Pipe runtime district metrics for a narrative explanation:

```bash
echo '{"districtId":"harbor_quarter","metrics":{"alertPressure":65,"rumorDensity":40,"intruderLikelihood":20,"surveillance":55,"stability":0.4},"threatLevel":52,"onAlert":true}' | ai explain-district-state
```

### 8. Inspect Faction Alert

```bash
echo '{"factionId":"temple_guard","alertLevel":72,"cohesion":0.85,"beliefs":[{"subject":"player","key":"hostile","value":true,"confidence":0.9}]}' | ai explain-faction-alert
```

### 9. Compare Belief Divergence

When two NPCs believe different things about the same subject:

```bash
echo '{"traceA":{...},"traceB":{...}}' | ai explain-belief-divergence
```

### 10. Summarize a Belief Trace

```bash
cat belief-trace.json | ai summarize-belief-trace --format forensic
```

Formats: `plain` (default), `forensic` (step-by-step with tick numbers), `author` (narrative for content writers).

---

## Repair Loop

Commands that produce schema-validated content (`create-room`, `create-quest`) support `--repair`:

1. First pass: generate content from the theme
2. Validate against the engine schema
3. If invalid and `--repair` is set: feed validation errors back to the model
4. Second pass: model attempts to fix the errors
5. Result includes `repairNote` explaining what happened

**Repair is a single pass, not a loop.** If the repair fails, you get the best-effort result plus diagnostics. This is intentional — infinite retry loops create unpredictable costs and latency.

What you'll see on stderr:
- `Repaired: 3 validation error(s) fixed.` — repair succeeded
- `Repair attempted: 3 original error(s), 1 remaining.` — partial repair
- `Generated on first pass (has validation warnings).` — valid enough but not perfect

---

## `--write` Mode

By default, all content goes to stdout. This keeps AI generation safe and composable:

```bash
# Preview first
ai create-room --theme "haunted library" | less

# Then write
ai create-room --theme "haunted library" --write content/rooms/haunted_library.yaml
```

`--write` creates parent directories automatically. The file path confirmation goes to stderr so it doesn't pollute piped output.

---

## Authoring Bundles

The pack commands (`create-location-pack`, `create-encounter-pack`) generate multi-object YAML in a single prompt call. This produces more coherent content than generating objects separately because the model sees the full context.

**Location Pack** produces:
- 1 district definition (id, name, zoneIds, tags, metrics)
- 2–4 rooms with interconnected zones
- Cross-room exits for spatial connectivity

**Encounter Pack** produces:
- 1 room with zones
- 1–3 entity blueprints placed in zones
- 1 quest with stages tied to the entities and room

After generation, review the YAML, split it into separate files if needed, and feed individual pieces through the engine's validator.

---

## Model Selection

Default: `qwen2.5-coder` (good balance of speed and YAML accuracy).

Override per-command:
```bash
ai create-room --theme "ice palace" --model llama3.1
```

Or set globally:
```bash
export AI_RPG_ENGINE_OLLAMA_MODEL=deepseek-coder-v2
```

Environment variables:
| Variable | Default |
|----------|---------|
| `AI_RPG_ENGINE_OLLAMA_URL` | `http://localhost:11434` |
| `AI_RPG_ENGINE_OLLAMA_MODEL` | `qwen2.5-coder` |
| `AI_RPG_ENGINE_OLLAMA_TIMEOUT_MS` | `30000` |

---

## Command Reference

### Scaffold
| Command | Input | Output |
|---------|-------|--------|
| `create-room` | `--theme` | Room YAML (validated) |
| `create-faction` | `--theme` | Faction config YAML |
| `create-quest` | `--theme` | Quest YAML (validated) |
| `create-district` | `--theme` | District config YAML |
| `create-location-pack` | `--theme` | District + rooms YAML |
| `create-encounter-pack` | `--theme` | Room + entities + quest YAML |

### Diagnose
| Command | Input | Output |
|---------|-------|--------|
| `explain-validation-error` | JSON (stdin) | Plain text explanation |
| `explain-lint` | JSON (stdin) | Plain text explanation |
| `explain-belief-divergence` | JSON (stdin) | Divergence analysis |
| `explain-district-state` | JSON (stdin) | District narrative |
| `explain-faction-alert` | JSON (stdin) | Alert explanation |
| `summarize-belief-trace` | JSON (stdin) | Trace summary |

### Repair
| Command | Flag | Behavior |
|---------|------|----------|
| `create-room` | `--repair` | Single repair pass on validation failure |
| `create-quest` | `--repair` | Single repair pass on validation failure |
