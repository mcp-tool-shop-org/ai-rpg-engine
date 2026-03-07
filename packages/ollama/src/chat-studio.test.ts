// Tests — v1.9.0 Studio UX: dashboard, browsers, onboarding, command discovery, display modes.

import { describe, it, expect, beforeEach } from 'vitest';
import type { DesignSession, SessionEvent, SessionIssue } from './session.js';
import type { ExperimentSummary } from './chat-experiments.js';
import type { BalanceAnalysis } from './chat-balance-analyzer.js';
import {
  // Display mode
  setDisplayMode, getDisplayMode,
  // P1 Dashboard
  buildStudioSnapshot, formatStudioDashboard,
  // P2 History
  filterHistory, formatHistoryBrowser,
  // P3 Issues & Findings
  filterIssues, formatIssueBrowser,
  gatherFindings, formatFindingBrowser,
  // P4 Experiment browser
  buildExperimentEntry, formatExperimentBrowser,
  // P5 Command discovery
  resolveAlias, formatGroupedHelp, COMMAND_GROUPS, COMMAND_ALIASES,
  // P6 Onboarding
  formatOnboarding, ONBOARDING_STEPS,
  // P7 State summaries
  detectStateSummaryKind, buildStateSummary,
  // P8 Output polish
  formatHeading, formatSection, paginate, truncate,
  type StudioSnapshot, type HistoryFilter, type IssueFilter, type FindingFilter,
} from './chat-studio.js';

// --- Helpers ---

function makeSession(overrides: Partial<DesignSession> = {}): DesignSession {
  return {
    name: 'test-session',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T01:00:00.000Z',
    themes: ['paranoia', 'noir'],
    constraints: ['low-magic'],
    artifacts: {
      rooms: ['r1'],
      factions: [],
      districts: ['d1'],
      quests: [],
      packs: [],
    },
    issues: [],
    acceptedSuggestions: [],
    history: [],
    ...overrides,
  };
}

function makeEvent(kind: SessionEvent['kind'], detail: string, ts?: string): SessionEvent {
  return {
    timestamp: ts ?? '2025-01-01T00:00:00.000Z',
    kind,
    detail,
  };
}

function makeIssue(overrides: Partial<SessionIssue> = {}): SessionIssue {
  return {
    code: 'balance_drift',
    target: 'district-1',
    severity: 'medium',
    status: 'open',
    summary: 'Drift detected.',
    ...overrides,
  };
}

function makeExperimentSummary(overrides: Partial<ExperimentSummary> = {}): ExperimentSummary {
  return {
    spec: { id: 'exp-1', label: 'Baseline', runs: 20 },
    completedRuns: 20,
    failedRuns: 0,
    runs: [],
    aggregate: {
      means: { paranoia: 0.6, stability: 0.4 },
      variances: { paranoia: 0.1, stability: 0.08 },
      mins: { paranoia: 0.3, stability: 0.2 },
      maxes: { paranoia: 0.9, stability: 0.7 },
      rates: { escalation: 0.25 },
    },
    varianceFindings: [],
    ...overrides,
  };
}

function makeBalanceAnalysis(overrides: Partial<BalanceAnalysis> = {}): BalanceAnalysis {
  return {
    metrics: {
      totalTicks: 30,
      escalationTick: 10,
      rumorSpreadReach: 2,
      encounterDuration: 5,
      factionHostilityPeak: 0.7,
      curves: [],
      encounterTicks: 10,
      escalationPhases: 2,
    },
    findings: [],
    summary: 'stable',
    ...overrides,
  };
}

// ============================================================
// Pillar 8 — Display mode
// ============================================================

describe('display mode', () => {
  beforeEach(() => setDisplayMode('compact'));

  it('defaults to compact', () => {
    expect(getDisplayMode()).toBe('compact');
  });

  it('can be set to verbose', () => {
    setDisplayMode('verbose');
    expect(getDisplayMode()).toBe('verbose');
  });

  it('can be set back to compact', () => {
    setDisplayMode('verbose');
    setDisplayMode('compact');
    expect(getDisplayMode()).toBe('compact');
  });
});

// ============================================================
// Pillar 1 — Studio Dashboard
// ============================================================

