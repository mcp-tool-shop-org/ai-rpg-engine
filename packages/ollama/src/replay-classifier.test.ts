// Tests — replay classifier: deeper replay diff classification

import { describe, it, expect } from 'vitest';
import { classifyReplayChanges, formatClassification } from './replay-classifier.js';
import type { ReplayComparison, ReplayChange } from './parsers.js';

function makeComparison(overrides: Partial<ReplayComparison> = {}): ReplayComparison {
  return {
    improvements: [],
    regressions: [],
    unchanged: [],
    verdict: 'test',
    summary: 'test comparison',
    ...overrides,
  };
}

function makeChange(area: string, description: string): ReplayChange {
  return { area, description };
}

// --- Improvement classification ---

describe('classifyReplayChanges — improvements', () => {
  it('classifies clear improvement as real_improvement', () => {
    const comp = makeComparison({
      improvements: [makeChange('combat', 'Enemy encounters are more varied and challenging')],
    });
    const result = classifyReplayChanges(comp);
    expect(result.classified[0].classification).toBe('real_improvement');
    expect(result.classified[0].confidence).toBe('high');
    expect(result.classified[0].attentionNeeded).toBe(false);
  });

  it('classifies improvement with tradeoff signals as apparent_improvement', () => {
    const comp = makeComparison({
      improvements: [makeChange('pacing', 'Pacing improved but however the atmosphere suffers')],
    });
    const result = classifyReplayChanges(comp);
    expect(result.classified[0].classification).toBe('apparent_improvement');
    expect(result.classified[0].attentionNeeded).toBe(true);
  });

  it('classifies improvement with "at the cost" as apparent_improvement', () => {
    const comp = makeComparison({
      improvements: [makeChange('design', 'Better layout at the cost of exploration depth')],
    });
    const result = classifyReplayChanges(comp);
    expect(result.classified[0].classification).toBe('apparent_improvement');
  });

  it('classifies marginal improvement as noise', () => {
    const comp = makeComparison({
      improvements: [makeChange('scoring', 'Slight improvement in scoring consistency')],
    });
    const result = classifyReplayChanges(comp);
    expect(result.classified[0].classification).toBe('noise');
    expect(result.classified[0].attentionNeeded).toBe(false);
  });

  it('classifies untriggered improvement as never_triggered', () => {
    const comp = makeComparison({
      improvements: [makeChange('quest', 'Quest reward improved, path never triggered in replay')],
    });
    const result = classifyReplayChanges(comp);
    expect(result.classified[0].classification).toBe('never_triggered');
    expect(result.classified[0].attentionNeeded).toBe(true);
  });
});

// --- Regression classification ---

describe('classifyReplayChanges — regressions', () => {
  it('classifies clear regression as real_regression', () => {
    const comp = makeComparison({
      regressions: [makeChange('dialog', 'NPC dialog is now repetitive and flat')],
    });
    const result = classifyReplayChanges(comp);
    expect(result.classified[0].classification).toBe('real_regression');
    expect(result.classified[0].confidence).toBe('high');
    expect(result.classified[0].attentionNeeded).toBe(true);
  });

  it('classifies regression with masked-by-randomness signals as masked_regression', () => {
    const comp = makeComparison({
      regressions: [makeChange('encounter', 'Worse outcomes observed but possibly due to random seed')],
    });
    const result = classifyReplayChanges(comp);
    expect(result.classified[0].classification).toBe('masked_regression');
  });

  it('classifies regression with intermittent signals as masked_regression', () => {
    const comp = makeComparison({
      regressions: [makeChange('ai', 'Intermittent failures in AI responses')],
    });
    const result = classifyReplayChanges(comp);
    expect(result.classified[0].classification).toBe('masked_regression');
  });

  it('classifies marginal regression as noise', () => {
    const comp = makeComparison({
      regressions: [makeChange('movement', 'Negligible slowdown in movement speed')],
    });
    const result = classifyReplayChanges(comp);
    expect(result.classified[0].classification).toBe('noise');
  });

  it('classifies untriggered regression as never_triggered', () => {
    const comp = makeComparison({
      regressions: [makeChange('trap', 'Trap damage reduced but zero occurrences in replay')],
    });
    const result = classifyReplayChanges(comp);
    expect(result.classified[0].classification).toBe('never_triggered');
  });
});

// --- Unchanged classification ---

describe('classifyReplayChanges — unchanged', () => {
  it('classifies unchanged with no signals as inconclusive', () => {
    const comp = makeComparison({
      unchanged: [makeChange('lighting', 'Lighting rendering stayed the same')],
    });
    const result = classifyReplayChanges(comp);
    expect(result.classified[0].classification).toBe('inconclusive');
    expect(result.classified[0].attentionNeeded).toBe(false);
  });

  it('classifies unchanged on untriggered path as never_triggered', () => {
    const comp = makeComparison({
      unchanged: [makeChange('boss', 'Boss fight not tested — path not taken')],
    });
    const result = classifyReplayChanges(comp);
    expect(result.classified[0].classification).toBe('never_triggered');
    expect(result.classified[0].attentionNeeded).toBe(true);
  });

  it('classifies unchanged with noise signals as noise', () => {
    const comp = makeComparison({
      unchanged: [makeChange('score', 'Score within normal expected range')],
    });
    const result = classifyReplayChanges(comp);
    expect(result.classified[0].classification).toBe('noise');
  });
});

