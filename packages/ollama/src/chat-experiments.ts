// Chat experiments — deterministic experiment layer (v1.8.0)
// Runs many simulations across seeds, extracts aggregate metrics,
// detects variance / rare-path problems, compares baseline vs tuned,
// and sweeps parameter ranges.
// No LLM calls — all analysis is deterministic from structured data.
// Nothing mutates without explicit confirmation.

import type { DesignSession } from './session.js';
import type { ScenarioMetrics, BalanceFinding } from './chat-balance-analyzer.js';
import { extractMetrics, parseReplayData, analyzeBalance } from './chat-balance-analyzer.js';

// ============================================================
// Types
// ============================================================

/** Specification for a deterministic experiment. */
export type ExperimentSpec = {
  id: string;
  label: string;
  scenarioId?: string;
  runs: number;
  seedStart?: number;
  seedList?: number[];
  tickLimit?: number;
  focusMetrics?: string[];
  parameterOverrides?: Record<string, number | string | boolean>;
};

/** Result of a single experiment run. */
export type ExperimentRunResult = {
  runIndex: number;
  seed: number;
  replayPath?: string;
  metrics: ScenarioMetrics;
  summary: string;
  error?: string;
};

/** Aggregate metrics across many runs. */
export type AggregateMetrics = {
  means: Record<string, number>;
  mins: Record<string, number>;
  maxes: Record<string, number>;
  variances: Record<string, number>;
  rates: Record<string, number>;
};

/** Variance finding — structured issue from aggregate analysis. */
export type VarianceFinding = {
  code: string;
  severity: 'low' | 'medium' | 'high';
  metric: string;
  summary: string;
  likelyCause?: string;
  suggestion?: string;
};

/** Full experiment summary. */
export type ExperimentSummary = {
  spec: ExperimentSpec;
  runs: ExperimentRunResult[];
  aggregate: AggregateMetrics;
  varianceFindings: VarianceFinding[];
  // Populated only when runs > 0 and successful
  completedRuns: number;
  failedRuns: number;
};

/** Comparison between two experiment summaries. */
export type ExperimentComparison = {
  improvements: string[];
  regressions: string[];
  unchanged: string[];
  verdict: string;
  metricDiffs: Record<string, { before: number; after: number; delta: number }>;
};

/** Parameter sweep specification. */
export type ParameterSweepSpec = {
  param: string;
  values: Array<number | string | boolean>;
  baseExperiment: ExperimentSpec;
};

/** One point in a parameter sweep. */
export type SweepPoint = {
  value: number | string | boolean;
  summary: ExperimentSummary;
};

/** Full parameter sweep result. */
export type ParameterSweepResult = {
  param: string;
  points: SweepPoint[];
  recommendation?: string;
};

/** Experiment plan step. */
export type ExperimentPlanStep = {
  id: number;
  description: string;
  command: string;
  params: Record<string, string>;
  status: 'pending' | 'executed' | 'failed' | 'skipped';
  result?: string;
};

/** Full experiment plan. */
export type ExperimentPlan = {
  goal: string;
  steps: ExperimentPlanStep[];
  estimatedRuns: number;
  expectedOutputs: string[];
};

// ============================================================
// Tunable parameter whitelist
// ============================================================

const TUNABLE_PARAMS: Record<string, { min: number; max: number; unit: string }> = {
  rumorClarity:        { min: 0.0, max: 1.0, unit: 'ratio' },
  alertGain:           { min: 0.0, max: 1.0, unit: 'ratio' },
  hostilityDecay:      { min: 0.0, max: 1.0, unit: 'ratio/tick' },
  escalationThreshold: { min: 0.0, max: 1.0, unit: 'ratio' },
  stabilityReactivity: { min: 0.0, max: 1.0, unit: 'ratio' },
  escalationGain:      { min: 0.0, max: 1.0, unit: 'ratio' },
  encounterDifficulty: { min: 0.0, max: 1.0, unit: 'ratio' },
};

export function getTunableParams(): Record<string, { min: number; max: number; unit: string }> {
  return { ...TUNABLE_PARAMS };
}

export function isTunableParam(param: string): boolean {
  return param in TUNABLE_PARAMS;
}

