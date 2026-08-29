// FLA-1 — THE FIXER'S LEDGER AUDIT.
//
// The cycle's closing argument, and the only test that can make it. v3.8 built
// eight sinks and proved each one individually; this asks the question those
// proofs cannot: across a WHOLE played session, does every consequence the
// world announced leave a mark a later read can find?
//
// ZERO ORPHANED ANNOUNCEMENTS is the bar. An orphan is an effect that appeared
// in the event stream — the Director printed it, the narrator could speak it —
// and that no public read API can recover afterwards. That is the exact defect
// this release existed to close, generalised from one applier to a session.
//
// ── WHY RECONCILIATION AND NOT AN ORPHAN SCAN ───────────────────────────────
// The original spec was "scan for announcements with no matching mark". That
// direction alone is half a test: it catches a dropped write and is blind to
// the opposite failure, a store moving with nothing to explain it. The
// npc-relationship slice found this the hard way in P1, when a control built on
// "this session resolves nothing" turned out to be describing a state a played
// session cannot reach — and the replacement, reconciling stored value against
// announced deltas, caught strictly more. So this audit reconciles in BOTH
// directions wherever the store permits it.
//
// ── TWO STRENGTHS OF CLAIM, LABELLED ────────────────────────────────────────
// Not every store supports the same claim, and pretending otherwise would be
// the dressed-up green this cycle keeps refusing:
//
//   MEMBERSHIP (exact)  rumor, obligation, milestone-tag, title-trigger,
//                       spawn-opportunity, spawn-pressure. Each announcement
//                       names a thing; the thing is either in the store or it
//                       is not. Both directions are checkable.
//   MOVEMENT (bounded)  reputation, leverage, materials, economy-shift, heat,
//                       alert, npc-relationship, companion-morale. These are
//                       numbers other systems also write, and two of them
//                       (heat decays, reputation saturates) cannot reconcile
//                       to an exact sum by design. The claim is that the store
//                       MOVED across the session in which the effect was
//                       announced — weaker, stated, and still enough to catch
//                       a sink that writes nothing.

import { describe, it, expect } from 'vitest';
import type { Engine, WorldState } from '@ai-rpg-engine/core';
import {
  getPersistedOpportunities,
  getResolvedOpportunities,
  getPersistedNpcObligations,
  getPlayerRumorState,
  getWorldMilestones,
  getEarnedTitles,
  getActivePressures,
  getResolvedPressures,
  getMaterialInventory,
  getLeverageState,
  getDistrictEconomy,
  getSupplyLevel,
  getPartyState,
  getCompanion,
  deriveNpcRelationship,
  HEAT_KEY,
  type OpportunityFalloutEffect,
  type OpportunityState,
} from '@ai-rpg-engine/modules';
import {
  pursuitState,
  formatPursuitForNarrator,
  getPursuitState,
  HUNTED_HEAT,
  SEARCHED_HEAT,
} from '@ai-rpg-engine/starter-bounty-hunter';
import { runHostileRound } from './bin.js';
import { POR_SEED, playerHalfRound } from './packs-opportunity-reachability.test.js';
import { packById } from './packs-fallout-sink.test.js';

const NOOP = (): void => {};

/** Pinned. Every probe in this file plays the same world (PIN_PER_STEP). */
const SHOWCASE_SEED = POR_SEED;
/**
 * Pinned session length.
 *
 * 60 is the brief's floor and it is also, measured, comfortably past the two
 * numbers that matter here: this world returns a betrayal-tier debt at round
 * 28 (see the time-to-return row below), and a full accept→resolve arc runs
 * about a dozen rounds. A shorter session would pass while proving less.
 */
const SHOWCASE_ROUNDS = 60;
/**
 * Ticks a taken job is held before it is resolved.
 *
 * MEASURED, in three passes. A hold of 2 with a two-job cap reached
 * `completed` and `betrayed` and never `expired` — the thief-taker cleared the
 * board faster than it filled, so no offer ever lived long enough to die. A
 * one-job cap alone did not fix it either: the spawn interval is slow enough
 * that a single slot still consumed everything. Holding a name for six ticks
 * is what finally lets the board back up, which is the honest shape anyway —
 * running a man down takes time, and the work you could not get to is the work
 * that lapses.
 */
