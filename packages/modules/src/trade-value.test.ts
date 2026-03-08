import { describe, it, expect } from 'vitest';
import {
  computeScarcityMultiplier,
  computeFactionAttitudeMultiplier,
  computeProvenanceMultiplier,
  computeContrabandFactor,
  computePressureModifier,
  computeItemValue,
  deriveTradeAdvice,
  formatValueBreakdownForDirector,
  formatTradeAdviceForNarrator,
} from './trade-value.js';
import { createDistrictEconomy, applyEconomyShift } from './economy-core.js';

describe('computeScarcityMultiplier', () => {
  it('returns 3.0 for very scarce (<20)', () => {
    expect(computeScarcityMultiplier(15)).toBe(3.0);
  });

  it('returns 1.0 for baseline (40-60)', () => {
    expect(computeScarcityMultiplier(50)).toBe(1.0);
  });

  it('returns 0.5 for heavily surplus (>80)', () => {
    expect(computeScarcityMultiplier(90)).toBe(0.5);
  });
});

describe('computeFactionAttitudeMultiplier', () => {
  it('hostile factions gouge', () => {
    expect(computeFactionAttitudeMultiplier(-60)).toBe(1.5);
  });

  it('neutral factions are fair', () => {
    expect(computeFactionAttitudeMultiplier(0)).toBe(1.0);
  });

  it('friendly factions give discount', () => {
    expect(computeFactionAttitudeMultiplier(70)).toBe(0.85);
  });
});

describe('computeProvenanceMultiplier', () => {
  it('returns 1.0 with no provenance', () => {
    expect(computeProvenanceMultiplier()).toBe(1.0);
  });

  it('relics command premium', () => {
    expect(computeProvenanceMultiplier({ isStolen: false, isRelic: true, notoriety: 30 })).toBe(1.5);
  });

  it('stolen+hot adds risk premium', () => {
    const mult = computeProvenanceMultiplier({ isStolen: true, isRelic: false, notoriety: 60 }, 50);
    expect(mult).toBeGreaterThan(1.3);
  });
});

describe('computeContrabandFactor', () => {
  it('non-contraband returns 1.0', () => {
    expect(computeContrabandFactor(false, false, 0)).toBe(1.0);
  });

  it('contraband without black market is untradeable', () => {
    expect(computeContrabandFactor(true, false, 0)).toBe(0.0);
  });

  it('contraband with black market is tradeable', () => {
    expect(computeContrabandFactor(true, true, 0)).toBe(1.0);
  });
});

describe('computePressureModifier', () => {
  it('returns 1.0 with no pressures', () => {
    expect(computePressureModifier([], 'medicine')).toBe(1.0);
  });

  it('infection suspicion inflates medicine', () => {
    expect(computePressureModifier(['infection-suspicion'], 'medicine')).toBe(1.4);
  });

  it('does not affect unrelated categories', () => {
    expect(computePressureModifier(['infection-suspicion'], 'weapons')).toBe(1.0);
  });
});

describe('computeItemValue', () => {
  it('passes through at baseline (normal supply, neutral faction)', () => {
    const e = createDistrictEconomy();
    const result = computeItemValue(100, 'weapons', {
      districtEconomy: e,
      playerReputation: 0,
      playerHeat: 0,
      isContraband: false,
      activePressureKinds: [],
    });
    expect(result.finalValue).toBe(100);
    expect(result.tradeAdvice).toBe('hold');
  });

  it('scarcity doubles value', () => {
    let e = createDistrictEconomy();
    e = applyEconomyShift(e, { districtId: 'd1', category: 'medicine', delta: -30, cause: 'plague' });
    const result = computeItemValue(100, 'medicine', {
      districtEconomy: e,
      playerReputation: 0,
      playerHeat: 0,
      isContraband: false,
      activePressureKinds: [],
    });
    expect(result.finalValue).toBeGreaterThan(150);
    expect(result.tradeAdvice).toBe('sell-here');
  });

  it('hostile faction gouges prices', () => {
    const e = createDistrictEconomy();
    const result = computeItemValue(100, 'food', {
      districtEconomy: e,
      playerReputation: -70,
      playerHeat: 0,
      isContraband: false,
      activePressureKinds: [],
    });
    expect(result.finalValue).toBeGreaterThan(100);
    expect(result.modifiers.factionAttitude).toBe(1.5);
  });

  it('contraband without market is untradeable', () => {
    let e = createDistrictEconomy();
    // Drop contraband below 30 to disable black market
    e = applyEconomyShift(e, { districtId: 'd1', category: 'contraband', delta: -30, cause: 'crackdown' });
    // Also ensure no supply < 20
    const result = computeItemValue(100, 'contraband', {
      districtEconomy: e,
      playerReputation: 0,
      playerHeat: 0,
      isContraband: true,
      activePressureKinds: [],
    });
    expect(result.finalValue).toBe(0);
    expect(result.tradeAdvice).toBe('untradeable');
  });

  it('stolen+hot item gives risky advice', () => {
    const e = createDistrictEconomy();
    const result = computeItemValue(100, 'luxuries', {
      districtEconomy: e,
      playerReputation: 0,
      playerHeat: 50,
      isContraband: false,
      itemProvenance: { isStolen: true, isRelic: true, notoriety: 70 },
      activePressureKinds: [],
    });
    expect(result.tradeAdvice).toBe('risky');
    expect(result.modifiers.provenanceNotoriety).toBeGreaterThan(1.5);
  });

  it('pressure inflates affected categories', () => {
    const e = createDistrictEconomy();
    const result = computeItemValue(100, 'medicine', {
      districtEconomy: e,
      playerReputation: 0,
      playerHeat: 0,
      isContraband: false,
      activePressureKinds: ['infection-suspicion'],
    });
    expect(result.modifiers.pressureModifier).toBe(1.4);
    expect(result.finalValue).toBeGreaterThan(100);
  });
});

describe('formatting', () => {
  it('formatValueBreakdownForDirector includes all lines', () => {
    const e = createDistrictEconomy();
    const result = computeItemValue(100, 'weapons', {
      districtEconomy: e,
      playerReputation: 0,
      playerHeat: 0,
      isContraband: false,
      activePressureKinds: [],
    });
    const text = formatValueBreakdownForDirector(result);
    expect(text).toContain('Value:');
    expect(text).toContain('Scarcity:');
    expect(text).toContain('Advice:');
  });

  it('formatTradeAdviceForNarrator is concise', () => {
    const e = createDistrictEconomy();
    const result = computeItemValue(100, 'weapons', {
      districtEconomy: e,
      playerReputation: 0,
      playerHeat: 0,
      isContraband: false,
      activePressureKinds: [],
    });
    const text = formatTradeAdviceForNarrator(result);
    expect(text.length).toBeLessThan(50);
  });
});
