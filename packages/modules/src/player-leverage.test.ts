import { describe, it, expect } from 'vitest';
import {
  tickLeverage,
  getLeverageState,
  adjustLeverage,
} from './player-leverage.js';

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
