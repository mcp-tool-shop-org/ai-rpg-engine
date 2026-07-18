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
import { tryLoadSession } from './session.js';
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
  /** Input stream override (default process.stdin). Exposed for tests. */
  input?: NodeJS.ReadableStream;
  /** Output stream override (default process.stdout). Exposed for tests. */
  output?: NodeJS.WritableStream;
};

/**
 * Persist the transcript when the REPL exits (v2.6 Stage C F-77c30d19).
 *
 * Previously only /quit saved: exiting via Ctrl+D (the standard REPL exit
 * reflex) or Ctrl+C silently discarded the whole transcript even with
 * saveTranscripts: true. This is the single exit-save path — called from the
 * readline 'close' handler, which fires for /quit, Ctrl+D, and Ctrl+C alike.
 *
 * It also surfaces failure honestly: saveTranscript signals a sandbox
 * violation by RETURNING an 'Error: ...' string and can THROW on disk errors
 * (mkdir/writeFile) — both used to be swallowed while "Transcript saved"
 * printed regardless. Returns the saved path, or null when nothing was saved.
 * Never throws (it runs at exit — the one moment a crash also loses the data
 * it exists to protect).
 *
 * Exported for tests.
 */
export async function persistTranscriptAtExit(
  transcript: ChatTranscript,
  projectRoot: string,
  saveTranscripts: boolean,
): Promise<string | null> {
  if (!saveTranscripts || transcript.messages.length === 0) return null;
  const path = defaultTranscriptPath(projectRoot, transcript.sessionName);
  try {
    const saved = await saveTranscript(path, transcript, projectRoot);
    if (saved.startsWith('Error:')) {
      console.error(`Transcript NOT saved — ${saved}`);
      return null;
    }
    console.log(`Transcript saved to ${saved}`);
    return saved;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Transcript NOT saved — ${msg}`);
    return null;
  }
}

export async function runChatShell(options: ChatShellOptions): Promise<void> {
  const { client, projectRoot, maxMemory, saveTranscripts = false, loadoutEnabled = false } = options;

  const engine = createChatEngine({ client, projectRoot, maxMemory, loadoutEnabled });
  const transcript = createTranscript(null);

  const rl = createInterface({
    input: options.input ?? process.stdin,
    output: options.output ?? process.stdout,
    prompt: 'chat> ',
  });

  // /onboard is the purpose-built first-run walkthrough — name it here, not
  // only inside /help (F-a4c8e217 discoverability polish).
  console.log('ai-rpg-engine chat — type your question, /help for commands, /onboard for a guided tour, /quit to exit.');
  console.log('');
  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    // Slash commands — wrapped in the same try/catch that protects the normal
    // message path (v2.6 Stage C F-2ef8b590). Reachable rejections exist
    // (saveTranscript's mkdir/writeFile on /save, saveSession during
    // /step //execute /tune-step, tryLoadSession's rethrow); unguarded, any of
    // them became an unhandled rejection that crashed the whole process — and
    // with it the in-memory conversation, active build/tuning state, and the
    // unsaved transcript.
    if (trimmed.startsWith('/')) {
      try {
        const handled = await handleSlashCommand(trimmed, engine, transcript, projectRoot, saveTranscripts);
        if (handled === 'quit') {
          // Transcript persistence happens in the 'close' handler — the single
          // exit-save path shared with Ctrl+D / Ctrl+C (F-77c30d19).
          rl.close();
          return;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: ${msg}`);
      }
      rl.prompt();
      return;
    }

    // Process through chat engine
    try {
      const now = new Date().toISOString();
      addToTranscript(transcript, { role: 'user', content: trimmed, timestamp: now });

      // Liveness affordance (F-4be7a3c2): a turn can be 1-3 sequential LLM
      // calls, and a cold model load alone can take 30s+. One line beats
      // wondering whether the REPL froze.
      console.log('(thinking...)');
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

  let exitSaveStarted = false;
  rl.on('close', () => {
    // Fires for /quit, Ctrl+D, and Ctrl+C — the single exit-save path
    // (F-77c30d19). The pending write keeps the event loop alive until the
    // transcript lands (or the failure is reported).
    if (exitSaveStarted) return;
    exitSaveStarted = true;
    void persistTranscriptAtExit(transcript, projectRoot, saveTranscripts);
  });
}

