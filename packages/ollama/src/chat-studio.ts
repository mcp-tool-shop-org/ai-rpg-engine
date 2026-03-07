// Chat studio — v1.9.0 Studio UX layer.
// Dashboard, browsers, onboarding, command discovery, display modes.
// All functions are pure data → string formatters. No LLM calls, no file I/O.

import type {
  DesignSession, SessionEvent, SessionEventKind, SessionIssue,
} from './session.js';
import type { ExperimentSummary, VarianceFinding } from './chat-experiments.js';
import type { BalanceAnalysis, BalanceFinding } from './chat-balance-analyzer.js';
import type { BuildState } from './chat-build-planner.js';
import type { TuningState } from './chat-balance-analyzer.js';

// ============================================================
// Display modes
// ============================================================

export type DisplayMode = 'compact' | 'verbose';

let currentDisplayMode: DisplayMode = 'compact';

export function setDisplayMode(mode: DisplayMode): void {
  currentDisplayMode = mode;
}

export function getDisplayMode(): DisplayMode {
  return currentDisplayMode;
}

// ============================================================
// Pillar 1 — Studio Dashboard
// ============================================================

export type StudioSnapshot = {
  sessionName: string | null;
  themes: string[];
  constraints: string[];
  artifactCounts: Record<string, number>;
  totalArtifacts: number;
  openIssues: SessionIssue[];
  issueBuckets: Record<string, number>;
  issueBySeverity: Record<string, number>;
  acceptedSuggestionCount: number;
  recentExperiments: ExperimentSummary[];
  recentFindings: VarianceFinding[];
  balanceFindings: BalanceFinding[];
  activeBuild: { goal: string; status: string; progress: string } | null;
  activeTuning: { goal: string; status: string; progress: string } | null;
  recentHistory: SessionEvent[];
  suggestedActions: string[];
};

export function buildStudioSnapshot(
  session: DesignSession | null,
  opts: {
    lastExperiment?: ExperimentSummary | null;
    baselineExperiment?: ExperimentSummary | null;
    lastAnalysis?: BalanceAnalysis | null;
    activeBuild?: BuildState | null;
    activeTuning?: TuningState | null;
  } = {},
): StudioSnapshot {
  const {
    lastExperiment = null,
    baselineExperiment = null,
    lastAnalysis = null,
    activeBuild = null,
    activeTuning = null,
  } = opts;

  if (!session) {
    return {
      sessionName: null,
      themes: [],
      constraints: [],
      artifactCounts: {},
      totalArtifacts: 0,
      openIssues: [],
      issueBuckets: {},
      issueBySeverity: {},
      acceptedSuggestionCount: 0,
      recentExperiments: [],
      recentFindings: [],
      balanceFindings: [],
      activeBuild: null,
      activeTuning: null,
      recentHistory: [],
      suggestedActions: ['Start a session: create a .ai-session.json or use the engine API.'],
    };
  }

  // Artifact counts
  const artifactCounts: Record<string, number> = {};
  let totalArtifacts = 0;
  for (const [kind, items] of Object.entries(session.artifacts)) {
    artifactCounts[kind] = items.length;
    totalArtifacts += items.length;
  }

  // Issues
  const openIssues = session.issues.filter(i => i.status === 'open');
  const issueBuckets: Record<string, number> = {};
  const issueBySeverity: Record<string, number> = { high: 0, medium: 0, low: 0 };
  for (const issue of openIssues) {
    const bucket = issue.code.split('_').slice(0, -1).join('_') || issue.code;
    issueBuckets[bucket] = (issueBuckets[bucket] ?? 0) + 1;
    issueBySeverity[issue.severity] = (issueBySeverity[issue.severity] ?? 0) + 1;
  }

  // Experiments
  const recentExperiments: ExperimentSummary[] = [];
  if (lastExperiment) recentExperiments.push(lastExperiment);
  if (baselineExperiment) recentExperiments.push(baselineExperiment);

  // Variance findings from last experiment
  const recentFindings = lastExperiment?.varianceFindings ?? [];

  // Balance findings from last analysis
  const balanceFindings = lastAnalysis?.findings ?? [];

  // Recent history (last 10)
  const recentHistory = (session.history ?? []).slice(-10);

  // Active build
  let buildInfo: StudioSnapshot['activeBuild'] = null;
  if (activeBuild) {
    const total = activeBuild.plan.steps.length;
    const done = activeBuild.plan.steps.filter(s => s.status === 'executed').length;
    buildInfo = {
      goal: activeBuild.plan.goal,
      status: activeBuild.status,
      progress: `${done}/${total} steps`,
    };
  }

  // Active tuning
  let tuningInfo: StudioSnapshot['activeTuning'] = null;
  if (activeTuning) {
    const total = activeTuning.plan.steps.length;
    const done = activeTuning.plan.steps.filter(s => s.status === 'executed').length;
    tuningInfo = {
      goal: activeTuning.plan.goal,
      status: activeTuning.status,
      progress: `${done}/${total} steps`,
    };
  }

  // Suggested next actions
  const suggestedActions = deriveSuggestedActions(session, openIssues, lastExperiment, lastAnalysis, activeBuild, activeTuning);

  return {
    sessionName: session.name,
    themes: session.themes,
    constraints: session.constraints,
    artifactCounts,
    totalArtifacts,
    openIssues,
    issueBuckets,
    issueBySeverity,
    acceptedSuggestionCount: session.acceptedSuggestions.length,
    recentExperiments,
    recentFindings,
    balanceFindings,
    activeBuild: buildInfo,
    activeTuning: tuningInfo,
    recentHistory,
    suggestedActions,
  };
}

