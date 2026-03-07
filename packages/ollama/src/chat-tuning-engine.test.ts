// Tests — chat tuning engine: guided tuning (v1.7.0)

import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateConfigPatches,
  predictImpact,
  bundleFindings,
  buildPatchPreview,
  generateOperationalPlan,
  buildDesignImpact,
  previewTuningStep,
  generatePatchYaml,
  formatConfigPatch,
  formatPatchPreview,
  formatTuningBundles,
  formatReplayImpact,
  formatDesignImpact,
} from './chat-tuning-engine.js';
import type {
  ConfigPatch,
  ReplayImpactPrediction,
  TuningBundle,
  PatchPreview,
  DesignImpactComparison,
} from './chat-tuning-engine.js';
import type {
  BalanceFinding,
  BalanceAnalysis,
  SuggestedFix,
  ScenarioComparison,
  DimensionChange,
  DesignIntent,
  TuningPlan,
  TuningState,
} from './chat-balance-analyzer.js';
import { createTuningState } from './chat-balance-analyzer.js';
import type { DesignSession } from './session.js';

// --- Helpers ---

function makeSession(overrides: Partial<DesignSession> = {}): DesignSession {
  return {
    name: 'tuning-test',
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

function makeFinding(overrides: Partial<BalanceFinding> = {}): BalanceFinding {
  return {
    code: 'DIFFICULTY_FLAT',
    summary: 'Alert never escalated beyond 0.3',
    area: 'district.market',
    severity: 'medium',
    category: 'escalation',
    likelyCause: 'alertPressure gain too low',
    ...overrides,
  } as BalanceFinding;
}

function makeFix(overrides: Partial<SuggestedFix> = {}): SuggestedFix {
  return {
    code: 'increase_alert_sensitivity',
    target: 'district.escalation.alertPressure',
    reason: 'Alert never escalated.',
    expectedImpact: 'Escalation becomes more responsive.',
    confidence: 0.75,
    findingCode: 'DIFFICULTY_FLAT',
    ...overrides,
  } as SuggestedFix;
}

function makeAnalysis(overrides: Partial<BalanceAnalysis> = {}): BalanceAnalysis {
  return {
    metrics: {
      escalationCurve: { values: [0.1, 0.2, 0.3], escalated: false },
      hostilityCurve: { values: [0.1, 0.15], escalated: false },
      rumorReachCount: 1,
      encounterTickCount: 5,
      hostilityPeak: 0.15,
      escalationPhases: 0,
    },
    findings: [makeFinding()],
    summary: 'Low escalation.',
    ...overrides,
  } as BalanceAnalysis;
}

function makeComparison(overrides: Partial<ScenarioComparison> = {}): ScenarioComparison {
  return {
    before: {
      escalationCurve: { values: [0.1, 0.2], escalated: false },
      hostilityCurve: { values: [0.1], escalated: false },
      rumorReachCount: 1,
      encounterTickCount: 3,
      hostilityPeak: 0.1,
      escalationPhases: 0,
    },
    after: {
      escalationCurve: { values: [0.3, 0.5, 0.7], escalated: true },
      hostilityCurve: { values: [0.2, 0.4], escalated: false },
      rumorReachCount: 3,
      encounterTickCount: 8,
      hostilityPeak: 0.4,
      escalationPhases: 2,
    },
    changes: [
      { dimension: 'escalation pacing', direction: 'improved', description: 'Escalation now reaches meaningful levels' },
      { dimension: 'rumor spread', direction: 'improved', description: 'Rumors now propagate across factions' },
    ] as DimensionChange[],
    verdict: 'improved',
    summary: 'Significant improvement in escalation and rumor dynamics.',
    ...overrides,
  } as ScenarioComparison;
}

// ============================================================
// P1: Config patch generation
// ============================================================

describe('generateConfigPatches', () => {
  it('generates patch for increase_alert_sensitivity', () => {
    const fix = makeFix({ code: 'increase_alert_sensitivity', target: 'district.escalation.alertPressure' });
    const patches = generateConfigPatches(fix);
    expect(patches).toHaveLength(1);
    expect(patches[0].path).toBe('district.escalation');
    expect(patches[0].field).toBe('alertGain');
    expect(patches[0].oldValue).toBe(0.25);
    expect(patches[0].newValue).toBe(0.40);
    expect(patches[0].unit).toBe('per tick');
  });

  it('generates patch for reduce_alert_gain', () => {
    const fix = makeFix({ code: 'reduce_alert_gain', target: 'district.market.alertGain' });
    const patches = generateConfigPatches(fix);
    expect(patches).toHaveLength(1);
    expect(patches[0].field).toBe('alertGain');
    expect(patches[0].oldValue).toBe(0.40);
    expect(patches[0].newValue).toBe(0.30);
  });

  it('generates patch for add_rumor_path', () => {
    const fix = makeFix({ code: 'add_rumor_path', target: 'faction.guild.rumorPropagation' });
    const patches = generateConfigPatches(fix);
    expect(patches).toHaveLength(1);
    expect(patches[0].field).toBe('rumorClarity');
    expect(patches[0].oldValue).toBe(0.55);
    expect(patches[0].newValue).toBe(0.70);
  });

  it('generates patch for increase_hostility_decay', () => {
    const fix = makeFix({ code: 'increase_hostility_decay', target: 'faction.guild.hostilityDecay' });
    const patches = generateConfigPatches(fix);
    expect(patches).toHaveLength(1);
    expect(patches[0].field).toBe('hostilityDecay');
    expect(patches[0].newValue).toBe(0.15);
  });

  it('generates patch for connect_stability_events', () => {
    const fix = makeFix({ code: 'connect_stability_events', target: 'district.market.stabilityEvents' });
    const patches = generateConfigPatches(fix);
    expect(patches).toHaveLength(1);
    expect(patches[0].field).toBe('stabilityReactivity');
    expect(patches[0].newValue).toBe(0.30);
  });

  it('generates patch for lower_escalation_threshold', () => {
    const fix = makeFix({ code: 'lower_escalation_threshold', target: 'encounter.ambush.escalationThreshold' });
    const patches = generateConfigPatches(fix);
    expect(patches).toHaveLength(1);
    expect(patches[0].field).toBe('escalationThreshold');
    expect(patches[0].oldValue).toBe(0.70);
    expect(patches[0].newValue).toBe(0.55);
  });

  it('generates patch for review_escalation_mechanics', () => {
    const fix = makeFix({ code: 'review_escalation_mechanics', target: 'district.market.escalation' });
    const patches = generateConfigPatches(fix);
    expect(patches).toHaveLength(1);
    expect(patches[0].field).toBe('escalationGain');
    expect(patches[0].newValue).toBe(0.25);
  });

  it('returns empty array for unknown fix code', () => {
    const fix = makeFix({ code: 'unknown_fix' });
    expect(generateConfigPatches(fix)).toEqual([]);
  });

  it('extracts path correctly from multi-segment target', () => {
    const fix = makeFix({ code: 'increase_alert_sensitivity', target: 'a.b.c.d' });
    const patches = generateConfigPatches(fix);
    expect(patches[0].path).toBe('a.b.c');
  });

  it('handles single-segment target gracefully', () => {
    const fix = makeFix({ code: 'increase_alert_sensitivity', target: 'district' });
    const patches = generateConfigPatches(fix);
    expect(patches[0].path).toBe('district');
  });
});

// ============================================================
// P4: Impact prediction
// ============================================================

describe('predictImpact', () => {
  it('predicts impact for alert sensitivity increase', () => {
    const patches: ConfigPatch[] = [{ path: 'district.escalation', field: 'alertGain', oldValue: 0.25, newValue: 0.40 }];
    const impact = predictImpact(patches, ['increase_alert_sensitivity']);
    expect(impact.escalationTiming).toContain('ticks earlier');
    expect(impact.hostilityCurve).toBe('may rise during escalation phases');
    expect(impact.overallDirection).toBe('improvement');
    expect(impact.confidence).toBeGreaterThan(0);
  });

  it('predicts impact for alert gain reduction', () => {
    const patches: ConfigPatch[] = [{ path: 'district.market', field: 'alertGain', oldValue: 0.40, newValue: 0.30 }];
    const impact = predictImpact(patches, ['reduce_alert_gain']);
    expect(impact.escalationTiming).toContain('ticks later');
    expect(impact.hostilityCurve).toBe('slightly reduced during escalation');
  });

  it('predicts impact for rumor path addition', () => {
    const patches: ConfigPatch[] = [{ path: 'faction.guild', field: 'rumorClarity', oldValue: 0.55, newValue: 0.70 }];
    const impact = predictImpact(patches, ['add_rumor_path']);
    expect(impact.rumorReach).toContain('+1 faction');
  });

  it('predicts impact for hostility decay increase', () => {
    const patches: ConfigPatch[] = [{ path: 'faction.guild', field: 'hostilityDecay', oldValue: 0.05, newValue: 0.15 }];
    const impact = predictImpact(patches, ['increase_hostility_decay']);
    expect(impact.hostilityCurve).toContain('peak reduced');
  });

  it('predicts impact for stability events', () => {
    const patches: ConfigPatch[] = [{ path: 'district.market', field: 'stabilityReactivity', oldValue: 0.10, newValue: 0.30 }];
    const impact = predictImpact(patches, ['connect_stability_events']);
    expect(impact.encounterDuration).toContain('stability events');
  });

  it('predicts impact for escalation threshold lowering', () => {
    const patches: ConfigPatch[] = [{ path: 'encounter.ambush', field: 'escalationThreshold', oldValue: 0.70, newValue: 0.55 }];
    const impact = predictImpact(patches, ['lower_escalation_threshold']);
    expect(impact.encounterDuration).toContain('more readily');
  });

  it('predicts impact for escalation mechanics review', () => {
    const patches: ConfigPatch[] = [{ path: 'district.market', field: 'escalationGain', oldValue: 0.15, newValue: 0.25 }];
    const impact = predictImpact(patches, ['review_escalation_mechanics']);
    expect(impact.escalationTiming).toContain('ticks earlier');
    expect(impact.hostilityCurve).toContain('more pronounced');
  });

  it('returns unchanged for empty patches', () => {
    const impact = predictImpact([]);
    expect(impact.overallDirection).toBe('uncertain');
    expect(impact.confidence).toBe(0);
    expect(impact.rumorReach).toBe('unchanged');
    expect(impact.explanation).toContain('No patches');
  });

  it('increases confidence with more patches', () => {
    const p1: ConfigPatch[] = [{ path: 'a', field: 'f', oldValue: 0, newValue: 1 }];
    const p3: ConfigPatch[] = [
      { path: 'a', field: 'f', oldValue: 0, newValue: 1 },
      { path: 'b', field: 'g', oldValue: 0, newValue: 1 },
      { path: 'c', field: 'h', oldValue: 0, newValue: 1 },
    ];
    const i1 = predictImpact(p1, ['increase_alert_sensitivity']);
    const i3 = predictImpact(p3, ['increase_alert_sensitivity', 'add_rumor_path', 'connect_stability_events']);
    expect(i3.confidence).toBeGreaterThan(i1.confidence);
  });

  it('caps confidence at 0.85', () => {
    const patches = Array.from({ length: 10 }, (_, i) => ({
      path: `p${i}`, field: 'f', oldValue: 0, newValue: 1,
    }));
    const impact = predictImpact(patches);
    expect(impact.confidence).toBeLessThanOrEqual(0.85);
  });

  it('works without fix codes', () => {
    const patches: ConfigPatch[] = [{ path: 'a', field: 'f', oldValue: 0, newValue: 1 }];
    const impact = predictImpact(patches);
    expect(impact.overallDirection).toBeDefined();
    expect(impact.explanation).toContain('1 patch');
  });
});

// ============================================================
// P2: Fix bundling
// ============================================================

describe('bundleFindings', () => {
  it('bundles escalation findings together', () => {
    const findings = [
      makeFinding({ code: 'DIFFICULTY_FLAT', category: 'escalation' }),
      makeFinding({ code: 'ESCALATION_TOO_FAST', category: 'escalation' }),
    ];
    const fixes = [
      makeFix({ code: 'increase_alert_sensitivity', findingCode: 'DIFFICULTY_FLAT' }),
      makeFix({ code: 'reduce_alert_gain', findingCode: 'ESCALATION_TOO_FAST' }),
    ];
    const bundles = bundleFindings(findings, fixes);
    expect(bundles).toHaveLength(1);
    expect(bundles[0].code).toBe('escalation_tuning');
    expect(bundles[0].findingCodes).toContain('DIFFICULTY_FLAT');
    expect(bundles[0].findingCodes).toContain('ESCALATION_TOO_FAST');
    expect(bundles[0].fixCodes).toHaveLength(2);
    expect(bundles[0].patches.length).toBeGreaterThanOrEqual(2);
  });

  it('bundles rumor flow findings', () => {
    const findings = [makeFinding({ code: 'RUMOR_NO_SPREAD', category: 'rumor_flow' })];
    const fixes = [makeFix({ code: 'add_rumor_path', findingCode: 'RUMOR_NO_SPREAD' })];
    const bundles = bundleFindings(findings, fixes);
    expect(bundles).toHaveLength(1);
    expect(bundles[0].code).toBe('rumor_flow_fix');
    expect(bundles[0].name).toBe('Rumor Flow Fix');
  });

  it('bundles faction dynamics findings', () => {
    const findings = [makeFinding({ code: 'HOSTILITY_PINNED', category: 'faction_dynamics' })];
    const fixes = [makeFix({ code: 'increase_hostility_decay', findingCode: 'HOSTILITY_PINNED' })];
    const bundles = bundleFindings(findings, fixes);
    expect(bundles).toHaveLength(1);
    expect(bundles[0].code).toBe('faction_dynamics_fix');
  });

  it('bundles district stability findings', () => {
    const findings = [makeFinding({ code: 'STABILITY_INERT', category: 'district_stability' })];
    const fixes = [makeFix({ code: 'connect_stability_events', findingCode: 'STABILITY_INERT' })];
    const bundles = bundleFindings(findings, fixes);
    expect(bundles).toHaveLength(1);
    expect(bundles[0].code).toBe('district_stability_fix');
  });

  it('bundles encounter design findings', () => {
    const findings = [makeFinding({ code: 'ENCOUNTER_NO_ESCALATION', category: 'encounter_design' })];
    const fixes = [makeFix({ code: 'lower_escalation_threshold', findingCode: 'ENCOUNTER_NO_ESCALATION' })];
    const bundles = bundleFindings(findings, fixes);
    expect(bundles).toHaveLength(1);
    expect(bundles[0].code).toBe('encounter_design_fix');
  });

  it('creates multiple bundles for mixed findings', () => {
    const findings = [
      makeFinding({ code: 'DIFFICULTY_FLAT', category: 'escalation' }),
      makeFinding({ code: 'RUMOR_NO_SPREAD', category: 'rumor_flow' }),
      makeFinding({ code: 'HOSTILITY_PINNED', category: 'faction_dynamics' }),
    ];
    const fixes = [
      makeFix({ code: 'increase_alert_sensitivity', findingCode: 'DIFFICULTY_FLAT' }),
      makeFix({ code: 'add_rumor_path', findingCode: 'RUMOR_NO_SPREAD' }),
      makeFix({ code: 'increase_hostility_decay', findingCode: 'HOSTILITY_PINNED' }),
    ];
    const bundles = bundleFindings(findings, fixes);
    expect(bundles).toHaveLength(3);
    const codes = bundles.map(b => b.code);
    expect(codes).toContain('escalation_tuning');
    expect(codes).toContain('rumor_flow_fix');
    expect(codes).toContain('faction_dynamics_fix');
  });

  it('returns empty array when no findings', () => {
    expect(bundleFindings([], [])).toEqual([]);
  });

  it('skips findings without matching fixes', () => {
    const findings = [makeFinding({ code: 'DIFFICULTY_FLAT', category: 'escalation' })];
    const fixes: SuggestedFix[] = [];
    expect(bundleFindings(findings, fixes)).toEqual([]);
  });

  it('includes impact prediction for each bundle', () => {
    const findings = [makeFinding({ code: 'DIFFICULTY_FLAT', category: 'escalation' })];
    const fixes = [makeFix({ code: 'increase_alert_sensitivity', findingCode: 'DIFFICULTY_FLAT' })];
    const bundles = bundleFindings(findings, fixes);
    expect(bundles[0].impact).toBeDefined();
    expect(bundles[0].impact.overallDirection).toBeDefined();
    expect(bundles[0].impact.confidence).toBeGreaterThan(0);
  });

  it('skips categories not in BUNDLE_TEMPLATES', () => {
    const findings = [makeFinding({ code: 'CUSTOM', category: 'unknown_category' as any })];
    const fixes = [makeFix({ code: 'increase_alert_sensitivity', findingCode: 'CUSTOM' })];
    expect(bundleFindings(findings, fixes)).toEqual([]);
  });

  it('groups difficulty and escalation into same bundle', () => {
    const findings = [
      makeFinding({ code: 'DIFFICULTY_FLAT', category: 'difficulty' as any }),
      makeFinding({ code: 'ESCALATION_TOO_FAST', category: 'escalation' }),
    ];
    const fixes = [
      makeFix({ code: 'increase_alert_sensitivity', findingCode: 'DIFFICULTY_FLAT' }),
      makeFix({ code: 'reduce_alert_gain', findingCode: 'ESCALATION_TOO_FAST' }),
    ];
    const bundles = bundleFindings(findings, fixes);
    expect(bundles).toHaveLength(1);
    expect(bundles[0].code).toBe('escalation_tuning');
  });
});

// ============================================================
// P3: Patch preview
// ============================================================

describe('buildPatchPreview', () => {
  it('builds preview from findings and fixes', () => {
    const findings = [makeFinding()];
    const fixes = [makeFix()];
    const preview = buildPatchPreview('increase paranoia', findings, fixes, makeSession());
    expect(preview.goal).toBe('increase paranoia');
    expect(preview.patches.length).toBeGreaterThan(0);
    expect(preview.bundles.length).toBeGreaterThan(0);
    expect(preview.impact).toBeDefined();
    expect(preview.commands.length).toBeGreaterThan(0);
  });

  it('includes commands for each patch', () => {
    const findings = [makeFinding()];
    const fixes = [makeFix()];
    const preview = buildPatchPreview('tune', findings, fixes, null);
    for (const cmd of preview.commands) {
      expect(cmd).toContain('adjust');
      expect(cmd).toContain('→');
    }
  });

  it('warns when no bundles available', () => {
    const preview = buildPatchPreview('tune', [], [], null);
    expect(preview.warnings.some(w => w.includes('No fix bundles'))).toBe(true);
  });

  it('warns when no session', () => {
    const findings = [makeFinding()];
    const fixes = [makeFix()];
    const preview = buildPatchPreview('tune', findings, fixes, null);
    expect(preview.warnings.some(w => w.includes('No active session'))).toBe(true);
  });

  it('warns when no patches generated', () => {
    const preview = buildPatchPreview('tune', [], [], makeSession());
    expect(preview.warnings.some(w => w.includes('No concrete patches'))).toBe(true);
  });

  it('aggregates patches from all bundles', () => {
    const findings = [
      makeFinding({ code: 'DIFFICULTY_FLAT', category: 'escalation' }),
      makeFinding({ code: 'RUMOR_NO_SPREAD', category: 'rumor_flow' }),
    ];
    const fixes = [
      makeFix({ code: 'increase_alert_sensitivity', findingCode: 'DIFFICULTY_FLAT' }),
      makeFix({ code: 'add_rumor_path', findingCode: 'RUMOR_NO_SPREAD' }),
    ];
    const preview = buildPatchPreview('increase paranoia', findings, fixes, makeSession());
    expect(preview.patches).toHaveLength(2);
    expect(preview.bundles).toHaveLength(2);
  });

  it('includes aggregate impact across all bundles', () => {
    const findings = [
      makeFinding({ code: 'DIFFICULTY_FLAT', category: 'escalation' }),
      makeFinding({ code: 'RUMOR_NO_SPREAD', category: 'rumor_flow' }),
    ];
    const fixes = [
      makeFix({ code: 'increase_alert_sensitivity', findingCode: 'DIFFICULTY_FLAT' }),
      makeFix({ code: 'add_rumor_path', findingCode: 'RUMOR_NO_SPREAD' }),
    ];
    const preview = buildPatchPreview('tune', findings, fixes, null);
    expect(preview.impact.confidence).toBeGreaterThan(0);
    expect(preview.impact.explanation).toContain('2 patch');
  });
});

// ============================================================
// P1 (enhanced): Operational plan generation
// ============================================================

describe('generateOperationalPlan', () => {
  it('falls back to content-creation plan without analysis', () => {
    const plan = generateOperationalPlan('increase paranoia', makeSession(), null);
    expect(plan.goal).toBe('increase paranoia');
    expect(plan.steps.length).toBeGreaterThan(0);
    // Content-creation plans use scaffold/critique-style steps
    const intents = plan.steps.map(s => s.intent);
    expect(intents.some(i => i === 'scaffold' || i === 'critique')).toBe(true);
  });

  it('falls back when analysis has no findings', () => {
    const analysis = makeAnalysis({ findings: [] });
    const plan = generateOperationalPlan('tune', makeSession(), analysis);
    const intents = plan.steps.map(s => s.intent);
    expect(intents.some(i => i === 'scaffold' || i === 'critique')).toBe(true);
  });

  it('generates operational plan when analysis is available', () => {
    const analysis = makeAnalysis({
      findings: [makeFinding({ code: 'DIFFICULTY_FLAT', category: 'escalation' })],
    });
    const plan = generateOperationalPlan('increase paranoia', makeSession(), analysis);
    expect(plan.goal).toBe('increase paranoia');
    const intents = plan.steps.map(s => s.intent);
    expect(intents).toContain('tune_preview');
    expect(intents).toContain('tune_apply');
    expect(intents).toContain('compare_scenarios');
  });

  it('includes preview step as first step', () => {
    const analysis = makeAnalysis();
    const plan = generateOperationalPlan('tune', makeSession(), analysis);
    expect(plan.steps[0].intent).toBe('tune_preview');
    expect(plan.steps[0].command).toBe('preview-patches');
  });

  it('includes verify step as last step', () => {
    const analysis = makeAnalysis();
    const plan = generateOperationalPlan('tune', makeSession(), analysis);
    const last = plan.steps[plan.steps.length - 1];
    expect(last.intent).toBe('compare_scenarios');
    expect(last.command).toBe('compare-scenarios');
  });

  it('creates one apply step per bundle', () => {
    const findings = [
      makeFinding({ code: 'DIFFICULTY_FLAT', category: 'escalation' }),
      makeFinding({ code: 'RUMOR_NO_SPREAD', category: 'rumor_flow' }),
    ];
    const analysis = makeAnalysis({ findings });
    const plan = generateOperationalPlan('tune', makeSession(), analysis);
    const applySteps = plan.steps.filter(s => s.intent === 'tune_apply');
    expect(applySteps).toHaveLength(2);
  });

  it('sets sequential dependencies', () => {
    const analysis = makeAnalysis();
    const plan = generateOperationalPlan('tune', makeSession(), analysis);
    // Each step after the first should depend on the previous
    for (let i = 1; i < plan.steps.length; i++) {
      expect(plan.steps[i].dependencies).toContain(plan.steps[i - 1].id);
    }
  });

  it('stores patches in apply step params', () => {
    const analysis = makeAnalysis();
    const plan = generateOperationalPlan('tune', makeSession(), analysis);
    const applyStep = plan.steps.find(s => s.intent === 'tune_apply');
    expect(applyStep).toBeDefined();
    expect(applyStep!.params.patches).toBeDefined();
    const patches = JSON.parse(applyStep!.params.patches);
    expect(Array.isArray(patches)).toBe(true);
    expect(patches.length).toBeGreaterThan(0);
  });

  it('stores impact in apply step params', () => {
    const analysis = makeAnalysis();
    const plan = generateOperationalPlan('tune', makeSession(), analysis);
    const applyStep = plan.steps.find(s => s.intent === 'tune_apply');
    expect(applyStep!.params.impact).toBeDefined();
    const impact = JSON.parse(applyStep!.params.impact);
    expect(impact.overallDirection).toBeDefined();
  });

  it('includes bundle code and name in apply params', () => {
    const analysis = makeAnalysis();
    const plan = generateOperationalPlan('tune', makeSession(), analysis);
    const applyStep = plan.steps.find(s => s.intent === 'tune_apply');
    expect(applyStep!.params.bundleCode).toBeDefined();
    expect(applyStep!.params.bundleName).toBeDefined();
  });

  it('all steps start with pending status', () => {
    const analysis = makeAnalysis();
    const plan = generateOperationalPlan('tune', makeSession(), analysis);
    for (const step of plan.steps) {
      expect(step.status).toBe('pending');
    }
  });

  it('warns when no session provided', () => {
    const analysis = makeAnalysis();
    const plan = generateOperationalPlan('tune', null, analysis);
    expect(plan.warnings.some(w => w.includes('No active session'))).toBe(true);
  });

  it('falls back when bundles would be empty', () => {
    const findings = [makeFinding({ code: 'UNKNOWN', category: 'general' as any })];
    const analysis = makeAnalysis({ findings });
    const plan = generateOperationalPlan('tune', makeSession(), analysis);
    // Should fall back to content-creation plan
    const intents = plan.steps.map(s => s.intent);
    expect(intents.some(i => i === 'scaffold' || i === 'critique')).toBe(true);
  });

  it('has unique step IDs', () => {
    const analysis = makeAnalysis({
      findings: [
        makeFinding({ code: 'DIFFICULTY_FLAT', category: 'escalation' }),
        makeFinding({ code: 'RUMOR_NO_SPREAD', category: 'rumor_flow' }),
      ],
    });
    const plan = generateOperationalPlan('tune', makeSession(), analysis);
    const ids = plan.steps.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ============================================================
// P5: Design impact comparison
// ============================================================

describe('buildDesignImpact', () => {
  it('groups improved changes', () => {
    const comparison = makeComparison();
    const dic = buildDesignImpact(comparison);
    const improved = dic.sections.find(s => s.category === 'improved');
    expect(improved).toBeDefined();
    expect(improved!.items.length).toBe(2);
  });

  it('groups unchanged dimensions', () => {
    const comparison = makeComparison();
    const dic = buildDesignImpact(comparison);
    const unchanged = dic.sections.find(s => s.category === 'unchanged');
    expect(unchanged).toBeDefined();
    expect(unchanged!.items.length).toBeGreaterThan(0);
  });

  it('groups regressed changes', () => {
    const comparison = makeComparison({
      changes: [
        { dimension: 'escalation pacing', direction: 'regressed', description: 'Escalation worsened' },
      ] as DimensionChange[],
    });
    const dic = buildDesignImpact(comparison);
    const regression = dic.sections.find(s => s.category === 'regression');
    expect(regression).toBeDefined();
    expect(regression!.items.length).toBe(1);
  });

  it('fills in dimensions not in changes as unchanged', () => {
    const comparison = makeComparison({ changes: [] });
    const dic = buildDesignImpact(comparison);
    const unchanged = dic.sections.find(s => s.category === 'unchanged');
    expect(unchanged!.items.length).toBe(6);
  });

  it('includes intent target mood in summary when provided', () => {
    const intent: DesignIntent = {
      targetMood: 'paranoid and threatening',
      desiredOutcomes: [],
      notes: [],
    };
    const comparison = makeComparison();
    const dic = buildDesignImpact(comparison, intent);
    expect(dic.summary).toContain('paranoid and threatening');
  });

  it('omits mood from summary when no intent provided', () => {
    const dic = buildDesignImpact(makeComparison());
    expect(dic.summary).not.toContain('target mood');
  });

  it('verdict passes through from comparison', () => {
    const dic1 = buildDesignImpact(makeComparison({ verdict: 'improved' }));
    expect(dic1.verdict).toBe('improved');
    const dic2 = buildDesignImpact(makeComparison({ verdict: 'regressed' }));
    expect(dic2.verdict).toBe('regressed');
  });

  it('summary includes counts', () => {
    const dic = buildDesignImpact(makeComparison());
    expect(dic.summary).toContain('2 improvement(s)');
    expect(dic.summary).toContain('regression(s)');
  });

  it('handles mixed results', () => {
    const comparison = makeComparison({
      changes: [
        { dimension: 'escalation pacing', direction: 'improved', description: 'Better' },
        { dimension: 'encounter duration', direction: 'regressed', description: 'Worse' },
      ] as DimensionChange[],
      verdict: 'mixed',
    });
    const dic = buildDesignImpact(comparison);
    expect(dic.sections.some(s => s.category === 'improved')).toBe(true);
    expect(dic.sections.some(s => s.category === 'regression')).toBe(true);
    expect(dic.verdict).toBe('mixed');
  });

  it('handles empty comparison gracefully', () => {
    const comparison = makeComparison({ changes: [], verdict: 'unchanged' });
    const dic = buildDesignImpact(comparison);
    expect(dic.sections.length).toBeGreaterThan(0);
    expect(dic.verdict).toBe('unchanged');
  });
});

// ============================================================
// P6: Step preview
// ============================================================

describe('previewTuningStep', () => {
  function makeOperationalState(): TuningState {
    const plan: TuningPlan = {
      goal: 'test',
      steps: [
        {
          id: 1,
          description: 'preview-patches',
          command: 'preview-patches',
          intent: 'tune_preview',
          params: { patchCount: '1', bundleCount: '1' },
          dependencies: [],
          expectedEffect: 'Preview patches.',
          status: 'pending',
        },
        {
          id: 2,
          description: 'apply-patch — Escalation Tuning',
          command: 'apply-patch',
          intent: 'tune_apply',
          params: {
            bundleCode: 'escalation_tuning',
            bundleName: 'Escalation Tuning',
            patches: JSON.stringify([{ path: 'district.escalation', field: 'alertGain', oldValue: 0.25, newValue: 0.40, unit: 'per tick' }]),
            impact: JSON.stringify({ rumorReach: 'unchanged', escalationTiming: '~5 ticks earlier', encounterDuration: 'unchanged', hostilityCurve: 'may rise', overallDirection: 'improvement', confidence: 0.6, explanation: 'test' }),
          },
          dependencies: [1],
          expectedEffect: 'Apply escalation tuning.',
          status: 'pending',
        },
      ],
      warnings: [],
    };
    return createTuningState(plan);
  }

  it('returns preview for step with patches', () => {
    const state = makeOperationalState();
    const preview = previewTuningStep(state, 2);
    expect(preview).not.toBeNull();
    expect(preview!.patches).toHaveLength(1);
    expect(preview!.patches[0].field).toBe('alertGain');
  });

  it('returns impact from step params', () => {
    const state = makeOperationalState();
    const preview = previewTuningStep(state, 2);
    expect(preview!.impact.escalationTiming).toBe('~5 ticks earlier');
    expect(preview!.impact.overallDirection).toBe('improvement');
  });

  it('returns null for nonexistent step', () => {
    const state = makeOperationalState();
    expect(previewTuningStep(state, 99)).toBeNull();
  });

  it('generates commands for each patch', () => {
    const state = makeOperationalState();
    const preview = previewTuningStep(state, 2);
    expect(preview!.commands).toHaveLength(1);
    expect(preview!.commands[0]).toContain('adjust');
  });

  it('warns when step has no patches', () => {
    const state = makeOperationalState();
    const preview = previewTuningStep(state, 1);
    expect(preview!.patches).toHaveLength(0);
    expect(preview!.warnings.some(w => w.includes('no config patches'))).toBe(true);
  });

  it('falls back to computed impact when params impact is invalid', () => {
    const plan: TuningPlan = {
      goal: 'test',
      steps: [{
        id: 1,
        description: 'test',
        command: 'apply-patch',
        intent: 'tune_apply',
        params: { patches: JSON.stringify([{ path: 'a', field: 'f', oldValue: 0, newValue: 1 }]), impact: 'invalid-json' },
        dependencies: [],
        expectedEffect: 'test',
        status: 'pending',
      }],
      warnings: [],
    };
    const state = createTuningState(plan);
    const preview = previewTuningStep(state, 1);
    expect(preview).not.toBeNull();
    expect(preview!.impact).toBeDefined();
  });
});

// ============================================================
// YAML generation
// ============================================================

describe('generatePatchYaml', () => {
  it('generates YAML from bundle', () => {
    const bundle: TuningBundle = {
      code: 'escalation_tuning',
      name: 'Escalation Tuning',
      description: 'Adjust escalation.',
      findingCodes: ['DIFFICULTY_FLAT'],
      fixCodes: ['increase_alert_sensitivity'],
      patches: [{ path: 'district.escalation', field: 'alertGain', oldValue: 0.25, newValue: 0.40, unit: 'per tick' }],
      impact: { rumorReach: 'unchanged', escalationTiming: '~5 ticks earlier', encounterDuration: 'unchanged', hostilityCurve: 'may rise', overallDirection: 'improvement', confidence: 0.6, explanation: 'test' },
    };
    const yaml = generatePatchYaml(bundle, 'increase paranoia');
    expect(yaml).toContain('Escalation Tuning');
    expect(yaml).toContain('increase paranoia');
    expect(yaml).toContain('DIFFICULTY_FLAT');
    expect(yaml).toContain('alertGain: 0.4');
    expect(yaml).toContain('was: 0.25');
    expect(yaml).toContain('district.escalation:');
  });

  it('includes confidence percentage', () => {
    const bundle: TuningBundle = {
      code: 'test',
      name: 'Test',
      description: 'Test',
      findingCodes: [],
      fixCodes: [],
      patches: [{ path: 'a', field: 'f', oldValue: 0, newValue: 1 }],
      impact: { rumorReach: 'unchanged', escalationTiming: 'unchanged', encounterDuration: 'unchanged', hostilityCurve: 'unchanged', overallDirection: 'uncertain', confidence: 0.72, explanation: 'test' },
    };
    const yaml = generatePatchYaml(bundle, 'test');
    expect(yaml).toContain('72%');
  });

  it('groups patches by path', () => {
    const bundle: TuningBundle = {
      code: 'test',
      name: 'Test',
      description: 'Test',
      findingCodes: [],
      fixCodes: [],
      patches: [
        { path: 'district.market', field: 'alertGain', oldValue: 0.25, newValue: 0.40 },
        { path: 'district.market', field: 'escalationGain', oldValue: 0.15, newValue: 0.25 },
        { path: 'faction.guild', field: 'hostilityDecay', oldValue: 0.05, newValue: 0.15 },
      ],
      impact: { rumorReach: 'unchanged', escalationTiming: 'unchanged', encounterDuration: 'unchanged', hostilityCurve: 'unchanged', overallDirection: 'uncertain', confidence: 0.5, explanation: 'test' },
    };
    const yaml = generatePatchYaml(bundle, 'test');
    // district.market should appear once as a header, not twice
    const marketOccurrences = yaml.split('district.market:').length - 1;
    expect(marketOccurrences).toBe(1);
    expect(yaml).toContain('faction.guild:');
  });

  it('includes unit in comment when present', () => {
    const bundle: TuningBundle = {
      code: 'test',
      name: 'Test',
      description: 'Test',
      findingCodes: [],
      fixCodes: [],
      patches: [{ path: 'a', field: 'f', oldValue: 0.25, newValue: 0.40, unit: 'per tick' }],
      impact: { rumorReach: 'unchanged', escalationTiming: 'unchanged', encounterDuration: 'unchanged', hostilityCurve: 'unchanged', overallDirection: 'uncertain', confidence: 0.5, explanation: 'test' },
    };
    const yaml = generatePatchYaml(bundle, 'test');
    expect(yaml).toContain('per tick');
  });

  it('includes direction in header', () => {
    const bundle: TuningBundle = {
      code: 'test',
      name: 'Test',
      description: 'Test',
      findingCodes: [],
      fixCodes: [],
      patches: [{ path: 'a', field: 'f', oldValue: 0, newValue: 1 }],
      impact: { rumorReach: 'unchanged', escalationTiming: 'unchanged', encounterDuration: 'unchanged', hostilityCurve: 'unchanged', overallDirection: 'improvement', confidence: 0.7, explanation: 'test' },
    };
    const yaml = generatePatchYaml(bundle, 'test');
    expect(yaml).toContain('improvement');
  });
});

// ============================================================
// Formatting
// ============================================================

describe('formatConfigPatch', () => {
  it('formats patch with unit', () => {
    const patch: ConfigPatch = { path: 'district.market', field: 'alertGain', oldValue: 0.25, newValue: 0.40, unit: 'per tick' };
    const result = formatConfigPatch(patch);
    expect(result).toContain('district.market');
    expect(result).toContain('alertGain');
    expect(result).toContain('0.25 per tick');
    expect(result).toContain('0.4 per tick');
    expect(result).toContain('→');
  });

  it('formats patch without unit', () => {
    const patch: ConfigPatch = { path: 'faction.guild', field: 'rumorClarity', oldValue: 0.55, newValue: 0.70 };
    const result = formatConfigPatch(patch);
    expect(result).toContain('faction.guild');
    expect(result).toContain('0.55');
    expect(result).toContain('0.7');
    expect(result).not.toContain('per tick');
  });
});

describe('formatPatchPreview', () => {
  it('shows goal in header', () => {
    const preview: PatchPreview = {
      goal: 'increase paranoia',
      patches: [{ path: 'a', field: 'f', oldValue: 0, newValue: 1 }],
      bundles: [],
      impact: { rumorReach: 'unchanged', escalationTiming: 'unchanged', encounterDuration: 'unchanged', hostilityCurve: 'unchanged', overallDirection: 'uncertain', confidence: 0.5, explanation: 'test' },
      commands: ['adjust a.f 0 → 1'],
      warnings: [],
    };
    const result = formatPatchPreview(preview);
    expect(result).toContain('increase paranoia');
    expect(result).toContain('Proposed Changes');
  });

  it('shows empty message when no patches', () => {
    const preview: PatchPreview = {
      goal: 'test',
      patches: [],
      bundles: [],
      impact: { rumorReach: 'unchanged', escalationTiming: 'unchanged', encounterDuration: 'unchanged', hostilityCurve: 'unchanged', overallDirection: 'uncertain', confidence: 0, explanation: 'test' },
      commands: [],
      warnings: ['No patches to preview.'],
    };
    const result = formatPatchPreview(preview);
    expect(result).toContain('No patches to preview');
  });

  it('includes bundle summary when bundles present', () => {
    const preview: PatchPreview = {
      goal: 'test',
      patches: [{ path: 'a', field: 'f', oldValue: 0, newValue: 1 }],
      bundles: [{
        code: 'test', name: 'Test Bundle', description: 'Test', findingCodes: [], fixCodes: [],
        patches: [{ path: 'a', field: 'f', oldValue: 0, newValue: 1 }],
        impact: { rumorReach: 'unchanged', escalationTiming: 'unchanged', encounterDuration: 'unchanged', hostilityCurve: 'unchanged', overallDirection: 'uncertain', confidence: 0.5, explanation: 'test' },
      }],
      impact: { rumorReach: 'unchanged', escalationTiming: 'unchanged', encounterDuration: 'unchanged', hostilityCurve: 'unchanged', overallDirection: 'uncertain', confidence: 0.5, explanation: 'test' },
      commands: [],
      warnings: [],
    };
    const result = formatPatchPreview(preview);
    expect(result).toContain('1 fix bundle');
    expect(result).toContain('Test Bundle');
  });

  it('includes confirmation prompt', () => {
    const preview: PatchPreview = {
      goal: 'test',
      patches: [{ path: 'a', field: 'f', oldValue: 0, newValue: 1 }],
      bundles: [],
      impact: { rumorReach: 'unchanged', escalationTiming: 'unchanged', encounterDuration: 'unchanged', hostilityCurve: 'unchanged', overallDirection: 'uncertain', confidence: 0.5, explanation: 'test' },
      commands: [],
      warnings: [],
    };
    const result = formatPatchPreview(preview);
    expect(result).toContain('/tune-apply');
    expect(result).toContain('Nothing changes until you confirm');
  });

  it('shows warnings when present', () => {
    const preview: PatchPreview = {
      goal: 'test',
      patches: [{ path: 'a', field: 'f', oldValue: 0, newValue: 1 }],
      bundles: [],
      impact: { rumorReach: 'unchanged', escalationTiming: 'unchanged', encounterDuration: 'unchanged', hostilityCurve: 'unchanged', overallDirection: 'uncertain', confidence: 0.5, explanation: 'test' },
      commands: [],
      warnings: ['Some warning'],
    };
    const result = formatPatchPreview(preview);
    expect(result).toContain('⚠ Some warning');
  });
});

describe('formatTuningBundles', () => {
  it('formats multiple bundles', () => {
    const bundles: TuningBundle[] = [
      {
        code: 'escalation_tuning', name: 'Escalation Tuning', description: 'Adjust escalation.',
        findingCodes: ['DIFFICULTY_FLAT'], fixCodes: ['increase_alert_sensitivity'],
        patches: [{ path: 'a', field: 'f', oldValue: 0, newValue: 1 }],
        impact: { rumorReach: 'unchanged', escalationTiming: 'unchanged', encounterDuration: 'unchanged', hostilityCurve: 'unchanged', overallDirection: 'improvement', confidence: 0.6, explanation: 'test' },
      },
      {
        code: 'rumor_flow_fix', name: 'Rumor Flow Fix', description: 'Fix rumors.',
        findingCodes: ['RUMOR_NO_SPREAD'], fixCodes: ['add_rumor_path'],
        patches: [{ path: 'b', field: 'g', oldValue: 0, newValue: 1 }],
        impact: { rumorReach: '+1', escalationTiming: 'unchanged', encounterDuration: 'unchanged', hostilityCurve: 'unchanged', overallDirection: 'improvement', confidence: 0.7, explanation: 'test' },
      },
    ];
    const result = formatTuningBundles(bundles);
    expect(result).toContain('Escalation Tuning');
    expect(result).toContain('Rumor Flow Fix');
    expect(result).toContain('2 bundle(s)');
    expect(result).toContain('2 patch(es)');
    expect(result).toContain('Fix Bundles');
  });

  it('returns helpful message when no bundles', () => {
    const result = formatTuningBundles([]);
    expect(result).toContain('No fix bundles');
    expect(result).toContain('analyze-balance');
  });

  it('shows direction and confidence', () => {
    const bundles: TuningBundle[] = [{
      code: 'test', name: 'Test', description: 'Test',
      findingCodes: [], fixCodes: [],
      patches: [],
      impact: { rumorReach: 'unchanged', escalationTiming: 'unchanged', encounterDuration: 'unchanged', hostilityCurve: 'unchanged', overallDirection: 'improvement', confidence: 0.72, explanation: 'test' },
    }];
    const result = formatTuningBundles(bundles);
    expect(result).toContain('improvement');
    expect(result).toContain('72%');
  });
});

describe('formatReplayImpact', () => {
  it('formats all fields', () => {
    const impact: ReplayImpactPrediction = {
      rumorReach: '+1 faction',
      escalationTiming: '~5 ticks earlier',
      encounterDuration: 'unchanged',
      hostilityCurve: 'peak reduced by ~10%',
      overallDirection: 'improvement',
      confidence: 0.65,
      explanation: 'test',
    };
    const result = formatReplayImpact(impact);
    expect(result).toContain('+1 faction');
    expect(result).toContain('~5 ticks earlier');
    expect(result).toContain('unchanged');
    expect(result).toContain('peak reduced');
    expect(result).toContain('improvement');
    expect(result).toContain('65%');
  });
});

describe('formatDesignImpact', () => {
  it('formats sections with icons', () => {
    const dic: DesignImpactComparison = {
      sections: [
        { category: 'improved', items: ['escalation: better pacing'] },
        { category: 'unchanged', items: ['rumor: no change'] },
        { category: 'regression', items: ['hostility: peaked higher'] },
      ],
      summary: 'Mixed results.',
      verdict: 'mixed',
    };
    const result = formatDesignImpact(dic);
    expect(result).toContain('Improved:');
    expect(result).toContain('Unchanged:');
    expect(result).toContain('Regression:');
    expect(result).toContain('+ escalation');
    expect(result).toContain('= rumor');
    expect(result).toContain('- hostility');
    expect(result).toContain('Verdict: mixed');
  });

  it('includes summary', () => {
    const dic: DesignImpactComparison = {
      sections: [{ category: 'improved', items: ['test'] }],
      summary: 'All good.',
      verdict: 'improved',
    };
    expect(formatDesignImpact(dic)).toContain('All good.');
  });
});

// ============================================================
// Router integration
// ============================================================

describe('router integration', () => {
  // We test by importing classifyByKeywords
  let classifyByKeywords: (msg: string) => import('./chat-types.js').IntentClassification | null;

  beforeAll(async () => {
    const mod = await import('./chat-router.js');
    classifyByKeywords = mod.classifyByKeywords;
  });

  it('routes "preview tuning changes" to tune_preview', () => {
    const result = classifyByKeywords('preview tuning changes');
    expect(result?.intent).toBe('tune_preview');
  });

  it('routes "apply tuning patches" to tune_apply', () => {
    const result = classifyByKeywords('apply tuning patches');
    expect(result?.intent).toBe('tune_apply');
  });

  it('routes "show fix bundles" to tune_bundles', () => {
    const result = classifyByKeywords('show fix bundles');
    expect(result?.intent).toBe('tune_bundles');
  });

  it('routes "tune-preview" to tune_preview', () => {
    const result = classifyByKeywords('tune-preview');
    expect(result?.intent).toBe('tune_preview');
  });

  it('routes "what will change" to tune_preview', () => {
    const result = classifyByKeywords('what will change');
    expect(result?.intent).toBe('tune_preview');
  });

  it('routes "confirm tuning changes" to tune_apply', () => {
    const result = classifyByKeywords('confirm tuning changes');
    expect(result?.intent).toBe('tune_apply');
  });

  it('routes "bundle the fixes" to tune_bundles', () => {
    const result = classifyByKeywords('bundle the fixes');
    expect(result?.intent).toBe('tune_bundles');
  });

  it('still routes "tune increase paranoia" to tune_goal', () => {
    const result = classifyByKeywords('tune increase paranoia');
    expect(result?.intent).toBe('tune_goal');
  });
});

// ============================================================
// Tool integration
// ============================================================

describe('tool integration', () => {
  let findToolForIntent: (intent: string) => import('./chat-types.js').ChatTool | undefined;
  let getAllTools: () => import('./chat-types.js').ChatTool[];

  beforeAll(async () => {
    const mod = await import('./chat-tools.js');
    findToolForIntent = mod.findToolForIntent;
    getAllTools = mod.getAllTools;
  });

  it('has 25 tools total', () => {
    expect(getAllTools().length).toBe(25);
  });

  it('finds tool for tune_preview', () => {
    const tool = findToolForIntent('tune_preview');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('tune-preview');
  });

  it('finds tool for tune_apply', () => {
    const tool = findToolForIntent('tune_apply');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('tune-apply');
  });

  it('finds tool for tune_bundles', () => {
    const tool = findToolForIntent('tune_bundles');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('tune-bundles');
  });

  it('tune-apply is marked as mutates', () => {
    const tool = findToolForIntent('tune_apply');
    expect(tool!.mutates).toBe(true);
  });

  it('tune-preview is not mutating', () => {
    const tool = findToolForIntent('tune_preview');
    expect(tool!.mutates).toBe(false);
  });
});

// ============================================================
// Session event kinds
// ============================================================

describe('session event kinds', () => {
  it('includes tuning_step_previewed', async () => {
    const mod = await import('./session.js');
    // The type system guarantees the event kind exists since it's a union.
    // We verify the tool emits it by checking the tool result.
    const toolMod = await import('./chat-tools.js');
    const tool = toolMod.findToolForIntent('tune_preview');
    const findings = [makeFinding()];
    const result = await tool!.execute({
      client: null as any,
      session: makeSession(),
      sessionContext: '',
      projectRoot: '/tmp',
      params: { findings: JSON.stringify(findings) },
      userMessage: 'preview',
    });
    expect(result.sessionEvents?.some(e => e.kind === 'tuning_step_previewed')).toBe(true);
  });

  it('includes tuning_step_applied', async () => {
    const toolMod = await import('./chat-tools.js');
    const tool = toolMod.findToolForIntent('tune_apply');
    const patches = [{ path: 'a', field: 'f', oldValue: 0, newValue: 1 }];
    const result = await tool!.execute({
      client: null as any,
      session: makeSession(),
      sessionContext: '',
      projectRoot: '/tmp',
      params: { patches: JSON.stringify(patches), bundleName: 'Test' },
      userMessage: 'apply',
    });
    expect(result.sessionEvents?.some(e => e.kind === 'tuning_step_applied')).toBe(true);
  });

  it('includes tuning_bundle_created', async () => {
    const toolMod = await import('./chat-tools.js');
    const tool = toolMod.findToolForIntent('tune_bundles');
    const findings = [makeFinding()];
    const result = await tool!.execute({
      client: null as any,
      session: makeSession(),
      sessionContext: '',
      projectRoot: '/tmp',
      params: { findings: JSON.stringify(findings) },
      userMessage: 'bundles',
    });
    expect(result.sessionEvents?.some(e => e.kind === 'tuning_bundle_created')).toBe(true);
  });
});

// ============================================================
// Edge cases
// ============================================================

describe('edge cases', () => {
  it('handles empty findings in bundleFindings', () => {
    expect(bundleFindings([], [])).toEqual([]);
  });

  it('handles empty patches in predictImpact', () => {
    const impact = predictImpact([]);
    expect(impact.confidence).toBe(0);
    expect(impact.overallDirection).toBe('uncertain');
  });

  it('handles null session in buildPatchPreview', () => {
    const preview = buildPatchPreview('goal', [makeFinding()], [makeFix()], null);
    expect(preview.warnings.some(w => w.includes('session'))).toBe(true);
  });

  it('handles null analysis and null session in generateOperationalPlan', () => {
    const plan = generateOperationalPlan('goal', null, null);
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('round2 produces correct decimal places in patch values', () => {
    const fix = makeFix({ code: 'increase_alert_sensitivity' });
    const patches = generateConfigPatches(fix);
    // 0.25 + 0.15 = 0.40
    expect(patches[0].newValue).toBe(0.40);
    expect(patches[0].newValue.toString()).toBe('0.4');
  });

  it('previewTuningStep handles malformed patches in params', () => {
    const plan: TuningPlan = {
      goal: 'test',
      steps: [{
        id: 1,
        description: 'test',
        command: 'test',
        intent: 'tune_apply',
        params: { patches: 'not-valid-json' },
        dependencies: [],
        expectedEffect: 'test',
        status: 'pending',
      }],
      warnings: [],
    };
    const state = createTuningState(plan);
    const preview = previewTuningStep(state, 1);
    expect(preview).not.toBeNull();
    expect(preview!.patches).toHaveLength(0);
  });

  it('buildDesignImpact handles comparison with no sections', () => {
    const comparison = makeComparison({ changes: [] });
    const dic = buildDesignImpact(comparison);
    expect(dic.sections.length).toBeGreaterThan(0); // unchanged dimensions fill in
  });

  it('generatePatchYaml handles empty patches', () => {
    const bundle: TuningBundle = {
      code: 'empty',
      name: 'Empty',
      description: 'No patches',
      findingCodes: [],
      fixCodes: [],
      patches: [],
      impact: { rumorReach: 'unchanged', escalationTiming: 'unchanged', encounterDuration: 'unchanged', hostilityCurve: 'unchanged', overallDirection: 'uncertain', confidence: 0, explanation: 'test' },
    };
    const yaml = generatePatchYaml(bundle, 'test');
    expect(yaml).toContain('Empty');
    expect(yaml).toContain('test');
  });

  it('operational plan steps have sequential IDs starting from 1', () => {
    const analysis = makeAnalysis();
    const plan = generateOperationalPlan('tune', makeSession(), analysis);
    expect(plan.steps[0].id).toBe(1);
    for (let i = 1; i < plan.steps.length; i++) {
      expect(plan.steps[i].id).toBe(plan.steps[i - 1].id + 1);
    }
  });

  it('tune-bundles tool returns error for non-array input', async () => {
    const toolMod = await import('./chat-tools.js');
    const tool = toolMod.findToolForIntent('tune_bundles');
    const result = await tool!.execute({
      client: null as any,
      session: null,
      sessionContext: '',
      projectRoot: '/tmp',
      params: { findings: '"not an array"' },
      userMessage: 'bundles',
    });
    expect(result.ok).toBe(false);
  });
});
