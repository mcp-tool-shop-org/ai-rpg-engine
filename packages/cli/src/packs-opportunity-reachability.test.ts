// POR-1 — catalog-wide OPPORTUNITY-KIND reachability.
//
// PVR-1 (packs-verb-reachability.test.ts) asks whether a pack's advertised
// VERBS have a reachable target. This asks the same question one tier up, of
// the strategic layer: the engine declares eight opportunity kinds, ships
// eight evaluators for them, and unit-tests every evaluator green — but a unit
// test HANDS the evaluator its inputs. Nothing in this repo ever asked whether
// a played session PRODUCES those inputs. Seven of the eight kinds turned out
// never to have fired in any world this catalog ships.
//
// SHAPE — a played session, not a fixture. Each probe boots a pack and drives
// FULL ROUNDS through `runHostileRound`, the same driver the interactive CLI
// calls: NPC turns, companion turns, then `runWorldTick`. That is load-bearing
// and was nearly got wrong last cycle: `runWorldTick` is not a verb and not an
// event subscription, so a probe built from `submitAction` alone drives half a
// round forever and reports the entire strategic layer dead. It is not dead.
// The v3.6 near-miss headline ("no pack spawns opportunities") was a true
// claim about a broken probe and a false claim about the engine.
//
// WHAT IT READS — the `opportunity.spawned` events the world tick emits, off
// the real event log. Not the evaluator's return value, not a re-implementation
// of its gate: if the spawn rules change, this suite follows them for free.
//
// BOTH DIRECTIONS, COMMITTED. A suite that starts almost-all-red cannot prove
// itself by going green later — a broken probe is red too. So this file ships
// three controls in the same commit:
//   1. `WANDERING_BASELINE` reproduces the exact 1-of-8 state v3.6 recorded,
//      pinned as data. If a fix makes a kind fire, this row moves and the
//      change is visible; if the probe breaks, this row collapses.
//   2. a per-kind SYNTHETIC PASS — a world held in the condition each
//      evaluator says it wants, proving every axis can go green.
//   3. a STRIP CONTROL — remove the held condition, the axis goes red again.

import { describe, it, expect } from 'vitest';
import type { Engine, EntityState } from '@ai-rpg-engine/core';
import {
  getPartyState,
  getEconomyCoreState,
  getSupplyLevel,
  getPersistedOpportunities,
  getDistrictState,
  getWorldTickState,
  setDistrictEconomy,
  makePressure,
  type NpcObligationLedger,
  type OpportunityKind,
  type SupplyCategory,
  type WorldPressure,
} from '@ai-rpg-engine/modules';
import { allPacks, type PackInfo } from './packs.js';
import { runHostileRound } from './bin.js';

/** Pinned — every probe in this file boots the same world (PIN_PER_STEP). */
export const POR_SEED = 71;
/**
 * Pinned session length. Long enough that MIN_TURNS_BETWEEN_SPAWNS (3) is not
 * the binding constraint on kind variety — 40 rounds affords ~13 spawns
 * against a 5-slot cap — and long enough for DEFAULT_DEADLINE (12) to run out
 * on an unaccepted offer, so natural expiry falls inside the window.
 */
export const POR_ROUNDS = 40;

export const ALL_OPPORTUNITY_KINDS: OpportunityKind[] = [
  'bounty',
  'contract',
  'escort',
  'faction-job',
  'favor-request',
  'investigation',
  'recovery',
  'supply-run',
];

// --- Session driver -------------------------------------------------------

/**
 * How the player spends their half of each round.
 *
 * `wandering` is the FLOOR — move, and speak to whoever is standing here. It
 * is what the world offers someone merely present and sociable.
 *
 * `engaged` adds recruiting. That is not the probe stacking the deck: `recruit`
 * is advertised by every pack in the catalog and PVR-1 proves it reaches a
 * valid target in all eleven, so a session that never recruits models a player
 * who declines a core verb rather than a player at the floor. Two evaluators
 * (companion asks, escort) read the party, so measuring them against a
 * deliberately empty party would measure the probe.
 */
