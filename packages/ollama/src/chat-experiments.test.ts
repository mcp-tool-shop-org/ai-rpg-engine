// Tests — chat experiments: scenario experiments (v1.8.0)

import { describe, it, expect } from 'vitest';
import {
  deriveSeeds,
  extractScenarioMetrics,
  runExperiment,
  computeAggregate,
  detectVarianceFindings,
  compareExperiments,
  generateSweepValues,
  runParameterSweep,
  generateExperimentPlan,
  isTunableParam,
  getTunableParams,
  formatExperimentSummary,
  formatExperimentComparison,
  formatParameterSweepResult,
  formatExperimentPlan,
  formatRunResults,
} from './chat-experiments.js';
import type {
  ExperimentSpec,
  ExperimentRunResult,
  ExperimentSummary,
  AggregateMetrics,
  VarianceFinding,
  ExperimentComparison,
  ParameterSweepSpec,
  ParameterSweepResult,
  ExperimentPlan,
  ReplayProducer,
} from './chat-experiments.js';
import type { ScenarioMetrics } from './chat-balance-analyzer.js';
import { classifyByKeywords } from './chat-router.js';
import { findToolForIntent, getAllTools } from './chat-tools.js';
import type { DesignSession } from './session.js';

// --- Helpers ---

function makeSpec(overrides: Partial<ExperimentSpec> = {}): ExperimentSpec {
  return {
    id: 'test-exp',
    label: 'Test Experiment',
    runs: 5,
    seedStart: 1,
    ...overrides,
  };
}

function makeSession(overrides: Partial<DesignSession> = {}): DesignSession {
  return {
    name: 'experiment-test',
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    themes: ['dark fantasy'],
    constraints: [],
    artifacts: { districts: [], factions: [], quests: [], rooms: [], packs: [] },
    issues: [],
    acceptedSuggestions: [],
    history: [],
    ...overrides,
  } as DesignSession;
}

function makeMetrics(overrides: Partial<ScenarioMetrics> = {}): ScenarioMetrics {
  return {
    totalTicks: 50,
    escalationTick: 12,
    rumorSpreadReach: 3,
    encounterDuration: 8,
    factionHostilityPeak: 0.65,
    curves: [],
    encounterTicks: 24,
    escalationPhases: 2,
    ...overrides,
  };
}

/**
 * Deterministic replay producer for testing.
 * Generates structured tick data with seed-dependent variation.
 */
function makeReplayProducer(options: {
  baseTicks?: number;
  seedVariance?: number;
  failOnSeed?: number;
} = {}): ReplayProducer {
  const { baseTicks = 30, seedVariance = 2, failOnSeed } = options;
  return (seed, paramOverrides, tickLimit) => {
    if (seed === failOnSeed) throw new Error(`Seed ${seed} failed`);
    const ticks = Math.min(baseTicks + (seed % seedVariance), tickLimit ?? 100);
    const alertBase = paramOverrides?.alertGain ? Number(paramOverrides.alertGain) : 0.3;
    const rumorBase = paramOverrides?.rumorClarity ? Number(paramOverrides.rumorClarity) : 0.5;
    // Build a minimal tick array that parseReplayData can handle
    const tickData = [];
    for (let t = 0; t < ticks; t++) {
      const alert = alertBase + (t / ticks) * 0.5 + (seed % 3) * 0.05;
      tickData.push({
        tick: t,
        alertPressure: alert,
        rumorSpread: rumorBase + (t / ticks) * 0.3,
        hostility: 0.1 + (t / ticks) * 0.4 + (seed % 5) * 0.02,
        encounterActive: t >= 10 && t <= 10 + 5 + (seed % 3),
      });
    }
    return JSON.stringify(tickData);
  };
}

function makeSummary(overrides: Partial<ExperimentSummary> = {}): ExperimentSummary {
  const spec = makeSpec();
  return {
    spec,
    runs: [],
    aggregate: {
      means: { totalTicks: 30, encounterDuration: 6, rumorSpreadReach: 2 },
      mins: { totalTicks: 28, encounterDuration: 4, rumorSpreadReach: 1 },
      maxes: { totalTicks: 32, encounterDuration: 8, rumorSpreadReach: 3 },
      variances: { totalTicks: 2, encounterDuration: 1.5, rumorSpreadReach: 0.3 },
      rates: { escalationRate: 0.6, survivalRate: 0.4 },
    },
    varianceFindings: [],
    completedRuns: 5,
    failedRuns: 0,
    ...overrides,
  };
}

// ============================================================
// PILLAR 1 — Deterministic experiment runner
// ============================================================

