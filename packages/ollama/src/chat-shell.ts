// Chat shell — interactive REPL for conversational engine use.
// Runs a readline loop: prompt → engine.process → print → repeat.
// Supports /commands for meta-actions.

import { createInterface } from 'node:readline';
import type { OllamaTextClient } from './client.js';
import { createChatEngine, type ChatEngine } from './chat-engine.js';
import { createTranscript, addToTranscript, saveTranscript, defaultTranscriptPath } from './chat-transcript.js';
import type { ChatTranscript } from './chat-types.js';
import { formatContextSnapshot, formatSources, formatLoadoutHistory } from './chat-context-browser.js';
import { formatLoadoutRoute } from './chat-loadout.js';
import {
  generateBuildPlan, createBuildState, formatBuildPlan,
  formatBuildPreview, formatBuildStatus, buildDiagnostics, formatBuildDiagnostics,
} from './chat-build-planner.js';
import {
  analyzeBalance, formatBalanceAnalysis,
  parseDesignIntent, compareIntent, formatIntentComparison,
  analyzeWindow, formatWindowAnalysis,
  suggestFixes, formatSuggestedFixes,
  compareScenarios, formatScenarioComparison,
  generateTuningPlan, createTuningState, formatTuningPlan, formatTuningStatus,
} from './chat-balance-analyzer.js';
import {
  bundleFindings, buildPatchPreview, generatePatchYaml,
  formatPatchPreview, formatTuningBundles, formatReplayImpact,
  predictImpact, generateOperationalPlan,
} from './chat-tuning-engine.js';
import {
  generateExperimentPlan, formatExperimentPlan,
  formatExperimentSummary, formatExperimentComparison,
  formatParameterSweepResult, formatRunResults,
  compareExperiments, isTunableParam, generateSweepValues,
  runExperiment, runParameterSweep,
  type ReplayProducer, type ExperimentSummary,
} from './chat-experiments.js';
import { loadSession } from './session.js';
import {
  resolveAlias, formatGroupedHelp,
  buildStudioSnapshot, formatStudioDashboard,
  filterHistory, formatHistoryBrowser,
  filterIssues, formatIssueBrowser,
  gatherFindings, formatFindingBrowser,
  formatExperimentBrowser,
  formatOnboarding,
  setDisplayMode, getDisplayMode,
  type HistoryFilter, type IssueFilter, type FindingFilter, type DisplayMode,
} from './chat-studio.js';

export type ChatShellOptions = {
  client: OllamaTextClient;
  projectRoot: string;
  maxMemory?: number;
  saveTranscripts?: boolean;
  transcriptDir?: string;
  /** Enable loadout-guided context routing. */
  loadoutEnabled?: boolean;
};

export async function runChatShell(options: ChatShellOptions): Promise<void> {
  const { client, projectRoot, maxMemory, saveTranscripts = false, loadoutEnabled = false } = options;

  const engine = createChatEngine({ client, projectRoot, maxMemory, loadoutEnabled });
  const transcript = createTranscript(null);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'chat> ',
  });

  console.log('ai-rpg-engine chat — type your question, /help for commands, /quit to exit.');
  console.log('');
  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    // Slash commands
    if (trimmed.startsWith('/')) {
      const handled = await handleSlashCommand(trimmed, engine, transcript, projectRoot, saveTranscripts);
      if (handled === 'quit') {
        if (saveTranscripts && transcript.messages.length > 0) {
          const path = defaultTranscriptPath(projectRoot, transcript.sessionName);
          await saveTranscript(path, transcript);
          console.log(`Transcript saved to ${path}`);
        }
        rl.close();
        return;
      }
      rl.prompt();
      return;
    }

    // Process through chat engine
    try {
      const now = new Date().toISOString();
      addToTranscript(transcript, { role: 'user', content: trimmed, timestamp: now });

      const response = await engine.process(trimmed);
      console.log('');
      console.log(response);
      console.log('');

      addToTranscript(transcript, { role: 'assistant', content: response, timestamp: new Date().toISOString() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${msg}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    // Handled above in /quit — this covers Ctrl+C
  });
}

