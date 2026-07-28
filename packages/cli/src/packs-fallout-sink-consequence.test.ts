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
import type { Engine, WorldState } from '@ai-rpg-engine/core';
import {
  getWorldMilestones,
  getPersistedOpportunities,
  getPersistedNpcObligations,
  getPersistedNpcProfiles,
  getNetObligationWeight,
  deriveLoyaltyBreakpoint,
  deriveNpcRelationship,
  type OpportunityKind,
  type OpportunityState,
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
  return resolveOnce(packId, kind, 'complete', profile).engine;
}

/**
 * As `completeOnce`, for any terminal op, reporting the offer it acted on AND
 * the world as it stood the instant before the resolution.
 *
 * The `before` snapshot is not decoration. Several of these stores are SHARED
 * — npc-agency writes its own obligations during the same session — so "the
 * value is non-zero afterwards" proves nothing about who wrote it. The first
 * draft of the obligation proof asserted exactly that and went red on an NPC
 * who was already carrying npc-agency's own debts, which is the good failure:
 * only a delta across the atomic verb call is attributable.
 */
function resolveOnce(
  packId: string,
  kind: OpportunityKind,
  op: 'complete' | 'abandon',
  profile: SessionProfile = 'wandering',
): { engine: Engine; offer: OpportunityState; before: WorldState } {
  const { engine, offer } = playUntilOffered(packById(packId), kind, profile);
  opportunityOp(engine, offer, 'accept');
  const before = structuredClone(engine.world) as WorldState;
  opportunityOp(engine, offer, op);
  return { engine, offer, before };
}