describe('buildStudioSnapshot', () => {
  beforeEach(() => setDisplayMode('compact'));

  it('returns empty snapshot for null session', () => {
    const snap = buildStudioSnapshot(null);
    expect(snap.sessionName).toBeNull();
    expect(snap.totalArtifacts).toBe(0);
    expect(snap.suggestedActions.length).toBeGreaterThan(0);
  });

  it('counts artifacts correctly', () => {
    const session = makeSession();
    const snap = buildStudioSnapshot(session);
    expect(snap.totalArtifacts).toBe(2);
    expect(snap.artifactCounts.rooms).toBe(1);
    expect(snap.artifactCounts.districts).toBe(1);
  });

  it('extracts session name and themes', () => {
    const session = makeSession();
    const snap = buildStudioSnapshot(session);
    expect(snap.sessionName).toBe('test-session');
    expect(snap.themes).toEqual(['paranoia', 'noir']);
  });

  it('counts open issues by severity', () => {
    const session = makeSession({
      issues: [
        makeIssue({ severity: 'high', code: 'drift_1' }),
        makeIssue({ severity: 'high', code: 'drift_2' }),
        makeIssue({ severity: 'low', code: 'minor_1' }),
        makeIssue({ severity: 'medium', status: 'resolved' }),
      ],
    });
    const snap = buildStudioSnapshot(session);
    expect(snap.openIssues.length).toBe(3);
    expect(snap.issueBySeverity.high).toBe(2);
    expect(snap.issueBySeverity.low).toBe(1);
  });

  it('includes recent experiments', () => {
    const session = makeSession();
    const exp = makeExperimentSummary();
    const snap = buildStudioSnapshot(session, { lastExperiment: exp });
    expect(snap.recentExperiments).toHaveLength(1);
    expect(snap.recentExperiments[0].spec.label).toBe('Baseline');
  });

  it('includes balance findings from last analysis', () => {
    const session = makeSession();
    const analysis = makeBalanceAnalysis({
      findings: [{ severity: 'warning', code: 'bal_1', summary: 'Test', area: 'combat', category: 'difficulty', likelyCause: 'flat curve' }],
    });
    const snap = buildStudioSnapshot(session, { lastAnalysis: analysis });
    expect(snap.balanceFindings).toHaveLength(1);
  });

  it('includes active build info', () => {
    const session = makeSession();
    const snap = buildStudioSnapshot(session, {
      activeBuild: {
        plan: {
          goal: 'build district',
          steps: [
            { id: 1, command: 'scaffold', intent: 'scaffold', description: 'Create district', params: {}, status: 'executed' },
            { id: 2, command: 'scaffold', intent: 'scaffold', description: 'Create room', params: {}, status: 'pending' },
          ],
        },
        status: 'in-progress',
        generatedContent: [],
      } as any,
    });
    expect(snap.activeBuild).not.toBeNull();
    expect(snap.activeBuild!.goal).toBe('build district');
    expect(snap.activeBuild!.progress).toBe('1/2 steps');
  });

  it('suggests creating content when empty', () => {
    const session = makeSession({
      artifacts: { rooms: [], factions: [], districts: [], quests: [], packs: [] },
    });
    const snap = buildStudioSnapshot(session);
    expect(snap.suggestedActions.some(a => a.includes('/build'))).toBe(true);
  });

  it('suggests resolving high-severity issues', () => {
    const session = makeSession({
      issues: [makeIssue({ severity: 'high' })],
    });
    const snap = buildStudioSnapshot(session);
    expect(snap.suggestedActions.some(a => a.includes('high-severity'))).toBe(true);
  });

  it('suggests balance analysis when content exists but no analysis', () => {
    const session = makeSession();
    const snap = buildStudioSnapshot(session);
    expect(snap.suggestedActions.some(a => a.includes('analyze-balance'))).toBe(true);
  });

  it('limits recent history to 10', () => {
    const events = Array.from({ length: 20 }, (_, i) =>
      makeEvent('artifact_created', `item-${i}`, `2025-01-01T00:${String(i).padStart(2, '0')}:00.000Z`),
    );
    const session = makeSession({ history: events });
    const snap = buildStudioSnapshot(session);
    expect(snap.recentHistory).toHaveLength(10);
  });
});

describe('formatStudioDashboard', () => {
  beforeEach(() => setDisplayMode('compact'));

  it('shows "No active session" for null session', () => {
    const snap = buildStudioSnapshot(null);
    const output = formatStudioDashboard(snap);
    expect(output).toContain('No active session');
  });

  it('shows session name and themes', () => {
    const snap = buildStudioSnapshot(makeSession());
    const output = formatStudioDashboard(snap);
    expect(output).toContain('test-session');
    expect(output).toContain('paranoia, noir');
  });

  it('shows artifact counts', () => {
    const snap = buildStudioSnapshot(makeSession());
    const output = formatStudioDashboard(snap);
    expect(output).toContain('1 rooms');
    expect(output).toContain('1 districts');
  });

  it('shows open issues count', () => {
    const session = makeSession({
      issues: [makeIssue(), makeIssue({ code: 'drift_2' })],
    });
    const snap = buildStudioSnapshot(session);
    const output = formatStudioDashboard(snap);
    expect(output).toContain('Open issues: 2');
  });

  it('shows suggested actions', () => {
    const snap = buildStudioSnapshot(makeSession());
    const output = formatStudioDashboard(snap);
    expect(output).toContain('Suggested next:');
    expect(output).toContain('→');
  });

  it('shows constraints in verbose mode', () => {
    setDisplayMode('verbose');
    const snap = buildStudioSnapshot(makeSession());
    const output = formatStudioDashboard(snap);
    expect(output).toContain('Constraints: low-magic');
  });

  it('hides constraints in compact mode', () => {
    setDisplayMode('compact');
    const snap = buildStudioSnapshot(makeSession());
    const output = formatStudioDashboard(snap);
    expect(output).not.toContain('Constraints:');
  });

  it('includes active build status', () => {
    const session = makeSession();
    const snap = buildStudioSnapshot(session, {
      activeBuild: {
        plan: {
          goal: 'dark district',
          steps: [
            { id: 1, command: 'x', intent: 'scaffold', description: '', params: {}, status: 'pending' },
          ],
        },
        status: 'ready',
        generatedContent: [],
      } as any,
    });
    const output = formatStudioDashboard(snap);
    expect(output).toContain('Active build: dark district');
  });
});