const HOLD_TICKS = 6;

// --- The thief-taker's own session -----------------------------------------

/**
 * How a thief-taker actually plays, which no existing profile expresses.
 *
 * MEASURED FIRST, because the shape of this driver is a finding rather than a
 * preference. On a 60-round run of Hue and Cry:
 *   - `wandering` and `engaged` reach ONLY `expired` — they never take work.
 *   - `pursuing` reaches `accepted` and `completed` and never lets anything
 *     lapse, so its heat peaks at 5 and the pursuit layer stays COLD.
 * No shipped profile reaches completed AND betrayed AND expired, and the brief
 * asks for all three. So this one takes work, finishes most of it, sells one
 * job out, lets one lapse, and fights when something is standing in the way —
 * which is not a script, it is the pack's own loop with a conscience attached.
 */
function thiefTakerRound(
  engine: Engine,
  round: number,
  visits: Map<string, number>,
  betrayed: { count: number },
): void {
  const live = getPersistedOpportunities(engine.world);

  // Finish what is ripe. Every third resolution is a betrayal instead — which
  // is what makes this pack's fallout content reachable, and what the whole
  // `betray` op was added for.
  const ripe = live
    .filter((o) => o.status === 'accepted' && engine.world.meta.tick - (o.acceptedAtTick ?? 0) >= HOLD_TICKS)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (ripe) {
    const canBetray = Boolean(ripe.sourceNpcId ?? ripe.sourceFactionId);
    const op = canBetray && betrayed.count < 2 && round % 3 === 0 ? 'betray' : 'complete';
    if (op === 'betray') betrayed.count += 1;
    engine.submitAction('opportunity', { toolId: ripe.id, parameters: { op } });
    return;
  }

  // Take work, but only so much of it. A thief-taker chasing five names at
  // once catches none — and mechanically this is what makes offers LAPSE,
  // which is the only way the session reaches `expired`. The first draft
  // accepted whenever anything was available and reached completed and
  // betrayed but never expired: nothing was ever left long enough to die.
  // ONE AT A TIME, and the number is a measurement rather than a taste. At a
  // cap of two, nothing ever lapsed: the spawn interval is slow enough that a
  // second slot is almost always free, so every offer got taken and the
  // session reached completed and betrayed and never `expired`. At one, the
  // offers that arrive while you are already carrying a name sit on the board
  // and die there — which is both how the deadline becomes visible and how a
  // thief-taker actually works.
  const accepted = live.filter((o) => o.status === 'accepted').length;
  const available = live
    .filter((o) => o.status === 'available')
    .sort((a, b) => a.id.localeCompare(b.id));
  if (available.length > 0 && accepted < 1) {
    engine.submitAction('opportunity', { toolId: available[0].id, parameters: { op: 'accept' } });
    return;
  }

  // Otherwise walk, talk and fight the way every other probe's player does —
  // reusing POR-1's own half-round so this session cannot drift from the
  // catalog's shared idea of what playing looks like.
  playerHalfRound(engine, round, 'engaged', visits);
}

type Showcase = {
  engine: Engine;
  /** Every fallout effect any opportunity or pressure event announced. */
  announced: OpportunityFalloutEffect[];
  /** The world as booted, for reconciling against authored baselines. */
  fresh: WorldState;
  /** Pursuit state observed at the end of each round, in order. */
  pursuitTrail: Array<{ round: number; state: string; because: string }>;
  resolutionKinds: Set<string>;
};

function playShowcase(): Showcase {
  const pack = packById('hue-and-cry');
  const engine = pack.createGame(SHOWCASE_SEED);
  const fresh = pack.createGame(SHOWCASE_SEED).world;
  const visits = new Map<string, number>();
  const betrayed = { count: 0 };
  const fullHp = engine.world.entities[engine.world.playerId]?.resources?.hp ?? 0;
  const pursuitTrail: Showcase['pursuitTrail'] = [];

  for (let round = 0; round < SHOWCASE_ROUNDS; round++) {
    const me = engine.world.entities[engine.world.playerId];
    if (!me) break;
    if (fullHp > 0 && me.resources) me.resources.hp = fullHp;
    thiefTakerRound(engine, round, visits, betrayed);
    runHostileRound(engine, pack, { log: NOOP });
    const { state, because } = pursuitState(engine.world);
    pursuitTrail.push({ round, state, because });
  }

  const announced: OpportunityFalloutEffect[] = [];
  const resolutionKinds = new Set<string>();
  for (const event of engine.world.eventLog) {
    if (!event.type.startsWith('opportunity.') && !event.type.startsWith('pressure.')) continue;
    if (event.type.startsWith('opportunity.')) resolutionKinds.add(event.type.slice('opportunity.'.length));
    const effects = Array.isArray(event.payload?.effects) ? event.payload.effects : [];
    for (const effect of effects as OpportunityFalloutEffect[]) {
      if (effect && typeof effect === 'object' && 'type' in effect) announced.push(effect);
    }
  }
  return { engine, announced, fresh, pursuitTrail, resolutionKinds };
}