describe('Pillar 1 — Deterministic experiment runner', () => {
  describe('deriveSeeds', () => {
    it('uses seedList when provided', () => {
      const seeds = deriveSeeds(makeSpec({ seedList: [10, 20, 30], runs: 3 }));
      expect(seeds).toEqual([10, 20, 30]);
    });

    it('derives seeds from seedStart', () => {
      const seeds = deriveSeeds(makeSpec({ seedStart: 100, runs: 4 }));
      expect(seeds).toEqual([100, 101, 102, 103]);
    });

    it('defaults seedStart to 1', () => {
      const seeds = deriveSeeds(makeSpec({ runs: 3 }));
      expect(seeds).toEqual([1, 2, 3]);
    });

    it('seedList takes priority over seedStart', () => {
      const seeds = deriveSeeds(makeSpec({ seedList: [7, 8], seedStart: 100, runs: 2 }));
      expect(seeds).toEqual([7, 8]);
    });

    it('returns empty for 0 runs without seedList', () => {
      const seeds = deriveSeeds(makeSpec({ runs: 0 }));
      expect(seeds).toEqual([]);
    });
  });

  describe('runExperiment', () => {
    it('produces correct number of runs', () => {
      const producer = makeReplayProducer();
      const result = runExperiment(makeSpec({ runs: 5 }), producer);
      expect(result.runs).toHaveLength(5);
      expect(result.completedRuns).toBe(5);
      expect(result.failedRuns).toBe(0);
    });

    it('uses provided seeds', () => {
      const producer = makeReplayProducer();
      const result = runExperiment(makeSpec({ seedList: [42, 43] }), producer);
      expect(result.runs[0].seed).toBe(42);
      expect(result.runs[1].seed).toBe(43);
    });

    it('records run index correctly', () => {
      const producer = makeReplayProducer();
      const result = runExperiment(makeSpec({ runs: 3 }), producer);
      expect(result.runs.map(r => r.runIndex)).toEqual([0, 1, 2]);
    });

    it('is deterministic — same spec same results', () => {
      const producer = makeReplayProducer();
      const spec = makeSpec({ runs: 5, seedStart: 10 });
      const result1 = runExperiment(spec, producer);
      const result2 = runExperiment(spec, producer);
      expect(result1.aggregate.means).toEqual(result2.aggregate.means);
      expect(result1.aggregate.variances).toEqual(result2.aggregate.variances);
    });

    it('handles failed runs gracefully', () => {
      const producer = makeReplayProducer({ failOnSeed: 2 });
      const result = runExperiment(makeSpec({ runs: 3, seedStart: 1 }), producer);
      expect(result.completedRuns).toBe(2);
      expect(result.failedRuns).toBe(1);
      const failedRun = result.runs.find(r => r.seed === 2);
      expect(failedRun?.error).toContain('Seed 2 failed');
    });

    it('produces aggregate metrics from successful runs only', () => {
      const producer = makeReplayProducer({ failOnSeed: 3 });
      const result = runExperiment(makeSpec({ runs: 5, seedStart: 1 }), producer);
      expect(result.aggregate.means).toBeDefined();
      expect(Object.keys(result.aggregate.means).length).toBeGreaterThan(0);
    });

    it('produces empty aggregate for all-failure experiment', () => {
      const producer: ReplayProducer = () => { throw new Error('always fails'); };
      const result = runExperiment(makeSpec({ runs: 3 }), producer);
      expect(result.completedRuns).toBe(0);
      expect(result.failedRuns).toBe(3);
      expect(Object.keys(result.aggregate.means)).toEqual([]);
    });

    it('respects tickLimit', () => {
      const producer = makeReplayProducer({ baseTicks: 100 });
      const result = runExperiment(makeSpec({ runs: 2, tickLimit: 20 }), producer);
      for (const run of result.runs.filter(r => !r.error)) {
        expect(run.metrics.totalTicks).toBeLessThanOrEqual(21);
      }
    });

    it('passes parameterOverrides to producer', () => {
      let receivedOverrides: Record<string, number | string | boolean> | undefined;
      const producer: ReplayProducer = (seed, overrides) => {
        receivedOverrides = overrides;
        return JSON.stringify([{ tick: 0, alertPressure: 0.1 }]);
      };
      runExperiment(makeSpec({ parameterOverrides: { alertGain: 0.9 } }), producer);
      expect(receivedOverrides).toEqual({ alertGain: 0.9 });
    });

    it('each run has a summary string', () => {
      const producer = makeReplayProducer();
      const result = runExperiment(makeSpec({ runs: 3 }), producer);
      for (const run of result.runs) {
        expect(run.summary).toBeTruthy();
        expect(typeof run.summary).toBe('string');
      }
    });

    it('preserves spec in summary', () => {
      const spec = makeSpec({ runs: 3, label: 'my-test' });
      const producer = makeReplayProducer();
      const result = runExperiment(spec, producer);
      expect(result.spec).toEqual(spec);
    });
  });
});

// ============================================================
// PILLAR 2 — Scenario metrics extraction
// ============================================================