// ============================================================
// Pillar 2 — History Browser
// ============================================================

describe('filterHistory', () => {
  const session = makeSession({
    history: [
      makeEvent('build_plan_created', 'Build: noir district', '2025-01-01T00:00:00.000Z'),
      makeEvent('build_step_executed', 'Step 1: Create room', '2025-01-01T00:01:00.000Z'),
      makeEvent('artifact_created', 'room: dark-alley', '2025-01-01T00:02:00.000Z'),
      makeEvent('experiment_started', 'Experiment: baseline', '2025-01-01T00:03:00.000Z'),
      makeEvent('tune_plan_created', 'Tune: paranoia', '2025-01-01T00:04:00.000Z'),
    ],
  });

  it('returns all events with empty filter', () => {
    const events = filterHistory(session, {});
    expect(events).toHaveLength(5);
  });

  it('filters by tail', () => {
    const events = filterHistory(session, { tail: 2 });
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe('experiment_started');
  });

  it('filters by type', () => {
    const events = filterHistory(session, { type: 'artifact_created' });
    expect(events).toHaveLength(1);
    expect(events[0].detail).toContain('dark-alley');
  });

  it('filters by group (build)', () => {
    const events = filterHistory(session, { group: 'build' });
    expect(events).toHaveLength(2);
  });

  it('filters by group (experiment)', () => {
    const events = filterHistory(session, { group: 'experiment' });
    expect(events).toHaveLength(1);
  });

  it('filters by group (tuning)', () => {
    const events = filterHistory(session, { group: 'tuning' });
    expect(events).toHaveLength(1);
  });

  it('filters by group (content)', () => {
    const events = filterHistory(session, { group: 'content' });
    expect(events).toHaveLength(1);
  });

  it('filters by grep', () => {
    const events = filterHistory(session, { grep: 'paranoia' });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('tune_plan_created');
  });

  it('grep is case-insensitive', () => {
    const events = filterHistory(session, { grep: 'NOIR' });
    expect(events).toHaveLength(1);
  });

  it('combines group + tail', () => {
    const events = filterHistory(session, { group: 'build', tail: 1 });
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('build_step_executed');
  });

  it('returns empty with no matches', () => {
    const events = filterHistory(session, { type: 'session_start' });
    expect(events).toHaveLength(0);
  });
});

describe('formatHistoryBrowser', () => {
  it('shows session name and count', () => {
    const session = makeSession({
      history: [makeEvent('session_start', 'Started')],
    });
    const events = filterHistory(session, {});
    const output = formatHistoryBrowser(events, session, {});
    expect(output).toContain('test-session');
    expect(output).toContain('Total events: 1');
    expect(output).toContain('showing: 1');
  });

  it('shows active filters', () => {
    const session = makeSession({ history: [] });
    const filter: HistoryFilter = { group: 'build', tail: 5 };
    const output = formatHistoryBrowser([], session, filter);
    expect(output).toContain('group=build');
    expect(output).toContain('tail=5');
  });

  it('shows "No matching events" when empty', () => {
    const session = makeSession({ history: [] });
    const output = formatHistoryBrowser([], session, {});
    expect(output).toContain('No matching events');
  });
});

// ============================================================
// Pillar 3 — Issue & Finding Navigation
// ============================================================

