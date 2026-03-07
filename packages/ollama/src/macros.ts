// Workflow macros — composable multi-step authoring pipelines
// Each macro chains existing commands with progress reporting.
// No new AI prompts. Pure composition of existing capabilities.

import type { OllamaTextClient } from './client.js';

// --- Framework types ---

export type MacroStep = {
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  output?: string;
  error?: string;
};

export type MacroProgress = {
  name: string;
  steps: MacroStep[];
  currentStep: number;
  totalSteps: number;
};

export type MacroResult = {
  ok: boolean;
  name: string;
  steps: MacroStep[];
  summary: string;
};

export type ProgressCallback = (progress: MacroProgress) => void;

// --- Macro runner ---

export function createMacroProgress(name: string, labels: string[]): MacroProgress {
  return {
    name,
    steps: labels.map(label => ({ label, status: 'pending' })),
    currentStep: 0,
    totalSteps: labels.length,
  };
}

export function advanceStep(
  progress: MacroProgress,
  output?: string,
  onProgress?: ProgressCallback,
): void {
  const step = progress.steps[progress.currentStep];
  if (step) {
    step.status = 'done';
    if (output) step.output = output;
  }
  progress.currentStep++;
  if (progress.currentStep < progress.totalSteps) {
    progress.steps[progress.currentStep].status = 'running';
  }
  onProgress?.(progress);
}

export function failStep(
  progress: MacroProgress,
  error: string,
  onProgress?: ProgressCallback,
): void {
  const step = progress.steps[progress.currentStep];
  if (step) {
    step.status = 'failed';
    step.error = error;
  }
  onProgress?.(progress);
}

export function startMacro(
  progress: MacroProgress,
  onProgress?: ProgressCallback,
): void {
  if (progress.steps.length > 0) {
    progress.steps[0].status = 'running';
  }
  onProgress?.(progress);
}

export function buildMacroResult(progress: MacroProgress): MacroResult {
  const failed = progress.steps.filter(s => s.status === 'failed');
  const done = progress.steps.filter(s => s.status === 'done');
  const ok = failed.length === 0 && done.length > 0;

  let summary: string;
  if (ok) {
    summary = `${progress.name}: ${done.length}/${progress.totalSteps} steps completed successfully.`;
  } else {
    summary = `${progress.name}: ${failed.length} step(s) failed. ${done.length}/${progress.totalSteps} completed.`;
  }

  return { ok, name: progress.name, steps: progress.steps, summary };
}

// --- Macro: scaffold-and-critique ---

import { createRoom } from './commands/create-room.js';
import { createFaction } from './commands/create-faction.js';
import { createDistrict } from './commands/create-district.js';
import { createLocationPack } from './commands/create-location-pack.js';
import { createEncounterPack } from './commands/create-encounter-pack.js';
import { critiqueContent } from './commands/critique-content.js';
import { suggestNext } from './commands/suggest-next.js';

export type ScaffoldKind = 'room' | 'faction' | 'district' | 'location-pack' | 'encounter-pack';

export type ScaffoldAndCritiqueInput = {
  kind: ScaffoldKind;
  theme: string;
  sessionContext?: string;
  rulesetId?: string;
  districtId?: string;
  factions?: string[];
  difficulty?: string;
};

export async function scaffoldAndCritique(
  client: OllamaTextClient,
  input: ScaffoldAndCritiqueInput,
  onProgress?: ProgressCallback,
): Promise<MacroResult> {
  const progress = createMacroProgress('scaffold-and-critique', [
    `Generate ${input.kind}`,
    'Critique generated content',
    'Suggest next actions',
  ]);
  startMacro(progress, onProgress);

  // Step 1: Scaffold
  let yaml: string;
  try {
    const scaffoldResult = await runScaffold(client, input);
    if (!scaffoldResult.ok) {
      failStep(progress, scaffoldResult.error, onProgress);
      return buildMacroResult(progress);
    }
    yaml = scaffoldResult.yaml;
    advanceStep(progress, yaml, onProgress);
  } catch (e) {
    failStep(progress, String(e), onProgress);
    return buildMacroResult(progress);
  }

  // Step 2: Critique
  const critiqueResult = await critiqueContent(client, {
    content: yaml,
    contentType: input.kind,
    sessionContext: input.sessionContext,
  });
  if (!critiqueResult.ok) {
    failStep(progress, critiqueResult.error, onProgress);
    return buildMacroResult(progress);
  }
  const critiqueOutput = critiqueResult.text +
    (critiqueResult.issues.length > 0
      ? `\n\n${critiqueResult.issues.length} issue(s) found.`
      : '\nNo issues found.');
  advanceStep(progress, critiqueOutput, onProgress);

  // Step 3: Suggest next
  if (input.sessionContext) {
    const suggestResult = await suggestNext(client, {
      sessionState: input.sessionContext,
    });
    if (suggestResult.ok) {
      const suggestOutput = suggestResult.actions
        .map(a => `[${a.priority}] ${a.code}: ${a.command}`)
        .join('\n');
      advanceStep(progress, suggestOutput || 'No further recommendations.', onProgress);
    } else {
      // Suggest-next failure is not fatal
      advanceStep(progress, 'Suggestions unavailable.', onProgress);
    }
  } else {
    progress.steps[progress.currentStep].status = 'skipped';
    progress.steps[progress.currentStep].output = 'No session context — skipped.';
    progress.currentStep++;
    onProgress?.(progress);
  }

  return buildMacroResult(progress);
}