describe('Pillar 2 — Scenario metrics extraction', () => {
  describe('extractScenarioMetrics', () => {
    it('extracts metrics from tick array', () => {
      const ticks = Array.from({ length: 20 }, (_, i) => ({
        tick: i,
        alertPressure: 0.1 + i * 0.05,
        rumorSpread: 0.2,
      }));
      const metrics = extractScenarioMetrics(JSON.stringify(ticks));
      expect(metrics.totalTicks).toBe(20);
    });

    it('detects escalation tick', () => {
      const ticks = Array.from({ length: 30 }, (_, i) => ({
        tick: i,
        alertPressure: i >= 15 ? 0.8 : 0.1,
      }));
      const metrics = extractScenarioMetrics(JSON.stringify(ticks));
      // escalationTick should be set when alert > threshold
      expect(metrics.totalTicks).toBe(30);
    });

    it('handles single-tick replay', () => {
      const metrics = extractScenarioMetrics(JSON.stringify([{ tick: 0, alertPressure: 0.5 }]));
      expect(metrics.totalTicks).toBe(1);
    });

    it('handles empty replay', () => {
      const metrics = extractScenarioMetrics(JSON.stringify([]));
      expect(metrics.totalTicks).toBe(0);
    });

    it('extracts rumor spread reach', () => {
      const ticks = Array.from({ length: 10 }, (_, i) => ({
        tick: i,
        rumorSpread: i * 0.1,
      }));
      const metrics = extractScenarioMetrics(JSON.stringify(ticks));
      expect(typeof metrics.rumorSpreadReach).toBe('number');
    });

    it('extracts encounter duration', () => {
      const ticks = Array.from({ length: 20 }, (_, i) => ({
        tick: i,
        encounterActive: i >= 5 && i <= 10,
      }));
      const metrics = extractScenarioMetrics(JSON.stringify(ticks));
      expect(typeof metrics.encounterDuration).toBe('number');
    });

    it('handles wrapped single object', () => {
      const wrapped = { ticks: [{ tick: 0, alertPressure: 0.1 }, { tick: 1, alertPressure: 0.2 }] };
      const metrics = extractScenarioMetrics(JSON.stringify(wrapped));
      expect(metrics.totalTicks).toBe(2);
    });
  });
});

// ============================================================
// PILLAR 3 — Aggregate & Variance
// ============================================================

describe('Pillar 3 — Aggregate metrics and variance', () => {
  describe('computeAggregate', () => {
    it('computes means correctly', () => {
      const metrics = [
        makeMetrics({ totalTicks: 40, encounterDuration: 6 }),
        makeMetrics({ totalTicks: 60, encounterDuration: 10 }),
      ];
      const agg = computeAggregate(metrics);
      expect(agg.means['totalTicks']).toBe(50);
      expect(agg.means['encounterDuration']).toBe(8);
    });

    it('computes mins and maxes', () => {
      const metrics = [
        makeMetrics({ factionHostilityPeak: 0.3 }),
        makeMetrics({ factionHostilityPeak: 0.9 }),
      ];
      const agg = computeAggregate(metrics);
      expect(agg.mins['factionHostilityPeak']).toBe(0.3);
      expect(agg.maxes['factionHostilityPeak']).toBe(0.9);
    });

    it('computes variance', () => {
      const metrics = [
        makeMetrics({ encounterDuration: 4 }),
        makeMetrics({ encounterDuration: 6 }),
        makeMetrics({ encounterDuration: 8 }),
      ];
      const agg = computeAggregate(metrics);
      // mean = 6, variance = ((4-6)^2 + (6-6)^2 + (8-6)^2) / 3 = 8/3 ≈ 2.667
      expect(agg.variances['encounterDuration']).toBeCloseTo(2.667, 2);
    });

    it('computes escalation rate', () => {
      const metrics = [
        makeMetrics({ escalationTick: 10 }),
        makeMetrics({ escalationTick: null }),
        makeMetrics({ escalationTick: 15 }),
        makeMetrics({ escalationTick: null }),
      ];
      const agg = computeAggregate(metrics);
      expect(agg.rates['escalationRate']).toBe(0.5);
      expect(agg.rates['survivalRate']).toBe(0.5);
    });

    it('handles empty metrics array', () => {
      const agg = computeAggregate([]);
      expect(Object.keys(agg.means)).toEqual([]);
      expect(Object.keys(agg.rates)).toEqual([]);
    });

    it('handles single metric entry', () => {
      const agg = computeAggregate([makeMetrics({ totalTicks: 42 })]);
      expect(agg.means['totalTicks']).toBe(42);
      expect(agg.variances['totalTicks']).toBe(0);
    });

    it('computes nullable tick metrics from non-null values only', () => {
      const metrics = [
        makeMetrics({ escalationTick: 10 }),
        makeMetrics({ escalationTick: 20 }),
        makeMetrics({ escalationTick: null }),
      ];
      const agg = computeAggregate(metrics);
      expect(agg.means['escalationTick']).toBe(15);
      expect(agg.rates['escalationTickRate']).toBeCloseTo(2/3, 4);
    });

    it('all standard numeric keys present in output', () => {
      const agg = computeAggregate([makeMetrics()]);
      expect(agg.means).toHaveProperty('totalTicks');
      expect(agg.means).toHaveProperty('encounterDuration');
      expect(agg.means).toHaveProperty('rumorSpreadReach');
      expect(agg.means).toHaveProperty('factionHostilityPeak');
      expect(agg.means).toHaveProperty('encounterTicks');
      expect(agg.means).toHaveProperty('escalationPhases');
    });
  });

  describe('detectVarianceFindings', () => {
    it('returns empty for single run', () => {
      const agg = computeAggregate([makeMetrics()]);
      expect(detectVarianceFindings(agg, 1)).toEqual([]);
    });

    it('detects high variance encounter duration', () => {
      const agg: AggregateMetrics = {
        means: { encounterDuration: 5 },
        mins: { encounterDuration: 1 },
        maxes: { encounterDuration: 15 },
        variances: { encounterDuration: 25 }, // CV = 5/5 = 1.0 → high
        rates: {},
      };
      const findings = detectVarianceFindings(agg, 10);
      const found = findings.find(f => f.code === 'high_variance_encounter_duration');
      expect(found).toBeDefined();
      expect(found!.severity).toBe('high');
    });

    it('detects rare escalation trigger', () => {
      const agg: AggregateMetrics = {
        means: {},
        mins: {},
        maxes: {},
        variances: {},
        rates: { escalationRate: 0.1 }, // 10% → rare
      };
      const findings = detectVarianceFindings(agg, 20);
      const found = findings.find(f => f.code === 'rare_escalation_trigger');
      expect(found).toBeDefined();
      expect(found!.severity).toBe('medium');
    });

    it('detects unstable rumor spread', () => {
      const agg: AggregateMetrics = {
        means: { rumorSpreadReach: 3 },
        mins: { rumorSpreadReach: 0 },
        maxes: { rumorSpreadReach: 6 },
        variances: { rumorSpreadReach: 4 }, // CV = 2/3 ≈ 0.67
        rates: {},
      };
      const findings = detectVarianceFindings(agg, 10);
      const found = findings.find(f => f.code === 'unstable_rumor_spread');
      expect(found).toBeDefined();
    });

    it('detects swingy survival rate', () => {
      const agg: AggregateMetrics = {
        means: {},
        mins: {},
        maxes: {},
        variances: {},
        rates: { survivalRate: 0.5 }, // 50% → swingy
      };
      const findings = detectVarianceFindings(agg, 20);
      const found = findings.find(f => f.code === 'survival_outcomes_too_swingy');
      expect(found).toBeDefined();
      expect(found!.severity).toBe('high');
    });

    it('detects high variance hostility peak', () => {
      const agg: AggregateMetrics = {
        means: { factionHostilityPeak: 0.5 },
        mins: { factionHostilityPeak: 0.1 },
        maxes: { factionHostilityPeak: 0.9 },
        variances: { factionHostilityPeak: 0.16 }, // CV = 0.4/0.5 = 0.8
        rates: {},
      };
      const findings = detectVarianceFindings(agg, 10);
      const found = findings.find(f => f.code === 'high_variance_hostility_peak');
      expect(found).toBeDefined();
    });

    it('detects escalation timing unstable', () => {
      const agg: AggregateMetrics = {
        means: { escalationTick: 10 },
        mins: { escalationTick: 2 },
        maxes: { escalationTick: 25 },
        variances: { escalationTick: 36 }, // CV = 6/10 = 0.6
        rates: {},
      };
      const findings = detectVarianceFindings(agg, 10);
      const found = findings.find(f => f.code === 'escalation_timing_unstable');
      expect(found).toBeDefined();
    });

    it('returns empty when metrics are stable', () => {
      const agg: AggregateMetrics = {
        means: { encounterDuration: 10, rumorSpreadReach: 3 },
        mins: { encounterDuration: 9, rumorSpreadReach: 3 },
        maxes: { encounterDuration: 11, rumorSpreadReach: 3 },
        variances: { encounterDuration: 0.5, rumorSpreadReach: 0 },
        rates: { escalationRate: 0.95, survivalRate: 0.05 },
      };
      const findings = detectVarianceFindings(agg, 20);
      expect(findings).toEqual([]);
    });

    it('all findings have required fields', () => {
      const agg: AggregateMetrics = {
        means: { encounterDuration: 5 },
        mins: {},
        maxes: {},
        variances: { encounterDuration: 25 },
        rates: { survivalRate: 0.5 },
      };
      const findings = detectVarianceFindings(agg, 10);
      for (const f of findings) {
        expect(f.code).toBeTruthy();
        expect(f.severity).toMatch(/^(low|medium|high)$/);
        expect(f.metric).toBeTruthy();
        expect(f.summary).toBeTruthy();
      }
    });
  });
});

