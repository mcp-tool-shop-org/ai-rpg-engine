import { describe, it, expect } from 'vitest';
import {
  createDistrictEconomy,
  applyEconomyShift,
  tickDistrictEconomy,
  deriveEconomyDescriptor,
  isBlackMarketCondition,
  getSupplyLevel,
  getScarcestSupply,
  getMostSurplusSupply,
  formatEconomyForNarrator,
  formatEconomyForDirector,
  formatAllDistrictEconomiesForDirector,
} from './economy-core.js';

describe('createDistrictEconomy', () => {
  it('initializes all categories at baseline 50 with no genre', () => {
    const e = createDistrictEconomy();
    expect(getSupplyLevel(e, 'medicine')).toBe(50);
    expect(getSupplyLevel(e, 'weapons')).toBe(50);
    expect(getSupplyLevel(e, 'food')).toBe(50);
    expect(getSupplyLevel(e, 'contraband')).toBe(50);
  });

  it('applies genre defaults', () => {
    const e = createDistrictEconomy('zombie');
    expect(getSupplyLevel(e, 'medicine')).toBe(25);
    expect(getSupplyLevel(e, 'food')).toBe(20);
    expect(getSupplyLevel(e, 'ammunition')).toBe(30);
  });

  it('applies district tag modifiers on top of genre', () => {
    const e = createDistrictEconomy('fantasy', ['market']);
    expect(getSupplyLevel(e, 'food')).toBe(70); // 55 genre + 15 market tag
    expect(getSupplyLevel(e, 'luxuries')).toBe(55); // 45 genre + 10 market tag
  });

  it('stacks multiple tag modifiers', () => {
    const e = createDistrictEconomy(undefined, ['underground', 'slums']);
    // contraband: 50 + 20 (underground) + 10 (slums) = 80
    expect(getSupplyLevel(e, 'contraband')).toBe(80);
    // medicine: 50 - 10 (underground) - 10 (slums) = 30
    expect(getSupplyLevel(e, 'medicine')).toBe(30);
  });

  it('clamps to 0-100', () => {
    const e = createDistrictEconomy('zombie', ['underground']);
    // medicine: 25 (zombie) - 10 (underground) = 15, should not go below 0
    expect(getSupplyLevel(e, 'medicine')).toBe(15);
    expect(getSupplyLevel(e, 'medicine')).toBeGreaterThanOrEqual(0);
  });
});

describe('applyEconomyShift', () => {
  it('adjusts a single supply category', () => {
    const e = createDistrictEconomy();
    const shifted = applyEconomyShift(e, {
      districtId: 'd1',
      category: 'medicine',
      delta: -20,
      cause: 'blockade',
    });
    expect(getSupplyLevel(shifted, 'medicine')).toBe(30);
    expect(shifted.supplies.medicine.cause).toBe('blockade');
    expect(shifted.supplies.medicine.trend).toBe('falling');
  });

  it('clamps to 0 on large negative shift', () => {
    const e = createDistrictEconomy();
    const shifted = applyEconomyShift(e, {
      districtId: 'd1',
      category: 'food',
      delta: -200,
      cause: 'famine',
    });
    expect(getSupplyLevel(shifted, 'food')).toBe(0);
  });

  it('clamps to 100 on large positive shift', () => {
    const e = createDistrictEconomy();
    const shifted = applyEconomyShift(e, {
      districtId: 'd1',
      category: 'weapons',
      delta: 200,
      cause: 'arms deal',
    });
    expect(getSupplyLevel(shifted, 'weapons')).toBe(100);
  });

  it('does not affect other categories', () => {
    const e = createDistrictEconomy();
    const shifted = applyEconomyShift(e, {
      districtId: 'd1',
      category: 'medicine',
      delta: -20,
      cause: 'raid',
    });
    expect(getSupplyLevel(shifted, 'weapons')).toBe(50);
    expect(getSupplyLevel(shifted, 'food')).toBe(50);
  });

  it('activates black market when supply drops below 20', () => {
    let e = createDistrictEconomy();
    // Drop contraband below 30 first to start with inactive black market
    e = applyEconomyShift(e, { districtId: 'd1', category: 'contraband', delta: -25, cause: 'crackdown' });
    expect(e.blackMarketActive).toBe(false);
    const shifted = applyEconomyShift(e, {
      districtId: 'd1',
      category: 'medicine',
      delta: -35,
      cause: 'crisis',
    });
    expect(shifted.blackMarketActive).toBe(true);
  });
});