export type SessionProfile = 'wandering' | 'engaged';

export type PlayedSession = {
  packId: string;
  profile: SessionProfile;
  roundsPlayed: number;
  spawns: Array<{ kind: OpportunityKind; round: number; reason: string }>;
  expiries: Array<{ kind: OpportunityKind; summary: string }>;
  kindsFired: Set<OpportunityKind>;
  /** Human-readable snapshot of the evaluators' own inputs at session end. */
  diagnostics: string;
};

const NOOP = (): void => {};

function playerOf(engine: Engine): EntityState | undefined {
  return engine.world.entities[engine.world.playerId];
}

function coLocatedNpcs(engine: Engine): EntityState[] {
  const me = playerOf(engine);
  return Object.values(engine.world.entities).filter(
    (e) => e.id !== engine.world.playerId && e.type === 'npc' && e.zoneId === me?.zoneId,
  );
}

function playerHalfRound(engine: Engine, round: number, profile: SessionProfile): void {
  const me = playerOf(engine);
  if (!me) return;

  // Recruiting: try once per co-located NPC per visit. The engine rejects
  // anyone who is not recruitable, which costs the round nothing.
  if (profile === 'engaged' && round % 4 === 1) {
    const party = getPartyState(engine.world);
    const alreadyIn = new Set(party.companions.map((c) => c.npcId));
    const candidate = coLocatedNpcs(engine).find((n) => !alreadyIn.has(n.id));
    if (candidate) {
      engine.submitAction('recruit', { targetIds: [candidate.id] });
      return;
    }
  }

  // Light social play — speaking is how dialogue-bearing packs move NPC goals
  // and obligations at all.
  if (round % 3 === 2) {
    const neighbour = coLocatedNpcs(engine)[0];
    if (neighbour) {
      engine.submitAction('speak', { targetIds: [neighbour.id] });
      return;
    }
  }

  // Wander: rotate deterministically through this zone's exits, sorted so the
  // route is a pure function of the world rather than of insertion order.
  const exits = [...(engine.world.zones[me.zoneId ?? '']?.neighbors ?? [])].sort();
  if (exits.length > 0) {
    engine.submitAction('move', { targetIds: [exits[round % exits.length]] });
    return;
  }
  engine.submitAction('wait', {});
}

/**
 * Play `rounds` full rounds and report what the strategic layer offered.
 *
 * `hold` runs at the TOP of every round, before the player acts. Synthetic
 * controls need that: the world tick rebuilds NPC profiles from entities and
 * decays every district economy back toward baseline each round, so a
 * condition injected once at boot is gone by the time the evaluator reads it.
 * A held condition models "a world that IS like this", which is exactly what
 * each evaluator's gate is written against.
 *
 * Keeping the player standing is pinned ON and is a measurement decision, not
 * a convenience: `runHostileRound`'s own end-gates make every round after a
 * downed player a no-op, so a probe that dies on round 6 reports six kinds
 * dead for reasons that have nothing to do with the opportunity system.
 * Restoring hp writes no opportunity input — heat, reputation, obligations,
 * economies and pressures all still accrue from real play.
 */