function deriveSuggestedActions(
  session: DesignSession,
  openIssues: SessionIssue[],
  lastExperiment: ExperimentSummary | null,
  lastAnalysis: BalanceAnalysis | null,
  activeBuild: BuildState | null,
  activeTuning: TuningState | null,
): string[] {
  const actions: string[] = [];

  // Active build or tuning takes priority
  if (activeBuild && activeBuild.status !== 'completed' && activeBuild.status !== 'failed') {
    actions.push(`Continue build: /step or /execute (${activeBuild.plan.goal})`);
  }
  if (activeTuning && activeTuning.status !== 'completed' && activeTuning.status !== 'failed') {
    actions.push(`Continue tuning: /tune-step or /tune-execute (${activeTuning.plan.goal})`);
  }

  // High-severity issues
  const highIssues = openIssues.filter(i => i.severity === 'high');
  if (highIssues.length > 0) {
    actions.push(`Resolve ${highIssues.length} high-severity issue${highIssues.length > 1 ? 's' : ''}: /issues --severity high`);
  }

  // Balance findings
  if (lastAnalysis && lastAnalysis.findings.length > 0) {
    const criticals = lastAnalysis.findings.filter(f => f.severity === 'critical');
    if (criticals.length > 0) {
      actions.push(`Address ${criticals.length} critical balance finding${criticals.length > 1 ? 's' : ''}: /findings`);
    }
  }

  // Experiment suggestions
  if (lastExperiment && lastExperiment.varianceFindings.length > 0) {
    actions.push(`Review ${lastExperiment.varianceFindings.length} variance finding${lastExperiment.varianceFindings.length > 1 ? 's' : ''}: /experiment-findings`);
  }

  // If no content yet
  if (session.artifacts.districts.length === 0 && session.artifacts.rooms.length === 0) {
    actions.push('Create your first content: /build <goal>');
  }

  // If no analysis yet
  if (!lastAnalysis && session.artifacts.districts.length > 0) {
    actions.push('Run balance analysis: /analyze-balance <replay>');
  }

  // If accepted suggestions pending
  if (session.acceptedSuggestions.length > 0) {
    actions.push(`${session.acceptedSuggestions.length} accepted suggestion${session.acceptedSuggestions.length > 1 ? 's' : ''} pending application`);
  }

  if (actions.length === 0) {
    actions.push('Looking good! Try /build <goal> or ask a question to keep going.');
  }

  return actions;
}