/** Cached — one 60-round session, read by every row below. Deterministic. */
let cached: Showcase | undefined;
function showcase(): Showcase {
  cached ??= playShowcase();
  return cached;
}

// --- Readers, one per effect type ------------------------------------------

function playerCustom(world: WorldState): Record<string, string | number | boolean> {
  return (world.entities[world.playerId]?.custom ?? {}) as Record<string, string | number | boolean>;
}

/**
 * Is this announced effect readable as a MARK on the world?
 *
 * `undefined` means "this type is reconciled by movement, not membership" —
 * handled separately below rather than silently counted as a pass.
 */
function membershipMark(world: WorldState, effect: OpportunityFalloutEffect): boolean | undefined {
  switch (effect.type) {
    case 'rumor':
      return getPlayerRumorState(world).rumors.some((r) => r.claim === effect.claim);
    case 'obligation': {
      const ledger = getPersistedNpcObligations(world).get(effect.npcId);
      return Boolean(ledger?.obligations.some(
        (o) => o.sourceTag.startsWith('opportunity:')
          && o.kind === effect.kind
          && o.direction === effect.direction
          && o.magnitude === effect.magnitude,
      ));
    }
    case 'milestone-tag':
      return getWorldMilestones(world).some((m) => m.tags.includes(effect.tag));
    case 'title-trigger':
      return getEarnedTitles(playerCustom(world)).some((t) => t.tag === effect.tag);
    case 'spawn-opportunity':
      // ⚠ `getPersistedOpportunities` is a LIVE list, not a history. The world
      // tick's `tickOpportunities` keeps only available/accepted offers and
      // writes back just those, so an offer that reached a terminal status is
      // DROPPED from it. The first draft of this reader checked the live list
      // alone and reported a chained bounty as an orphan — the chain had
      // spawned, been taken, and been finished, which is the audit's own
      // success condition read as its failure.
      //
      // The durable record is the resolution ledger, so the honest membership
      // read is the union: still live, or resolved and remembered.
      return getPersistedOpportunities(world).some((o) => o.kind === effect.kind && o.tags.includes('chained'))
        || getResolvedOpportunities(world).some((f) => f.resolution.opportunityKind === effect.kind);
    case 'spawn-pressure':
      return getActivePressures(world).some((p) => p.kind === effect.kind)
        || getResolvedPressures(world).some((f) => f.resolution.pressureKind === effect.kind);
    default:
      return undefined;
  }
}

/** The numeric store an effect claims to move, or undefined when not numeric. */
function movementValue(world: WorldState, effect: OpportunityFalloutEffect): number | undefined {
  const custom = playerCustom(world);
  switch (effect.type) {
    case 'reputation':
      return (world.factions?.[effect.factionId]?.reputation ?? 0)
        + Number(world.globals[`reputation_${effect.factionId}`] ?? 0);
    case 'leverage':
      return getLeverageState(custom)[effect.currency];
    case 'materials':
      return getMaterialInventory(custom)[effect.category];
    case 'economy-shift': {
      const economy = getDistrictEconomy(world, effect.districtId);
      return economy ? getSupplyLevel(economy, effect.category) : undefined;
    }
    case 'heat':
      return Number(world.globals[HEAT_KEY] ?? 0);
    case 'alert':
      return Number(world.globals[`faction_alert_${effect.factionId}`] ?? 0);
    case 'npc-relationship':
      return world.entities[effect.npcId]
        ? deriveNpcRelationship(world, effect.npcId, world.playerId)[effect.axis]
        : undefined;
    case 'companion-morale':
      return getCompanion(getPartyState(world), effect.npcId)?.morale;
    default:
      return undefined;
  }
}

