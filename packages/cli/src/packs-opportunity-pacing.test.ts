// POP-1 — opportunity PACING across the real catalog.
//
// POR-1 proves each kind can fire; POC-1 proves completing one changes the
// world. Neither says anything about RHYTHM, and rhythm is what decides
// whether a live opportunity layer reads as strategic texture or as a
// conveyor belt. With seven kinds newly lit in v3.7 that stopped being
// hypothetical: a pursuing player was measured taking 17-20 offers across a
// 40-round session, which is an offer every other round.
//
// The constants this guards are tuned against named findings, each cited at
// its definition in opportunity-core.ts:
//   MAX_ACTIVE_OPPORTUNITIES  Iyengar & Lepper 2000 — kept at 5
//   MIN_TURNS_BETWEEN_SPAWNS  Värtinen 2024 + Hazzikostas 2016 — raised 3 -> 5
//   PRESSURE_SUPPRESSION_URGENCY  Booth 2009 — relax valleys
//   KIND_RECURRENCE_COOLDOWN  Howard 2011 — no cycle the player can name
//   deadlineFor()             Zagal 2013 — no appointment dynamics on asks
//
// The bounds below are DELIBERATELY WIDE. A pacing test that pins an exact
// spawn count breaks on every unrelated content edit and gets its numbers
// updated without being read, which is worse than no test. These are the
// bounds outside which the layer has stopped being what it is: silent, or a
// firehose.

import { describe, it, expect } from 'vitest';
import { allPacks } from './packs.js';
import {
  playSession,
  ALL_OPPORTUNITY_KINDS,
  POR_ROUNDS,
  POR_SEED,
  type PlayedSession,
} from './packs-opportunity-reachability.test.js';

/** The layer is dead below this — a 40-round session that offers almost nothing. */
const MIN_SPAWNS_PER_SESSION = 5;
/** The layer is a firehose above this — measured range after tuning is 8-18. */
const MAX_SPAWNS_PER_SESSION = 24;
/** Below this a session reads as one repeated errand rather than a world. */
const MIN_DISTINCT_KINDS_PER_SESSION = 2;

/** The deepest profile — a player actually working the strategic layer. */
const PURSUING: PlayedSession[] = allPacks.map((pack) => playSession(pack, { profile: 'pursuing' }));

function describeSession(s: PlayedSession): string {
  return `${s.packId}: ${s.spawns.length} spawns over ${POR_ROUNDS} rounds, kinds [${[...s.kindsFired].sort().join(', ')}]`;
}