export function formatStudioDashboard(snapshot: StudioSnapshot): string {
  const lines: string[] = [];
  const mode = getDisplayMode();

  lines.push('AI RPG ENGINE — Studio Status');
  lines.push('');

  if (!snapshot.sessionName) {
    lines.push('No active session.');
    lines.push('');
    lines.push('Suggested next:');
    for (const action of snapshot.suggestedActions) {
      lines.push(`  → ${action}`);
    }
    return lines.join('\n');
  }

  // Session header
  lines.push(`Session: ${snapshot.sessionName}`);
  if (snapshot.themes.length > 0) {
    lines.push(`Themes: ${snapshot.themes.join(', ')}`);
  }
  if (snapshot.constraints.length > 0 && mode === 'verbose') {
    lines.push(`Constraints: ${snapshot.constraints.join(', ')}`);
  }

  // Artifacts
  const artParts = Object.entries(snapshot.artifactCounts)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${count} ${kind}`);
  if (artParts.length > 0) {
    lines.push(`Artifacts: ${artParts.join(', ')}`);
  } else {
    lines.push('Artifacts: (none)');
  }

  // Open issues
  if (snapshot.openIssues.length > 0) {
    const sevParts = Object.entries(snapshot.issueBySeverity)
      .filter(([, count]) => count > 0)
      .map(([sev, count]) => `${sev}: ${count}`)
      .join('   ');
    lines.push(`Open issues: ${snapshot.openIssues.length}`);
    lines.push(`  ${sevParts}`);

    // Top buckets
    const topBuckets = Object.entries(snapshot.issueBuckets)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    if (topBuckets.length > 0 && mode === 'verbose') {
      lines.push('  Top buckets:');
      for (const [bucket, count] of topBuckets) {
        lines.push(`    ${bucket} (${count})`);
      }
    }
  } else {
    lines.push('Open issues: 0');
  }

  // Active workflows
  if (snapshot.activeBuild) {
    lines.push('');
    lines.push(`Active build: ${snapshot.activeBuild.goal} [${snapshot.activeBuild.status}] ${snapshot.activeBuild.progress}`);
  }
  if (snapshot.activeTuning) {
    lines.push(`Active tuning: ${snapshot.activeTuning.goal} [${snapshot.activeTuning.status}] ${snapshot.activeTuning.progress}`);
  }

  // Recent experiments
  if (snapshot.recentExperiments.length > 0) {
    lines.push('');
    lines.push('Recent experiments:');
    for (const exp of snapshot.recentExperiments) {
      const rates = Object.entries(exp.aggregate.rates)
        .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`)
        .join(', ');
      const means = Object.entries(exp.aggregate.means)
        .slice(0, 3)
        .map(([k, v]) => `${k} ${typeof v === 'number' ? v.toFixed(1) : v}`)
        .join(', ');
      lines.push(`  ${exp.spec.label ?? exp.spec.id} — ${exp.completedRuns} runs, ${means}${rates ? ', ' + rates : ''}`);
    }
  }

  // Recent findings
  if (snapshot.recentFindings.length > 0 && mode === 'verbose') {
    lines.push('');
    lines.push('Recent variance findings:');
    for (const f of snapshot.recentFindings.slice(0, 4)) {
      lines.push(`  [${f.severity}] ${f.summary}`);
    }
  }

  // Balance findings
  if (snapshot.balanceFindings.length > 0 && mode === 'verbose') {
    lines.push('');
    lines.push('Balance findings:');
    for (const f of snapshot.balanceFindings.slice(0, 4)) {
      lines.push(`  [${f.severity}] ${f.code}: ${f.summary}`);
    }
  }

  // Suggested next
  lines.push('');
  lines.push('Suggested next:');
  for (const action of snapshot.suggestedActions.slice(0, 5)) {
    lines.push(`  → ${action}`);
  }

  return lines.join('\n');
}

// ============================================================
// Pillar 2 — Session History Browser
// ============================================================

export type HistoryFilter = {
  tail?: number;
  type?: SessionEventKind;
  grep?: string;
  group?: 'build' | 'tuning' | 'experiment' | 'content' | 'all';
};

const EVENT_GROUPS: Record<string, SessionEventKind[]> = {
  build: ['build_plan_created', 'build_step_executed', 'build_step_failed', 'build_plan_completed'],
  tuning: [
    'tune_plan_created', 'tune_step_executed', 'tune_step_failed', 'tune_plan_completed',
    'tuning_step_previewed', 'tuning_step_applied', 'tuning_bundle_created',
  ],
  experiment: [
    'experiment_plan_created', 'experiment_started', 'experiment_run_completed',
    'experiment_sweep_completed', 'experiment_compared', 'experiment_findings_added',
  ],
  content: ['artifact_created', 'content_applied', 'suggestion_accepted', 'suggestion_generated'],
};

export function filterHistory(session: DesignSession, filter: HistoryFilter): SessionEvent[] {
  let events = session.history ?? [];

  // Group filter
  if (filter.group && filter.group !== 'all') {
    const kinds = EVENT_GROUPS[filter.group];
    if (kinds) {
      events = events.filter(e => kinds.includes(e.kind));
    }
  }

  // Type filter
  if (filter.type) {
    events = events.filter(e => e.kind === filter.type);
  }

  // Grep filter (case-insensitive)
  if (filter.grep) {
    const pattern = filter.grep.toLowerCase();
    events = events.filter(e =>
      e.detail.toLowerCase().includes(pattern)
      || e.kind.toLowerCase().includes(pattern),
    );
  }

  // Tail limit
  if (filter.tail && filter.tail > 0) {
    events = events.slice(-filter.tail);
  }

  return events;
}