// --- Summary and verdict ---

describe('classifyReplayChanges — summary', () => {
  it('returns net_positive when only real improvements', () => {
    const comp = makeComparison({
      improvements: [
        makeChange('combat', 'Better combat balance'),
        makeChange('exploration', 'More interesting discoveries'),
      ],
    });
    const result = classifyReplayChanges(comp);
    expect(result.summary.verdict).toBe('net_positive');
    expect(result.summary.realImprovements).toBe(2);
    expect(result.summary.realRegressions).toBe(0);
  });

  it('returns net_negative when only real regressions', () => {
    const comp = makeComparison({
      regressions: [
        makeChange('dialog', 'Worse dialog quality'),
        makeChange('pacing', 'Much slower pacing'),
      ],
    });
    const result = classifyReplayChanges(comp);
    expect(result.summary.verdict).toBe('net_negative');
    expect(result.summary.realRegressions).toBe(2);
  });

  it('returns mixed when both improvements and regressions', () => {
    const comp = makeComparison({
      improvements: [makeChange('combat', 'Better combat')],
      regressions: [makeChange('dialog', 'Worse dialog')],
    });
    const result = classifyReplayChanges(comp);
    expect(result.summary.verdict).toBe('mixed');
  });

  it('returns insufficient_data when empty', () => {
    const comp = makeComparison();
    const result = classifyReplayChanges(comp);
    expect(result.summary.verdict).toBe('insufficient_data');
  });

  it('returns insufficient_data when only noise', () => {
    const comp = makeComparison({
      improvements: [makeChange('score', 'Slight negligible change')],
    });
    const result = classifyReplayChanges(comp);
    expect(result.summary.verdict).toBe('insufficient_data');
    expect(result.summary.noise).toBe(1);
  });

  it('collects attention items correctly', () => {
    const comp = makeComparison({
      improvements: [makeChange('pacing', 'Better pacing however atmosphere drops')],
      regressions: [makeChange('ai', 'AI got worse — clear regression')],
    });
    const result = classifyReplayChanges(comp);
    expect(result.summary.attentionItems.length).toBeGreaterThanOrEqual(2);
  });
});

// --- formatClassification ---

describe('formatClassification', () => {
  it('formats net_positive result', () => {
    const comp = makeComparison({
      improvements: [makeChange('combat', 'Better combat balance')],
    });
    const result = classifyReplayChanges(comp);
    const formatted = formatClassification(result);
    expect(formatted).toContain('Net Positive');
    expect(formatted).toContain('real improvement');
  });

  it('formats result with attention items', () => {
    const comp = makeComparison({
      regressions: [makeChange('dialog', 'Real regression in dialog quality')],
    });
    const result = classifyReplayChanges(comp);
    const formatted = formatClassification(result);
    expect(formatted).toContain('Net Negative');
    expect(formatted).toContain('need attention');
    expect(formatted).toContain('dialog');
  });

  it('formats mixed result', () => {
    const comp = makeComparison({
      improvements: [makeChange('a', 'Good stuff')],
      regressions: [makeChange('b', 'Bad stuff')],
    });
    const result = classifyReplayChanges(comp);
    const formatted = formatClassification(result);
    expect(formatted).toContain('Mixed');
  });

  it('formats insufficient_data result', () => {
    const result = classifyReplayChanges(makeComparison());
    const formatted = formatClassification(result);
    expect(formatted).toContain('Insufficient Data');
  });
});

// --- Multiple changes of different types ---

describe('classifyReplayChanges — mixed changes', () => {
  it('handles a realistic mix of changes', () => {
    const comp = makeComparison({
      improvements: [
        makeChange('combat', 'Better balance and variety'),
        makeChange('pacing', 'Slight marginal pacing improvement'),
      ],
      regressions: [
        makeChange('dialog', 'Dialog quality dropped'),
        makeChange('encounter', 'Edge case intermittent failures'),
      ],
      unchanged: [
        makeChange('exploration', 'Exploration stayed consistent'),
        makeChange('boss', 'Boss fight — not triggered in replay'),
      ],
    });
    const result = classifyReplayChanges(comp);
    expect(result.classified).toHaveLength(6);
    expect(result.summary.realImprovements).toBe(1);
    expect(result.summary.noise).toBeGreaterThanOrEqual(1);
    expect(result.summary.realRegressions).toBe(1);
    expect(result.summary.maskedRegressions).toBe(1);
    expect(result.summary.neverTriggered).toBe(1);
  });
});