type ScaffoldOk = { ok: true; yaml: string };
type ScaffoldFail = { ok: false; error: string };

async function runScaffold(
  client: OllamaTextClient,
  input: ScaffoldAndCritiqueInput,
): Promise<ScaffoldOk | ScaffoldFail> {
  switch (input.kind) {
    case 'room': {
      const r = await createRoom(client, {
        theme: input.theme,
        rulesetId: input.rulesetId,
        districtId: input.districtId,
        sessionContext: input.sessionContext,
      });
      return r.ok ? { ok: true, yaml: r.yaml } : r;
    }
    case 'faction': {
      const r = await createFaction(client, {
        theme: input.theme,
        rulesetId: input.rulesetId,
        sessionContext: input.sessionContext,
      });
      return r.ok ? { ok: true, yaml: r.yaml } : r;
    }
    case 'district': {
      const r = await createDistrict(client, {
        theme: input.theme,
        rulesetId: input.rulesetId,
        factions: input.factions,
        sessionContext: input.sessionContext,
      });
      return r.ok ? { ok: true, yaml: r.yaml } : r;
    }
    case 'location-pack': {
      const r = await createLocationPack(client, {
        theme: input.theme,
        rulesetId: input.rulesetId,
        factions: input.factions,
        sessionContext: input.sessionContext,
      });
      return r.ok ? { ok: true, yaml: r.yaml } : r;
    }
    case 'encounter-pack': {
      const r = await createEncounterPack(client, {
        theme: input.theme,
        rulesetId: input.rulesetId,
        districtId: input.districtId,
        factions: input.factions,
        difficulty: input.difficulty,
        sessionContext: input.sessionContext,
      });
      return r.ok ? { ok: true, yaml: r.yaml } : r;
    }
  }
}

// --- Macro: compare-and-fix ---

import { compareReplays } from './commands/compare-replays.js';

export type CompareAndFixInput = {
  before: string;
  after: string;
  labelBefore?: string;
  labelAfter?: string;
  focus?: string;
  sessionContext?: string;
};

export async function compareAndFix(
  client: OllamaTextClient,
  input: CompareAndFixInput,
  onProgress?: ProgressCallback,
): Promise<MacroResult> {
  const progress = createMacroProgress('compare-and-fix', [
    'Compare replays',
    'Suggest fixes from findings',
  ]);
  startMacro(progress, onProgress);

  // Step 1: Compare
  const compareResult = await compareReplays(client, {
    before: input.before,
    after: input.after,
    labelBefore: input.labelBefore,
    labelAfter: input.labelAfter,
    focus: input.focus,
    sessionContext: input.sessionContext,
  });
  if (!compareResult.ok) {
    failStep(progress, compareResult.error, onProgress);
    return buildMacroResult(progress);
  }

  const compareOutput = [
    `Verdict: ${compareResult.verdict}`,
    `Improvements: ${compareResult.improvements.length}`,
    `Regressions: ${compareResult.regressions.length}`,
    `Unchanged: ${compareResult.unchanged.length}`,
    compareResult.summary,
  ].join('\n');
  advanceStep(progress, compareOutput, onProgress);

  // Step 2: Suggest fixes based on comparison context
  const comparisonContext = [
    input.sessionContext ?? '',
    '',
    'Recent comparison results:',
    `Verdict: ${compareResult.verdict}`,
    ...compareResult.regressions.map(r => `  Regression in ${r.area}: ${r.description}`),
    ...compareResult.improvements.map(r => `  Improvement in ${r.area}: ${r.description}`),
  ].join('\n');

  const suggestResult = await suggestNext(client, {
    sessionState: comparisonContext,
    recentActivity: `Compared replays (${input.labelBefore ?? 'before'} vs ${input.labelAfter ?? 'after'}): ${compareResult.verdict}`,
  });
  if (!suggestResult.ok) {
    failStep(progress, suggestResult.error, onProgress);
    return buildMacroResult(progress);
  }

  const suggestOutput = suggestResult.actions
    .map(a => `[${a.priority}] ${a.code}: ${a.command}`)
    .join('\n') || 'No specific fixes recommended.';
  advanceStep(progress, suggestOutput, onProgress);

  return buildMacroResult(progress);
}