export function formatHistoryBrowser(events: SessionEvent[], session: DesignSession, filter: HistoryFilter): string {
  const lines: string[] = [];
  const totalEvents = (session.history ?? []).length;

  lines.push(`Session History — ${session.name}`);
  lines.push(`Total events: ${totalEvents}, showing: ${events.length}`);

  // Describe active filters
  const filters: string[] = [];
  if (filter.type) filters.push(`type=${filter.type}`);
  if (filter.grep) filters.push(`grep="${filter.grep}"`);
  if (filter.group && filter.group !== 'all') filters.push(`group=${filter.group}`);
  if (filter.tail) filters.push(`tail=${filter.tail}`);
  if (filters.length > 0) {
    lines.push(`Filters: ${filters.join(', ')}`);
  }
  lines.push('');

  if (events.length === 0) {
    lines.push('No matching events.');
    return lines.join('\n');
  }

  for (const event of events) {
    const ts = event.timestamp.replace('T', ' ').replace(/\.\d+Z$/, 'Z');
    lines.push(`  ${ts}  ${event.kind}: ${event.detail}`);
  }

  return lines.join('\n');
}

// ============================================================
// Pillar 3 — Issue and Finding Navigation
// ============================================================

export type IssueFilter = {
  status?: 'open' | 'resolved' | 'accepted' | 'all';
  severity?: 'high' | 'medium' | 'low';
  bucket?: string;
  grep?: string;
};

export type FindingFilter = {
  source?: 'balance' | 'experiment' | 'all';
  severity?: string;
  artifact?: string;
  recent?: boolean;
};

export function filterIssues(session: DesignSession, filter: IssueFilter): SessionIssue[] {
  let issues = session.issues ?? [];

  if (filter.status && filter.status !== 'all') {
    issues = issues.filter(i => i.status === filter.status);
  } else if (!filter.status) {
    // Default to open
    issues = issues.filter(i => i.status === 'open');
  }

  if (filter.severity) {
    issues = issues.filter(i => i.severity === filter.severity);
  }

  if (filter.bucket) {
    const bucketLower = filter.bucket.toLowerCase();
    issues = issues.filter(i => i.code.toLowerCase().includes(bucketLower));
  }

  if (filter.grep) {
    const pattern = filter.grep.toLowerCase();
    issues = issues.filter(i =>
      i.code.toLowerCase().includes(pattern)
      || i.summary.toLowerCase().includes(pattern)
      || i.target.toLowerCase().includes(pattern),
    );
  }

  return issues;
}

export function formatIssueBrowser(issues: SessionIssue[], session: DesignSession, filter: IssueFilter): string {
  const lines: string[] = [];
  const totalOpen = session.issues.filter(i => i.status === 'open').length;
  const totalResolved = session.issues.filter(i => i.status === 'resolved').length;

  lines.push(`Issues — ${session.name}`);
  lines.push(`Total: ${session.issues.length} (${totalOpen} open, ${totalResolved} resolved)`);
  lines.push(`Showing: ${issues.length}`);

  const filters: string[] = [];
  if (filter.status) filters.push(`status=${filter.status}`);
  if (filter.severity) filters.push(`severity=${filter.severity}`);
  if (filter.bucket) filters.push(`bucket=${filter.bucket}`);
  if (filter.grep) filters.push(`grep="${filter.grep}"`);
  if (filters.length > 0) {
    lines.push(`Filters: ${filters.join(', ')}`);
  }
  lines.push('');

  if (issues.length === 0) {
    lines.push('No matching issues.');
    return lines.join('\n');
  }

  for (const issue of issues) {
    const status = issue.status === 'open' ? '●' : issue.status === 'resolved' ? '✓' : '◐';
    lines.push(`  ${status} [${issue.severity}] ${issue.code}`);
    lines.push(`    ${issue.target}: ${issue.summary}`);
    if (getDisplayMode() === 'verbose') {
      lines.push(`    Status: ${issue.status}`);
    }
  }

  return lines.join('\n');
}

export type CombinedFinding = {
  source: 'balance' | 'experiment';
  severity: string;
  code: string;
  summary: string;
  area?: string;
  suggestion?: string;
};