describe('filterIssues', () => {
  const session = makeSession({
    issues: [
      makeIssue({ code: 'balance_drift', severity: 'high', status: 'open', target: 'district-1' }),
      makeIssue({ code: 'balance_spike', severity: 'medium', status: 'open', target: 'district-2' }),
      makeIssue({ code: 'content_gap', severity: 'low', status: 'resolved', target: 'room-1' }),
      makeIssue({ code: 'balance_decay', severity: 'high', status: 'open', target: 'district-1' }),
    ],
  });

  it('defaults to open issues', () => {
    const issues = filterIssues(session, {});
    expect(issues).toHaveLength(3);
  });

  it('filters by status=resolved', () => {
    const issues = filterIssues(session, { status: 'resolved' });
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('content_gap');
  });

  it('filters by status=all', () => {
    const issues = filterIssues(session, { status: 'all' });
    expect(issues).toHaveLength(4);
  });

  it('filters by severity', () => {
    const issues = filterIssues(session, { severity: 'high' });
    expect(issues).toHaveLength(2);
  });

  it('filters by bucket (partial match)', () => {
    const issues = filterIssues(session, { bucket: 'balance' });
    expect(issues).toHaveLength(3); // drift + spike + decay (all open with balance in code)
  });

  it('filters by grep', () => {
    const issues = filterIssues(session, { grep: 'spike' });
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('balance_spike');
  });

  it('grep matches target', () => {
    const issues = filterIssues(session, { grep: 'district-2' });
    expect(issues).toHaveLength(1);
  });

  it('grep is case-insensitive', () => {
    const issues = filterIssues(session, { grep: 'SPIKE' });
    expect(issues).toHaveLength(1);
  });

  it('combines severity + status', () => {
    const issues = filterIssues(session, { severity: 'high', status: 'open' });
    expect(issues).toHaveLength(2);
  });

  it('returns empty with no matches', () => {
    const issues = filterIssues(session, { severity: 'low' }); // open only, but low is resolved
    expect(issues).toHaveLength(0);
  });
});

describe('formatIssueBrowser', () => {
  it('shows session name and totals', () => {
    const session = makeSession({
      issues: [makeIssue()],
    });
    const issues = filterIssues(session, {});
    const output = formatIssueBrowser(issues, session, {});
    expect(output).toContain('test-session');
    expect(output).toContain('1 open');
  });

  it('shows severity icons', () => {
    const session = makeSession({
      issues: [makeIssue({ severity: 'high' })],
    });
    const issues = filterIssues(session, {});
    const output = formatIssueBrowser(issues, session, {});
    expect(output).toContain('[high]');
    expect(output).toContain('●');
  });

  it('shows "No matching issues" when empty', () => {
    const session = makeSession();
    const output = formatIssueBrowser([], session, {});
    expect(output).toContain('No matching issues');
  });
});

describe('gatherFindings', () => {
  const analysis = makeBalanceAnalysis({
    findings: [
      { severity: 'warning', code: 'bal_1', summary: 'Paranoia drift', area: 'district-1', category: 'difficulty', likelyCause: 'flat curve' },
      { severity: 'warning', code: 'bal_2', summary: 'Combat spike', area: 'district-2', category: 'escalation', likelyCause: 'fast ramp' },
    ],
  });
  const experiment = makeExperimentSummary({
    varianceFindings: [
      { severity: 'high', code: 'var_1', metric: 'paranoia', summary: 'High variance paranoia', suggestion: 'Lower gain' },
      { severity: 'low', code: 'var_2', metric: 'escalation', summary: 'Stable escalation', suggestion: '' },
    ],
  });

  it('returns all findings by default', () => {
    const findings = gatherFindings(analysis, experiment);
    expect(findings).toHaveLength(4);
  });

  it('filters by source=balance', () => {
    const findings = gatherFindings(analysis, experiment, { source: 'balance' });
    expect(findings).toHaveLength(2);
    expect(findings.every(f => f.source === 'balance')).toBe(true);
  });

  it('filters by source=experiment', () => {
    const findings = gatherFindings(analysis, experiment, { source: 'experiment' });
    expect(findings).toHaveLength(2);
    expect(findings.every(f => f.source === 'experiment')).toBe(true);
  });

  it('filters by severity', () => {
    const findings = gatherFindings(analysis, experiment, { severity: 'warning' });
    expect(findings).toHaveLength(2);
  });

  it('filters by artifact/area', () => {
    const findings = gatherFindings(analysis, experiment, { artifact: 'district-1' });
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('bal_1');
  });

  it('limits to recent 10 when recent=true', () => {
    const bigAnalysis = makeBalanceAnalysis({
      findings: Array.from({ length: 15 }, (_, i) => ({
        severity: 'warning' as const,
        code: `bal_${i}`,
        summary: `Finding ${i}`,
        area: 'x',
        category: 'difficulty' as const,
        likelyCause: 'unknown',
      })),
    });
    const findings = gatherFindings(bigAnalysis, null, { recent: true });
    expect(findings).toHaveLength(10);
  });

  it('returns empty when both null', () => {
    const findings = gatherFindings(null, null);
    expect(findings).toHaveLength(0);
  });
});

