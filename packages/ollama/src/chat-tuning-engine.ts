// Chat tuning engine — Guided Tuning (v1.7.0)
// Operational tuning: bundles, patches, previews, impact predictions.
// Builds on chat-balance-analyzer.ts analysis to produce actionable tuning workflows.
// No LLM calls — all tuning logic is deterministic.
// Nothing is auto-applied without explicit confirmation.

import type { DesignSession } from './session.js';
import type { ChatIntent } from './chat-types.js';
import type {
  BalanceFinding,
  BalanceAnalysis,
  SuggestedFix,
  ScenarioComparison,
  TuningPlan,
  TuningStep,
  TuningState,
  DesignIntent,
} from './chat-balance-analyzer.js';
import {
  suggestFixes,
  generateTuningPlan,
} from './chat-balance-analyzer.js';

// ============================================================
// Types
// ============================================================

/** A concrete config change with before/after values. */
export type ConfigPatch = {
  /** Target path (e.g. "district.market"). */
  path: string;
  /** Field name (e.g. "alertGain"). */
  field: string;
  /** Current assumed value. */
  oldValue: number;
  /** Proposed new value. */
  newValue: number;
  /** Optional unit (e.g. "per tick"). */
  unit?: string;
};

/** Heuristic prediction of how patches will affect replay metrics. */
export type ReplayImpactPrediction = {
  /** Predicted change in rumor reach. */
  rumorReach: string;
  /** Predicted change in escalation timing. */
  escalationTiming: string;
  /** Predicted change in encounter duration. */
  encounterDuration: string;
  /** Predicted change in hostility curve. */
  hostilityCurve: string;
  /** Overall direction of predicted change. */
  overallDirection: 'improvement' | 'regression' | 'mixed' | 'uncertain';
  /** Confidence in prediction (0–1). */
  confidence: number;
  /** Human-readable explanation. */
  explanation: string;
};

/** A systemic fix bundle grouping related findings, fixes, and patches. */
export type TuningBundle = {
  /** Machine-readable code (e.g. "rumor_flow_fix"). */
  code: string;
  /** Human-readable name. */
  name: string;
  /** Description of what this bundle addresses. */
  description: string;
  /** Finding codes addressed by this bundle. */
  findingCodes: string[];
  /** Fix codes in this bundle. */
  fixCodes: string[];
  /** Concrete config patches. */
  patches: ConfigPatch[];
  /** Predicted impact of applying this bundle. */
  impact: ReplayImpactPrediction;
};

/** Full preview of all proposed changes before applying. */
export type PatchPreview = {
  /** The tuning goal. */
  goal: string;
  /** All patches across all bundles. */
  patches: ConfigPatch[];
  /** Grouped fix bundles. */
  bundles: TuningBundle[];
  /** Aggregate predicted impact. */
  impact: ReplayImpactPrediction;
  /** Commands that would be executed. */
  commands: string[];
  /** Advisory warnings. */
  warnings: string[];
};

/** Section of a design-impact comparison. */
export type DesignImpactSection = {
  category: 'improved' | 'unchanged' | 'regression';
  items: string[];
};

/** Enhanced comparison emphasizing design-level impact. */
export type DesignImpactComparison = {
  sections: DesignImpactSection[];
  summary: string;
  verdict: 'improved' | 'regressed' | 'mixed' | 'unchanged';
};

// ============================================================
// Config patch generation
// ============================================================

type PatchTemplate = {
  field: string;
  delta: number;
  defaultOld: number;
  unit?: string;
  impactArea: string;
};

const PATCH_TEMPLATES: Record<string, PatchTemplate> = {
  increase_alert_sensitivity: {
    field: 'alertGain',
    delta: 0.15,
    defaultOld: 0.25,
    unit: 'per tick',
    impactArea: 'escalation',
  },
  reduce_alert_gain: {
    field: 'alertGain',
    delta: -0.10,
    defaultOld: 0.40,
    unit: 'per tick',
    impactArea: 'escalation',
  },
  add_rumor_path: {
    field: 'rumorClarity',
    delta: 0.15,
    defaultOld: 0.55,
    impactArea: 'rumor',
  },
  increase_hostility_decay: {
    field: 'hostilityDecay',
    delta: 0.10,
    defaultOld: 0.05,
    unit: 'per tick',
    impactArea: 'hostility',
  },
  connect_stability_events: {
    field: 'stabilityReactivity',
    delta: 0.20,
    defaultOld: 0.10,
    impactArea: 'stability',
  },
  lower_escalation_threshold: {
    field: 'escalationThreshold',
    delta: -0.15,
    defaultOld: 0.70,
    impactArea: 'encounter',
  },
  review_escalation_mechanics: {
    field: 'escalationGain',
    delta: 0.10,
    defaultOld: 0.15,
    unit: 'per event',
    impactArea: 'escalation',
  },
};

