# Chapter 64 — Lighting a Dormant Layer

> Part IX — Engine Practice

[Chapter 63](./63-running-the-instrument.md) is about building a consumer to find what a producer's tests cannot. This chapter is about the class of defect that consumer keeps finding, and what it takes to see it on purpose.

The engine had eight kinds of opportunity. Contracts, bounties, favours, supply runs, escorts, investigations, recoveries, faction jobs. Eight evaluators, every one authored, every one unit-tested green.

One of them had ever fired.

## A rule with no reachable input has no input to fail on

This is the whole problem, and it is worth stating plainly because it defeats ordinary testing by construction.

A unit test for an opportunity evaluator hands it inputs and checks the output. That test is correct, it is useful, and it will pass forever on a rule that no world can ever satisfy. Nothing in the suite asks the next question — *does a played session ever produce those inputs?* — because there is no natural place for that question to live. It is not a unit test. It is not an integration test between two named modules. It is a claim about the whole world.

The same shape shows up everywhere once you look for it:

| Surface | Authored | Actually live |
|---|---|---|
| Opportunity kinds | 8 kinds, 8 evaluators, rewards, expiry fallout | 1 kind, in any world |
| Companion ability modifiers | 7 fields computed per party | 1 field consumed |
| District modifiers | 6 fields computed per mood | 0 fields consumed |
| District tags | ~45 authored across 11 packs | 4 recognised |
| `contentConventions.statusTags` | declared by 11/11 packs | enforced by 0 |
| `use` on an item with no effect | — | destroyed it, and said it worked |

None of these had a failing test. Several had *passing* ones.

## Build the probe, then prove the probe

The instinct is to go fix things. Don't — not yet. You cannot fix a reachability problem you cannot measure, and a measurement you have not checked is a rumour with a test runner attached.

The probe here boots every pack in the catalog and drives forty **full rounds**. Full is load-bearing. The world tick is a per-round function the CLI calls between the player's action and the next frame — it is not a verb, and it is not an event subscription. A probe built out of `submitAction` alone drives half a round forever and reports the entire strategic layer dead.

It is not dead. It was, in the previous cycle, reported as dead by exactly such a probe.

So the discipline is: **a probe is a claim about the system, and it needs proving before it is reported.** In practice that means shipping controls in the same commit:

- **The baseline, pinned as data.** Not asserted true — recorded. When a fix lights a kind, that row moves and the change is visible; when the probe breaks, the row moves too, in the other direction.
- **A synthetic pass per axis.** For each kind, a world held in the condition that kind's evaluator says it wants. All eight must go green, or the axis has no teeth and its red result means nothing.
- **A strip control.** Remove the held condition; watch it go red again.

A suite that starts mostly red proves nothing by being red. So does a broken one.

### The probe was wrong three times

Worth recording, because each error is a general one:

1. **It read a narrower source than the engine.** The diagnostic derived factions from `world.factions` alone; the engine also unions in the faction-cognition registry, which ten of eleven packs populate. First report: "no pack has factions." Truth: every pack has factions, and the gap was one step further in — reputation never *moved*.
2. **It never used the system under test.** Reputation has exactly one upward path in the whole engine: an opportunity reward, applied on completion. A probe that never completes an opportunity measures a player frozen at zero forever, and reports every reputation-gated rule dead.
3. **Its combat half was invisible.** Shipped content types hostiles `enemy`, not `npc`. The co-location helper filtered on `npc`, so `attack` was submitted against nothing. The tell was that adding combat to the probe changed the measurement by *exactly zero*.

That third one is the useful heuristic. **When a change that should move a number moves nothing, the change did not happen.**

## Fix at the layer the measurement points to

Once measured, most of these were not rule problems.

`contract` needed an NPC at breakpoint favourable-or-allied carrying a `bargain` goal. Those read like alternatives and are not: the bargain goal requires greed above 60, and `favorable` requires greed below 50. Only ALLIED-and-greedy can ever carry the kind. And trust comes from `relations['player-trust']`, which had been authored exactly once across eleven packs — at a value below even the favourable bar. The fix was one NPC, authored as what the pack already said he was.

`recovery` was gated on trade volume under 30. Trade volume tracks a district-core commerce metric, and every district in the catalog sat on the unconfigured default of 50. The fix was one district that audits trade rather than doing any.

And underneath both, a quieter one: district economies **erased their own character**. The per-round drift pulled every supply category toward a universal 50, so a sacred quarter, a contested slum and a crown counting-house converged on identical numbers within about fifteen rounds. Genre-and-tag seeding was authored once and then deleted by the tick. The fix was to let a district's economy remember its own normal and seek *that*.

The first version of that fix was invisible: the tick function rebuilds the economy rather than spreading it, so it dropped the new field after exactly one round. Quieter than a crash, and only caught by re-reading the numbers.

## Legibility is the deliverable, not the arithmetic

When a passive modifier finally reaches a resolution function, resist the urge to call it done.

Juul and Begy (2016) put two mechanically **identical** builds of a game in front of players, differing only in feedback, and the high-feedback build was rated the better *game*. A computed-but-unrendered modifier is experientially identical to no modifier at all. Wiring it up without surfacing it converts a dead system into an invisible one.

So every threaded contribution carries a name, a source, and the post-modifier total:

```ts
{ name: 'companionLeverageCostDiscount', source: 'smuggler-vale', delta: -2, after: 6 }
```

One entry per contributor, never a pooled "party bonus" a UI cannot decompose. Hicks et al. (2019) require feedback connectable to a single cause; Sobou's Suikoden analysis is the same finding stated as a design failure, where roughly 41% of that game's 108 recruits read as worthless because their contributions were indistinguishable from each other's. A companion whose modifier fires anonymously is a roster clone.

## Say what you did not do

Three things in this cycle were reverted or declined after being built:

- Opening the pressure-spawn valve for high-alert factions. The clock mismatch is real — notoriety never decays, heat drains in about eight quiet rounds — but the valve's contract is documented deliberately and pinned by a test. Content reached the same goal. The observation went to the director as a design question rather than being decided by whoever happened to be editing that file.
- Threading `npcCooperationBias` into NPC trust. It works, and it also makes companions desert: trust feeds the breakpoint, the breakpoint feeds the departure rule. That is a retention change wearing a modifier's clothes.
- Building consumers for seven dormant `compute*` functions. Recorded as a baseline gate instead, deferred with an owner.

A deferral with a name and a reason is a result. A silent one is a defect with better manners.

## What to take from this

- **Measure before fixing.** The starvation table is the deliverable of the first phase; no code changes until it exists.
- **Prove the instrument in both directions**, in the same commit, before trusting either colour.
- **Disbelieve a result that changes nothing.** It usually means the change never reached the system.
- **Fix at the measured layer** — content, threshold, or input shaping — and prefer content when it reaches the same place, because content does not override someone else's documented decision.
- **Ship the attribution with the number.** Otherwise you have moved a system from dead to invisible, which the player experiences the same way.