describe('formatFindingBrowser', () => {
  it('shows finding count', () => {
    const findings = gatherFindings(
      makeBalanceAnalysis({ findings: [{ severity: 'warning', code: 'x', summary: 'Test', area: '', category: 'difficulty', likelyCause: 'unknown' }] }),
      null,
    );
    const output = formatFindingBrowser(findings);
    expect(output).toContain('Findings (1)');
    expect(output).toContain('Balance: 1');
  });

  it('shows "No findings" when empty', () => {
    const output = formatFindingBrowser([]);
    expect(output).toContain('No findings to display');
  });

  it('shows source tags', () => {
    const findings = gatherFindings(
      makeBalanceAnalysis({ findings: [{ severity: 'warning', code: 'x', summary: 'T', area: '', category: 'difficulty', likelyCause: 'unknown' }] }),
      makeExperimentSummary({ varianceFindings: [{ severity: 'low', code: 'y', metric: 'stability', summary: 'V' }] }),
    );
    const output = formatFindingBrowser(findings);
    expect(output).toContain('[BAL]');
    expect(output).toContain('[EXP]');
  });
});

// ============================================================
// Pillar 4 — Experiment Browser
// ============================================================

describe('buildExperimentEntry', () => {
  it('extracts key fields from ExperimentSummary', () => {
    const summary = makeExperimentSummary();
    const entry = buildExperimentEntry(summary);
    expect(entry.id).toBe('exp-1');
    expect(entry.label).toBe('Baseline');
    expect(entry.completedRuns).toBe(20);
    expect(entry.failedRuns).toBe(0);
    expect(entry.varianceFindingsCount).toBe(0);
  });

  it('includes focus metrics from aggregate means', () => {
    const summary = makeExperimentSummary();
    const entry = buildExperimentEntry(summary);
    expect(entry.focusMetrics).toHaveProperty('paranoia');
    expect(entry.focusMetrics.paranoia).toBeCloseTo(0.6);
  });

  it('includes rates from aggregate', () => {
    const summary = makeExperimentSummary();
    const entry = buildExperimentEntry(summary);
    expect(entry.rates).toHaveProperty('escalation');
    expect(entry.rates.escalation).toBeCloseTo(0.25);
  });

  it('counts variance findings', () => {
    const summary = makeExperimentSummary({
      varianceFindings: [
        { severity: 'high', code: 'v1', metric: 'paranoia', summary: 'Test' },
        { severity: 'low', code: 'v2', metric: 'stability', summary: 'Test 2' },
      ],
    });
    const entry = buildExperimentEntry(summary);
    expect(entry.varianceFindingsCount).toBe(2);
  });
});

describe('formatExperimentBrowser', () => {
  it('shows "No experiments" when empty', () => {
    const output = formatExperimentBrowser([]);
    expect(output).toContain('No experiments recorded yet');
  });

  it('shows experiment label and runs', () => {
    const output = formatExperimentBrowser([makeExperimentSummary()]);
    expect(output).toContain('Baseline');
    expect(output).toContain('20 completed');
  });

  it('shows comparison when provided', () => {
    const output = formatExperimentBrowser(
      [makeExperimentSummary()],
      { verdict: 'improved', improvements: ['paranoia reduced'], regressions: [] },
    );
    expect(output).toContain('Verdict: improved');
    expect(output).toContain('paranoia reduced');
  });

  it('shows regressions', () => {
    const output = formatExperimentBrowser(
      [makeExperimentSummary()],
      { verdict: 'mixed', improvements: [], regressions: ['stability dropped'] },
    );
    expect(output).toContain('stability dropped');
  });
});

// ============================================================
// Pillar 5 — Command Discovery
// ============================================================

describe('COMMAND_GROUPS', () => {
  it('has 7 groups', () => {
    expect(COMMAND_GROUPS).toHaveLength(7);
  });

  it('includes Studio group', () => {
    expect(COMMAND_GROUPS.some(g => g.name === 'Studio')).toBe(true);
  });

  it('includes Scaffold group', () => {
    expect(COMMAND_GROUPS.some(g => g.name === 'Scaffold')).toBe(true);
  });

  it('includes Tune group', () => {
    expect(COMMAND_GROUPS.some(g => g.name === 'Tune')).toBe(true);
  });

  it('includes Experiment group', () => {
    expect(COMMAND_GROUPS.some(g => g.name === 'Experiment')).toBe(true);
  });

  it('every command has cmd and description', () => {
    for (const group of COMMAND_GROUPS) {
      for (const cmd of group.commands) {
        expect(cmd.cmd).toBeTruthy();
        expect(cmd.description).toBeTruthy();
      }
    }
  });
});

describe('COMMAND_ALIASES', () => {
  it('resolves dash to studio', () => {
    expect(COMMAND_ALIASES['dash']).toBe('studio');
  });

  it('resolves exp to experiments', () => {
    expect(COMMAND_ALIASES['exp']).toBe('experiments');
  });

  it('resolves fx to findings', () => {
    expect(COMMAND_ALIASES['fx']).toBe('findings');
  });

  it('resolves ctx to context', () => {
    expect(COMMAND_ALIASES['ctx']).toBe('context');
  });

  it('resolves src to sources', () => {
    expect(COMMAND_ALIASES['src']).toBe('sources');
  });
});

