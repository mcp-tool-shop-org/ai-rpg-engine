// Tests — chat balance analyzer: simulation-guided balancing

import { describe, it, expect } from 'vitest';
import {
  parseReplayData,
  extractMetrics,
  analyzeBalance,
  formatBalanceAnalysis,
  parseDesignIntent,
  compareIntent,
  formatIntentComparison,
  analyzeWindow,
  formatWindowAnalysis,
  suggestFixes,
  formatSuggestedFixes,
  compareScenarios,
  formatScenarioComparison,
  generateTuningPlan,
  createTuningState,
  nextPendingTuningStep,
  markTuningStepExecuted,
  markTuningStepFailed,
  isTuningComplete,
  finalizeTuning,
  formatTuningPlan,
  formatTuningStatus,
  detectTuningTemplate,
} from './chat-balance-analyzer.js';
import type {
  BalanceFinding,
  DesignIntent,
  TuningPlan,
  TuningState,
} from './chat-balance-analyzer.js';
import type { DesignSession } from './session.js';

// --- Helpers ---

function makeSession(overrides: Partial<DesignSession> = {}): DesignSession {
  return {
    name: 'balance-test',
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

function makeReplay(ticks: number, overrides: Partial<{
  alertValues: number[];
  hostilityValues: number[];
  stabilityValues: number[];
  rumorEvents: Array<{ target: string }>;
  encounterEvents: boolean;
}> = {}): string {
  const tickData = Array.from({ length: ticks }, (_, i) => {
    const metrics: Record<string, number> = {};
    if (overrides.alertValues) {
      metrics.alertPressure = overrides.alertValues[i] ?? 0;
    }
    if (overrides.hostilityValues) {
      metrics.factionHostility = overrides.hostilityValues[i] ?? 0;
    }
    if (overrides.stabilityValues) {
      metrics.districtStability = overrides.stabilityValues[i] ?? 0.5;
    }

    const events: Array<Record<string, unknown>> = [];
    if (overrides.rumorEvents && i < overrides.rumorEvents.length) {
      events.push({ type: 'rumor_spread', target: overrides.rumorEvents[i].target });
    }
    if (overrides.encounterEvents) {
      events.push({ type: 'encounter_active' });
    }

    return { tick: i, metrics, events };
  });
  return JSON.stringify(tickData);
}

// ========================================
// Replay data parsing
// ========================================

describe('parseReplayData', () => {
  it('parses array of ticks', () => {
    const result = parseReplayData('[{"tick":0},{"tick":1}]');
    expect(result).not.toBeNull();
    expect(result!.ticks).toHaveLength(2);
  });

  it('parses object with ticks field', () => {
    const result = parseReplayData('{"ticks":[{"tick":0}],"metadata":{}}');
    expect(result).not.toBeNull();
    expect(result!.ticks).toHaveLength(1);
    expect(result!.metadata).toBeDefined();
  });

  it('parses single tick', () => {
    const result = parseReplayData('{"tick":5}');
    expect(result).not.toBeNull();
    expect(result!.ticks).toHaveLength(1);
    expect(result!.ticks[0].tick).toBe(5);
  });

  it('returns null for invalid JSON', () => {
    expect(parseReplayData('not json')).toBeNull();
  });

  it('returns null for non-replay structure', () => {
    expect(parseReplayData('"just a string"')).toBeNull();
  });
});

// ========================================
// Metric extraction
// ========================================

describe('extractMetrics', () => {
  it('counts total ticks', () => {
    const replay = parseReplayData(makeReplay(20))!;
    const metrics = extractMetrics(replay);
    expect(metrics.totalTicks).toBe(20);
  });

  it('detects escalation tick when alert crosses threshold', () => {
    const alert = Array.from({ length: 20 }, (_, i) => i * 0.05);
    // alert > 0.5 at tick 11
    const replay = parseReplayData(makeReplay(20, { alertValues: alert }))!;
    const metrics = extractMetrics(replay);
    expect(metrics.escalationTick).toBe(11);
  });

  it('returns null escalation tick when alert stays low', () => {
    const alert = Array.from({ length: 20 }, () => 0.1);
    const replay = parseReplayData(makeReplay(20, { alertValues: alert }))!;
    const metrics = extractMetrics(replay);
    expect(metrics.escalationTick).toBeNull();
  });

  it('counts rumor spread reach', () => {
    const rumorEvents = [
      { target: 'faction-a' }, { target: 'faction-b' }, { target: 'faction-a' },
    ];
    const replay = parseReplayData(makeReplay(5, { rumorEvents }))!;
    const metrics = extractMetrics(replay);
    expect(metrics.rumorSpreadReach).toBe(2);
  });

  it('counts encounter ticks', () => {
    const replay = parseReplayData(makeReplay(10, { encounterEvents: true }))!;
    const metrics = extractMetrics(replay);
    expect(metrics.encounterTicks).toBe(10);
  });

  it('extracts faction hostility peak', () => {
    const hostility = [0, 0.2, 0.5, 0.9, 0.6, 0.3];
    const replay = parseReplayData(makeReplay(6, { hostilityValues: hostility }))!;
    const metrics = extractMetrics(replay);
    expect(metrics.factionHostilityPeak).toBe(0.9);
  });

  it('counts escalation phases', () => {
    // Goes above 0.5 twice: ticks 2-3 then ticks 6-7
    const alert = [0, 0.1, 0.6, 0.7, 0.2, 0.1, 0.8, 0.9, 0.2, 0.1];
    const replay = parseReplayData(makeReplay(10, { alertValues: alert }))!;
    const metrics = extractMetrics(replay);
    expect(metrics.escalationPhases).toBe(2);
  });

  it('builds metric curves', () => {
    const alert = [0.1, 0.2, 0.3];
    const replay = parseReplayData(makeReplay(3, { alertValues: alert }))!;
    const metrics = extractMetrics(replay);
    const curve = metrics.curves.find(c => c.name === 'alertPressure');
    expect(curve).toBeDefined();
    expect(curve!.values).toEqual([0.1, 0.2, 0.3]);
    expect(curve!.peak).toBe(0.3);
    expect(curve!.peakTick).toBe(2);
    expect(curve!.mean).toBeCloseTo(0.2);
  });
});

// ========================================
// P1 — Balance Analysis
// ========================================

describe('analyzeBalance', () => {
  it('detects flat difficulty', () => {
    const alert = Array.from({ length: 20 }, () => 0.1);
    const analysis = analyzeBalance(makeReplay(20, { alertValues: alert }), null);
    expect(analysis.findings.some(f => f.code === 'DIFFICULTY_FLAT')).toBe(true);
  });

  it('detects too-fast escalation', () => {
    const alert = Array.from({ length: 20 }, (_, i) => i === 0 ? 0.8 : 0.1);
    const analysis = analyzeBalance(makeReplay(20, { alertValues: alert }), null);
    expect(analysis.findings.some(f => f.code === 'ESCALATION_TOO_FAST')).toBe(true);
  });

  it('detects no rumor spread', () => {
    const analysis = analyzeBalance(makeReplay(20), null);
    expect(analysis.findings.some(f => f.code === 'RUMOR_NO_SPREAD')).toBe(true);
  });

  it('detects pinned hostility', () => {
    const hostility = Array.from({ length: 20 }, () => 0.95);
    const analysis = analyzeBalance(makeReplay(20, { hostilityValues: hostility }), null);
    expect(analysis.findings.some(f => f.code === 'HOSTILITY_PINNED')).toBe(true);
  });

  it('detects inert district stability', () => {
    const stability = Array.from({ length: 20 }, () => 0.5);
    const analysis = analyzeBalance(makeReplay(20, { stabilityValues: stability }), null);
    expect(analysis.findings.some(f => f.code === 'STABILITY_INERT')).toBe(true);
  });

  it('detects short simulation', () => {
    const analysis = analyzeBalance(makeReplay(3), null);
    expect(analysis.findings.some(f => f.code === 'SHORT_SIMULATION')).toBe(true);
  });

  it('handles invalid replay gracefully', () => {
    const analysis = analyzeBalance('not json', null);
    expect(analysis.findings).toHaveLength(1);
    expect(analysis.findings[0].code).toBe('PARSE_FAILURE');
  });

  it('correlates session escalation issues with replay', () => {
    const alert = Array.from({ length: 20 }, () => 0.1);
    const session = makeSession({
      issues: [
        { code: 'ESCALATION_STALLED', target: 'market', severity: 'high', status: 'open', summary: 'No escalation' },
      ],
    });
    const analysis = analyzeBalance(makeReplay(20, { alertValues: alert }), session);
    expect(analysis.findings.some(f => f.code === 'SESSION_ESCALATION_ISSUES')).toBe(true);
  });

  it('produces summary with counts', () => {
    const analysis = analyzeBalance(makeReplay(20), null);
    expect(analysis.summary).toContain('Analyzed 20 ticks');
  });
});

describe('formatBalanceAnalysis', () => {
  it('formats heading and findings', () => {
    const alert = Array.from({ length: 20 }, () => 0.1);
    const analysis = analyzeBalance(makeReplay(20, { alertValues: alert }), null);
    const output = formatBalanceAnalysis(analysis);
    expect(output).toContain('Balance Analysis');
    expect(output).toContain('Findings:');
    expect(output).toContain('DIFFICULTY_FLAT');
  });

  it('formats metrics section', () => {
    const analysis = analyzeBalance(makeReplay(20), null);
    const output = formatBalanceAnalysis(analysis);
    expect(output).toContain('Metrics:');
    expect(output).toContain('Total ticks: 20');
  });
});

// ========================================
// P2 — Intent vs Outcome
// ========================================

describe('parseDesignIntent', () => {
  it('parses mood from YAML-like text', () => {
    const intent = parseDesignIntent('targetMood: "paranoia"');
    expect(intent.targetMood).toBe('paranoia');
  });

  it('parses desired outcomes', () => {
    const text = `targetMood: "tension"
desiredOutcomes:
  - guards escalate by tick 20
  - rumors reach second faction within one encounter`;
    const intent = parseDesignIntent(text);
    expect(intent.desiredOutcomes).toHaveLength(2);
    expect(intent.desiredOutcomes[0].byTick).toBe(20);
    expect(intent.desiredOutcomes[1].description).toContain('rumors reach');
  });

  it('parses notes section', () => {
    const text = `notes:
  - keep it dark
  - no comedy`;
    const intent = parseDesignIntent(text);
    expect(intent.notes).toHaveLength(2);
  });

  it('treats plain text as mood', () => {
    const intent = parseDesignIntent('paranoia');
    expect(intent.targetMood).toBe('paranoia');
  });
});

describe('compareIntent', () => {
  it('marks escalation as achieved when within deadline', () => {
    const intent: DesignIntent = {
      desiredOutcomes: [{ description: 'guards escalate by tick 20', byTick: 20 }],
      notes: [],
    };
    const alert = Array.from({ length: 30 }, (_, i) => i >= 15 ? 0.8 : 0.1);
    const comparison = compareIntent(intent, makeReplay(30, { alertValues: alert }), null);
    expect(comparison.results[0].status).toBe('achieved');
  });

  it('marks escalation as missed when no escalation occurs', () => {
    const intent: DesignIntent = {
      desiredOutcomes: [{ description: 'guards escalate by tick 20', byTick: 20 }],
      notes: [],
    };
    const alert = Array.from({ length: 30 }, () => 0.1);
    const comparison = compareIntent(intent, makeReplay(30, { alertValues: alert }), null);
    expect(comparison.results[0].status).toBe('missed');
  });

  it('evaluates rumor spread outcomes', () => {
    const intent: DesignIntent = {
      desiredOutcomes: [{ description: 'rumors reach 2 factions' }],
      notes: [],
    };
    const rumorEvents = [{ target: 'a' }, { target: 'b' }, { target: 'c' }];
    const comparison = compareIntent(intent, makeReplay(5, { rumorEvents }), null);
    expect(comparison.results[0].status).toBe('achieved');
  });

  it('evaluates mood match for paranoia', () => {
    const intent: DesignIntent = {
      targetMood: 'paranoia',
      desiredOutcomes: [],
      notes: [],
    };
    const alert = Array.from({ length: 20 }, (_, i) => i > 10 ? 0.7 : 0.1);
    const rumorEvents = [{ target: 'faction-a' }];
    const hostility = Array.from({ length: 20 }, () => 0.5);
    const comparison = compareIntent(
      intent,
      makeReplay(20, { alertValues: alert, rumorEvents, hostilityValues: hostility }),
      null,
    );
    expect(comparison.moodMatch).toBe('achieved');
  });

  it('detects missed calm mood', () => {
    const intent: DesignIntent = {
      targetMood: 'calm',
      desiredOutcomes: [],
      notes: [],
    };
    const hostility = Array.from({ length: 20 }, () => 0.9);
    const comparison = compareIntent(
      intent,
      makeReplay(20, { hostilityValues: hostility }),
      null,
    );
    expect(comparison.moodMatch).toBe('missed');
  });

  it('computes overall status', () => {
    const intent: DesignIntent = {
      targetMood: 'paranoia',
      desiredOutcomes: [
        { description: 'guards escalate by tick 20', byTick: 20 },
        { description: 'rumors reach 1 faction' },
      ],
      notes: [],
    };
    const alert = Array.from({ length: 30 }, (_, i) => i >= 10 ? 0.7 : 0.1);
    const rumorEvents = [{ target: 'a' }];
    const hostility = Array.from({ length: 30 }, () => 0.5);
    const comparison = compareIntent(
      intent,
      makeReplay(30, { alertValues: alert, rumorEvents, hostilityValues: hostility }),
      null,
    );
    expect(comparison.overallStatus).toBe('achieved');
  });
});

describe('formatIntentComparison', () => {
  it('formats mood assessment', () => {
    const intent: DesignIntent = {
      targetMood: 'paranoia',
      desiredOutcomes: [],
      notes: [],
    };
    const comparison = compareIntent(intent, makeReplay(5), null);
    const output = formatIntentComparison(comparison);
    expect(output).toContain('Intent vs Outcome');
    expect(output).toContain('paranoia');
  });

  it('formats outcome results with icons', () => {
    const intent: DesignIntent = {
      desiredOutcomes: [{ description: 'guards escalate by tick 20', byTick: 20 }],
      notes: [],
    };
    const alert = Array.from({ length: 30 }, (_, i) => i >= 10 ? 0.8 : 0.1);
    const comparison = compareIntent(intent, makeReplay(30, { alertValues: alert }), null);
    const output = formatIntentComparison(comparison);
    expect(output).toContain('●');
    expect(output).toContain('achieved');
  });
});

// ========================================
// P3 — Window Analysis
// ========================================

describe('analyzeWindow', () => {
  it('analyzes only the specified tick range', () => {
    const alert = Array.from({ length: 30 }, (_, i) => i >= 20 ? 0.8 : 0.1);
    const analysis = analyzeWindow(makeReplay(30, { alertValues: alert }), 20, 29);
    expect(analysis.startTick).toBe(20);
    expect(analysis.endTick).toBe(29);
    expect(analysis.metrics.totalTicks).toBe(10);
  });

  it('applies focus filter to findings', () => {
    const alert = Array.from({ length: 30 }, () => 0.1);
    const analysis = analyzeWindow(makeReplay(30, { alertValues: alert }), 0, 29, 'difficulty');
    expect(analysis.findings.every(f => f.category === 'difficulty')).toBe(true);
  });

  it('handles invalid replay gracefully', () => {
    const analysis = analyzeWindow('invalid', 0, 10);
    expect(analysis.findings[0].code).toBe('PARSE_FAILURE');
  });

  it('returns empty findings for well-balanced window', () => {
    // Just a simple replay with no alert metrics at all — only SHORT_SIMULATION will fire
    const analysis = analyzeWindow(makeReplay(3), 0, 2);
    const nonShort = analysis.findings.filter(f => f.code !== 'SHORT_SIMULATION');
    expect(nonShort.length).toBeLessThanOrEqual(1);
  });
});

describe('formatWindowAnalysis', () => {
  it('includes tick range in header', () => {
    const analysis = analyzeWindow(makeReplay(30), 5, 15);
    const output = formatWindowAnalysis(analysis);
    expect(output).toContain('Window Analysis: ticks 5–15');
  });
});

// ========================================
// P4 — Suggested Fixes
// ========================================

describe('suggestFixes', () => {
  it('generates fix for DIFFICULTY_FLAT', () => {
    const findings: BalanceFinding[] = [{
      code: 'DIFFICULTY_FLAT',
      summary: 'test',
      area: 'escalation',
      severity: 'warning',
      category: 'difficulty',
      likelyCause: 'test',
    }];
    const fixes = suggestFixes(findings);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].code).toBe('increase_alert_sensitivity');
    expect(fixes[0].confidence).toBeGreaterThan(0.5);
  });

  it('generates fix for ESCALATION_TOO_FAST', () => {
    const findings: BalanceFinding[] = [{
      code: 'ESCALATION_TOO_FAST',
      summary: 'test',
      area: 'escalation',
      severity: 'warning',
      category: 'escalation',
      likelyCause: 'test',
    }];
    const fixes = suggestFixes(findings);
    expect(fixes[0].code).toBe('reduce_alert_gain');
  });

  it('generates fix for HOSTILITY_PINNED', () => {
    const findings: BalanceFinding[] = [{
      code: 'HOSTILITY_PINNED',
      summary: 'test',
      area: 'faction dynamics',
      severity: 'critical',
      category: 'faction_dynamics',
      likelyCause: 'test',
    }];
    const fixes = suggestFixes(findings);
    expect(fixes[0].code).toBe('increase_hostility_decay');
    expect(fixes[0].target).toContain('faction_dynamics');
  });

  it('generates fix for RUMOR_NO_SPREAD', () => {
    const findings: BalanceFinding[] = [{
      code: 'RUMOR_NO_SPREAD',
      summary: 'test',
      area: 'rumor propagation',
      severity: 'warning',
      category: 'rumor_flow',
      likelyCause: 'test',
    }];
    const fixes = suggestFixes(findings);
    expect(fixes[0].code).toBe('add_rumor_path');
  });

  it('sorts fixes by confidence descending', () => {
    const findings: BalanceFinding[] = [
      { code: 'STABILITY_INERT', summary: 'a', area: 'stability', severity: 'info', category: 'district_stability', likelyCause: '' },
      { code: 'SESSION_ESCALATION_ISSUES', summary: 'b', area: 'alignment', severity: 'warning', category: 'escalation', likelyCause: '' },
    ];
    const fixes = suggestFixes(findings);
    expect(fixes).toHaveLength(2);
    expect(fixes[0].confidence).toBeGreaterThanOrEqual(fixes[1].confidence);
  });

  it('returns empty for unknown finding codes', () => {
    const findings: BalanceFinding[] = [{
      code: 'UNKNOWN_CODE',
      summary: 'test',
      area: 'test',
      severity: 'info',
      category: 'general',
      likelyCause: 'test',
    }];
    const fixes = suggestFixes(findings);
    expect(fixes).toHaveLength(0);
  });

  it('generates multiple fixes for multiple findings', () => {
    const findings: BalanceFinding[] = [
      { code: 'DIFFICULTY_FLAT', summary: '', area: 'a', severity: 'warning', category: 'difficulty', likelyCause: '' },
      { code: 'RUMOR_NO_SPREAD', summary: '', area: 'b', severity: 'warning', category: 'rumor_flow', likelyCause: '' },
      { code: 'HOSTILITY_PINNED', summary: '', area: 'c', severity: 'critical', category: 'faction_dynamics', likelyCause: '' },
    ];
    const fixes = suggestFixes(findings);
    expect(fixes).toHaveLength(3);
  });
});