/** Net obligation weight toward the player, through the public reads only. */
function netObligation(world: WorldState, npcId: string): number {
  const ledger = getPersistedNpcObligations(world).get(npcId);
  return ledger ? getNetObligationWeight(ledger, world.playerId) : 0;
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

// ---------------------------------------------------------------------------
// Sink 2 — obligation → npc-agency's persisted obligation ledgers
// ---------------------------------------------------------------------------

describe('sink: obligation (FSC-1)', () => {
  it('finishing Corvane\'s contract puts him in your debt, in the ledger', () => {
    // getContractFallout('completed') announces `favor / npc-owes-player /
    // magnitude 3` against the source NPC. Before v3.8 the Director printed
    // "npc-owes-player: favor with assay-master-corvane (3)" over a ledger
    // that stayed empty — POC-1's header names this exact case as the reason
    // it refuses to assert on event payloads.
    const { engine, offer, before } = resolveOnce('salt-road-ledger', 'contract', 'complete');
    const npcId = offer.sourceNpcId!;

    const ledger = getPersistedNpcObligations(engine.world).get(npcId);
    expect(ledger, `no ledger exists for ${npcId} at all`).toBeDefined();

    const mine = ledger!.obligations.filter((o) => o.sourceTag.startsWith('opportunity:contract:'));
    expect(mine, 'the completed contract announced a favor owed that nobody recorded').toHaveLength(1);
    expect(mine[0].direction).toBe('npc-owes-player');
    expect(mine[0].kind).toBe('favor');
    expect(mine[0].counterpartyId).toBe(engine.world.playerId);
    expect(mine[0].magnitude).toBe(3);

    // And it reads back through the weight function every consumer uses —
    // as a DELTA, because this NPC may already be carrying npc-agency's own
    // obligations from the session that got us here.
    expect(
      netObligation(engine.world, npcId) - netObligation(before, npcId),
      'the ledger moved by something other than the +3 favor the fallout announced',
    ).toBe(3);
  });

  it('THE LOOP: a sink-written debt moves the NPC\'s loyalty breakpoint', () => {
    // This is the feedback half — the sink writing into state that the rules
    // which produced it read back.
    //
    // deriveLoyaltyBreakpoint's `allied` arm requires netOblWeight >= 0, so a
    // debt the PLAYER owes can knock an otherwise-allied NPC down a tier; and
    // evaluateNpcGoalOpportunities skips hostile/compromised NPCs and (per
    // POC-1) only offers a contract from an ALLIED one. Abandoning a favor
    // therefore closes a real loop: opportunity fallout → obligation ledger →
    // breakpoint → which opportunities that NPC will offer next.
    const { engine, offer, before } = resolveOnce('crimson-court', 'favor-request', 'abandon', 'engaged');
    const npcId = offer.sourceNpcId!;

    // getFavorRequestFallout('abandoned') announces `betrayed /
    // player-owes-npc / magnitude 3` — a debt, so the weight moves DOWN by 3.
    expect(
      netObligation(engine.world, npcId) - netObligation(before, npcId),
      'walking away from someone\'s personal request left no debt behind',
    ).toBe(-3);

    // The loop: that same number is an input to deriveLoyaltyBreakpoint, whose
    // `allied` arm requires netOblWeight >= 0. Hold the relationship axes
    // fixed and vary ONLY the sink's write, so any difference is attributable
    // to the obligation and nothing else.
    const relationship = deriveNpcRelationship(engine.world, npcId, engine.world.playerId);
    const withDebt = getPersistedNpcObligations(engine.world).get(npcId)!;
    const withoutDebt = {
      obligations: withDebt.obligations.filter((o) => !o.sourceTag.startsWith('opportunity:')),
    };
    // Pin the arm this exercises: with the debt stripped the NPC clears the
    // netOblWeight gate; with it, they cannot. If the shipped relationship
    // ever stops reaching `allied` on its own axes, this row says so out loud
    // rather than passing vacuously.
    expect(
      deriveLoyaltyBreakpoint(
        { ...relationship, trust: 60, loyalty: 50 },
        withoutDebt,
        engine.world.playerId,
      ),
      'the control arm is not reaching `allied` — this test is no longer exercising the netOblWeight gate',
    ).toBe('allied');
    expect(
      deriveLoyaltyBreakpoint(
        { ...relationship, trust: 60, loyalty: 50 },
        withDebt,
        engine.world.playerId,
      ),
      'the sink-written debt did not reach the breakpoint rule — the loop is open',
    ).not.toBe('allied');
  });

  it('the ledger the loop reads is the SAME one world-tick keeps aging', () => {
    // Attribution for the wiring, not the value: the sink writes through
    // setPersistedNpcState, so the record lands in the map world-tick step 5a
    // reads, ticks for decay, and re-persists every round — not a private
    // stash that happens to look similar. Profiles survive the write, which is
    // what proves the full-overwrite writer was fed its own current values.
    const { engine, offer } = resolveOnce('salt-road-ledger', 'contract', 'complete');
    expect(
      getPersistedNpcProfiles(engine.world).some((p) => p.npcId === offer.sourceNpcId),
      'writing the obligation destroyed the profiles sharing that namespace',
    ).toBe(true);
  });

  it('a resolution that announces no obligation writes none (attribution)', () => {
    // getSupplyRunFallout('completed') announces four effects, none of them an
    // obligation. A sink that wrote unconditionally would pass every test
    // above and fail this one.
    const engine = completeOnce('salt-road-ledger', 'supply-run');
    const all = [...getPersistedNpcObligations(engine.world).values()].flatMap((l) => l.obligations);
    expect(
      all.filter((o) => o.sourceTag.startsWith('opportunity:supply-run:')),
      'a supply-run recorded an obligation its fallout never announced',
    ).toEqual([]);
  });

  it('a session that never resolves an offer records no opportunity obligation (SEED-0)', () => {
    const engine = playWithoutResolving('salt-road-ledger');
    const all = [...getPersistedNpcObligations(engine.world).values()].flatMap((l) => l.obligations);
    // npc-agency writes its OWN obligations during the session — that is the
    // point of checking the sourceTag rather than the count.
    expect(
      all.filter((o) => o.sourceTag.startsWith('opportunity:')),
      'a world that resolved nothing gained an opportunity-sourced obligation',
    ).toEqual([]);
  });
});