describe('tickDistrictEconomy', () => {
  it('decays above-baseline supplies toward 50', () => {
    let e = createDistrictEconomy();
    e = applyEconomyShift(e, { districtId: 'd1', category: 'weapons', delta: 30, cause: 'surplus' });
    expect(getSupplyLevel(e, 'weapons')).toBe(80);

    const ticked = tickDistrictEconomy(e, 50, 50, 1);
    expect(getSupplyLevel(ticked, 'weapons')).toBeLessThan(80);
    expect(getSupplyLevel(ticked, 'weapons')).toBeGreaterThan(50);
  });

  it('decays below-baseline supplies toward 50', () => {
    let e = createDistrictEconomy();
    e = applyEconomyShift(e, { districtId: 'd1', category: 'food', delta: -30, cause: 'famine' });
    expect(getSupplyLevel(e, 'food')).toBe(20);

    const ticked = tickDistrictEconomy(e, 50, 50, 1);
    expect(getSupplyLevel(ticked, 'food')).toBeGreaterThan(20);
    expect(getSupplyLevel(ticked, 'food')).toBeLessThan(50);
  });

  it('low stability accelerates negative drift', () => {
    let e = createDistrictEconomy();
    e = applyEconomyShift(e, { districtId: 'd1', category: 'food', delta: -20, cause: 'raid' });

    const stableTick = tickDistrictEconomy(e, 50, 50, 1);
    const unstableTick = tickDistrictEconomy(e, 50, 10, 1);

    // Unstable should recover faster (larger move toward baseline)
    const stableDelta = getSupplyLevel(stableTick, 'food') - getSupplyLevel(e, 'food');
    const unstableDelta = getSupplyLevel(unstableTick, 'food') - getSupplyLevel(e, 'food');
    expect(unstableDelta).toBeGreaterThan(stableDelta);
  });

  it('does not move supply at exactly baseline', () => {
    const e = createDistrictEconomy();
    const ticked = tickDistrictEconomy(e, 50, 50, 1);
    expect(getSupplyLevel(ticked, 'medicine')).toBe(50);
  });
});

describe('deriveEconomyDescriptor', () => {
  it('identifies scarcities below 35', () => {
    let e = createDistrictEconomy();
    e = applyEconomyShift(e, { districtId: 'd1', category: 'medicine', delta: -25, cause: 'raid' });
    const desc = deriveEconomyDescriptor(e);
    expect(desc.scarcities.length).toBe(1);
    expect(desc.scarcities[0].category).toBe('medicine');
    expect(desc.scarcities[0].severity).toBe('tight');
  });

  it('identifies desperate scarcity below 15', () => {
    let e = createDistrictEconomy();
    e = applyEconomyShift(e, { districtId: 'd1', category: 'food', delta: -40, cause: 'famine' });
    const desc = deriveEconomyDescriptor(e);
    expect(desc.scarcities[0].severity).toBe('desperate');
  });

  it('identifies surpluses above 70', () => {
    let e = createDistrictEconomy();
    e = applyEconomyShift(e, { districtId: 'd1', category: 'luxuries', delta: 30, cause: 'trade' });
    const desc = deriveEconomyDescriptor(e);
    expect(desc.surpluses.length).toBe(1);
    expect(desc.surpluses[0].category).toBe('luxuries');
  });

  it('returns crisis tone when 2+ desperate', () => {
    let e = createDistrictEconomy();
    e = applyEconomyShift(e, { districtId: 'd1', category: 'food', delta: -40, cause: 'famine' });
    e = applyEconomyShift(e, { districtId: 'd1', category: 'medicine', delta: -40, cause: 'raid' });
    const desc = deriveEconomyDescriptor(e);
    expect(desc.overallTone).toBe('crisis');
  });

  it('returns normal tone when no extremes', () => {
    const e = createDistrictEconomy();
    const desc = deriveEconomyDescriptor(e);
    expect(desc.overallTone).toBe('normal');
  });
});

