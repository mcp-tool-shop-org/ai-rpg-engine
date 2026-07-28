// FSA-1 — the fallout SINK audit.
//
// v3.7 lit all eight opportunity kinds: they spawn, they resolve, and the
// narrator can speak the consequence. This asks the question one tier past
// that, of the same layer: WHEN AN OPPORTUNITY ANNOUNCES A CONSEQUENCE, CAN A
// LATER READ OBSERVE IT?
//
// `applyOpportunityFallout` (opportunity-resolution.ts) declares fourteen
// effect types and persists six. The other eight fall through a single
// `break` — the event payload carries them, the Director prints them, and the
// world forgets them by the next read. An obligation declared and never
// entered in a ledger; a rumor that spreads to nobody; a title that titles no
// one. POC-1's own header already names one instance of this ("its authored
// `obligation` reward has no persisted sink at all… asserting on the payload
// would have called that green"). This file generalises that instinct into a
// standing measurement over all fourteen.
//
// SHAPE — three measurements, each pinned as DATA rather than asserted from a
// reading of the source (@see [[feedback_verify_fix_site_not_just_defect]]):
//
//   1. PRODUCER CENSUS — for every (kind × resolutionType) pair, which effect
//      types does the authored fallout actually EMIT? An effect type nothing
//      emits is not a missing sink; it is a dead union member, and building a
//      sink for it would be a guard that can never fire (the consign-custody
//      lesson).
//   2. RESOLUTION REACH — which resolutionTypes can a shipped path actually
//      reach? The `opportunity` verb offers accept|complete|abandon and the
//      world tick expires; nothing reaches failed/betrayed/declined. An effect
//      emitted only on `betrayed` is announced by no session.
//   3. SINK AUDIT — for each effect type a real played session CAN announce,
//      drive that session, then read the consequence back through the owning
//      system's PUBLIC read API. Not the event payload: the payload says what
//      the engine intended, and this file exists to check what it wrote.
//
// ⚠ THE FIRST DRAFT OF MEASUREMENT 3 WAS VACUOUS, in the exact way this repo
// keeps finding ([[feedback_a_consumer_finds_what_the_producer_cannot]]). It
// asked "does the owning store report a non-neutral value after the
// resolution", and `obligation` and `npc-relationship` — two of the sinks that
// provably do not exist — came back GREEN. Of course they did: npc-agency's own
// tick writes obligations for its own reasons, and trust is DERIVED from
// cognition rather than stored, so neither store was ever at zero to begin
// with. The fix is a genuine BEFORE/AFTER delta across an ATOMIC action:
// every drive below resolves through `submitAction`, which runs no world tick,
// so the only thing that could have moved the store is the fallout itself.
//
// BOTH DIRECTIONS, COMMITTED (the EDS-1 ratchet shape). The six live sinks are
// the GREEN controls — they prove the probe can pass at all. The dead ones are
// pinned in KNOWN_SINKLESS: a type that gains a sink must be removed from that
// list in the same commit, and a type that loses one lands on it loudly.
//
// @see [[feedback_baseline_before_enforce]], [[feedback_a_consumer_finds_what_the_producer_cannot]]

import { describe, it, expect } from 'vitest';
import type { Engine, WorldState } from '@ai-rpg-engine/core';
import {
  computeOpportunityFallout,
  makeOpportunity,
  getLeverageState,
  getMaterialInventory,
  getPersistedOpportunities,
  getPersistedNpcObligations,
  getNetObligationWeight,
  getPlayerRumorState,
  getActivePressures,
  getDistrictEconomy,
  getSupplyLevel,
  getPartyState,
  getCompanion,
  getWorldMilestones,
  deriveNpcRelationship,
  HEAT_KEY,
  type OpportunityKind,
  type OpportunityFalloutEffect,
  type OpportunityResolutionType,
  type OpportunityState,
} from '@ai-rpg-engine/modules';
import { allPacks, type PackInfo } from './packs.js';
import { runHostileRound } from './bin.js';
import {
  POR_SEED,
  POR_ROUNDS,
  ALL_OPPORTUNITY_KINDS,
  playerHalfRound,
  type SessionProfile,
} from './packs-opportunity-reachability.test.js';