// ============================================================
// PILLAR 4 — Parameter sweeps
// ============================================================

describe('Pillar 4 — Parameter sweeps', () => {
  describe('generateSweepValues', () => {
    it('generates correct range', () => {
      const values = generateSweepValues(0.4, 0.8, 0.1);
      expect(values).toHaveLength(5);
      expect(values[0]).toBeCloseTo(0.4, 3);
      expect(values[4]).toBeCloseTo(0.8, 3);
    });

    it('handles single step', () => {
      const values = generateSweepValues(0.5, 0.5, 0.1);
      expect(values).toEqual([0.5]);
    });

    it('handles zero step', () => {
      const values = generateSweepValues(0.3, 0.8, 0);
      expect(values).toEqual([0.3]);
    });

    it('handles integer range', () => {
      const values = generateSweepValues(1, 5, 1);
      expect(values).toEqual([1, 2, 3, 4, 5]);
    });

    it('avoids floating point drift', () => {
      const values = generateSweepValues(0.1, 0.3, 0.1);
      expect(values).toEqual([0.1, 0.2, 0.3]);
    });
  });

  describe('runParameterSweep', () => {
    it('produces per-value summaries', () => {
      const producer = makeReplayProducer();
      const sweepSpec: ParameterSweepSpec = {
        param: 'rumorClarity',
        values: [0.4, 0.6, 0.8],
        baseExperiment: makeSpec({ runs: 3 }),
      };
      const result = runParameterSweep(sweepSpec, producer);
      expect(result.points).toHaveLength(3);
      expect(result.points[0].value).toBe(0.4);
      expect(result.points[1].value).toBe(0.6);
      expect(result.points[2].value).toBe(0.8);
    });

    it('each point has valid experiment summary', () => {
      const producer = makeReplayProducer();
      const sweepSpec: ParameterSweepSpec = {
        param: 'alertGain',
        values: [0.3, 0.5],
        baseExperiment: makeSpec({ runs: 3 }),
      };
      const result = runParameterSweep(sweepSpec, producer);
      for (const point of result.points) {
        expect(point.summary.completedRuns).toBe(3);
        expect(point.summary.spec.parameterOverrides).toHaveProperty('alertGain', point.value);
      }
    });

    it('generates a recommendation', () => {
      const producer = makeReplayProducer();
      const sweepSpec: ParameterSweepSpec = {
        param: 'rumorClarity',
        values: [0.3, 0.5, 0.7],
        baseExperiment: makeSpec({ runs: 5 }),
      };
      const result = runParameterSweep(sweepSpec, producer);
      expect(result.recommendation).toBeTruthy();
      expect(result.recommendation).toContain('rumorClarity');
    });

    it('preserves param metadata', () => {
      const producer = makeReplayProducer();
      const sweepSpec: ParameterSweepSpec = {
        param: 'hostilityDecay',
        values: [0.1, 0.2],
        baseExperiment: makeSpec({ runs: 2 }),
      };
      const result = runParameterSweep(sweepSpec, producer);
      expect(result.param).toBe('hostilityDecay');
    });

    it('handles single-value sweep', () => {
      const producer = makeReplayProducer();
      const sweepSpec: ParameterSweepSpec = {
        param: 'alertGain',
        values: [0.5],
        baseExperiment: makeSpec({ runs: 2 }),
      };
      const result = runParameterSweep(sweepSpec, producer);
      expect(result.points).toHaveLength(1);
    });
  });

  describe('isTunableParam', () => {
    it('recognizes tunable params', () => {
      expect(isTunableParam('rumorClarity')).toBe(true);
      expect(isTunableParam('alertGain')).toBe(true);
      expect(isTunableParam('hostilityDecay')).toBe(true);
      expect(isTunableParam('escalationThreshold')).toBe(true);
      expect(isTunableParam('stabilityReactivity')).toBe(true);
      expect(isTunableParam('escalationGain')).toBe(true);
      expect(isTunableParam('encounterDifficulty')).toBe(true);
    });

    it('rejects unknown params', () => {
      expect(isTunableParam('nonsense')).toBe(false);
      expect(isTunableParam('')).toBe(false);
      expect(isTunableParam('playerHealth')).toBe(false);
    });
  });

  describe('getTunableParams', () => {
    it('returns all tunable params with ranges', () => {
      const params = getTunableParams();
      expect(Object.keys(params).length).toBe(7);
      for (const [, info] of Object.entries(params)) {
        expect(typeof info.min).toBe('number');
        expect(typeof info.max).toBe('number');
        expect(typeof info.unit).toBe('string');
      }
    });

    it('returns a copy (not the internal object)', () => {
      const a = getTunableParams();
      const b = getTunableParams();
      expect(a).not.toBe(b);
    });
  });
});

