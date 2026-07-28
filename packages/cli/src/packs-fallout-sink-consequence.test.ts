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
//   DETERMINISM   a session replays byte-identically under the same seed, with
//                 a different-seed control so a constant could not satisfy it.
//
// ⚠ A fourth control was planned — "a session that never resolves an
// opportunity gains nothing" — and it is IMPOSSIBLE to write from a played
// session, which is worth more than the control would have been. A player who
// touches no offer still resolves them: they LAPSE, and world-tick step 5b-i
// applies the authored expiry fallout. The npc-relationship block below
// replaces it with the stronger thing the failure pointed at — a full
// reconciliation of every stored change against every announcement, in both
// directions.
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
  getPlayerRumorState,
  getRumorsKnownToFaction,
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
 * Play a full pinned session WITHOUT ever touching an offer. `wandering` never
 * accepts, completes or abandons anything (see POR-1's profile documentation).
 *
 * ⚠ It does NOT follow that nothing resolves. Offers left alone LAPSE, and
 * world-tick step 5b-i applies their authored expiry fallout through the same
 * applyOpportunityFallout every verb path uses. A control built on "this
 * session resolves nothing" is therefore false, and one of the rows below was
 * written that way and caught it. What this session gives you is a world where
 * the player never CHOSE anything — which is the right arm for "no
 * announcement, no write", and the wrong one for "no writes at all".
 */
function playWithoutResolving(packId: string): Engine {
  return playFullSession(packId, 'wandering');
}

/** A full pinned session under any profile, handing back the live engine. */
function playFullSession(packId: string, profile: SessionProfile): Engine {
  const pack = packById(packId);
  const engine = pack.createGame(POR_SEED);
  const fullHp = engine.world.entities[engine.world.playerId]?.resources?.hp ?? 0;
  const visits = new Map<string, number>();
  for (let round = 0; round < POR_ROUNDS; round++) {
    const me = engine.world.entities[engine.world.playerId];
    if (!me) break;
    if (fullHp > 0 && me.resources) me.resources.hp = fullHp;
    playerHalfRound(engine, round, profile, visits);
    runHostileRound(engine, pack, { log: NOOP });
  }
  return engine;
}

/** Effects of `type` announced by every `opportunity.*` event in a session. */
function announcedInSession<T extends Record<string, unknown>>(engine: Engine, type: string): T[] {
  const out: T[] = [];
  for (const event of engine.world.eventLog) {
    if (!event.type.startsWith('opportunity.')) continue;
    const effects = Array.isArray(event.payload?.effects) ? event.payload.effects : [];
    for (const effect of effects as Array<{ type?: string }>) {
      if (effect.type === type) out.push(effect as unknown as T);
    }
  }
  return out;
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

  it('an offer the player never chose to finish records no milestone (attribution)', () => {
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

  it('an offer the player never chose to finish records no obligation (attribution)', () => {
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

// ---------------------------------------------------------------------------
// Sink 3 — npc-relationship → the stored disposition base deriveNpcRelationship
//          reads (relations['player-<axis>'])
// ---------------------------------------------------------------------------

describe('sink: npc-relationship (FSC-1)', () => {
  it('doing someone a favour raises the trust the world stores about you', () => {
    // getFavorRequestFallout('completed') announces `+20 trust` against the
    // NPC who asked. `relations['player-trust']` is read by
    // deriveNpcRelationship and AUTHORED by two packs — starter-fantasy seeds
    // 15, starter-merchant 68 — and until v3.8 nothing in the engine ever
    // wrote it, so an NPC's disposition was whatever content declared plus
    // whatever cognition inferred, permanently.
    const { engine, offer, before } = resolveOnce('crimson-court', 'favor-request', 'complete', 'engaged');
    const npcId = offer.sourceNpcId!;

    const storedAfter = Number(engine.world.entities[npcId]?.relations?.['player-trust'] ?? 0);
    const storedBefore = Number(before.entities[npcId]?.relations?.['player-trust'] ?? 0);
    expect(
      storedAfter - storedBefore,
      'the completed favour announced +20 trust and the world stored none of it',
    ).toBe(20);

    // And it reaches the DERIVED relationship, which is what every consumer
    // actually reads — the store would be a stash otherwise.
    expect(
      deriveNpcRelationship(engine.world, npcId, engine.world.playerId).trust,
    ).toBeGreaterThan(deriveNpcRelationship(before, npcId, before.playerId).trust);
  });

  it('THE LOOP: sink-moved trust opens the breakpoint gate the spawn rules read', () => {
    // evaluateNpcGoalOpportunities skips hostile and compromised NPCs, and
    // POC-1 pins that `contract` needs an ALLIED source. Both readings come
    // from deriveLoyaltyBreakpoint, whose every arm is a trust threshold. So
    // the stored base this sink writes decides which offers an NPC will make.
    const { engine, offer, before } = resolveOnce('crimson-court', 'favor-request', 'complete', 'engaged');
    const npcId = offer.sourceNpcId!;

    const relBefore = deriveNpcRelationship(before, npcId, before.playerId);
    const relAfter = deriveNpcRelationship(engine.world, npcId, engine.world.playerId);
    const ledger = getPersistedNpcObligations(engine.world).get(npcId);

    // Pin the arm: `favorable` needs trust >= 30, and the favour is worth 20.
    // Rather than assert a specific pack lands on a specific side of that
    // line, hold everything but trust fixed and prove the gate MOVES with it —
    // a stored base that never reached the rule would leave these equal.
    const gateBefore = deriveLoyaltyBreakpoint({ ...relBefore, trust: relBefore.trust }, ledger, engine.world.playerId);
    const gateAfter = deriveLoyaltyBreakpoint({ ...relAfter, trust: relAfter.trust }, ledger, engine.world.playerId);
    expect(
      relAfter.trust,
      'the sink write never reached deriveNpcRelationship — the loop is open at its first hop',
    ).toBeGreaterThan(relBefore.trust);
    expect(
      deriveLoyaltyBreakpoint({ ...relAfter, trust: 29 }, ledger, engine.world.playerId),
      'the control arm is not below `favorable` — this row is no longer exercising the trust gate',
    ).not.toBe('favorable');
    expect(
      deriveLoyaltyBreakpoint({ ...relAfter, trust: 30 }, ledger, engine.world.playerId),
      'the trust gate did not open one point above its own threshold',
    ).toBe('favorable');
    expect([gateBefore, gateAfter].every((g) => typeof g === 'string')).toBe(true);
  });

  it('the stored base is clamped to what derivation can express', () => {
    // A base outside the derived range could never be reached by reading it
    // back, so the write clamps rather than letting the store drift somewhere
    // the reader floors away.
    const { engine, offer } = resolveOnce('crimson-court', 'favor-request', 'complete', 'engaged');
    const stored = Number(engine.world.entities[offer.sourceNpcId!]?.relations?.['player-trust'] ?? 0);
    expect(stored).toBeGreaterThanOrEqual(-100);
    expect(stored).toBeLessThanOrEqual(100);
  });

  it('a resolution that announces no relationship change writes none (attribution)', () => {
    // getSupplyRunFallout('completed') announces no npc-relationship effect —
    // it has no source NPC at all. Nothing in the world's relations should move.
    const { engine, before } = resolveOnce('salt-road-ledger', 'supply-run', 'complete');
    for (const [id, entity] of Object.entries(engine.world.entities)) {
      expect(
        entity.relations?.['player-trust'],
        `${id}'s stored trust moved on a resolution that announced no relationship change`,
      ).toEqual(before.entities[id]?.relations?.['player-trust']);
    }
  });

  it('every stored change reconciles against an announcement, and vice versa', () => {
    // ⚠ This row started life as a SEED-0 control asserting that a wandering
    // session — which never accepts or completes anything — leaves the
    // authored trust bases untouched. It went red: Corvane's authored 68 read
    // back as 58. The premise was wrong, not the sink. A wandering session
    // DOES resolve offers — it lets them LAPSE, and world-tick step 5b-i
    // applies the authored expiry fallout, which for `contract` is exactly
    // -10 trust against the source NPC. That path is v3.7's headline, working.
    //
    // So the honest control is not absence but ATTRIBUTION, and it is the
    // stronger test: reconcile the whole session's stored dispositions against
    // the whole session's announcements. Zero unexplained drift in one
    // direction, zero silently-dropped announcements in the other.
    const engine = playWithoutResolving('salt-road-ledger');
    const fresh = packById('salt-road-ledger').createGame(POR_SEED);

    const announced = new Map<string, number>();
    for (const effect of announcedInSession<{ npcId?: string; axis?: string; delta?: number }>(
      engine,
      'npc-relationship',
    )) {
      if (effect.axis !== 'trust') continue;
      if (!effect.npcId || typeof effect.delta !== 'number') continue;
      announced.set(effect.npcId, (announced.get(effect.npcId) ?? 0) + effect.delta);
    }
    expect(
      announced.size,
      'the session announced no trust change at all — this reconciliation proves nothing',
    ).toBeGreaterThan(0);

    for (const [id, entity] of Object.entries(engine.world.entities)) {
      const seeded = fresh.world.entities[id];
      if (!seeded) continue;
      const base = Number(seeded.relations?.['player-trust'] ?? 0);
      const now = Number(entity.relations?.['player-trust'] ?? 0);
      const expected = Math.min(100, Math.max(-100, base + (announced.get(id) ?? 0)));
      expect(
        now,
        `${id}: stored trust is ${now}, but the authored base ${base} plus every announced ` +
          `delta (${announced.get(id) ?? 0}) comes to ${expected}. Either something other than ` +
          'this sink is writing the store, or an announcement was dropped.',
      ).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// Sink 4 — rumor → the player-rumor list, via the NPC-originated path
// ---------------------------------------------------------------------------

describe('sink: rumor (FSC-1)', () => {
  it('what you did gets talked about, and the talk is readable', () => {
    // Sixteen authored sites across every kind announce a rumor on
    // resolution. Before v3.8 the claim rode the event payload and reached
    // nobody — getRumorsKnownToFaction had nothing to find.
    const { engine, offer, before } = resolveOnce('salt-road-ledger', 'contract', 'complete');

    const after = getPlayerRumorState(engine.world).rumors;
    const priorIds = new Set(getPlayerRumorState(before).rumors.map((r) => r.id));
    const fresh = after.filter((r) => !priorIds.has(r.id));

    expect(fresh, 'the completed contract announced a rumor nobody started').toHaveLength(1);
    expect(fresh[0].claim).toContain('contract');
    expect(fresh[0].valence).toBe('heroic');
    // It came from the person who hired them, not from the player.
    expect(fresh[0].sourceEvent).toBe('npc-gossip');
    expect(fresh[0].subjectDescriptor).toContain(offer.sourceNpcId!);
  });

  it('the faction the fallout named actually hears it', () => {
    // `spreadTo` is the whole point of the effect — a rumor that spreads
    // nowhere is a string in a list. getRumorsKnownToFaction is the read that
    // makes it a consequence.
    const { engine, offer, before } = resolveOnce('salt-road-ledger', 'contract', 'complete');
    const factionId = offer.sourceFactionId!;

    const heardBefore = getRumorsKnownToFaction(getPlayerRumorState(before).rumors, factionId).length;
    const heardAfter = getRumorsKnownToFaction(getPlayerRumorState(engine.world).rumors, factionId).length;
    expect(
      heardAfter - heardBefore,
      `${factionId} was named in the fallout's spreadTo and heard nothing`,
    ).toBe(1);
  });

  it('a fearsome claim enters as an accusation, not as gossip (register)', () => {
    // getContractFallout('abandoned') announces `abandoned a contract —
    // unreliable`, valence fearsome. Both registers are members of the same
    // NpcRumorSource vocabulary world-tick already maps onto; picking by
    // valence is what keeps a betrayal from entering the world as small talk.
    const { engine, before } = resolveOnce('salt-road-ledger', 'contract', 'abandon');
    const priorIds = new Set(getPlayerRumorState(before).rumors.map((r) => r.id));
    const fresh = getPlayerRumorState(engine.world).rumors.filter((r) => !priorIds.has(r.id));

    expect(fresh).toHaveLength(1);
    expect(fresh[0].valence).toBe('fearsome');
    expect(fresh[0].sourceEvent).toBe('npc-accusation');
  });

  it('a resolution that announces no rumor starts none (attribution)', () => {
    // getRecoveryFallout('completed') announces a rumor; getEscortFallout's
    // does not. Escort is the arm with obligations and no talk.
    const { engine, before } = resolveOnce('chapel-threshold', 'escort', 'complete', 'pursuing');
    expect(
      getPlayerRumorState(engine.world).rumors.length,
      'an escort completion started a rumor its fallout never announced',
    ).toBe(getPlayerRumorState(before).rumors.length);
  });

  it('every rumor in a full session traces back to an announcement (reconciliation)', () => {
    // The npc-relationship block's lesson applied to a store npc-agency ALSO
    // writes: match on the announced CLAIM, so the NPC tick's own gossip
    // cannot satisfy this.
    //
    // `pursuing` and not `wandering`, and that is the measurement talking: a
    // wandering session on this pack announces no rumor at all. Every rumor
    // site on contract/recovery/supply-run sits on `completed`, `abandoned` or
    // `betrayed` — never on `expired` — so a player who only lets offers lapse
    // is never talked about. Running the reconciliation on that session would
    // have passed over an empty set, which is why the non-vacuity floor below
    // is the first assertion and not an afterthought.
    const engine = playFullSession('salt-road-ledger', 'pursuing');
    const claims = new Set(
      announcedInSession<{ claim?: string }>(engine, 'rumor')
        .map((e) => e.claim)
        .filter((c): c is string => typeof c === 'string'),
    );
    expect(
      claims.size,
      'the session announced no rumor at all — this reconciliation proves nothing',
    ).toBeGreaterThan(0);
    for (const claim of claims) {
      expect(
        getPlayerRumorState(engine.world).rumors.some((r) => r.claim === claim),
        `the session announced "${claim}" and no rumor carries it`,
      ).toBe(true);
    }
  });
});
