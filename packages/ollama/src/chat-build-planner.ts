// Chat build planner — session-aware, plan-first build workflows.
// Converts natural language goals into concrete command sequences.
// Plans use existing tools — no hidden builders, no magic mutations.
// Everything is previewable, confirmable, and traceable.

import type { DesignSession, SessionArtifacts } from './session.js';
import type { ChatIntent } from './chat-types.js';

// --- Types ---

export type BuildStepStatus = 'pending' | 'executed' | 'failed' | 'skipped';

export type BuildStep = {
  /** Sequential ID (1-based). */
  id: number;
  /** Human-readable description. */
  description: string;
  /** The engine command this step invokes. */
  command: string;
  /** The chat intent this step maps to for tool dispatch. */
  intent: ChatIntent;
  /** Parameters for the tool. */
  params: Record<string, string>;
  /** Step IDs that must complete before this one. */
  dependencies: number[];
  /** Artifact categories this step is expected to produce. */
  artifactOutputs: string[];
  /** If true, content from prior scaffold steps is injected as params.content at execution time. */
  usePriorContent: boolean;
  /** Current execution status. */
  status: BuildStepStatus;
  /** Result summary after execution. */
  result?: string;
  /** Error message if failed. */
  error?: string;
};

export type BuildPlan = {
  /** The user's original goal. */
  goal: string;
  /** Ordered build steps. */
  steps: BuildStep[];
  /** Total number of steps. */
  estimatedSteps: number;
  /** Advisory warnings (e.g., "session has no themes set"). */
  warnings: string[];
};

export type BuildState = {
  plan: BuildPlan;
  /** When the build was started. */
  startedAt: string;
  /** When the build completed. */
  completedAt?: string;
  /** Overall status. */
  status: 'planned' | 'executing' | 'completed' | 'failed';
  /** Accumulated YAML/content outputs from scaffold steps, for critique injection. */
  generatedContent: string[];
};

// --- Build templates (internal) ---

type TemplateStep = {
  command: string;
  intent: ChatIntent;
  descriptionSuffix: string;
  artifactKind?: keyof SessionArtifacts;
  paramBuilder: (goal: string) => Record<string, string>;
  dependsOnPrevious: boolean;
  usePriorContent: boolean;
};

type BuildTemplate = {
  name: string;
  keywords: string[];
  steps: TemplateStep[];
};

const DISTRICT_TEMPLATE: BuildTemplate = {
  name: 'district',
  keywords: ['district', 'area', 'zone', 'neighborhood', 'quarter', 'ward', 'market'],
  steps: [
    {
      command: 'create-district',
      intent: 'scaffold',
      descriptionSuffix: 'district',
      artifactKind: 'districts',
      paramBuilder: (goal) => ({ kind: 'district', theme: goal }),
      dependsOnPrevious: false,
      usePriorContent: false,
    },
    {
      command: 'create-faction',
      intent: 'scaffold',
      descriptionSuffix: 'primary faction',
      artifactKind: 'factions',
      paramBuilder: (goal) => ({ kind: 'faction', theme: `primary faction for ${goal}` }),
      dependsOnPrevious: true,
      usePriorContent: false,
    },
    {
      command: 'create-faction',
      intent: 'scaffold',
      descriptionSuffix: 'rival faction',
      artifactKind: 'factions',
      paramBuilder: (goal) => ({ kind: 'faction', theme: `rival faction for ${goal}` }),
      dependsOnPrevious: false,
      usePriorContent: false,
    },
    {
      command: 'create-location-pack',
      intent: 'scaffold',
      descriptionSuffix: 'location pack',
      artifactKind: 'packs',
      paramBuilder: (goal) => ({ kind: 'location-pack', theme: `locations for ${goal}` }),
      dependsOnPrevious: true,
      usePriorContent: false,
    },
    {
      command: 'create-encounter-pack',
      intent: 'scaffold',
      descriptionSuffix: 'encounter pack',
      artifactKind: 'packs',
      paramBuilder: (goal) => ({ kind: 'encounter-pack', theme: `encounters for ${goal}` }),
      dependsOnPrevious: true,
      usePriorContent: false,
    },
    {
      command: 'critique-content',
      intent: 'critique',
      descriptionSuffix: 'generated content',
      paramBuilder: () => ({}),
      dependsOnPrevious: true,
      usePriorContent: true,
    },
    {
      command: 'suggest-next',
      intent: 'suggest_next',
      descriptionSuffix: '',
      paramBuilder: () => ({}),
      dependsOnPrevious: true,
      usePriorContent: false,
    },
  ],
};