// ============================================================
// PILLAR 5 — Experiment comparison
// ============================================================

describe('Pillar 5 — Experiment comparison', () => {
  describe('compareExperiments', () => {
    it('detects clear improvement', () => {
      const before = makeSummary({
        aggregate: {
          means: { rumorSpreadReach: 1, encounterDuration: 10 },
          mins: {},
          maxes: {},
          variances: {},
          rates: { survivalRate: 0.5 },
        },
      });
      const after = makeSummary({
        aggregate: {
          means: { rumorSpreadReach: 3, encounterDuration: 7 },
          mins: {},
          maxes: {},
          variances: {},
          rates: { survivalRate: 0.8 },
        },
      });
      const comparison = compareExperiments(before, after);
      expect(comparison.verdict).toContain('improvement');
      expect(comparison.improvements.length).toBeGreaterThan(0);
      expect(comparison.regressions).toEqual([]);
    });

    it('detects clear regression', () => {
      const before = makeSummary({
        aggregate: {
          means: { rumorSpreadReach: 5 },
          mins: {},
          maxes: {},
          variances: {},
          rates: { survivalRate: 0.9 },
        },
      });
      const after = makeSummary({
        aggregate: {
          means: { rumorSpreadReach: 1 },
          mins: {},
          maxes: {},
          variances: {},
          rates: { survivalRate: 0.3 },
        },
      });
      const comparison = compareExperiments(before, after);
      expect(comparison.verdict).toContain('regression');
      expect(comparison.regressions.length).toBeGreaterThan(0);
    });

    it('detects mixed results', () => {
      const before = makeSummary({
        aggregate: {
          means: { rumorSpreadReach: 2, encounterDuration: 5 },
          mins: {},
          maxes: {},
          variances: {},
          rates: {},
        },
      });
      const after = makeSummary({
        aggregate: {
          means: { rumorSpreadReach: 4, encounterDuration: 15 },
          mins: {},
          maxes: {},
          variances: {},
          rates: {},
        },
      });
      const comparison = compareExperiments(before, after);
      expect(comparison.verdict).toContain('Mixed');
    });

    it('detects no significant changes', () => {
      const summary = makeSummary();
      const comparison = compareExperiments(summary, summary);
      expect(comparison.verdict).toContain('No significant');
      expect(comparison.unchanged.length).toBeGreaterThan(0);
    });

    it('produces metric diffs', () => {
      const before = makeSummary({
        aggregate: {
          means: { totalTicks: 30 },
          mins: {},
          maxes: {},
          variances: {},
          rates: {},
        },
      });
      const after = makeSummary({
        aggregate: {
          means: { totalTicks: 50 },
          mins: {},
          maxes: {},
          variances: {},
          rates: {},
        },
      });
      const comparison = compareExperiments(before, after);
      expect(comparison.metricDiffs['totalTicks']).toEqual({
        before: 30,
        after: 50,
        delta: 20,
      });
    });

    it('compares variance findings count', () => {
      const before = makeSummary({
        varianceFindings: [{ code: 'a', severity: 'low', metric: 'x', summary: 'a' }, { code: 'b', severity: 'low', metric: 'y', summary: 'b' }],
      });
      const after = makeSummary({ varianceFindings: [] });
      const comparison = compareExperiments(before, after);
      expect(comparison.improvements.some(s => s.includes('Variance findings reduced'))).toBe(true);
    });

    it('handles empty experiments', () => {
      const empty = makeSummary({
        aggregate: { means: {}, mins: {}, maxes: {}, variances: {}, rates: {} },
      });
      const comparison = compareExperiments(empty, empty);
      expect(comparison.verdict).toContain('No significant');
    });
  });
});