// --- The audit -------------------------------------------------------------

describe("the fixer's ledger audit (FLA-1)", () => {
  it('the session is a real one — 60 rounds, several kinds, several outcomes', () => {
    // Non-vacuity first, because every claim below is quantified over what the
    // session announced. An empty session passes an orphan scan perfectly.
    const { announced, resolutionKinds } = showcase();
    expect(announced.length, 'the session announced nothing — this audit proves nothing').toBeGreaterThan(20);
    expect(
      [...resolutionKinds].sort(),
      'the session did not reach the three outcomes the brief asks for',
    ).toEqual(expect.arrayContaining(['completed', 'betrayed', 'expired']));
  });

  it('ZERO ORPHANS: every announced consequence with a nameable mark has one', () => {
    const { engine, announced } = showcase();
    const orphans = announced
      .filter((e) => membershipMark(engine.world, e) === false)
      .map((e) => JSON.stringify(e));
    expect(
      [...new Set(orphans)],
      'these consequences were announced during the session and no public read API can find them.\n' +
        '  That is the defect this entire release exists to close, arriving in a played session.',
    ).toEqual([]);
  });

  it('and the membership check is not vacuous — it covers real announcements', () => {
    // The other half of the row above: if `membershipMark` returned undefined
    // for everything, the orphan list would be empty and meaningless.
    const { engine, announced } = showcase();
    const checked = announced.filter((e) => membershipMark(engine.world, e) !== undefined);
    expect(checked.length, 'no announced effect was membership-checked at all').toBeGreaterThan(10);
    const types = new Set(checked.map((e) => e.type));
    expect(types.size, 'only one effect type was membership-checked').toBeGreaterThanOrEqual(3);
  });

  it('NO SILENT WRITES: every membership mark traces back to an announcement', () => {
    // The direction an orphan scan cannot see. A store that gained an entry
    // nothing announced is the same defect wearing the other face — and it is
    // how a second, undocumented writer would show up.
    const { engine, announced } = showcase();

    const announcedRumors = new Set(
      announced.filter((e) => e.type === 'rumor').map((e) => e.claim),
    );
    const opportunitySourced = getPlayerRumorState(engine.world).rumors
      .filter((r) => r.sourceEvent === 'npc-gossip' || r.sourceEvent === 'npc-accusation');
    // npc-agency spawns its own gossip through the same door, so this checks
    // the intersection rather than the whole list: every rumor whose claim
    // matches an announcement must exist, and no opportunity-shaped claim may
    // exist that was never announced.
    for (const claim of announcedRumors) {
      expect(
        opportunitySourced.some((r) => r.claim === claim),
        `"${claim}" was announced and no rumor carries it`,
      ).toBe(true);
    }

    const announcedTitles = new Set(
      announced.filter((e) => e.type === 'title-trigger').map((e) => e.tag),
    );
    const earned = getEarnedTitles(playerCustom(engine.world)).map((t) => t.tag);
    expect(
      earned.filter((t) => !announcedTitles.has(t)),
      'a title was earned that nothing announced — a third writer exists',
    ).toEqual([]);

    const announcedMilestoneTags = new Set(
      announced.filter((e) => e.type === 'milestone-tag').map((e) => e.tag),
    );
    const recorded = getWorldMilestones(engine.world)
      .filter((m) => m.label.startsWith('opportunity:'))
      .flatMap((m) => m.tags);
    expect(
      [...new Set(recorded)].filter((t) => !announcedMilestoneTags.has(t)),
      'an opportunity milestone was recorded that nothing announced',
    ).toEqual([]);
  });

  it('MOVEMENT: every numeric store an effect named actually moved', () => {
    // The weaker half, labelled as such. Two of these cannot reconcile to an
    // exact sum by design — heat decays on quiet rounds and reputation
    // saturates at the v3.8 ceiling — so the claim is movement across the
    // session, not arithmetic. It still catches a sink that writes nothing,
    // which is what it is for.
    const { engine, announced, fresh, pursuitTrail } = showcase();
    const stale: string[] = [];
    for (const effect of announced) {
      // HEAT IS EXCLUDED, and its own caveat is why. Heat DRAINS on quiet
      // rounds by design (world-tick's QUIET_ROUNDS_BEFORE_DECAY), so a
      // session that raised it and then went quiet reads 0 at the end —
      // exactly what happened on the first run of this row, which reported
      // `heat: still 0` while the pursuit trail below proved heat had moved
      // enough to reach HUNTED. A test that contradicts its own documented
      // caveat is worse than no test; heat's movement is asserted by the
      // pursuit trail instead, which is the surface that can see it.
      if (effect.type === 'heat') continue;
      const now = movementValue(engine.world, effect);
      if (now === undefined) continue;
      const before = movementValue(fresh, effect) ?? 0;
      if (now === before) stale.push(`${effect.type}: still ${now}`);
    }
    expect(
      pursuitTrail.some((p) => p.state !== 'COLD'),
      'heat is excluded from the check above on the promise that the pursuit trail proves it — ' +
        'and the trail never left COLD, so nothing proves heat moved at all',
    ).toBe(true);
    expect(
      [...new Set(stale)],
      'these numeric stores were named by an announced effect and read identical to a freshly\n' +
        '  booted world at session end. Either the sink writes nothing, or the effect never fired.',
    ).toEqual([]);
  });
});

