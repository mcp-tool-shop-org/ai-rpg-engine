// Replay classifier — classifies changes between replay comparisons.
// Goes beyond raw "improvement/regression" to identify:
//   - Real improvement (verified behavioral gain)
//   - Apparent improvement with hidden tradeoff
//   - Regression masked by randomness
//   - Unchanged because the relevant path never triggered
// Uses deterministic heuristics on structured replay data. No LLM.

import type { ReplayChange, ReplayComparison } from './parsers.js';

// --- Types ---

export type ChangeClassification =
  | 'real_improvement'           // Verified positive change
  | 'apparent_improvement'       // Looks good but hides a tradeoff
  | 'real_regression'            // Verified negative change
  | 'masked_regression'          // Looks neutral but hides deterioration
  | 'never_triggered'            // Path didn't fire in this replay
  | 'noise'                      // Insignificant variation
  | 'inconclusive';              // Not enough data to classify

export type ClassifiedChange = {
  /** Original change data. */
  change: ReplayChange;
  /** The category from improvement/regression/unchanged. */
  originalCategory: 'improvement' | 'regression' | 'unchanged';
  /** Our deeper classification. */
  classification: ChangeClassification;
  /** Why we classified it this way. */
  reason: string;
  /** Confidence in this classification. */
  confidence: 'high' | 'medium' | 'low';
  /** Risk level: does this need attention? */
  attentionNeeded: boolean;
};

export type ClassificationResult = {
  classified: ClassifiedChange[];
  /** High-level summary. */
  summary: ClassificationSummary;
};

export type ClassificationSummary = {
  realImprovements: number;
  apparentImprovements: number;
  realRegressions: number;
  maskedRegressions: number;
  neverTriggered: number;
  noise: number;
  inconclusive: number;
  /** Overall verdict after deeper inspection. */
  verdict: 'net_positive' | 'net_negative' | 'mixed' | 'insufficient_data';
  /** Items that need human attention. */
  attentionItems: ClassifiedChange[];
};

// --- Heuristic patterns ---

/** Keywords that suggest a tradeoff is hiding in an "improvement." */
const TRADEOFF_SIGNALS = [
  /\b(but|however|although|despite|trade.?off|at the cost|sacrifice|lose|lost|fewer|less|reduced)\b/i,
  /\b(only when|not always|sometimes|occasionally|inconsistent)\b/i,
];

/** Keywords that suggest randomness/noise rather than real change. */
const NOISE_SIGNALS = [
  /\b(marginal|slight|minor|negligible|tiny|barely|random|variance|fluctuation)\b/i,
  /\b(within normal|expected range|no significant)\b/i,
];