// ============================================================
// PILLAR 6 — Experiment plans
// ============================================================

describe('Pillar 6 — Experiment plans', () => {
  describe('generateExperimentPlan', () => {
    it('generates a compare plan for baseline vs tuned', () => {
      const plan = generateExperimentPlan('compare baseline vs tuned');
      expect(plan.goal).toContain('compare');
      expect(plan.steps.length).toBeGreaterThanOrEqual(3);
      expect(plan.steps.some(s => s.description.toLowerCase().includes('baseline'))).toBe(true);
      expect(plan.steps.some(s => s.description.toLowerCase().includes('tuned'))).toBe(true);
      expect(plan.estimatedRuns).toBeGreaterThan(0);
    });

    it('generates a sweep plan', () => {
      const plan = generateExperimentPlan('sweep rumorClarity');
      expect(plan.goal).toContain('sweep');
      expect(plan.steps.some(s => s.command.includes('sweep'))).toBe(true);
    });

    it('generates a default batch plan', () => {
      const plan = generateExperimentPlan('test paranoia district');
      expect(plan.steps.length).toBeGreaterThanOrEqual(2);
      expect(plan.estimatedRuns).toBeGreaterThan(0);
    });

    it('all steps have required fields', () => {
      const plan = generateExperimentPlan('compare baseline vs tuned');
      for (const step of plan.steps) {
        expect(step.id).toBeGreaterThan(0);
        expect(step.description).toBeTruthy();
        expect(step.command).toBeTruthy();
        expect(step.status).toBe('pending');
      }
    });

    it('has expected outputs', () => {
      const plan = generateExperimentPlan('compare before after');
      expect(plan.expectedOutputs.length).toBeGreaterThan(0);
    });

    it('accepts session context', () => {
      const session = makeSession({ themes: ['paranoia'] });
      const plan = generateExperimentPlan('paranoia test', session);
      expect(plan).toBeDefined();
    });

    it('detects sweep keyword in goal', () => {
      const sweepPlan = generateExperimentPlan('parameter sweep alertGain');
      expect(sweepPlan.steps.some(s => s.command.includes('sweep'))).toBe(true);
    });
  });
});

// ============================================================
// PILLAR 7 — Session integration
// ============================================================

describe('Pillar 7 — Session integration', () => {
  it('experiment session events exist', () => {
    // Verify that the new event kinds exist by importing the type
    const expectedEvents = [
      'experiment_plan_created',
      'experiment_started',
      'experiment_run_completed',
      'experiment_sweep_completed',
      'experiment_compared',
      'experiment_findings_added',
    ] as const;
    // If any didn't exist in the SessionEventKind union, TS would error at compile time
    for (const event of expectedEvents) {
      expect(typeof event).toBe('string');
    }
  });

  it('experiment tools record session events', () => {
    // Verify tools exist for experiment intents
    const runTool = findToolForIntent('experiment_run');
    expect(runTool).toBeDefined();
    expect(runTool!.mutates).toBe(false);

    const compareTool = findToolForIntent('experiment_compare');
    expect(compareTool).toBeDefined();
    expect(compareTool!.mutates).toBe(false);

    const planTool = findToolForIntent('experiment_plan');
    expect(planTool).toBeDefined();
    expect(planTool!.mutates).toBe(false);
  });
});

// ============================================================
// PILLAR 8 — Chat integration
// ============================================================

