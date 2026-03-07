// Chat tool registry — maps intents to engine commands.
// Each tool wraps an existing command with chat-friendly input/output.
// Tools declare whether they mutate (require confirmation).

import type { ChatTool, ChatToolParams, ChatToolResult, PlannedAction } from './chat-types.js';
import { suggestNext } from './commands/suggest-next.js';
import { critiqueContent } from './commands/critique-content.js';
import { improveContent } from './commands/improve-content.js';
import { compareReplays } from './commands/compare-replays.js';
import { analyzeReplay } from './commands/analyze-replay.js';
import { planDistrict } from './commands/plan-district.js';
import { explainWhy } from './commands/explain-why.js';
import { createRoom } from './commands/create-room.js';
import { createFaction } from './commands/create-faction.js';
import { createDistrict } from './commands/create-district.js';
import { createQuest } from './commands/create-quest.js';
import { createLocationPack } from './commands/create-location-pack.js';
import { createEncounterPack } from './commands/create-encounter-pack.js';
import { formatSessionStatus, renderSessionContext } from './session.js';
import { generatePreview } from './apply-preview.js';
import { planFromSession, formatPlan } from './chat-planner.js';
import { generateRecommendations, formatRecommendations } from './chat-recommendations.js';
import { generateBuildPlan, formatBuildPlan } from './chat-build-planner.js';
import {
  analyzeBalance, formatBalanceAnalysis,
  parseDesignIntent, compareIntent, formatIntentComparison,
  analyzeWindow, formatWindowAnalysis,
  suggestFixes, formatSuggestedFixes,
  compareScenarios, formatScenarioComparison,
  generateTuningPlan, formatTuningPlan,
} from './chat-balance-analyzer.js';

// --- Helper ---

function action(command: string, description: string, mutates: boolean): PlannedAction {
  return { command, description, requiresConfirmation: mutates, status: 'pending' };
}

function executed(a: PlannedAction, result?: string): PlannedAction {
  return { ...a, status: 'executed', result };
}

function failed(a: PlannedAction, result: string): PlannedAction {
  return { ...a, status: 'failed', result };
}

// --- Tool: suggest-next ---

const suggestNextTool: ChatTool = {
  name: 'suggest-next',
  description: 'Analyze session state and recommend next design actions',
  intents: ['suggest_next'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    if (!p.session) {
      return {
        ok: false,
        summary: 'No active session. Start one with `ai session start <name>` first.',
        actions: [],
      };
    }
    const a = action('suggest-next', 'Analyze session and recommend next actions', false);
    const result = await suggestNext(p.client, {
      sessionState: p.sessionContext ?? renderSessionContext(p.session),
      recentActivity: p.params.recentActivity,
    });
    if (!result.ok) {
      return { ok: false, summary: result.error, actions: [failed(a, result.error)] };
    }
    const lines = [result.text];
    if (result.actions.length > 0) {
      lines.push('', 'Recommended actions:');
      for (const act of result.actions) {
        lines.push(`  [${act.priority}] ${act.code}: ${act.command}`);
        if (act.reason) lines.push(`    ${act.reason}`);
      }
    }
    if (result.summary) lines.push('', result.summary);
    return {
      ok: true,
      summary: lines.join('\n'),
      actions: [executed(a)],
      sessionEvents: [{ kind: 'suggestion_generated', detail: 'Chat: suggest-next' }],
    };
  },
};

// --- Tool: session-info ---

const sessionInfoTool: ChatTool = {
  name: 'session-info',
  description: 'Show current session status, artifacts, issues, and history',
  intents: ['session_info'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    if (!p.session) {
      return { ok: true, summary: 'No active session. Start one with `ai session start <name>`.', actions: [] };
    }
    return {
      ok: true,
      summary: formatSessionStatus(p.session),
      actions: [executed(action('session status', 'Show session state', false))],
    };
  },
};

