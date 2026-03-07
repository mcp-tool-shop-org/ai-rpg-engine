// Chat planner — multi-step tool planning from context.
// Given session state, open issues, replay findings, and user request,
// produces a ranked plan of actions that:
//   - picks the minimum useful set of commands
//   - avoids redundant steps
//   - prefers deterministic tools before AI generation when possible
//   - understands dependencies between fixes
// Not "eager intern" — "experienced builder."

import type { DesignSession, SessionIssue, SessionEvent } from './session.js';
import type { ChatIntent } from './chat-types.js';
import type { ShapedContext } from './chat-memory-shaper.js';

// --- Types ---

export type PlanStep = {
  /** Sequential step number (1-based). */
  order: number;
  /** The engine command / chat intent to invoke. */
  command: ChatIntent | string;
  /** Human-readable description. */
  description: string;
  /** Why this step matters. */
  reason: string;
  /** Confidence that this step will help. */
  confidence: 'high' | 'medium' | 'low';
  /** Expected impact: what changes after this step. */
  expectedImpact: string;
  /** Steps that must complete before this one (by order number). */
  dependsOn: number[];
  /** Whether this step is deterministic (data lookup) vs AI-generated. */
  kind: 'deterministic' | 'ai-assisted';
  /** Open issues this step addresses (by code). */
  addressesIssues: string[];
};

export type ActionPlan = {
  /** Overall goal of the plan. */
  goal: string;
  /** Ordered steps. */
  steps: PlanStep[];
  /** Why this ordering was chosen. */
  rationale: string;
  /** What session signals informed this plan. */
  signals: PlanSignal[];
};

export type PlanSignal = {
  /** What the planner observed. */
  observation: string;
  /** How it influenced the plan. */
  influence: string;
  /** Source: session, issue, replay, history, user-request. */
  source: 'session' | 'issue' | 'replay' | 'history' | 'user-request';
};

// --- Deterministic plan from session signals ---

/**
 * Analyze session state and produce a plan of recommended actions,
 * ordered by dependency and priority. No LLM needed — this is pure logic.
 */