const NOOP = (): void => {};

/** Every member of the OpportunityFalloutEffect union, in declaration order. */
export const ALL_FALLOUT_EFFECT_TYPES: Array<OpportunityFalloutEffect['type']> = [
  'reputation',
  'leverage',
  'materials',
  'economy-shift',
  'rumor',
  'obligation',
  'spawn-pressure',
  'spawn-opportunity',
  'heat',
  'alert',
  'npc-relationship',
  'companion-morale',
  'milestone-tag',
  'title-trigger',
];

const ALL_RESOLUTION_TYPES: OpportunityResolutionType[] = [
  'completed',
  'failed',
  'abandoned',
  'betrayed',
  'expired',
  'declined',
];

// --- Measurement 1: the producer census -----------------------------------

/**
 * An opportunity furnished with every field the per-kind fallout authors read,
 * so the census measures what the CONTENT emits rather than what a sparse
 * fixture happens to reach. A source faction and NPC (most effects are gated
 * on one or the other), a linked district and companion, an `economy-shift`
 * reward (supply-run translates its own reward into fallout), the `companion`
 * tag (favor-request's morale arm), and urgency past 0.7 (the `declined`
 * arms). Under-furnishing this is how a census lies low.
 */
function furnishedOpportunity(kind: OpportunityKind): OpportunityState {
  return makeOpportunity({
    kind,
    sourceNpcId: 'fsa-npc',
    sourceFactionId: 'fsa-faction',
    title: 'census probe',
    description: 'census probe',
    objectiveDescription: 'census probe',
    linkedDistrictId: 'fsa-district',
    linkedNpcIds: ['fsa-companion'],
    urgency: 0.9,
    turnsRemaining: 5,
    visibility: 'known',
    rewards: [{ type: 'economy-shift', districtId: 'fsa-district', category: 'food', delta: 10 }],
    risks: [],
    genre: 'census',
    currentTick: 1,
    tags: ['companion'],
  });
}

/** `kind/resolution` sites that emit each effect type, sorted. */
export function producerCensus(): Map<OpportunityFalloutEffect['type'], string[]> {
  const byType = new Map<OpportunityFalloutEffect['type'], string[]>();
  for (const kind of ALL_OPPORTUNITY_KINDS) {
    for (const resolution of ALL_RESOLUTION_TYPES) {
      const fallout = computeOpportunityFallout(furnishedOpportunity(kind), resolution, {
        currentTick: 2,
        playerDistrictId: 'fsa-district',
        genre: 'census',
      });
      for (const effect of fallout.effects) {
        const sites = byType.get(effect.type) ?? [];
        sites.push(`${kind}/${resolution}`);
        byType.set(effect.type, sites);
      }
    }
  }
  for (const sites of byType.values()) sites.sort();
  return byType;
}

/**
 * Effect types the shipped fallout content emits NOWHERE, measured 2026-07-28
 * against `c51c19f`.
 *
 * Both are declared on `OpportunityFalloutEffect` AND on `OpportunityReward`,
 * formatted by `formatFalloutEffect`, and produced by nothing — the v3.7
 * lesson ("a rule with no reachable input has no input to fail on") one level
 * up, at the effect vocabulary itself. A sink for either would be a guard that
 * can never fire, so the sink and its producer are one piece of work.
 */
const KNOWN_UNPRODUCED: Array<OpportunityFalloutEffect['type']> = [
  'materials',
  'spawn-opportunity',
];

// --- Measurement 2: which resolutions a shipped path can reach -------------