describe('resolveAlias', () => {
  it('resolves known aliases', () => {
    expect(resolveAlias('dash')).toBe('studio');
    expect(resolveAlias('exp')).toBe('experiments');
    expect(resolveAlias('fx')).toBe('findings');
  });

  it('returns original for unknown commands', () => {
    expect(resolveAlias('build')).toBe('build');
    expect(resolveAlias('quit')).toBe('quit');
  });

  it('is case-sensitive (lowercase input expected)', () => {
    expect(resolveAlias('DASH')).toBe('DASH');
  });
});

describe('formatGroupedHelp', () => {
  it('shows all groups without topic', () => {
    const output = formatGroupedHelp();
    expect(output).toContain('AI RPG ENGINE — Commands');
    expect(output).toContain('Studio');
    expect(output).toContain('Scaffold');
    expect(output).toContain('Diagnose');
    expect(output).toContain('Tune');
    expect(output).toContain('Experiment');
    expect(output).toContain('Context');
    expect(output).toContain('General');
  });

  it('drills into a group topic', () => {
    const output = formatGroupedHelp('studio');
    expect(output).toContain('Studio');
    expect(output).toContain('/studio');
    expect(output).toContain('/history');
    expect(output).not.toContain('AI RPG ENGINE — Commands');
  });

  it('drills into tune group', () => {
    const output = formatGroupedHelp('tune');
    expect(output).toContain('Tune');
    expect(output).toContain('/tune <goal>');
    expect(output).toContain('/tune-preview');
  });

  it('shows help for specific command', () => {
    const output = formatGroupedHelp('studio');
    expect(output).toContain('/studio');
  });

  it('shows "No help found" for unknown topic', () => {
    const output = formatGroupedHelp('nonexistent');
    expect(output).toContain('No help found');
  });

  it('includes tip at the end of full help', () => {
    const output = formatGroupedHelp();
    expect(output).toContain('Tip: /help <group>');
  });
});

// ============================================================
// Pillar 6 — Onboarding
// ============================================================

describe('ONBOARDING_STEPS', () => {
  it('has 8 steps', () => {
    expect(ONBOARDING_STEPS).toHaveLength(8);
  });

  it('starts with "Start a session"', () => {
    expect(ONBOARDING_STEPS[0].title).toBe('Start a session');
  });

  it('ends with "Check studio"', () => {
    expect(ONBOARDING_STEPS[7].title).toBe('Check studio');
  });

  it('every step has id, title, description, command', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(step.id).toBeGreaterThan(0);
      expect(step.title).toBeTruthy();
      expect(step.description).toBeTruthy();
      expect(step.command).toBeTruthy();
    }
  });
});

describe('formatOnboarding', () => {
  it('contains the header', () => {
    const output = formatOnboarding();
    expect(output).toContain('AI RPG ENGINE — Getting Started');
  });

  it('lists all 8 steps', () => {
    const output = formatOnboarding();
    for (let i = 1; i <= 8; i++) {
      expect(output).toContain(`${i}.`);
    }
  });

  it('includes workflow group references', () => {
    const output = formatOnboarding();
    expect(output).toContain('/help studio');
    expect(output).toContain('/help scaffold');
    expect(output).toContain('/help tune');
    expect(output).toContain('/help experiment');
  });
});

// ============================================================
// Pillar 7 — State Summaries
// ============================================================

describe('detectStateSummaryKind', () => {
  it('detects focus queries', () => {
    expect(detectStateSummaryKind('What should I focus on?')).toBe('focus');
    expect(detectStateSummaryKind('what to focus on right now')).toBe('focus');
  });

  it('detects changes queries', () => {
    expect(detectStateSummaryKind('What changed recently?')).toBe('changes');
    expect(detectStateSummaryKind('what has changed since last time')).toBe('changes');
  });

  it('detects issues queries', () => {
    expect(detectStateSummaryKind('What are my highest-impact issues?')).toBe('issues');
    expect(detectStateSummaryKind('show me top issues')).toBe('issues');
    expect(detectStateSummaryKind('critical issues please')).toBe('issues');
  });

  it('detects experiment picture queries', () => {
    expect(detectStateSummaryKind('Show me the experiment picture')).toBe('picture');
    expect(detectStateSummaryKind('current experiment status')).toBe('picture');
  });

  it('detects next-step queries', () => {
    expect(detectStateSummaryKind('What should I do next?')).toBe('next');
    expect(detectStateSummaryKind("what's next")).toBe('next');
    expect(detectStateSummaryKind('next step please')).toBe('next');
  });

  it('returns null for unrecognized messages', () => {
    expect(detectStateSummaryKind('create a room about a haunted library')).toBeNull();
    expect(detectStateSummaryKind('hello')).toBeNull();
  });
});