// ============================================================
// Seed derivation — deterministic
// ============================================================

export function deriveSeeds(spec: ExperimentSpec): number[] {
  if (spec.seedList && spec.seedList.length > 0) {
    return [...spec.seedList];
  }
  const start = spec.seedStart ?? 1;
  return Array.from({ length: spec.runs }, (_, i) => start + i);
}

// ============================================================
// Scenario metrics extraction (from replay-like data)
// ============================================================

/**
 * Extract ScenarioMetrics from replay data.
 * Delegates to the existing extractMetrics/parseReplayData from balance analyzer.
 */
export function extractScenarioMetrics(replayData: string): ScenarioMetrics {
  const ticks = parseReplayData(replayData);
  return extractMetrics(ticks);
}

/**
 * Build a per-run summary line from metrics.
 */
function summarizeRun(metrics: ScenarioMetrics, seed: number): string {
  const parts: string[] = [`seed=${seed}`];
  parts.push(`ticks=${metrics.totalTicks}`);
  if (metrics.escalationTick !== null) {
    parts.push(`escalation@${metrics.escalationTick}`);
  }
  if (metrics.rumorSpreadReach > 0) {
    parts.push(`rumor_reach=${metrics.rumorSpreadReach}`);
  }
  if (metrics.encounterDuration > 0) {
    parts.push(`enc_dur=${metrics.encounterDuration.toFixed(1)}`);
  }
  if (metrics.factionHostilityPeak > 0) {
    parts.push(`hostility_peak=${metrics.factionHostilityPeak.toFixed(2)}`);
  }
  return parts.join(', ');
}

// ============================================================
// Experiment runner (deterministic, in-process)
// ============================================================

/**
 * A replay producer function.
 * Given a seed and optional parameter overrides, returns replay JSON.
 * The experiment runner itself doesn't simulate — the caller provides this.
 */
export type ReplayProducer = (
  seed: number,
  parameterOverrides?: Record<string, number | string | boolean>,
  tickLimit?: number,
) => string;

/**
 * Run a deterministic experiment.
 * The replayProducer is injected — the experiment runner doesn't invent simulation behavior.
 */