// --- Tool: scaffold ---

const SCAFFOLD_KINDS = ['room', 'faction', 'district', 'quest', 'location-pack', 'encounter-pack'] as const;

const scaffoldTool: ChatTool = {
  name: 'scaffold',
  description: 'Generate new content (room, faction, district, quest, pack)',
  intents: ['scaffold'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    const kind = p.params.kind ?? 'room';
    const theme = p.params.theme ?? p.userMessage;
    if (!theme) {
      return { ok: false, summary: 'I need a theme or description to generate content. What should it be about?', actions: [] };
    }

    const cmdName = `create-${kind}`;
    const a = action(cmdName, `Generate a ${kind} with theme "${theme}"`, false);

    let yaml: string;
    let idMatch: RegExpMatchArray | null = null;

    switch (kind) {
      case 'room': {
        const r = await createRoom(p.client, { theme, sessionContext: p.sessionContext });
        if (!r.ok) return { ok: false, summary: r.error, actions: [failed(a, r.error)] };
        yaml = r.yaml;
        break;
      }
      case 'faction': {
        const r = await createFaction(p.client, { theme, sessionContext: p.sessionContext });
        if (!r.ok) return { ok: false, summary: r.error, actions: [failed(a, r.error)] };
        yaml = r.yaml;
        break;
      }
      case 'district': {
        const r = await createDistrict(p.client, { theme, sessionContext: p.sessionContext });
        if (!r.ok) return { ok: false, summary: r.error, actions: [failed(a, r.error)] };
        yaml = r.yaml;
        break;
      }
      case 'quest': {
        const r = await createQuest(p.client, { theme, sessionContext: p.sessionContext });
        if (!r.ok) return { ok: false, summary: r.error, actions: [failed(a, r.error)] };
        yaml = r.yaml;
        break;
      }
      case 'location-pack': {
        const r = await createLocationPack(p.client, { theme, sessionContext: p.sessionContext });
        if (!r.ok) return { ok: false, summary: r.error, actions: [failed(a, r.error)] };
        yaml = r.yaml;
        break;
      }
      case 'encounter-pack': {
        const r = await createEncounterPack(p.client, { theme, sessionContext: p.sessionContext });
        if (!r.ok) return { ok: false, summary: r.error, actions: [failed(a, r.error)] };
        yaml = r.yaml;
        break;
      }
      default:
        return { ok: false, summary: `Unknown kind "${kind}". Use: ${SCAFFOLD_KINDS.join(', ')}`, actions: [] };
    }

    idMatch = yaml.match(/^id:\s*(\S+)/m);
    const artifactId = idMatch?.[1] ?? kind;
    const artifactKind = kind === 'quest' ? 'quests'
      : kind === 'room' ? 'rooms'
      : kind === 'faction' ? 'factions'
      : kind === 'district' ? 'districts'
      : 'packs';

    return {
      ok: true,
      summary: `Generated ${kind}: ${artifactId}\n\nYou can save this with: "write this to <filename>.yaml"`,
      output: yaml,
      actions: [executed(a, `Generated ${kind}: ${artifactId}`)],
      sessionEvents: [{ kind: 'artifact_created', detail: `${artifactKind}/${artifactId}` }],
      pendingWrite: {
        content: yaml,
        suggestedPath: `${artifactId}.yaml`,
        label: `${kind}: ${artifactId}`,
      },
    };
  },
};

// --- Tool: critique ---