export function playSession(
  pack: PackInfo,
  opts: {
    rounds?: number;
    seed?: number;
    profile?: SessionProfile;
    hold?: (engine: Engine, round: number) => void;
  } = {},
): PlayedSession {
  const rounds = opts.rounds ?? POR_ROUNDS;
  const profile = opts.profile ?? 'wandering';
  const engine = pack.createGame(opts.seed ?? POR_SEED);

  const fullHp = playerOf(engine)?.resources?.hp ?? 0;

  const spawns: PlayedSession['spawns'] = [];
  const expiries: PlayedSession['expiries'] = [];
  let roundsPlayed = 0;
  let logCursor = engine.world.eventLog.length;

  for (let round = 0; round < rounds; round++) {
    const living = playerOf(engine);
    if (!living) break;
    if (fullHp > 0 && living.resources) living.resources.hp = fullHp;
    opts.hold?.(engine, round);

    playerHalfRound(engine, round, profile);
    runHostileRound(engine, pack, { log: NOOP });
    roundsPlayed++;

    for (const event of engine.world.eventLog.slice(logCursor)) {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      if (event.type === 'opportunity.spawned') {
        spawns.push({
          kind: payload.kind as OpportunityKind,
          round,
          reason: String(payload.reason ?? ''),
        });
      } else if (event.type === 'opportunity.expired') {
        expiries.push({
          kind: payload.kind as OpportunityKind,
          summary: String(payload.summary ?? ''),
        });
      }
    }
    logCursor = engine.world.eventLog.length;
  }

  return {
    packId: pack.meta.id,
    profile,
    roundsPlayed,
    spawns,
    expiries,
    kindsFired: new Set(spawns.map((s) => s.kind)),
    diagnostics: describeInputs(engine),
  };
}

/**
 * Snapshot the signals the eight evaluators key off, in their own terms, so a
 * dead kind reports a CAUSE and not just a zero. Diagnostic only — nothing in
 * this file asserts on this string.
 */
/**
 * npc-agency's persisted namespace, read the same non-attaching way director.ts
 * reads it. The engine exports no accessor for the obligation ledgers, so the
 * probe reads the shape rather than inventing an export just for a test.
 */
type NpcAgencyNamespace = {
  profiles?: Array<{ breakpoint?: string; goals?: Array<{ verb: string; priority: number }> }>;
  obligationLedgers?: Record<string, NpcObligationLedger>;
};

function npcAgencyOf(engine: Engine): NpcAgencyNamespace {
  const raw = engine.world.modules['npc-agency'];
  return raw && typeof raw === 'object' ? (raw as NpcAgencyNamespace) : {};
}

function describeInputs(engine: Engine): string {
  const world = engine.world;

  const factionIds = new Set<string>(Object.keys(world.factions ?? {}));
  for (const key of Object.keys(world.globals)) {
    if (key.startsWith('reputation_')) factionIds.add(key.slice('reputation_'.length));
  }
  const reputations = [...factionIds].sort().map((id) => ({
    id,
    value: (world.factions?.[id]?.reputation ?? 0) + Number(world.globals[`reputation_${id}`] ?? 0),
  }));
  const nonZeroReps = reputations.filter((r) => r.value !== 0);

  const npcState = npcAgencyOf(engine);
  const profiles = npcState.profiles ?? [];
  const goals = profiles.flatMap((p) =>
    (p.goals ?? []).map((g) => `${g.verb}@${g.priority.toFixed(2)}`),
  );
  const debts = Object.values(npcState.obligationLedgers ?? {}).flatMap((ledger) =>
    (ledger.obligations ?? [])
      .filter((o) => o.direction === 'player-owes-npc')
      .map((o) => o.magnitude),
  );

  const categories: SupplyCategory[] = [
    'medicine', 'weapons', 'ammunition', 'food', 'fuel', 'luxuries', 'components',
  ];
  const districts = Object.entries(getEconomyCoreState(world).districts)
    .map(([id, eco]) => {
      const lowest = categories
        .map((c) => ({ c, level: getSupplyLevel(eco, c) }))
        .sort((a, b) => a.level - b.level)[0];
      return `${id}(trade:${Math.round(eco.tradeVolume)} bm:${eco.blackMarketActive ? 'Y' : 'n'} low:${lowest.c}=${lowest.level})`;
    })
    .join(' ');

  const companions = getPartyState(world).companions;
  const tickState = (world.modules['world-tick'] ?? {}) as { pressures?: WorldPressure[] };

  return [
    `pressures=[${(tickState.pressures ?? []).map((p) => p.kind).sort().join(',') || 'none'}]`,
    `factions=${reputations.length} nonZeroReps=[${nonZeroReps.map((r) => `${r.id}:${r.value}`).join(',') || 'none'}]`,
    `npcProfiles=${profiles.length} breakpoints=[${[...new Set(profiles.map((p) => p.breakpoint ?? '?'))].sort().join(',') || 'none'}] goals=[${goals.join(',') || 'none'}]`,
    `playerDebts=[${debts.join(',') || 'none'}]`,
    `companions=${companions.filter((c) => c.active).length}/${companions.length} active`,
    `districts=${districts || 'none'}`,
    `liveOpportunities=${getPersistedOpportunities(world).length}`,
  ].join(' | ');
}

