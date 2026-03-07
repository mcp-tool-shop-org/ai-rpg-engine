// Chat balance analyzer — simulation-guided balancing.
// Deterministic analysis of replay data, session state, and design intent.
// Produces structured findings, fixes, comparisons, and tuning plans.
// No LLM calls — all analysis is from structured data and heuristics.
// Nothing is auto-applied without explicit confirmation.

import type { DesignSession, SessionArtifacts } from './session.js';
import type { ChatIntent } from './chat-types.js';

// ============================================================
// Types
// ============================================================

// --- Design Intent (author-declared goals) ---

export type DesiredOutcome = {
  /** Human-readable description of the intended outcome. */
  description: string;
  /** Optional tick deadline — "by tick 20" etc. */
  byTick?: number;
};

export type DesignIntent = {
  /** The mood the author wants the scenario to evoke. */
  targetMood?: string;
  /** Specific outcomes the author wants to see happen. */
  desiredOutcomes: DesiredOutcome[];
  /** Free-form notes or constraints. */
  notes: string[];
};

// --- Scenario Metrics (aggregated from replay data) ---

export type MetricCurve = {
  /** Metric name (e.g. "alertPressure", "rumorSpread"). */
  name: string;
  /** Tick-indexed values. */
  values: number[];
  /** Peak value observed. */
  peak: number;
  /** Tick at which peak occurred. */
  peakTick: number;
  /** Mean value across all ticks. */
  mean: number;
};

export type ScenarioMetrics = {
  /** Total ticks in the replay. */
  totalTicks: number;
  /** Escalation-related tick (first tick where alert > threshold). */
  escalationTick: number | null;
  /** How many distinct factions were reached by rumors. */
  rumorSpreadReach: number;
  /** Average encounter duration in ticks. */
  encounterDuration: number;
  /** Peak faction hostility observed. */
  factionHostilityPeak: number;
  /** Named metric curves extracted from replay. */
  curves: MetricCurve[];
  /** Raw tick count where encounters were active. */
  encounterTicks: number;
  /** Number of distinct escalation phases detected. */
  escalationPhases: number;
};

// --- Balance Finding ---

export type FindingSeverity = 'info' | 'warning' | 'critical';
export type FindingCategory =
  | 'difficulty'
  | 'pacing'
  | 'escalation'
  | 'rumor_flow'
  | 'faction_dynamics'
  | 'district_stability'
  | 'encounter_design'
  | 'general';

export type BalanceFinding = {
  /** Unique code for this finding type. */
  code: string;
  /** Human-readable summary. */
  summary: string;
  /** What area of the world this affects. */
  area: string;
  /** Severity of the finding. */
  severity: FindingSeverity;
  /** Category for grouping. */
  category: FindingCategory;
  /** Likely cause of the issue. */
  likelyCause: string;
  /** Tick range where the issue was observed (if applicable). */
  tickRange?: [number, number];
};

export type BalanceAnalysis = {
  /** The replay data that was analyzed. */
  metrics: ScenarioMetrics;
  /** Structured findings. */
  findings: BalanceFinding[];
  /** Prose summary. */
  summary: string;
};

// --- Intent Comparison ---

export type OutcomeStatus = 'achieved' | 'partially_achieved' | 'missed';

export type OutcomeResult = {
  /** The desired outcome. */
  desired: DesiredOutcome;
  /** Whether it was achieved. */
  status: OutcomeStatus;
  /** Explanation of the comparison. */
  reason: string;
  /** Relevant tick or metric evidence. */
  evidence?: string;
};

export type IntentComparison = {
  intent: DesignIntent;
  results: OutcomeResult[];
  /** Mood match assessment. */
  moodMatch: OutcomeStatus;
  moodReason: string;
  /** Overall assessment. */
  overallStatus: OutcomeStatus;
  summary: string;
};

// --- Window Analysis ---

export type WindowAnalysis = {
  /** The tick range analyzed. */
  startTick: number;
  endTick: number;
  /** Metrics for just this window. */
  metrics: ScenarioMetrics;
  /** Findings specific to this window. */
  findings: BalanceFinding[];
  /** Summary of the window. */
  summary: string;
};

// --- Suggested Fix ---

export type SuggestedFix = {
  /** Machine-readable code for this fix. */
  code: string;
  /** What the fix targets (e.g. "district.market.alertPressure"). */
  target: string;
  /** Why this fix is suggested. */
  reason: string;
  /** What the expected impact would be. */
  expectedImpact: string;
  /** Confidence in this fix (0–1). */
  confidence: number;
  /** The finding this fix addresses. */
  findingCode: string;
};

// --- Scenario Comparison ---

export type DimensionChange = {
  /** Dimension that changed (e.g. "escalation pacing"). */
  dimension: string;
  /** Direction of change. */
  direction: 'improved' | 'regressed' | 'unchanged';
  /** Description of the change. */
  description: string;
  /** Numeric delta if available. */
  delta?: number;
};

export type ScenarioComparison = {
  /** Before metrics. */
  before: ScenarioMetrics;
  /** After metrics. */
  after: ScenarioMetrics;
  /** Dimensional changes. */
  changes: DimensionChange[];
  /** Whether the revision improved, regressed, or was mixed relative to intent. */
  verdict: 'improved' | 'regressed' | 'mixed' | 'unchanged';
  /** Prose summary. */
  summary: string;
};

// --- Tuning Plan (mirrors BuildPlan pattern) ---

export type TuningStepStatus = 'pending' | 'executed' | 'failed' | 'skipped';

export type TuningStep = {
  id: number;
  description: string;
  /** The engine command this step invokes. */
  command: string;
  /** The chat intent for tool dispatch. */
  intent: ChatIntent;
  /** Parameters for the tool. */
  params: Record<string, string>;
  /** Step IDs that must complete before this one. */
  dependencies: number[];
  /** Expected effect of this step. */
  expectedEffect: string;
  status: TuningStepStatus;
  result?: string;
  error?: string;
};

export type TuningPlan = {
  /** The author's tuning goal. */
  goal: string;
  /** Ordered tuning steps. */
  steps: TuningStep[];
  /** Advisory warnings. */
  warnings: string[];
};

export type TuningState = {
  plan: TuningPlan;
  startedAt: string;
  completedAt?: string;
  status: 'planned' | 'executing' | 'completed' | 'failed';
};

// ============================================================
// Replay data parsing
// ============================================================

/** Minimal typed replay structure we expect from JSON. */
type ReplayTick = {
  tick: number;
  entities?: Array<{
    id?: string;
    type?: string;
    [key: string]: unknown;
  }>;
  events?: Array<{
    type?: string;
    source?: string;
    target?: string;
    [key: string]: unknown;
  }>;
  metrics?: Record<string, number>;
  [key: string]: unknown;
};

type ParsedReplay = {
  ticks: ReplayTick[];
  metadata?: Record<string, unknown>;
};

