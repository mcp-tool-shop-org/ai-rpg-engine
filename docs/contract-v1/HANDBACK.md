# C1 — handback to the advisor

**Status: complete, verified, and awaiting your gate.** Two PRs are open and
neither is merged — merging is the verification gate's outcome, not the
executor's.

Full findings: [`REPORT.md`](REPORT.md). This note is what you need to verify the
cycle and scope the next one.

---

## What to check first

1. **[`REPORT.md` §2.1](REPORT.md#21-a-correction-to-the-brief-and-to-c0)** — the
   one correction that changes a decision you made. C0 filed `districts`,
   `buildCatalog` and `progressionTrees` as three equivalent "cheap wire gaps",
   and your ruling 1 folded all three into C1's first slices on that basis. Right
   about shape, wrong about ingestion: **only `districts` is routable into a
   booted world.** progression-core closure-captures its tree `Map` at
   construction; buildCatalog is consumed before a session exists. Both are
   session-scoped and served by a different seam.

2. **[`REPORT.md` §6](REPORT.md#6-the-rng-audit--the-charters-question-was-the-wrong-question)**
   — the charter's RNG audit item asked the wrong question. Measured across all
   twelve packs: **zero draws** from `WorldStore.rng`. Nothing to split. The
   recommendation is "no split", and the honest follow-up is engine-hygiene.

3. **[`REPORT.md` §7](REPORT.md#7--the-honesty-ledger--nine-times-the-instrument-or-the-author-was-wrong)**
   — nine instrument/author errors and one process error, including a hypothesis
   I formed, tested, and had **refuted** (twice) before recording what was
   actually measured.

## Verification state

| Gate | Result |
|---|---|
| Engine suite | **338 files / 6684 tests** green (from 330 / 6507) |
| Engine typecheck / typecheck:tests / lint | clean · clean · **0 errors** (696 pre-existing warnings) |
| Engine docs-integrity | 92 / 92 |
| world-forge suite | **132 files / 2403 tests** green (from 131 / 2392) |
| world-forge build | clean |
| Cross-family jury | 8/8 CONFIRMED, 0 refuted; 2 of 3 seats served on the primary run + a 4th family confirming 6/6 solo. Reported degraded, not rounded up. |

## Acceptance criteria, against §9 of the brief

| # | Criterion | State |
|---|---|---|
| 1 | The C0 fixture pack boots into a played session through the real CLI; converted zones carry live rule effects (measured) | ✅ player walks all three exported zones (11/18/11 visits); `noise`, `neighbors`, `tags` move the simulation on converted content, with a no-op RED control and an inert-field control |
| 2 | The four-check gate refuses stale version / phantom module / tampered hash / unknown key, each with a diff report and a RED control | ✅ plus a GREEN control per check |
| 3 | The old 2.0.0 pack's refusal transcript sits beside C0's acceptance transcript | ✅ [`e2e-transcript.md`](e2e-transcript.md) |
| 4 | A full session replays over the sidecar byte-identical to in-process; re-emission idempotent; staleness detection proven | ✅ 15 events / 1818 bytes byte-identical, same end-state hash, against a **spawned child process** |
| 5 | Preview proven side-effect-free; RNG audit table published | ✅ hash before == after, tick and log unchanged, stable over 20 repeats, and events still returned; [`rng-audit.json`](rng-audit.json) |
| 6 | Every closed C0 finding's pin flipped in its closing commit; C0 REPORT gains a dated addendum | ✅ eight pins flipped; addendum at the top of [`../c0-alignment/REPORT.md`](../c0-alignment/REPORT.md) |
| 7 | Contract doc + report + honesty ledger + jury + C2/C3 scoping + handback; both suites and CIs green; PRs open, unmerged; no publishes, no version bumps | ✅ (CI status below) |

## Compensators — nothing beyond the authorised table was done

| Action taken | Undo |
|---|---|
| Pushed `feat/c1-contract-v1` (both repos) | `git push origin --delete feat/c1-contract-v1` |
| Opened the two PRs | close without merging |
| Production-code commits on the branches | `git revert` per slice / delete the branch |
| Flipped C0 pins | the flip commits are slice-scoped; revert restores the pinned finding |

No publish, no tag, no release, no version bump, no README/landing/public-surface
edit, no deletion, no merge. One new package (`@ai-rpg-engine/sidecar`) exists on
the branch and is **not published**.

## Three things I'd want your call on

1. **world-forge's engine dependencies are still 2.x** against a 3.8.0 engine
   (C0 checklist item 1). I did NOT bump them — six ranges is not a change to
   make on the way past, and the brief's ANDON discipline applied. The cost is
   visible and contained: the forge cannot boot an engine to resolve module ids
   (so the decisive check lives in the engine repo), and the content hash is a
   deliberate duplicate defended by a cross-repo equivalence test. **Bumping it
   is the highest-value forge-side item and it deletes the duplicate.** Your call
   whether that is its own errand or rides C3.

2. **The gate is opt-in, and `validate` now refuses packs that used to pass.**
   That is the cycle's intent and the acceptance criterion demanded it, but it is
   a behaviour change to a shipped command. `--no-gate` preserves the old
   behaviour. Worth knowing before any release batching.

3. **`WorldStore.rng` is dormant serialized state.** Measured, not inferred.
   Retiring it touches the save format; giving it a consumer is a design
   decision. Neither is C1's to make.

## Standing recommendation

The C1 instruments follow C0's pattern and should stay: they are seeded, pinned,
cheap, and several are written to **fail loudly when something changes** — the
RNG audit fails the moment anything draws from the store's stream, the cross-repo
hash test fails the moment the two implementations diverge, and the conformance
harness fails the moment the wire stops being byte-identical. That is deliberate.
The report goes stale noisily, never silently.