describe('buildStateSummary', () => {
  it('returns "No active session" when null', () => {
    const result = buildStateSummary('focus', null);
    expect(result).toContain('No active session');
  });

  it('returns focus areas with actions', () => {
    const session = makeSession();
    const result = buildStateSummary('focus', session);
    expect(result).toContain('Focus areas:');
    expect(result).toContain('→');
  });

  it('returns focus with top issues when present', () => {
    const session = makeSession({
      issues: [makeIssue({ severity: 'high', code: 'drift_1', summary: 'Major drift' })],
    });
    const result = buildStateSummary('focus', session);
    expect(result).toContain('Top issues:');
    expect(result).toContain('[high]');
  });

  it('returns changes from recent history', () => {
    const session = makeSession({
      history: [makeEvent('artifact_created', 'room: dark-alley')],
    });
    const result = buildStateSummary('changes', session);
    expect(result).toContain('Recent changes:');
    expect(result).toContain('artifact_created');
  });

  it('returns "No recent events" when history empty', () => {
    const session = makeSession();
    const result = buildStateSummary('changes', session);
    expect(result).toContain('No recent events');
  });

  it('returns highest-impact issues sorted by severity', () => {
    const session = makeSession({
      issues: [
        makeIssue({ severity: 'low', code: 'minor' }),
        makeIssue({ severity: 'high', code: 'critical_drift' }),
        makeIssue({ severity: 'medium', code: 'moderate' }),
      ],
    });
    const result = buildStateSummary('issues', session);
    expect(result).toContain('Highest-impact');
    // First issue should be high severity
    const lines = result.split('\n');
    const firstIssue = lines.find(l => l.includes('[high]'));
    expect(firstIssue).toBeTruthy();
  });

  it('returns "No open issues" when none', () => {
    const session = makeSession();
    const result = buildStateSummary('issues', session);
    expect(result).toContain('No open issues');
  });

  it('returns experiment picture when experiments exist', () => {
    const session = makeSession();
    const exp = makeExperimentSummary();
    const result = buildStateSummary('picture', session, { lastExperiment: exp });
    expect(result).toContain('Experiments');
    expect(result).toContain('Baseline');
  });

  it('returns "No experiments yet" when none', () => {
    const session = makeSession();
    const result = buildStateSummary('picture', session);
    expect(result).toContain('No experiments yet');
  });

  it('returns suggested next steps', () => {
    const session = makeSession();
    const result = buildStateSummary('next', session);
    expect(result).toContain('Suggested next steps:');
    expect(result).toContain('→');
  });
});

// ============================================================
// Pillar 8 — Output Polish
// ============================================================

describe('formatHeading', () => {
  it('creates a heading line with dashes', () => {
    const heading = formatHeading('Test');
    expect(heading).toContain('── Test');
    expect(heading).toContain('─');
  });

  it('adjusts dash length for longer titles', () => {
    const short = formatHeading('Hi');
    const long = formatHeading('A Longer Heading Title');
    // Longer titles use more space for text, so fewer dashes
    expect(short).toContain('──');
    expect(long).toContain('──');
    // The long heading has fewer trailing dashes
    const shortDashes = (short.match(/─/g) ?? []).length;
    const longDashes = (long.match(/─/g) ?? []).length;
    expect(shortDashes).toBeGreaterThan(longDashes);
  });
});

describe('formatSection', () => {
  it('combines heading and body', () => {
    const output = formatSection('Title', 'Body text here');
    expect(output).toContain('Title');
    expect(output).toContain('Body text here');
    expect(output).toContain('──');
  });
});