/** Keywords that suggest a path was never tested. */
const UNTRIGGERED_SIGNALS = [
  /\b(never triggered|not triggered|didn't fire|not reached|unreachable|no data|not tested|untested|no events?|empty)\b/i,
  /\b(zero occurrences?|0 events?|path not taken)\b/i,
];

/** Keywords in regressions that suggest masking by randomness. */
const MASKED_SIGNALS = [
  /\b(intermittent|sporadic|rare|edge case|corner case|only once|single occurrence)\b/i,
  /\b(luck|random seed|variance|stochastic)\b/i,
];

// --- Classification engine ---

export function classifyReplayChanges(comparison: ReplayComparison): ClassificationResult {
  const classified: ClassifiedChange[] = [];

  // Classify improvements
  for (const change of comparison.improvements) {
    classified.push(classifyImprovement(change));
  }

  // Classify regressions
  for (const change of comparison.regressions) {
    classified.push(classifyRegression(change));
  }

  // Classify unchanged
  for (const change of comparison.unchanged) {
    classified.push(classifyUnchanged(change));
  }

  const summary = buildSummary(classified);
  return { classified, summary };
}

function classifyImprovement(change: ReplayChange): ClassifiedChange {
  const desc = change.description;

  // Check for tradeoff signals
  if (TRADEOFF_SIGNALS.some(p => p.test(desc))) {
    return {
      change,
      originalCategory: 'improvement',
      classification: 'apparent_improvement',
      reason: 'Description mentions tradeoffs or conditional success',
      confidence: 'medium',
      attentionNeeded: true,
    };
  }

  // Check for noise signals
  if (NOISE_SIGNALS.some(p => p.test(desc))) {
    return {
      change,
      originalCategory: 'improvement',
      classification: 'noise',
      reason: 'Change appears to be within normal variance',
      confidence: 'medium',
      attentionNeeded: false,
    };
  }

  // Check for untriggered path
  if (UNTRIGGERED_SIGNALS.some(p => p.test(desc))) {
    return {
      change,
      originalCategory: 'improvement',
      classification: 'never_triggered',
      reason: 'Improvement may be on a path that was never exercised',
      confidence: 'low',
      attentionNeeded: true,
    };
  }

  // Default: real improvement
  return {
    change,
    originalCategory: 'improvement',
    classification: 'real_improvement',
    reason: 'Clear improvement with no detected tradeoff signals',
    confidence: 'high',
    attentionNeeded: false,
  };
}

function classifyRegression(change: ReplayChange): ClassifiedChange {
  const desc = change.description;

  // Check if it's masked by randomness
  if (MASKED_SIGNALS.some(p => p.test(desc))) {
    return {
      change,
      originalCategory: 'regression',
      classification: 'masked_regression',
      reason: 'Regression may be obscured by randomness or low sample size',
      confidence: 'low',
      attentionNeeded: true,
    };
  }

  // Check for noise
  if (NOISE_SIGNALS.some(p => p.test(desc))) {
    return {
      change,
      originalCategory: 'regression',
      classification: 'noise',
      reason: 'Regression appears to be within normal variance',
      confidence: 'medium',
      attentionNeeded: false,
    };
  }

  // Check for untriggered path
  if (UNTRIGGERED_SIGNALS.some(p => p.test(desc))) {
    return {
      change,
      originalCategory: 'regression',
      classification: 'never_triggered',
      reason: 'Regression on a path that may not have been exercised',
      confidence: 'low',
      attentionNeeded: true,
    };
  }

  // Default: real regression
  return {
    change,
    originalCategory: 'regression',
    classification: 'real_regression',
    reason: 'Clear regression with no mitigating signals',
    confidence: 'high',
    attentionNeeded: true,
  };
}

function classifyUnchanged(change: ReplayChange): ClassifiedChange {
  const desc = change.description;

  // Check if unchanged because path never triggered
  if (UNTRIGGERED_SIGNALS.some(p => p.test(desc))) {
    return {
      change,
      originalCategory: 'unchanged',
      classification: 'never_triggered',
      reason: 'Unchanged because the relevant path was never exercised',
      confidence: 'medium',
      attentionNeeded: true,
    };
  }

  // Check for noise
  if (NOISE_SIGNALS.some(p => p.test(desc))) {
    return {
      change,
      originalCategory: 'unchanged',
      classification: 'noise',
      reason: 'No meaningful variation detected — within expected range',
      confidence: 'high',
      attentionNeeded: false,
    };
  }

  // Default: inconclusive
  return {
    change,
    originalCategory: 'unchanged',
    classification: 'inconclusive',
    reason: 'No strong signal in either direction',
    confidence: 'low',
    attentionNeeded: false,
  };
}

// --- Summary ---

function buildSummary(classified: ClassifiedChange[]): ClassificationSummary {
  const counts = {
    realImprovements: 0,
    apparentImprovements: 0,
    realRegressions: 0,
    maskedRegressions: 0,
    neverTriggered: 0,
    noise: 0,
    inconclusive: 0,
  };

  for (const c of classified) {
    switch (c.classification) {
      case 'real_improvement': counts.realImprovements++; break;
      case 'apparent_improvement': counts.apparentImprovements++; break;
      case 'real_regression': counts.realRegressions++; break;
      case 'masked_regression': counts.maskedRegressions++; break;
      case 'never_triggered': counts.neverTriggered++; break;
      case 'noise': counts.noise++; break;
      case 'inconclusive': counts.inconclusive++; break;
    }
  }

  const attentionItems = classified.filter(c => c.attentionNeeded);

  let verdict: ClassificationSummary['verdict'];
  if (classified.length === 0) {
    verdict = 'insufficient_data';
  } else if (counts.realRegressions === 0 && counts.maskedRegressions === 0 && counts.realImprovements > 0) {
    verdict = 'net_positive';
  } else if (counts.realImprovements === 0 && (counts.realRegressions > 0 || counts.maskedRegressions > 0)) {
    verdict = 'net_negative';
  } else if (counts.realImprovements === 0 && counts.realRegressions === 0) {
    verdict = 'insufficient_data';
  } else {
    verdict = 'mixed';
  }

  return { ...counts, verdict, attentionItems };
}

// --- Format for presentation ---

export function formatClassification(result: ClassificationResult): string {
  const { summary } = result;
  const lines: string[] = [];

  const verdictLabels: Record<string, string> = {
    net_positive: 'Net Positive — real improvements, no regressions',
    net_negative: 'Net Negative — regressions detected',
    mixed: 'Mixed — improvements and regressions coexist',
    insufficient_data: 'Insufficient Data — cannot make a confident assessment',
  };

  lines.push(`**Replay Classification: ${verdictLabels[summary.verdict]}**`);
  lines.push('');
  lines.push('Breakdown:');
  if (summary.realImprovements > 0) lines.push(`  ✓ ${summary.realImprovements} real improvement(s)`);
  if (summary.apparentImprovements > 0) lines.push(`  ⚠ ${summary.apparentImprovements} apparent improvement(s) with hidden tradeoffs`);
  if (summary.realRegressions > 0) lines.push(`  ✗ ${summary.realRegressions} real regression(s)`);
  if (summary.maskedRegressions > 0) lines.push(`  ? ${summary.maskedRegressions} possible masked regression(s)`);
  if (summary.neverTriggered > 0) lines.push(`  ○ ${summary.neverTriggered} path(s) never triggered`);
  if (summary.noise > 0) lines.push(`  ~ ${summary.noise} noise (within normal variance)`);
  if (summary.inconclusive > 0) lines.push(`  - ${summary.inconclusive} inconclusive`);

  if (summary.attentionItems.length > 0) {
    lines.push('');
    lines.push(`${summary.attentionItems.length} item(s) need attention:`);
    for (const item of summary.attentionItems) {
      lines.push(`  [${item.classification}] ${item.change.area}: ${item.change.description}`);
      lines.push(`    Reason: ${item.reason} (${item.confidence} confidence)`);
    }
  }

  return lines.join('\n');
}