/** Turn a SuggestedFix into concrete config patches. */
export function generateConfigPatches(fix: SuggestedFix): ConfigPatch[] {
  const template = PATCH_TEMPLATES[fix.code];
  if (!template) return [];

  // Extract path from fix target (e.g. "district.escalation.alertPressure" → "district.escalation")
  const parts = fix.target.split('.');
  const path = parts.length > 1 ? parts.slice(0, -1).join('.') : fix.target;

  return [{
    path,
    field: template.field,
    oldValue: template.defaultOld,
    newValue: round2(template.defaultOld + template.delta),
    unit: template.unit,
  }];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================
// Impact prediction
// ============================================================

type ImpactRule = {
  rumorReach?: string;
  escalationTiming?: string;
  encounterDuration?: string;
  hostilityCurve?: string;
};

const IMPACT_RULES: Record<string, (delta: number) => ImpactRule> = {
  increase_alert_sensitivity: (d) => ({
    escalationTiming: `~${Math.round(Math.abs(d) * 30)} ticks earlier`,
    hostilityCurve: 'may rise during escalation phases',
  }),
  reduce_alert_gain: (d) => ({
    escalationTiming: `~${Math.round(Math.abs(d) * 30)} ticks later`,
    hostilityCurve: 'slightly reduced during escalation',
  }),
  add_rumor_path: () => ({
    rumorReach: '+1 faction (estimated)',
  }),
  increase_hostility_decay: (d) => ({
    hostilityCurve: `peak reduced by ~${Math.round(Math.abs(d) * 100)}%`,
    escalationTiming: 'may shift slightly',
  }),
  connect_stability_events: () => ({
    encounterDuration: 'may increase as stability events trigger',
  }),
  lower_escalation_threshold: () => ({
    encounterDuration: 'encounters escalate more readily',
    escalationTiming: 'encounter escalation phases start sooner',
  }),
  review_escalation_mechanics: (d) => ({
    escalationTiming: `~${Math.round(Math.abs(d) * 20)} ticks earlier`,
    hostilityCurve: 'escalation behavior more pronounced',
  }),
};

/** Predict likely replay impact from a set of patches. */
export function predictImpact(patches: ConfigPatch[], fixCodes?: string[]): ReplayImpactPrediction {
  const merged: ImpactRule = {};
  const codes = fixCodes ?? [];

  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];
    const delta = patch.newValue - patch.oldValue;
    const code = codes[i];
    if (code) {
      const rule = IMPACT_RULES[code];
      if (rule) {
        const r = rule(delta);
        // Merge — later values overwrite if same key
        if (r.rumorReach) merged.rumorReach = r.rumorReach;
        if (r.escalationTiming) merged.escalationTiming = r.escalationTiming;
        if (r.encounterDuration) merged.encounterDuration = r.encounterDuration;
        if (r.hostilityCurve) merged.hostilityCurve = r.hostilityCurve;
      }
    }
  }

  let overallDirection: ReplayImpactPrediction['overallDirection'] = 'uncertain';
  const changedFields = Object.values(merged).filter(Boolean).length;
  if (changedFields >= 2) overallDirection = 'improvement';
  else if (changedFields === 1) overallDirection = 'improvement';
  else if (patches.length > 0) overallDirection = 'uncertain';

  const confidence = patches.length > 0 ? Math.min(0.85, 0.50 + patches.length * 0.10) : 0;

  return {
    rumorReach: merged.rumorReach ?? 'unchanged',
    escalationTiming: merged.escalationTiming ?? 'unchanged',
    encounterDuration: merged.encounterDuration ?? 'unchanged',
    hostilityCurve: merged.hostilityCurve ?? 'unchanged',
    overallDirection,
    confidence,
    explanation: patches.length === 0
      ? 'No patches to predict impact for.'
      : `${patches.length} patch(es) proposed. Predicted direction: ${overallDirection}.`,
  };
}

// ============================================================
// Fix bundling
// ============================================================

type BundleTemplate = {
  code: string;
  name: string;
  description: string;
  findingCategories: string[];
};