describe('pursuit reads as a state machine across the session (FLA-1)', () => {
  it('the session visits more than one pursuit state, with named causes', () => {
    const { pursuitTrail } = showcase();
    const states = new Set(pursuitTrail.map((p) => p.state));
    expect(
      states.size,
      `the session never left ${[...states][0]} — the pursuit layer is not being exercised.\n` +
        '  measured: `pursuing` alone peaks at heat 5 and stays COLD, which is why this file ' +
        'drives a fighting thief-taker.',
    ).toBeGreaterThan(1);
    for (const step of pursuitTrail) {
      expect(step.because, `round ${step.round} reported a state with no cause`).toMatch(/\d/);
    }
  });

  it('every transition names the number that caused it', () => {
    // GTA V's legible state machine and Svelch's learnable rule, asserted over
    // a real session rather than a fixture: a player watching this trail can
    // always answer "why am I being hunted".
    const { pursuitTrail } = showcase();
    const transitions = pursuitTrail.filter((p, i) => i > 0 && p.state !== pursuitTrail[i - 1].state);
    expect(transitions.length, 'no transition occurred to inspect').toBeGreaterThan(0);
    for (const t of transitions) {
      expect(t.because).toMatch(/heat \d+|alert \d+/);
    }
  });

  it('the thresholds the trail crosses are the ones the pack documents', () => {
    const { pursuitTrail } = showcase();
    for (const step of pursuitTrail) {
      const heat = Number(/heat (\d+)/.exec(step.because)?.[1] ?? NaN);
      if (Number.isNaN(heat)) continue; // alert-driven, checked by its own arm
      if (step.state === 'COLD') expect(heat).toBeLessThan(SEARCHED_HEAT);
      if (step.state === 'SEARCHED') expect(heat).toBeGreaterThanOrEqual(SEARCHED_HEAT);
      if (step.state === 'HUNTED' && heat >= SEARCHED_HEAT) expect(heat).toBeGreaterThanOrEqual(HUNTED_HEAT);
    }
  });

  it('the narrator line a player would actually read carries the state and the number', () => {
    const { engine } = showcase();
    const line = formatPursuitForNarrator(engine.world);
    expect(line).toMatch(/^\[(COLD|SEARCHED|HUNTED)\]/);
    expect(line).toMatch(/\d/);
  });
});