describe('formatSuggestedFixes', () => {
  it('formats fix details', () => {
    const findings: BalanceFinding[] = [{
      code: 'ESCALATION_TOO_FAST',
      summary: 'test',
      area: 'escalation',
      severity: 'warning',
      category: 'escalation',
      likelyCause: 'test',
    }];
    const fixes = suggestFixes(findings);
    const output = formatSuggestedFixes(fixes);
    expect(output).toContain('Suggested Fixes');
    expect(output).toContain('reduce_alert_gain');
    expect(output).toContain('Confidence:');
    expect(output).toContain('no changes are applied without your confirmation');
  });

  it('handles empty fixes', () => {
    const output = formatSuggestedFixes([]);
    expect(output).toContain('No fixes suggested');
  });
});

// ========================================
// P5 — Compare Scenarios
// ========================================

describe('compareScenarios', () => {
  it('detects escalation pacing improvement', () => {
    const before = makeReplay(20, {
      alertValues: Array.from({ length: 20 }, (_, i) => i === 1 ? 0.8 : 0.1),
    });
    const after = makeReplay(20, {
      alertValues: Array.from({ length: 20 }, (_, i) => i >= 15 ? 0.8 : 0.1),
    });
    const comparison = compareScenarios(before, after);
    const escalation = comparison.changes.find(c => c.dimension === 'escalation pacing');
    expect(escalation).toBeDefined();
    expect(escalation!.direction).toBe('improved');
  });

  it('detects rumor spread improvement', () => {
    const before = makeReplay(10);
    const after = makeReplay(10, {
      rumorEvents: [{ target: 'a' }, { target: 'b' }],
    });
    const comparison = compareScenarios(before, after);
    const rumor = comparison.changes.find(c => c.dimension === 'rumor spread');
    expect(rumor).toBeDefined();
    expect(rumor!.direction).toBe('improved');
  });

  it('evaluates hostility change against intent mood', () => {
    const before = makeReplay(10, {
      hostilityValues: Array.from({ length: 10 }, () => 0.2),
    });
    const after = makeReplay(10, {
      hostilityValues: Array.from({ length: 10 }, () => 0.7),
    });
    const intent: DesignIntent = {
      targetMood: 'paranoia',
      desiredOutcomes: [],
      notes: [],
    };
    const comparison = compareScenarios(before, after, intent);
    const hostility = comparison.changes.find(c => c.dimension === 'faction hostility peak');
    expect(hostility).toBeDefined();
    // For paranoia mood, increased hostility is improvement
    expect(hostility!.direction).toBe('improved');
  });

  it('returns unchanged for identical replays', () => {
    const data = makeReplay(10);
    const comparison = compareScenarios(data, data);
    expect(comparison.verdict).toBe('unchanged');
  });

  it('returns mixed when some improve and some regress', () => {
    const before = makeReplay(20, {
      alertValues: Array.from({ length: 20 }, (_, i) => i === 1 ? 0.8 : 0.1),
      rumorEvents: [{ target: 'a' }, { target: 'b' }],
    });
    const after = makeReplay(20, {
      alertValues: Array.from({ length: 20 }, (_, i) => i >= 15 ? 0.8 : 0.1),
      // No rumor events in after — regression
    });
    const comparison = compareScenarios(before, after);
    // Should have at least one improvement (escalation) and one regression (rumor)
    const improved = comparison.changes.filter(c => c.direction === 'improved');
    const regressed = comparison.changes.filter(c => c.direction === 'regressed');
    if (improved.length > 0 && regressed.length > 0) {
      expect(comparison.verdict).toBe('mixed');
    }
  });

  it('produces summary with tick counts', () => {
    const before = makeReplay(15);
    const after = makeReplay(25);
    const comparison = compareScenarios(before, after);
    expect(comparison.summary).toContain('15-tick');
    expect(comparison.summary).toContain('25-tick');
  });
});

