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

---

## Adaptive Context (v1.4.0)

The chat engine uses a multi-stage pipeline to select and present project context. Every stage is deterministic, transparent, and inspectable.

### Pipeline

```
user message → intent classification → personality profile selection
    → loadout routing (source gating) → RAG retrieval → memory shaping → prompt
```

### Loadout Routing

When `ai-loadout` is installed, the engine builds a **task string** from the current message + session state (issue buckets, replay signals, recent artifact types, stale issues). The loadout resolver gates which `SourceKind` values are allowed for RAG retrieval.

**Profile bias**: The active personality profile adds source types to the routed set (never removes). For example, `ANALYST` adds `replay`, `critique`, `decision`; `GENERATOR` adds `artifact`, `doc`. This shapes emphasis without limiting what the engine can find.

### Context Transparency

The `/context` command shows a full breakdown:

- **Retrieval**: sources scanned, candidates found, snippets selected, dropped by budget, truncated, excluded sources
- **Memory shaping**: per-class breakdown showing chars, budget share, source counts
- **Pipeline summary**: compact one-liner showing route → retrieve → shape → budget utilization
- **Warnings**: advisory alerts (e.g. repeated source routing with open issues)

### Worked Example

> User asks: "Are there problems with rumors in the market district?"

1. **Intent**: `diagnose` → profile `ANALYST` (balanced inference, adds replay + critique + decision sources)
2. **Task string**: `"diagnose | buckets: rumor_flow(2), district_alert(1) | replay: pass(rumor,district) | artifacts: district,room | stale: 0 | profile: ANALYST"`
3. **Loadout**: routes sources `[session, artifact, critique, replay, decision]` — excludes `transcript`, `doc`
4. **Retrieval**: scans 12 sources → 8 candidates → selects 5 (1 dropped by budget) → 0 truncated
5. **Shaping**: `open_issues` (320 chars, 18%) + `recent_changes` (540 chars, 30%) + `project_facts` (940 chars, 52%)
6. **Pipeline**: `5 source types routed → 5/8 candidates kept → 3 classes → 1800 chars → 45% budget used`

Use `/sources` for a condensed view, `/loadout` for routing details, and `/loadout-history` to see how routing evolves across queries.

### Shell Commands

| Command | Description |
|---------|-------------|
| `/context` | Full context snapshot (retrieval + shaping + budget + warnings) |
| `/sources` | Condensed source list with scores and match reasons |
| `/loadout` | Current loadout routing plan and profile influence |
| `/loadout-history` | Rolling history of loadout routing decisions (last 20) |

## Guided Build Mode (v1.5.0)

Guided Build Mode is a session-aware, plan-first workflow that orchestrates existing commands into multi-step build plans. It acts as a planner and conductor — every step is previewable, confirmable, traceable in session history, and reproducible from CLI commands.

### Pipeline

```
"build a market district" → build_goal intent → template detection
    → smart step generation (skip existing, inject issues, inject replays)
    → BuildPlan → preview → step-by-step or batch execution → diagnostics
```

### Build Templates

Three built-in templates cover common worldbuilding goals:

| Template | Steps | Sequence |
|----------|-------|----------|
| **district** | 7 | district → 2 factions → location-pack → encounter-pack → critique → suggest-next |
| **scenario** | 7 | district → quest → 2 encounter-packs → room → critique → suggest-next |
| **faction network** | 6 | 3 factions → encounter-pack → critique → suggest-next |

Template detection uses keyword matching against the goal string. If no template matches, a single-step exploratory plan is generated with a warning.

### Smart Step Generation

Plans are tailored to the current session state:

- **Artifact skipping**: If the session already has a matching artifact (fuzzy slug match against goal words), the step is skipped and a warning is emitted
- **Issue injection**: Open session issues trigger additional steps — `RUMOR_`/`GOSSIP_` → create-faction, `FACTION_`/`ALLIANCE_` → create-encounter-pack, `GAP_`/`MISSING_` → create-location-pack — with dedup checks against existing template steps
- **Replay injection**: Replay runs with `never_triggered` or `regression` details add encounter-pack steps to address coverage gaps
- **Content threading**: Steps with `usePriorContent: true` receive accumulated output from prior steps, enabling coherent multi-step builds

### Execution Controls

Build execution supports three modes:

1. **Preview** (`/preview`): See the full plan formatted with step descriptions, commands, and dependency chains before executing anything
2. **Step-by-step** (`/step`): Execute one step at a time — review output, then decide whether to continue
3. **Batch** (`/execute`): Run all remaining steps automatically, with diagnostics appended at the end

Each executed step is recorded as a session event (`build_step_executed` or `build_step_failed`). Failed steps cascade — dependent steps are automatically skipped with an explanation.

### Session Integration

Four new session event kinds track build lifecycle:

| Event Kind | When |
|------------|------|
| `build_plan_created` | Plan generated from goal |
| `build_step_executed` | Step completed successfully |
| `build_step_failed` | Step failed (cascades to dependents) |
| `build_plan_completed` | All steps resolved (executed, failed, or skipped) |

### Guided Diagnostics

After a build completes (or on demand via `/diagnostics`), a post-build analysis reports:

- **Step summary**: executed / failed / skipped counts
- **Open issues**: session issues that remain unaddressed
- **Generated content**: character count of accumulated build output
- **Missing categories**: artifact categories (districts, factions, quests, rooms, packs) not covered by the build

### Worked Example

> User types: `/build a rumor-driven market district`

1. **Intent**: `build_goal` — routed by regex pattern (negative lookahead avoids scaffold conflict)
2. **Template**: `district` detected via "district" keyword → 7-step plan
3. **Smart generation**: Session has 2 `RUMOR_` issues → no extra injection needed (template already includes create-faction). Session has an existing "market" district artifact → first step skipped with warning.
4. **Preview**: User sees 6 remaining steps with ○ pending icons
5. **Step execution**: `/step` runs next pending step (create-faction for market district). Output recorded in session history.
6. **Status**: `/status` shows ● completed, ○ pending, – skipped steps
7. **Completion**: After all steps, diagnostics show 5 executed, 0 failed, 1 skipped, 0 open issues

### Shell Commands

| Command | Description |
|---------|-------------|
| `/build <goal>` | Generate a build plan from a natural-language goal |
| `/preview` | Show the current build plan with step details |
| `/step` | Execute the next pending step |
| `/execute` | Execute all remaining steps with diagnostics |
| `/status` | Show build progress with status icons (○ ● ✗ –) |
| `/diagnostics` | Run post-build analysis on the current build |