/**
 * Resolution types reachable from OUTSIDE opportunity-resolution.ts, measured
 * against the production callers: the `opportunity` verb offers
 * accept|complete|abandon (`opportunityHandler`) and world-tick step 5b-i
 * expires. `failed`, `betrayed` and `declined` are fully authored, unit-tested,
 * and reached by nothing — the file says so itself in its own header.
 *
 * This is load-bearing for the audit below: `spawn-pressure` is emitted ONLY on
 * `betrayed`, so no played session can announce it and no sink for it could be
 * proven by playing.
 */
const REACHABLE_RESOLUTIONS: OpportunityResolutionType[] = ['completed', 'abandoned', 'expired'];

/** Effect types some reachable (kind, resolution) pair announces in principle. */
export function announceableTypes(): Set<OpportunityFalloutEffect['type']> {
  const reachable = new Set<OpportunityFalloutEffect['type']>();
  for (const [type, sites] of producerCensus()) {
    const live = sites.some((site) =>
      REACHABLE_RESOLUTIONS.includes(site.split('/')[1] as OpportunityResolutionType),
    );
    if (live) reachable.add(type);
  }
  return reachable;
}

// --- Measurement 3: the sink audit ----------------------------------------

/**
 * Read a single announced effect back through the OWNING system's public read
 * API — never through raw namespace state. A consequence that can only be
 * verified by reaching into `world.modules[...]` is not a sink, it is a stash.
 *
 * `undefined` means "this engine ships no public read API for this
 * consequence at all", which is itself a sink failure and is reported as one.
 */
export function readSink(world: WorldState, effect: OpportunityFalloutEffect): number | undefined {
  const player = world.entities[world.playerId];
  const custom = (player?.custom ?? {}) as Record<string, string | number | boolean>;

  switch (effect.type) {
    case 'reputation':
      return (
        (world.factions?.[effect.factionId]?.reputation ?? 0) +
        Number(world.globals[`reputation_${effect.factionId}`] ?? 0)
      );
    case 'leverage':
      return getLeverageState(custom)[effect.currency];
    case 'materials':
      return getMaterialInventory(custom)[effect.category];
    case 'economy-shift': {
      const economy = getDistrictEconomy(world, effect.districtId);
      return economy ? getSupplyLevel(economy, effect.category) : undefined;
    }
    case 'rumor':
      return getPlayerRumorState(world).rumors.filter((r) => r.claim === effect.claim).length;
    case 'obligation': {
      const ledger = getPersistedNpcObligations(world).get(effect.npcId);
      return ledger ? getNetObligationWeight(ledger, world.playerId) : 0;
    }
    case 'spawn-pressure':
      return getActivePressures(world).filter((p) => p.kind === effect.kind).length;
    case 'spawn-opportunity':
      return getPersistedOpportunities(world).filter((o) => o.kind === effect.kind).length;
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
    case 'milestone-tag':
      return getWorldMilestones(world).filter((m) => m.tags.includes(effect.tag)).length;
    case 'title-trigger':
      // No public read API exists for this consequence anywhere in the engine.
      // Building one is part of building the sink (a mark nobody can read is
      // not a mark) — see this file's contract above.
      return undefined;
  }
}

type Reached = {
  /** The world as it stood the instant BEFORE the resolution was submitted. */
  before: WorldState;
  /** The world immediately after — no world tick ran in between. */
  after: WorldState;
  /** Effects the resolution ANNOUNCED, straight off the fallout the engine emitted. */
  announced: OpportunityFalloutEffect[];
};

export function packById(id: string): PackInfo {
  return allPacks.find((p) => p.meta.id === id)!;
}

/** Submit one leg of the `opportunity` verb and fail loudly if it was rejected. */
export function opportunityOp(
  engine: Engine,
  offer: OpportunityState,
  op: 'accept' | 'complete' | 'abandon',
): void {
  const events = engine.submitAction('opportunity', { toolId: offer.id, parameters: { op } });
  const rejected = events.find((e) => e.type === 'action.rejected');
  expect(
    rejected,
    `${op} on ${offer.kind} was rejected: ${String(rejected?.payload?.reason)}`,
  ).toBeUndefined();
}