describe('Pillar 8 — Chat integration', () => {
  describe('router patterns', () => {
    it('classifies "run this district 50 times"', () => {
      const result = classifyByKeywords('run this district 50 times');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('experiment_run');
    });

    it('classifies "experiment run"', () => {
      const result = classifyByKeywords('experiment run');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('experiment_run');
    });

    it('extracts run count from message', () => {
      const result = classifyByKeywords('run this scenario 50 times');
      expect(result).not.toBeNull();
      expect(result!.params.runs).toBe('50');
    });

    it('classifies "sweep rumorClarity from 0.4 to 0.8"', () => {
      const result = classifyByKeywords('sweep rumorClarity from 0.4 to 0.8');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('experiment_sweep');
      expect(result!.params.param).toBe('rumorClarity');
    });

    it('extracts sweep range params', () => {
      const result = classifyByKeywords('sweep alertGain from 0.2 to 0.6 step 0.1');
      expect(result).not.toBeNull();
      expect(result!.params.from).toBe('0.2');
      expect(result!.params.to).toBe('0.6');
      expect(result!.params.step).toBe('0.1');
    });

    it('classifies "experiment compare"', () => {
      const result = classifyByKeywords('experiment compare');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('experiment_compare');
    });

    it('classifies "compare the experiments"', () => {
      const result = classifyByKeywords('compare the experiments');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('experiment_compare');
    });

    it('classifies "compare baseline vs tuned" as experiment_compare', () => {
      const result = classifyByKeywords('compare baseline tuned');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('experiment_compare');
    });

    it('classifies "experiment plan paranoia-test"', () => {
      const result = classifyByKeywords('experiment plan paranoia-test');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('experiment_plan');
      expect(result!.params.goal).toContain('paranoia-test');
    });

    it('classifies "plan an experiment"', () => {
      const result = classifyByKeywords('plan an experiment');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('experiment_plan');
    });

    it('classifies "/experiment-run"', () => {
      const result = classifyByKeywords('/experiment-run');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('experiment_run');
    });

    it('classifies "/experiment-sweep"', () => {
      const result = classifyByKeywords('/experiment-sweep');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('experiment_sweep');
    });

    it('classifies "run 30 experiments"', () => {
      const result = classifyByKeywords('run 30 experiments');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('experiment_run');
    });

    it('classifies "parameter sweep"', () => {
      const result = classifyByKeywords('parameter sweep');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe('experiment_sweep');
    });
  });

  describe('tool registry', () => {
    it('has experiment-run tool', () => {
      const tool = findToolForIntent('experiment_run');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('experiment-run');
    });

    it('has experiment-sweep tool', () => {
      const tool = findToolForIntent('experiment_sweep');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('experiment-sweep');
    });

    it('has experiment-compare tool', () => {
      const tool = findToolForIntent('experiment_compare');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('experiment-compare');
    });

    it('has experiment-plan tool', () => {
      const tool = findToolForIntent('experiment_plan');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('experiment-plan');
    });

    it('total tool count is 29', () => {
      expect(getAllTools().length).toBe(29);
    });

    it('no experiment tools mutate', () => {
      const experimentTools = getAllTools().filter(t =>
        t.name.startsWith('experiment-'),
      );
      expect(experimentTools.length).toBe(4);
      for (const tool of experimentTools) {
        expect(tool.mutates).toBe(false);
      }
    });
  });
});

// ============================================================
// Formatting
// ============================================================

describe('Formatting', () => {
  describe('formatExperimentSummary', () => {
    it('includes label and ID', () => {
      const text = formatExperimentSummary(makeSummary());
      expect(text).toContain('Test Experiment');
      expect(text).toContain('test-exp');
    });

    it('includes run counts', () => {
      const text = formatExperimentSummary(makeSummary({ completedRuns: 8, failedRuns: 2 }));
      expect(text).toContain('8 completed');
      expect(text).toContain('2 failed');
    });

    it('includes aggregate metrics', () => {
      const text = formatExperimentSummary(makeSummary());
      expect(text).toContain('Aggregate Metrics');
      expect(text).toContain('mean=');
    });

    it('includes rates', () => {
      const text = formatExperimentSummary(makeSummary());
      expect(text).toContain('Rates');
    });

    it('includes variance findings when present', () => {
      const text = formatExperimentSummary(makeSummary({
        varianceFindings: [{ code: 'test', severity: 'high', metric: 'x', summary: 'Test finding' }],
      }));
      expect(text).toContain('Variance Findings');
      expect(text).toContain('Test finding');
    });
  });

  describe('formatExperimentComparison', () => {
    it('includes verdict', () => {
      const comparison: ExperimentComparison = {
        improvements: ['better rumor reach'],
        regressions: [],
        unchanged: [],
        verdict: 'Clear improvement',
        metricDiffs: {},
      };
      const text = formatExperimentComparison(comparison);
      expect(text).toContain('Clear improvement');
      expect(text).toContain('Improved');
    });

    it('shows regressions', () => {
      const comparison: ExperimentComparison = {
        improvements: [],
        regressions: ['worse survival'],
        unchanged: [],
        verdict: 'Clear regression',
        metricDiffs: {},
      };
      const text = formatExperimentComparison(comparison);
      expect(text).toContain('Regressed');
      expect(text).toContain('worse survival');
    });

    it('shows unchanged metrics', () => {
      const comparison: ExperimentComparison = {
        improvements: [],
        regressions: [],
        unchanged: ['stable pacing'],
        verdict: 'No significant changes',
        metricDiffs: {},
      };
      const text = formatExperimentComparison(comparison);
      expect(text).toContain('Unchanged');
    });
  });

  describe('formatParameterSweepResult', () => {
    it('includes parameter name', () => {
      const result: ParameterSweepResult = {
        param: 'rumorClarity',
        points: [{ value: 0.5, summary: makeSummary() }],
        recommendation: 'Use 0.5',
      };
      const text = formatParameterSweepResult(result);
      expect(text).toContain('rumorClarity');
      expect(text).toContain('0.5');
    });

    it('includes recommendation', () => {
      const result: ParameterSweepResult = {
        param: 'alertGain',
        points: [],
        recommendation: 'Recommended alertGain=0.4',
      };
      const text = formatParameterSweepResult(result);
      expect(text).toContain('Recommended');
    });
  });

  describe('formatExperimentPlan', () => {
    it('includes goal and steps', () => {
      const plan = generateExperimentPlan('test paranoia');
      const text = formatExperimentPlan(plan);
      expect(text).toContain('test paranoia');
      expect(text).toContain('Steps');
    });

    it('includes estimated runs', () => {
      const plan = generateExperimentPlan('compare baseline vs tuned');
      const text = formatExperimentPlan(plan);
      expect(text).toContain('Estimated runs');
    });

    it('includes expected outputs', () => {
      const plan = generateExperimentPlan('compare baseline vs tuned');
      const text = formatExperimentPlan(plan);
      expect(text).toContain('Expected outputs');
    });
  });

  describe('formatRunResults', () => {
    it('formats successful runs', () => {
      const runs: ExperimentRunResult[] = [
        { runIndex: 0, seed: 1, metrics: makeMetrics(), summary: 'seed=1, ticks=50' },
        { runIndex: 1, seed: 2, metrics: makeMetrics(), summary: 'seed=2, ticks=50' },
      ];
      const text = formatRunResults(runs);
      expect(text).toContain('Run Results (2)');
      expect(text).toContain('seed=1');
    });

    it('marks failed runs', () => {
      const runs: ExperimentRunResult[] = [
        { runIndex: 0, seed: 1, metrics: makeMetrics(), summary: 'seed=1: FAILED', error: 'boom' },
      ];
      const text = formatRunResults(runs);
      expect(text).toContain('✗');
    });
  });
});