const SCENARIO_TEMPLATE: BuildTemplate = {
  name: 'scenario',
  keywords: ['scenario', 'quest', 'adventure', 'heist', 'mission', 'chapel', 'dungeon', 'encounter'],
  steps: [
    {
      command: 'create-district',
      intent: 'scaffold',
      descriptionSuffix: 'setting district',
      artifactKind: 'districts',
      paramBuilder: (goal) => ({ kind: 'district', theme: `setting for ${goal}` }),
      dependsOnPrevious: false,
      usePriorContent: false,
    },
    {
      command: 'create-quest',
      intent: 'scaffold',
      descriptionSuffix: 'quest',
      artifactKind: 'quests',
      paramBuilder: (goal) => ({ kind: 'quest', theme: goal }),
      dependsOnPrevious: true,
      usePriorContent: false,
    },
    {
      command: 'create-encounter-pack',
      intent: 'scaffold',
      descriptionSuffix: 'primary encounters',
      artifactKind: 'packs',
      paramBuilder: (goal) => ({ kind: 'encounter-pack', theme: `encounters for ${goal}` }),
      dependsOnPrevious: true,
      usePriorContent: false,
    },
    {
      command: 'create-encounter-pack',
      intent: 'scaffold',
      descriptionSuffix: 'secondary encounters',
      artifactKind: 'packs',
      paramBuilder: (goal) => ({ kind: 'encounter-pack', theme: `additional encounters for ${goal}` }),
      dependsOnPrevious: false,
      usePriorContent: false,
    },
    {
      command: 'create-room',
      intent: 'scaffold',
      descriptionSuffix: 'key location',
      artifactKind: 'rooms',
      paramBuilder: (goal) => ({ kind: 'room', theme: `key location for ${goal}` }),
      dependsOnPrevious: true,
      usePriorContent: false,
    },
    {
      command: 'critique-content',
      intent: 'critique',
      descriptionSuffix: 'generated content',
      paramBuilder: () => ({}),
      dependsOnPrevious: true,
      usePriorContent: true,
    },
    {
      command: 'suggest-next',
      intent: 'suggest_next',
      descriptionSuffix: '',
      paramBuilder: () => ({}),
      dependsOnPrevious: true,
      usePriorContent: false,
    },
  ],
};

const FACTION_TEMPLATE: BuildTemplate = {
  name: 'faction network',
  keywords: ['faction', 'guild', 'group', 'network', 'organization', 'order', 'syndicate'],
  steps: [
    {
      command: 'create-faction',
      intent: 'scaffold',
      descriptionSuffix: 'primary faction',
      artifactKind: 'factions',
      paramBuilder: (goal) => ({ kind: 'faction', theme: goal }),
      dependsOnPrevious: false,
      usePriorContent: false,
    },
    {
      command: 'create-faction',
      intent: 'scaffold',
      descriptionSuffix: 'opposing faction',
      artifactKind: 'factions',
      paramBuilder: (goal) => ({ kind: 'faction', theme: `rival to ${goal}` }),
      dependsOnPrevious: false,
      usePriorContent: false,
    },
    {
      command: 'create-faction',
      intent: 'scaffold',
      descriptionSuffix: 'neutral faction',
      artifactKind: 'factions',
      paramBuilder: (goal) => ({ kind: 'faction', theme: `neutral mediator related to ${goal}` }),
      dependsOnPrevious: false,
      usePriorContent: false,
    },
    {
      command: 'create-encounter-pack',
      intent: 'scaffold',
      descriptionSuffix: 'faction encounters',
      artifactKind: 'packs',
      paramBuilder: (goal) => ({ kind: 'encounter-pack', theme: `encounters involving ${goal}` }),
      dependsOnPrevious: true,
      usePriorContent: false,
    },
    {
      command: 'critique-content',
      intent: 'critique',
      descriptionSuffix: 'generated factions',
      paramBuilder: () => ({}),
      dependsOnPrevious: true,
      usePriorContent: true,
    },
    {
      command: 'suggest-next',
      intent: 'suggest_next',
      descriptionSuffix: '',
      paramBuilder: () => ({}),
      dependsOnPrevious: true,
      usePriorContent: false,
    },
  ],
};

const ALL_TEMPLATES = [DISTRICT_TEMPLATE, SCENARIO_TEMPLATE, FACTION_TEMPLATE];

// --- Template matching ---

export function detectTemplate(goal: string): BuildTemplate {
  const lower = goal.toLowerCase();
  for (const template of ALL_TEMPLATES) {
    if (template.keywords.some(kw => lower.includes(kw))) {
      return template;
    }
  }
  return DISTRICT_TEMPLATE;
}