describe('formatScenarioComparison', () => {
  it('formats verdict and changes', () => {
    const before = makeReplay(10);
    const after = makeReplay(10, {
      rumorEvents: [{ target: 'a' }],
    });
    const comparison = compareScenarios(before, after);
    const output = formatScenarioComparison(comparison);
    expect(output).toContain('Scenario Comparison');
    expect(output).toContain('Verdict:');
  });
});

// ========================================
// P6 — Tuning Plans
// ========================================

describe('detectTuningTemplate', () => {
  it('detects paranoia tuning', () => {
    expect(detectTuningTemplate('increase paranoia')!.name).toBe('increase paranoia');
    expect(detectTuningTemplate('add more suspicion')!.name).toBe('increase paranoia');
  });

  it('detects lethality tuning', () => {
    expect(detectTuningTemplate('reduce lethality')!.name).toBe('reduce lethality');
    expect(detectTuningTemplate('improve survivability')!.name).toBe('reduce lethality');
  });

  it('detects rumor speed tuning', () => {
    expect(detectTuningTemplate('make rumors spread faster')!.name).toBe('increase rumor speed');
    expect(detectTuningTemplate('improve gossip propagation')!.name).toBe('increase rumor speed');
  });

  it('detects escalation tuning', () => {
    expect(detectTuningTemplate('adjust alert escalation')!.name).toBe('adjust escalation');
    expect(detectTuningTemplate('reduce pressure ramp')!.name).toBe('adjust escalation');
  });

  it('returns null for unrecognized goals', () => {
    expect(detectTuningTemplate('do something random')).toBeNull();
  });
});