const BUNDLE_TEMPLATES: BundleTemplate[] = [
  {
    code: 'escalation_tuning',
    name: 'Escalation Tuning',
    description: 'Adjust escalation mechanics for better pacing and difficulty progression.',
    findingCategories: ['escalation', 'difficulty'],
  },
  {
    code: 'rumor_flow_fix',
    name: 'Rumor Flow Fix',
    description: 'Improve rumor propagation paths between factions.',
    findingCategories: ['rumor_flow'],
  },
  {
    code: 'faction_dynamics_fix',
    name: 'Faction Dynamics Fix',
    description: 'Rebalance faction hostility gain and decay mechanics.',
    findingCategories: ['faction_dynamics'],
  },
  {
    code: 'district_stability_fix',
    name: 'District Stability Fix',
    description: 'Connect district stability to meaningful game events.',
    findingCategories: ['district_stability'],
  },
  {
    code: 'encounter_design_fix',
    name: 'Encounter Design Fix',
    description: 'Adjust encounter escalation thresholds and pacing.',
    findingCategories: ['encounter_design'],
  },
];

/** Group related findings + fixes into systemic fix bundles. */
export function bundleFindings(
  findings: BalanceFinding[],
  fixes: SuggestedFix[],
): TuningBundle[] {
  const bundles: TuningBundle[] = [];

  for (const template of BUNDLE_TEMPLATES) {
    const matchingFindings = findings.filter(f =>
      template.findingCategories.includes(f.category)
    );
    if (matchingFindings.length === 0) continue;

    const findingCodes = matchingFindings.map(f => f.code);
    const matchingFixes = fixes.filter(f => findingCodes.includes(f.findingCode));
    if (matchingFixes.length === 0) continue;

    const patches: ConfigPatch[] = [];
    for (const fix of matchingFixes) {
      patches.push(...generateConfigPatches(fix));
    }

    const fixCodes = matchingFixes.map(f => f.code);
    const impact = predictImpact(patches, fixCodes);

    bundles.push({
      code: template.code,
      name: template.name,
      description: template.description,
      findingCodes,
      fixCodes,
      patches,
      impact,
    });
  }

  return bundles;
}

// ============================================================
// Patch preview
// ============================================================

/** Build a full preview of all proposed config changes. */
export function buildPatchPreview(
  goal: string,
  findings: BalanceFinding[],
  fixes: SuggestedFix[],
  session: DesignSession | null,
): PatchPreview {
  const bundles = bundleFindings(findings, fixes);
  const allPatches = bundles.flatMap(b => b.patches);
  const allFixCodes = bundles.flatMap(b => b.fixCodes);
  const impact = predictImpact(allPatches, allFixCodes);
  const commands = allPatches.map(p => `adjust ${p.path}.${p.field} ${p.oldValue} → ${p.newValue}`);
  const warnings: string[] = [];

  if (bundles.length === 0) {
    warnings.push('No fix bundles generated. Run analyze-balance first to identify issues.');
  }
  if (!session) {
    warnings.push('No active session. Results may be limited.');
  }
  if (allPatches.length === 0) {
    warnings.push('No concrete patches found. Findings may need manual review.');
  }

  return { goal, patches: allPatches, bundles, impact, commands, warnings };
}

// ============================================================
// Operational plan generation
// ============================================================

/** Generate an operational tuning plan grounded in analysis findings.
 *  Falls back to content-creation plan when no analysis is available. */
export function generateOperationalPlan(
  goal: string,
  session: DesignSession | null,
  analysis: BalanceAnalysis | null,
): TuningPlan {
  // No analysis or no findings → fall back to content-creation style plan
  if (!analysis || analysis.findings.length === 0) {
    return generateTuningPlan(goal, session);
  }

  const fixes = suggestFixes(analysis.findings);
  const bundles = bundleFindings(analysis.findings, fixes);
  const warnings: string[] = [];
  const steps: TuningStep[] = [];
  let id = 1;

  if (!session) {
    warnings.push('No active session. Start one with `ai session start <name>` for best results.');
  }

  if (bundles.length === 0) {
    warnings.push('Analysis found issues but no concrete patches could be generated. Falling back to guided tuning.');
    return generateTuningPlan(goal, session);
  }

  // Step 1: Preview all patches
  const allPatches = bundles.flatMap(b => b.patches);
  steps.push({
    id: id++,
    description: 'preview-patches — review proposed config changes',
    command: 'preview-patches',
    intent: 'tune_preview' as ChatIntent,
    params: {
      patchCount: String(allPatches.length),
      bundleCount: String(bundles.length),
    },
    dependencies: [],
    expectedEffect: `Preview ${allPatches.length} config change(s) across ${bundles.length} bundle(s).`,
    status: 'pending',
  });

  // Steps 2–N+1: One apply step per bundle
  for (const bundle of bundles) {
    const prevId = steps[steps.length - 1].id;
    steps.push({
      id: id++,
      description: `apply-patch — ${bundle.name}`,
      command: 'apply-patch',
      intent: 'tune_apply' as ChatIntent,
      params: {
        bundleCode: bundle.code,
        bundleName: bundle.name,
        patches: JSON.stringify(bundle.patches),
        impact: JSON.stringify(bundle.impact),
      },
      dependencies: [prevId],
      expectedEffect: bundle.impact.explanation,
      status: 'pending',
    });
  }

  // Final step: Verify with replay comparison
  steps.push({
    id: id++,
    description: 'verify — re-simulate and compare against baseline',
    command: 'compare-scenarios',
    intent: 'compare_scenarios' as ChatIntent,
    params: { note: 'Run a new simulation and compare against the pre-tuning baseline.' },
    dependencies: [steps[steps.length - 1].id],
    expectedEffect: 'Verify that tuning achieved the intended goal.',
    status: 'pending',
  });

  return { goal, steps, warnings };
}

