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
  grantTitle,
  getEarnedTitles,
  getDisplayTitle,
  hasTitle,
  formatTitlesForDirector,
  getMaterialInventory,
  hasMaterials,
  adjustMaterial,
  getAvailableRecipes,
  SUPPLY_RUN_RUNNERS_CUT,
  MAX_ACTIVE_OPPORTUNITIES,
  makeOpportunity,
  setPersistedOpportunities,
  deadlineFor,
  applyOpportunityFallout,
  computeOpportunityFallout,
  getActivePressures,
  BOUNTY_LAPSE_ESCALATION_URGENCY,
  LOCAL_FACTION_SATURATION,
  type OpportunityKind,
  type OpportunityState,
  type SupplyCategory,
} from '@ai-rpg-engine/modules';
import { runHostileRound } from './bin.js';
import { buildOpportunityActions } from './menu.js';
import {
  POR_SEED,
  POR_ROUNDS,
  playerHalfRound,
  type SessionProfile,
} from './packs-opportunity-reachability.test.js';
import { playUntilOffered, packById, opportunityOp } from './packs-fallout-sink.test.js';
import { allPacks, type PackInfo } from './packs.js';

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

/**
 * Effects of `type` announced by every event whose name starts with one of
 * `prefixes`, across a whole session.
 *
 * `prefixes` defaults to opportunity fallout, and takes `pressure.` too for
 * the effect types BOTH appliers emit — the title-trigger block below is the
 * first to need it, because a store written by two subsystems can only be
 * reconciled against both their announcements.
 */