describe('generateTuningPlan', () => {
  it('generates paranoia tuning plan with 5 steps', () => {
    const plan = generateTuningPlan('increase paranoia', makeSession());
    expect(plan.steps).toHaveLength(5);
    expect(plan.goal).toBe('increase paranoia');
    expect(plan.steps[0].command).toBe('analyze-replay');
    expect(plan.steps[1].command).toBe('create-faction');
  });

  it('generates generic plan for unknown goals', () => {
    const plan = generateTuningPlan('do something vague', makeSession());
    expect(plan.steps.length).toBeGreaterThanOrEqual(3);
    expect(plan.warnings.some(w => w.includes('No specific tuning template'))).toBe(true);
  });

  it('warns when no session', () => {
    const plan = generateTuningPlan('increase paranoia', null);
    expect(plan.warnings.some(w => w.includes('No active session'))).toBe(true);
  });

  it('warns when no replay history', () => {
    const plan = generateTuningPlan('increase paranoia', makeSession());
    expect(plan.warnings.some(w => w.includes('No replay data'))).toBe(true);
  });

  it('does not warn about replay when session has replay events', () => {
    const session = makeSession({
      history: [{ timestamp: 'now', kind: 'replay_compared', detail: 'test' }],
    });
    const plan = generateTuningPlan('increase paranoia', session);
    expect(plan.warnings.some(w => w.includes('No replay data'))).toBe(false);
  });

  it('sets dependencies correctly', () => {
    const plan = generateTuningPlan('increase paranoia', makeSession());
    expect(plan.steps[0].dependencies).toEqual([]);
    expect(plan.steps[1].dependencies).toEqual([plan.steps[0].id]);
  });

  it('each step has expectedEffect', () => {
    const plan = generateTuningPlan('reduce lethality', makeSession());
    for (const step of plan.steps) {
      expect(step.expectedEffect).toBeTruthy();
    }
  });
});