export function planFromSession(
  session: DesignSession | null,
  userGoal?: string,
): ActionPlan {
  if (!session) {
    return {
      goal: userGoal || 'Start a new design session',
      steps: [{
        order: 1,
        command: 'session_info',
        description: 'Start a design session with themes and constraints',
        reason: 'No active session detected. A session provides context for all commands.',
        confidence: 'high',
        expectedImpact: 'All subsequent commands will be grounded in session context.',
        dependsOn: [],
        kind: 'deterministic',
        addressesIssues: [],
      }],
      rationale: 'No session exists yet. Start one before doing anything else.',
      signals: [{ observation: 'No session found', influence: 'Recommend session creation first', source: 'session' }],
    };
  }

  const steps: PlanStep[] = [];
  const signals: PlanSignal[] = [];
  let order = 1;

  // Signal: open issues
  const openIssues = session.issues.filter(i => i.status === 'open');
  const highSeverity = openIssues.filter(i => i.severity === 'high');
  const medSeverity = openIssues.filter(i => i.severity === 'medium');

  if (highSeverity.length > 0) {
    signals.push({
      observation: `${highSeverity.length} high-severity open issue(s)`,
      influence: 'Prioritize fixing high-severity issues before adding new content',
      source: 'issue',
    });
  }

  if (medSeverity.length > 0) {
    signals.push({
      observation: `${medSeverity.length} medium-severity open issue(s)`,
      influence: 'Address medium-severity issues after high-severity',
      source: 'issue',
    });
  }

  // Signal: empty artifact categories
  const { districts, factions, quests, rooms, packs } = session.artifacts;
  const emptyCats: string[] = [];
  if (districts.length === 0) emptyCats.push('districts');
  if (factions.length === 0) emptyCats.push('factions');
  if (quests.length === 0) emptyCats.push('quests');
  if (rooms.length === 0) emptyCats.push('rooms');

  if (emptyCats.length > 0) {
    signals.push({
      observation: `Missing artifact categories: ${emptyCats.join(', ')}`,
      influence: 'Scaffold missing content types to build a complete world',
      source: 'session',
    });
  }

  // Signal: no recent critiques
  const history = session.history ?? [];
  const recentCritiques = history.filter(e =>
    e.kind === 'issue_opened' &&
    isRecent(e.timestamp, 24 * 60 * 60 * 1000) // last 24h
  );
  const hasCritiqued = recentCritiques.length > 0;

  // Signal: replay data
  const replayEvents = history.filter(e => e.kind === 'replay_compared');
  const hasReplayData = replayEvents.length > 0;

  // Signal: user goal
  if (userGoal) {
    signals.push({
      observation: `User goal: "${userGoal}"`,
      influence: 'Plan steps oriented toward the stated goal',
      source: 'user-request',
    });
  }

  // --- Step generation logic ---

  // Phase 1: Fix high-severity issues first (deterministic analysis → AI improvement)
  if (highSeverity.length > 0) {
    // Group issues by target for efficient fixing
    const byTarget = groupIssuesByTarget(highSeverity);
    for (const [target, issues] of byTarget) {
      steps.push({
        order: order++,
        command: 'critique',
        description: `Re-evaluate ${target} to confirm current issue state`,
        reason: `${issues.length} high-severity issue(s) reported on ${target}`,
        confidence: 'high',
        expectedImpact: `Confirm whether issues [${issues.map(i => i.code).join(', ')}] still apply`,
        dependsOn: [],
        kind: 'deterministic',
        addressesIssues: issues.map(i => i.code),
      });

      const prevStep = order - 1;
      steps.push({
        order: order++,
        command: 'improve',
        description: `Fix ${target}: address ${issues.map(i => i.code).join(', ')}`,
        reason: 'High-severity issues block further design progress',
        confidence: 'medium',
        expectedImpact: `Resolve ${issues.length} high-severity issue(s) on ${target}`,
        dependsOn: [prevStep],
        kind: 'ai-assisted',
        addressesIssues: issues.map(i => i.code),
      });
    }
  }

  // Phase 2: Fix medium-severity issues
  if (medSeverity.length > 0 && steps.length < 8) {
    const byTarget = groupIssuesByTarget(medSeverity);
    for (const [target, issues] of byTarget) {
      if (steps.length >= 8) break;
      const lastFixStep = steps.length > 0 ? steps[steps.length - 1].order : 0;
      steps.push({
        order: order++,
        command: 'improve',
        description: `Address medium-severity issues on ${target}: ${issues.map(i => i.code).join(', ')}`,
        reason: 'Medium-severity issues reduce design quality',
        confidence: 'medium',
        expectedImpact: `Improve ${target} by resolving ${issues.length} issue(s)`,
        dependsOn: lastFixStep > 0 ? [lastFixStep] : [],
        kind: 'ai-assisted',
        addressesIssues: issues.map(i => i.code),
      });
    }
  }

  // Phase 3: Critique existing content if not recently critiqued
  if (!hasCritiqued && (rooms.length > 0 || districts.length > 0 || factions.length > 0)) {
    const critTarget = rooms[rooms.length - 1] ?? districts[districts.length - 1] ?? factions[factions.length - 1];
    const lastStep = steps.length > 0 ? steps[steps.length - 1].order : 0;
    steps.push({
      order: order++,
      command: 'critique',
      description: `Critique latest artifact: ${critTarget}`,
      reason: 'No recent critiques found — quality check before adding more content',
      confidence: 'high',
      expectedImpact: 'Surface any issues before building on top of unchecked content',
      dependsOn: lastStep > 0 ? [lastStep] : [],
      kind: 'ai-assisted',
      addressesIssues: [],
    });
  }

  // Phase 4: Run replay analysis if we have replay data but no recent comparison
  if (hasReplayData && replayEvents.length > 0) {
    const lastCompare = replayEvents[replayEvents.length - 1];
    if (!isRecent(lastCompare.timestamp, 24 * 60 * 60 * 1000)) {
      const lastStep = steps.length > 0 ? steps[steps.length - 1].order : 0;
      steps.push({
        order: order++,
        command: 'compare_replays',
        description: 'Compare recent replays to detect regressions',
        reason: 'Last replay comparison was over 24h ago',
        confidence: 'medium',
        expectedImpact: 'Detect any behavioral regressions from recent changes',
        dependsOn: lastStep > 0 ? [lastStep] : [],
        kind: 'deterministic',
        addressesIssues: [],
      });
    }
  }

  // Phase 5: Fill empty artifact categories
  if (emptyCats.length > 0 && steps.length < 8) {
    const lastStep = steps.length > 0 ? steps[steps.length - 1].order : 0;
    // Scaffold order: district → faction → room → quest (dependency chain)
    const scaffoldOrder: Array<{ cat: string; kind: string; dep: string | null }> = [
      { cat: 'districts', kind: 'district', dep: null },
      { cat: 'factions', kind: 'faction', dep: 'districts' },
      { cat: 'rooms', kind: 'room', dep: 'districts' },
      { cat: 'quests', kind: 'quest', dep: 'factions' },
    ];

    for (const { cat, kind, dep } of scaffoldOrder) {
      if (!emptyCats.includes(cat)) continue;
      if (steps.length >= 8) break;

      const depOn: number[] = [];
      if (dep && emptyCats.includes(dep)) {
        const depStep = steps.find(s => s.description.includes(dep));
        if (depStep) depOn.push(depStep.order);
      }
      if (depOn.length === 0 && lastStep > 0) {
        depOn.push(lastStep);
      }

      steps.push({
        order: order++,
        command: 'scaffold',
        description: `Scaffold a ${kind} to fill missing ${cat}`,
        reason: `No ${cat} in the project yet — core building block`,
        confidence: 'high',
        expectedImpact: `Project gains its first ${kind}`,
        dependsOn: depOn,
        kind: 'ai-assisted',
        addressesIssues: [],
      });
    }
  }

  // Phase 6: Suggest-next if everything looks clean and we have capacity
  if (steps.length === 0) {
    steps.push({
      order: order++,
      command: 'suggest_next',
      description: 'Analyze session and recommend next design actions',
      reason: 'No obvious issues or gaps detected — ask the engine what to do next',
      confidence: 'medium',
      expectedImpact: 'Surface opportunities for improvement or expansion',
      dependsOn: [],
      kind: 'ai-assisted',
      addressesIssues: [],
    });
  }

  // Build rationale
  const rationale = buildRationale(signals, steps);

  return {
    goal: userGoal || inferGoal(signals, steps),
    steps,
    rationale,
    signals,
  };
}