/**
 * Play the pinned session until `kind` is offered, reporting where it stopped.
 * Exported so each sink's own consequence suite drives the SAME session this
 * audit does — the POC-1/POR-1 relationship, one tier down.
 */
export function playUntilOffered(
  pack: PackInfo,
  kind: OpportunityKind,
  profile: SessionProfile,
): { engine: Engine; offer: OpportunityState; round: number } {
  const engine = pack.createGame(POR_SEED);
  const fullHp = engine.world.entities[engine.world.playerId]?.resources?.hp ?? 0;
  const visits = new Map<string, number>();

  for (let round = 0; round < POR_ROUNDS; round++) {
    const me = engine.world.entities[engine.world.playerId];
    if (!me) break;
    if (fullHp > 0 && me.resources) me.resources.hp = fullHp;
    playerHalfRound(engine, round, profile, visits);
    runHostileRound(engine, pack, { log: NOOP });

    const offer = getPersistedOpportunities(engine.world).find(
      (o) => o.kind === kind && o.status === 'available',
    );
    if (offer) return { engine, offer, round: round + 1 };
  }
  throw new Error(
    `${pack.meta.id} never offered a \`${kind}\` in ${POR_ROUNDS} rounds — POR-1 says it should.`,
  );
}

/** The effects an `opportunity.*` event announced, off the real event log delta. */
function announcedSince(engine: Engine, cursor: number): OpportunityFalloutEffect[] {
  return engine.world.eventLog
    .slice(cursor)
    .filter((e) => e.type.startsWith('opportunity.'))
    .flatMap((e) => (Array.isArray(e.payload?.effects) ? e.payload.effects : []))
    .filter((e): e is OpportunityFalloutEffect => typeof e === 'object' && e !== null && 'type' in e);
}

/**
 * Drive a real session to a completion or abandonment through the shipped verb.
 *
 * ATOMIC BY CONSTRUCTION, and that is the whole point: `submitAction` runs the
 * verb handler and nothing else — no world tick, so no npc-agency step, no
 * pressure lifecycle, no cognition decay. Anything that moves between `before`
 * and `after` moved because this resolution's fallout moved it.
 */
function resolveThroughVerb(
  packId: string,
  kind: OpportunityKind,
  op: 'complete' | 'abandon',
  profile: SessionProfile = 'wandering',
): Reached {
  const { engine, offer } = playUntilOffered(packById(packId), kind, profile);
  opportunityOp(engine, offer, 'accept');

  const before = structuredClone(engine.world) as WorldState;
  const cursor = engine.world.eventLog.length;
  opportunityOp(engine, offer, op);

  return { before, after: engine.world, announced: announcedSince(engine, cursor) };
}

/**
 * Every drive the audit needs, each one a real played session. Chosen for
 * COVERAGE per drive — `salt-road-ledger`'s completed contract alone announces
 * five distinct effect types — because each entry costs up to POR_ROUNDS of
 * full rounds.
 *
 * All seven are verb drives. The world tick's own expiry path (step 5b-i)
 * announces the same effect types through the same `applyOpportunityFallout`,
 * and POC-1 already proves a lapsed `supply-run` lands its economy shift on
 * real content — but a tick round moves a dozen stores at once, so it cannot
 * attribute a delta to the fallout. Attribution is what this file sells.
 */