function announcedInSession<T extends Record<string, unknown>>(
  engine: Engine,
  type: string,
  prefixes: string[] = ['opportunity.'],
): T[] {
  const out: T[] = [];
  for (const event of engine.world.eventLog) {
    if (!prefixes.some((p) => event.type.startsWith(p))) continue;
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

/** Play `n` more rounds of the same session. */
function playRounds(engine: Engine, pack: PackInfo, n: number, profile: SessionProfile): void {
  const visits = new Map<string, number>();
  const fullHp = engine.world.entities[engine.world.playerId]?.resources?.hp ?? 0;
  for (let i = 0; i < n; i++) {
    const me = engine.world.entities[engine.world.playerId];
    if (!me) return;
    if (fullHp > 0 && me.resources) me.resources.hp = fullHp;
    playerHalfRound(engine, i, profile, visits);
    runHostileRound(engine, pack, { log: NOOP });
  }
}

/** Keep playing until `offer` lapses, or throw. */
function playUntilExpired(
  engine: Engine, pack: PackInfo, offer: OpportunityState, fromRound: number, profile: SessionProfile,
): void {
  const visits = new Map<string, number>();
  const fullHp = engine.world.entities[engine.world.playerId]?.resources?.hp ?? 0;
  for (let r = fromRound; r < fromRound + 30; r++) {
    const me = engine.world.entities[engine.world.playerId];
    if (!me) return;
    if (fullHp > 0 && me.resources) me.resources.hp = fullHp;
    playerHalfRound(engine, r, profile, visits);
    runHostileRound(engine, pack, { log: NOOP });
    const still = getPersistedOpportunities(engine.world).find((o) => o.id === offer.id);
    if (!still || still.status === 'expired') return;
  }
  throw new Error(`${offer.kind} never expired`);
}

/** The player entity's custom record — where leverage, materials and titles live. */
function playerCustom(world: WorldState): Record<string, string | number | boolean> {
  return (world.entities[world.playerId]?.custom ?? {}) as Record<string, string | number | boolean>;
}

/** A custom record holding `quantity` of one category — for the affordability check. */
function grantMaterials(quantity: number, category: SupplyCategory): Record<string, string | number | boolean> {
  return adjustMaterial({}, category, quantity);
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

// ---------------------------------------------------------------------------
// Sink 5 — title-trigger → the actor's own earned-title record
// ---------------------------------------------------------------------------

describe('sink: title-trigger (FSC-1)', () => {
  it('carrying out a faction mission earns a title the world remembers', () => {
    // getFactionJobFallout('completed') announces `title-trigger:
    // faction-operative`. Before v3.8 formatFalloutEffect printed "title
    // trigger: faction-operative" and the world had nowhere to put it.
    const { engine, before } = resolveOnce('neon-lockbox', 'faction-job', 'complete', 'pursuing');
    const custom = playerCustom(engine.world);

    expect(
      hasTitle(custom, 'faction-operative'),
      'the completed faction job announced a title the player never earned',
    ).toBe(true);
    expect(hasTitle(playerCustom(before), 'faction-operative')).toBe(false);

    const earned = getEarnedTitles(custom).find((t) => t.tag === 'faction-operative')!;
    expect(earned.earnedAtTick).toBeGreaterThanOrEqual(0);
    expect(getDisplayTitle(custom)).toBe('the Operative');
  });

  it('earning it twice keeps the first tick — a title is not a counter', () => {
    // FIRST-EARNED-WINS is what keeps "when did they become that" answerable.
    const custom = grantTitle(grantTitle({}, 'thief-taker', 4), 'thief-taker', 40);
    expect(getEarnedTitles(custom)).toEqual([{ tag: 'thief-taker', earnedAtTick: 4 }]);
  });

  it('the record renders in the Director ledger, and is absent until earned', () => {
    // Presentation, not just persistence: an earned title nobody can see is
    // the same class of gap as one nobody can read.
    expect(formatTitlesForDirector({})).toBeNull();
    const rendered = formatTitlesForDirector(grantTitle({}, 'faction-operative', 7));
    expect(rendered).toContain('faction-operative');
    expect(rendered).toContain('7');
  });

  it('titles read back in a deterministic order', () => {
    // This feeds presentation, so two worlds that earned the same titles in
    // the same round must render identically.
    const a = grantTitle(grantTitle(grantTitle({}, 'ghost', 3), 'steadfast', 1), 'iron-captain', 3);
    const b = grantTitle(grantTitle(grantTitle({}, 'iron-captain', 3), 'ghost', 3), 'steadfast', 1);
    expect(getEarnedTitles(a)).toEqual(getEarnedTitles(b));
    expect(getEarnedTitles(a).map((t) => t.tag)).toEqual(['steadfast', 'ghost', 'iron-captain']);
  });

  it('a resolution that announces no title earns none (attribution)', () => {
    const engine = completeOnce('salt-road-ledger', 'contract');
    expect(
      getEarnedTitles(playerCustom(engine.world)),
      'a completed contract earned a title its fallout never announced',
    ).toEqual([]);
  });

  it('every title in a full session traces back to an announcement, from EITHER applier', () => {
    // The reconciliation, and the reason this sink was wired on both sides in
    // one commit: `title-trigger` has seven authored producers, one on the
    // opportunity side and six on the pressure side, and they share a store.
    // Closing one and leaving the other is precisely the asymmetry that made
    // milestone-tag worth finding in the first place — so the audit reads
    // BOTH event families and demands the sets match exactly.
    const engine = playFullSession('neon-lockbox', 'pursuing');
    const announced = new Set(
      announcedInSession<{ tag?: string }>(engine, 'title-trigger', ['opportunity.', 'pressure.'])
        .map((e) => e.tag)
        .filter((t): t is string => typeof t === 'string'),
    );
    expect(
      announced.size,
      'the session announced no title at all — this reconciliation proves nothing',
    ).toBeGreaterThan(0);

    const earned = new Set(getEarnedTitles(playerCustom(engine.world)).map((t) => t.tag));
    expect(
      [...announced].sort().filter((t) => !earned.has(t)),
      'announced and never earned — an applier dropped it',
    ).toEqual([]);
    expect(
      [...earned].sort().filter((t) => !announced.has(t)),
      'earned and never announced — something other than these two appliers is granting titles',
    ).toEqual([]);
  });

  it('the character-creation title is a different thing and stays untouched', () => {
    // `custom.title` is who you CHOSE to be, resolved once at build time by
    // character-creation. This sink writes `title.<tag>` keys beside it and
    // must never overwrite it — they answer different questions.
    const { engine, before } = resolveOnce('neon-lockbox', 'faction-job', 'complete', 'pursuing');
    expect(playerCustom(engine.world).title).toEqual(playerCustom(before).title);
  });
});

// ---------------------------------------------------------------------------
// Sink 6 — materials → crafting-core's material inventory (PRODUCER + SINK)
// ---------------------------------------------------------------------------

describe('sink: materials (FSC-1)', () => {
  it('the runner keeps a cut of what passed through their hands', () => {
    // Two halves in one slice, because a sink for an effect nothing emits is
    // a guard that can never fire. FSA-1's producer census found `materials`
    // dead at the VOCABULARY level: declared on OpportunityFalloutEffect AND
    // on OpportunityReward, formatted by formatFalloutEffect, emitted nowhere.
    const { engine, offer, before } = resolveOnce('salt-road-ledger', 'supply-run', 'complete');
    const reward = offer.rewards.find((r) => r.type === 'economy-shift');
    if (reward?.type !== 'economy-shift') throw new Error('the supply run promised no shipment');

    const kept = getMaterialInventory(playerCustom(engine.world))[reward.category];
    const before_ = getMaterialInventory(playerCustom(before))[reward.category];
    expect(
      kept - before_,
      'the completed run announced a cut the player never received',
    ).toBe(SUPPLY_RUN_RUNNERS_CUT);
  });

  it('the cut is in the SAME category the district was short of', () => {
    // The reason supply-run is the honest home for this effect: it is the one
    // kind that already knows which category moved and how much, so the cut
    // needs no invented vocabulary.
    const { engine, offer, before } = resolveOnce('salt-road-ledger', 'supply-run', 'complete');
    const reward = offer.rewards.find((r) => r.type === 'economy-shift');
    if (reward?.type !== 'economy-shift') throw new Error('unreachable');

    const after = getMaterialInventory(playerCustom(engine.world));
    const start = getMaterialInventory(playerCustom(before));
    for (const category of Object.keys(after) as Array<keyof typeof after>) {
      const delta = after[category] - start[category];
      expect(
        delta,
        `${category} moved on a run that shipped ${reward.category}`,
      ).toBe(category === reward.category ? SUPPLY_RUN_RUNNERS_CUT : 0);
    }
  });

  it('the cut buys something — it is not a number that accumulates toward nothing', () => {
    // The grounding for the constant, asserted rather than claimed: every
    // recipe input in crafting-recipes.ts costs 1 or 2 units, so one completed
    // run affords one repair or craft on the round it lands.
    const recipes = getAvailableRecipes('fantasy');
    expect(recipes.length, 'the recipe catalog is empty — this proves nothing').toBeGreaterThan(0);
    const cheapestInput = Math.min(
      ...recipes.flatMap((r) => r.inputs.map((i) => i.quantity)),
    );
    expect(SUPPLY_RUN_RUNNERS_CUT).toBeGreaterThanOrEqual(cheapestInput);
    expect(
      hasMaterials(
        getMaterialInventory(grantMaterials(SUPPLY_RUN_RUNNERS_CUT, 'components')),
        [{ category: 'components', quantity: cheapestInput }],
      ),
      'one run\'s cut does not cover the cheapest recipe in the catalog',
    ).toBe(true);
  });

  it('a resolution that announces no materials pays none (attribution)', () => {
    const { engine, before } = resolveOnce('salt-road-ledger', 'contract', 'complete');
    expect(getMaterialInventory(playerCustom(engine.world)))
      .toEqual(getMaterialInventory(playerCustom(before)));
  });
});

// ---------------------------------------------------------------------------
// Sink 7 — spawn-opportunity → the persisted offer list (PRODUCER + SINK)
// ---------------------------------------------------------------------------

describe('sink: spawn-opportunity (FSC-1)', () => {
  it('an investigation that succeeds ends with a name, and a name is work', () => {
    // The second effect type FSA-1 found dead at the VOCABULARY level.
    // Chained to `bounty` because that is the only reading where the second
    // job could not have existed without the first — a supply run or a
    // contract would have been on offer anyway, so chaining to those would
    // just be spawning with extra steps.
    const { engine, offer, before } = resolveOnce('salt-road-ledger', 'investigation', 'complete');

    const priorIds = new Set(getPersistedOpportunities(before).map((o) => o.id));
    const chained = getPersistedOpportunities(engine.world).filter((o) => !priorIds.has(o.id));

    expect(chained, 'the completed investigation announced a chain nobody spawned').toHaveLength(1);
    expect(chained[0].kind).toBe('bounty');
    expect(chained[0].sourceFactionId).toBe(offer.sourceFactionId);
    expect(chained[0].tags).toContain('chained');
    expect(chained[0].tags).toContain('from:investigation');
  });

  it('the chained offer is real work — acceptable, and it lapses on its own clock', () => {
    // A spawned offer nobody can take is a list entry. This one goes through
    // the same verb every other offer does, and carries the deadline
    // `deadlineFor` gives its kind rather than an invented one.
    const { engine } = resolveOnce('salt-road-ledger', 'investigation', 'complete');
    const chained = getPersistedOpportunities(engine.world).find((o) => o.tags.includes('chained'))!;

    expect(chained.turnsRemaining).toBe(deadlineFor('bounty'));
    expect(chained.status).toBe('available');
    opportunityOp(engine, chained, 'accept');
    expect(
      getPersistedOpportunities(engine.world).find((o) => o.id === chained.id)?.status,
    ).toBe('accepted');
  });

  it('the chain respects the CAP — it cannot smuggle a sixth offer past POP-1', () => {
    // MAX_ACTIVE_OPPORTUNITIES is 5 on a measured argument (Iyengar & Lepper
    // 2000, cited at its definition). A chain that could push past it would
    // make "the answer to the player wanting more work is not a longer list"
    // untrue by the back door, which is exactly the kind of quiet erosion a
    // second spawner introduces if nobody checks.
    // ⚠ The first draft of this control filled to the cap INCLUDING the
    // investigation, and the chain spawned anyway — correctly. Completing an
    // offer frees its own slot, so a world at the cap is one under it the
    // instant the resolution lands, and the guard had nothing to refuse. The
    // condition being tested is "already at the cap AFTER the resolution", so
    // the fillers are counted independently of the offer being resolved.
    const { engine, offer } = playUntilOffered(packById('salt-road-ledger'), 'investigation', 'wandering');
    const live = getPersistedOpportunities(engine.world);
    const filler: OpportunityState[] = [];
    for (let i = 0; i < MAX_ACTIVE_OPPORTUNITIES; i++) {
      filler.push(makeOpportunity({
        kind: 'recovery',
        sourceFactionId: `fsc-filler-${i}`,
        title: 'filler', description: 'filler', objectiveDescription: 'filler',
        urgency: 0.3, turnsRemaining: 30, visibility: 'known',
        rewards: [], risks: [], genre: 'test', currentTick: engine.world.meta.tick,
      }));
    }
    setPersistedOpportunities(engine.world, [...live, ...filler]);

    opportunityOp(engine, offer, 'accept');
    opportunityOp(engine, offer, 'complete');

    const stillLive = getPersistedOpportunities(engine.world).filter(
      (o) => o.status === 'available' || o.status === 'accepted',
    ).length;
    expect(
      stillLive,
      'the control did not leave the world at the cap — it is not testing the guard',
    ).toBeGreaterThanOrEqual(MAX_ACTIVE_OPPORTUNITIES);
    expect(
      getPersistedOpportunities(engine.world).filter((o) => o.tags.includes('chained')),
      'a chained offer was spawned past the cap',
    ).toEqual([]);
  });

  it('and it cannot stack two live chains from the same source (pair dedup)', () => {
    // The same guard evaluateOpportunities applies to its own candidates and
    // world-tick 5a applies to NPC-offered ones.
    const { engine, offer } = resolveOnce('salt-road-ledger', 'investigation', 'complete');
    const chained = getPersistedOpportunities(engine.world).find((o) => o.tags.includes('chained'))!;
    const countBefore = getPersistedOpportunities(engine.world).length;

    // Replay the SAME fallout against the same world — the pair is still live.
    applyOpportunityFallout(engine.world, engine.world.playerId, computeOpportunityFallout(
      offer, 'completed', { currentTick: engine.world.meta.tick, genre: 'test' },
    ));
    expect(
      getPersistedOpportunities(engine.world).length,
      `a second live ${chained.kind} from ${chained.sourceFactionId} was stacked on the first`,
    ).toBe(countBefore);
  });

  it('a resolution that announces no chain spawns none (attribution)', () => {
    const { engine, before } = resolveOnce('salt-road-ledger', 'contract', 'complete');
    const priorIds = new Set(getPersistedOpportunities(before).map((o) => o.id));
    expect(
      getPersistedOpportunities(engine.world).filter((o) => !priorIds.has(o.id)),
      'a completed contract spawned a chain its fallout never announced',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Sink 8 — spawn-pressure → world-tick's live pressure list (PRODUCER + SINK)
// ---------------------------------------------------------------------------

describe('sink: spawn-pressure (FSC-1)', () => {
  it('a bounty you let lapse brings the issuer asking', () => {
    // The last of the eight, and the only one that was dead TWICE OVER:
    // `spawn-pressure` had three authored producers before v3.8 and every one
    // sat inside a `betrayed` case, which no shipped path reaches. So it was
    // not an unpersisted consequence — it was one no session could announce.
    //
    // `expired` and not `failed`: the verb reaches accept|complete|abandon and
    // the tick expires, so authoring the escalation on `failed` would have
    // reproduced the exact defect being fixed.
    const pack = packById('black-flag-requiem');
    const { engine, offer, round } = playUntilOffered(pack, 'bounty', 'engaged');
    opportunityOp(engine, offer, 'accept');

    const before = getActivePressures(engine.world).filter((p) => p.tags.includes('bounty')).length;
    playUntilExpired(engine, pack, offer, round, 'engaged');

    const spawned = getActivePressures(engine.world).filter((p) => p.tags.includes('bounty'));
    expect(
      spawned.length - before,
      'the lapsed bounty announced an escalation the world never spawned',
    ).toBe(1);
    expect(spawned[spawned.length - 1].kind).toBe('faction-summons');
    expect(spawned[spawned.length - 1].triggeredBy).toContain(offer.id);
  });

  it('the escalation stays UNDER the relax-valley threshold', () => {
    // BOUNTY_LAPSE_ESCALATION_URGENCY is deliberately below
    // PRESSURE_SUPPRESSION_URGENCY (0.7, Booth 2009): a consequence for
    // missing a deadline that ALSO shuts the offer board would punish one
    // lapse twice. Asserted rather than claimed, because the two constants
    // live in different files and nothing else would notice them crossing.
    expect(BOUNTY_LAPSE_ESCALATION_URGENCY).toBeLessThan(0.7);
  });

  it('it survives the tick that spawned it — the write is not discarded', () => {
    // The subtlety pushActivePressure exists for. tickWorld derives its round
    // from a FRESH array and reassigns state.pressures at the very END, so a
    // sink firing mid-round at step 5b-i writes into an array that is about to
    // be overwritten. This asserts through the persisted accessor, one full
    // round after the spawn, which is the only way to tell the difference.
    const pack = packById('black-flag-requiem');
    const { engine, offer, round } = playUntilOffered(pack, 'bounty', 'engaged');
    opportunityOp(engine, offer, 'accept');
    playUntilExpired(engine, pack, offer, round, 'engaged');

    const spawnedId = getActivePressures(engine.world)
      .filter((p) => p.tags.includes('bounty'))
      .map((p) => p.id)
      .pop();
    expect(spawnedId, 'nothing spawned to survive').toBeDefined();

    playRounds(engine, pack, 2, 'engaged');
    expect(
      getActivePressures(engine.world).some((p) => p.id === spawnedId),
      'the escalation vanished on the next tick — the sink wrote into a discarded array',
    ).toBe(true);
  });

  it('two lapses do not stack two identical summons (one-active-per-kind)', () => {
    // The invariant applyFallout's chain pressures and runNpcAgencyStep's
    // NPC-triggered ones both hold. Without it a player who lets three
    // bounties lapse accumulates three identical summons — and this guard is
    // not theoretical: it is what caught the FIRST choice of pressure kind
    // being one the world already keeps live (see the producer's comment).
    const pack = packById('black-flag-requiem');
    const { engine, offer, round } = playUntilOffered(pack, 'bounty', 'engaged');
    opportunityOp(engine, offer, 'accept');
    playUntilExpired(engine, pack, offer, round, 'engaged');

    const kinds = getActivePressures(engine.world).map((p) => p.kind);
    const opened = kinds.filter((k) => k === 'faction-summons').length;
    expect(opened, 'more than one faction-summons is live at once').toBeLessThanOrEqual(1);
  });

  it('a resolution that announces no pressure spawns none (attribution)', () => {
    const { engine, before } = resolveOnce('salt-road-ledger', 'contract', 'complete');
    expect(
      getActivePressures(engine.world).map((p) => p.id),
      'a completed contract spawned a pressure its fallout never announced',
    ).toEqual(getActivePressures(before).map((p) => p.id));
  });
});

// ---------------------------------------------------------------------------
// Reward economy — the faction-standing saturation cap (P2c)
// ---------------------------------------------------------------------------

describe('faction standing saturates instead of compounding (FSC-1)', () => {
  /** Standing with a faction, as every consumer reads it. */
  function repOf(world: WorldState, factionId: string): number {
    return (world.factions?.[factionId]?.reputation ?? 0) +
      Number(world.globals[`reputation_${factionId}`] ?? 0);
  }

  /** Every faction's standing at the end of a pinned pursuing session. */
  function standingsAfterSession(packId: string): Map<string, number> {
    const engine = playFullSession(packId, 'pursuing');
    const ids = new Set([
      ...Object.keys(engine.world.factions ?? {}),
      ...Object.keys(engine.world.globals)
        .filter((k) => k.startsWith('reputation_'))
        .map((k) => k.slice('reputation_'.length)),
    ]);
    return new Map([...ids].map((id) => [id, repOf(engine.world, id)]));
  }

  it('no faction runs away with a 40-round session', () => {
    // MEASURED BEFORE THE FIX, on this exact seed and session: eight of eleven
    // packs ended above 115 and four above 200 — ashfall-dead and signal-loss
    // at 270, jade-veil 240, black-flag 210. The highest-standing faction kept
    // winning the faction-job loop and paying itself, so the richest
    // relationship got richer without bound.
    //
    // The bound is the ceiling plus one completion's worth of overshoot: a
    // resolution that lands while standing is at 69 still pays in full, which
    // is correct — the cap refuses to pay someone who is ALREADY made, not
    // someone about to be.
    for (const pack of allPacks) {
      for (const [factionId, value] of standingsAfterSession(pack.meta.id)) {
        expect(
          value,
          `${pack.meta.id}: ${factionId} reached ${value}. Standing is compounding again — ` +
            'the saturation cap is not reaching the payer.',
        ).toBeLessThanOrEqual(LOCAL_FACTION_SATURATION + 30);
      }
    }
  });

  it('and the ladder MOVES — more than one faction ends a session with standing', () => {
    // The half that says the fix did something useful rather than merely
    // smaller. Capping the leader is only worth doing if the work goes
    // somewhere: crimson-court's witch-hunters went 0 -> 60 and jade-veil's
    // takeda-clan 25 -> 50 once the leader stopped absorbing every job.
    const multiFaction = allPacks.filter(
      (p) => standingsAfterSession(p.meta.id).size > 1,
    );
    expect(multiFaction.length, 'no pack has two factions — this proves nothing').toBeGreaterThan(0);

    const withTwoPositives = multiFaction.filter(
      (p) => [...standingsAfterSession(p.meta.id).values()].filter((v) => v > 0).length >= 2,
    );
    expect(
      withTwoPositives.length,
      'every multi-faction pack still ends with exactly one patron holding all the standing',
    ).toBeGreaterThan(0);
  });

  it('a PENALTY still lands on a saturated faction (direction control)', () => {
    // Only the upward direction is capped. Gating penalties too would make
    // standing a ratchet — you could bank one faction to the ceiling and then
    // betray them for free.
    const world = playFullSession('salt-road-ledger', 'pursuing').world;
    const factionId = [...standingsAfterSession('salt-road-ledger').entries()]
      .filter(([, v]) => v >= LOCAL_FACTION_SATURATION)
      .map(([id]) => id)[0];
    expect(factionId, 'no faction reached the ceiling — this control has nothing to test').toBeDefined();

    const before = repOf(world, factionId);
    applyOpportunityFallout(world, world.playerId, {
      resolution: {
        opportunityId: 'fsc-penalty', opportunityKind: 'faction-job',
        resolutionType: 'abandoned', resolvedAtTick: world.meta.tick,
      },
      effects: [{ type: 'reputation', factionId, delta: -10 }],
      summary: 'control',
    });
    expect(repOf(world, factionId), 'a penalty was refused on a saturated faction').toBe(before - 10);
  });

  it('and a GAIN is refused at the same moment (the other direction)', () => {
    const world = playFullSession('salt-road-ledger', 'pursuing').world;
    const factionId = [...standingsAfterSession('salt-road-ledger').entries()]
      .filter(([, v]) => v >= LOCAL_FACTION_SATURATION)
      .map(([id]) => id)[0];
    const before = repOf(world, factionId);
    applyOpportunityFallout(world, world.playerId, {
      resolution: {
        opportunityId: 'fsc-gain', opportunityKind: 'faction-job',
        resolutionType: 'completed', resolvedAtTick: world.meta.tick,
      },
      effects: [{ type: 'reputation', factionId, delta: 20 }],
      summary: 'control',
    });
    expect(repOf(world, factionId), 'a saturated faction still paid out').toBe(before);
  });
});

// ---------------------------------------------------------------------------
// The `betray` op (P3) — the fourth transition, and what it lit
// ---------------------------------------------------------------------------

describe('betrayal is reachable, and the content was already there (FSC-1)', () => {
  /** Play to an offer, accept it, then sell it out. */
  function betrayOnce(packId: string, kind: OpportunityKind, profile: SessionProfile) {
    const { engine, offer } = playUntilOffered(packById(packId), kind, profile);
    opportunityOp(engine, offer, 'accept');
    const before = structuredClone(engine.world) as WorldState;
    opportunityOp(engine, offer, 'betray');
    return { engine, offer, before };
  }

  it('selling out a contract costs standing, makes a debt, and starts an investigation', () => {
    // Three consequences from one verb, all of them authored BEFORE this
    // cycle and none of them reachable until now: the reputation hit, the
    // `betrayed` obligation at magnitude 6, and a `spawn-pressure` that was
    // one of only three sites for that effect type.
    const { engine, offer, before } = betrayOnce('salt-road-ledger', 'contract', 'wandering');
    const npcId = offer.sourceNpcId!;
    const factionId = offer.sourceFactionId!;

    const repOf = (w: WorldState) =>
      (w.factions?.[factionId]?.reputation ?? 0) + Number(w.globals[`reputation_${factionId}`] ?? 0);
    expect(repOf(engine.world) - repOf(before), 'betrayal cost nothing').toBe(-20);

    const ledger = getPersistedNpcObligations(engine.world).get(npcId)!;
    const debt = ledger.obligations.find((o) => o.sourceTag === 'opportunity:contract:betrayed');
    expect(debt, 'the betrayal left no debt behind').toBeDefined();
    expect(debt!.kind).toBe('betrayed');
    expect(debt!.direction).toBe('player-owes-npc');
    expect(debt!.magnitude).toBe(6);

    const spawned = getActivePressures(engine.world)
      .filter((p) => p.triggeredBy === `opportunity:${offer.id}`);
    expect(spawned, 'no investigation opened — the spawn-pressure site is still dark').toHaveLength(1);
    expect(spawned[0].kind).toBe('investigation-opened');
  });

  it('THE LOOP the brief asked for: a betrayal-tier debt spawns a favor-request', () => {
    // `evaluateObligationOpportunities` gates on `player-owes-npc &&
    // magnitude >= 4`. P1 measured every reachable resolution's debt BELOW
    // that line - expiry writes 2, abandonment 3 - so the rule was not
    // missing a sink; its threshold is authored at betrayal tier. Betrayal
    // writes 6, and the evaluator reads the ledger the sink writes.
    const { engine, offer } = betrayOnce('salt-road-ledger', 'contract', 'wandering');
    const npcId = offer.sourceNpcId!;

    const ledger = getPersistedNpcObligations(engine.world).get(npcId)!;
    expect(
      ledger.obligations.filter((o) => o.direction === 'player-owes-npc' && o.magnitude >= 4).length,
      'no debt clears the evaluator gate - the loop cannot close',
    ).toBeGreaterThan(0);

    // The window is WIDE on purpose, and the number is the finding. Measured
    // on this seed: the man you betrayed calls the debt in at round 73. The
    // rule fires as soon as the ledger qualifies, but it is one candidate
    // among eight and `evaluateOpportunities` takes only the highest-scoring
    // one per spawn window - so a debt competes with every district shortage
    // and faction job for its turn. My first draft used 25 rounds, reported
    // "still dark", and was wrong about the engine.
    //
    // Recorded rather than tuned: whether a betrayal should be able to wait
    // seventy rounds to come back on you is a pacing question for a cycle
    // looking at pacing, not something to fix by inflating a score until a
    // test passes sooner.
    const pack = packById('salt-road-ledger');
    const visits = new Map<string, number>();
    const fullHp = engine.world.entities[engine.world.playerId]?.resources?.hp ?? 0;
    let calledIn = false;
    let atRound = -1;
    for (let r = 0; r < 80 && !calledIn; r++) {
      const me = engine.world.entities[engine.world.playerId];
      if (!me) break;
      if (fullHp > 0 && me.resources) me.resources.hp = fullHp;
      playerHalfRound(engine, r, 'wandering', visits);
      runHostileRound(engine, pack, { log: NOOP });
      calledIn = getPersistedOpportunities(engine.world).some(
        (o) => o.kind === 'favor-request' && o.sourceNpcId === npcId,
      );
      if (calledIn) atRound = r;
    }
    expect(
      calledIn,
      npcId + ' is owed a betrayal-tier debt and never called it in - ' +
        'evaluateObligationOpportunities is still dark',
    ).toBe(true);
    expect(atRound, 'the loop closed instantly - re-read the pacing note above').toBeGreaterThan(0);
  });

  it('you cannot betray work that came from nobody (structured rejection)', () => {
    // NO SHIPPED OFFER IS SOURCELESS. Measured across the catalog: every
    // opportunity any pack spawns carries at least a `sourceFactionId`,
    // because even the district-driven kinds resolve one through
    // `findLocalFaction`. So this guard is INPUT VALIDATION, not a live
    // branch - the same standing PSC-1 gives its "a status missing `tags`
    // entirely" row: both source fields are optional on the type, and an
    // externally loaded pack (create-starter's JSON path) is not typechecked.
    //
    // Saying that plainly matters more than the test passing. A guard nobody
    // can reach through play is exactly what this cycle spent its time
    // finding; the honest disposition for one protecting a public verb from
    // untyped input is to keep it and LABEL it, not to imply a session
    // exercises it.
    const { engine } = playUntilOffered(packById('salt-road-ledger'), 'contract', 'wandering');
    const sourceless = makeOpportunity({
      kind: 'recovery',
      title: 'Something the district itself wants back',
      description: 'no counterparty', objectiveDescription: 'no counterparty',
      urgency: 0.4, turnsRemaining: 20, visibility: 'known',
      rewards: [], risks: [], genre: 'test', currentTick: engine.world.meta.tick,
    });
    setPersistedOpportunities(engine.world, [
      ...getPersistedOpportunities(engine.world),
      { ...sourceless, status: 'accepted', acceptedAtTick: engine.world.meta.tick },
    ]);

    const events = engine.submitAction('opportunity', {
      toolId: sourceless.id,
      parameters: { op: 'betray' },
    });
    const rejected = events.find((e) => e.type === 'action.rejected');
    expect(rejected, 'betraying a sourceless offer was allowed').toBeDefined();
    expect(String(rejected!.payload.reason)).toContain('nobody to betray');
    // ...and it is a REJECTION, not a silent downgrade to `abandoned`.
    expect(
      getPersistedOpportunities(engine.world).find((o) => o.id === sourceless.id)?.status,
    ).toBe('accepted');
  });

  it('the menu offers Betray exactly where the verb would accept it', () => {
    // PVR-1's rule applied to a sub-action: an advertised choice the handler
    // refuses is the same "advertised but not real" gap this release closed
    // everywhere else. Since no shipped offer is sourceless, the positive arm
    // uses real content and the negative arm uses a synthetic one.
    const { engine, offer } = playUntilOffered(packById('salt-road-ledger'), 'contract', 'wandering');
    opportunityOp(engine, offer, 'accept');
    expect(
      buildOpportunityActions(engine.world)
        .filter((a) => a.targetIds?.[0] === offer.id && a.parameters?.op === 'betray'),
      'the menu hid Betray on work that plainly has a counterparty',
    ).toHaveLength(1);

    const sourceless = makeOpportunity({
      kind: 'recovery',
      title: 'no counterparty', description: 'no counterparty', objectiveDescription: 'x',
      urgency: 0.4, turnsRemaining: 20, visibility: 'known',
      rewards: [], risks: [], genre: 'test', currentTick: engine.world.meta.tick,
    });
    setPersistedOpportunities(engine.world, [
      ...getPersistedOpportunities(engine.world),
      { ...sourceless, status: 'accepted', acceptedAtTick: engine.world.meta.tick },
    ]);
    expect(
      buildOpportunityActions(engine.world)
        .filter((a) => a.targetIds?.[0] === sourceless.id && a.parameters?.op === 'betray'),
      'the menu offered Betray on work with no counterparty',
    ).toEqual([]);
    // The control: the other two ops ARE still offered on it, so the filter
    // removes one choice rather than the whole entry.
    expect(
      buildOpportunityActions(engine.world).filter((a) => a.targetIds?.[0] === sourceless.id).length,
    ).toBe(2);
  });
});