const critiqueTool: ChatTool = {
  name: 'critique',
  description: 'Review content with senior designer critique',
  intents: ['critique'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    const content = p.params.content;
    if (!content) {
      return { ok: false, summary: 'I need content to critique. Pipe YAML or reference an artifact.', actions: [] };
    }
    const a = action('critique-content', 'Review content for design issues', false);
    const result = await critiqueContent(p.client, {
      content,
      contentType: p.params.contentType,
      sessionContext: p.sessionContext,
    });
    if (!result.ok) return { ok: false, summary: result.error, actions: [failed(a, result.error)] };

    const lines = [result.text];
    if (result.issues.length > 0) {
      lines.push('', `${result.issues.length} issue(s) found:`);
      for (const issue of result.issues) {
        lines.push(`  [${issue.severity}] ${issue.code}: ${issue.summary}`);
      }
    }
    if (result.summary) lines.push('', result.summary);

    return {
      ok: true,
      summary: lines.join('\n'),
      actions: [executed(a)],
      sessionEvents: result.issues.length > 0
        ? [{ kind: 'issue_opened', detail: `Chat critique: ${result.issues.length} issue(s)` }]
        : undefined,
    };
  },
};

// --- Tool: improve ---

const improveTool: ChatTool = {
  name: 'improve',
  description: 'Revise content toward a specific goal',
  intents: ['improve'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    const content = p.params.content;
    const goal = p.params.goal ?? p.userMessage;
    if (!content) {
      return { ok: false, summary: 'I need content to improve. Pipe YAML or reference an artifact.', actions: [] };
    }
    const a = action('improve-content', `Improve content: "${goal}"`, false);
    const result = await improveContent(p.client, {
      content,
      goal,
      sessionContext: p.sessionContext,
    });
    if (!result.ok) return { ok: false, summary: result.error, actions: [failed(a, result.error)] };

    return {
      ok: true,
      summary: `Improved content toward: "${goal}"`,
      output: result.yaml,
      actions: [executed(a)],
      pendingWrite: {
        content: result.yaml,
        suggestedPath: 'improved.yaml',
        label: `Improved: ${goal}`,
      },
    };
  },
};

// --- Tool: compare-replays ---

const compareReplaysTool: ChatTool = {
  name: 'compare-replays',
  description: 'Compare before/after simulation replays',
  intents: ['compare_replays'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    const { before, after } = p.params;
    if (!before || !after) {
      return { ok: false, summary: 'I need before and after replay data to compare. Provide them as JSON.', actions: [] };
    }
    const a = action('compare-replays', 'Compare two simulation replays', false);
    const result = await compareReplays(p.client, {
      before, after, sessionContext: p.sessionContext,
    });
    if (!result.ok) return { ok: false, summary: result.error, actions: [failed(a, result.error)] };

    const lines = [result.text, '', `Verdict: ${result.verdict}`];
    if (result.improvements.length) {
      lines.push(`${result.improvements.length} improvement(s):`);
      for (const c of result.improvements) lines.push(`  + ${c.area}: ${c.description}`);
    }
    if (result.regressions.length) {
      lines.push(`${result.regressions.length} regression(s):`);
      for (const c of result.regressions) lines.push(`  - ${c.area}: ${c.description}`);
    }
    if (result.summary) lines.push('', result.summary);

    return {
      ok: true,
      summary: lines.join('\n'),
      actions: [executed(a)],
      sessionEvents: [{ kind: 'replay_compared', detail: `Chat: ${result.verdict}` }],
    };
  },
};

// --- Tool: analyze-replay ---

const analyzeReplayTool: ChatTool = {
  name: 'analyze-replay',
  description: 'Analyze simulation replay for design insights',
  intents: ['analyze_replay'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    const replay = p.params.replay;
    if (!replay) {
      return { ok: false, summary: 'I need replay data to analyze. Pipe JSON or reference a file.', actions: [] };
    }
    const a = action('analyze-replay', 'Analyze replay output', false);
    const result = await analyzeReplay(p.client, {
      replay, focus: p.params.focus, sessionContext: p.sessionContext,
    });
    if (!result.ok) return { ok: false, summary: result.error, actions: [failed(a, result.error)] };

    const lines = [result.text];
    if (result.issues.length) {
      lines.push('', `${result.issues.length} issue(s):`);
      for (const i of result.issues) lines.push(`  [${i.severity}] ${i.code}: ${i.summary}`);
    }
    if (result.summary) lines.push('', result.summary);

    return {
      ok: true,
      summary: lines.join('\n'),
      actions: [executed(a)],
    };
  },
};