// --- The catalog-wide measurement ----------------------------------------

/** Computed ONCE — 11 packs × 2 profiles × 40 full rounds is the cost here. */
const SESSIONS: PlayedSession[] = allPacks.flatMap((pack) => [
  playSession(pack, { profile: 'wandering' }),
  playSession(pack, { profile: 'engaged' }),
]);

function packsReaching(kind: OpportunityKind, sessions = SESSIONS): string[] {
  return [...new Set(sessions.filter((s) => s.kindsFired.has(kind)).map((s) => s.packId))];
}

export function starvationTable(sessions: PlayedSession[] = SESSIONS): string {
  const header = ['pack / profile'.padEnd(34), ...ALL_OPPORTUNITY_KINDS.map((k) => k.slice(0, 5).padEnd(7))].join('');
  const rows = sessions.map((s) =>
    [
      `${s.packId} (${s.profile})`.padEnd(34),
      ...ALL_OPPORTUNITY_KINDS.map((k) => (s.kindsFired.has(k) ? '  ✓    ' : '  ·    ')),
      `  ${s.spawns.length} spawns, ${s.expiries.length} expiries`,
    ].join(''),
  );
  const totals = ALL_OPPORTUNITY_KINDS.map((k) => {
    const packs = packsReaching(k, sessions);
    return `  ${k.padEnd(14)} ${packs.length}/${allPacks.length} packs${packs.length ? ` — ${packs.join(', ')}` : ''}`;
  });
  const inputs = sessions
    .filter((s) => s.profile === 'engaged')
    .map((s) => `    ${s.packId.padEnd(24)} ${s.diagnostics}`);
  return [
    header,
    ...rows,
    '',
    '  kinds reached:',
    ...totals,
    '',
    '  evaluator inputs at session end (engaged profile):',
    ...inputs,
  ].join('\n');
}

/**
 * Which kinds a played session can actually reach TODAY, and — for the ones it
 * cannot — the measured reason, in the evaluator's own terms.
 *
 * Recorded rather than asserted-true because a suite that starts five-eighths
 * red proves nothing by being red: so does a broken probe. Pinning the truth
 * means BOTH directions fail loudly — a kind that quietly stops firing, and a
 * kind that starts. Each P1 fix flips exactly one entry in the same commit as
 * the fix, so the frontier is always readable off this table. When every entry
 * reads `true`, this becomes the plain 8-of-8 gate.
 *
 * @see [[feedback_baseline_before_enforce]]
 */