// --- Artifact skip detection ---

function slugWords(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3);
}

function hasMatchingArtifact(ids: string[], goal: string): boolean {
  if (ids.length === 0) return false;
  const goalWords = slugWords(goal);
  if (goalWords.length === 0) return false;
  return ids.some(id => {
    const lower = id.toLowerCase();
    return goalWords.some(w => lower.includes(w));
  });
}

// --- Issue-aware step injection ---

const ISSUE_PREFIX_TO_STEP: Array<{
  prefixes: string[];
  command: string;
  intent: ChatIntent;
  descriptionSuffix: string;
  paramBuilder: (goal: string) => Record<string, string>;
  artifactKind?: keyof SessionArtifacts;
}> = [
  {
    prefixes: ['RUMOR_', 'GOSSIP_'],
    command: 'create-faction',
    intent: 'scaffold',
    descriptionSuffix: 'rumor-related faction (issue-driven)',
    paramBuilder: (goal) => ({ kind: 'faction', theme: `rumor network for ${goal}` }),
    artifactKind: 'factions',
  },
  {
    prefixes: ['FACTION_', 'ALLIANCE_'],
    command: 'create-encounter-pack',
    intent: 'scaffold',
    descriptionSuffix: 'faction interaction encounters (issue-driven)',
    paramBuilder: (goal) => ({ kind: 'encounter-pack', theme: `faction interactions for ${goal}` }),
    artifactKind: 'packs',
  },
  {
    prefixes: ['GAP_', 'MISSING_'],
    command: 'create-location-pack',
    intent: 'scaffold',
    descriptionSuffix: 'missing content (issue-driven)',
    paramBuilder: (goal) => ({ kind: 'location-pack', theme: `fill content gap for ${goal}` }),
    artifactKind: 'packs',
  },
];

function injectIssueSteps(
  session: DesignSession,
  existingSteps: BuildStep[],
  nextId: number,
  goal: string,
): { steps: BuildStep[]; warnings: string[] } {
  const openIssues = session.issues.filter(i => i.status === 'open');
  if (openIssues.length === 0) return { steps: [], warnings: [] };

  const steps: BuildStep[] = [];
  const warnings: string[] = [];
  let id = nextId;

  // Check which issue categories are already addressed by existing steps
  const existingCommands = new Set(existingSteps.map(s => s.command));

  for (const mapping of ISSUE_PREFIX_TO_STEP) {
    const relevantIssues = openIssues.filter(i =>
      mapping.prefixes.some(p => i.code.startsWith(p))
    );
    if (relevantIssues.length === 0) continue;

    // Don't inject if the same command type already exists
    if (existingCommands.has(mapping.command) && mapping.command !== 'create-encounter-pack') {
      warnings.push(`Open ${relevantIssues[0].code} issues may be addressed by existing plan steps`);
      continue;
    }

    const lastStepId = existingSteps.length > 0
      ? existingSteps[existingSteps.length - 1].id
      : 0;

    steps.push({
      id: id++,
      description: `${mapping.command} — ${mapping.descriptionSuffix}`,
      command: mapping.command,
      intent: mapping.intent,
      params: mapping.paramBuilder(goal),
      dependencies: lastStepId > 0 ? [lastStepId] : [],
      artifactOutputs: mapping.artifactKind ? [mapping.artifactKind] : [],
      usePriorContent: false,
      status: 'pending',
    });

    warnings.push(
      `Added ${mapping.descriptionSuffix} step to address ${relevantIssues.length} open ${mapping.prefixes[0]}* issue(s)`
    );
  }

  // Replay regression warning
  const replayIssues = openIssues.filter(i =>
    i.code.startsWith('REPLAY_') || i.code.startsWith('REGRESSION_')
  );
  if (replayIssues.length > 0) {
    warnings.push(
      `${replayIssues.length} replay/regression issue(s) open — consider running replay analysis after build`
    );
  }

  return { steps, warnings };
}

// --- Replay-aware step injection ---

