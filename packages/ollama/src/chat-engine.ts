// Chat engine — the core orchestrator.
// Routes user messages through: intent → RAG → shape memory → tool → present.
// Manages bounded conversational memory and pending writes.
// Never invents hidden state or writes without explicit consent.
// v1.1: integrates RAG retrieval, memory shaping, personality profiles, webfetch.
// v1.2: adds context snapshots, planner integration, recommendation awareness.

import type { OllamaTextClient } from './client.js';
import type {
  ChatMessage, ChatConfig, ChatMemory, ChatToolResult,
  PlannedAction, DEFAULT_CHAT_CONFIG,
} from './chat-types.js';
import type { DesignSession } from './session.js';
import {
  loadSession, saveSession, renderSessionContext,
  recordEvent, addArtifact, addCritiqueIssues,
} from './session.js';
import { classifyIntent } from './chat-router.js';
import { findToolForIntent } from './chat-tools.js';
import { retrieve, formatRetrievedContext, extractKeywords } from './chat-rag.js';
import { shapeMemory, formatShapedContext } from './chat-memory-shaper.js';
import {
  WORLDBUILDER_PROFILE, getProfileForIntent, buildSystemPrompt,
  type PersonalityProfile,
} from './chat-personality.js';
import { webfetch, formatWebfetchForPrompt, isAllowedUrl } from './chat-webfetch.js';
import {
  buildContextSnapshot, formatContextSnapshot, formatSources,
  type ContextSnapshot,
} from './chat-context-browser.js';
import {
  buildTaskString, routeContext, recordContextLoads,
  formatLoadoutRoute,
  type LoadoutRoutePlan,
} from './chat-loadout.js';
import {
  generateBuildPlan, createBuildState, nextPendingStep,
  markStepExecuted, markStepFailed, isBuildComplete, finalizeBuild,
  formatBuildPlan, formatBuildPreview, formatBuildStatus,
  buildDiagnostics, formatBuildDiagnostics,
  type BuildState, type BuildPlan,
} from './chat-build-planner.js';
import {
  generateTuningPlan, createTuningState, nextPendingTuningStep,
  markTuningStepExecuted, markTuningStepFailed, isTuningComplete, finalizeTuning,
  formatTuningPlan, formatTuningStatus,
  type TuningState, type TuningPlan, type BalanceAnalysis,
} from './chat-balance-analyzer.js';
import { generateOperationalPlan } from './chat-tuning-engine.js';
import type { ExperimentSummary } from './chat-experiments.js';

// --- Chat memory ---

export function createChatMemory(maxMessages: number, sessionName: string | null): ChatMemory {
  return { messages: [], maxMessages, sessionName };
}

export function addMessage(memory: ChatMemory, message: ChatMessage): void {
  memory.messages.push(message);
  // Trim from the front, but always keep the system message if present
  while (memory.messages.length > memory.maxMessages) {
    const first = memory.messages[0];
    if (first.role === 'system') {
      // Keep system, remove second message
      if (memory.messages.length > 1) {
        memory.messages.splice(1, 1);
      } else {
        break;
      }
    } else {
      memory.messages.shift();
    }
  }
}

export function getRecentContext(memory: ChatMemory, n = 6): string {
  const recent = memory.messages.slice(-n);
  return recent.map(m => `${m.role}: ${m.content}`).join('\n');
}

// --- Presentation layer ---

export async function presentResult(
  client: OllamaTextClient,
  toolResult: ChatToolResult,
  userMessage: string,
  recentContext: string,
  systemPrompt: string,
): Promise<string> {
  // For simple responses, skip the LLM presentation layer
  if (!toolResult.output && toolResult.summary.length < 500) {
    return toolResult.summary;
  }

  // For complex responses, let the LLM present conversationally
  const prompt = [
    'User asked: ' + userMessage,
    '',
    'Recent conversation:',
    recentContext,
    '',
    'Command result:',
    toolResult.summary,
    ...(toolResult.output ? ['', 'Generated content (show key parts, not full YAML):', toolResult.output.slice(0, 800)] : []),
    ...(toolResult.actions.length ? ['', 'Actions taken:', toolResult.actions.map(a => `  ${a.status}: ${a.command} — ${a.description}`).join('\n')] : []),
    ...(toolResult.pendingWrite ? ['', `Content ready to write to: ${toolResult.pendingWrite.suggestedPath}`] : []),
    '',
    'Present this to the user conversationally. Be concise. Show the ID and key details.',
    'If content was generated, mention they can save it.',
    'If there are actions to take, list them clearly.',
  ].join('\n');

  const result = await client.generate({ system: systemPrompt, prompt });
  if (!result.ok) {
    // Fallback to raw summary
    return toolResult.summary;
  }
  return result.text;
}