const REACHABLE_TODAY: Record<OpportunityKind, { reachable: boolean; measured: string }> = {
  investigation: {
    reachable: true,
    measured:
      'fires in all 11 packs. Every district ships contraband at the 50 baseline and ' +
      '`isBlackMarketCondition` triggers above 30, so the black market is permanently open ' +
      'everywhere and the district rule always has this to offer.',
  },
  escort: {
    reachable: true,
    measured:
      'fires once the player recruits (7 of 11 packs have a companion reachable by a wandering ' +
      'player). The faction path is dead — see `faction-job`.',
  },
  'favor-request': {
    reachable: true,
    measured:
      'fires from the companion-ask path once the player recruits. The obligation path is dead: ' +
      'no played session produces a `player-owes-npc` ledger entry at magnitude >= 4.',
  },
  bounty: {
    reachable: false,
    measured:
      'needs a live `bounty-issued` pressure AND a rival faction at rep >= 10. NO PACK IN THE ' +
      'CATALOG POPULATES `world.factions`, and no `reputation_*` global ever accrues in a played ' +
      'session, so `playerReputations` is empty in all 11 worlds. No pressure of that kind ever ' +
      'becomes active either.',
  },
  'faction-job': {
    reachable: false,
    measured:
      'needs rep >= 30 with some faction (the ally tier). Same root cause as `bounty`: there are ' +
      'no factions to have reputation with. The NPC path needs a favorable-or-better NPC with a ' +
      '`recruit` goal, and every named NPC in the catalog derives `wavering`.',
  },
  'supply-run': {
    reachable: false,
    measured:
      'the pressure path needs a live `supply-crisis`; the scarcity path needs a supply below 20 ' +
      'AND `findLocalFaction`, which returns undefined with no factions. Supplies sit at ~49 — ' +
      '`tickDistrictEconomy` drags every category back toward the 50 baseline each round.',
  },
  contract: {
    reachable: false,
    measured:
      'needs an NPC at breakpoint favorable-or-allied carrying a `bargain` goal. The bargain goal ' +
      'needs greed > 60 and `favorable` requires greed < 50, so only an ALLIED (trust >= 60, ' +
      'loyalty >= 50) AND greedy NPC can ever carry it. Trust comes from ' +
      "`relations['player-trust']`, authored exactly ONCE in the entire catalog (fantasy's Aldric, " +
      'at 15 — still under the 30 favorable bar), so every named NPC in every pack is `wavering`.',
  },
  recovery: {
    reachable: false,
    measured:
      'the district rule returns `investigation` first whenever the black market is open, and it ' +
      'is open in every district of every pack (see `investigation`). Even reached, it needs trade ' +
      'volume under 30, and trade volume tracks district-core commerce, which baselines at 50.',
  },
};

describe('opportunity-kind reachability × real catalog (POR-1)', () => {
  it('every pack plays the full pinned session — a truncated run measures nothing', () => {
    for (const session of SESSIONS) {
      expect(
        session.roundsPlayed,
        `${session.packId} (${session.profile}) stopped after ${session.roundsPlayed}/${POR_ROUNDS} rounds`,
      ).toBe(POR_ROUNDS);
    }
  });

  for (const kind of ALL_OPPORTUNITY_KINDS) {
    const { reachable, measured } = REACHABLE_TODAY[kind];
    const title = reachable
      ? `\`${kind}\` fires in at least one pack's played session`
      : `\`${kind}\` still does NOT fire on authored content (recorded, P1 target)`;

    it(title, () => {
      expect(
        packsReaching(kind).length > 0,
        reachable
          ? `\`${kind}\` used to fire and no longer does.\n  It was reachable because: ${measured}\n\n${starvationTable()}\n`
          : `\`${kind}\` now fires and the recorded state says it cannot.\n` +
              `  If a fix caused this, flip REACHABLE_TODAY.${kind} to \`reachable: true\` in the SAME commit.\n` +
              `  It was dead because: ${measured}\n\n${starvationTable()}\n`,
      ).toBe(reachable);
    });
  }

  it('opportunity expiry fallout (world-tick step 5b-i) executes on authored content', () => {
    const withExpiries = SESSIONS.filter((s) => s.expiries.length > 0);
    expect(
      withExpiries.length,
      'no opportunity in any pack ever reached its deadline unaccepted, so the authored expiry\n' +
        '  fallout (reputation hits, obligations, economy shifts) has never run on real content.\n' +
        `  Deadlines are cosmetic until this passes.\n\n${starvationTable()}\n`,
    ).toBeGreaterThan(0);
  });
});