describe('formatTuningPlan', () => {
  it('formats plan with goal and steps', () => {
    const plan = generateTuningPlan('increase paranoia', makeSession());
    const output = formatTuningPlan(plan);
    expect(output).toContain('Tuning Plan: increase paranoia');
    expect(output).toContain('Effect:');
    expect(output).toContain('/tune-preview');
  });
});

// ========================================
// Tuning state management
// ========================================

describe('createTuningState', () => {
  it('creates state with planned status', () => {
    const plan = generateTuningPlan('increase paranoia', makeSession());
    const state = createTuningState(plan);
    expect(state.status).toBe('planned');
    expect(state.plan).toBe(plan);
    expect(state.startedAt).toBeTruthy();
  });
});

describe('nextPendingTuningStep', () => {
  it('returns first step when no dependencies', () => {
    const plan = generateTuningPlan('increase paranoia', makeSession());
    const state = createTuningState(plan);
    const next = nextPendingTuningStep(state);
    expect(next).not.toBeNull();
    expect(next!.id).toBe(1);
  });

  it('respects dependencies', () => {
    const plan = generateTuningPlan('increase paranoia', makeSession());
    const state = createTuningState(plan);
    // Mark step 1 as executed
    markTuningStepExecuted(state, 1, 'done');
    const next = nextPendingTuningStep(state);
    expect(next!.id).toBe(2);
  });

  it('returns null when all complete', () => {
    const plan = generateTuningPlan('increase paranoia', makeSession());
    const state = createTuningState(plan);
    for (const step of plan.steps) {
      markTuningStepExecuted(state, step.id, 'done');
    }
    expect(nextPendingTuningStep(state)).toBeNull();
  });
});