// --- Tool: plan ---

const planTool: ChatTool = {
  name: 'plan-district',
  description: 'Create a multi-step design plan for a district',
  intents: ['plan'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    const theme = p.params.theme ?? p.userMessage;
    if (!theme) {
      return { ok: false, summary: 'I need a theme to plan around. What kind of district?', actions: [] };
    }
    const a = action('plan-district', `Plan district: "${theme}"`, false);
    const result = await planDistrict(p.client, {
      theme, sessionContext: p.sessionContext,
    });
    if (!result.ok) return { ok: false, summary: result.error, actions: [failed(a, result.error)] };

    const lines = [result.text];
    if (result.steps.length) {
      lines.push('', `${result.steps.length}-step plan:`);
      for (const s of result.steps) {
        const deps = s.dependsOn.length ? ` (after ${s.dependsOn.join(', ')})` : '';
        lines.push(`  ${s.order}. ${s.command}${deps}`);
        if (s.description) lines.push(`     ${s.description}`);
      }
    }
    if (result.rationale) lines.push('', `Rationale: ${result.rationale}`);
    lines.push('', 'Say "execute this plan" or run individual steps.');

    return {
      ok: true,
      summary: lines.join('\n'),
      actions: [executed(a)],
      sessionEvents: [{ kind: 'plan_generated', detail: `Chat: plan "${theme}"` }],
    };
  },
};

// --- Tool: explain-why ---

const explainWhyTool: ChatTool = {
  name: 'explain-why',
  description: 'Explain causal reasons for simulation behavior',
  intents: ['explain_why'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    const question = p.params.question ?? p.userMessage;
    const state = p.params.state;
    if (!state) {
      return {
        ok: false,
        summary: 'I need simulation state data to explain causality. Pipe the relevant JSON.',
        actions: [],
      };
    }
    const a = action('explain-why', `Explain: "${question}"`, false);
    const result = await explainWhy(p.client, {
      question, state, sessionContext: p.sessionContext,
    });
    if (!result.ok) return { ok: false, summary: result.error, actions: [failed(a, result.error)] };
    return { ok: true, summary: result.text, actions: [executed(a)] };
  },
};

// --- Tool: explain-state ---

const explainStateTool: ChatTool = {
  name: 'explain-state',
  description: 'Explain the current state of artifacts or simulation',
  intents: ['explain_state'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    // If we have session context, use suggest-next as the best "state explainer"
    if (!p.session) {
      return { ok: false, summary: 'No active session to explain.', actions: [] };
    }
    const a = action('suggest-next', 'Analyze session state', false);
    const result = await suggestNext(p.client, {
      sessionState: p.sessionContext ?? renderSessionContext(p.session),
      recentActivity: `User asked: ${p.userMessage}`,
    });
    if (!result.ok) return { ok: false, summary: result.error, actions: [failed(a, result.error)] };
    return { ok: true, summary: result.text, actions: [executed(a)] };
  },
};

// --- Tool: apply-content ---

const applyContentTool: ChatTool = {
  name: 'apply-content',
  description: 'Preview and write content to disk (requires confirmation)',
  intents: ['apply_content'],
  mutates: true,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    const content = p.params.content;
    const targetPath = p.params.targetPath;
    if (!content) {
      return { ok: false, summary: 'No content to write. Generate something first.', actions: [] };
    }
    if (!targetPath) {
      return { ok: false, summary: 'Where should I write it? Specify a file path.', actions: [] };
    }

    const a = action('apply-preview', `Preview write to ${targetPath}`, true);
    const preview = await generatePreview({ content, targetPath });
    return {
      ok: true,
      summary: preview.preview,
      actions: [executed(a, 'Preview generated')],
      pendingWrite: {
        content,
        suggestedPath: targetPath,
        label: p.params.label ?? targetPath,
      },
    };
  },
};