export function runExperiment(
  spec: ExperimentSpec,
  replayProducer: ReplayProducer,
): ExperimentSummary {
  const seeds = deriveSeeds(spec);
  const runs: ExperimentRunResult[] = [];
  let failedRuns = 0;

  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i];
    try {
      const replayData = replayProducer(seed, spec.parameterOverrides, spec.tickLimit);
      const metrics = extractScenarioMetrics(replayData);
      runs.push({
        runIndex: i,
        seed,
        metrics,
        summary: summarizeRun(metrics, seed),
      });
    } catch (err) {
      failedRuns++;
      runs.push({
        runIndex: i,
        seed,
        metrics: emptyMetrics(),
        summary: `seed=${seed}: FAILED`,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const successfulRuns = runs.filter(r => !r.error);
  const aggregate = computeAggregate(successfulRuns.map(r => r.metrics));
  const varianceFindings = detectVarianceFindings(aggregate, successfulRuns.length);

  return {
    spec,
    runs,
    aggregate,
    varianceFindings,
    completedRuns: successfulRuns.length,
    failedRuns,
  };
}

// ============================================================
// Aggregate metrics computation
// ============================================================

const NUMERIC_METRIC_KEYS = [
  'totalTicks', 'encounterDuration', 'rumorSpreadReach',
  'factionHostilityPeak', 'encounterTicks', 'escalationPhases',
] as const;

const NULLABLE_TICK_KEYS = ['escalationTick'] as const;

function emptyMetrics(): ScenarioMetrics {
  return {
    totalTicks: 0,
    escalationTick: null,
    rumorSpreadReach: 0,
    encounterDuration: 0,
    factionHostilityPeak: 0,
    curves: [],
    encounterTicks: 0,
    escalationPhases: 0,
  };
}

export function computeAggregate(metricsArray: ScenarioMetrics[]): AggregateMetrics {
  if (metricsArray.length === 0) {
    return { means: {}, mins: {}, maxes: {}, variances: {}, rates: {} };
  }

  const n = metricsArray.length;
  const means: Record<string, number> = {};
  const mins: Record<string, number> = {};
  const maxes: Record<string, number> = {};
  const variances: Record<string, number> = {};
  const rates: Record<string, number> = {};

  // Compute for standard numeric metrics
  for (const key of NUMERIC_METRIC_KEYS) {
    const values = metricsArray.map(m => m[key]);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    means[key] = mean;
    mins[key] = Math.min(...values);
    maxes[key] = Math.max(...values);
    const sumSqDiff = values.reduce((a, v) => a + (v - mean) ** 2, 0);
    variances[key] = sumSqDiff / n;
  }

  // Nullable tick metrics — compute from non-null values
  for (const key of NULLABLE_TICK_KEYS) {
    const validValues = metricsArray
      .map(m => m[key])
      .filter((v): v is number => v !== null);
    if (validValues.length > 0) {
      const sum = validValues.reduce((a, b) => a + b, 0);
      const mean = sum / validValues.length;
      means[key] = mean;
      mins[key] = Math.min(...validValues);
      maxes[key] = Math.max(...validValues);
      const sumSqDiff = validValues.reduce((a, v) => a + (v - mean) ** 2, 0);
      variances[key] = sumSqDiff / validValues.length;
    }
    // Rate: how often this metric fires
    rates[`${key}Rate`] = validValues.length / n;
  }

  // Survival rate (derived: if escalationTick is null, didn't escalate → "survived")
  const survivedCount = metricsArray.filter(m => m.escalationTick === null).length;
  rates['survivalRate'] = survivedCount / n;

  // Escalation rate
  rates['escalationRate'] = 1 - rates['survivalRate'];

  return { means, mins, maxes, variances, rates };
}

// ============================================================
// Variance analysis (heuristic)
// ============================================================

type VarianceRule = {
  code: string;
  metric: string;
  check: (agg: AggregateMetrics, runCount: number) => VarianceFinding | null;
};

const VARIANCE_RULES: VarianceRule[] = [
  {
    code: 'high_variance_encounter_duration',
    metric: 'encounterDuration',
    check: (agg) => {
      const variance = agg.variances['encounterDuration'] ?? 0;
      const mean = agg.means['encounterDuration'] ?? 0;
      if (mean === 0) return null;
      const cv = Math.sqrt(variance) / mean;
      if (cv > 0.5) {
        return {
          code: 'high_variance_encounter_duration',
          severity: cv > 0.8 ? 'high' : 'medium',
          metric: 'encounterDuration',
          summary: `Encounter duration varies widely (CV=${cv.toFixed(2)}, mean=${mean.toFixed(1)})`,
          likelyCause: 'Encounter triggers or exit conditions may be inconsistent across seeds',
          suggestion: 'Review encounter escalation thresholds and exit conditions',
        };
      }
      return null;
    },
  },
  {
    code: 'rare_escalation_trigger',
    metric: 'escalationTick',
    check: (agg) => {
      const rate = agg.rates['escalationRate'] ?? 0;
      if (rate > 0 && rate < 0.3) {
        return {
          code: 'rare_escalation_trigger',
          severity: 'medium',
          metric: 'escalationTick',
          summary: `Escalation triggers rarely (${(rate * 100).toFixed(0)}% of runs)`,
          likelyCause: 'Alert gain or escalation threshold may be miscalibrated',
          suggestion: 'Consider increasing alert gain or lowering escalation threshold',
        };
      }
      return null;
    },
  },
  {
    code: 'unstable_rumor_spread',
    metric: 'rumorSpreadReach',
    check: (agg) => {
      const variance = agg.variances['rumorSpreadReach'] ?? 0;
      const mean = agg.means['rumorSpreadReach'] ?? 0;
      if (mean === 0) return null;
      const cv = Math.sqrt(variance) / mean;
      if (cv > 0.4) {
        return {
          code: 'unstable_rumor_spread',
          severity: cv > 0.7 ? 'high' : 'medium',
          metric: 'rumorSpreadReach',
          summary: `Rumor spread reach is unstable (CV=${cv.toFixed(2)}, mean=${mean.toFixed(1)})`,
          likelyCause: 'Rumor propagation may depend too heavily on seed-dependent paths',
          suggestion: 'Add redundant rumor paths or increase rumor clarity',
        };
      }
      return null;
    },
  },
  {
    code: 'survival_outcomes_too_swingy',
    metric: 'survivalRate',
    check: (agg) => {
      const rate = agg.rates['survivalRate'] ?? 0;
      // Swingy = not clearly high or low (between 0.3–0.7 means unpredictable)
      if (rate >= 0.3 && rate <= 0.7) {
        return {
          code: 'survival_outcomes_too_swingy',
          severity: 'high',
          metric: 'survivalRate',
          summary: `Survival rate is unpredictable (${(rate * 100).toFixed(0)}% — neither safe nor deadly)`,
          likelyCause: 'Encounter lethality or escape mechanics may be seed-sensitive',
          suggestion: 'Tune encounter difficulty or add consistent escape paths',
        };
      }
      return null;
    },
  },
  {
    code: 'high_variance_hostility_peak',
    metric: 'factionHostilityPeak',
    check: (agg) => {
      const variance = agg.variances['factionHostilityPeak'] ?? 0;
      const mean = agg.means['factionHostilityPeak'] ?? 0;
      if (mean === 0) return null;
      const cv = Math.sqrt(variance) / mean;
      if (cv > 0.45) {
        return {
          code: 'high_variance_hostility_peak',
          severity: cv > 0.7 ? 'high' : 'medium',
          metric: 'factionHostilityPeak',
          summary: `Faction hostility peak varies widely (CV=${cv.toFixed(2)}, mean=${mean.toFixed(2)})`,
          likelyCause: 'Faction hostility escalation may lack consistent drivers',
          suggestion: 'Review hostility decay and event-driven hostility changes',
        };
      }
      return null;
    },
  },
  {
    code: 'escalation_timing_unstable',
    metric: 'escalationTick',
    check: (agg) => {
      const variance = agg.variances['escalationTick'] ?? 0;
      const mean = agg.means['escalationTick'] ?? 0;
      if (mean === 0) return null;
      const cv = Math.sqrt(variance) / mean;
      if (cv > 0.4) {
        return {
          code: 'escalation_timing_unstable',
          severity: cv > 0.7 ? 'high' : 'medium',
          metric: 'escalationTick',
          summary: `Escalation timing is unstable (CV=${cv.toFixed(2)}, mean tick=${mean.toFixed(1)})`,
          likelyCause: 'Alert pressure accumulation depends too much on event ordering',
          suggestion: 'Increase base alert gain or reduce variability in alert events',
        };
      }
      return null;
    },
  },
];

export function detectVarianceFindings(
  aggregate: AggregateMetrics,
  runCount: number,
): VarianceFinding[] {
  if (runCount < 2) return [];
  const findings: VarianceFinding[] = [];
  for (const rule of VARIANCE_RULES) {
    const finding = rule.check(aggregate, runCount);
    if (finding) findings.push(finding);
  }
  return findings;
}

// ============================================================
// Experiment comparison
// ============================================================

export function compareExperiments(
  before: ExperimentSummary,
  after: ExperimentSummary,
): ExperimentComparison {
  const improvements: string[] = [];
  const regressions: string[] = [];
  const unchanged: string[] = [];
  const metricDiffs: Record<string, { before: number; after: number; delta: number }> = {};

  // Compare means across all shared metrics
  const allKeys = new Set([
    ...Object.keys(before.aggregate.means),
    ...Object.keys(after.aggregate.means),
  ]);

  for (const key of allKeys) {
    const bVal = before.aggregate.means[key] ?? 0;
    const aVal = after.aggregate.means[key] ?? 0;
    const delta = aVal - bVal;
    metricDiffs[key] = { before: bVal, after: aVal, delta };

    const threshold = Math.max(0.05, Math.abs(bVal) * 0.1);
    if (Math.abs(delta) <= threshold) {
      unchanged.push(`${key}: stable (${bVal.toFixed(2)} → ${aVal.toFixed(2)})`);
    } else if (isImprovementDirection(key, delta)) {
      improvements.push(`${key}: improved (${bVal.toFixed(2)} → ${aVal.toFixed(2)})`);
    } else {
      regressions.push(`${key}: regressed (${bVal.toFixed(2)} → ${aVal.toFixed(2)})`);
    }
  }

  // Compare rates
  const allRateKeys = new Set([
    ...Object.keys(before.aggregate.rates),
    ...Object.keys(after.aggregate.rates),
  ]);

  for (const key of allRateKeys) {
    const bVal = before.aggregate.rates[key] ?? 0;
    const aVal = after.aggregate.rates[key] ?? 0;
    const delta = aVal - bVal;
    metricDiffs[key] = { before: bVal, after: aVal, delta };

    if (Math.abs(delta) <= 0.05) {
      unchanged.push(`${key}: stable (${(bVal * 100).toFixed(0)}% → ${(aVal * 100).toFixed(0)}%)`);
    } else if (isImprovementDirection(key, delta)) {
      improvements.push(`${key}: improved (${(bVal * 100).toFixed(0)}% → ${(aVal * 100).toFixed(0)}%)`);
    } else {
      regressions.push(`${key}: regressed (${(bVal * 100).toFixed(0)}% → ${(aVal * 100).toFixed(0)}%)`);
    }
  }

  // Compare variance findings
  const beforeFindings = before.varianceFindings.length;
  const afterFindings = after.varianceFindings.length;
  if (afterFindings < beforeFindings) {
    improvements.push(`Variance findings reduced: ${beforeFindings} → ${afterFindings}`);
  } else if (afterFindings > beforeFindings) {
    regressions.push(`Variance findings increased: ${beforeFindings} → ${afterFindings}`);
  }

  // Verdict
  let verdict: string;
  if (improvements.length > 0 && regressions.length === 0) {
    verdict = 'Clear improvement';
  } else if (regressions.length > 0 && improvements.length === 0) {
    verdict = 'Clear regression';
  } else if (improvements.length > 0 && regressions.length > 0) {
    verdict = 'Mixed results — some improvements, some regressions';
  } else {
    verdict = 'No significant changes';
  }

  return { improvements, regressions, unchanged, verdict, metricDiffs };
}

/**
 * Heuristic: which direction is "better" for a metric?
 * Positive delta = improvement for some, regression for others.
 */
function isImprovementDirection(metric: string, delta: number): boolean {
  // Lower is better for these
  const lowerIsBetter = ['encounterDuration', 'factionHostilityPeak', 'encounterTicks'];
  if (lowerIsBetter.some(m => metric.includes(m))) {
    return delta < 0;
  }
  // Higher survival/escalation rate is generally better if intentional
  // For rates, more escalation = more dramatic (better for paranoia goals)
  if (metric === 'survivalRate') return delta > 0;
  // For most metrics, higher = more dynamic = generally positive
  return delta > 0;
}

// ============================================================
// Parameter sweep
// ============================================================

export function generateSweepValues(
  from: number,
  to: number,
  step: number,
): number[] {
  if (step <= 0) return [from];
  const values: number[] = [];
  // Use epsilon to handle floating-point edge cases
  for (let v = from; v <= to + step * 0.001; v += step) {
    values.push(Math.round(v * 1000) / 1000);
  }
  return values;
}

export function runParameterSweep(
  sweepSpec: ParameterSweepSpec,
  replayProducer: ReplayProducer,
): ParameterSweepResult {
  const points: SweepPoint[] = [];

  for (const value of sweepSpec.values) {
    const experimentSpec: ExperimentSpec = {
      ...sweepSpec.baseExperiment,
      id: `${sweepSpec.baseExperiment.id}_${sweepSpec.param}_${value}`,
      label: `${sweepSpec.param}=${value}`,
      parameterOverrides: {
        ...(sweepSpec.baseExperiment.parameterOverrides ?? {}),
        [sweepSpec.param]: value,
      },
    };
    const summary = runExperiment(experimentSpec, replayProducer);
    points.push({ value, summary });
  }

  const recommendation = generateSweepRecommendation(sweepSpec.param, points);

  return { param: sweepSpec.param, points, recommendation };
}

function generateSweepRecommendation(param: string, points: SweepPoint[]): string | undefined {
  if (points.length < 2) return undefined;

  // Find the point with fewest variance findings, then lowest mean encounter duration as tiebreaker
  let bestIdx = 0;
  let bestScore = Infinity;

  for (let i = 0; i < points.length; i++) {
    const summary = points[i].summary;
    const varianceCount = summary.varianceFindings.length;
    const avgEncDur = summary.aggregate.means['encounterDuration'] ?? 0;
    // Score: prioritize fewer variance findings, then lower encounter flakiness
    const totalVariance = Object.values(summary.aggregate.variances).reduce((a, b) => a + b, 0);
    const score = varianceCount * 1000 + totalVariance;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  const bestValue = points[bestIdx].value;
  const bestVF = points[bestIdx].summary.varianceFindings.length;
  return `Recommended ${param}=${bestValue} (fewest variance findings: ${bestVF}, lowest aggregate variance)`;
}

// ============================================================
// Experiment plans
// ============================================================

type PlanTemplate = {
  pattern: RegExp;
  build: (goal: string, session: DesignSession | null) => ExperimentPlan;
};

const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    pattern: /compare|baseline.*tuned|tuned.*baseline|before.*after|a.*vs.*b/i,
    build: (goal, _session) => ({
      goal,
      steps: [
        { id: 1, description: 'Run baseline experiment', command: 'experiment run --label baseline --runs 20', params: { label: 'baseline', runs: '20' }, status: 'pending' },
        { id: 2, description: 'Run tuned experiment', command: 'experiment run --label tuned --runs 20', params: { label: 'tuned', runs: '20' }, status: 'pending' },
        { id: 3, description: 'Compare aggregate metrics', command: 'experiment compare baseline tuned', params: { before: 'baseline', after: 'tuned' }, status: 'pending' },
        { id: 4, description: 'Surface variance findings', command: 'experiment findings', params: {}, status: 'pending' },
        { id: 5, description: 'Suggest next tuning action', command: 'tune', params: {}, status: 'pending' },
      ],
      estimatedRuns: 40,
      expectedOutputs: ['baseline summary', 'tuned summary', 'comparison report', 'variance findings'],
    }),
  },
  {
    pattern: /sweep|range|parameter/i,
    build: (goal, _session) => {
      const paramMatch = goal.match(/(?:sweep|range)\s+(\w+)/i);
      const param = paramMatch?.[1] ?? 'rumorClarity';
      return {
        goal,
        steps: [
          { id: 1, description: `Sweep ${param} across range`, command: `experiment sweep --param ${param} --from 0.3 --to 0.8 --step 0.1 --runs 10`, params: { param, from: '0.3', to: '0.8', step: '0.1', runs: '10' }, status: 'pending' },
          { id: 2, description: 'Review per-value aggregates', command: 'experiment sweep-results', params: {}, status: 'pending' },
          { id: 3, description: 'Identify stable range', command: 'experiment findings', params: {}, status: 'pending' },
        ],
        estimatedRuns: 60,
        expectedOutputs: ['sweep results', 'per-value aggregates', 'stable range recommendation'],
      };
    },
  },
  {
    // Default: simple batch-run experiment
    pattern: /.*/,
    build: (goal, _session) => ({
      goal,
      steps: [
        { id: 1, description: 'Run experiment batch', command: 'experiment run --runs 20', params: { runs: '20' }, status: 'pending' },
        { id: 2, description: 'Analyze aggregate metrics', command: 'experiment summary', params: {}, status: 'pending' },
        { id: 3, description: 'Detect variance findings', command: 'experiment findings', params: {}, status: 'pending' },
      ],
      estimatedRuns: 20,
      expectedOutputs: ['experiment summary', 'aggregate metrics', 'variance findings'],
    }),
  },
];

export function generateExperimentPlan(
  goal: string,
  session: DesignSession | null = null,
): ExperimentPlan {
  for (const template of PLAN_TEMPLATES) {
    if (template.pattern.test(goal)) {
      return template.build(goal, session);
    }
  }
  // Fallback (shouldn't reach due to .* catch-all)
  return PLAN_TEMPLATES[PLAN_TEMPLATES.length - 1].build(goal, session);
}

// ============================================================
// Formatting
// ============================================================

export function formatExperimentSummary(summary: ExperimentSummary): string {
  const lines: string[] = [];
  lines.push(`Experiment: ${summary.spec.label} (${summary.spec.id})`);
  lines.push(`Runs: ${summary.completedRuns} completed, ${summary.failedRuns} failed`);

  if (Object.keys(summary.aggregate.means).length > 0) {
    lines.push('');
    lines.push('Aggregate Metrics:');
    for (const [key, mean] of Object.entries(summary.aggregate.means)) {
      const min = summary.aggregate.mins[key] ?? 0;
      const max = summary.aggregate.maxes[key] ?? 0;
      const variance = summary.aggregate.variances[key] ?? 0;
      lines.push(`  ${key}: mean=${mean.toFixed(2)}, min=${min.toFixed(2)}, max=${max.toFixed(2)}, variance=${variance.toFixed(3)}`);
    }
  }

  if (Object.keys(summary.aggregate.rates).length > 0) {
    lines.push('');
    lines.push('Rates:');
    for (const [key, rate] of Object.entries(summary.aggregate.rates)) {
      lines.push(`  ${key}: ${(rate * 100).toFixed(0)}%`);
    }
  }

  if (summary.varianceFindings.length > 0) {
    lines.push('');
    lines.push(`Variance Findings (${summary.varianceFindings.length}):`);
    for (const f of summary.varianceFindings) {
      lines.push(`  [${f.severity}] ${f.code}: ${f.summary}`);
      if (f.suggestion) lines.push(`    → ${f.suggestion}`);
    }
  }

  return lines.join('\n');
}

export function formatExperimentComparison(comparison: ExperimentComparison): string {
  const lines: string[] = [];
  lines.push(`Verdict: ${comparison.verdict}`);

  if (comparison.improvements.length > 0) {
    lines.push('');
    lines.push('Improved:');
    for (const imp of comparison.improvements) lines.push(`  + ${imp}`);
  }

  if (comparison.regressions.length > 0) {
    lines.push('');
    lines.push('Regressed:');
    for (const reg of comparison.regressions) lines.push(`  - ${reg}`);
  }

  if (comparison.unchanged.length > 0) {
    lines.push('');
    lines.push('Unchanged:');
    for (const unc of comparison.unchanged) lines.push(`  = ${unc}`);
  }

  return lines.join('\n');
}

export function formatParameterSweepResult(result: ParameterSweepResult): string {
  const lines: string[] = [];
  lines.push(`Parameter Sweep: ${result.param}`);
  lines.push(`Points: ${result.points.length}`);

  for (const point of result.points) {
    const s = point.summary;
    const varFindings = s.varianceFindings.length;
    const meansStr = Object.entries(s.aggregate.means)
      .slice(0, 3)
      .map(([k, v]) => `${k}=${v.toFixed(2)}`)
      .join(', ');
    lines.push(`  ${result.param}=${point.value}: ${s.completedRuns}/${s.spec.runs} runs, ${varFindings} variance findings, ${meansStr}`);
  }

  if (result.recommendation) {
    lines.push('');
    lines.push(result.recommendation);
  }

  return lines.join('\n');
}

export function formatExperimentPlan(plan: ExperimentPlan): string {
  const lines: string[] = [];
  lines.push(`Experiment Plan: ${plan.goal}`);
  lines.push(`Estimated runs: ${plan.estimatedRuns}`);
  lines.push('');
  lines.push('Steps:');
  for (const step of plan.steps) {
    const icon = step.status === 'executed' ? '●'
      : step.status === 'failed' ? '✗'
      : step.status === 'skipped' ? '○'
      : '◇';
    lines.push(`  ${icon} ${step.id}. ${step.description}`);
    lines.push(`     ${step.command}`);
  }
  if (plan.expectedOutputs.length > 0) {
    lines.push('');
    lines.push('Expected outputs:');
    for (const out of plan.expectedOutputs) {
      lines.push(`  • ${out}`);
    }
  }
  return lines.join('\n');
}

export function formatRunResults(runs: ExperimentRunResult[]): string {
  const lines: string[] = [];
  lines.push(`Run Results (${runs.length}):`);
  for (const run of runs) {
    const icon = run.error ? '✗' : '●';
    lines.push(`  ${icon} [${run.runIndex}] ${run.summary}`);
  }
  return lines.join('\n');
}