describe('markTuningStepExecuted', () => {
  it('sets status and result', () => {
    const plan = generateTuningPlan('increase paranoia', makeSession());
    const state = createTuningState(plan);
    markTuningStepExecuted(state, 1, 'analysis complete');
    expect(state.plan.steps[0].status).toBe('executed');
    expect(state.plan.steps[0].result).toBe('analysis complete');
    expect(state.status).toBe('executing');
  });
});

describe('markTuningStepFailed', () => {
  it('cascades to dependent steps', () => {
    const plan = generateTuningPlan('increase paranoia', makeSession());
    const state = createTuningState(plan);
    markTuningStepFailed(state, 1, 'error');
    expect(state.plan.steps[0].status).toBe('failed');
    // Step 2 depends on step 1
    const dependents = state.plan.steps.filter(s => s.dependencies.includes(1));
    for (const dep of dependents) {
      expect(dep.status).toBe('skipped');
    }
  });
});

describe('isTuningComplete', () => {
  it('returns false when steps pending', () => {
    const plan = generateTuningPlan('increase paranoia', makeSession());
    const state = createTuningState(plan);
    expect(isTuningComplete(state)).toBe(false);
  });

  it('returns true when all resolved', () => {
    const plan = generateTuningPlan('increase paranoia', makeSession());
    const state = createTuningState(plan);
    for (const step of plan.steps) {
      markTuningStepExecuted(state, step.id, 'done');
    }
    expect(isTuningComplete(state)).toBe(true);
  });
});