// ============================================================
// Design impact comparison
// ============================================================

/** Build a design-impact comparison from a ScenarioComparison.
 *  Groups changes into Improved / Unchanged / Regression sections. */
export function buildDesignImpact(
  comparison: ScenarioComparison,
  intent?: DesignIntent,
): DesignImpactComparison {
  const improved: string[] = [];
  const unchanged: string[] = [];
  const regression: string[] = [];

  for (const change of comparison.changes) {
    const line = `${change.dimension}: ${change.description}`;
    if (change.direction === 'improved') improved.push(line);
    else if (change.direction === 'regressed') regression.push(line);
    else unchanged.push(line);
  }

  // Dimensions that didn't appear in changes are unchanged
  const changedDimensions = new Set(comparison.changes.map(c => c.dimension));
  const allDimensions = [
    'escalation pacing', 'rumor spread', 'encounter duration',
    'faction hostility peak', 'escalation phases', 'district stability variance',
  ];
  for (const dim of allDimensions) {
    if (!changedDimensions.has(dim)) {
      unchanged.push(`${dim}: no measurable change`);
    }
  }

  const sections: DesignImpactSection[] = [];
  if (improved.length > 0) sections.push({ category: 'improved', items: improved });
  if (unchanged.length > 0) sections.push({ category: 'unchanged', items: unchanged });
  if (regression.length > 0) sections.push({ category: 'regression', items: regression });

  const summaryParts: string[] = [];
  summaryParts.push(`${improved.length} improvement(s), ${unchanged.length} unchanged, ${regression.length} regression(s).`);
  if (intent?.targetMood) {
    summaryParts.push(`Evaluated against target mood: "${intent.targetMood}".`);
  }
  summaryParts.push(`Verdict: ${comparison.verdict}.`);

  return {
    sections,
    summary: summaryParts.join(' '),
    verdict: comparison.verdict,
  };
}

// ============================================================
// Step preview
// ============================================================

/** Preview a specific tuning step's patches and predicted impact. */
export function previewTuningStep(
  state: TuningState,
  stepId: number,
): PatchPreview | null {
  const step = state.plan.steps.find(s => s.id === stepId);
  if (!step) return null;

  let patches: ConfigPatch[] = [];
  if (step.params.patches) {
    try {
      patches = JSON.parse(step.params.patches);
    } catch { /* ignore */ }
  }

  let impact: ReplayImpactPrediction;
  if (step.params.impact) {
    try {
      impact = JSON.parse(step.params.impact);
    } catch {
      impact = predictImpact(patches);
    }
  } else {
    impact = predictImpact(patches);
  }

  return {
    goal: state.plan.goal,
    patches,
    bundles: [],
    impact,
    commands: patches.map(p => `adjust ${p.path}.${p.field} ${p.oldValue} → ${p.newValue}`),
    warnings: patches.length === 0 ? ['This step has no config patches.'] : [],
  };
}

// ============================================================
// YAML generation
// ============================================================