export function gatherFindings(
  lastAnalysis: BalanceAnalysis | null,
  lastExperiment: ExperimentSummary | null,
  filter: FindingFilter = {},
): CombinedFinding[] {
  let findings: CombinedFinding[] = [];

  // Balance findings
  if (filter.source !== 'experiment' && lastAnalysis) {
    for (const f of lastAnalysis.findings) {
      findings.push({
        source: 'balance',
        severity: f.severity,
        code: f.code,
        summary: f.summary,
        area: f.area,
      });
    }
  }

  // Experiment variance findings
  if (filter.source !== 'balance' && lastExperiment) {
    for (const f of lastExperiment.varianceFindings) {
      findings.push({
        source: 'experiment',
        severity: f.severity,
        code: f.code,
        summary: f.summary,
        suggestion: f.suggestion,
      });
    }
  }

  // Severity filter
  if (filter.severity) {
    findings = findings.filter(f => f.severity === filter.severity);
  }

  // Artifact/area filter
  if (filter.artifact) {
    const pattern = filter.artifact.toLowerCase();
    findings = findings.filter(f =>
      (f.area && f.area.toLowerCase().includes(pattern))
      || f.code.toLowerCase().includes(pattern),
    );
  }

  // Recent: just limit to last 10
  if (filter.recent) {
    findings = findings.slice(-10);
  }

  return findings;
}

export function formatFindingBrowser(findings: CombinedFinding[]): string {
  const lines: string[] = [];

  lines.push(`Findings (${findings.length})`);
  lines.push('');

  if (findings.length === 0) {
    lines.push('No findings to display.');
    return lines.join('\n');
  }

  const bySource = { balance: 0, experiment: 0 };
  for (const f of findings) bySource[f.source]++;

  if (bySource.balance > 0) lines.push(`  Balance: ${bySource.balance}`);
  if (bySource.experiment > 0) lines.push(`  Experiment: ${bySource.experiment}`);
  lines.push('');

  for (const f of findings) {
    const tag = f.source === 'balance' ? 'BAL' : 'EXP';
    lines.push(`  [${f.severity}] [${tag}] ${f.code}: ${f.summary}`);
    if (f.area && getDisplayMode() === 'verbose') lines.push(`    Area: ${f.area}`);
    if (f.suggestion) lines.push(`    → ${f.suggestion}`);
  }

  return lines.join('\n');
}

// ============================================================
// Pillar 4 — Experiment Browser
// ============================================================

export type ExperimentEntry = {
  id: string;
  label: string;
  completedRuns: number;
  failedRuns: number;
  focusMetrics: Record<string, number>;
  rates: Record<string, number>;
  varianceFindingsCount: number;
  verdict?: string;
};

export function buildExperimentEntry(summary: ExperimentSummary): ExperimentEntry {
  return {
    id: summary.spec.id,
    label: summary.spec.label ?? summary.spec.id,
    completedRuns: summary.completedRuns,
    failedRuns: summary.failedRuns,
    focusMetrics: { ...summary.aggregate.means },
    rates: { ...summary.aggregate.rates },
    varianceFindingsCount: summary.varianceFindings.length,
  };
}