// --- Control 1: the pinned baseline --------------------------------------
//
// The state v3.6.0 shipped, recorded as data so it cannot quietly drift. When
// a P1 fix lights a kind, this table is what changes — and a probe that breaks
// changes it too, in the opposite direction.

const WANDERING_BASELINE: Record<OpportunityKind, number> = {
  bounty: 0,
  contract: 0,
  escort: 0,
  'faction-job': 0,
  'favor-request': 0,
  investigation: 11,
  recovery: 0,
  'supply-run': 0,
};

describe('meta: POR-1 reproduces the measured baseline (control 1)', () => {
  it('a purely wandering player still finds exactly one kind — investigation, in all 11 packs', () => {
    const wandering = SESSIONS.filter((s) => s.profile === 'wandering');
    const measured = Object.fromEntries(
      ALL_OPPORTUNITY_KINDS.map((k) => [k, packsReaching(k, wandering).length]),
    );
    expect(
      measured,
      'the wandering baseline moved. If a P1 fix caused this, update WANDERING_BASELINE in the same\n' +
        `commit and say so. If nothing was fixed, the probe changed:\n\n${starvationTable(wandering)}\n`,
    ).toEqual(WANDERING_BASELINE);
  });
});

// --- Control 2 + 3: per-kind synthetic pass, and the strip -----------------
//
// Each hold puts the world in the condition that kind's evaluator says it
// wants, restated in world terms. These are NOT the shipped fix — they prove
// the AXIS HAS TEETH: an axis that cannot be made green by satisfying its own
// gate is not measuring that gate. `strip` removes exactly the held condition
// and nothing else, so a red result there is attributable.

type KindControl = {
  kind: OpportunityKind;
  /** Why this world satisfies the evaluator, in the evaluator's own terms. */
  because: string;
  hold: (engine: Engine, round: number) => void;
  profile?: SessionProfile;
};

/**
 * Reputation, granted the way the engine itself grants it.
 *
 * `buildPressureInputs` derives the faction roster from `reputation_*` globals
 * UNION `world.factions` — so a global alone mints a faction the opportunity
 * rules can see, with the same neutral `factionStates` default (alert 0,
 * cohesion 0.8) any unconfigured faction gets. That matters because NO PACK IN
 * THE CATALOG POPULATES `world.factions` AT ALL, which is precisely what these
 * controls have to work around to prove the reputation-gated axes have teeth.
 */
function grantReputation(engine: Engine, factionId: string, value: number): void {
  const base = engine.world.factions?.[factionId]?.reputation ?? 0;
  engine.world.globals[`reputation_${factionId}`] = value - base;
}

/**
 * Faction ids the world offers, or synthetic ones when it offers none. Every
 * pack currently lands in the second case — see `grantReputation`.
 */
function factionIdsOf(engine: Engine): [string, string] {
  const authored = Object.keys(engine.world.factions ?? {}).sort();
  return [authored[0] ?? 'por1-crown', authored[1] ?? 'por1-guild'];
}

function districtIdsOf(engine: Engine): string[] {
  return Object.keys(getEconomyCoreState(engine.world).districts).sort();
}

/**
 * Force every district into the shape `opts` names, every round.
 *
 * Two traps, both hit on the first draft:
 *  - `isBlackMarketCondition` fires on contraband ABOVE 30 *or* on ANY category
 *    below 20 — so pushing contraband to 5 to close a black market opens one.
 *    The only quiet band is 20 < contraband <= 30.
 *  - `tickDistrictEconomy` recomputes trade volume as `commerce * 0.8 + prev *
 *    0.2`, so holding trade volume alone converges back to commerce. The
 *    district-core commerce gauge is the real lever.
 */