// --- Format for presentation ---

export function formatPlan(plan: ActionPlan): string {
  const lines: string[] = [];
  lines.push(`**Plan: ${plan.goal}**`);
  lines.push('');

  if (plan.signals.length > 0) {
    lines.push('Signals:');
    for (const s of plan.signals) {
      lines.push(`  [${s.source}] ${s.observation} → ${s.influence}`);
    }
    lines.push('');
  }

  lines.push(`${plan.steps.length} step(s):`);
  for (const step of plan.steps) {
    const deps = step.dependsOn.length > 0 ? ` (after step ${step.dependsOn.join(', ')})` : '';
    const tag = step.kind === 'deterministic' ? '[det]' : '[ai]';
    const issues = step.addressesIssues.length > 0 ? ` — fixes: ${step.addressesIssues.join(', ')}` : '';
    lines.push(`  ${step.order}. ${tag} ${step.description}${deps}${issues}`);
    lines.push(`     Reason: ${step.reason}`);
    lines.push(`     Impact: ${step.expectedImpact} (${step.confidence} confidence)`);
  }

  lines.push('');
  lines.push(`Rationale: ${plan.rationale}`);
  return lines.join('\n');
}

/**
 * Validate a plan: check for cycles, missing dependencies, duplicate orders.
 */
export function validatePlan(plan: ActionPlan): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const orders = new Set<number>();

  for (const step of plan.steps) {
    if (orders.has(step.order)) {
      errors.push(`Duplicate step order: ${step.order}`);
    }
    orders.add(step.order);

    for (const dep of step.dependsOn) {
      if (!orders.has(dep) && !plan.steps.some(s => s.order === dep)) {
        errors.push(`Step ${step.order} depends on non-existent step ${dep}`);
      }
      if (dep >= step.order) {
        errors.push(`Step ${step.order} depends on later step ${dep} (cycle risk)`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// --- Internal helpers ---

function groupIssuesByTarget(issues: SessionIssue[]): Map<string, SessionIssue[]> {
  const groups = new Map<string, SessionIssue[]>();
  for (const issue of issues) {
    if (!groups.has(issue.target)) groups.set(issue.target, []);
    groups.get(issue.target)!.push(issue);
  }
  return groups;
}

function isRecent(timestamp: string, withinMs: number): boolean {
  try {
    const t = new Date(timestamp).getTime();
    return Date.now() - t < withinMs;
  } catch {
    return false;
  }
}

function buildRationale(signals: PlanSignal[], steps: PlanStep[]): string {
  const parts: string[] = [];

  const fixSteps = steps.filter(s => s.addressesIssues.length > 0);
  const scaffoldSteps = steps.filter(s => s.command === 'scaffold');
  const analysisSteps = steps.filter(s =>
    s.command === 'critique' || s.command === 'compare_replays' || s.command === 'analyze_replay'
  );

  if (fixSteps.length > 0) {
    parts.push(`Fix ${fixSteps.reduce((n, s) => n + s.addressesIssues.length, 0)} open issue(s) first`);
  }
  if (analysisSteps.length > 0) {
    parts.push(`then verify quality`);
  }
  if (scaffoldSteps.length > 0) {
    parts.push(`then expand content (${scaffoldSteps.length} scaffold(s))`);
  }

  if (parts.length === 0) return 'Session is in good shape — suggest next logical step.';
  return parts.join(', ') + '.';
}

function inferGoal(signals: PlanSignal[], steps: PlanStep[]): string {
  const userSignal = signals.find(s => s.source === 'user-request');
  if (userSignal) return userSignal.observation;

  const hasIssues = steps.some(s => s.addressesIssues.length > 0);
  const hasScaffold = steps.some(s => s.command === 'scaffold');

  if (hasIssues && hasScaffold) return 'Fix open issues and expand content';
  if (hasIssues) return 'Resolve open design issues';
  if (hasScaffold) return 'Build out missing content';
  return 'Advance the design';
}