export function formatExperimentBrowser(
  experiments: ExperimentSummary[],
  comparison?: { verdict: string; improvements: string[]; regressions: string[] } | null,
): string {
  const lines: string[] = [];

  lines.push(`Experiments (${experiments.length})`);
  lines.push('');

  if (experiments.length === 0) {
    lines.push('No experiments recorded yet. Use /experiment-run to start.');
    return lines.join('\n');
  }

  for (const exp of experiments) {
    const entry = buildExperimentEntry(exp);
    lines.push(`  ${entry.label}`);
    lines.push(`    Runs: ${entry.completedRuns} completed${entry.failedRuns > 0 ? `, ${entry.failedRuns} failed` : ''}`);

    const metricLines = Object.entries(entry.focusMetrics)
      .slice(0, 4)
      .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`)
      .join(', ');
    if (metricLines) lines.push(`    Metrics: ${metricLines}`);

    const rateLines = Object.entries(entry.rates)
      .map(([k, v]) => `${k}=${(v * 100).toFixed(0)}%`)
      .join(', ');
    if (rateLines) lines.push(`    Rates: ${rateLines}`);

    if (entry.varianceFindingsCount > 0) {
      lines.push(`    Variance findings: ${entry.varianceFindingsCount}`);
    }
    lines.push('');
  }

  if (comparison) {
    lines.push('Comparison:');
    lines.push(`  Verdict: ${comparison.verdict}`);
    if (comparison.improvements.length > 0) {
      lines.push('  Improved:');
      for (const imp of comparison.improvements) {
        lines.push(`    ✓ ${imp}`);
      }
    }
    if (comparison.regressions.length > 0) {
      lines.push('  Regressed:');
      for (const reg of comparison.regressions) {
        lines.push(`    ✗ ${reg}`);
      }
    }
  }

  return lines.join('\n');
}

// ============================================================
// Pillar 5 — Command Discovery and Shortcuts
// ============================================================

export type CommandGroup = {
  name: string;
  description: string;
  commands: Array<{ cmd: string; aliases: string[]; description: string }>;
};

export const COMMAND_GROUPS: CommandGroup[] = [
  {
    name: 'Studio',
    description: 'Project overview and navigation',
    commands: [
      { cmd: '/studio', aliases: ['/dash'], description: 'Show studio dashboard' },
      { cmd: '/history', aliases: [], description: 'Browse session history' },
      { cmd: '/issues', aliases: [], description: 'Browse open issues' },
      { cmd: '/findings', aliases: ['/fx'], description: 'Browse balance + experiment findings' },
      { cmd: '/experiments', aliases: ['/exp'], description: 'Browse experiment results' },
      { cmd: '/onboard', aliases: [], description: 'First-run guided walkthrough' },
      { cmd: '/display', aliases: [], description: 'Toggle compact/verbose display mode' },
    ],
  },
  {
    name: 'Scaffold',
    description: 'Create content from goals',
    commands: [
      { cmd: '/build <goal>', aliases: [], description: 'Create a build plan from a goal' },
      { cmd: '/preview', aliases: [], description: 'Preview the active build plan' },
      { cmd: '/step', aliases: [], description: 'Execute the next build step' },
      { cmd: '/execute', aliases: [], description: 'Execute all remaining build steps' },
      { cmd: '/status', aliases: [], description: 'Show build status' },
      { cmd: '/diagnostics', aliases: [], description: 'Show post-build diagnostics' },
    ],
  },
  {
    name: 'Diagnose',
    description: 'Analyze and inspect',
    commands: [
      { cmd: '/analyze-balance <replay>', aliases: [], description: 'Analyze balance from replay data' },
      { cmd: '/compare-intent <intent> | <replay>', aliases: [], description: 'Compare intent vs outcome' },
      { cmd: '/analyze-window <start> <end> <replay>', aliases: [], description: 'Analyze tick window' },
      { cmd: '/suggest-fixes <findings>', aliases: [], description: 'Suggest fixes from findings' },
      { cmd: '/compare-scenarios <before> | <after>', aliases: [], description: 'Compare scenario revisions' },
    ],
  },
  {
    name: 'Tune',
    description: 'Adjust world parameters',
    commands: [
      { cmd: '/tune <goal>', aliases: [], description: 'Create a tuning plan' },
      { cmd: '/tune-preview', aliases: [], description: 'Preview patches + predicted impact' },
      { cmd: '/tune-apply', aliases: [], description: 'Apply next patch bundle (with confirmation)' },
      { cmd: '/tune-bundles', aliases: [], description: 'Show fix bundles from last analysis' },
      { cmd: '/tune-impact', aliases: [], description: 'Show predicted replay impact' },
      { cmd: '/tune-step', aliases: [], description: 'Execute next tuning step' },
      { cmd: '/tune-execute', aliases: [], description: 'Execute all tuning steps' },
      { cmd: '/tune-status', aliases: [], description: 'Show tuning progress' },
    ],
  },
  {
    name: 'Experiment',
    description: 'Batch runs, sweeps, comparisons',
    commands: [
      { cmd: '/experiment-plan <goal>', aliases: [], description: 'Plan an experiment workflow' },
      { cmd: '/experiment-run <runs>', aliases: [], description: 'Run batch experiment' },
      { cmd: '/experiment-sweep <param> <from> <to> <step>', aliases: [], description: 'Sweep a tunable parameter' },
      { cmd: '/experiment-compare', aliases: [], description: 'Compare last two experiments' },
      { cmd: '/experiment-findings', aliases: [], description: 'Show variance findings' },
    ],
  },
  {
    name: 'Context',
    description: 'Memory and retrieval',
    commands: [
      { cmd: '/memory', aliases: [], description: 'Show conversation memory stats' },
      { cmd: '/clear', aliases: [], description: 'Clear conversation memory' },
      { cmd: '/context', aliases: ['/ctx'], description: 'Show what context the last response used' },
      { cmd: '/sources', aliases: ['/src'], description: 'Show condensed source list' },
      { cmd: '/loadout', aliases: [], description: 'Show loadout routing' },
      { cmd: '/loadout-history', aliases: [], description: 'Show recent loadout decisions' },
    ],
  },
  {
    name: 'General',
    description: 'Session management',
    commands: [
      { cmd: '/help', aliases: ['/h'], description: 'Show help (or /help <topic>)' },
      { cmd: '/save', aliases: [], description: 'Save transcript now' },
      { cmd: '/pending', aliases: [], description: 'Show pending write' },
      { cmd: '/quit', aliases: ['/exit', '/q'], description: 'Exit chat' },
    ],
  },
];

export const COMMAND_ALIASES: Record<string, string> = {
  'studio': 'studio',
  'dash': 'studio',
  'exp': 'experiments',
  'fx': 'findings',
  'ctx': 'context',
  'src': 'sources',
  'next': 'suggest-next',
  'plan': 'show-plan',
};

export function resolveAlias(cmd: string): string {
  return COMMAND_ALIASES[cmd] ?? cmd;
}

export function formatGroupedHelp(topic?: string): string {
  const lines: string[] = [];

  if (topic) {
    const topicLower = topic.toLowerCase();
    const group = COMMAND_GROUPS.find(g => g.name.toLowerCase() === topicLower);
    if (group) {
      lines.push(`${group.name} — ${group.description}`);
      lines.push('');
      for (const cmd of group.commands) {
        const aliasStr = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
        lines.push(`  ${cmd.cmd}${aliasStr}`);
        lines.push(`    ${cmd.description}`);
      }
      return lines.join('\n');
    }
    // Maybe they asked about a specific command
    for (const g of COMMAND_GROUPS) {
      const found = g.commands.find(c =>
        c.cmd.toLowerCase().startsWith('/' + topicLower)
        || c.aliases.some(a => a.toLowerCase() === '/' + topicLower),
      );
      if (found) {
        const aliasStr = found.aliases.length > 0 ? ` (${found.aliases.join(', ')})` : '';
        lines.push(`${found.cmd}${aliasStr}`);
        lines.push(`  ${found.description}`);
        lines.push(`  Group: ${g.name}`);
        return lines.join('\n');
      }
    }
    lines.push(`No help found for "${topic}". Try /help for all commands.`);
    return lines.join('\n');
  }

  // Full grouped help
  lines.push('AI RPG ENGINE — Commands');
  lines.push('');
  for (const group of COMMAND_GROUPS) {
    lines.push(`${group.name} — ${group.description}`);
    for (const cmd of group.commands) {
      const aliasStr = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
      lines.push(`  ${cmd.cmd}${aliasStr}  ${cmd.description}`);
    }
    lines.push('');
  }
  lines.push('Tip: /help <group> for details (e.g. /help tune, /help experiment)');
  return lines.join('\n');
}

// ============================================================
// Pillar 6 — Guided Onboarding
// ============================================================

export type OnboardingStep = {
  id: number;
  title: string;
  description: string;
  command: string;
  example?: string;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 1,
    title: 'Start a session',
    description: 'Sessions track your world: themes, artifacts, issues, history.',
    command: 'Create a .ai-session.json or ask: "start a paranoia district"',
    example: '/build paranoia market district',
  },
  {
    id: 2,
    title: 'Create content',
    description: 'Build districts, factions, rooms, quests, or location packs.',
    command: '/build <goal>',
    example: '/build rumor-driven market district with three factions',
  },
  {
    id: 3,
    title: 'Critique and iterate',
    description: 'Review generated content for thematic and mechanical issues.',
    command: 'Ask: "critique this" or "review the last output"',
  },
  {
    id: 4,
    title: 'Analyze balance',
    description: 'Run a replay through the balance analyzer to find design issues.',
    command: '/analyze-balance <replay-json>',
  },
  {
    id: 5,
    title: 'Tune parameters',
    description: 'Use guided tuning to fix balance issues with concrete config patches.',
    command: '/tune <goal>',
    example: '/tune increase paranoia',
  },
  {
    id: 6,
    title: 'Run experiments',
    description: 'Batch-run scenarios to see what usually happens, not just once.',
    command: '/experiment-run <count>',
    example: '/experiment-run 20',
  },
  {
    id: 7,
    title: 'Browse findings',
    description: 'Check what issues, variance findings, and suggestions exist.',
    command: '/studio for the overview, /findings for details',
  },
  {
    id: 8,
    title: 'Check studio',
    description: 'One command for the full project picture.',
    command: '/studio',
  },
];

export function formatOnboarding(): string {
  const lines: string[] = [];

  lines.push('AI RPG ENGINE — Getting Started');
  lines.push('');
  lines.push('This engine helps you build, critique, tune, and experiment');
  lines.push('with AI-driven game worlds. Here are the key steps:');
  lines.push('');

  for (const step of ONBOARDING_STEPS) {
    lines.push(`${step.id}. ${step.title}`);
    lines.push(`   ${step.description}`);
    lines.push(`   → ${step.command}`);
    if (step.example) {
      lines.push(`   Example: ${step.example}`);
    }
    lines.push('');
  }

  lines.push('Workflow groups: /help studio, /help scaffold, /help diagnose, /help tune, /help experiment');
  lines.push('Full command list: /help');

  return lines.join('\n');
}

// ============================================================
// Pillar 7 — Chat State Summaries
// ============================================================

export type StateSummaryKind =
  | 'focus'     // "What should I focus on?"
  | 'changes'   // "What changed recently?"
  | 'issues'    // "What are my highest-impact issues?"
  | 'picture'   // "Show me the current experiment picture."
  | 'next';     // "What should I do next?" (alias for suggest-next + studio)

export function detectStateSummaryKind(message: string): StateSummaryKind | null {
  const lower = message.toLowerCase();

  if (/\bfocus\b/.test(lower) && /\bwhat\b|should|right now/.test(lower)) return 'focus';
  if (/\bchanged?\b/.test(lower) && /\brecent|since|last\b/.test(lower)) return 'changes';
  if (/\bhighest.?impact|top issues|critical issues|important issues/.test(lower)) return 'issues';
  if (/\bexperiment picture|experiment status|current experiment/.test(lower)) return 'picture';
  if (/\bwhat should i do\b|what.?s next|next step/.test(lower)) return 'next';

  return null;
}

export function buildStateSummary(
  kind: StateSummaryKind,
  session: DesignSession | null,
  opts: {
    lastExperiment?: ExperimentSummary | null;
    baselineExperiment?: ExperimentSummary | null;
    lastAnalysis?: BalanceAnalysis | null;
    activeBuild?: BuildState | null;
    activeTuning?: TuningState | null;
  } = {},
): string {
  if (!session) return 'No active session. Create one to get started.';

  const snapshot = buildStudioSnapshot(session, opts);

  switch (kind) {
    case 'focus': {
      const lines: string[] = ['Focus areas:'];
      for (const action of snapshot.suggestedActions.slice(0, 3)) {
        lines.push(`  → ${action}`);
      }
      if (snapshot.openIssues.length > 0) {
        const top = snapshot.openIssues
          .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
          .slice(0, 3);
        lines.push('');
        lines.push('Top issues:');
        for (const issue of top) {
          lines.push(`  [${issue.severity}] ${issue.code}: ${issue.summary}`);
        }
      }
      return lines.join('\n');
    }

    case 'changes': {
      const lines: string[] = ['Recent changes:'];
      const recent = snapshot.recentHistory.slice(-8);
      if (recent.length === 0) {
        lines.push('  No recent events.');
      } else {
        for (const event of recent) {
          const ts = event.timestamp.replace('T', ' ').replace(/\.\d+Z$/, 'Z');
          lines.push(`  ${ts}  ${event.kind}: ${event.detail}`);
        }
      }
      return lines.join('\n');
    }

    case 'issues': {
      const sorted = snapshot.openIssues
        .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
        .slice(0, 8);
      if (sorted.length === 0) return 'No open issues.';
      const lines: string[] = [`Highest-impact issues (${sorted.length}):`];
      for (const issue of sorted) {
        lines.push(`  [${issue.severity}] ${issue.code} → ${issue.target}: ${issue.summary}`);
      }
      return lines.join('\n');
    }

    case 'picture': {
      if (snapshot.recentExperiments.length === 0) return 'No experiments yet. Use /experiment-run to start.';
      return formatExperimentBrowser(snapshot.recentExperiments);
    }

    case 'next': {
      const lines: string[] = ['Suggested next steps:'];
      for (const action of snapshot.suggestedActions) {
        lines.push(`  → ${action}`);
      }
      return lines.join('\n');
    }
  }
}

function severityRank(severity: string): number {
  switch (severity) {
    case 'high': case 'critical': return 3;
    case 'medium': case 'warning': return 2;
    case 'low': case 'info': return 1;
    default: return 0;
  }
}

// ============================================================
// Pillar 8 — Output polish helpers
// ============================================================

export function formatHeading(title: string): string {
  return `── ${title} ${'─'.repeat(Math.max(0, 50 - title.length - 4))}`;
}

export function formatSection(heading: string, body: string): string {
  return `${formatHeading(heading)}\n${body}`;
}

export function paginate(lines: string[], page: number, pageSize = 20): { text: string; total: number; current: number; hasMore: boolean } {
  const total = Math.ceil(lines.length / pageSize);
  const current = Math.max(1, Math.min(page, total));
  const start = (current - 1) * pageSize;
  const slice = lines.slice(start, start + pageSize);
  const footer = total > 1 ? `\n  Page ${current}/${total}${current < total ? ' — use --page to navigate' : ''}` : '';
  return {
    text: slice.join('\n') + footer,
    total,
    current,
    hasMore: current < total,
  };
}

/** Truncate long strings for compact display. */
export function truncate(str: string, maxLen = 80): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}