/** Exported for tests (v2.6 audit F-ed21662f). */
export async function handleSlashCommand(
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
      // saveTranscript signals sandbox failure by RETURNING an 'Error: ...'
      // string; printing an unconditional success line was a false receipt
      // (v2.6 Stage C F-77c30d19). Disk errors (mkdir/writeFile) throw and are
      // caught by the shell's slash-command try/catch (F-2ef8b590).
      const saved = await saveTranscript(path, transcript, projectRoot);
      if (saved.startsWith('Error:')) {
        console.log(`Transcript NOT saved — ${saved}`);
      } else {
        console.log(`Transcript saved to ${saved}`);
      }
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
      const session = await tryLoadSession(projectRoot);
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
      // Per-step liveness (v2.6 Stage C F-4be7a3c2): each step is a full model
      // generation; without the callback an N-step batch is N generations of
      // stdout silence. Same [n/N] shape macros.ts uses in the CLI.
      const result = await engine.executeAllBuildSteps((p) => {
        console.log(`[${p.index}/${p.total}] ${p.result.split('\n')[0]}`);
      });
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
      const session = await tryLoadSession(projectRoot);
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
      const session = await tryLoadSession(projectRoot);
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
      const session = await tryLoadSession(projectRoot);
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
      // v2.6 audit F-ed21662f — a non-numeric tick argument makes parseInt
      // yield NaN, and ANY comparison against NaN is false, so the old
      // `endTick <= startTick` check alone never tripped for a malformed
      // argument. Execution fell through into analyzeWindow(replay, NaN, ...),
      // whose tick filter (`tick >= NaN`) always matches zero ticks — a
      // silent "0 ticks analyzed, 0 findings" indistinguishable from a
      // legitimately empty (but validly specified) window. Reject NaN
      // explicitly so malformed input gets the same usage message.
      if (Number.isNaN(startTick) || Number.isNaN(endTick) || endTick <= startTick) {
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
      const session = await tryLoadSession(projectRoot);
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
          await tryLoadSession(projectRoot),
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
      // Per-step liveness — same contract as /execute (F-4be7a3c2).
      const result = await engine.executeAllTuningSteps((p) => {
        console.log(`[${p.index}/${p.total}] ${p.result.split('\n')[0]}`);
      });
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
      const session = await tryLoadSession(projectRoot);
      const plan = generateExperimentPlan(goal, session);
      console.log('');
      console.log(formatExperimentPlan(plan));
      console.log('');
      return 'handled';
    }

    case 'experiment-run': {
      const runs = parseInt(parts[1] ?? '20', 10);
      // v2.6 Stage C F-3f6b0d95 — same NaN family as /analyze-window
      // (F-ed21662f): NaN passes a range guard because every comparison
      // against NaN is false, so '/experiment-run abc' printed
      // 'Experiment plan: NaN runs'. Reject explicitly with the usage line.
      if (Number.isNaN(runs)) {
        console.log('Usage: /experiment-run <runs> [label]');
        console.log('Run count must be a number between 1 and 1000.');
        return 'handled';
      }
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
      // v2.6 Stage C F-3f6b0d95 — non-numeric range arguments produced
      // 'Sweep: rumorClarity from NaN to NaN step NaN (0 points)'
      // (generateSweepValues returns [] for NaN inputs). Reject with usage.
      if (Number.isNaN(from) || Number.isNaN(to) || Number.isNaN(step)) {
        console.log('Usage: /experiment-sweep <param> <from> <to> <step>');
        console.log('from/to/step must be numbers. Example: /experiment-sweep rumorClarity 0.4 0.8 0.1');
        return 'handled';
      }
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
      const session = await tryLoadSession(projectRoot);
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
      const session = await tryLoadSession(projectRoot);
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
      const session = await tryLoadSession(projectRoot);
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

    default: {
      // Name the command the user actually TYPED, not its alias target
      // (v2.6 Stage C F-a4c8e217): '/next' used to print "Unknown command:
      // /suggest-next" — an error naming a command the user never entered,
      // because the alias was resolved before the message was formatted.
      const typed = parts[0].toLowerCase();
      const aliasNote = typed !== cmd ? ` (alias of /${cmd})` : '';
      console.log(`Unknown command: /${typed}${aliasNote}. Type /help for available commands.`);
      return 'handled';
    }
  }
}