// --- Macro: plan-and-generate ---

import { planDistrict } from './commands/plan-district.js';

export type PlanAndGenerateInput = {
  theme: string;
  existingFactions?: string;
  existingDistricts?: string;
  constraints?: string;
  sessionContext?: string;
  rulesetId?: string;
  /** How many plan steps to auto-execute (default: 1, max: 3) */
  autoExecute?: number;
};

export async function planAndGenerate(
  client: OllamaTextClient,
  input: PlanAndGenerateInput,
  onProgress?: ProgressCallback,
): Promise<MacroResult> {
  const maxAutoExec = Math.min(Math.max(input.autoExecute ?? 1, 0), 3);

  // Step 1 is always plan. Dynamic steps based on auto-execute count.
  const stepLabels = ['Generate design plan'];
  for (let i = 0; i < maxAutoExec; i++) {
    stepLabels.push(`Execute plan step ${i + 1}`);
  }
  stepLabels.push('Critique first artifact');

  const progress = createMacroProgress('plan-and-generate', stepLabels);
  startMacro(progress, onProgress);

  // Step 1: Plan
  const planResult = await planDistrict(client, {
    theme: input.theme,
    existingFactions: input.existingFactions,
    existingDistricts: input.existingDistricts,
    constraints: input.constraints,
    sessionContext: input.sessionContext,
  });
  if (!planResult.ok) {
    failStep(progress, planResult.error, onProgress);
    return buildMacroResult(progress);
  }

  const planOutput = planResult.steps
    .map(s => `${s.order}. ${s.command} → ${s.produces}`)
    .join('\n');
  advanceStep(progress, planOutput || 'Empty plan returned.', onProgress);

  // Steps 2..N: Auto-execute plan steps (scaffold only, no pipe commands)
  let lastYaml = '';
  const executableSteps = planResult.steps.slice(0, maxAutoExec);

  for (const step of executableSteps) {
    const scaffoldKind = parseScaffoldKind(step.command);
    if (!scaffoldKind) {
      // Can't auto-execute pipe commands or non-scaffold commands
      progress.steps[progress.currentStep].status = 'skipped';
      progress.steps[progress.currentStep].output = `Cannot auto-execute: ${step.command}`;
      progress.currentStep++;
      onProgress?.(progress);
      continue;
    }

    const scaffoldInput = parseScaffoldFlags(step.command, scaffoldKind, input);
    const scaffoldResult = await runScaffold(client, scaffoldInput);
    if (!scaffoldResult.ok) {
      failStep(progress, scaffoldResult.error, onProgress);
      return buildMacroResult(progress);
    }
    lastYaml = scaffoldResult.yaml;
    advanceStep(progress, scaffoldResult.yaml, onProgress);
  }

  // Final step: Critique the last generated artifact
  if (lastYaml) {
    const critiqueResult = await critiqueContent(client, {
      content: lastYaml,
      sessionContext: input.sessionContext,
    });
    if (critiqueResult.ok) {
      advanceStep(progress, critiqueResult.text, onProgress);
    } else {
      failStep(progress, critiqueResult.error, onProgress);
      return buildMacroResult(progress);
    }
  } else {
    progress.steps[progress.currentStep].status = 'skipped';
    progress.steps[progress.currentStep].output = 'No artifact to critique (nothing was generated).';
    progress.currentStep++;
    onProgress?.(progress);
  }

  return buildMacroResult(progress);
}

function parseScaffoldKind(command: string): ScaffoldKind | null {
  if (command.includes('create-room')) return 'room';
  if (command.includes('create-faction')) return 'faction';
  if (command.includes('create-district')) return 'district';
  if (command.includes('create-location-pack')) return 'location-pack';
  if (command.includes('create-encounter-pack')) return 'encounter-pack';
  return null;
}

function parseScaffoldFlags(
  command: string,
  kind: ScaffoldKind,
  defaults: PlanAndGenerateInput,
): ScaffoldAndCritiqueInput {
  // Extract --theme value from the command string if present
  const themeMatch = /--theme\s+"([^"]+)"/.exec(command) ?? /--theme\s+(\S+)/.exec(command);
  const theme = themeMatch?.[1] ?? defaults.theme;

  return {
    kind,
    theme,
    sessionContext: defaults.sessionContext,
    rulesetId: defaults.rulesetId,
  };
}