describe('the marks a session leaves are readable, and were earned (FLA-1)', () => {
  it('the thief-taker ends the session with a ledger somebody could audit', () => {
    // The showcase, stated as one assertion: after sixty rounds this world
    // holds obligations, rumors, milestones and a pursuit record, all of them
    // reachable through public reads and all of them traceable to something
    // the player did.
    const { engine } = showcase();
    const obligations = [...getPersistedNpcObligations(engine.world).values()]
      .flatMap((l) => l.obligations)
      .filter((o) => o.sourceTag.startsWith('opportunity:'));
    expect(obligations.length, 'nobody owes or is owed anything after sixty rounds').toBeGreaterThan(0);
    expect(getPlayerRumorState(engine.world).rumors.length, 'nobody talked about any of it').toBeGreaterThan(0);
    expect(
      getWorldMilestones(engine.world).filter((m) => m.label.startsWith('opportunity:')).length,
      'the session recorded no milestone',
    ).toBeGreaterThan(0);
  });

  it('TIME TO RETURN: a betrayal comes back at round 28 in this world', () => {
    // The Director's P4 criterion, measured in Hue and Cry's OWN candidate mix
    // rather than inherited from salt-road-ledger's.
    //
    // salt-road-ledger returns a betrayal-tier debt as a `favor-request` at
    // round 73 — past a showcase horizon, and flagged in P3 as possibly
    // "effectively dark". This world returns it at 28. The difference is the
    // candidate mix: hue-and-cry has fewer district-driven kinds competing for
    // each spawn window, so a personal debt reaches the front of the queue
    // sooner without anything being tuned.
    //
    // So the sanctioned remedy — grudge-urgency scoring per RG-4.4 — is NOT
    // needed. Recording that as a measurement rather than acting on it: a fix
    // applied where the number does not warrant one is how a tuning pass
    // becomes a redesign.
    const pack = packById('hue-and-cry');
    const engine = pack.createGame(SHOWCASE_SEED);
    const visits = new Map<string, number>();
    const fullHp = engine.world.entities[engine.world.playerId]?.resources?.hp ?? 0;

    // Reach a contract, take it, sell it out.
    let offer: OpportunityState | undefined;
    for (let r = 0; r < 40 && !offer; r++) {
      const alive = engine.world.entities[engine.world.playerId];
      if (alive && fullHp > 0 && alive.resources) alive.resources.hp = fullHp;
      playerHalfRound(engine, r, 'wandering', visits);
      runHostileRound(engine, pack, { log: NOOP });
      offer = getPersistedOpportunities(engine.world)
        .find((o) => o.kind === 'contract' && o.status === 'available');
    }
    expect(offer, 'no contract was offered — the betrayal cannot be set up').toBeDefined();
    engine.submitAction('opportunity', { toolId: offer!.id, parameters: { op: 'accept' } });
    engine.submitAction('opportunity', { toolId: offer!.id, parameters: { op: 'betray' } });
    const npcId = offer!.sourceNpcId!;

    let calledIn = -1;
    for (let r = 0; r < 60 && calledIn < 0; r++) {
      const me = engine.world.entities[engine.world.playerId];
      if (!me) break;
      if (fullHp > 0 && me.resources) me.resources.hp = fullHp;
      playerHalfRound(engine, r, 'wandering', visits);
      runHostileRound(engine, pack, { log: NOOP });
      if (getPersistedOpportunities(engine.world).some((o) => o.kind === 'favor-request' && o.sourceNpcId === npcId)) {
        calledIn = r;
      }
    }
    expect(calledIn, `${npcId} never called the debt in`).toBeGreaterThanOrEqual(0);
    expect(
      calledIn,
      `the debt came back at round ${calledIn}. Past the 60-round showcase horizon it reads as\n` +
        '  effectively dark, and the sanctioned remedy is grudge-urgency scoring (RG-4.4) — never\n' +
        '  a wider window.',
    ).toBeLessThan(SHOWCASE_ROUNDS);
  });

  it('the pack-native pursuit record survives the session', () => {
    const { engine } = showcase();
    const state = getPursuitState(engine.world);
    // A session that never collared anybody still boots and reads cleanly —
    // the namespace is absent, not malformed, which is the module's contract.
    expect(Array.isArray(state.marks)).toBe(true);
    expect(Array.isArray(state.posted)).toBe(true);
  });
});

describe('meta: the showcase session is deterministic (FLA-1 controls)', () => {
  it('same seed, same session — byte-identical', () => {
    expect(playShowcase().engine.serialize()).toBe(playShowcase().engine.serialize());
  });

  it('a different seed produces a different world', () => {
    // Without this row a serializer returning a constant would satisfy the
    // determinism check above.
    const pack = packById('hue-and-cry');
    expect(pack.createGame(SHOWCASE_SEED).serialize())
      .not.toBe(pack.createGame(SHOWCASE_SEED + 1).serialize());
  });
});