describe('paginate', () => {
  const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`);

  it('returns first page by default', () => {
    const result = paginate(lines, 1, 20);
    expect(result.current).toBe(1);
    expect(result.total).toBe(3);
    expect(result.hasMore).toBe(true);
    expect(result.text).toContain('Line 1');
    expect(result.text).toContain('Line 20');
    expect(result.text).not.toContain('Line 21');
  });

  it('returns second page', () => {
    const result = paginate(lines, 2, 20);
    expect(result.current).toBe(2);
    expect(result.text).toContain('Line 21');
    expect(result.text).toContain('Line 40');
  });

  it('returns last page', () => {
    const result = paginate(lines, 3, 20);
    expect(result.current).toBe(3);
    expect(result.hasMore).toBe(false);
    expect(result.text).toContain('Line 41');
    expect(result.text).toContain('Line 50');
  });

  it('clamps to valid page range', () => {
    const result = paginate(lines, 99, 20);
    expect(result.current).toBe(3);
  });

  it('clamps negative pages to 1', () => {
    const result = paginate(lines, 0, 20);
    expect(result.current).toBe(1);
  });

  it('handles fewer lines than page size', () => {
    const result = paginate(['a', 'b'], 1, 20);
    expect(result.total).toBe(1);
    expect(result.hasMore).toBe(false);
    expect(result.text).toContain('a');
    expect(result.text).toContain('b');
  });

  it('includes page footer for multi-page', () => {
    const result = paginate(lines, 1, 20);
    expect(result.text).toContain('Page 1/3');
  });
});

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncate('hello', 80)).toBe('hello');
  });

  it('truncates long strings with ellipsis', () => {
    const long = 'a'.repeat(100);
    const result = truncate(long, 20);
    expect(result.length).toBe(20);
    expect(result.endsWith('…')).toBe(true);
  });

  it('uses default maxLen of 80', () => {
    const long = 'a'.repeat(100);
    const result = truncate(long);
    expect(result.length).toBe(80);
  });

  it('handles exact-length strings', () => {
    const exact = 'a'.repeat(80);
    expect(truncate(exact)).toBe(exact);
  });
});

// ============================================================
// Router integration — new studio intents
// ============================================================

describe('router: studio intents', () => {
  // Import router directly for testing keyword classification
  let classifyByKeywords: typeof import('./chat-router.js').classifyByKeywords;

  beforeEach(async () => {
    const router = await import('./chat-router.js');
    classifyByKeywords = router.classifyByKeywords;
  });

  it('classifies /studio as studio_status', () => {
    const r = classifyByKeywords('/studio');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('studio_status');
  });

  it('classifies /dashboard as studio_status', () => {
    const r = classifyByKeywords('/dashboard');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('studio_status');
  });

  it('classifies "show me the dashboard" as studio_status', () => {
    const r = classifyByKeywords('show me the dashboard');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('studio_status');
  });

  it('classifies /history as studio_history', () => {
    const r = classifyByKeywords('/history');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('studio_history');
  });

  it('classifies "show me the history" as studio_history', () => {
    const r = classifyByKeywords('show me the history');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('studio_history');
  });

  it('classifies /issues as studio_issues', () => {
    const r = classifyByKeywords('/issues');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('studio_issues');
  });

  it('classifies "all issues" as studio_issues', () => {
    const r = classifyByKeywords('all issues');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('studio_issues');
  });

  it('classifies /findings as studio_findings', () => {
    const r = classifyByKeywords('/findings');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('studio_findings');
  });

  it('classifies "balance findings" as studio_findings', () => {
    const r = classifyByKeywords('balance findings');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('studio_findings');
  });

  it('classifies /experiments as studio_experiments', () => {
    const r = classifyByKeywords('/experiments');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('studio_experiments');
  });

  it('classifies "list experiments" as studio_experiments', () => {
    const r = classifyByKeywords('list experiments');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('studio_experiments');
  });
});

// ============================================================
// Personality integration — new studio intent profiles
// ============================================================

describe('personality: studio intent profiles', () => {
  let getProfileForIntent: typeof import('./chat-personality.js').getProfileForIntent;

  beforeEach(async () => {
    const personality = await import('./chat-personality.js');
    getProfileForIntent = personality.getProfileForIntent;
  });

  it('maps studio_status to worldbuilder', () => {
    const profile = getProfileForIntent('studio_status');
    expect(profile.name).toBe('worldbuilder');
  });

  it('maps studio_history to worldbuilder', () => {
    const profile = getProfileForIntent('studio_history');
    expect(profile.name).toBe('worldbuilder');
  });

  it('maps studio_issues to analyst', () => {
    const profile = getProfileForIntent('studio_issues');
    expect(profile.name).toBe('analyst');
  });

  it('maps studio_findings to analyst', () => {
    const profile = getProfileForIntent('studio_findings');
    expect(profile.name).toBe('analyst');
  });

  it('maps studio_experiments to analyst', () => {
    const profile = getProfileForIntent('studio_experiments');
    expect(profile.name).toBe('analyst');
  });
});

// ============================================================
// Tool registry integration — new studio tools
// ============================================================

describe('tool registry: studio tools', () => {
  let findToolForIntent: typeof import('./chat-tools.js').findToolForIntent;
  let getAllTools: typeof import('./chat-tools.js').getAllTools;

  beforeEach(async () => {
    const tools = await import('./chat-tools.js');
    findToolForIntent = tools.findToolForIntent;
    getAllTools = tools.getAllTools;
  });

  it('finds tool for studio_status', () => {
    const tool = findToolForIntent('studio_status');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('studio-status');
  });

  it('finds tool for studio_history', () => {
    const tool = findToolForIntent('studio_history');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('studio-history');
  });

  it('finds tool for studio_issues', () => {
    const tool = findToolForIntent('studio_issues');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('studio-issues');
  });

  it('finds tool for studio_findings', () => {
    const tool = findToolForIntent('studio_findings');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('studio-findings');
  });

  it('finds tool for studio_experiments', () => {
    const tool = findToolForIntent('studio_experiments');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('studio-experiments');
  });

  it('total tool count is 34 (29 + 5 studio)', () => {
    const all = getAllTools();
    expect(all.length).toBe(34);
  });

  it('studio tools are read-only (mutates: false)', () => {
    const studioIntents = ['studio_status', 'studio_history', 'studio_issues', 'studio_findings', 'studio_experiments'];
    for (const intent of studioIntents) {
      const tool = findToolForIntent(intent);
      expect(tool!.mutates).toBe(false);
    }
  });
});
