// district-mood contract tests (PM-2 coverage)
//
// This module drives economic reality: leverage costs, rumor spread, trade
// prices, crafting efficiency. Pins the mood derivation, the modifier
// thresholds, the NaN boundary guard (PM-4), and determinism.

import { describe, it, expect } from 'vitest';
import type { DistrictState } from './district-core.js';
import {
  computeDistrictMood,
  computeDistrictModifiers,
  formatDistrictMoodForNarrator,
} from './district-mood.js';

function makeState(overrides?: Partial<DistrictState>): DistrictState {
  return {
    alertPressure: 0,
    rumorDensity: 0,
    intruderLikelihood: 0,
    surveillance: 0,
    stability: 5,
    commerce: 50,
    morale: 50,
    lastUpdateTick: 0,
    eventCount: 0,
    ...overrides,
  };
}

describe('computeDistrictMood', () => {
  it('derives baseline mood from default metrics', () => {
    const mood = computeDistrictMood(makeState(), []);
    // safety = (100-0)*0.5 + 5*5 = 75; prosperity = 50*0.6 + 5*4 = 50;
    // spirit = 50*0.6 + 100*0.2 + 5*2 = 60
    expect(mood.safety).toBe(75);
    expect(mood.prosperity).toBe(50);
    expect(mood.spirit).toBe(60);
    expect(mood.tone).toBe('calm'); // safety > 60 && spirit > 50
  });

  it('clamps derived axes to 0-100', () => {
    const hot = computeDistrictMood(makeState({ stability: 50, commerce: 100, morale: 100 }), []);
    expect(hot.safety).toBe(100);
    expect(hot.prosperity).toBe(100);
    expect(hot.spirit).toBe(100);

    const cold = computeDistrictMood(makeState({ alertPressure: 100, stability: 0, commerce: 0, morale: 0, surveillance: 100 }), []);
    expect(cold.safety).toBe(0);
    expect(cold.prosperity).toBe(0);
    expect(cold.spirit).toBe(0);
    expect(cold.tone).toBe('grim'); // safety < 20 && spirit < 30
    expect(cold.descriptor).toBe('dangerous and despairing');
  });

  it('applies multiplicative tag weights per axis', () => {
    const base = computeDistrictMood(makeState(), []);
    const secure = computeDistrictMood(makeState(), ['secure']); // safety ×1.5, prosperity ×0.7
    expect(secure.safety).toBe(Math.min(100, Math.round(base.safety * 1.5)));
    expect(secure.prosperity).toBe(Math.round(base.prosperity * 0.7));
    expect(secure.spirit).toBe(base.spirit);
  });

  it('ignores unknown tags', () => {
    const base = computeDistrictMood(makeState(), []);
    const tagged = computeDistrictMood(makeState(), ['not-a-real-tag']);
    expect(tagged).toEqual(base);
  });

  it('coerces NaN metrics to safe baselines instead of poisoning the output (PM-4)', () => {
    const mood = computeDistrictMood(makeState({ morale: Number.NaN, commerce: Number.NaN }), []);
    // NaN morale/commerce fall back to their district-core baselines (50/50),
    // so the result is byte-identical to the pristine default mood.
    expect(mood).toEqual(computeDistrictMood(makeState(), []));
    expect(Number.isFinite(mood.safety)).toBe(true);
    expect(Number.isFinite(mood.prosperity)).toBe(true);
    expect(Number.isFinite(mood.spirit)).toBe(true);
  });

  it('never emits NaN even when EVERY metric is malformed (PM-4)', () => {
    const mood = computeDistrictMood(makeState({
      alertPressure: Number.NaN,
      surveillance: Number.POSITIVE_INFINITY,
      stability: Number.NaN,
      commerce: Number.NaN,
      morale: Number.NEGATIVE_INFINITY,
    }), []);
    expect(Number.isFinite(mood.safety)).toBe(true);
    expect(Number.isFinite(mood.prosperity)).toBe(true);
    expect(Number.isFinite(mood.spirit)).toBe(true);

    const mods = computeDistrictModifiers(mood);
    for (const value of Object.values(mods)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('is deterministic — identical inputs produce identical outputs', () => {
    const state = makeState({ alertPressure: 37, stability: 3.5, commerce: 61, morale: 28, surveillance: 44 });
    const a = computeDistrictMood(state, ['underground', 'networked']);
    const b = computeDistrictMood(state, ['underground', 'networked']);
    expect(a).toEqual(b);
  });
});

describe('computeDistrictModifiers thresholds', () => {
  const moodAt = (safety: number, prosperity: number, spirit: number) => ({
    safety, prosperity, spirit, descriptor: '', tone: 'tense' as const,
  });

  it('leverageCostScale: dangerous 1.3 / neutral 1.0 / safe 0.85', () => {
    expect(computeDistrictModifiers(moodAt(29, 50, 50)).leverageCostScale).toBe(1.3);
    expect(computeDistrictModifiers(moodAt(30, 50, 50)).leverageCostScale).toBe(1.0);
    expect(computeDistrictModifiers(moodAt(70, 50, 50)).leverageCostScale).toBe(1.0);
    expect(computeDistrictModifiers(moodAt(71, 50, 50)).leverageCostScale).toBe(0.85);
  });

  it('rumorSpreadScale: anxious 1.5 / neutral 1.0 / content 0.7', () => {
    expect(computeDistrictModifiers(moodAt(50, 50, 29)).rumorSpreadScale).toBe(1.5);
    expect(computeDistrictModifiers(moodAt(50, 50, 50)).rumorSpreadScale).toBe(1.0);
    expect(computeDistrictModifiers(moodAt(50, 50, 71)).rumorSpreadScale).toBe(0.7);
  });

  it('npcCooperationBias scales with prosperity around 50', () => {
    expect(computeDistrictModifiers(moodAt(50, 50, 50)).npcCooperationBias).toBe(0);
    expect(computeDistrictModifiers(moodAt(50, 100, 50)).npcCooperationBias).toBe(10);
    expect(computeDistrictModifiers(moodAt(50, 0, 50)).npcCooperationBias).toBe(-10);
  });

  it('pressureUrgencyBias only in degraded districts (safety < 30 AND spirit < 30)', () => {
    expect(computeDistrictModifiers(moodAt(29, 50, 29)).pressureUrgencyBias).toBe(0.15);
    expect(computeDistrictModifiers(moodAt(29, 50, 30)).pressureUrgencyBias).toBe(0);
    expect(computeDistrictModifiers(moodAt(30, 50, 29)).pressureUrgencyBias).toBe(0);
  });

  it('tradePriceScale bands: 2.0 / 1.3 / 1.0 / 0.8', () => {
    expect(computeDistrictModifiers(moodAt(50, 29, 50)).tradePriceScale).toBe(2.0);
    expect(computeDistrictModifiers(moodAt(50, 49, 50)).tradePriceScale).toBe(1.3);
    expect(computeDistrictModifiers(moodAt(50, 60, 50)).tradePriceScale).toBe(1.0);
    expect(computeDistrictModifiers(moodAt(50, 71, 50)).tradePriceScale).toBe(0.8);
  });

  it('craftingEfficiency: boosted 1.2 / degraded 0.7 / neutral 1.0', () => {
    expect(computeDistrictModifiers(moodAt(51, 61, 50)).craftingEfficiency).toBe(1.2);
    expect(computeDistrictModifiers(moodAt(29, 61, 50)).craftingEfficiency).toBe(0.7);
    expect(computeDistrictModifiers(moodAt(50, 50, 50)).craftingEfficiency).toBe(1.0);
  });
});

describe('formatting', () => {
  it('narrator line is "<name>: <descriptor>"', () => {
    const mood = computeDistrictMood(makeState(), []);
    expect(formatDistrictMoodForNarrator(mood, 'Chapel Grounds'))
      .toBe(`Chapel Grounds: ${mood.descriptor}`);
  });
});