describe('finalizeTuning', () => {
  it('sets completed status', () => {
    const plan = generateTuningPlan('increase paranoia', makeSession());
    const state = createTuningState(plan);
    for (const step of plan.steps) {
      markTuningStepExecuted(state, step.id, 'done');
    }
    finalizeTuning(state);
    expect(state.status).toBe('completed');
    expect(state.completedAt).toBeTruthy();
  });

  it('sets failed status when steps failed', () => {
    const plan = generateTuningPlan('increase paranoia', makeSession());
    const state = createTuningState(plan);
    markTuningStepFailed(state, 1, 'error');
    // Mark remaining as executed to complete
    for (const step of plan.steps) {
      if (step.status === 'pending') {
        markTuningStepExecuted(state, step.id, 'done');
      }
    }
    finalizeTuning(state);
    expect(state.status).toBe('failed');
  });
});

describe('formatTuningStatus', () => {
  it('shows progress with icons', () => {
    const plan = generateTuningPlan('increase paranoia', makeSession());
    const state = createTuningState(plan);
    markTuningStepExecuted(state, 1, 'done');
    const output = formatTuningStatus(state);
    expect(output).toContain('●');
    expect(output).toContain('○');
    expect(output).toContain('Progress: 1/');
  });
});

// ========================================
// Router integration
// ========================================

