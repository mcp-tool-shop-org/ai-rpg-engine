import { describe, it, expect } from 'vitest';
import {
  tickLeverage,
  getLeverageState,
  adjustLeverage,
  computeLeverageGains,
} from './player-leverage.js';
import type { LeverageHints } from './player-leverage.js';

describe('tickLeverage influence accumulation (MW-5)', () => {
  const reps = [{ factionId: 'guild', value: 40 }]; // rep baseline = floor(40/2) = 20

  it('grants reputation-derived influence on first tick', () => {
    const after = tickLeverage({}, reps);
    expect(getLeverageState(after).influence).toBe(20);
  });

  it('does not restore influence that was spent through play', () => {
    // First tick establishes baseline 20.
    let custom = tickLeverage({}, reps);
    expect(getLeverageState(custom).influence).toBe(20);

    // Player spends 10 influence on a leverage sub-action (e.g. seed rumor).
    custom = adjustLeverage(custom, 'influence', -10);
    expect(getLeverageState(custom).influence).toBe(10);

    // Next tick with UNCHANGED reputation must NOT clobber influence back to 20.
    custom = tickLeverage(custom, reps);
    expect(getLeverageState(custom).influence).toBe(10);
  });

  it('does not discard influence earned/gained beyond the reputation baseline', () => {
    let custom = tickLeverage({}, reps); // baseline 20
    custom = adjustLeverage(custom, 'influence', 15); // player gained extra influence → 35
    expect(getLeverageState(custom).influence).toBe(35);

    custom = tickLeverage(custom, reps); // unchanged rep → keep 35
    expect(getLeverageState(custom).influence).toBe(35);
  });

  it('applies only the delta when reputation rises', () => {
    let custom = tickLeverage({}, reps); // baseline 20
    custom = adjustLeverage(custom, 'influence', -10); // spent → 10
    // Reputation rises: new baseline = floor(60/2) = 30, delta = +10
    custom = tickLeverage(custom, [{ factionId: 'guild', value: 60 }]);
    // 10 (current) + 10 (rep delta) = 20, NOT clobbered to 30
    expect(getLeverageState(custom).influence).toBe(20);
  });

  it('applies only the delta when reputation falls', () => {
    let custom = tickLeverage({}, [{ factionId: 'guild', value: 60 }]); // baseline 30
    custom = adjustLeverage(custom, 'influence', 10); // earned → 40
    // Reputation falls: new baseline = floor(40/2) = 20, delta = -10
    custom = tickLeverage(custom, reps);
    // 40 (current) - 10 (rep delta) = 30
    expect(getLeverageState(custom).influence).toBe(30);
  });

  it('still decays heat each tick', () => {
    const custom = tickLeverage({ 'leverage.heat': 10 }, reps);
    expect(getLeverageState(custom).heat).toBe(7); // 10 - HEAT_DECAY_PER_TURN(3)
  });

  it('clamps influence at 0 when reputation collapse exceeds current', () => {
    let custom = tickLeverage({}, [{ factionId: 'guild', value: 60 }]); // baseline 30, influence 30
    // Reputation collapses to 0: new baseline 0, delta -30 → influence clamps at 0
    custom = tickLeverage(custom, [{ factionId: 'guild', value: 0 }]);
    expect(getLeverageState(custom).influence).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// canAfford boundary guard (PM-4 family)
// ---------------------------------------------------------------------------

describe('canAfford malformed-state guard', () => {
  it('treats a MISSING currency balance as 0 — cannot afford', async () => {
    const { canAfford } = await import('./player-leverage.js');
    const broken = { debt: 50, blackmail: 50, influence: 50, heat: 50, legitimacy: 50 };
    // 'favor' key absent: `undefined < 15` is false, which used to slip
    // through the gate and later poison surplus ratios with NaN.
    expect(canAfford(broken as never, { favor: 15 })).toBe(false);
  });

  it('treats a NaN balance as 0 — cannot afford', async () => {
    const { canAfford } = await import('./player-leverage.js');
    const state = { favor: Number.NaN, debt: 50, blackmail: 50, influence: 50, heat: 50, legitimacy: 50 };
    expect(canAfford(state, { favor: 1 })).toBe(false);
    // Healthy balances still afford.
    expect(canAfford(state, { debt: 50 })).toBe(true);
    expect(canAfford(state, { debt: 51 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeLeverageGains: blackmail accumulation (F-da82fb75)
// ---------------------------------------------------------------------------
//
// The first two blackmail triggers (xpGained ≥ 15, reputationDelta.delta <
// -10) used direct assignment (`gains.blackmail = 5` / `= 3`); the third
// (milestone with exploration/landmark tags) correctly ACCUMULATES
// (`gains.blackmail = (gains.blackmail ?? 0) + 5`). When both of the first
// two fire in the same call — realistic: defeating a notable enemy tanks
// reputation with their faction in the same turn — the second assignment
// silently overwrote the first instead of the two stacking.

describe('computeLeverageGains: blackmail accumulation', () => {
  it('a single trigger alone produces the documented amount', () => {
    expect(computeLeverageGains({ xpGained: 15 }).blackmail).toBe(5);
    expect(computeLeverageGains({
      xpGained: 0, reputationDelta: { factionId: 'guild', delta: -15 },
    }).blackmail).toBe(3);
  });

  it('xpGained and a large negative reputationDelta in the SAME call stack instead of the second overwriting the first', () => {
    const hints: LeverageHints = {
      xpGained: 15, // triggers +5 blackmail
      reputationDelta: { factionId: 'guild', delta: -15 }, // triggers +3 blackmail
    };
    // 5 + 3 = 8, not 3 (the buggy direct assignment discarding the +5).
    expect(computeLeverageGains(hints).blackmail).toBe(8);
  });

  it('all three blackmail triggers stack when they all fire together', () => {
    const hints: LeverageHints = {
      xpGained: 15,
      reputationDelta: { factionId: 'guild', delta: -15 },
      milestoneTriggered: { label: 'Found the ruins', tags: ['exploration'] },
    };
    // 5 (xp) + 3 (rep) + 5 (milestone) = 13.
    expect(computeLeverageGains(hints).blackmail).toBe(13);
  });
});