function injectReplaySteps(
  session: DesignSession,
  existingSteps: BuildStep[],
  nextId: number,
  goal: string,
): BuildStep[] {
  const history = session.history ?? [];
  const replayEvents = history.filter(e => e.kind === 'replay_compared');
  if (replayEvents.length === 0) return [];

  const lastReplay = replayEvents[replayEvents.length - 1];
  const steps: BuildStep[] = [];
  let id = nextId;

  // If the last replay flagged never_triggered or similar issues
  if (lastReplay.detail.includes('never_triggered') || lastReplay.detail.includes('regression')) {
    const lastStepId = existingSteps.length > 0
      ? existingSteps[existingSteps.length - 1].id
      : 0;

    steps.push({
      id: id++,
      description: 'create-encounter-pack — triggerable scenario (replay-driven)',
      command: 'create-encounter-pack',
      intent: 'scaffold',
      params: { kind: 'encounter-pack', theme: `triggerable encounters for ${goal}` },
      dependencies: lastStepId > 0 ? [lastStepId] : [],
      artifactOutputs: ['packs'],
      usePriorContent: false,
      status: 'pending',
    });
  }

  return steps;
}

// --- Plan generation ---

export function generateBuildPlan(
  goal: string,
  session: DesignSession | null,
): BuildPlan {
  const template = detectTemplate(goal);
  const warnings: string[] = [];
  const steps: BuildStep[] = [];
  let id = 1;

  if (!session) {
    warnings.push('No active session. Start one with `ai session start <name>` for best results.');
  } else {
    if (session.themes.length === 0) {
      warnings.push('Session has no themes set. Consider adding themes for better generation.');
    }
  }

  const existing = session?.artifacts ?? {
    districts: [], factions: [], quests: [], rooms: [], packs: [],
  };

  for (const tmplStep of template.steps) {
    // Smart skip: if session already has matching artifacts
    if (tmplStep.artifactKind && hasMatchingArtifact(existing[tmplStep.artifactKind], goal)) {
      warnings.push(`Skipped ${tmplStep.descriptionSuffix}: session already has matching ${tmplStep.artifactKind}`);
      continue;
    }

    const deps: number[] = [];
    if (tmplStep.dependsOnPrevious && steps.length > 0) {
      deps.push(steps[steps.length - 1].id);
    }

    const params = tmplStep.paramBuilder(goal);
    const description = tmplStep.descriptionSuffix
      ? `${tmplStep.command} — ${tmplStep.descriptionSuffix}`
      : tmplStep.command;

    steps.push({
      id,
      description,
      command: tmplStep.command,
      intent: tmplStep.intent,
      params,
      dependencies: deps,
      artifactOutputs: tmplStep.artifactKind ? [tmplStep.artifactKind] : [],
      usePriorContent: tmplStep.usePriorContent,
      status: 'pending',
    });
    id++;
  }

  // Issue-aware step injection
  if (session) {
    const injected = injectIssueSteps(session, steps, id, goal);
    steps.push(...injected.steps);
    id += injected.steps.length;
    warnings.push(...injected.warnings);
  }

  // Replay-aware step injection
  if (session) {
    const replaySteps = injectReplaySteps(session, steps, id, goal);
    steps.push(...replaySteps);
  }

  return {
    goal,
    steps,
    estimatedSteps: steps.length,
    warnings,
  };
}

// --- Build state management ---

export function createBuildState(plan: BuildPlan): BuildState {
  return {
    plan,
    startedAt: new Date().toISOString(),
    status: 'planned',
    generatedContent: [],
  };
}

export function nextPendingStep(state: BuildState): BuildStep | null {
  const executedIds = new Set(
    state.plan.steps
      .filter(s => s.status === 'executed' || s.status === 'skipped')
      .map(s => s.id)
  );

  for (const step of state.plan.steps) {
    if (step.status !== 'pending') continue;
    // Check all dependencies are resolved
    const depsResolved = step.dependencies.every(d => executedIds.has(d));
    if (depsResolved) return step;
  }
  return null;
}

export function markStepExecuted(
  state: BuildState,
  stepId: number,
  summary: string,
  output?: string,
): void {
  const step = state.plan.steps.find(s => s.id === stepId);
  if (!step) return;
  step.status = 'executed';
  step.result = summary;
  if (output) {
    state.generatedContent.push(output);
  }
  state.status = 'executing';
}

export function markStepFailed(state: BuildState, stepId: number, error: string): void {
  const step = state.plan.steps.find(s => s.id === stepId);
  if (!step) return;
  step.status = 'failed';
  step.error = error;

  // Skip dependent steps
  const failedId = step.id;
  for (const s of state.plan.steps) {
    if (s.status === 'pending' && s.dependencies.includes(failedId)) {
      s.status = 'skipped';
      s.error = `Skipped: dependency step ${failedId} failed`;
    }
  }
}

export function isBuildComplete(state: BuildState): boolean {
  return state.plan.steps.every(s => s.status !== 'pending');
}