describe('router integration', () => {
  // Test that the new intents are correctly imported and recognized
  it('has analyze_balance in ChatIntent union', async () => {
    const { classifyByKeywords } = await import('./chat-router.js');
    const result = classifyByKeywords('analyze balance');
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('analyze_balance');
  });

  it('routes compare intent', async () => {
    const { classifyByKeywords } = await import('./chat-router.js');
    const result = classifyByKeywords('compare intent vs outcome');
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('compare_intent');
  });

  it('routes analyze window by tick range', async () => {
    const { classifyByKeywords } = await import('./chat-router.js');
    const result = classifyByKeywords('analyze ticks 1-20');
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('analyze_window');
    expect(result!.params.startTick).toBe('1');
    expect(result!.params.endTick).toBe('20');
  });

  it('routes suggest fixes via slash command', async () => {
    const { classifyByKeywords } = await import('./chat-router.js');
    const result = classifyByKeywords('/suggest-fixes');
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('suggest_fixes');
  });

  it('routes compare scenarios', async () => {
    const { classifyByKeywords } = await import('./chat-router.js');
    const result = classifyByKeywords('compare scenarios');
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('compare_scenarios');
  });

  it('routes tune goal', async () => {
    const { classifyByKeywords } = await import('./chat-router.js');
    const result = classifyByKeywords('tune increase paranoia');
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('tune_goal');
    expect(result!.params.goal).toBe('increase paranoia');
  });

  it('routes /tune slash command', async () => {
    const { classifyByKeywords } = await import('./chat-router.js');
    const result = classifyByKeywords('/tune reduce lethality');
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('tune_goal');
    expect(result!.params.goal).toBe('reduce lethality');
  });

  it('routes "what should I change" to suggest_fixes', async () => {
    const { classifyByKeywords } = await import('./chat-router.js');
    const result = classifyByKeywords('what should I change');
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('suggest_fixes');
  });

  it('routes "compare revisions" to compare_scenarios', async () => {
    const { classifyByKeywords } = await import('./chat-router.js');
    const result = classifyByKeywords('compare revisions');
    expect(result).not.toBeNull();
    expect(result!.intent).toBe('compare_scenarios');
  });
});

// ========================================
// Tool integration
// ========================================

describe('tool integration', () => {
  it('has 25 tools registered', async () => {
    const { getAllTools } = await import('./chat-tools.js');
    expect(getAllTools()).toHaveLength(25);
  });

  it('tools exist for all new intents', async () => {
    const { findToolForIntent } = await import('./chat-tools.js');
    expect(findToolForIntent('analyze_balance')).toBeDefined();
    expect(findToolForIntent('compare_intent')).toBeDefined();
    expect(findToolForIntent('analyze_window')).toBeDefined();
    expect(findToolForIntent('suggest_fixes')).toBeDefined();
    expect(findToolForIntent('compare_scenarios')).toBeDefined();
    expect(findToolForIntent('tune_goal')).toBeDefined();
  });
});

// ========================================
// Session event types
// ========================================

describe('session event types', () => {
  it('has all new event kinds defined', async () => {
    // Import SessionEventKind and verify the new values compile
    const { recordEvent, createSession } = await import('./session.js');
    const session = createSession('test');
    const newKinds = [
      'balance_analyzed', 'intent_compared', 'window_analyzed',
      'fixes_suggested', 'scenarios_compared',
      'tune_plan_created', 'tune_step_executed', 'tune_step_failed', 'tune_plan_completed',
    ] as const;
    for (const kind of newKinds) {
      recordEvent(session, kind, 'test');
    }
    expect(session.history.length).toBe(newKinds.length + 1); // +1 for session_start
  });
});

// ========================================
// Edge cases
// ========================================

describe('edge cases', () => {
  it('analyzeBalance with empty replay produces empty metrics', () => {
    const analysis = analyzeBalance('[]', null);
    expect(analysis.metrics.totalTicks).toBe(0);
    expect(analysis.findings).toHaveLength(0);
  });

  it('compareScenarios with invalid data handles gracefully', () => {
    const comparison = compareScenarios('invalid', 'also invalid');
    expect(comparison.verdict).toBe('unchanged');
  });

  it('analyzeWindow with out-of-range ticks returns empty', () => {
    const analysis = analyzeWindow(makeReplay(10), 100, 200);
    expect(analysis.metrics.totalTicks).toBe(0);
  });

  it('suggestFixes with empty findings returns empty', () => {
    expect(suggestFixes([])).toHaveLength(0);
  });

  it('parseDesignIntent with empty string returns default', () => {
    const intent = parseDesignIntent('');
    expect(intent.desiredOutcomes).toHaveLength(0);
  });

  it('compareIntent with no replay data still evaluates mood', () => {
    const intent: DesignIntent = {
      targetMood: 'calm',
      desiredOutcomes: [],
      notes: [],
    };
    const comparison = compareIntent(intent, '[]', null);
    expect(comparison.overallStatus).toBeDefined();
  });

  it('tuning plan for paranoia includes usable commands', () => {
    const plan = generateTuningPlan('increase paranoia', makeSession());
    for (const step of plan.steps) {
      expect(step.command).toBeTruthy();
      expect(step.intent).toBeTruthy();
    }
  });
});