function shapeDistricts(
  engine: Engine,
  opts: { commerce?: number; contraband?: number; scarce?: SupplyCategory },
): void {
  for (const districtId of districtIdsOf(engine)) {
    if (opts.commerce !== undefined) {
      const district = getDistrictState(engine.world, districtId);
      if (district) district.commerce = opts.commerce;
    }
    const economy = getEconomyCoreState(engine.world).districts[districtId];
    const supplies = { ...economy.supplies };
    if (opts.contraband !== undefined) {
      supplies.contraband = { ...supplies.contraband, level: opts.contraband };
    }
    if (opts.scarce) {
      supplies[opts.scarce] = { ...supplies[opts.scarce], level: 5 };
    }
    setDistrictEconomy(engine.world, districtId, { ...economy, supplies });
  }
}

/**
 * Keep one pressure of `kind` live in the tick's own pressure list.
 * `getWorldTickState` hands back the ATTACHED state object and the tick mutates
 * it in place, so this pushes into that array rather than replacing the
 * namespace — a replacement is dropped the moment the tick writes back through
 * its own reference.
 */
function holdPressure(engine: Engine, kind: WorldPressure['kind'], factionId: string): void {
  const state = getWorldTickState(engine.world);
  if (state.pressures.some((p) => p.kind === kind)) return;
  state.pressures.push(
    makePressure({
      kind,
      sourceFactionId: factionId,
      description: `held by POR-1 to prove the ${kind} axis can fire`,
      triggeredBy: 'por-1-control',
      urgency: 0.8,
      visibility: 'public',
      turnsRemaining: 40,
      potentialOutcomes: [],
      tags: [],
      currentTick: engine.world.meta.tick,
    }),
  );
}

const KIND_CONTROLS: KindControl[] = [
  {
    kind: 'bounty',
    because: 'a live `bounty-issued` pressure, plus a rival faction at rep >= 10 to offer the job',
    hold: (engine) => {
      const [first, second] = factionIdsOf(engine);
      holdPressure(engine, 'bounty-issued', first);
      grantReputation(engine, second, 25);
    },
  },
  {
    kind: 'supply-run',
    because: 'a live `supply-crisis` pressure (evaluatePressureLinkedOpportunities)',
    hold: (engine) => holdPressure(engine, 'supply-crisis', factionIdsOf(engine)[0]),
  },
  {
    kind: 'faction-job',
    because: 'reputation >= 30 (ally tier) with a faction whose alert level is under 50',
    hold: (engine) => grantReputation(engine, factionIdsOf(engine)[0], 40),
  },
  {
    kind: 'escort',
    because: 'reputation >= ESCORT_TRUST_THRESHOLD (50) plus a district gone dangerous',
    hold: (engine) => grantReputation(engine, factionIdsOf(engine)[0], 60),
  },
  {
    kind: 'recovery',
    because:
      'trade volume under 30 with NO black market — the district rule returns investigation first ' +
      'whenever contraband is above 30, and every district in the catalog ships contraband at the ' +
      '50 baseline',
    hold: (engine) => {
      grantReputation(engine, factionIdsOf(engine)[0], 5); // findLocalFaction needs SOME faction
      shapeDistricts(engine, { commerce: 5, contraband: 25 });
    },
  },
  {
    kind: 'favor-request',
    because: 'an obligation ledger where the player owes a named NPC magnitude >= 4',
    hold: (engine) => {
      const npc = Object.values(engine.world.entities).find(
        (e) => e.id !== engine.world.playerId && e.type === 'npc' && e.name,
      );
      if (!npc) return;
      const namespace = npcAgencyOf(engine);
      const ledgers = { ...(namespace.obligationLedgers ?? {}) };
      const owed = ledgers[npc.id]?.obligations ?? [];
      if (owed.some((o) => o.direction === 'player-owes-npc' && o.magnitude >= 4)) return;
      ledgers[npc.id] = {
        obligations: [
          ...owed,
          {
            id: `por1-${npc.id}`,
            kind: 'debt',
            direction: 'player-owes-npc',
            npcId: npc.id,
            counterpartyId: engine.world.playerId,
            magnitude: 8,
            sourceTag: 'por-1-control',
            createdAtTick: 0,
            decayTurns: null,
          },
        ],
      };
      engine.world.modules['npc-agency'] = { ...namespace, obligationLedgers: ledgers };
    },
  },
  {
    kind: 'contract',
    because:
      'an ALLIED, greedy NPC standing with the player — deriveLoyaltyBreakpoint needs trust >= 60 ' +
      'and loyalty >= 50, while the `bargain` goal needs greed > 60, so `favorable` (greed < 50) ' +
      'can never carry this kind',
    hold: (engine) => {
      const me = playerOf(engine);
      for (const npc of coLocatedNpcs(engine)) {
        npc.relations = { ...(npc.relations ?? {}), 'player-trust': 80 };
        npc.custom = { ...(npc.custom ?? {}), greed: 90 };
        if (me?.zoneId) npc.zoneId = me.zoneId;
      }
    },
  },
  {
    kind: 'investigation',
    because: 'an active black market in the player district — the one kind that already fires',
    hold: () => {},
  },
];