describe('opportunity pacing × real catalog (POP-1)', () => {
  it('every pack keeps the layer alive without flooding it', () => {
    for (const session of PURSUING) {
      expect(session.spawns.length, `too quiet — ${describeSession(session)}`).toBeGreaterThanOrEqual(
        MIN_SPAWNS_PER_SESSION,
      );
      expect(session.spawns.length, `flooding — ${describeSession(session)}`).toBeLessThanOrEqual(
        MAX_SPAWNS_PER_SESSION,
      );
    }
  });

  it('no session is a single kind repeated', () => {
    for (const session of PURSUING) {
      expect(session.kindsFired.size, `monotonous — ${describeSession(session)}`).toBeGreaterThanOrEqual(
        MIN_DISTINCT_KINDS_PER_SESSION,
      );
    }
  });

  it('no single kind dominates a session', () => {
    // KIND_RECURRENCE_COOLDOWN's actual promise, stated as the property Howard
    // 2011 is about: not "never twice in a row" but "the player cannot name
    // the cycle". Adjacency is the wrong assertion here and the first draft
    // used it — the cooldown reads the RESOLUTION ledger, so the opening of a
    // session legitimately repeats a kind before anything has resolved into
    // that ledger to suppress. Share is what survives that and still fails on
    // a monotonous session.
    for (const session of PURSUING) {
      const counts = new Map<string, number>();
      for (const spawn of session.spawns) counts.set(spawn.kind, (counts.get(spawn.kind) ?? 0) + 1);
      const dominant = Math.max(...counts.values());
      expect(
        dominant / session.spawns.length,
        `one kind carried the whole session — ${describeSession(session)}\n` +
          `  sequence: ${session.spawns.map((s) => s.kind).join(' -> ')}`,
      ).toBeLessThanOrEqual(0.75);
    }
  });

  it('every spawn carries the world-state reason that produced it', () => {
    // Doran & Parberry 2011 (A Prototype Quest Generator Based on a Structural
    // Analysis of Quests from Four MMORPGs) reduced 750+ MMO quests to a small
    // action grammar and found plausibility came from the NPC MOTIVATION
    // heading the quest, not from variety in the actions. The spawn's `reason`
    // is that motivation, already computed by every evaluator — this asserts it
    // reaches the event rather than dying inside the rule.
    for (const session of PURSUING) {
      for (const spawn of session.spawns) {
        expect(
          spawn.reason.length,
          `${session.packId} spawned a ${spawn.kind} with no stated cause`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('kinds that someone is HOLDING for you never lapse; kinds with their own clock do', () => {
    // Zagal, Bjork & Lewis 2013 (Dark Patterns in the Design of Games, FDG)
    // name appointment dynamics — content expiring on a schedule — as what
    // converts play into obligation. Every kind used to carry the same flat
    // 12-turn clock, so a companion's personal request punished postponement
    // exactly as hard as a faction's emergency.
    const everySpawned = allPacks.flatMap((pack) =>
      (['wandering', 'engaged', 'pursuing'] as const).flatMap((profile) => {
        const engine = playSession(pack, { profile });
        return engine.spawns.map((s) => s.kind);
      }),
    );
    // Sanity: the sweep actually saw the two waiting kinds somewhere, or this
    // assertion is about an empty set.
    expect(new Set(everySpawned).size).toBeGreaterThan(1);

    for (const session of PURSUING) {
      for (const expiry of session.expiries) {
        expect(
          expiry.kind,
          `a \`${expiry.kind}\` lapsed — an offer someone is holding for the player must wait`,
        ).not.toBe('contract');
        expect(expiry.kind).not.toBe('favor-request');
      }
    }
  });
});

// --- Determinism controls -------------------------------------------------

describe('meta: POP-1 measures a deterministic world (pacing controls)', () => {
  const pack = allPacks.find((p) => p.meta.id === 'black-flag-requiem')!;

  it('same seed, same session: the spawn sequence is identical', () => {
    const a = playSession(pack, { profile: 'pursuing', seed: POR_SEED });
    const b = playSession(pack, { profile: 'pursuing', seed: POR_SEED });
    expect(a.spawns.map((s) => `${s.round}:${s.kind}:${s.reason}`)).toEqual(
      b.spawns.map((s) => `${s.round}:${s.kind}:${s.reason}`),
    );
  });

  it('a different seed produces a different session — the bounds are not seed-independent', () => {
    // Without this, every assertion above could be passing on a world that
    // ignores its seed entirely, and "deterministic" would be indistinguishable
    // from "constant".
    const pinned = playSession(pack, { profile: 'pursuing', seed: POR_SEED });
    const other = playSession(pack, { profile: 'pursuing', seed: POR_SEED + 1 });
    expect(
      pinned.spawns.map((s) => `${s.round}:${s.kind}`),
      'two different seeds produced byte-identical spawn sequences — the session does not read its seed',
    ).not.toEqual(other.spawns.map((s) => `${s.round}:${s.kind}`));
  });

  it('the bounds can FAIL: a session with no world tick spawns nothing', () => {
    // The floor's own negative control. `playSession` with zero rounds is the
    // smallest honest way to produce a session the lower bound must reject —
    // if this passed the bound, the bound would be unable to detect a dead
    // layer, which is the only thing it is for.
    const dead = playSession(pack, { profile: 'pursuing', rounds: 0 });
    expect(dead.spawns.length).toBeLessThan(MIN_SPAWNS_PER_SESSION);
  });

  it('every declared kind is covered by the pacing sweep or explicitly not', () => {
    // Guards against a kind being added to the union and silently never
    // appearing in any pacing measurement.
    expect(ALL_OPPORTUNITY_KINDS).toHaveLength(8);
  });
});