/** Generate YAML config content from a bundle's patches. */
export function generatePatchYaml(bundle: TuningBundle, goal: string): string {
  const lines: string[] = [];
  lines.push(`# Tuning patch: ${bundle.name}`);
  lines.push(`# Goal: ${goal}`);
  lines.push(`# Addresses: ${bundle.findingCodes.join(', ')}`);
  lines.push(`# Confidence: ${Math.round(bundle.impact.confidence * 100)}%`);
  lines.push(`# Direction: ${bundle.impact.overallDirection}`);
  lines.push('');

  // Group patches by path
  const byPath = new Map<string, ConfigPatch[]>();
  for (const patch of bundle.patches) {
    const existing = byPath.get(patch.path) ?? [];
    existing.push(patch);
    byPath.set(patch.path, existing);
  }

  for (const [path, pathPatches] of byPath) {
    lines.push(`${path}:`);
    for (const patch of pathPatches) {
      const unit = patch.unit ? ` ${patch.unit}` : '';
      lines.push(`  ${patch.field}: ${patch.newValue}  # was: ${patch.oldValue}${unit}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================
// Formatting
// ============================================================

/** Format a single config patch as text. */
export function formatConfigPatch(patch: ConfigPatch): string {
  const unit = patch.unit ? ` ${patch.unit}` : '';
  return `  ${patch.path}:\n    ${patch.field}: ${patch.oldValue}${unit} → ${patch.newValue}${unit}`;
}

/** Format a full patch preview. */
export function formatPatchPreview(preview: PatchPreview): string {
  const lines: string[] = [];
  lines.push(`Patch Preview: ${preview.goal}`);
  lines.push('');

  if (preview.patches.length === 0) {
    lines.push('No patches to preview.');
    for (const w of preview.warnings) lines.push(`⚠ ${w}`);
    return lines.join('\n');
  }

  lines.push('Proposed Changes:');
  lines.push('');
  for (const patch of preview.patches) {
    lines.push(formatConfigPatch(patch));
    lines.push('');
  }

  if (preview.bundles.length > 0) {
    lines.push(`Organized into ${preview.bundles.length} fix bundle(s):`);
    for (const bundle of preview.bundles) {
      lines.push(`  • ${bundle.name} (${bundle.patches.length} patch(es))`);
    }
    lines.push('');
  }

  lines.push('Expected Impact:');
  lines.push(formatReplayImpact(preview.impact));
  lines.push('');

  if (preview.warnings.length > 0) {
    for (const w of preview.warnings) lines.push(`⚠ ${w}`);
    lines.push('');
  }

  lines.push('Nothing changes until you confirm. Use /tune-apply to apply patches.');

  return lines.join('\n');
}

/** Format tuning bundles. */
export function formatTuningBundles(bundles: TuningBundle[]): string {
  if (bundles.length === 0) return 'No fix bundles. Run analyze-balance first to identify issues.';

  const lines: string[] = [];
  lines.push('Fix Bundles');
  lines.push('');

  for (const bundle of bundles) {
    lines.push(`${bundle.name} [${bundle.code}]`);
    lines.push(`  ${bundle.description}`);
    lines.push(`  Addresses: ${bundle.findingCodes.join(', ')}`);
    lines.push(`  Fixes: ${bundle.fixCodes.join(', ')}`);
    lines.push(`  Patches: ${bundle.patches.length}`);
    lines.push(`  Direction: ${bundle.impact.overallDirection} (${Math.round(bundle.impact.confidence * 100)}% confidence)`);
    lines.push('');
  }

  lines.push(`Total: ${bundles.length} bundle(s), ${bundles.reduce((sum, b) => sum + b.patches.length, 0)} patch(es)`);

  return lines.join('\n');
}

/** Format a replay impact prediction. */
export function formatReplayImpact(prediction: ReplayImpactPrediction): string {
  const lines: string[] = [];
  lines.push(`  rumor reach: ${prediction.rumorReach}`);
  lines.push(`  escalation timing: ${prediction.escalationTiming}`);
  lines.push(`  encounter duration: ${prediction.encounterDuration}`);
  lines.push(`  hostility curve: ${prediction.hostilityCurve}`);
  lines.push(`  overall: ${prediction.overallDirection} (${Math.round(prediction.confidence * 100)}% confidence)`);
  return lines.join('\n');
}

/** Format a design-impact comparison (Improved / Unchanged / Regression). */
export function formatDesignImpact(dic: DesignImpactComparison): string {
  const lines: string[] = [];
  lines.push('Design Impact');
  lines.push('');

  for (const section of dic.sections) {
    const header = section.category === 'improved' ? 'Improved'
      : section.category === 'regression' ? 'Regression'
      : 'Unchanged';
    lines.push(`${header}:`);
    for (const item of section.items) {
      const icon = section.category === 'improved' ? '+' : section.category === 'regression' ? '-' : '=';
      lines.push(`  ${icon} ${item}`);
    }
    lines.push('');
  }

  lines.push(dic.summary);
  lines.push(`Verdict: ${dic.verdict}`);

  return lines.join('\n');
}
