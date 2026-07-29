# C0 — handback to the advisor

**Status: complete, verified, and awaiting your gate.** Two PRs are open and
neither is merged — merging is the verification gate's outcome, not the
executor's.

- ai-rpg-engine — [PR #13](https://github.com/mcp-tool-shop-org/ai-rpg-engine/pull/13) (engine half, carries the report)
- world-forge — [PR #31](https://github.com/mcp-tool-shop-org/world-forge/pull/31) (export half)

The full findings are in [`REPORT.md`](REPORT.md). This note is what you need to
verify the cycle and scope the next one.

---

## What to check first

1. **[`REPORT.md` §9](REPORT.md#9-scoping-input-for-the-advisor)** — the C1 /
   C3 / hygiene split, explicitly labelled scoping input rather than a mandate.
   That is the only part of this cycle that asks anything of you.
2. **[`REPORT.md` §6](REPORT.md#6-where-the-commissioning-brief-was-wrong)** —
   four corrections to the brief you wrote. One matters: the brief grouped
   `ZoneState.stability` with `authority` as unauthorable-and-inert. It is
   unauthorable and **alive** — four readers, moves four of twelve worlds.
3. **[`REPORT.md` §7](REPORT.md#7--the-honesty-ledger--ten-times-the-instrument-was-wrong)**
   — ten instrument errors and how each was caught. Three were caught only by a
   control that existed because the brief required one.

## Verification state

| Gate | Result |
|---|---|
| Engine suite | 330 files / 6507 tests green |
| Engine typecheck / typecheck:tests / lint | clean · clean · 0 errors (696 pre-existing warnings, none in C0 files) |
| world-forge suite | 131 files / 2392 tests green |
| Engine CI on the PR head | `CI` build-and-test (20) ✓ (22) ✓ · `Docs Integrity` ✓ |
| world-forge CI on the PR head | `CI` build-and-test (22) ✓ (24) ✓ · `site-build` ✓ |
| Cross-family jury | 12/12 CONFIRMED, 0 refuted, 3/3 jurors cloud-served, one correct dissent |

One world-forge run shows `cancelled`: it was on the superseded SHA `e6303b5`,
killed by the `cancel-in-progress` concurrency group the workspace rules
require. Every job on the current head is green.

## Acceptance criteria, against §8 of the brief

| # | Criterion | State |
|---|---|---|
| 1 | Every `project.ts` field has one export class; every exported key + `ZoneDefinition` field an intake class; every engine pack key + `ZoneState` field a reverse class | ✅ 377 / 12+11 / 30 rows, each with citation or probe; completeness asserted mechanically |
| 2 | Controls proven both directions, documented RED runs | ✅ four RED controls on the differ, GREEN + RED + separability calibration on the intake probe |
| 3 | Boot-gap proof committed; verbatim export→validate transcript | ✅ four-way test + [`e2e-transcript.md`](e2e-transcript.md) |
| 4 | Version-skew checklist with a verified current-state note per item | ✅ 8/8, seven open |
| 5 | REPORT.md with C1/C3 scoping + honesty ledger; jury run and disposed | ✅ |
| 6 | Both suites green, both CIs green, PRs open, handback written | ✅ |
| — | No fixes shipped, no publishes, no version bumps | ✅ |

## Compensators — nothing beyond the authorised table was done

| Action taken | Undo |
|---|---|
| Pushed `feat/c0-alignment-audit` (both repos) | `git push origin --delete feat/c0-alignment-audit` |
| Opened PR #13 / PR #31 | close without merging |
| Fixture, instrument and docs commits on the branches | `git revert` / delete the branch |

No publish, no tag, no release, no version bump, no README/landing/public-surface
edit, no deletion, no merge.

## Two things I'd want your call on

1. **The scoping section deliberately does not rank.** The audit found one item
   with an unusually good ratio — `districts`, `buildCatalog` and
   `progressionTrees` already arrive in shapes the engine understands and are
   rejected only by `ContentPack`'s key list — but whether cheap-and-real beats
   structural-and-hard is a direction call, not a measurement.
2. **C1's shape has a fork the audit surfaced but cannot settle.**
   `PackEntry.createGame` means a pack is *code*. C1 has to decide whether the
   wire carries content into a code-supplied pack, or aims at content-only
   packs. The second needs a vocabulary for hazard closures, module config and
   rulesets that does not exist today; the reverse table is the inventory of
   what building it would cost. Everything downstream of C1 inherits that
   choice, and it is not the executor's to make.

## Standing recommendation

Whatever C1 and C3 do, the instruments in these two PRs should stay and keep
running. They are cheap (the catalog sweep is ~2.5 s), they are pinned, and
several of them are written to **fail loudly when a finding is fixed** — the
raw-`TypeError` assertion, the phantom-module list, the seven open checklist
items. That is deliberate: the report goes stale the moment someone repairs
something, and these tests are what will say so.