// --- Tool: help ---

const helpTool: ChatTool = {
  name: 'help',
  description: 'Show what chat can do',
  intents: ['help'],
  mutates: false,
  async execute(): Promise<ChatToolResult> {
    const help = [
      'I can help you design game worlds. Here\'s what I can do:',
      '',
      'Design:',
      '  "Generate a room about a haunted library"',
      '  "Create a faction of paranoid librarians"',
      '  "Plan a new district around smuggling"',
      '',
      'Iterate:',
      '  "Critique this content" (with YAML)',
      '  "Improve this quest — make it harder"',
      '',
      'Analyze:',
      '  "What should I do next?"',
      '  "Why did the guards never escalate?"',
      '  "Compare these two replays"',
      '  "Analyze this replay"',
      '',
      'Session:',
      '  "What\'s in my session?"',
      '  "Show me open issues"',
      '',
      'Apply:',
      '  "Write this to chapel.yaml"',
      '  (Always previews first, writes only with confirmation)',
      '',
      'Everything I do maps to an explicit engine command.',
      'I\'ll always tell you what I\'m running before doing it.',
    ];
    return { ok: true, summary: help.join('\n'), actions: [] };
  },
};

// --- Tool: context-info ---

const contextInfoTool: ChatTool = {
  name: 'context-info',
  description: 'Show what context and sources chat is currently using',
  intents: ['context_info'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    // This tool returns a message directing users to /context and /sources
    // The actual snapshot display is handled by the engine/shell
    const a = action('context-info', 'Show context transparency', false);
    return {
      ok: true,
      summary: [
        'Context transparency:',
        '',
        'Use /context in chat to see a full breakdown of:',
        '  - What was retrieved and from where',
        '  - Which memory classes are active',
        '  - Budget allocation across sources',
        '  - Which personality profile is active',
        '',
        'Use /sources for a condensed list of retrieved sources.',
        '',
        'The last context snapshot is updated with every message you send.',
      ].join('\n'),
      actions: [executed(a)],
    };
  },
};

// --- Tool: smart-plan ---

const smartPlanTool: ChatTool = {
  name: 'smart-plan',
  description: 'Generate a session-aware action plan based on current state',
  intents: ['show_plan'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    const a = action('smart-plan', 'Generate session-aware action plan', false);
    const plan = planFromSession(p.session, p.params.goal ?? undefined);
    const formatted = formatPlan(plan);

    return {
      ok: true,
      summary: formatted,
      actions: [executed(a, `${plan.steps.length}-step plan generated`)],
      sessionEvents: plan.steps.length > 0
        ? [{ kind: 'plan_generated', detail: `Smart plan: ${plan.goal} (${plan.steps.length} steps)` }]
        : undefined,
    };
  },
};

// --- Tool: recommend ---

const recommendTool: ChatTool = {
  name: 'recommend',
  description: 'Generate prioritized recommendations based on session state',
  intents: ['recommend'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    const a = action('recommend', 'Generate session-aware recommendations', false);
    const recSet = generateRecommendations(p.session);
    const formatted = formatRecommendations(recSet);

    return {
      ok: true,
      summary: formatted,
      actions: [executed(a, `${recSet.recommendations.length} recommendation(s)`)],
    };
  },
};

// --- Tool: build-plan ---

const buildPlanTool: ChatTool = {
  name: 'build-plan',
  description: 'Generate a session-aware build plan from a high-level goal',
  intents: ['build_goal'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    const goal = p.params.goal ?? p.userMessage;
    if (!goal) {
      return { ok: false, summary: 'I need a build goal. Example: "build a rumor-driven market district"', actions: [] };
    }

    const a = action('build-plan', `Generate build plan: "${goal}"`, false);
    const plan = generateBuildPlan(goal, p.session);
    const formatted = formatBuildPlan(plan);

    return {
      ok: true,
      summary: formatted,
      output: JSON.stringify(plan),
      actions: [executed(a, `${plan.steps.length}-step plan generated`)],
      sessionEvents: [{ kind: 'build_plan_created', detail: `Build: ${goal} (${plan.steps.length} steps)` }],
    };
  },
};