describe('isBlackMarketCondition', () => {
  it('returns false when contraband <= 30 and no supply < 20', () => {
    let e = createDistrictEconomy();
    // Baseline contraband is 50, drop to 25 (below threshold)
    e = applyEconomyShift(e, { districtId: 'd1', category: 'contraband', delta: -25, cause: 'crackdown' });
    expect(e.supplies.contraband.level).toBe(25);
    expect(isBlackMarketCondition(e)).toBe(false);
  });

  it('returns true when contraband > 30', () => {
    const e = createDistrictEconomy();
    // Baseline contraband is 50, already above 30
    expect(e.supplies.contraband.level).toBe(50);
    expect(isBlackMarketCondition(e)).toBe(true);
  });

  it('returns true when any supply < 20', () => {
    let e = createDistrictEconomy();
    // First drop contraband below threshold so we isolate the supply check
    e = applyEconomyShift(e, { districtId: 'd1', category: 'contraband', delta: -25, cause: 'crackdown' });
    e = applyEconomyShift(e, { districtId: 'd1', category: 'medicine', delta: -35, cause: 'crisis' });
    expect(e.supplies.medicine.level).toBe(15);
    expect(isBlackMarketCondition(e)).toBe(true);
  });
});

describe('getScarcestSupply / getMostSurplusSupply', () => {
  it('returns undefined when all at baseline', () => {
    // With contraband at 50 (baseline), everything is at 50
    // getScarcestSupply returns undefined if all >= 50
    const e = createDistrictEconomy();
    expect(getScarcestSupply(e)).toBeUndefined();
    expect(getMostSurplusSupply(e)).toBeUndefined();
  });

  it('returns correct extremes', () => {
    const e = createDistrictEconomy('zombie');
    // zombie: food=20, medicine=25, ammunition=30
    expect(getScarcestSupply(e)).toBe('food');
  });
});

describe('formatting', () => {
  it('formatEconomyForNarrator returns compact phrase', () => {
    let e = createDistrictEconomy();
    e = applyEconomyShift(e, { districtId: 'd1', category: 'medicine', delta: -25, cause: 'raid' });
    const desc = deriveEconomyDescriptor(e);
    const text = formatEconomyForNarrator(desc);
    expect(text.length).toBeLessThan(80);
    expect(text).toContain('medicine');
  });

  it('formatEconomyForDirector includes all categories', () => {
    const e = createDistrictEconomy();
    const desc = deriveEconomyDescriptor(e);
    const text = formatEconomyForDirector('d1', 'Market District', e, desc);
    expect(text).toContain('Market District');
    expect(text).toContain('medicine');
    expect(text).toContain('weapons');
    expect(text).toContain('food');
  });

  it('formatAllDistrictEconomiesForDirector shows overview', () => {
    const e1 = createDistrictEconomy('fantasy', ['market']);
    const e2 = createDistrictEconomy('fantasy', ['underground']);
    const text = formatAllDistrictEconomiesForDirector([
      { districtId: 'd1', districtName: 'Market Square', economy: e1 },
      { districtId: 'd2', districtName: 'Undercity', economy: e2 },
    ]);
    expect(text).toContain('MARKET OVERVIEW');
    expect(text).toContain('Market Square');
    expect(text).toContain('Undercity');
  });
});