async function handleSlashCommand(
  input: string,
  engine: ChatEngine,
  transcript: ChatTranscript,
  projectRoot: string,
  saveTranscripts: boolean,
): Promise<'quit' | 'handled'> {
  const parts = input.slice(1).split(/\s+/);
  const cmd = resolveAlias(parts[0].toLowerCase());

  switch (cmd) {
    case 'quit':
    case 'exit':
    case 'q':
      return 'quit';

    case 'help':
    case 'h':
      console.log('');
      console.log(formatGroupedHelp(parts[1]));
      console.log('');
      return 'handled';

    case 'save': {
      if (transcript.messages.length === 0) {
        console.log('Nothing to save yet.');
        return 'handled';
      }
      const path = defaultTranscriptPath(projectRoot, transcript.sessionName);
      await saveTranscript(path, transcript);
      console.log(`Transcript saved to ${path}`);
      return 'handled';
    }

    case 'memory': {
      const mem = engine.memory;
      console.log(`Messages: ${mem.messages.length} / ${mem.maxMessages}`);
      if (mem.sessionName) console.log(`Session: ${mem.sessionName}`);
      return 'handled';
    }

    case 'clear':
      engine.memory.messages.length = 0;
      engine.pendingWrite = null;
      console.log('Memory cleared.');
      return 'handled';

    case 'pending':
      if (engine.pendingWrite) {
        console.log(`Pending write: ${engine.pendingWrite.suggestedPath}`);
        console.log(`Label: ${engine.pendingWrite.label}`);
        console.log(`Content length: ${engine.pendingWrite.content.length} chars`);
      } else {
        console.log('No pending write.');
      }
      return 'handled';

    case 'context':
      if (engine.lastContextSnapshot) {
        console.log(formatContextSnapshot(engine.lastContextSnapshot));
      } else {
        console.log('No context snapshot yet. Send a message first.');
      }
      return 'handled';

    case 'sources':
      if (engine.lastContextSnapshot) {
        console.log(formatSources(engine.lastContextSnapshot));
      } else {
        console.log('No context snapshot yet. Send a message first.');
      }
      return 'handled';

    case 'loadout':
      if (engine.lastLoadoutPlan) {
        console.log(formatLoadoutRoute(engine.lastLoadoutPlan));
      } else {
        console.log('No loadout plan yet. Send a message first (loadout must be enabled).');
      }
      return 'handled';

    case 'loadout-history':
      if (engine.loadoutHistory.length > 0) {
        console.log(formatLoadoutHistory(engine.loadoutHistory));
      } else {
        console.log('No loadout history yet. Send a message first (loadout must be enabled).');
      }
      return 'handled';

    case 'build': {
      const goal = parts.slice(1).join(' ').trim();
      if (!goal) {
        console.log('Usage: /build <goal>');
        console.log('Example: /build rumor-driven market district');
        return 'handled';
      }
      const session = await loadSession(projectRoot);
      const plan = generateBuildPlan(goal, session);
      engine.activeBuild = createBuildState(plan);
      console.log('');
      console.log(formatBuildPlan(plan));
      console.log('');
      return 'handled';
    }

    case 'preview':
      if (engine.activeBuild) {
        console.log('');
        console.log(formatBuildPreview(engine.activeBuild.plan));
        console.log('');
      } else {
        console.log('No active build. Use /build <goal> to create one.');
      }
      return 'handled';

    case 'step': {
      if (!engine.activeBuild) {
        console.log('No active build. Use /build <goal> to create one.');
        return 'handled';
      }
      console.log('Executing next step...');
      const result = await engine.executeBuildStep();
      console.log('');
      console.log(result);
      console.log('');
      return 'handled';
    }

    case 'execute': {
      if (!engine.activeBuild) {
        console.log('No active build. Use /build <goal> to create one.');
        return 'handled';
      }
      console.log('Executing all remaining steps...');
      const result = await engine.executeAllBuildSteps();
      console.log('');
      console.log(result);
      console.log('');
      return 'handled';
    }

    case 'status':
      if (engine.activeBuild) {
        console.log('');
        console.log(formatBuildStatus(engine.activeBuild));
        console.log('');
      } else {
        console.log('No active build.');
      }
      return 'handled';

    case 'diagnostics': {
      if (!engine.activeBuild) {
        console.log('No active build to diagnose.');
        return 'handled';
      }
      const session = await loadSession(projectRoot);
      const diag = buildDiagnostics(engine.activeBuild, session);
      console.log('');
      console.log(formatBuildDiagnostics(diag));
      console.log('');
      return 'handled';
    }

    case 'analyze-balance': {
      const replay = parts.slice(1).join(' ').trim();
      if (!replay) {
        console.log('Usage: /analyze-balance <replay-json>');
        return 'handled';
      }
      const session = await loadSession(projectRoot);
      const analysis = analyzeBalance(replay, session);
      console.log('');
      console.log(formatBalanceAnalysis(analysis));
      console.log('');
      return 'handled';
    }

    case 'compare-intent': {
      const args = parts.slice(1).join(' ').trim();
      if (!args) {
        console.log('Usage: /compare-intent <intent-yaml> | <replay-json>');
        console.log('Separate intent and replay with " | "');
        return 'handled';
      }
      const [intentPart, replayPart] = args.split('|').map(s => s.trim());
      if (!intentPart || !replayPart) {
        console.log('Provide both intent and replay separated by " | ".');
        return 'handled';
      }
      const intent = parseDesignIntent(intentPart);
      const session = await loadSession(projectRoot);
      const comparison = compareIntent(intent, replayPart, session);
      console.log('');
      console.log(formatIntentComparison(comparison));
      console.log('');
      return 'handled';
    }

    case 'analyze-window': {
      const startTick = parseInt(parts[1] ?? '0', 10);
      const endTick = parseInt(parts[2] ?? '0', 10);
      const replay = parts.slice(3).join(' ').trim();
      if (endTick <= startTick) {
        console.log('Usage: /analyze-window <startTick> <endTick> <replay-json>');
        return 'handled';
      }
      if (!replay) {
        console.log('Provide replay JSON data after the tick range.');
        return 'handled';
      }
      const analysis = analyzeWindow(replay, startTick, endTick);
      console.log('');
      console.log(formatWindowAnalysis(analysis));
      console.log('');
      return 'handled';
    }

    case 'suggest-fixes': {
      // Use last balance analysis if available
      const argsText = parts.slice(1).join(' ').trim();
      if (!argsText) {
        console.log('Usage: /suggest-fixes <findings-json>');
        console.log('Pass the findings from /analyze-balance.');
        return 'handled';
      }
      try {
        const parsed = JSON.parse(argsText);
        const findings = parsed.findings ?? parsed;
        const fixes = suggestFixes(findings);
        console.log('');
        console.log(formatSuggestedFixes(fixes));
        console.log('');
      } catch {
        console.log('Could not parse findings JSON.');
      }
      return 'handled';
    }

    case 'compare-scenarios': {
      const args = parts.slice(1).join(' ').trim();
      if (!args) {
        console.log('Usage: /compare-scenarios <before-json> | <after-json>');
        return 'handled';
      }
      const [beforePart, afterPart] = args.split('|').map(s => s.trim());
      if (!beforePart || !afterPart) {
        console.log('Provide before and after replay JSON separated by " | ".');
        return 'handled';
      }
      const comparison = compareScenarios(beforePart, afterPart);
      console.log('');
      console.log(formatScenarioComparison(comparison));
      console.log('');
      return 'handled';
    }

    case 'tune': {
      const goal = parts.slice(1).join(' ').trim();
      if (!goal) {
        console.log('Usage: /tune <goal>');
        console.log('Example: /tune increase paranoia');
        return 'handled';
      }
      const session = await loadSession(projectRoot);
      // v1.7.0: use operational plan when prior analysis is available
      const plan = engine.lastAnalysis
        ? generateOperationalPlan(goal, session, engine.lastAnalysis)
        : generateTuningPlan(goal, session);
      engine.activeTuning = createTuningState(plan);
      console.log('');
      console.log(formatTuningPlan(plan));
      console.log('');
      return 'handled';
    }

    case 'tune-preview':
      if (engine.activeTuning && engine.lastAnalysis) {
        // v1.7.0: show patch preview with impact predictions
        const fixes = suggestFixes(engine.lastAnalysis.findings);
        const preview = buildPatchPreview(
          engine.activeTuning.plan.goal,
          engine.lastAnalysis.findings,
          fixes,
          await loadSession(projectRoot),
        );
        console.log('');
        console.log(formatPatchPreview(preview));
        console.log('');
      } else if (engine.activeTuning) {
        console.log('');
        console.log(formatTuningPlan(engine.activeTuning.plan));
        console.log('');
      } else {
        console.log('No active tuning plan. Use /tune <goal> to create one.');
      }
      return 'handled';

    case 'tune-apply': {
      if (!engine.activeTuning) {
        console.log('No active tuning plan. Use /tune <goal> to create one.');
        return 'handled';
      }
      if (!engine.lastAnalysis) {
        console.log('No analysis available. Run /analyze-balance first.');
        return 'handled';
      }
      const fixes = suggestFixes(engine.lastAnalysis.findings);
      const bundles = bundleFindings(engine.lastAnalysis.findings, fixes);
      if (bundles.length === 0) {
        console.log('No fix bundles available to apply.');
        return 'handled';
      }
      // Apply the first unapplied bundle
      const bundle = bundles[0];
      const yaml = generatePatchYaml(bundle, engine.activeTuning.plan.goal);
      engine.pendingWrite = {
        content: yaml,
        suggestedPath: `tuning-${bundle.code}.yaml`,
        label: bundle.name,
      };
      console.log('');
      console.log(`Patch bundle: ${bundle.name}`);
      console.log(yaml);
      console.log('');
      console.log('Say "yes" to apply, or "no" to cancel.');
      return 'handled';
    }

    case 'tune-bundles': {
      if (!engine.lastAnalysis) {
        console.log('No analysis available. Run /analyze-balance first.');
        return 'handled';
      }
      const fixes = suggestFixes(engine.lastAnalysis.findings);
      const bundles = bundleFindings(engine.lastAnalysis.findings, fixes);
      console.log('');
      console.log(formatTuningBundles(bundles));
      console.log('');
      return 'handled';
    }

    case 'tune-impact': {
      if (!engine.lastAnalysis) {
        console.log('No analysis available. Run /analyze-balance first.');
        return 'handled';
      }
      const fixes = suggestFixes(engine.lastAnalysis.findings);
      const bundles = bundleFindings(engine.lastAnalysis.findings, fixes);
      const allPatches = bundles.flatMap(b => b.patches);
      const allFixCodes = bundles.flatMap(b => b.fixCodes);
      const impact = predictImpact(allPatches, allFixCodes);
      console.log('');
      console.log('Predicted Replay Impact:');
      console.log(formatReplayImpact(impact));
      console.log('');
      return 'handled';
    }

    case 'tune-step': {
      if (!engine.activeTuning) {
        console.log('No active tuning plan. Use /tune <goal> to create one.');
        return 'handled';
      }
      console.log('Executing next tuning step...');
      const result = await engine.executeTuningStep();
      console.log('');
      console.log(result);
      console.log('');
      return 'handled';
    }

    case 'tune-execute': {
      if (!engine.activeTuning) {
        console.log('No active tuning plan. Use /tune <goal> to create one.');
        return 'handled';
      }
      console.log('Executing all remaining tuning steps...');
      const result = await engine.executeAllTuningSteps();
      console.log('');
      console.log(result);
      console.log('');
      return 'handled';
    }

    case 'tune-status':
      if (engine.activeTuning) {
        console.log('');
        console.log(formatTuningStatus(engine.activeTuning));
        console.log('');
      } else {
        console.log('No active tuning plan.');
      }
      return 'handled';

    case 'experiment-plan': {
      const goal = parts.slice(1).join(' ').trim();
      if (!goal) {
        console.log('Usage: /experiment-plan <goal>');
        console.log('Example: /experiment-plan compare baseline vs tuned');
        return 'handled';
      }
      const session = await loadSession(projectRoot);
      const plan = generateExperimentPlan(goal, session);
      console.log('');
      console.log(formatExperimentPlan(plan));
      console.log('');
      return 'handled';
    }

    case 'experiment-run': {
      const runs = parseInt(parts[1] ?? '20', 10);
      if (runs < 1 || runs > 1000) {
        console.log('Run count must be between 1 and 1000.');
        return 'handled';
      }
      const label = parts[2] ?? 'experiment';
      console.log(`Experiment plan: ${runs} runs as "${label}"`);
      console.log('Use the experiment runner API with a ReplayProducer to execute batches.');
      const plan = generateExperimentPlan(`batch run ${runs}x`, null);
      console.log('');
      console.log(formatExperimentPlan(plan));
      console.log('');
      return 'handled';
    }

    case 'experiment-sweep': {
      const param = parts[1];
      if (!param) {
        console.log('Usage: /experiment-sweep <param> <from> <to> <step>');
        console.log('Example: /experiment-sweep rumorClarity 0.4 0.8 0.1');
        return 'handled';
      }
      if (!isTunableParam(param)) {
        console.log(`Parameter "${param}" is not tunable.`);
        console.log('Tunable: rumorClarity, alertGain, hostilityDecay, escalationThreshold, stabilityReactivity, escalationGain, encounterDifficulty');
        return 'handled';
      }
      const from = parseFloat(parts[2] ?? '0.3');
      const to = parseFloat(parts[3] ?? '0.8');
      const step = parseFloat(parts[4] ?? '0.1');
      const values = generateSweepValues(from, to, step);
      console.log(`Sweep: ${param} from ${from} to ${to} step ${step} (${values.length} points)`);
      console.log('Use the sweep runner API with a ReplayProducer to execute.');
      return 'handled';
    }

    case 'experiment-compare': {
      if (!engine.lastExperiment || !engine.baselineExperiment) {
        console.log('Need two experiment summaries to compare. Run experiments first.');
        return 'handled';
      }
      const comparison = compareExperiments(engine.baselineExperiment, engine.lastExperiment);
      console.log('');
      console.log(formatExperimentComparison(comparison));
      console.log('');
      return 'handled';
    }

    case 'experiment-findings': {
      if (!engine.lastExperiment) {
        console.log('No experiment results available. Run an experiment first.');
        return 'handled';
      }
      const findings = engine.lastExperiment.varianceFindings;
      if (findings.length === 0) {
        console.log('No variance findings in last experiment.');
        return 'handled';
      }
      console.log('');
      console.log(`Variance Findings (${findings.length}):`);
      for (const f of findings) {
        console.log(`  [${f.severity}] ${f.code}: ${f.summary}`);
        if (f.suggestion) console.log(`    → ${f.suggestion}`);
      }
      console.log('');
      return 'handled';
    }

    // --- Studio UX commands (v1.9.0) ---

    case 'studio':
    case 'dashboard': {
      const session = await loadSession(projectRoot);
      const snapshot = buildStudioSnapshot(session, {
        lastExperiment: engine.lastExperiment,
        baselineExperiment: engine.baselineExperiment,
        lastAnalysis: engine.lastAnalysis,
        activeBuild: engine.activeBuild,
        activeTuning: engine.activeTuning,
      });
      console.log('');
      console.log(formatStudioDashboard(snapshot));
      console.log('');
      return 'handled';
    }

    case 'history': {
      const session = await loadSession(projectRoot);
      if (!session) {
        console.log('No active session.');
        return 'handled';
      }
      const filter: HistoryFilter = {};
      // Parse flags: --tail N, --type T, --grep G, --group G
      for (let i = 1; i < parts.length; i++) {
        if (parts[i] === '--tail' && parts[i + 1]) {
          filter.tail = parseInt(parts[++i], 10);
        } else if (parts[i] === '--type' && parts[i + 1]) {
          filter.type = parts[++i] as HistoryFilter['type'];
        } else if (parts[i] === '--grep' && parts[i + 1]) {
          filter.grep = parts[++i];
        } else if (parts[i] === '--group' && parts[i + 1]) {
          filter.group = parts[++i] as HistoryFilter['group'];
        }
      }
      const events = filterHistory(session, filter);
      console.log('');
      console.log(formatHistoryBrowser(events, session, filter));
      console.log('');
      return 'handled';
    }

    case 'issues': {
      const session = await loadSession(projectRoot);
      if (!session) {
        console.log('No active session.');
        return 'handled';
      }
      const filter: IssueFilter = {};
      for (let i = 1; i < parts.length; i++) {
        if (parts[i] === '--status' && parts[i + 1]) {
          filter.status = parts[++i] as 'open' | 'resolved';
        } else if (parts[i] === '--severity' && parts[i + 1]) {
          filter.severity = parts[++i] as IssueFilter['severity'];
        } else if (parts[i] === '--bucket' && parts[i + 1]) {
          filter.bucket = parts[++i];
        } else if (parts[i] === '--grep' && parts[i + 1]) {
          filter.grep = parts[++i];
        }
      }
      const issues = filterIssues(session, filter);
      console.log('');
      console.log(formatIssueBrowser(issues, session, filter));
      console.log('');
      return 'handled';
    }

    case 'findings': {
      const filter: FindingFilter = {};
      for (let i = 1; i < parts.length; i++) {
        if (parts[i] === '--source' && parts[i + 1]) {
          filter.source = parts[++i] as FindingFilter['source'];
        } else if (parts[i] === '--severity' && parts[i + 1]) {
          filter.severity = parts[++i] as FindingFilter['severity'];
        } else if (parts[i] === '--artifact' && parts[i + 1]) {
          filter.artifact = parts[++i];
        } else if (parts[i] === '--recent') {
          filter.recent = true;
        }
      }
      const findings = gatherFindings(
        engine.lastAnalysis ?? null,
        engine.lastExperiment ?? null,
        filter,
      );
      console.log('');
      console.log(formatFindingBrowser(findings));
      console.log('');
      return 'handled';
    }

    case 'experiments': {
      const experiments: ExperimentSummary[] = [];
      if (engine.lastExperiment) experiments.push(engine.lastExperiment);
      if (engine.baselineExperiment) experiments.push(engine.baselineExperiment);
      if (experiments.length === 0) {
        console.log('No experiment results available. Run an experiment first.');
        return 'handled';
      }
      const comparison = (experiments.length >= 2)
        ? compareExperiments(experiments[0], experiments[1])
        : undefined;
      console.log('');
      console.log(formatExperimentBrowser(experiments, comparison ?? undefined));
      console.log('');
      return 'handled';
    }

    case 'onboard':
      console.log('');
      console.log(formatOnboarding());
      console.log('');
      return 'handled';

    case 'display': {
      const mode = parts[1]?.toLowerCase();
      if (mode === 'compact' || mode === 'verbose') {
        setDisplayMode(mode);
        console.log(`Display mode: ${mode}`);
      } else {
        console.log(`Current display mode: ${getDisplayMode()}`);
        console.log('Usage: /display compact | /display verbose');
      }
      return 'handled';
    }

    default:
      console.log(`Unknown command: /${cmd}. Type /help for available commands.`);
      return 'handled';
  }
}
