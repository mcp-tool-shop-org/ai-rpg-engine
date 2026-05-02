# Consumer Artifact Dogfood — v2.3.3

> Date: 2026-05-02
> Commit: aa48e4b (base) → release candidate

## What was tested

| Layer | Method | Outcome |
|-------|--------|---------|
| Security | `npm audit --audit-level=moderate` | 0 vulnerabilities |
| Tarball hygiene | `npm pack --dry-run` on all 27 packages | LICENSE present in every tarball |
| README quickstart | Copied code → executable test | **FAILED then FIXED** (see below) |
| External consumer install | Fresh directory, `npm install @ai-rpg-engine/core @ai-rpg-engine/modules` | Compiles and runs 16 gates |
| Starter composition | Gladiator + Vampire converted to `buildCombatStack()` | ~40 lines → 7 per starter |
| Ollama validation | YAML/JSON parse, schema reject, engine integration | 7/7 without live server |

## What broke

### README quickstart: missing `statusCore`

**Symptom:** The quickstart code compiled but threw at runtime — `engagement-core` depends on status verbs being registered first.

**Root cause:** `buildCombatStack()` internally includes `createEngagementCore()` which calls status-related APIs. The README omitted `statusCore` from the module array.

**Fix:** Added `statusCore` to imports and placed it *before* `...combat.modules` in the module array. Module ordering is load-order-sensitive.

**Policy created:** Any README quickstart that imports engine modules must have a corresponding executable smoke test (`readme-quickstart.test.ts`).

### Deterministic replay: entity mutation across instances

**Symptom:** Two engines created from the same seed produced different HP values.

**Root cause:** Entity objects were passed by reference. Engine 1 mutated the shared object, so Engine 2 started from mutated state.

**Fix:** Deep-copy entities with `JSON.parse(JSON.stringify(...))` when injecting into each engine instance.

## What changed

| File | Change |
|------|--------|
| `README.md` | Fixed quickstart code, corrected version |
| `packages/starter-gladiator/src/setup.ts` | Manual wiring → `buildCombatStack()` |
| `packages/starter-vampire/src/setup.ts` | Manual wiring → `buildCombatStack()` |
| `packages/modules/src/consumer-proof.test.ts` | New: 7-gate composition integration test |
| `packages/modules/src/readme-quickstart.test.ts` | New: README code compilation proof |
| `packages/ollama/src/ollama-integration-proof.test.ts` | New: 7-test AI validation proof |
| All 27 `package.json` | Added `"license"` field + LICENSE file reference |

## What becomes law

1. **README executable test** — Every README quickstart must have a `readme-quickstart.test.ts` that compiles and runs the documented code verbatim. Drift = test failure.

2. **Tarball LICENSE gate** — Every publishable package must include LICENSE in its tarball. Verified by `npm pack --dry-run` before release.

3. **Entity isolation** — Test engines that share entity definitions must deep-copy before injection. Mutation across instances is a determinism violation.

## Starter coverage status (post-dogfood)

| Starter | buildCombatStack | Unique shape | Next priority |
|---------|:---:|---|---|
| gladiator | ✓ | Spectacle economy, crowd favor | Done |
| vampire | ✓ | Hunger resources, recovery zones | Done |
| weird-west | ✓ | Corruption, custom combat states | Done |
| colony | ✗ | Boss phases, abilities, faction-heavy, **companion/party** | **High — companion proof** |
| zombie | ✗ | Survival resources, tactics, infection | **High — survival proof** |
| pirate | ✗ | Custom states, naval combat metaphor | Medium |
| ronin | ✗ | Custom states, honor/discipline | Medium |
| cyberpunk | ✗ | Netrunning abilities, ICE security | Low — same shape as colony |
| detective | ✗ | Custom states, social-adjacent combat | **High — social proof** |
| fantasy | ✗ | Standard (no tactics/resources) | Low — simplest migration |

## Next migration candidates (per user guidance)

Do **not** mass-migrate. Pick starters that prove new composition shapes:

1. **colony** — companion-heavy + faction cognition (proves party wiring through `buildCombatStack`)
2. **zombie** — survival/resource-heavy (proves resource profile extensibility)
3. **detective** — dialogue/social-adjacent combat with custom states (proves combat-social boundary)
4. **pirate** — custom combat states with naval flavor (proves COMBAT_STATES override path)

## Consumer proof hardening (next iteration)

The current proof runs inside the monorepo. The harsher version should:

1. Install **only** `@ai-rpg-engine/core` + `@ai-rpg-engine/modules` (no monorepo workspace resolution)
2. Copy README quickstart verbatim into a fresh `.ts` file
3. Compile with `tsc --noEmit`
4. Run and assert the engine boots

This proves the "new user truth" — no hidden monorepo dependencies leak.
