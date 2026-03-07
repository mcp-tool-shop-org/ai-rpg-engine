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
import { loadSession } from './session.js';

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
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case 'quit':
    case 'exit':
    case 'q':
      return 'quit';

    case 'help':
    case 'h':
      console.log('');
      console.log('/help           Show this help');
      console.log('/quit           Exit chat');
      console.log('/save           Save transcript now');
      console.log('/memory         Show conversation memory stats');
      console.log('/clear          Clear conversation memory');
      console.log('/pending        Show pending write, if any');
      console.log('/context        Show what context the last response used');
      console.log('/sources        Show condensed source list from last retrieval');
      console.log('/loadout        Show loadout routing from last response');
      console.log('/loadout-history Show recent loadout routing decisions');
      console.log('/build <goal>   Create a build plan from a goal');
      console.log('/preview        Preview the active build plan');
      console.log('/step           Execute the next build step');
      console.log('/execute        Execute all remaining build steps');
      console.log('/status         Show build status');
      console.log('/diagnostics    Show post-build diagnostics');
      console.log('/analyze-balance <replay>  Analyze balance from replay data');
      console.log('/compare-intent <intent> <replay>  Compare intent vs outcome');
      console.log('/analyze-window <start> <end> [replay]  Analyze tick window');
      console.log('/suggest-fixes  Suggest fixes from last balance analysis');
      console.log('/compare-scenarios <before> <after>  Compare scenario revisions');
      console.log('/tune <goal>    Create a tuning plan');
      console.log('/tune-preview   Preview active tuning plan');
      console.log('/tune-step      Execute next tuning step');
      console.log('/tune-execute   Execute all tuning steps');
      console.log('/tune-status    Show tuning status');
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
      const plan = generateTuningPlan(goal, session);
      engine.activeTuning = createTuningState(plan);
      console.log('');
      console.log(formatTuningPlan(plan));
      console.log('');
      return 'handled';
    }

    case 'tune-preview':
      if (engine.activeTuning) {
        console.log('');
        console.log(formatTuningPlan(engine.activeTuning.plan));
        console.log('');
      } else {
        console.log('No active tuning plan. Use /tune <goal> to create one.');
      }
      return 'handled';

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

    default:
      console.log(`Unknown command: /${cmd}. Type /help for available commands.`);
      return 'handled';
  }
}