describe('meta: every POR-1 axis can be made GREEN (control 2 — synthetic pass)', () => {
  // One pack, held in each kind's own stated condition. `black-flag-requiem`
  // is the same control pack PVR-1 uses: multiple factions, named NPCs, and a
  // recruitable companion, so no hold has to invent world structure.
  const control = allPacks.find((p) => p.meta.id === 'black-flag-requiem')!;

  for (const { kind, because, hold, profile } of KIND_CONTROLS) {
    it(`\`${kind}\`: fires when the world is held in its own stated condition`, () => {
      const session = playSession(control, { hold, profile: profile ?? 'engaged' });
      expect(
        session.kindsFired.has(kind),
        `the \`${kind}\` axis did not fire even with ${because}.\n` +
          `  Either the probe cannot see this kind, or the evaluator's gate is not what it reads like.\n` +
          `  spawned instead: ${[...session.kindsFired].join(', ') || 'nothing'}\n` +
          `  inputs: ${session.diagnostics}`,
      ).toBe(true);
    });
  }
});

describe('meta: stripping the held condition puts the axis back to red (control 3)', () => {
  const control = allPacks.find((p) => p.meta.id === 'black-flag-requiem')!;

  // `faction-job` is the cleanest single-variable strip in the set: its hold
  // adds exactly one thing (reputation at ally tier) and nothing else in the
  // world supplies it, so removing the hold isolates one variable — the
  // discipline a played-session comparison lives or dies by.
  it('`faction-job` fires with ally-tier reputation held and NOT without it', () => {
    const held = playSession(control, {
      profile: 'engaged',
      hold: KIND_CONTROLS.find((c) => c.kind === 'faction-job')!.hold,
    });
    const stripped = playSession(control, { profile: 'engaged' });

    expect(held.kindsFired.has('faction-job'), 'the held arm did not fire — control 2 is broken').toBe(true);
    expect(
      stripped.kindsFired.has('faction-job'),
      'faction-job fired with NO reputation held, so the axis is not reading the reputation gate\n' +
        `  and control 2 proves nothing. inputs: ${stripped.diagnostics}`,
    ).toBe(false);
  });

  it('`investigation` goes dark when the black market it reads is closed', () => {
    // The one kind that fires on shipped content, killed at its own cause:
    // contraband under 30 closes the black market, and the district rule has
    // nothing else to offer once trade volume is healthy.
    const stripped = playSession(control, {
      profile: 'engaged',
      hold: (engine) => shapeDistricts(engine, { contraband: 25, commerce: 90 }),
    });
    expect(
      stripped.kindsFired.has('investigation'),
      'investigation still fired with every black market closed — the probe is not reading the\n' +
        `  district gate. inputs: ${stripped.diagnostics}`,
    ).toBe(false);
  });
});