// --- Tool: analyze-balance ---

const analyzeBalanceTool: ChatTool = {
  name: 'analyze-balance',
  description: 'Analyze replay data for balance issues (difficulty, pacing, escalation)',
  intents: ['analyze_balance'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    const replay = p.params.replay ?? p.params.content;
    if (!replay) {
      return { ok: false, summary: 'I need replay data to analyze balance. Pipe JSON replay output.', actions: [] };
    }
    const a = action('analyze-balance', 'Analyze replay for balance issues', false);
    const analysis = analyzeBalance(replay, p.session);
    return {
      ok: true,
      summary: formatBalanceAnalysis(analysis),
      output: JSON.stringify(analysis),
      actions: [executed(a, `${analysis.findings.length} finding(s)`)],
      sessionEvents: [{ kind: 'balance_analyzed', detail: `Balance: ${analysis.findings.length} finding(s)` }],
    };
  },
};

// --- Tool: compare-intent ---

const compareIntentTool: ChatTool = {
  name: 'compare-intent',
  description: 'Compare design intent against actual simulation outcomes',
  intents: ['compare_intent'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    const replay = p.params.replay ?? p.params.content;
    const intentText = p.params.intent ?? p.params.designIntent;
    if (!replay) {
      return { ok: false, summary: 'I need replay data to compare against intent. Pipe JSON replay output.', actions: [] };
    }
    if (!intentText) {
      return { ok: false, summary: 'I need a design intent specification. Provide targetMood and desiredOutcomes.', actions: [] };
    }
    const a = action('compare-intent', 'Compare design intent vs replay outcomes', false);
    const intent = parseDesignIntent(intentText);
    const comparison = compareIntent(intent, replay, p.session);
    return {
      ok: true,
      summary: formatIntentComparison(comparison),
      output: JSON.stringify(comparison),
      actions: [executed(a, comparison.overallStatus.replace(/_/g, ' '))],
      sessionEvents: [{ kind: 'intent_compared', detail: `Intent: ${comparison.overallStatus}` }],
    };
  },
};

// --- Tool: analyze-window ---

const analyzeWindowTool: ChatTool = {
  name: 'analyze-window',
  description: 'Analyze a specific tick range in replay data',
  intents: ['analyze_window'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    const replay = p.params.replay ?? p.params.content;
    const startTick = parseInt(p.params.startTick ?? '0', 10);
    const endTick = parseInt(p.params.endTick ?? '0', 10);
    if (!replay) {
      return { ok: false, summary: 'I need replay data and a tick range. Example: "analyze ticks 1-20"', actions: [] };
    }
    if (endTick <= startTick) {
      return { ok: false, summary: 'Invalid tick range. Provide startTick and endTick (e.g. ticks 1-20).', actions: [] };
    }
    const a = action('analyze-window', `Analyze ticks ${startTick}–${endTick}`, false);
    const analysis = analyzeWindow(replay, startTick, endTick, p.params.focus);
    return {
      ok: true,
      summary: formatWindowAnalysis(analysis),
      output: JSON.stringify(analysis),
      actions: [executed(a, `${analysis.findings.length} finding(s)`)],
      sessionEvents: [{ kind: 'window_analyzed', detail: `Window ${startTick}–${endTick}: ${analysis.findings.length} finding(s)` }],
    };
  },
};

// --- Tool: suggest-fixes ---