// --- Chat engine ---

export type LoadoutHistoryEntry = {
  timestamp: string;
  query: string;
  allowedSources: string[];
  profileName: string;
  snippetsSelected: number;
  droppedByBudget: number;
};

export type ChatEngine = {
  memory: ChatMemory;
  /** Last generated content available for write. */
  pendingWrite: { content: string; suggestedPath: string; label: string } | null;
  /** Last context snapshot from RAG + shaping. Available after first process() call. */
  lastContextSnapshot: ContextSnapshot | null;
  /** Last loadout routing plan. Available when loadoutEnabled and after first process() call. */
  lastLoadoutPlan: LoadoutRoutePlan | null;
  /** Rolling history of loadout routing decisions (most recent last). */
  loadoutHistory: LoadoutHistoryEntry[];
  /** Active build plan state, if any. */
  activeBuild: BuildState | null;
  /** Active tuning plan state, if any. */
  activeTuning: TuningState | null;
  /** Last balance analysis result (v1.7.0). */
  lastAnalysis: BalanceAnalysis | null;
  /** Last experiment summary (v1.8.0). */
  lastExperiment: ExperimentSummary | null;
  /** Baseline experiment for comparison (v1.8.0). */
  baselineExperiment: ExperimentSummary | null;
  /** Process a user message and return the assistant response. */
  process: (message: string) => Promise<string>;
  /** Execute the next pending build step. Returns formatted result. */
  executeBuildStep: () => Promise<string>;
  /** Execute all remaining build steps. Returns formatted result. */
  executeAllBuildSteps: () => Promise<string>;
  /** Execute the next pending tuning step. Returns formatted result. */
  executeTuningStep: () => Promise<string>;
  /** Execute all remaining tuning steps. Returns formatted result. */
  executeAllTuningSteps: () => Promise<string>;
};

export type ChatEngineOptions = {
  client: OllamaTextClient;
  projectRoot: string;
  maxMemory?: number;
  /** If true, skip LLM presentation (return raw tool output). Useful for testing. */
  rawMode?: boolean;
  /** Enable RAG retrieval from project files. Default true. */
  ragEnabled?: boolean;
  /** Enable webfetch for explicit URL requests. Default false. */
  webfetchEnabled?: boolean;
  /** Enable loadout-guided context routing (requires @mcptoolshop/ai-loadout). Default false. */
  loadoutEnabled?: boolean;
  /** Override the personality profile. */
  profile?: PersonalityProfile;
};