export function parseReplayData(raw: string): ParsedReplay | null {
  try {
    const data = JSON.parse(raw);
    // Handle array of ticks
    if (Array.isArray(data)) {
      return { ticks: data as ReplayTick[] };
    }
    // Handle object with ticks field
    if (data && typeof data === 'object' && Array.isArray(data.ticks)) {
      return { ticks: data.ticks as ReplayTick[], metadata: data.metadata };
    }
    // Handle single tick
    if (data && typeof data === 'object' && typeof data.tick === 'number') {
      return { ticks: [data as ReplayTick] };
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================
// Metric extraction
// ============================================================

export function extractMetrics(replay: ParsedReplay): ScenarioMetrics {
  const ticks = replay.ticks;
  const totalTicks = ticks.length;
  const curves: MetricCurve[] = [];

  // Collect all metric names across ticks
  const metricNames = new Set<string>();
  for (const tick of ticks) {
    if (tick.metrics) {
      for (const name of Object.keys(tick.metrics)) {
        metricNames.add(name);
      }
    }
  }

  // Build curves for each metric
  for (const name of metricNames) {
    const values: number[] = [];
    for (const tick of ticks) {
      values.push(tick.metrics?.[name] ?? 0);
    }
    const peak = Math.max(...values, 0);
    const peakTick = values.indexOf(peak);
    const mean = values.length > 0
      ? values.reduce((a, b) => a + b, 0) / values.length
      : 0;
    curves.push({ name, values, peak, peakTick, mean });
  }

  // Escalation detection — look for alertPressure or alert metric crossing 0.5
  const alertCurve = curves.find(c =>
    c.name === 'alertPressure' || c.name === 'alert' || c.name === 'escalation'
  );
  let escalationTick: number | null = null;
  if (alertCurve) {
    const idx = alertCurve.values.findIndex(v => v > 0.5);
    if (idx >= 0) escalationTick = idx;
  }

  // Rumor spread — count distinct factions reached
  let rumorSpreadReach = 0;
  const factionsReached = new Set<string>();
  for (const tick of ticks) {
    if (tick.events) {
      for (const event of tick.events) {
        if (event.type === 'rumor_spread' || event.type === 'gossip_received') {
          if (event.target) factionsReached.add(event.target);
        }
      }
    }
  }
  rumorSpreadReach = factionsReached.size;

  // Encounter duration — ticks with active encounters
  let encounterTicks = 0;
  for (const tick of ticks) {
    if (tick.events?.some(e => e.type === 'encounter_active' || e.type === 'encounter_tick')) {
      encounterTicks++;
    }
  }
  const encounterDuration = encounterTicks;

  // Faction hostility peak
  const hostilityCurve = curves.find(c =>
    c.name === 'factionHostility' || c.name === 'hostility'
  );
  const factionHostilityPeak = hostilityCurve?.peak ?? 0;

  // Escalation phases — count transitions above/below threshold
  let escalationPhases = 0;
  if (alertCurve) {
    let above = false;
    for (const v of alertCurve.values) {
      if (!above && v > 0.5) {
        escalationPhases++;
        above = true;
      } else if (above && v <= 0.3) {
        above = false;
      }
    }
  }

  return {
    totalTicks,
    escalationTick,
    rumorSpreadReach,
    encounterDuration,
    factionHostilityPeak,
    curves,
    encounterTicks,
    escalationPhases,
  };
}

// ============================================================
// P1 — Balance Analysis
// ============================================================

export function analyzeBalance(
  replayData: string,
  session: DesignSession | null,
): BalanceAnalysis {
  const replay = parseReplayData(replayData);
  if (!replay) {
    return {
      metrics: emptyMetrics(),
      findings: [{
        code: 'PARSE_FAILURE',
        summary: 'Could not parse replay data.',
        area: 'replay',
        severity: 'critical',
        category: 'general',
        likelyCause: 'Invalid or missing replay JSON.',
      }],
      summary: 'Balance analysis failed: could not parse replay data.',
    };
  }

  const metrics = extractMetrics(replay);
  const findings = runBalanceChecks(metrics, session);

  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const warningCount = findings.filter(f => f.severity === 'warning').length;
  const infoCount = findings.filter(f => f.severity === 'info').length;

  const summaryParts: string[] = [];
  summaryParts.push(`Analyzed ${metrics.totalTicks} ticks.`);
  if (criticalCount > 0) summaryParts.push(`${criticalCount} critical finding(s).`);
  if (warningCount > 0) summaryParts.push(`${warningCount} warning(s).`);
  if (infoCount > 0) summaryParts.push(`${infoCount} informational note(s).`);
  if (findings.length === 0) summaryParts.push('No balance issues detected.');

  return {
    metrics,
    findings,
    summary: summaryParts.join(' '),
  };
}

function runBalanceChecks(
  metrics: ScenarioMetrics,
  session: DesignSession | null,
): BalanceFinding[] {
  const findings: BalanceFinding[] = [];

  // Check: difficulty too flat (no escalation at all)
  if (metrics.totalTicks > 5 && metrics.escalationPhases === 0) {
    const alertCurve = metrics.curves.find(c =>
      c.name === 'alertPressure' || c.name === 'alert' || c.name === 'escalation'
    );
    if (alertCurve) {
      findings.push({
        code: 'DIFFICULTY_FLAT',
        summary: 'Encounter difficulty never escalated. The scenario may feel monotonous.',
        area: 'escalation',
        severity: 'warning',
        category: 'difficulty',
        likelyCause: 'Alert pressure never exceeded threshold. Triggers may be too conservative.',
      });
    }
  }

  // Check: escalation too aggressive (spikes within first 10% of ticks)
  if (metrics.escalationTick !== null && metrics.totalTicks > 0) {
    const escalationPct = metrics.escalationTick / metrics.totalTicks;
    if (escalationPct < 0.1 && metrics.totalTicks >= 10) {
      findings.push({
        code: 'ESCALATION_TOO_FAST',
        summary: `Alert escalated at tick ${metrics.escalationTick} (${Math.round(escalationPct * 100)}% into simulation). Very early escalation.`,
        area: 'escalation',
        severity: 'warning',
        category: 'escalation',
        likelyCause: 'Initial alert coefficients or trigger sensitivity too high.',
        tickRange: [0, metrics.escalationTick],
      });
    }
  }

  // Check: rumor propagation too slow (no factions reached)
  if (metrics.totalTicks > 10 && metrics.rumorSpreadReach === 0) {
    findings.push({
      code: 'RUMOR_NO_SPREAD',
      summary: 'Rumors never reached any faction during the simulation.',
      area: 'rumor propagation',
      severity: 'warning',
      category: 'rumor_flow',
      likelyCause: 'No rumor spread events. Missing rumor sources or blocked propagation paths.',
    });
  }

  // Check: faction hostility pinned (stays at peak without recovery)
  if (metrics.factionHostilityPeak > 0.9) {
    const hostilityCurve = metrics.curves.find(c =>
      c.name === 'factionHostility' || c.name === 'hostility'
    );
    if (hostilityCurve) {
      const pinnedTicks = hostilityCurve.values.filter(v => v > 0.85).length;
      const pinnedPct = pinnedTicks / metrics.totalTicks;
      if (pinnedPct > 0.5) {
        findings.push({
          code: 'HOSTILITY_PINNED',
          summary: `Faction hostility above 0.85 for ${Math.round(pinnedPct * 100)}% of ticks. Feels stuck at maximum.`,
          area: 'faction dynamics',
          severity: 'critical',
          category: 'faction_dynamics',
          likelyCause: 'Hostility gain outpaces decay. Recovery mechanics may be insufficient.',
        });
      }
    }
  }

  // Check: district stability never affected outcomes
  const stabilityCurve = metrics.curves.find(c =>
    c.name === 'districtStability' || c.name === 'stability'
  );
  if (stabilityCurve) {
    const variance = computeVariance(stabilityCurve.values);
    if (variance < 0.01 && metrics.totalTicks > 10) {
      findings.push({
        code: 'STABILITY_INERT',
        summary: 'District stability barely changed throughout the simulation.',
        area: 'district stability',
        severity: 'info',
        category: 'district_stability',
        likelyCause: 'Stability may not be connected to meaningful game events.',
      });
    }
  }

  // Check: encounters never reached escalation phase
  if (metrics.encounterTicks > 0 && metrics.escalationPhases === 0) {
    findings.push({
      code: 'ENCOUNTER_NO_ESCALATION',
      summary: 'Encounters were active but never reached an escalation phase.',
      area: 'encounters',
      severity: 'info',
      category: 'encounter_design',
      likelyCause: 'Encounter escalation conditions may be unreachable with current content.',
    });
  }

  // Check: very short simulation
  if (metrics.totalTicks < 5 && metrics.totalTicks > 0) {
    findings.push({
      code: 'SHORT_SIMULATION',
      summary: `Only ${metrics.totalTicks} ticks. May not reveal meaningful balance patterns.`,
      area: 'simulation',
      severity: 'info',
      category: 'general',
      likelyCause: 'Simulation ended quickly. Consider running longer.',
    });
  }

  // Check: session has unresolved issues that may relate to findings
  if (session) {
    const openIssues = session.issues.filter(i => i.status === 'open');
    const escalationIssues = openIssues.filter(i =>
      i.code.startsWith('ESCALATION_') || i.code.startsWith('ALERT_')
    );
    if (escalationIssues.length > 0 && metrics.escalationPhases === 0) {
      findings.push({
        code: 'SESSION_ESCALATION_ISSUES',
        summary: `${escalationIssues.length} open escalation issue(s) in session, and replay shows no escalation.`,
        area: 'session alignment',
        severity: 'warning',
        category: 'escalation',
        likelyCause: 'Known issues are consistent with replay findings — escalation mechanics need attention.',
      });
    }
  }

  return findings;
}

function computeVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sumSq = values.reduce((a, v) => a + (v - mean) ** 2, 0);
  return sumSq / values.length;
}

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

// ============================================================
// P2 — Intent vs Outcome Comparison
// ============================================================

export function parseDesignIntent(text: string): DesignIntent {
  const intent: DesignIntent = {
    desiredOutcomes: [],
    notes: [],
  };

  // Parse targetMood
  const moodMatch = text.match(/targetMood\s*:\s*"?([^"\n]+)"?/i);
  if (moodMatch) {
    intent.targetMood = moodMatch[1].trim();
  }

  // Parse desiredOutcomes — look for list items under desiredOutcomes:
  const outcomesMatch = text.match(/desiredOutcomes\s*:\s*\n((?:\s*-\s*.+\n?)+)/i);
  if (outcomesMatch) {
    const items = outcomesMatch[1].matchAll(/^\s*-\s*(.+)$/gm);
    for (const item of items) {
      const raw = item[1].trim();
      // Check for "by tick N" pattern
      const tickMatch = raw.match(/\bby tick (\d+)\b/i);
      const outcome: DesiredOutcome = {
        description: raw,
        ...(tickMatch ? { byTick: parseInt(tickMatch[1], 10) } : {}),
      };
      intent.desiredOutcomes.push(outcome);
    }
  }

  // Parse notes — look for notes: section or any remaining lines
  const notesMatch = text.match(/notes\s*:\s*\n((?:\s*-\s*.+\n?)+)/i);
  if (notesMatch) {
    const items = notesMatch[1].matchAll(/^\s*-\s*(.+)$/gm);
    for (const item of items) {
      intent.notes.push(item[1].trim());
    }
  }

  // If no structured format, treat as free-text mood
  if (!intent.targetMood && intent.desiredOutcomes.length === 0) {
    intent.targetMood = text.trim();
  }

  return intent;
}

export function compareIntent(
  intent: DesignIntent,
  replayData: string,
  session: DesignSession | null,
): IntentComparison {
  const replay = parseReplayData(replayData);
  const metrics = replay ? extractMetrics(replay) : emptyMetrics();

  const results: OutcomeResult[] = [];

  for (const desired of intent.desiredOutcomes) {
    results.push(evaluateOutcome(desired, metrics, session));
  }

  // Mood assessment
  const { moodMatch, moodReason } = assessMood(intent.targetMood ?? '', metrics);

  // Overall
  const achieved = results.filter(r => r.status === 'achieved').length;
  const missed = results.filter(r => r.status === 'missed').length;
  const total = results.length;

  let overallStatus: OutcomeStatus;
  if (total === 0) {
    overallStatus = moodMatch;
  } else if (missed === 0 && moodMatch !== 'missed') {
    overallStatus = 'achieved';
  } else if (achieved === 0 && moodMatch === 'missed') {
    overallStatus = 'missed';
  } else {
    overallStatus = 'partially_achieved';
  }

  const summaryParts: string[] = [];
  if (total > 0) {
    summaryParts.push(`Outcomes: ${achieved}/${total} achieved.`);
    if (missed > 0) summaryParts.push(`${missed} missed.`);
  }
  summaryParts.push(`Mood: ${moodMatch} — ${moodReason}`);
  summaryParts.push(`Overall: ${overallStatus.replace(/_/g, ' ')}.`);

  return {
    intent,
    results,
    moodMatch,
    moodReason,
    overallStatus,
    summary: summaryParts.join(' '),
  };
}

function evaluateOutcome(
  desired: DesiredOutcome,
  metrics: ScenarioMetrics,
  _session: DesignSession | null,
): OutcomeResult {
  const desc = desired.description.toLowerCase();

  // Check: escalation by tick N
  if (desc.includes('escalat') && desired.byTick !== undefined) {
    if (metrics.escalationTick !== null && metrics.escalationTick <= desired.byTick) {
      return {
        desired,
        status: 'achieved',
        reason: `Escalation occurred at tick ${metrics.escalationTick} (deadline: tick ${desired.byTick}).`,
        evidence: `escalationTick=${metrics.escalationTick}`,
      };
    } else if (metrics.escalationTick !== null) {
      return {
        desired,
        status: 'partially_achieved',
        reason: `Escalation occurred at tick ${metrics.escalationTick}, but deadline was tick ${desired.byTick}.`,
        evidence: `escalationTick=${metrics.escalationTick}`,
      };
    } else {
      return {
        desired,
        status: 'missed',
        reason: 'No escalation occurred during the simulation.',
      };
    }
  }

  // Check: rumor reach
  if (desc.includes('rumor') && (desc.includes('reach') || desc.includes('spread') || desc.includes('faction'))) {
    const factionMatch = desc.match(/(\d+)\s*faction/);
    const targetFactions = factionMatch ? parseInt(factionMatch[1], 10) : 1;
    if (metrics.rumorSpreadReach >= targetFactions) {
      return {
        desired,
        status: 'achieved',
        reason: `Rumors reached ${metrics.rumorSpreadReach} faction(s) (target: ${targetFactions}).`,
        evidence: `rumorSpreadReach=${metrics.rumorSpreadReach}`,
      };
    } else if (metrics.rumorSpreadReach > 0) {
      return {
        desired,
        status: 'partially_achieved',
        reason: `Rumors reached ${metrics.rumorSpreadReach} faction(s), target was ${targetFactions}.`,
        evidence: `rumorSpreadReach=${metrics.rumorSpreadReach}`,
      };
    } else {
      return {
        desired,
        status: 'missed',
        reason: 'Rumors did not reach any factions.',
        evidence: `rumorSpreadReach=0`,
      };
    }
  }

  // Check: avoid combat through dialogue
  if (desc.includes('avoid combat') || desc.includes('dialogue') || desc.includes('non-combat')) {
    // Look for dialogue resolution events
    const replay = { ticks: [] as ReplayTick[] };  // We only have metrics here
    // Check if encounter data suggests non-combat resolution was possible
    if (metrics.encounterTicks === 0) {
      return {
        desired,
        status: 'achieved',
        reason: 'No encounters escalated to combat.',
      };
    }
    // If encounters exist but hostility stayed low, dialogue path was likely available
    if (metrics.factionHostilityPeak < 0.5) {
      return {
        desired,
        status: 'achieved',
        reason: 'Hostility remained low, suggesting dialogue paths were available.',
        evidence: `factionHostilityPeak=${metrics.factionHostilityPeak.toFixed(2)}`,
      };
    }
    return {
      desired,
      status: 'partially_achieved',
      reason: 'Encounters occurred with elevated hostility. Dialogue path may not be reliable.',
      evidence: `factionHostilityPeak=${metrics.factionHostilityPeak.toFixed(2)}`,
    };
  }

  // Check: generic "by tick N" deadline pattern
  if (desired.byTick !== undefined) {
    // We can check if something happened before the deadline, but
    // without specific metric mapping we can only give a partial answer
    if (metrics.totalTicks >= desired.byTick) {
      return {
        desired,
        status: 'partially_achieved',
        reason: `Simulation reached tick ${desired.byTick} but cannot determine if outcome was met from metrics alone.`,
      };
    }
    return {
      desired,
      status: 'missed',
      reason: `Simulation ended at tick ${metrics.totalTicks}, before deadline tick ${desired.byTick}.`,
    };
  }

  // Fallback — can't evaluate
  return {
    desired,
    status: 'partially_achieved',
    reason: 'Cannot fully evaluate this outcome from available replay metrics.',
  };
}

function assessMood(
  targetMood: string,
  metrics: ScenarioMetrics,
): { moodMatch: OutcomeStatus; moodReason: string } {
  if (!targetMood) {
    return { moodMatch: 'achieved', moodReason: 'No target mood specified.' };
  }

  const mood = targetMood.toLowerCase();

  // Paranoia — expects high alert, rumors, faction tension
  if (mood.includes('paranoi') || mood.includes('suspicion') || mood.includes('tension')) {
    const hasEscalation = metrics.escalationTick !== null;
    const hasRumorSpread = metrics.rumorSpreadReach > 0;
    const hasHostility = metrics.factionHostilityPeak > 0.3;
    const score = (hasEscalation ? 1 : 0) + (hasRumorSpread ? 1 : 0) + (hasHostility ? 1 : 0);
    if (score >= 2) return { moodMatch: 'achieved', moodReason: 'Escalation, rumors, and hostility create tension.' };
    if (score === 1) return { moodMatch: 'partially_achieved', moodReason: 'Some tension elements present but not enough for paranoia.' };
    return { moodMatch: 'missed', moodReason: 'No escalation, rumor spread, or faction hostility — not paranoid.' };
  }

  // Calm / peaceful
  if (mood.includes('calm') || mood.includes('peace') || mood.includes('quiet')) {
    if (metrics.escalationPhases === 0 && metrics.factionHostilityPeak < 0.3) {
      return { moodMatch: 'achieved', moodReason: 'Low escalation and hostility — calm atmosphere.' };
    }
    if (metrics.factionHostilityPeak > 0.7) {
      return { moodMatch: 'missed', moodReason: 'High faction hostility contradicts calm mood.' };
    }
    return { moodMatch: 'partially_achieved', moodReason: 'Some activity but not intensely hostile.' };
  }

  // Danger / lethal
  if (mood.includes('danger') || mood.includes('lethal') || mood.includes('deadly')) {
    if (metrics.factionHostilityPeak > 0.7 && metrics.escalationPhases > 0) {
      return { moodMatch: 'achieved', moodReason: 'High hostility and escalation create danger.' };
    }
    if (metrics.factionHostilityPeak > 0.4) {
      return { moodMatch: 'partially_achieved', moodReason: 'Moderate hostility but could be more dangerous.' };
    }
    return { moodMatch: 'missed', moodReason: 'Low hostility and no escalation — does not feel dangerous.' };
  }

  // Mystery
  if (mood.includes('myster') || mood.includes('intrigue') || mood.includes('secretive')) {
    if (metrics.rumorSpreadReach > 0 && metrics.factionHostilityPeak < 0.5) {
      return { moodMatch: 'achieved', moodReason: 'Rumors spreading without open hostility — mysterious.' };
    }
    if (metrics.rumorSpreadReach > 0) {
      return { moodMatch: 'partially_achieved', moodReason: 'Rumors present but hostility may undermine mystery.' };
    }
    return { moodMatch: 'missed', moodReason: 'No rumor activity to create mystery.' };
  }

  // Generic — can't assess
  return {
    moodMatch: 'partially_achieved',
    moodReason: `Target mood "${targetMood}" not fully assessable from available metrics.`,
  };
}

// ============================================================
// P3 — Replay Window Analysis
// ============================================================

export function analyzeWindow(
  replayData: string,
  startTick: number,
  endTick: number,
  focus?: string,
): WindowAnalysis {
  const replay = parseReplayData(replayData);
  if (!replay) {
    return {
      startTick,
      endTick,
      metrics: emptyMetrics(),
      findings: [{
        code: 'PARSE_FAILURE',
        summary: 'Could not parse replay data.',
        area: 'replay',
        severity: 'critical',
        category: 'general',
        likelyCause: 'Invalid or missing replay JSON.',
      }],
      summary: 'Window analysis failed: could not parse replay data.',
    };
  }

  // Slice to window
  const windowed = replay.ticks.filter(t => t.tick >= startTick && t.tick <= endTick);
  const windowReplay: ParsedReplay = { ticks: windowed, metadata: replay.metadata };
  const metrics = extractMetrics(windowReplay);
  const findings = runBalanceChecks(metrics, null);

  // Focus filter — keep only findings in the requested category
  const filteredFindings = focus
    ? findings.filter(f => f.category === focus || f.area.toLowerCase().includes(focus.toLowerCase()))
    : findings;

  const summary = `Window ticks ${startTick}–${endTick}: ${windowed.length} ticks analyzed, ${filteredFindings.length} finding(s).`;

  return {
    startTick,
    endTick,
    metrics,
    findings: filteredFindings,
    summary,
  };
}

// ============================================================
// P4 — Suggested Fixes
// ============================================================

type FixTemplate = {
  findingCode: string;
  code: string;
  targetPattern: string;
  reason: string;
  expectedImpact: string;
  baseConfidence: number;
};

const FIX_TEMPLATES: FixTemplate[] = [
  {
    findingCode: 'DIFFICULTY_FLAT',
    code: 'increase_alert_sensitivity',
    targetPattern: 'district.*.alertPressure',
    reason: 'Alert never escalated. Increase trigger sensitivity.',
    expectedImpact: 'More dynamic difficulty curve.',
    baseConfidence: 0.75,
  },
  {
    findingCode: 'ESCALATION_TOO_FAST',
    code: 'reduce_alert_gain',
    targetPattern: 'district.*.alertPressure',
    reason: 'Alert escalated too quickly.',
    expectedImpact: 'More gradual escalation allowing player preparation.',
    baseConfidence: 0.82,
  },
  {
    findingCode: 'RUMOR_NO_SPREAD',
    code: 'add_rumor_path',
    targetPattern: 'faction.*.rumorPropagation',
    reason: 'Rumors never spread between factions.',
    expectedImpact: 'Creates information flow between factions.',
    baseConfidence: 0.70,
  },
  {
    findingCode: 'HOSTILITY_PINNED',
    code: 'increase_hostility_decay',
    targetPattern: 'faction.*.hostilityDecay',
    reason: 'Hostility stayed pinned at maximum.',
    expectedImpact: 'Allows recovery from hostile states.',
    baseConfidence: 0.78,
  },
  {
    findingCode: 'STABILITY_INERT',
    code: 'connect_stability_events',
    targetPattern: 'district.*.stabilityEvents',
    reason: 'District stability never meaningfully changed.',
    expectedImpact: 'Makes district stability responsive to game events.',
    baseConfidence: 0.65,
  },
  {
    findingCode: 'ENCOUNTER_NO_ESCALATION',
    code: 'lower_escalation_threshold',
    targetPattern: 'encounter.*.escalationThreshold',
    reason: 'Encounters never reached escalation phase.',
    expectedImpact: 'Makes encounter escalation achievable.',
    baseConfidence: 0.72,
  },
  {
    findingCode: 'SESSION_ESCALATION_ISSUES',
    code: 'review_escalation_mechanics',
    targetPattern: 'district.*.escalation',
    reason: 'Session issues and replay both flag escalation problems.',
    expectedImpact: 'Addresses confirmed design gaps in escalation.',
    baseConfidence: 0.85,
  },
];

export function suggestFixes(findings: BalanceFinding[]): SuggestedFix[] {
  const fixes: SuggestedFix[] = [];

  for (const finding of findings) {
    const template = FIX_TEMPLATES.find(t => t.findingCode === finding.code);
    if (template) {
      // Replace wildcard in target pattern with area info
      const area = finding.area.toLowerCase().replace(/\s+/g, '_');
      const target = template.targetPattern.replace('*', area);

      fixes.push({
        code: template.code,
        target,
        reason: template.reason,
        expectedImpact: template.expectedImpact,
        confidence: template.baseConfidence,
        findingCode: finding.code,
      });
    }
  }

  // Sort by confidence descending
  fixes.sort((a, b) => b.confidence - a.confidence);

  return fixes;
}

// ============================================================
// P5 — Compare Scenarios / Revisions
// ============================================================

export function compareScenarios(
  beforeData: string,
  afterData: string,
  intent?: DesignIntent,
): ScenarioComparison {
  const beforeReplay = parseReplayData(beforeData);
  const afterReplay = parseReplayData(afterData);

  const before = beforeReplay ? extractMetrics(beforeReplay) : emptyMetrics();
  const after = afterReplay ? extractMetrics(afterReplay) : emptyMetrics();

  const changes: DimensionChange[] = [];

  // Escalation pacing
  if (before.escalationTick !== null || after.escalationTick !== null) {
    const beforeTick = before.escalationTick ?? before.totalTicks;
    const afterTick = after.escalationTick ?? after.totalTicks;
    const delta = afterTick - beforeTick;
    if (Math.abs(delta) > 1) {
      changes.push({
        dimension: 'escalation pacing',
        direction: delta > 0 ? 'improved' : 'regressed',
        description: delta > 0
          ? `Escalation delayed by ${delta} ticks (more gradual).`
          : `Escalation advanced by ${Math.abs(delta)} ticks (faster).`,
        delta,
      });
    }
  }

  // Rumor spread
  const rumorDelta = after.rumorSpreadReach - before.rumorSpreadReach;
  if (rumorDelta !== 0) {
    changes.push({
      dimension: 'rumor spread',
      direction: rumorDelta > 0 ? 'improved' : 'regressed',
      description: rumorDelta > 0
        ? `Rumors now reach ${rumorDelta} more faction(s).`
        : `Rumors reach ${Math.abs(rumorDelta)} fewer faction(s).`,
      delta: rumorDelta,
    });
  }

  // Encounter duration
  const durationDelta = after.encounterDuration - before.encounterDuration;
  if (Math.abs(durationDelta) > 1) {
    changes.push({
      dimension: 'encounter duration',
      direction: Math.abs(durationDelta) < 3 ? 'unchanged' : durationDelta > 0 ? 'improved' : 'regressed',
      description: `Encounter active ticks: ${before.encounterDuration} → ${after.encounterDuration}.`,
      delta: durationDelta,
    });
  }

  // Faction hostility
  const hostilityDelta = after.factionHostilityPeak - before.factionHostilityPeak;
  if (Math.abs(hostilityDelta) > 0.05) {
    // Without intent, we report the direction but don't judge
    let direction: DimensionChange['direction'] = 'unchanged';
    if (intent?.targetMood) {
      const mood = intent.targetMood.toLowerCase();
      const wantsTension = mood.includes('paranoi') || mood.includes('tension') || mood.includes('danger');
      direction = wantsTension
        ? (hostilityDelta > 0 ? 'improved' : 'regressed')
        : (hostilityDelta < 0 ? 'improved' : 'regressed');
    } else {
      direction = hostilityDelta > 0 ? 'regressed' : 'improved';
    }
    changes.push({
      dimension: 'faction hostility peak',
      direction,
      description: `Hostility peak: ${before.factionHostilityPeak.toFixed(2)} → ${after.factionHostilityPeak.toFixed(2)}.`,
      delta: hostilityDelta,
    });
  }

  // Escalation phases
  const phaseDelta = after.escalationPhases - before.escalationPhases;
  if (phaseDelta !== 0) {
    changes.push({
      dimension: 'escalation phases',
      direction: phaseDelta > 0 ? 'improved' : 'regressed',
      description: `Escalation phases: ${before.escalationPhases} → ${after.escalationPhases}.`,
      delta: phaseDelta,
    });
  }

  // District stability variance
  const beforeStab = before.curves.find(c => c.name === 'districtStability' || c.name === 'stability');
  const afterStab = after.curves.find(c => c.name === 'districtStability' || c.name === 'stability');
  if (beforeStab && afterStab) {
    const beforeVar = computeVariance(beforeStab.values);
    const afterVar = computeVariance(afterStab.values);
    const varDelta = afterVar - beforeVar;
    if (Math.abs(varDelta) > 0.01) {
      changes.push({
        dimension: 'district stability variance',
        direction: varDelta > 0 ? 'improved' : 'regressed',
        description: varDelta > 0
          ? 'District stability became more dynamic.'
          : 'District stability became more inert.',
        delta: varDelta,
      });
    }
  }

  // Verdict
  const improvements = changes.filter(c => c.direction === 'improved').length;
  const regressions = changes.filter(c => c.direction === 'regressed').length;
  let verdict: ScenarioComparison['verdict'];
  if (changes.length === 0) {
    verdict = 'unchanged';
  } else if (regressions === 0) {
    verdict = 'improved';
  } else if (improvements === 0) {
    verdict = 'regressed';
  } else {
    verdict = 'mixed';
  }

  // Summary
  const parts: string[] = [];
  parts.push(`Compared ${before.totalTicks}-tick replay vs ${after.totalTicks}-tick replay.`);
  parts.push(`${improvements} improvement(s), ${regressions} regression(s).`);
  parts.push(`Verdict: ${verdict}.`);
  if (intent?.targetMood) parts.push(`Evaluated against target mood: "${intent.targetMood}".`);

  return {
    before,
    after,
    changes,
    verdict,
    summary: parts.join(' '),
  };
}

// ============================================================
// P6 — Guided Tuning Plans
// ============================================================

type TuningTemplate = {
  name: string;
  keywords: string[];
  steps: Array<{
    command: string;
    intent: ChatIntent;
    descriptionSuffix: string;
    expectedEffect: string;
    paramBuilder: (goal: string) => Record<string, string>;
    dependsOnPrevious: boolean;
  }>;
};

const PARANOIA_TEMPLATE: TuningTemplate = {
  name: 'increase paranoia',
  keywords: ['paranoi', 'suspicion', 'tension', 'distrust', 'unease'],
  steps: [
    {
      command: 'analyze-replay',
      intent: 'analyze_replay',
      descriptionSuffix: 'current state',
      expectedEffect: 'Establish baseline for tension metrics.',
      paramBuilder: (goal) => ({ focus: `paranoia analysis for ${goal}` }),
      dependsOnPrevious: false,
    },
    {
      command: 'create-faction',
      intent: 'scaffold',
      descriptionSuffix: 'secretive faction to add suspicion',
      expectedEffect: 'Adds a hidden-agenda faction to increase distrust.',
      paramBuilder: (goal) => ({ kind: 'faction', theme: `secretive faction spreading distrust in ${goal}` }),
      dependsOnPrevious: true,
    },
    {
      command: 'create-encounter-pack',
      intent: 'scaffold',
      descriptionSuffix: 'suspicion-building encounters',
      expectedEffect: 'Encounters that raise alert and paranoia.',
      paramBuilder: (goal) => ({ kind: 'encounter-pack', theme: `suspicion and paranoia encounters for ${goal}` }),
      dependsOnPrevious: true,
    },
    {
      command: 'critique-content',
      intent: 'critique',
      descriptionSuffix: 'paranoia effectiveness',
      expectedEffect: 'Identify gaps in paranoia design.',
      paramBuilder: () => ({}),
      dependsOnPrevious: true,
    },
    {
      command: 'suggest-next',
      intent: 'suggest_next',
      descriptionSuffix: '',
      expectedEffect: 'Determine further tuning actions.',
      paramBuilder: () => ({}),
      dependsOnPrevious: true,
    },
  ],
};

const LETHALITY_TEMPLATE: TuningTemplate = {
  name: 'reduce lethality',
  keywords: ['lethality', 'lethal', 'deadly', 'survivab', 'death', 'kill', 'danger'],
  steps: [
    {
      command: 'analyze-replay',
      intent: 'analyze_replay',
      descriptionSuffix: 'lethality assessment',
      expectedEffect: 'Identify high-lethality encounters and mechanics.',
      paramBuilder: (goal) => ({ focus: `lethality and survivability for ${goal}` }),
      dependsOnPrevious: false,
    },
    {
      command: 'improve-content',
      intent: 'improve',
      descriptionSuffix: 'lower encounter difficulty',
      expectedEffect: 'Reduce encounter lethality while preserving tension.',
      paramBuilder: (goal) => ({ goal: `reduce lethality: ${goal}` }),
      dependsOnPrevious: true,
    },
    {
      command: 'create-encounter-pack',
      intent: 'scaffold',
      descriptionSuffix: 'alternative non-lethal encounters',
      expectedEffect: 'Add encounters with dialogue/escape paths.',
      paramBuilder: (goal) => ({ kind: 'encounter-pack', theme: `non-lethal alternatives for ${goal}` }),
      dependsOnPrevious: true,
    },
    {
      command: 'critique-content',
      intent: 'critique',
      descriptionSuffix: 'lethality review',
      expectedEffect: 'Verify reduced lethality is balanced.',
      paramBuilder: () => ({}),
      dependsOnPrevious: true,
    },
    {
      command: 'suggest-next',
      intent: 'suggest_next',
      descriptionSuffix: '',
      expectedEffect: 'Determine further tuning actions.',
      paramBuilder: () => ({}),
      dependsOnPrevious: true,
    },
  ],
};

const RUMOR_SPEED_TEMPLATE: TuningTemplate = {
  name: 'increase rumor speed',
  keywords: ['rumor', 'gossip', 'spread', 'propagat', 'information flow'],
  steps: [
    {
      command: 'analyze-replay',
      intent: 'analyze_replay',
      descriptionSuffix: 'rumor flow assessment',
      expectedEffect: 'Identify rumor propagation bottlenecks.',
      paramBuilder: (goal) => ({ focus: `rumor propagation for ${goal}` }),
      dependsOnPrevious: false,
    },
    {
      command: 'create-faction',
      intent: 'scaffold',
      descriptionSuffix: 'information broker faction',
      expectedEffect: 'Add faction that actively spreads rumor traffic.',
      paramBuilder: (goal) => ({ kind: 'faction', theme: `information brokers to speed rumor flow in ${goal}` }),
      dependsOnPrevious: true,
    },
    {
      command: 'create-encounter-pack',
      intent: 'scaffold',
      descriptionSuffix: 'rumor-propagation encounters',
      expectedEffect: 'Create encounters that trigger rumor spread events.',
      paramBuilder: (goal) => ({ kind: 'encounter-pack', theme: `rumor-spreading encounters for ${goal}` }),
      dependsOnPrevious: true,
    },
    {
      command: 'critique-content',
      intent: 'critique',
      descriptionSuffix: 'rumor flow design',
      expectedEffect: 'Verify rumor paths are well-connected.',
      paramBuilder: () => ({}),
      dependsOnPrevious: true,
    },
    {
      command: 'suggest-next',
      intent: 'suggest_next',
      descriptionSuffix: '',
      expectedEffect: 'Determine further tuning actions.',
      paramBuilder: () => ({}),
      dependsOnPrevious: true,
    },
  ],
};

const ESCALATION_TEMPLATE: TuningTemplate = {
  name: 'adjust escalation',
  keywords: ['escalat', 'alert', 'pressure', 'ramp', 'intensity'],
  steps: [
    {
      command: 'analyze-replay',
      intent: 'analyze_replay',
      descriptionSuffix: 'escalation curve analysis',
      expectedEffect: 'Map current escalation behavior.',
      paramBuilder: (goal) => ({ focus: `escalation pacing for ${goal}` }),
      dependsOnPrevious: false,
    },
    {
      command: 'improve-content',
      intent: 'improve',
      descriptionSuffix: 'adjust escalation coefficients',
      expectedEffect: 'Tune escalation rate toward goal.',
      paramBuilder: (goal) => ({ goal: `adjust escalation: ${goal}` }),
      dependsOnPrevious: true,
    },
    {
      command: 'create-encounter-pack',
      intent: 'scaffold',
      descriptionSuffix: 'escalation-paced encounters',
      expectedEffect: 'Add encounters keyed to escalation phases.',
      paramBuilder: (goal) => ({ kind: 'encounter-pack', theme: `escalation-paced encounters for ${goal}` }),
      dependsOnPrevious: true,
    },
    {
      command: 'critique-content',
      intent: 'critique',
      descriptionSuffix: 'escalation balance',
      expectedEffect: 'Verify escalation curve meets design goals.',
      paramBuilder: () => ({}),
      dependsOnPrevious: true,
    },
    {
      command: 'suggest-next',
      intent: 'suggest_next',
      descriptionSuffix: '',
      expectedEffect: 'Determine further tuning actions.',
      paramBuilder: () => ({}),
      dependsOnPrevious: true,
    },
  ],
};

const ALL_TUNING_TEMPLATES = [
  PARANOIA_TEMPLATE,
  LETHALITY_TEMPLATE,
  RUMOR_SPEED_TEMPLATE,
  ESCALATION_TEMPLATE,
];

export function detectTuningTemplate(goal: string): TuningTemplate | null {
  const lower = goal.toLowerCase();
  for (const template of ALL_TUNING_TEMPLATES) {
    if (template.keywords.some(kw => lower.includes(kw))) {
      return template;
    }
  }
  return null;
}

export function generateTuningPlan(
  goal: string,
  session: DesignSession | null,
): TuningPlan {
  const template = detectTuningTemplate(goal);
  const warnings: string[] = [];
  const steps: TuningStep[] = [];
  let id = 1;

  if (!session) {
    warnings.push('No active session. Start one with `ai session start <name>` for best results.');
  } else {
    if (session.themes.length === 0) {
      warnings.push('Session has no themes set. Consider adding themes for better tuning.');
    }
    // Check for replay history
    const replayEvents = session.history.filter(e =>
      e.kind === 'replay_compared' || e.detail.includes('replay')
    );
    if (replayEvents.length === 0) {
      warnings.push('No replay data in session history. Run a simulation first for best results.');
    }
  }

  if (template) {
    for (const tmplStep of template.steps) {
      const deps: number[] = [];
      if (tmplStep.dependsOnPrevious && steps.length > 0) {
        deps.push(steps[steps.length - 1].id);
      }

      steps.push({
        id,
        description: tmplStep.descriptionSuffix
          ? `${tmplStep.command} — ${tmplStep.descriptionSuffix}`
          : tmplStep.command,
        command: tmplStep.command,
        intent: tmplStep.intent,
        params: tmplStep.paramBuilder(goal),
        dependencies: deps,
        expectedEffect: tmplStep.expectedEffect,
        status: 'pending',
      });
      id++;
    }
  } else {
    // Generic tuning plan — analyze, improve, critique cycle
    warnings.push(`No specific tuning template for "${goal}". Using general tuning sequence.`);
    steps.push({
      id: id++,
      description: 'analyze-replay — baseline assessment',
      command: 'analyze-replay',
      intent: 'analyze_replay',
      params: { focus: goal },
      dependencies: [],
      expectedEffect: 'Establish current state before tuning.',
      status: 'pending',
    });
    steps.push({
      id: id++,
      description: `improve-content — tune toward goal: ${goal}`,
      command: 'improve-content',
      intent: 'improve',
      params: { goal },
      dependencies: [1],
      expectedEffect: `Adjust content toward: ${goal}`,
      status: 'pending',
    });
    steps.push({
      id: id++,
      description: 'critique-content — verify tuning',
      command: 'critique-content',
      intent: 'critique',
      params: {},
      dependencies: [2],
      expectedEffect: 'Review tuning results for balance.',
      status: 'pending',
    });
    steps.push({
      id,
      description: 'suggest-next — follow-up actions',
      command: 'suggest-next',
      intent: 'suggest_next',
      params: {},
      dependencies: [3],
      expectedEffect: 'Determine further tuning actions.',
      status: 'pending',
    });
  }

  return { goal, steps, warnings };
}

// --- Tuning state management (mirrors build state) ---

export function createTuningState(plan: TuningPlan): TuningState {
  return {
    plan,
    startedAt: new Date().toISOString(),
    status: 'planned',
  };
}

export function nextPendingTuningStep(state: TuningState): TuningStep | null {
  const resolvedIds = new Set(
    state.plan.steps
      .filter(s => s.status === 'executed' || s.status === 'skipped')
      .map(s => s.id)
  );

  for (const step of state.plan.steps) {
    if (step.status !== 'pending') continue;
    if (step.dependencies.every(d => resolvedIds.has(d))) return step;
  }
  return null;
}

export function markTuningStepExecuted(
  state: TuningState,
  stepId: number,
  summary: string,
): void {
  const step = state.plan.steps.find(s => s.id === stepId);
  if (!step) return;
  step.status = 'executed';
  step.result = summary;
  state.status = 'executing';
}

export function markTuningStepFailed(
  state: TuningState,
  stepId: number,
  error: string,
): void {
  const step = state.plan.steps.find(s => s.id === stepId);
  if (!step) return;
  step.status = 'failed';
  step.error = error;

  // Cascade skip dependents
  for (const s of state.plan.steps) {
    if (s.status === 'pending' && s.dependencies.includes(stepId)) {
      s.status = 'skipped';
      s.error = `Skipped: dependency step ${stepId} failed`;
    }
  }
}

export function isTuningComplete(state: TuningState): boolean {
  return state.plan.steps.every(s => s.status !== 'pending');
}

export function finalizeTuning(state: TuningState): void {
  state.completedAt = new Date().toISOString();
  state.status = state.plan.steps.some(s => s.status === 'failed') ? 'failed' : 'completed';
}

// ============================================================
// Formatting
// ============================================================

export function formatBalanceAnalysis(analysis: BalanceAnalysis): string {
  const lines: string[] = [];
  lines.push('Balance Analysis');
  lines.push('');
  lines.push(analysis.summary);

  if (analysis.findings.length > 0) {
    lines.push('');
    lines.push('Findings:');
    for (const f of analysis.findings) {
      const icon = f.severity === 'critical' ? '✗' : f.severity === 'warning' ? '⚠' : 'ℹ';
      lines.push(`  ${icon} [${f.severity}] ${f.code}: ${f.summary}`);
      lines.push(`    Area: ${f.area}`);
      lines.push(`    Cause: ${f.likelyCause}`);
      if (f.tickRange) lines.push(`    Ticks: ${f.tickRange[0]}–${f.tickRange[1]}`);
    }
  }

  // Key metrics
  const m = analysis.metrics;
  if (m.totalTicks > 0) {
    lines.push('');
    lines.push('Metrics:');
    lines.push(`  Total ticks: ${m.totalTicks}`);
    if (m.escalationTick !== null) lines.push(`  First escalation: tick ${m.escalationTick}`);
    lines.push(`  Escalation phases: ${m.escalationPhases}`);
    lines.push(`  Rumor reach: ${m.rumorSpreadReach} faction(s)`);
    lines.push(`  Encounter ticks: ${m.encounterTicks}`);
    lines.push(`  Hostility peak: ${m.factionHostilityPeak.toFixed(2)}`);
  }

  return lines.join('\n');
}

export function formatIntentComparison(comparison: IntentComparison): string {
  const lines: string[] = [];
  lines.push('Intent vs Outcome');
  lines.push('');

  if (comparison.intent.targetMood) {
    lines.push(`Target mood: "${comparison.intent.targetMood}" — ${comparison.moodMatch.replace(/_/g, ' ')}`);
    lines.push(`  ${comparison.moodReason}`);
    lines.push('');
  }

  if (comparison.results.length > 0) {
    lines.push('Desired outcomes:');
    for (const r of comparison.results) {
      const icon = r.status === 'achieved' ? '●' : r.status === 'partially_achieved' ? '◐' : '○';
      lines.push(`  ${icon} ${r.desired.description}`);
      lines.push(`    Status: ${r.status.replace(/_/g, ' ')}`);
      lines.push(`    ${r.reason}`);
      if (r.evidence) lines.push(`    Evidence: ${r.evidence}`);
    }
    lines.push('');
  }

  lines.push(`Overall: ${comparison.overallStatus.replace(/_/g, ' ')}`);
  lines.push('');
  lines.push(comparison.summary);

  return lines.join('\n');
}

export function formatWindowAnalysis(analysis: WindowAnalysis): string {
  const lines: string[] = [];
  lines.push(`Window Analysis: ticks ${analysis.startTick}–${analysis.endTick}`);
  lines.push('');
  lines.push(analysis.summary);

  if (analysis.findings.length > 0) {
    lines.push('');
    lines.push('Findings:');
    for (const f of analysis.findings) {
      const icon = f.severity === 'critical' ? '✗' : f.severity === 'warning' ? '⚠' : 'ℹ';
      lines.push(`  ${icon} [${f.severity}] ${f.code}: ${f.summary}`);
    }
  }

  return lines.join('\n');
}

export function formatSuggestedFixes(fixes: SuggestedFix[]): string {
  if (fixes.length === 0) return 'No fixes suggested. Analysis found no actionable issues.';

  const lines: string[] = [];
  lines.push('Suggested Fixes');
  lines.push('');

  for (const fix of fixes) {
    lines.push(`  ${fix.code}`);
    lines.push(`    Target: ${fix.target}`);
    lines.push(`    Reason: ${fix.reason}`);
    lines.push(`    Expected: ${fix.expectedImpact}`);
    lines.push(`    Confidence: ${(fix.confidence * 100).toFixed(0)}%`);
    lines.push(`    Addresses: ${fix.findingCode}`);
    lines.push('');
  }

  lines.push('These are suggestions — no changes are applied without your confirmation.');

  return lines.join('\n');
}

export function formatScenarioComparison(comparison: ScenarioComparison): string {
  const lines: string[] = [];
  lines.push('Scenario Comparison');
  lines.push('');
  lines.push(comparison.summary);

  if (comparison.changes.length > 0) {
    lines.push('');
    lines.push('Changes:');
    for (const c of comparison.changes) {
      const icon = c.direction === 'improved' ? '+' : c.direction === 'regressed' ? '-' : '=';
      lines.push(`  ${icon} ${c.dimension}: ${c.description}`);
    }
  }

  lines.push('');
  lines.push(`Verdict: ${comparison.verdict}`);

  return lines.join('\n');
}

export function formatTuningPlan(plan: TuningPlan): string {
  const lines: string[] = [];
  lines.push(`Tuning Plan: ${plan.goal}`);
  lines.push('');

  for (const step of plan.steps) {
    const deps = step.dependencies.length > 0
      ? ` (after step ${step.dependencies.join(', ')})`
      : '';
    lines.push(`  ${step.id}. ${step.description}${deps}`);
    lines.push(`     Effect: ${step.expectedEffect}`);
  }

  lines.push('');
  lines.push(`Total steps: ${plan.steps.length}`);

  if (plan.warnings.length > 0) {
    lines.push('');
    for (const w of plan.warnings) {
      lines.push(`⚠ ${w}`);
    }
  }

  lines.push('');
  lines.push('Commands: /tune-preview, /tune-step, /tune-execute, /tune-status');

  return lines.join('\n');
}

export function formatTuningStatus(state: TuningState): string {
  const lines: string[] = [];
  lines.push(`Tuning: ${state.plan.goal}`);
  lines.push(`Status: ${state.status}`);
  lines.push(`Started: ${state.startedAt}`);
  if (state.completedAt) lines.push(`Completed: ${state.completedAt}`);
  lines.push('');

  const statusIcon: Record<TuningStepStatus, string> = {
    pending: '○',
    executed: '●',
    failed: '✗',
    skipped: '–',
  };

  for (const step of state.plan.steps) {
    const icon = statusIcon[step.status];
    lines.push(`  ${icon} ${step.id}. ${step.description} [${step.status}]`);
    if (step.result) lines.push(`     → ${step.result}`);
    if (step.error) lines.push(`     ✗ ${step.error}`);
  }

  const executed = state.plan.steps.filter(s => s.status === 'executed').length;
  const total = state.plan.steps.length;
  lines.push('');
  lines.push(`Progress: ${executed}/${total} steps`);

  return lines.join('\n');
}