const suggestFixesTool: ChatTool = {
  name: 'suggest-fixes',
  description: 'Suggest actionable fixes based on balance findings',
  intents: ['suggest_fixes'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    // Try to get findings from params or from a prior analysis
    let findings;
    const raw = p.params.findings ?? p.params.content;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        findings = parsed.findings ?? parsed;
      } catch {
        return { ok: false, summary: 'Could not parse balance findings. Run analyze-balance first.', actions: [] };
      }
    }
    if (!findings || !Array.isArray(findings)) {
      return { ok: false, summary: 'I need balance findings to suggest fixes. Run analyze-balance first.', actions: [] };
    }
    const a = action('suggest-fixes', 'Generate suggested fixes from findings', false);
    const fixes = suggestFixes(findings);
    return {
      ok: true,
      summary: formatSuggestedFixes(fixes),
      output: JSON.stringify(fixes),
      actions: [executed(a, `${fixes.length} fix(es) suggested`)],
      sessionEvents: [{ kind: 'fixes_suggested', detail: `Fixes: ${fixes.length} suggestion(s)` }],
    };
  },
};

// --- Tool: compare-scenarios ---

const compareScenariosTool: ChatTool = {
  name: 'compare-scenarios',
  description: 'Compare before/after scenario revisions for balance changes',
  intents: ['compare_scenarios'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    const { before, after } = p.params;
    if (!before || !after) {
      return { ok: false, summary: 'I need before and after replay data to compare scenarios.', actions: [] };
    }
    const a = action('compare-scenarios', 'Compare scenario revisions', false);
    const intentText = p.params.intent ?? p.params.designIntent;
    const intent = intentText ? parseDesignIntent(intentText) : undefined;
    const comparison = compareScenarios(before, after, intent);
    return {
      ok: true,
      summary: formatScenarioComparison(comparison),
      output: JSON.stringify(comparison),
      actions: [executed(a, comparison.verdict)],
      sessionEvents: [{ kind: 'scenarios_compared', detail: `Comparison: ${comparison.verdict}` }],
    };
  },
};

// --- Tool: tune-plan ---

const tunePlanTool: ChatTool = {
  name: 'tune-plan',
  description: 'Generate a guided tuning plan from a tuning goal',
  intents: ['tune_goal'],
  mutates: false,
  async execute(p: ChatToolParams): Promise<ChatToolResult> {
    const goal = p.params.goal ?? p.userMessage;
    if (!goal) {
      return { ok: false, summary: 'I need a tuning goal. Example: "tune increase paranoia"', actions: [] };
    }
    const a = action('tune-plan', `Generate tuning plan: "${goal}"`, false);
    const plan = generateTuningPlan(goal, p.session);
    return {
      ok: true,
      summary: formatTuningPlan(plan),
      output: JSON.stringify(plan),
      actions: [executed(a, `${plan.steps.length}-step plan`)],
      sessionEvents: [{ kind: 'tune_plan_created', detail: `Tune: ${goal} (${plan.steps.length} steps)` }],
    };
  },
};

// --- Registry ---

const ALL_TOOLS: ChatTool[] = [
  suggestNextTool,
  sessionInfoTool,
  scaffoldTool,
  critiqueTool,
  improveTool,
  compareReplaysTool,
  analyzeReplayTool,
  planTool,
  explainWhyTool,
  explainStateTool,
  applyContentTool,
  helpTool,
  contextInfoTool,
  smartPlanTool,
  recommendTool,
  buildPlanTool,
  analyzeBalanceTool,
  compareIntentTool,
  analyzeWindowTool,
  suggestFixesTool,
  compareScenariosTool,
  tunePlanTool,
];

/**
 * Find the best tool for a given intent.
 */
export function findToolForIntent(intent: string): ChatTool | undefined {
  return ALL_TOOLS.find(t => t.intents.includes(intent as never));
}

/**
 * Get all registered tools.
 */
export function getAllTools(): ChatTool[] {
  return [...ALL_TOOLS];
}