export function createChatEngine(options: ChatEngineOptions): ChatEngine {
  const {
    client, projectRoot, maxMemory = 50, rawMode = false,
    ragEnabled = true, webfetchEnabled = false, loadoutEnabled = false,
    profile = WORLDBUILDER_PROFILE,
  } = options;
  const memory = createChatMemory(maxMemory, null);
  let pendingWrite: { content: string; suggestedPath: string; label: string } | null = null;
  let lastContextSnapshot: ContextSnapshot | null = null;
  let lastLoadoutPlan: LoadoutRoutePlan | null = null;
  const loadoutHistory: LoadoutHistoryEntry[] = [];
  let activeBuild: BuildState | null = null;
  let activeTuning: TuningState | null = null;
  let lastAnalysis: BalanceAnalysis | null = null;
  let lastExperiment: ExperimentSummary | null = null;
  let baselineExperiment: ExperimentSummary | null = null;

  async function process(userMessage: string): Promise<string> {
    const now = new Date().toISOString();

    // Record user message
    addMessage(memory, { role: 'user', content: userMessage, timestamp: now });

    // Load current session state
    const session = await loadSession(projectRoot);
    const sessionCtx = session ? renderSessionContext(session) : undefined;
    if (session && !memory.sessionName) {
      memory.sessionName = session.name;
    }

    // Check for confirmation of pending write
    if (pendingWrite && isConfirmation(userMessage)) {
      return await handleConfirmWrite(session, now);
    }
    if (pendingWrite && isRejection(userMessage)) {
      pendingWrite = null;
      const msg = 'Write cancelled.';
      addMessage(memory, { role: 'assistant', content: msg, timestamp: new Date().toISOString() });
      return msg;
    }

    // Handle explicit webfetch requests
    if (webfetchEnabled) {
      const fetchUrl = extractFetchUrl(userMessage);
      if (fetchUrl) {
        return await handleWebfetch(fetchUrl, session);
      }
    }

    // Classify intent
    const classification = await classifyIntent(client, userMessage);

    // Select personality profile for this intent (moved earlier for routing)
    const intentProfile = rawMode ? profile : getProfileForIntent(classification.intent);

    // Loadout routing — pre-retrieval source gating (optional)
    let loadoutPlan: LoadoutRoutePlan | null = null;
    if (loadoutEnabled && ragEnabled) {
      const taskString = buildTaskString(userMessage, classification.intent, session, intentProfile);
      loadoutPlan = await routeContext(taskString, projectRoot, intentProfile);
      lastLoadoutPlan = loadoutPlan;
      if (loadoutPlan) {
        loadoutHistory.push({
          timestamp: now,
          query: userMessage.length > 80 ? userMessage.slice(0, 80) + '…' : userMessage,
          allowedSources: loadoutPlan.allowedSources,
          profileName: intentProfile.name,
          snippetsSelected: 0, // updated after retrieval
          droppedByBudget: 0,
        });
        // Keep max 20 entries
        if (loadoutHistory.length > 20) loadoutHistory.shift();
      }
    }

    // RAG retrieval — ground chat in project context
    let shapedContextStr = '';
    if (ragEnabled) {
      const keywords = extractKeywords(userMessage);
      const ragResult = await retrieve(
        {
          userMessage,
          maxSnippets: 6,
          maxChars: 4000,
          allowedSources: loadoutPlan?.active ? loadoutPlan.allowedSources : undefined,
        },
        session,
        projectRoot,
      );

      // Record which loadout entries were used for observability
      if (loadoutPlan?.active && loadoutPlan.preload.length > 0) {
        await recordContextLoads(loadoutPlan.preload, projectRoot);
      }

      const shaped = shapeMemory({
        session,
        ragSnippets: ragResult.snippets,
        maxChars: 4000,
        includeSessionBaseline: true,
      });
      shapedContextStr = formatShapedContext(shaped);

      // Backfill loadout history with actual retrieval stats
      if (loadoutHistory.length > 0 && loadoutPlan) {
        const last = loadoutHistory[loadoutHistory.length - 1];
        last.snippetsSelected = ragResult.snippets.length;
        last.droppedByBudget = ragResult.droppedByBudget;
      }

      // Build context snapshot for /context and /sources commands
      const snapshotProfile = rawMode ? profile : getProfileForIntent(classification.intent);
      lastContextSnapshot = buildContextSnapshot({
        query: userMessage,
        keywords,
        retrievalResult: ragResult,
        shapedContext: shaped,
        profile: snapshotProfile,
        intentForProfile: classification.intent,
        retrievalBudget: 4000,
        shapingBudget: 4000,
        loadoutPlan: loadoutPlan ?? undefined,
        loadoutHistory,
        openIssueCount: session?.issues.filter(i => i.status === 'open').length ?? 0,
      });
    }

    // Build system prompt with shaped context
    const systemPrompt = buildSystemPrompt({
      profile: intentProfile,
      projectMemory: shapedContextStr || undefined,
      recentConversation: getRecentContext(memory, 4),
    });

    // Find tool
    const tool = findToolForIntent(classification.intent);
    if (!tool) {
      const msg = classification.intent === 'unknown'
        ? "I'm not sure what you're asking. Could you rephrase, or type \"help\" to see what I can do?"
        : `I understand you want to ${classification.intent.replace(/_/g, ' ')}, but I don't have a tool for that yet.`;
      addMessage(memory, { role: 'assistant', content: msg, timestamp: new Date().toISOString() });
      return msg;
    }

    // Merge params: intent-extracted + any pending context
    const params = { ...classification.params };
    if (pendingWrite && !params.content) {
      params.content = pendingWrite.content;
    }
    if (pendingWrite && !params.targetPath) {
      params.targetPath = pendingWrite.suggestedPath;
    }

    // Inject shaped context into session context for tools that use it
    const enrichedSessionCtx = shapedContextStr
      ? [sessionCtx ?? '', '', shapedContextStr].join('\n').trim()
      : sessionCtx;

    // Execute tool
    const toolResult = await tool.execute({
      client,
      session,
      sessionContext: enrichedSessionCtx,
      projectRoot,
      params,
      userMessage,
      engineState: { lastAnalysis, lastExperiment, baselineExperiment, activeBuild, activeTuning },
    });

    // Track pending write from tool result
    if (toolResult.pendingWrite) {
      pendingWrite = toolResult.pendingWrite;
    }

    // Capture balance analysis result (v1.7.0: enables operational tuning)
    if (classification.intent === 'analyze_balance' && toolResult.ok && toolResult.output) {
      try {
        lastAnalysis = JSON.parse(toolResult.output) as BalanceAnalysis;
      } catch { /* ignore */ }
    }

    // Capture build plan if the build tool generated one
    if (classification.intent === 'build_goal' && toolResult.ok && toolResult.output) {
      try {
        const plan = JSON.parse(toolResult.output) as BuildPlan;
        activeBuild = createBuildState(plan);
      } catch { /* output wasn't valid plan JSON — ignore */ }
    }

    // Capture tuning plan if the tune tool generated one
    // v1.7.0: use operational plan when prior analysis is available
    if (classification.intent === 'tune_goal' && toolResult.ok && toolResult.output) {
      try {
        const rawPlan = JSON.parse(toolResult.output) as TuningPlan;
        const plan = lastAnalysis
          ? generateOperationalPlan(rawPlan.goal, session, lastAnalysis)
          : rawPlan;
        activeTuning = createTuningState(plan);
      } catch { /* output wasn't valid plan JSON — ignore */ }
    }

    // Capture experiment summary/plan (v1.8.0)
    if (
      (classification.intent === 'experiment_run' || classification.intent === 'experiment_compare')
      && toolResult.ok && toolResult.output
    ) {
      try {
        const parsed = JSON.parse(toolResult.output);
        if (parsed.spec && parsed.runs) {
          // It's an ExperimentSummary
          if (lastExperiment) {
            baselineExperiment = lastExperiment;
          }
          lastExperiment = parsed as ExperimentSummary;
        }
      } catch { /* ignore */ }
    }

    // Apply session events
    if (session && toolResult.sessionEvents) {
      for (const event of toolResult.sessionEvents) {
        recordEvent(session, event.kind, event.detail);
      }
      await saveSession(projectRoot, session);
    }

    // Present result
    let response: string;
    if (rawMode) {
      const parts = [toolResult.summary];
      if (toolResult.output) parts.push('\n---\n' + toolResult.output);
      response = parts.join('\n');
    } else {
      response = await presentResult(
        client, toolResult, userMessage, getRecentContext(memory), systemPrompt,
      );
    }

    // Show pending write notice
    if (toolResult.pendingWrite) {
      response += `\n\nContent ready to save to ${toolResult.pendingWrite.suggestedPath}. Say "yes" to write, or "write to <path>" to choose a different location.`;
    }

    // Record assistant message
    addMessage(memory, {
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
      actions: toolResult.actions,
    });

    return response;
  }

  async function handleConfirmWrite(session: DesignSession | null, _now: string): Promise<string> {
    if (!pendingWrite) return 'Nothing to write.';
    const { content, suggestedPath, label } = pendingWrite;

    // Use apply-preview's confirmed write
    const { applyConfirmed } = await import('./apply-preview.js');
    const msg = await applyConfirmed({ content, targetPath: suggestedPath, label });

    if (session) {
      recordEvent(session, 'content_applied', suggestedPath);
      await saveSession(projectRoot, session);
    }

    pendingWrite = null;
    const response = msg;
    addMessage(memory, { role: 'assistant', content: response, timestamp: new Date().toISOString() });
    return response;
  }

  async function handleWebfetch(url: string, session: DesignSession | null): Promise<string> {
    const result = await webfetch(url);
    let response: string;
    if (!result.ok) {
      response = `Fetch failed for ${url}: ${result.error}`;
    } else {
      response = formatWebfetchForPrompt(result);
    }
    addMessage(memory, {
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
      actions: [{
        command: 'webfetch',
        description: `Fetch external URL: ${url}`,
        requiresConfirmation: false,
        status: result.ok ? 'executed' : 'failed',
        result: result.ok ? `${result.title} (${result.truncatedTo} chars)` : result.error,
      }],
    });
    return response;
  }

  // --- Build execution ---

  async function executeBuildStep(): Promise<string> {
    if (!activeBuild) return 'No active build. Use "build <goal>" to create one.';

    const step = nextPendingStep(activeBuild);
    if (!step) {
      if (isBuildComplete(activeBuild)) {
        finalizeBuild(activeBuild);
        const session = await loadSession(projectRoot);
        const diag = buildDiagnostics(activeBuild, session);
        if (session) {
          recordEvent(session, 'build_plan_completed', `Build completed: ${activeBuild.plan.goal}`);
          await saveSession(projectRoot, session);
        }
        return formatBuildStatus(activeBuild) + '\n\n' + formatBuildDiagnostics(diag);
      }
      return 'No pending steps.';
    }

    activeBuild.status = 'executing';

    // Resolve tool
    const tool = findToolForIntent(step.intent);
    if (!tool) {
      markStepFailed(activeBuild, step.id, `No tool for intent: ${step.intent}`);
      const session = await loadSession(projectRoot);
      if (session) {
        recordEvent(session, 'build_step_failed', `${step.command}: no tool`);
        await saveSession(projectRoot, session);
      }
      return `Step ${step.id} failed: no tool for ${step.intent}`;
    }

    // Prepare params — inject accumulated content for critique steps
    const params = { ...step.params };
    if (step.usePriorContent && activeBuild.generatedContent.length > 0) {
      params.content = activeBuild.generatedContent.join('\n---\n');
    }

    // Load session for execution
    const session = await loadSession(projectRoot);
    const sessionCtx = session ? renderSessionContext(session) : undefined;

    const toolResult = await tool.execute({
      client, session, sessionContext: sessionCtx,
      projectRoot, params, userMessage: step.description,
      engineState: { lastAnalysis, lastExperiment, baselineExperiment, activeBuild, activeTuning },
    });

    if (toolResult.ok) {
      markStepExecuted(activeBuild, step.id, toolResult.summary, toolResult.output);
      if (session) {
        recordEvent(session, 'build_step_executed', `${step.command}: ${step.description}`);
        if (toolResult.sessionEvents) {
          for (const event of toolResult.sessionEvents) {
            recordEvent(session, event.kind, event.detail);
          }
        }
        await saveSession(projectRoot, session);
      }
    } else {
      markStepFailed(activeBuild, step.id, toolResult.summary);
      if (session) {
        recordEvent(session, 'build_step_failed', `${step.command}: ${toolResult.summary}`);
        await saveSession(projectRoot, session);
      }
    }

    // Check if build is now complete
    if (isBuildComplete(activeBuild)) {
      finalizeBuild(activeBuild);
      if (session) {
        recordEvent(session, 'build_plan_completed', `Build: ${activeBuild.plan.goal}`);
        await saveSession(projectRoot, session);
      }
    }

    const icon = toolResult.ok ? '●' : '✗';
    return `${icon} Step ${step.id}: ${step.description}\n${toolResult.summary}`;
  }

  async function executeAllBuildSteps(): Promise<string> {
    if (!activeBuild) return 'No active build. Use "build <goal>" to create one.';

    const results: string[] = [];
    const maxSteps = activeBuild.plan.steps.length;
    let executed = 0;

    while (executed < maxSteps) {
      const step = nextPendingStep(activeBuild);
      if (!step) break;
      const result = await executeBuildStep();
      results.push(result);
      executed++;
    }

    if (results.length === 0) {
      return 'No pending steps to execute.';
    }

    const session = await loadSession(projectRoot);
    const diag = buildDiagnostics(activeBuild, session);

    return results.join('\n\n') + '\n\n' + formatBuildDiagnostics(diag);
  }

  // --- Tuning execution ---

  async function executeTuningStep(): Promise<string> {
    if (!activeTuning) return 'No active tuning plan. Use "tune <goal>" to create one.';

    const step = nextPendingTuningStep(activeTuning);
    if (!step) {
      if (isTuningComplete(activeTuning)) {
        finalizeTuning(activeTuning);
        const session = await loadSession(projectRoot);
        if (session) {
          recordEvent(session, 'tune_plan_completed', `Tuning completed: ${activeTuning.plan.goal}`);
          await saveSession(projectRoot, session);
        }
        return formatTuningStatus(activeTuning);
      }
      return 'No pending tuning steps.';
    }

    activeTuning.status = 'executing';

    const tool = findToolForIntent(step.intent);
    if (!tool) {
      markTuningStepFailed(activeTuning, step.id, `No tool for intent: ${step.intent}`);
      const session = await loadSession(projectRoot);
      if (session) {
        recordEvent(session, 'tune_step_failed', `${step.command}: no tool`);
        await saveSession(projectRoot, session);
      }
      return `Step ${step.id} failed: no tool for ${step.intent}`;
    }

    const session = await loadSession(projectRoot);
    const sessionCtx = session ? renderSessionContext(session) : undefined;

    const toolResult = await tool.execute({
      client, session, sessionContext: sessionCtx,
      projectRoot, params: step.params, userMessage: step.description,
      engineState: { lastAnalysis, lastExperiment, baselineExperiment, activeBuild, activeTuning },
    });

    if (toolResult.ok) {
      markTuningStepExecuted(activeTuning, step.id, toolResult.summary);
      if (session) {
        recordEvent(session, 'tune_step_executed', `${step.command}: ${step.description}`);
        if (toolResult.sessionEvents) {
          for (const event of toolResult.sessionEvents) {
            recordEvent(session, event.kind, event.detail);
          }
        }
        await saveSession(projectRoot, session);
      }
    } else {
      markTuningStepFailed(activeTuning, step.id, toolResult.summary);
      if (session) {
        recordEvent(session, 'tune_step_failed', `${step.command}: ${toolResult.summary}`);
        await saveSession(projectRoot, session);
      }
    }

    if (isTuningComplete(activeTuning)) {
      finalizeTuning(activeTuning);
      if (session) {
        recordEvent(session, 'tune_plan_completed', `Tuning: ${activeTuning.plan.goal}`);
        await saveSession(projectRoot, session);
      }
    }

    const icon = toolResult.ok ? '●' : '✗';
    return `${icon} Step ${step.id}: ${step.description}\n${toolResult.summary}`;
  }

  async function executeAllTuningSteps(): Promise<string> {
    if (!activeTuning) return 'No active tuning plan. Use "tune <goal>" to create one.';

    const results: string[] = [];
    const maxSteps = activeTuning.plan.steps.length;
    let executedCount = 0;

    while (executedCount < maxSteps) {
      const step = nextPendingTuningStep(activeTuning);
      if (!step) break;
      const result = await executeTuningStep();
      results.push(result);
      executedCount++;
    }

    if (results.length === 0) {
      return 'No pending tuning steps to execute.';
    }

    return results.join('\n\n') + '\n\n' + formatTuningStatus(activeTuning);
  }

  return {
    memory,
    get pendingWrite() { return pendingWrite; },
    set pendingWrite(v) { pendingWrite = v; },
    get lastContextSnapshot() { return lastContextSnapshot; },
    get lastLoadoutPlan() { return lastLoadoutPlan; },
    loadoutHistory,
    get activeBuild() { return activeBuild; },
    set activeBuild(v) { activeBuild = v; },
    get activeTuning() { return activeTuning; },
    set activeTuning(v) { activeTuning = v; },
    get lastAnalysis() { return lastAnalysis; },
    set lastAnalysis(v) { lastAnalysis = v; },
    get lastExperiment() { return lastExperiment; },
    set lastExperiment(v) { lastExperiment = v; },
    get baselineExperiment() { return baselineExperiment; },
    set baselineExperiment(v) { baselineExperiment = v; },
    process,
    executeBuildStep,
    executeAllBuildSteps,
    executeTuningStep,
    executeAllTuningSteps,
  };
}

// --- Helpers ---

function isConfirmation(msg: string): boolean {
  const normalized = msg.trim().toLowerCase();
  return /^(yes|y|confirm|ok|do it|go ahead|proceed|write it|save it|apply)$/i.test(normalized);
}

function isRejection(msg: string): boolean {
  const normalized = msg.trim().toLowerCase();
  return /^(no|n|cancel|nevermind|never mind|nope|skip|don't|abort)$/i.test(normalized);
}

function extractFetchUrl(message: string): string | null {
  const urlMatch = message.match(/https?:\/\/[^\s)>\]]+/i);
  if (!urlMatch) return null;
  const triggers = /\b(fetch|look at|read|grab|get|check|open|visit|browse|pull)\b/i;
  if (triggers.test(message)) return urlMatch[0];
  return null;
}
