// move-advisor contract tests (PM-2 coverage)
//
// Player-facing recommendation engine. Pins the top3 contract, the situation
// derivation thresholds, the NaN boundary guard (PM-4: a malformed
// LeverageState must never surface a NaN-scored move), and ordering
// determinism (PM-6: total stable tie-break).

import { describe, it, expect } from 'vitest';
import type { LeverageState } from './player-leverage.js';
import type { WorldPressure } from './pressure-system.js';
import type { AdvisorInputs } from './move-advisor.js';
import { recommendMoves, scoreAction, deriveSituation } from './move-advisor.js';

function makeLeverage(overrides?: Partial<LeverageState>): LeverageState {
  return {
    favor: 50, debt: 50, blackmail: 50, influence: 50, heat: 50, legitimacy: 50,
    ...overrides,
  };
}

function makePressure(overrides?: Partial<WorldPressure>): WorldPressure {
  return {
    id: 'p1',
    kind: 'bounty-issued',
    sourceFactionId: 'watch',
    description: 'a bounty on your head',
    triggeredBy: 'test',
    urgency: 0.5,
    visibility: 'known',
    turnsRemaining: 5,
    potentialOutcomes: [],
    tags: [],
    createdAtTick: 0,
    ...overrides,
  };
}

function makeInputs(overrides?: Partial<AdvisorInputs>): AdvisorInputs {
  return {
    leverageState: makeLeverage(),
    activePressures: [],
    factionViews: [],
    districtViews: [],
    playerReputation: [],
    currentTick: 10,
    cooldowns: {},
    playerHeat: 0,
    ...overrides,
  };
}

describe('recommendMoves contract', () => {
  it('returns at most 3 moves, each feasible, deduplicated by sub-action', () => {
    const rec = recommendMoves(makeInputs());
    expect(rec.top3.length).toBeLessThanOrEqual(3);
    const keys = rec.top3.map((m) => `${m.category}.${m.subAction}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const move of rec.top3) {
      expect(move.feasibility).toBeGreaterThan(0);
      expect(Number.isFinite(move.score)).toBe(true);
      expect(move.reason.length).toBeGreaterThan(0);
    }
  });

  it('skips unaffordable moves (feasibility 0 never reaches top3)', () => {
    // Broke player: every costed action is unaffordable → no recommendations.
    const rec = recommendMoves(makeInputs({
      leverageState: makeLeverage({ favor: 0, debt: 0, blackmail: 0, influence: 0, heat: 0, legitimacy: 0 }),
    }));
    // cash-milestone is free ({} costs) so it may appear; everything else cannot.
    for (const move of rec.top3) {
      expect(move.subAction).toBe('cash-milestone');
    }
  });

  it('respects cooldown gates', () => {
    const base = makeInputs();
    const withoutCd = recommendMoves(base);
    const cooldowns: Record<string, number> = {};
    for (const m of withoutCd.top3) cooldowns[`${m.category}.${m.subAction}`] = 10; // just used
    const withCd = recommendMoves(makeInputs({ cooldowns }));
    const cooled = new Set(Object.keys(cooldowns));
    for (const m of withCd.top3) {
      expect(cooled.has(`${m.category}.${m.subAction}`)).toBe(false);
    }
  });

  it('a missing leverage currency yields feasibility 0 — no NaN score survives (PM-4)', () => {
    // Malformed state: 'favor' key deleted entirely (product-layer bug shape).
    const broken = makeLeverage();
    delete (broken as Partial<LeverageState>).favor;

    // Direct unit pin: bribe costs favor 15 → missing key must be 0-feasible,
    // not NaN (undefined / 15 = NaN previously survived the === 0 skip).
    const move = scoreAction('social', 'bribe', undefined, makeInputs({ leverageState: broken }));
    expect(move.feasibility).toBe(0);
    expect(Number.isFinite(move.score)).toBe(true);

    // End-to-end: nothing NaN-scored or favor-costed reaches top3.
    const rec = recommendMoves(makeInputs({ leverageState: broken }));
    for (const m of rec.top3) {
      expect(Number.isFinite(m.score)).toBe(true);
      expect(Number.isNaN(m.feasibility)).toBe(false);
    }
  });

  it('a NaN currency balance is treated as 0, not propagated (PM-4)', () => {
    const rec = recommendMoves(makeInputs({
      leverageState: makeLeverage({ influence: Number.NaN }),
    }));
    for (const m of rec.top3) {
      expect(Number.isFinite(m.score)).toBe(true);
    }
    // influence-costed actions must be infeasible with a NaN balance.
    const seed = scoreAction('rumor', 'seed', undefined, makeInputs({
      leverageState: makeLeverage({ influence: Number.NaN }),
    }));
    expect(seed.feasibility).toBe(0);
  });

  it('is deterministic — two identical calls produce identical rankings (PM-6)', () => {
    const inputs = makeInputs({
      activePressures: [makePressure()],
      factionViews: [
        { factionId: 'watch', playerReputation: -10, stance: 'hostile', alertLevel: 60, cohesion: 0.5, recentActions: [], vulnerability: 'low cohesion — internal fractures' },
        { factionId: 'guild', playerReputation: 20, stance: 'neutral', alertLevel: 10, cohesion: 0.9, recentActions: [], vulnerability: undefined },
      ],
    });
    const a = recommendMoves(inputs);
    const b = recommendMoves(inputs);
    expect(a).toEqual(b);
  });

  it('breaks score ties by action key then target faction — stable under input reordering (PM-6)', () => {
    // With NO pressures, NO factions, and a uniform leverage state, many moves
    // tie on score. The tie-break must produce one canonical order.
    const rec1 = recommendMoves(makeInputs());
    const rec2 = recommendMoves(makeInputs());
    expect(rec1.top3.map((m) => `${m.category}.${m.subAction}`))
      .toEqual(rec2.top3.map((m) => `${m.category}.${m.subAction}`));

    // Reordering the (tied) faction views must not change which target wins.
    const factions = [
      { factionId: 'a-guild', playerReputation: 0, stance: 'hostile', alertLevel: 0, cohesion: 0.8, recentActions: [], vulnerability: undefined },
      { factionId: 'b-watch', playerReputation: 0, stance: 'hostile', alertLevel: 0, cohesion: 0.8, recentActions: [], vulnerability: undefined },
    ];
    const fwd = recommendMoves(makeInputs({ factionViews: factions }));
    const rev = recommendMoves(makeInputs({ factionViews: [...factions].reverse() }));
    expect(fwd.top3).toEqual(rev.top3);
  });
});

describe('deriveSituation thresholds', () => {
  it('crisis at pressure urgency ≥ 0.7 or heat ≥ 70', () => {
    expect(deriveSituation(makeInputs({ activePressures: [makePressure({ urgency: 0.7 })] }))).toBe('crisis');
    expect(deriveSituation(makeInputs({ playerHeat: 70 }))).toBe('crisis');
  });

  it('pressured at urgency ≥ 0.4', () => {
    expect(deriveSituation(makeInputs({ activePressures: [makePressure({ urgency: 0.4 })] }))).toBe('pressured');
  });

  it('opportunity when a faction shows a vulnerability', () => {
    expect(deriveSituation(makeInputs({
      factionViews: [{ factionId: 'watch', playerReputation: 0, stance: 'neutral', alertLevel: 0, cohesion: 0.3, recentActions: [], vulnerability: 'low cohesion — internal fractures' }],
    }))).toBe('opportunity');
  });

  it('safe otherwise', () => {
    expect(deriveSituation(makeInputs())).toBe('safe');
  });
});