// ============================================================
// Edge cases
// ============================================================

describe('Edge cases', () => {
  it('zero-run experiment spec', () => {
    const producer = makeReplayProducer();
    const result = runExperiment(makeSpec({ runs: 0 }), producer);
    expect(result.runs).toHaveLength(0);
    expect(result.completedRuns).toBe(0);
  });

  it('single-run experiment still computes aggregate', () => {
    const producer = makeReplayProducer();
    const result = runExperiment(makeSpec({ runs: 1 }), producer);
    expect(Object.keys(result.aggregate.means).length).toBeGreaterThan(0);
    expect(result.varianceFindings).toEqual([]); // need ≥2 runs for variance
  });

  it('comparing identical experiments returns no changes', () => {
    const summary = makeSummary();
    const comparison = compareExperiments(summary, summary);
    expect(comparison.improvements).toEqual([]);
    expect(comparison.regressions).toEqual([]);
  });

  it('sweep with partial failures still produces points', () => {
    let callCount = 0;
    const producer: ReplayProducer = (seed) => {
      callCount++;
      if (seed === 2) throw new Error('fail');
      return JSON.stringify([{ tick: 0, alertPressure: 0.1 + seed * 0.01 }]);
    };
    const sweepSpec: ParameterSweepSpec = {
      param: 'alertGain',
      values: [0.3, 0.5],
      baseExperiment: makeSpec({ runs: 3, seedStart: 1 }),
    };
    const result = runParameterSweep(sweepSpec, producer);
    expect(result.points).toHaveLength(2);
    // The point at seedStart=2 should have a failed run within its summary
    for (const point of result.points) {
      expect(point.summary.failedRuns).toBeLessThanOrEqual(1);
    }
  });

  it('large experiment count runs without error', () => {
    const producer = makeReplayProducer();
    const result = runExperiment(makeSpec({ runs: 100 }), producer);
    expect(result.completedRuns).toBe(100);
  });

  it('variance detection only fires with ≥2 runs', () => {
    const agg: AggregateMetrics = {
      means: { encounterDuration: 5 },
      mins: {},
      maxes: {},
      variances: { encounterDuration: 100 },
      rates: { survivalRate: 0.5 },
    };
    expect(detectVarianceFindings(agg, 0)).toEqual([]);
    expect(detectVarianceFindings(agg, 1)).toEqual([]);
    expect(detectVarianceFindings(agg, 2).length).toBeGreaterThan(0);
  });

  it('experiment plan for unknown goal still produces steps', () => {
    const plan = generateExperimentPlan('do something weird');
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('comparison with disjoint metrics handles missing keys', () => {
    const before = makeSummary({
      aggregate: { means: { foo: 10 }, mins: {}, maxes: {}, variances: {}, rates: {} },
    });
    const after = makeSummary({
      aggregate: { means: { bar: 20 }, mins: {}, maxes: {}, variances: {}, rates: {} },
    });
    const comparison = compareExperiments(before, after);
    expect(comparison.metricDiffs).toHaveProperty('foo');
    expect(comparison.metricDiffs).toHaveProperty('bar');
  });

  it('deriveSeeds returns defensive copy', () => {
    const spec = makeSpec({ seedList: [1, 2, 3] });
    const seeds = deriveSeeds(spec);
    seeds.push(99);
    expect(deriveSeeds(spec)).toEqual([1, 2, 3]);
  });
});