const DRIVES: Array<{ label: string; run: () => Reached }> = [
  { label: 'contract completed (salt-road-ledger)', run: () => resolveThroughVerb('salt-road-ledger', 'contract', 'complete') },
  { label: 'contract abandoned (salt-road-ledger)', run: () => resolveThroughVerb('salt-road-ledger', 'contract', 'abandon') },
  { label: 'supply-run completed (salt-road-ledger)', run: () => resolveThroughVerb('salt-road-ledger', 'supply-run', 'complete') },
  { label: 'faction-job completed (neon-lockbox)', run: () => resolveThroughVerb('neon-lockbox', 'faction-job', 'complete', 'pursuing') },
  { label: 'faction-job abandoned (neon-lockbox)', run: () => resolveThroughVerb('neon-lockbox', 'faction-job', 'abandon', 'pursuing') },
  { label: 'favor-request completed (crimson-court)', run: () => resolveThroughVerb('crimson-court', 'favor-request', 'complete', 'engaged') },
  { label: 'escort completed (chapel-threshold)', run: () => resolveThroughVerb('chapel-threshold', 'escort', 'complete', 'pursuing') },
];

export type SinkVerdict = {
  type: OpportunityFalloutEffect['type'];
  /** A drive that announced this effect type, or undefined if none did. */
  announcedBy?: string;
  /** True when a public read API observed the announced consequence afterwards. */
  persisted: boolean;
  detail: string;
};

/**
 * Run every drive once and report, per effect type, whether the announced
 * consequence survived into a readable world.
 *
 * Cached because each drive plays real rounds and several tests below read the
 * same verdicts. Deterministic — every drive is seeded POR_SEED and drives the
 * same player.
 */
let auditCache: Map<OpportunityFalloutEffect['type'], SinkVerdict> | undefined;

export function sinkAudit(): Map<OpportunityFalloutEffect['type'], SinkVerdict> {
  if (auditCache) return auditCache;

  const verdicts = new Map<OpportunityFalloutEffect['type'], SinkVerdict>();
  for (const type of ALL_FALLOUT_EFFECT_TYPES) {
    verdicts.set(type, { type, persisted: false, detail: 'no played session announced it' });
  }

  for (const drive of DRIVES) {
    const { before, after, announced } = drive.run();
    for (const effect of announced) {
      const current = verdicts.get(effect.type)!;
      if (current.persisted) continue; // already proven by an earlier drive

      const now = readSink(after, effect);
      if (now === undefined) {
        verdicts.set(effect.type, {
          type: effect.type,
          announcedBy: drive.label,
          persisted: false,
          detail: 'no public read API exists for this consequence',
        });
        continue;
      }

      // The whole measurement, in one line: did the owning store MOVE across
      // an action that ran nothing but this resolution? A zero delta on an
      // announced effect is a consequence the world did not record.
      const then = readSink(before, effect) ?? 0;
      const landed = now !== then;
      verdicts.set(effect.type, {
        type: effect.type,
        announcedBy: drive.label,
        persisted: landed,
        detail: landed
          ? `${then} → ${now} via ${drive.label}`
          : `announced by ${drive.label}, and the read API still reports ${now}`,
      });
    }
  }

  auditCache = verdicts;
  return verdicts;
}

/**
 * Effect types that a real played session ANNOUNCES and no public read can
 * observe afterwards. Measured 2026-07-28 against `c51c19f`, before any sink
 * was built.
 *
 * `spawn-pressure` is absent from this list and NOT fixed: it is emitted only
 * on `betrayed`, which no shipped path reaches, so no session announces it (see
 * REACHABLE_RESOLUTIONS). It is dead one level earlier than these are.
 */
const KNOWN_SINKLESS: Array<OpportunityFalloutEffect['type']> = [
  'rumor',
  // 'obligation' — SINK BUILT v3.8 (npc-agency's persisted ledgers).
  'npc-relationship',
  // 'milestone-tag' — SINK BUILT v3.8 (recordMilestone). Removed here in the
  // same commit that wired it, per this list's own contract.
  'title-trigger',
];

/**
 * The six effect types `applyOpportunityFallout` has always persisted. These
 * are the audit's GREEN CONTROLS: a probe that reported everything sinkless
 * would also "pass" the ratchet below, and these rows are what makes that
 * impossible.
 */
