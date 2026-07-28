---
title: "Chapter 65 — Consequences That Leave Marks"
description: "Fourteen kinds of consequence, six of them written down: how to tell unpersisted from unreachable from unproduced, why a delta beats a value, and what reconciling in both directions catches that an orphan scan cannot."
sidebar:
  order: 65
---

> Part IX — Engine Practice

[Chapter 64](./64-lighting-a-dormant-layer.md) is about a rule with no reachable input. This chapter is about the defect one step further along: a rule that fires, produces a consequence, announces it — and writes it nowhere.

The engine had fourteen kinds of consequence an opportunity could produce. Reputation, leverage, obligations, rumors, titles, milestones, materials, chained work. All fourteen were declared on a union, all fourteen were formatted for the Director, and every one of them appeared in the event stream when it happened.

Six of them were written down.

## An announced consequence with no sink has no reader to catch it lying

The previous chapter's lesson was that a rule with no reachable input has no input to fail on. This is its sibling and it is harder to see, because everything *looks* correct from the outside:

- The evaluator fires.
- The resolution computes structured fallout.
- The event carries the full effect list.
- The Director prints `npc-owes-player: favor with assay-master-corvane (3)`.
- The narrator can speak it.

And then the world moves on and there is no favour, no debt, and no record that anyone owed anyone anything. The ledger the Director prints from is not the ledger the rule wrote to, because the rule did not write to one.

Nothing fails. Nothing *can* fail. There is no assertion anywhere that says "and a later read can find this", because that question does not belong to any single module — it is a claim about the seam between a producer and a store, and seams are exactly what unit tests are shaped to avoid.

## Ask the question with a delta, not a value

The first version of the audit asked: *after the resolution, does the owning store report a non-neutral value?*

It scored two provably-missing sinks **green**.

Of course it did. npc-agency writes obligations for its own reasons every round, so the ledger was never empty. Trust is *derived* from cognition rather than stored, so it was never zero. The question "is this store non-neutral" has nothing to do with the question "did this resolution write to it", and a probe that conflates them will keep passing while the defect it exists to find sits in plain sight.

The fix is attribution, and it is cheap once you see it: take a real before/after delta across an **atomic** action. `submitAction` runs one verb handler and no world tick — no NPC step, no pressure lifecycle, no cognition decay. Anything that moves between the two snapshots moved because this resolution's fallout moved it.

```ts
const before = structuredClone(engine.world);
opportunityOp(engine, offer, 'complete');
// only the fallout ran in between
expect(read(engine.world) - read(before)).toBe(announcedDelta);
```

Whenever a probe reports a green you did not expect, check whether it is measuring a delta or a value. It is usually a value.

## Three ways to be dead, and they need different fixes

Once the audit could see honestly, the fourteen effect types sorted into three groups — and the distinction is load-bearing, because building a sink for the wrong group is wasted work:

| Failure | What is missing | The fix |
|---|---|---|
| **Unpersisted** | A producer, an announcement, and no store | Build the sink |
| **Unreachable** | A producer on a resolution nothing can reach | Make the resolution reachable, or author a producer on one that is |
| **Unproduced** | A declared effect type nothing emits at all | Author the producer, or leave it and say so |

`materials` and `spawn-opportunity` were **unproduced** — declared on two unions, formatted for display, emitted nowhere. `spawn-pressure` was **unreachable**: three producers, all inside `betrayed` cases, and no shipped path could reach `betrayed`.

A sink for any of those three would have been a guard that can never fire — which is a defect wearing the fix's clothes. So the cycle authored producers for the first two and made betrayal reachable for the third, and only then wired the stores.

> **The rule:** before you build a sink, check that something can announce into it. Before you build a guard, check that something can trip it.

## Consequences become inputs

Two of the sinks write into stores the *spawn rules themselves read*. That turns a one-way emitter into a loop:

- A sink-written **obligation** lands in the ledger `deriveLoyaltyBreakpoint` consumes, and the breakpoint decides which offers an NPC will make you next.
- A sink-moved **trust** reaches `deriveNpcRelationship`, whose output that same breakpoint is derived from.

Do somebody a favour and the world offers you different work. Sell somebody out and the debt comes back looking for you.

The second one is worth a number. Betray a contract and the man you sold out calls the debt in as a `favor-request` — at **round 73** in one world and **round 28** in another. Same rule, same scoring, same everything: the difference is how many other candidates compete for each spawn window. A world with fewer district-driven kinds lets a personal grudge reach the front of the queue sooner.

That is emergent structure rather than authored structure, and the honest response to it was to *record both numbers* rather than tune either. A fuse length that follows the fiction is a feature; a fuse length tuned until a test passes sooner is a redesign wearing a tuning pass's clothes.

## Reconcile in both directions

The natural audit is an orphan scan: for every announcement, find the mark. It catches a dropped write and it is blind to the opposite failure — a store that gained an entry nothing announced.

Reconciling both ways catches strictly more:

- **No announcement without a mark** → a sink that does not write.
- **No mark without an announcement** → a *second writer nobody documented*.

The second direction is the one that pays for itself. When this audit first ran across a whole session it read two event families instead of one, and immediately reported an `economy-shift` announced by a **pressure** resolution that no read could recover. It was right: the pressure applier handled six of its nine effect types and dropped three. Everyone had been staring at the opportunity applier for an entire release.

Not every store supports the same claim, and pretending otherwise is how an audit becomes decoration. Split them and label the split:

- **Membership** — rumors, obligations, milestones, titles, spawned work. The announcement names a thing; the thing is in the store or it is not. Both directions checkable.
- **Movement** — the numeric stores. Weaker on purpose, because some of them cannot reconcile to an exact sum by design.

Heat is the case that proves the labelling matters. It **drains on quiet rounds**, so a session that raised it to a hunt and then went quiet reads zero at the end. The first run of the movement check reported `heat: still 0` while the pursuit trail in the same session showed it had crossed the hunted threshold twice.

The test was wrong, and it was wrong *in a way its own comment had already predicted*. A test that contradicts its own documented caveat is worse than no test: it will be believed. Heat is excluded now, and the pursuit trail proves it instead — the surface that can actually see it.

## What this looks like when it is done

A player finishes a job, walks away from another, and sells out a third. Sixty rounds later the world holds: a ledger of who owes whom, rumors carrying claims about what they did, milestones recording it, titles the city started using, and a pursuit state that names the number causing it.

Every one of those is reachable through a public read. Every one of them traces to something the player chose. And the audit that says so is the same shape as the one that found the gap — which is the only kind of proof worth having, because it fails the same way it succeeded.

---

**See also:** [Chapter 63 — Running the Instrument](./63-running-the-instrument.md) · [Chapter 64 — Lighting a Dormant Layer](./64-lighting-a-dormant-layer.md)