export function finalizeBuild(state: BuildState): void {
  state.completedAt = new Date().toISOString();
  const hasFailed = state.plan.steps.some(s => s.status === 'failed');
  state.status = hasFailed ? 'failed' : 'completed';
}

// --- Diagnostics ---

export function buildDiagnostics(
  state: BuildState,
  session: DesignSession | null,
): string[] {
  const diagnostics: string[] = [];

  // Step results summary
  const executed = state.plan.steps.filter(s => s.status === 'executed').length;
  const failed = state.plan.steps.filter(s => s.status === 'failed').length;
  const skipped = state.plan.steps.filter(s => s.status === 'skipped').length;
  diagnostics.push(`Steps: ${executed} executed, ${failed} failed, ${skipped} skipped`);

  // Check for issues opened during build
  if (session) {
    const openIssues = session.issues.filter(i => i.status === 'open');
    if (openIssues.length > 0) {
      diagnostics.push(`${openIssues.length} open issue(s) after build:`);
      for (const issue of openIssues.slice(0, 5)) {
        diagnostics.push(`  [${issue.severity}] ${issue.code}: ${issue.summary}`);
      }
      if (openIssues.length > 5) {
        diagnostics.push(`  ... and ${openIssues.length - 5} more`);
      }
    }
  }

  // Check generated content volume
  const totalContent = state.generatedContent.reduce((sum, c) => sum + c.length, 0);
  if (totalContent > 0) {
    diagnostics.push(`Generated: ${state.generatedContent.length} artifact(s), ${totalContent} chars total`);
  }

  // Suggest follow-up
  if (failed > 0) {
    diagnostics.push('Suggestion: review failed steps and retry with /build <goal>');
  }
  if (session) {
    const emptyCategories: string[] = [];
    const arts = session.artifacts;
    if (arts.districts.length === 0) emptyCategories.push('districts');
    if (arts.factions.length === 0) emptyCategories.push('factions');
    if (arts.quests.length === 0) emptyCategories.push('quests');
    if (arts.rooms.length === 0) emptyCategories.push('rooms');
    if (emptyCategories.length > 0) {
      diagnostics.push(`Missing artifact categories: ${emptyCategories.join(', ')}`);
    }
  }

  return diagnostics;
}

// --- Formatting ---

export function formatBuildPlan(plan: BuildPlan): string {
  const lines: string[] = [];
  lines.push(`Build Plan: ${plan.goal}`);
  lines.push('');

  for (const step of plan.steps) {
    const deps = step.dependencies.length > 0
      ? ` (after step ${step.dependencies.join(', ')})`
      : '';
    lines.push(`  ${step.id}. ${step.description}${deps}`);
  }

  lines.push('');
  lines.push(`Estimated steps: ${plan.estimatedSteps}`);

  if (plan.warnings.length > 0) {
    lines.push('');
    for (const w of plan.warnings) {
      lines.push(`⚠ ${w}`);
    }
  }

  lines.push('');
  lines.push('Commands: /preview, /step, /execute, /status');

  return lines.join('\n');
}

export function formatBuildPreview(plan: BuildPlan): string {
  const lines: string[] = [];
  lines.push(`Build Preview: ${plan.goal}`);
  lines.push('');

  for (const step of plan.steps) {
    const deps = step.dependencies.length > 0
      ? ` (after step ${step.dependencies.join(', ')})`
      : '';
    lines.push(`  ${step.id}. ${step.command}${deps}`);
    if (step.params.kind) lines.push(`     Kind: ${step.params.kind}`);
    if (step.params.theme) lines.push(`     Theme: ${step.params.theme}`);
    if (step.artifactOutputs.length > 0) {
      lines.push(`     Produces: ${step.artifactOutputs.join(', ')}`);
    }
  }

  lines.push('');
  lines.push(`Total steps: ${plan.steps.length}`);

  if (plan.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of plan.warnings) {
      lines.push(`  ⚠ ${w}`);
    }
  }

  return lines.join('\n');
}

export function formatBuildStatus(state: BuildState): string {
  const lines: string[] = [];
  lines.push(`Build: ${state.plan.goal}`);
  lines.push(`Status: ${state.status}`);
  lines.push(`Started: ${state.startedAt}`);
  if (state.completedAt) lines.push(`Completed: ${state.completedAt}`);
  lines.push('');

  const statusIcon: Record<BuildStepStatus, string> = {
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

export function formatBuildDiagnostics(diagnostics: string[]): string {
  if (diagnostics.length === 0) return 'No diagnostics available.';
  const lines = ['Build Diagnostics', ''];
  for (const d of diagnostics) {
    lines.push(d);
  }
  return lines.join('\n');
}