const KNOWN_PERSISTED: Array<OpportunityFalloutEffect['type']> = [
  'reputation',
  'leverage',
  'economy-shift',
  'heat',
  'alert',
  'companion-morale',
];

// --- The gates ------------------------------------------------------------

describe('fallout producer census (FSA-1)', () => {
  it('the set of effect types nothing emits is exactly what v3.7 shipped', () => {
    const census = producerCensus();
    const unproduced = ALL_FALLOUT_EFFECT_TYPES.filter((t) => !census.has(t));

    const appeared = unproduced.filter((t) => !KNOWN_UNPRODUCED.includes(t));
    expect(
      appeared,
      'an effect type LOST its last producer. Either restore the content that emitted it, or\n' +
        '  add it here with an owner — but do not leave a sink wired to nothing.',
    ).toEqual([]);

    const produced = KNOWN_UNPRODUCED.filter((t) => census.has(t));
    expect(
      produced,
      'these had no producer and now do — good. Remove them from KNOWN_UNPRODUCED in the SAME\n' +
        '  commit that authored the fallout, so this list stays a true measurement.',
    ).toEqual([]);
  });

  it('`spawn-pressure` is emitted only on a resolution nothing reaches', () => {
    // The finding that separates "no sink" from "no announcement". Every
    // spawn-pressure site is a betrayal, and betrayal has no production caller
    // — so a sink for it could not be proven by playing, only by unit test.
    const sites = producerCensus().get('spawn-pressure') ?? [];
    expect(sites.length, 'spawn-pressure lost its producers entirely').toBeGreaterThan(0);
    expect(
      sites.filter((s) => REACHABLE_RESOLUTIONS.includes(s.split('/')[1] as OpportunityResolutionType)),
      'a reachable resolution now emits spawn-pressure — update REACHABLE_RESOLUTIONS or this note.',
    ).toEqual([]);
  });
});

describe('fallout sink audit (FSA-1)', () => {
  it('the set of announced-but-unpersisted consequences is exactly what v3.7 shipped', () => {
    const verdicts = sinkAudit();
    const sinkless = ALL_FALLOUT_EFFECT_TYPES.filter(
      (t) => verdicts.get(t)!.announcedBy !== undefined && !verdicts.get(t)!.persisted,
    );

    const appeared = sinkless.filter((t) => !KNOWN_SINKLESS.includes(t));
    expect(
      appeared,
      'NEW sinkless consequence: a played session announces this and no read API can see it.\n' +
        `  ${appeared.map((t) => `${t}: ${verdicts.get(t)!.detail}`).join('\n  ')}`,
    ).toEqual([]);

    const wiredUp = KNOWN_SINKLESS.filter((t) => !sinkless.includes(t));
    expect(
      wiredUp,
      'these were sinkless and now persist — good. Remove them from KNOWN_SINKLESS in the SAME\n' +
        '  commit that wired them, so this list stays a true measurement.',
    ).toEqual([]);
  });

  it('the six live sinks are observably live — the probe can pass (control)', () => {
    // Without this row a probe that reported EVERYTHING sinkless would satisfy
    // the ratchet above. @see [[feedback_a_consumer_finds_what_the_producer_cannot]]
    const verdicts = sinkAudit();
    const failed = KNOWN_PERSISTED.filter((t) => !verdicts.get(t)!.persisted);
    expect(
      failed,
      'a sink that has always worked now reads as dead. Either a real regression, or the probe\n' +
        `  broke: ${failed.map((t) => `${t}: ${verdicts.get(t)!.detail}`).join(', ')}`,
    ).toEqual([]);
  });

  it('and the drives announce SOMETHING — an empty audit would pass vacuously', () => {
    const verdicts = sinkAudit();
    const announced = ALL_FALLOUT_EFFECT_TYPES.filter((t) => verdicts.get(t)!.announcedBy !== undefined);
    expect(announced.length).toBeGreaterThanOrEqual(KNOWN_PERSISTED.length + KNOWN_SINKLESS.length);
  });
});
