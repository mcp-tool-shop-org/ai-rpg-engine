// FSC-1 — per-SINK consequence proofs on authored content.
//
// FSA-1 (packs-fallout-sink.test.ts) is the catalog-wide instrument: it asks,
// for all fourteen fallout effect types, whether an announced consequence is
// readable afterwards, and pins the answer as data. It deliberately asks only
// "did the owning store move".
//
// This file is the other half — one block per sink built in v3.8, each proving
// the specific mark on real content, with the two controls that make the proof
// mean something:
//
//   CONSEQUENCE   the announced mark is readable through the owning system's
//                 public API after the resolution that announced it.
//   ATTRIBUTION   a resolution of the SAME shape that announces NO such effect
//                 leaves the store untouched. Without this, a sink that wrote
//                 unconditionally would pass the consequence test.
//   SEED-0        a session that never resolves an opportunity gains nothing —
//                 no namespace default, no stray record — and replays
//                 byte-identically under the same seed.
//
// @see [[feedback_a_consumer_finds_what_the_producer_cannot]]

import { describe, it, expect } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';
import {
  getWorldMilestones,
  getPersistedOpportunities,
  type OpportunityKind,
} from '@ai-rpg-engine/modules';
import { runHostileRound } from './bin.js';
import {
  POR_SEED,
  POR_ROUNDS,
  playerHalfRound,
  type SessionProfile,
} from './packs-opportunity-reachability.test.js';
import { playUntilOffered, packById, opportunityOp } from './packs-fallout-sink.test.js';

const NOOP = (): void => {};

/**
 * Play a full pinned session WITHOUT ever touching an offer — the SEED-0 arm.
 * `wandering` never accepts or completes anything (see POR-1's profile
 * documentation), so nothing in this session resolves an opportunity.
 */
function playWithoutResolving(packId: string): Engine {
  const pack = packById(packId);
  const engine = pack.createGame(POR_SEED);
  const fullHp = engine.world.entities[engine.world.playerId]?.resources?.hp ?? 0;
  const visits = new Map<string, number>();
  for (let round = 0; round < POR_ROUNDS; round++) {
    const me = engine.world.entities[engine.world.playerId];
    if (!me) break;
    if (fullHp > 0 && me.resources) me.resources.hp = fullHp;
    playerHalfRound(engine, round, 'wandering', visits);
    runHostileRound(engine, pack, { log: NOOP });
  }
  return engine;
}

/** Drive a real session to a completed offer and hand back the live engine. */
function completeOnce(
  packId: string,
  kind: OpportunityKind,
  profile: SessionProfile = 'wandering',
): Engine {
  const { engine, offer } = playUntilOffered(packById(packId), kind, profile);
  opportunityOp(engine, offer, 'accept');
  opportunityOp(engine, offer, 'complete');
  return engine;
}

// ---------------------------------------------------------------------------
// Sink 1 — milestone-tag → world-tick's milestone ledger (recordMilestone)
// ---------------------------------------------------------------------------

describe('sink: milestone-tag (FSC-1)', () => {
  it('completing a contract leaves a milestone a later read can find', () => {
    // getContractFallout('completed') announces `milestone-tag:
    // contract-completed`. Before v3.8 that announcement went to the event
    // payload and nowhere else — the Director printed "milestone:
    // contract-completed" over a ledger that stayed empty.
    const engine = completeOnce('salt-road-ledger', 'contract');

    const marks = getWorldMilestones(engine.world);
    const mine = marks.filter((m) => m.label === 'opportunity:contract');
    expect(
      mine,
      'the completed contract announced a milestone the world did not record',
    ).toHaveLength(1);
    expect(mine[0].tags).toContain('contract-completed');
  });

  it('it lands beside the pressure side, in the same ledger and the same shape', () => {
    // The asymmetry this sink closes: `applyFallout` (pressure) has written
    // `pressure:<kind>` into this array since v2.x while opportunity fallout
    // wrote nothing. Both now go through recordMilestone, so a consumer
    // reading milestones cannot tell which subsystem authored one except by
    // the label prefix — which is the point.
    const engine = completeOnce('salt-road-ledger', 'contract');
    for (const mark of getWorldMilestones(engine.world)) {
      expect(Array.isArray(mark.tags), `milestone ${mark.label} has no tags array`).toBe(true);
      expect(typeof mark.label).toBe('string');
    }
    expect(
      getWorldMilestones(engine.world).some((m) => m.label.startsWith('opportunity:')),
    ).toBe(true);
  });

  it('a resolution that announces NO milestone writes none (attribution)', () => {
    // getSupplyRunFallout('completed') announces reputation, leverage, an
    // economy shift and a rumor — and no milestone-tag. A sink that recorded
    // on every resolution would pass the test above and fail here.
    const engine = completeOnce('salt-road-ledger', 'supply-run');
    expect(
      getWorldMilestones(engine.world).filter((m) => m.label === 'opportunity:supply-run'),
      'a supply-run recorded a milestone its fallout never announced',
    ).toEqual([]);
  });

  it('a session that never resolves an offer records no opportunity milestone (SEED-0)', () => {
    const engine = playWithoutResolving('salt-road-ledger');
    // The world is busy — offers spawn, pressures run, the player walks — and
    // none of that is a resolution.
    expect(getPersistedOpportunities(engine.world).length).toBeGreaterThan(0);
    expect(
      getWorldMilestones(engine.world).filter((m) => m.label.startsWith('opportunity:')),
      'a world that resolved nothing gained an opportunity milestone',
    ).toEqual([]);
  });

  it('and that session replays byte-identically under the same seed (determinism)', () => {
    expect(playWithoutResolving('salt-road-ledger').serialize()).toBe(
      playWithoutResolving('salt-road-ledger').serialize(),
    );
  });

  it('a different seed produces a different world (the determinism control)', () => {
    // Without this row, a serializer that returned a constant would satisfy
    // the check above.
    const pack = packById('salt-road-ledger');
    expect(pack.createGame(POR_SEED).serialize()).not.toBe(pack.createGame(POR_SEED + 1).serialize());
  });
});
