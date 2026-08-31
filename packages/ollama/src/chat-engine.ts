// Chat engine — the core orchestrator.
// Routes user messages through: intent → RAG → shape memory → tool → present.
// Manages bounded conversational memory and pending writes.
// Never invents hidden state or writes without explicit consent.
// v1.1: integrates RAG retrieval, memory shaping, personality profiles, webfetch.
// v1.2: adds context snapshots, planner integration, recommendation awareness.

import type { OllamaTextClient, GenerateOptions } from './client.js';
import type {
  ChatMessage, ChatConfig, ChatMemory, ChatToolResult,
  PlannedAction, DEFAULT_CHAT_CONFIG, StagedWriteEntry,
} from './chat-types.js';
import type { DesignSession } from './session.js';
import {
  tryLoadSession, saveSession, renderSessionContext,
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
import { webfetch, formatWebfetchForPrompt } from './chat-webfetch.js';
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
import type { ExperimentSummary, ReplayProducer } from './chat-experiments.js';
import { createDefaultReplayProducer } from './replay-producer.js';

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
  generateOptions?: GenerateOptions,
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

  const result = await client.generate({ system: systemPrompt, prompt }, generateOptions);
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

/**
 * Per-step progress for `executeAllBuildSteps` / `executeAllTuningSteps`
 * (v2.6 Stage C F-4be7a3c2). Without it, an N-step batch is N model
 * generations of total stdout silence: the shell prints one "Executing all
 * remaining steps..." line and nothing more until the whole batch returns.
 * Mirrors the macros.ts ProgressCallback pattern already wired into the CLI.
 */
export type BatchStepProgress = {
  /** 1-based position of this step within the current batch run. */
  index: number;
  /** Steps pending when the batch started (upper bound for `index`). */
  total: number;
  /** The executed step's plan ID. */
  stepId: number;
  /** The executed step's human-readable description. */
  description: string;
  /** Whether the step succeeded. */
  ok: boolean;
  /** The formatted per-step result block (same text the batch summary uses). */
  result: string;
};

export type BatchStepCallback = (progress: BatchStepProgress) => void;

export type ChatEngine = {
  client: OllamaTextClient;
  memory: ChatMemory;
  /** Last generated content available for write. */
  pendingWrite: { content: string; suggestedPath: string; label: string; previewShown?: boolean } | null;
  /**
   * Batched staged writes awaiting one combined consent (F-591fae03).
   * Populated by executeBuildStep's flush gate (right before the emit-pack
   * tail step would run) and kept in sync by executeBuildStep/executeTuningStep
   * whenever their BuildState/TuningState's `stagedWrites` pool is non-empty.
   * Never mixed with the singular `pendingWrite`, which stays reserved for the
   * plain (non-guided) chat scaffold flow.
   */
  pendingWriteBatch: StagedWriteEntry[] | null;
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
  /** Replay producer used by /experiment-run (injectable; default ships in-package). */
  replayProducer: ReplayProducer;
  /** Process a user message and return the assistant response. */
  process: (message: string, options?: ChatProcessOptions) => Promise<string>;
  /** Restore the last content_applied backup. Failed undo leaves pendingWrite. */
  undoLastWrite: () => Promise<string>;
  /** Execute the next pending build step. Returns formatted result. */
  executeBuildStep: () => Promise<string>;
  /**
   * Execute all remaining build steps. Returns formatted result.
   * `onStep` fires as each step completes (liveness for long batches);
   * the batch stops early after two consecutive identical failures.
   */
  executeAllBuildSteps: (onStep?: BatchStepCallback) => Promise<string>;
  /** Execute the next pending tuning step. Returns formatted result. */
  executeTuningStep: () => Promise<string>;
  /**
   * Execute all remaining tuning steps. Returns formatted result.
   * Same `onStep` liveness + early-abort contract as executeAllBuildSteps.
   */
  executeAllTuningSteps: (onStep?: BatchStepCallback) => Promise<string>;
};

export type ChatProcessOptions = {
  signal?: AbortSignal;
  onToken?: (token: string) => void;
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
  /** Called with each streamed token from presentResult / generate. */
  onToken?: (token: string) => void;
  /** Inject a ReplayProducer; default runs the in-package Engine producer. */
  replayProducer?: ReplayProducer;
};

function bindClientSignal(client: OllamaTextClient, signal?: AbortSignal): OllamaTextClient {
  if (!signal) return client;
  return {
    generate: (input, opts) => client.generate(input, { ...opts, signal: opts?.signal ?? signal }),
    generateStream: client.generateStream
      ? (input) => client.generateStream!({ ...input, signal: input.signal ?? signal })
      : undefined,
    listModels: client.listModels?.bind(client),
    version: client.version?.bind(client),
  };
}

export function createChatEngine(options: ChatEngineOptions): ChatEngine {
  const {
    client, projectRoot, maxMemory = 50, rawMode = false,
    ragEnabled = true, webfetchEnabled = false, loadoutEnabled = false,
    profile = WORLDBUILDER_PROFILE,
    onToken: defaultOnToken,
    replayProducer: injectedProducer,
  } = options;
  const replayProducer = injectedProducer ?? createDefaultReplayProducer({ projectRoot });
  const memory = createChatMemory(maxMemory, null);
  let pendingWrite: { content: string; suggestedPath: string; label: string; previewShown?: boolean } | null = null;
  let pendingWriteBatch: StagedWriteEntry[] | null = null;
  let pendingWriteBatchPreviewShown = false;
  /**
   * Which flow (build|tuning) currently owns `pendingWriteBatch` (F-71e4a9c3).
   * Without this, /build and /tune's independent stagedWrites pools shared
   * ONE reference into "the" confirmable batch: whichever flow finished a
   * step last simply reassigned pendingWriteBatch, silently orphaning the
   * other flow's still-real, still-unwritten stagedWrites -- and confirm/
   * reject then acted on BOTH pools unconditionally, actually destroying
   * whichever one wasn't visible. Null exactly when pendingWriteBatch is.
   */
  let pendingWriteBatchOwner: 'build' | 'tuning' | null = null;
  let lastContextSnapshot: ContextSnapshot | null = null;
  let lastLoadoutPlan: LoadoutRoutePlan | null = null;
  const loadoutHistory: LoadoutHistoryEntry[] = [];
  let activeBuild: BuildState | null = null;
  let activeTuning: TuningState | null = null;
  let lastAnalysis: BalanceAnalysis | null = null;
  let lastExperiment: ExperimentSummary | null = null;
  let baselineExperiment: ExperimentSummary | null = null;

  /**
   * Recompute `pendingWriteBatch` from a BuildState/TuningState's current
   * `stagedWrites` pool (F-591fae03). Called both at the flush gate (the
   * batch becomes confirmable for the first time) and once a build/tuning
   * plan completes with content still staged (a step's own staged write —
   * most notably emit-pack's own result once the gate has let it run for
   * real — would otherwise have no further step left to gate on, stranding
   * it with no way to confirm). Resets the preview flag: a freshly
   * (re)computed batch always needs its own preview pass.
   *
   * F-71e4a9c3: tags the batch with its owning flow, and REFUSES to
   * overwrite an unconfirmed batch already owned by the OTHER flow — the
   * other flow's stagedWrites stays fully intact and simply waits its turn
   * (surfaced once the current batch is confirmed/declined, or the next
   * time this flow's own gate/completion re-checks). Returns null on
   * refusal so the caller can say something honest instead of silently
   * dropping the content or clobbering the visible consent.
   */
  function refreshPendingWriteBatch(
    stagedWrites: Record<string, StagedWriteEntry>,
    owner: 'build' | 'tuning',
  ): StagedWriteEntry[] | null {
    if (pendingWriteBatch && pendingWriteBatchOwner && pendingWriteBatchOwner !== owner) {
      return null;
    }
    const entries = Object.values(stagedWrites);
    pendingWriteBatch = entries.length > 0 ? entries : null;
    pendingWriteBatchOwner = pendingWriteBatch ? owner : null;
    pendingWriteBatchPreviewShown = false;
    return pendingWriteBatch;
  }

  async function process(userMessage: string, processOptions?: ChatProcessOptions): Promise<string> {
    const now = new Date().toISOString();
    const signal = processOptions?.signal;
    const onToken = processOptions?.onToken ?? defaultOnToken;
    const boundClient = bindClientSignal(client, signal);

    // Record user message
    addMessage(memory, { role: 'user', content: userMessage, timestamp: now });

    // Load current session state
    const session = await tryLoadSession(projectRoot);
    const sessionCtx = session ? renderSessionContext(session) : undefined;
    if (session && !memory.sessionName) {
      memory.sessionName = session.name;
    }

    // Check for confirmation of pending write. A batch (F-591fae03) takes
    // priority over the singular slot when both happen to be set — the batch
    // is the more deliberate, structured flow (an active build/tuning plan),
    // while the singular pendingWrite is the plain-chat scaffold fallback.
    if ((pendingWrite || pendingWriteBatch) && isConfirmation(userMessage)) {
      return pendingWriteBatch
        ? await handleConfirmBatchWrite(session, now)
        : await handleConfirmWrite(session, now);
    }
    if ((pendingWrite || pendingWriteBatch) && isRejection(userMessage)) {
      // Decline discards ALL staged content — no per-file pick in v1 (ruled).
      // The emit-pack step (if gated) stays 'pending', visibly incomplete in
      // /status, so nothing is silently lost or silently assumed-done.
      pendingWrite = null;
      // F-71e4a9c3: clear ONLY the pool that actually produced the batch
      // being declined — the other flow's stagedWrites (if any) was never
      // part of this consent and must survive untouched, not get destroyed
      // by an unconditional dual-clear.
      if (pendingWriteBatch) {
        if (pendingWriteBatchOwner === 'build' && activeBuild) activeBuild.stagedWrites = {};
        if (pendingWriteBatchOwner === 'tuning' && activeTuning) activeTuning.stagedWrites = {};
      }
      pendingWriteBatch = null;
      pendingWriteBatchOwner = null;
      pendingWriteBatchPreviewShown = false;
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
    const classification = await classifyIntent(boundClient, userMessage);

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
      // Distinguish "the classifier could not RUN" from "the message is
      // genuinely unclassifiable" (v2.6 Stage C F-c1a55f01). When the LLM was
      // unreachable, the #1 cause is the Ollama daemon not running / model not
      // pulled — telling the user to rephrase sends them chasing their own
      // phrasing through retry cycles. Surface the client's curated error
      // (offline hint / pull command) verbatim instead.
      const msg = classification.intent === 'unknown'
        ? (classification.llmError
          ? `I couldn't reach the language model to interpret that message — this isn't a problem with your phrasing. ${classification.llmError}`
          : "I'm not sure what you're asking. Could you rephrase, or type \"help\" to see what I can do?")
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
      client: boundClient,
      session,
      sessionContext: enrichedSessionCtx,
      projectRoot,
      params,
      userMessage,
      replayProducer,
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

    // Notices for plan-capture failures — surfaced to the user instead of being
    // swallowed silently (a dropped plan would otherwise look like success).
    const planNotices: string[] = [];

    // Capture build plan if the build tool generated one
    if (classification.intent === 'build_goal' && toolResult.ok && toolResult.output) {
      const { value: plan, notice } = capturePlanFromOutput<BuildPlan>(toolResult.output, 'build plan');
      if (plan) {
        activeBuild = createBuildState(plan);
      } else if (notice) {
        planNotices.push(notice);
      }
    }

    // Capture tuning plan if the tune tool generated one
    // v1.7.0: use operational plan when prior analysis is available
    if (classification.intent === 'tune_goal' && toolResult.ok && toolResult.output) {
      const { value: rawPlan, notice } = capturePlanFromOutput<TuningPlan>(toolResult.output, 'tuning plan');
      if (rawPlan) {
        const plan = lastAnalysis
          ? generateOperationalPlan(rawPlan.goal, session, lastAnalysis)
          : rawPlan;
        activeTuning = createTuningState(plan);
      } else if (notice) {
        planNotices.push(notice);
      }
    }

    // Capture experiment summary/plan (v1.8.0)
    if (
      (classification.intent === 'experiment_run' || classification.intent === 'experiment_compare')
      && toolResult.ok && toolResult.output
    ) {
      const { value: parsed, notice } = capturePlanFromOutput<{ spec?: unknown; runs?: unknown }>(
        toolResult.output, 'experiment summary',
      );
      if (parsed) {
        if (parsed.spec && parsed.runs) {
          // It's an ExperimentSummary
          if (lastExperiment) {
            baselineExperiment = lastExperiment;
          }
          lastExperiment = parsed as ExperimentSummary;
        }
        // A well-formed-but-not-a-summary payload (e.g. a plan) is expected here
        // and intentionally produces no notice.
      } else if (notice) {
        planNotices.push(notice);
      }
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
        boundClient, toolResult, userMessage, getRecentContext(memory), systemPrompt,
        { signal, onToken },
      );
    }

    // Show pending write notice
    if (toolResult.pendingWrite) {
      response += `\n\nContent ready to save to ${toolResult.pendingWrite.suggestedPath}. Say "yes" to write, or "write to <path>" to choose a different location.`;
    }

    // Surface any plan-capture failures so they aren't swallowed silently.
    for (const notice of planNotices) {
      response += `\n\n${notice}`;
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
    const { content, suggestedPath, label, previewShown } = pendingWrite;

    const { applyConfirmed, generatePreview, formatContentAppliedDetail } = await import('./apply-preview.js');

    // Scaffold/improve stage a write without a diff. Show generatePreview
    // once before clobbering; apply-content already did this.
    if (!previewShown) {
      const preview = await generatePreview({ content, targetPath: suggestedPath, label, projectRoot });
      pendingWrite = { content, suggestedPath, label, previewShown: true };
      const response = `${preview.preview}\n\nSay "yes" to write, or "no" to cancel.`;
      addMessage(memory, { role: 'assistant', content: response, timestamp: new Date().toISOString() });
      return response;
    }

    // Use apply-preview's confirmed write. Pass projectRoot so the path-escape
    // confinement uses the configured sandbox, not process.cwd().
    const result = await applyConfirmed({ content, targetPath: suggestedPath, label, projectRoot });

    if (!result.ok) {
      // Keep pendingWrite so the user can retry a safer path. Do not record
      // content_applied — the write never landed.
      const response = result.error;
      addMessage(memory, { role: 'assistant', content: response, timestamp: new Date().toISOString() });
      return response;
    }

    if (session) {
      recordEvent(session, 'content_applied', formatContentAppliedDetail(result));
      await saveSession(projectRoot, session);
    }

    pendingWrite = null;
    const response = `Written: ${result.path} (${result.bytes} bytes)`;
    addMessage(memory, { role: 'assistant', content: response, timestamp: new Date().toISOString() });
    return response;
  }

  /**
   * Sibling to handleConfirmWrite for a batch of staged writes (F-591fae03).
   * Same two-phase shape: first "yes" previews every file (generatePreview,
   * UNCHANGED, looped); second "yes" applies every file (applyConfirmed,
   * UNCHANGED, looped) and records one content_applied session event PER
   * file — undoLastWrite's existing newest-first restore (apply-preview.ts
   * undoLastApply, UNCHANGED) already unwinds the batch one file at a time
   * with zero changes needed there.
   */
  async function handleConfirmBatchWrite(session: DesignSession | null, _now: string): Promise<string> {
    if (!pendingWriteBatch || pendingWriteBatch.length === 0) return 'Nothing to write.';
    const entries = pendingWriteBatch;

    const { applyConfirmed, generatePreview, formatContentAppliedDetail } = await import('./apply-preview.js');

    if (!pendingWriteBatchPreviewShown) {
      const previews: string[] = [];
      for (const entry of entries) {
        const preview = await generatePreview({
          content: entry.content, targetPath: entry.suggestedPath, label: entry.label, projectRoot,
        });
        previews.push(preview.preview);
      }
      pendingWriteBatchPreviewShown = true;
      const response = `${previews.join('\n\n')}\n\nSay "yes" to write all, or "no" to discard all.`;
      addMessage(memory, { role: 'assistant', content: response, timestamp: new Date().toISOString() });
      return response;
    }

    // Apply every staged file. On ANY failure, keep the whole batch staged
    // (never partially clear it) so a retry replays cleanly — mirrors
    // handleConfirmWrite's single-file contract: never record content_applied
    // for a write that never landed, never drop what's staged on failure.
    const lines: string[] = [];
    let allOk = true;
    for (const entry of entries) {
      const result = await applyConfirmed({
        content: entry.content, targetPath: entry.suggestedPath, label: entry.label, projectRoot,
      });
      if (!result.ok) {
        allOk = false;
        lines.push(result.error);
        continue;
      }
      lines.push(`Written: ${result.path} (${result.bytes} bytes)`);
      if (session) {
        recordEvent(session, 'content_applied', formatContentAppliedDetail(result));
      }
    }

    if (!allOk) {
      const response = lines.join('\n');
      addMessage(memory, { role: 'assistant', content: response, timestamp: new Date().toISOString() });
      return response;
    }

    if (session) {
      await saveSession(projectRoot, session);
    }

    // F-71e4a9c3: clear ONLY the pool that produced this confirmed batch —
    // never both unconditionally. The other flow's stagedWrites (if any)
    // was never part of this consent and must survive to be surfaced later.
    if (pendingWriteBatchOwner === 'build' && activeBuild) activeBuild.stagedWrites = {};
    if (pendingWriteBatchOwner === 'tuning' && activeTuning) activeTuning.stagedWrites = {};
    pendingWriteBatch = null;
    pendingWriteBatchOwner = null;
    pendingWriteBatchPreviewShown = false;

    const response = lines.join('\n');
    addMessage(memory, { role: 'assistant', content: response, timestamp: new Date().toISOString() });
    return response;
  }

  async function undoLastWrite(): Promise<string> {
    const session = await tryLoadSession(projectRoot);
    const { undoLastApply, formatUndoResultDetail } = await import('./apply-preview.js');
    const history = session?.history ?? [];
    const result = await undoLastApply({ history, projectRoot });
    if (!result.ok) {
      // Keep pendingWrite uncleared on a failed undo (F-cf6b6f85).
      const response = result.error;
      addMessage(memory, { role: 'assistant', content: response, timestamp: new Date().toISOString() });
      return response;
    }
    if (session) {
      // F-2d9f6b18: record the undo's OWN effect with the same parseable
      // shape every other content_applied event uses (never the old bespoke
      // "undo restored X" string, which a SECOND consecutive /undo could not
      // parse) so a further /undo targets a real path instead of a garbled,
      // self-referential one.
      recordEvent(session, 'content_applied', formatUndoResultDetail(result));
      await saveSession(projectRoot, session);
    }
    const response = result.deleted
      ? `Removed: ${result.path} (undid a create)`
      : `Restored: ${result.path} (${result.bytes} bytes)`;
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
        const session = await tryLoadSession(projectRoot);
        const diag = buildDiagnostics(activeBuild, session);
        if (session) {
          recordEvent(session, 'build_plan_completed', `Build completed: ${activeBuild.plan.goal}`);
          await saveSession(projectRoot, session);
        }
        // F-71e4a9c3: an earlier completion-promotion may have been refused
        // because a tuning batch was still unconfirmed at the time — retry
        // surfacing here so calling /step again after resolving that other
        // batch does not leave this build's content permanently stranded
        // with no route back to a consent prompt.
        let consentSuffix = '';
        if (Object.keys(activeBuild.stagedWrites).length > 0) {
          const batch = refreshPendingWriteBatch(activeBuild.stagedWrites, 'build');
          if (batch) {
            consentSuffix = '\n\n' + formatBatchConsent(batch, { flow: 'build', goal: activeBuild.plan.goal });
          }
        }
        return formatBuildStatus(activeBuild) + '\n\n' + formatBuildDiagnostics(diag) + consentSuffix;
      }
      return 'No pending steps.';
    }

    activeBuild.status = 'executing';

    // Resolve tool
    const tool = findToolForIntent(step.intent);
    if (!tool) {
      markStepFailed(activeBuild, step.id, `No tool for intent: ${step.intent}`);
      const session = await tryLoadSession(projectRoot);
      if (session) {
        recordEvent(session, 'build_step_failed', `${step.command}: no tool`);
        await saveSession(projectRoot, session);
      }
      return `Step ${step.id} failed: no tool for ${step.intent}`;
    }

    // F-591fae03 flush gate: emit-pack's own assembleContentPack() reads
    // ONLY the project's on-disk YAML/JSON — never this batch's in-memory
    // staged content. Block emit-pack's own execution until every staged
    // file from this batch has actually landed on disk (via a confirmed
    // handleConfirmBatchWrite), or the pack it assembles would silently omit
    // everything the batch itself just generated (the original bug). The
    // step stays 'pending' — untouched — so nextPendingStep keeps returning
    // it on every subsequent /step until stagedWrites is empty again.
    if (step.command === 'emit-pack' && Object.keys(activeBuild.stagedWrites).length > 0) {
      const batch = refreshPendingWriteBatch(activeBuild.stagedWrites, 'build');
      // F-71e4a9c3: refused when a tuning batch is already awaiting
      // confirmation — the step stays 'pending' (untouched, same as the
      // ordinary gate-closed case) so a later /step, once the other batch
      // is resolved, opens this gate for real instead of the two flows
      // silently swapping which one is visible.
      if (!batch) {
        return `${Object.keys(activeBuild.stagedWrites).length} file(s) staged for this build, but a tuning batch is awaiting confirmation first -- say "yes" or "no" to resolve it, then /step again.`;
      }
      return formatBatchConsent(batch, { flow: 'build', goal: activeBuild.plan.goal });
    }

    // Prepare params — inject accumulated content for critique steps
    const params = { ...step.params };
    if (step.usePriorContent && activeBuild.generatedContent.length > 0) {
      params.content = activeBuild.generatedContent.join('\n---\n');
    }

    // Load session for execution
    const session = await tryLoadSession(projectRoot);
    const sessionCtx = session ? renderSessionContext(session) : undefined;

    const toolResult = await tool.execute({
      client, session, sessionContext: sessionCtx,
      projectRoot, params, userMessage: step.description,
      replayProducer,
      engineState: { lastAnalysis, lastExperiment, baselineExperiment, activeBuild, activeTuning },
    });

    // F-591fae03: accumulate this step's staged write into the batch pool
    // instead of the old single shared engine slot (last-writer-wins across
    // ALL steps, not just same-path collisions — the root cause). Collision
    // (two steps stage the same suggestedPath): the later step's entry
    // replaces the map entry for that key; name both step ids in a warning
    // so a model reusing an id across two scaffold steps is diagnosable
    // instead of silently losing content.
    if (toolResult.pendingWrite) {
      const key = toolResult.pendingWrite.suggestedPath;
      const prior = activeBuild.stagedWrites[key];
      if (prior) {
        activeBuild.plan.warnings.push(
          `Step ${step.id} restaged ${key}, replacing step ${prior.sourceStepId}'s staged content -- check both steps generated distinct ids.`,
        );
      }
      activeBuild.stagedWrites[key] = {
        content: toolResult.pendingWrite.content,
        suggestedPath: key,
        label: toolResult.pendingWrite.label,
        sourceStepId: step.id,
      };
    }

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
    let consentSuffix = '';
    if (isBuildComplete(activeBuild)) {
      finalizeBuild(activeBuild);
      if (session) {
        recordEvent(session, 'build_plan_completed', `Build: ${activeBuild.plan.goal}`);
        await saveSession(projectRoot, session);
      }
      // Closes a gap the flush gate alone doesn't cover: once emit-pack
      // itself finally runs for real (the gate above now open), ITS OWN
      // result accumulates into stagedWrites the same as any step's — but
      // with no further step left to gate on, nothing would otherwise ever
      // surface it for confirmation. Surfacing it here, the moment there's
      // truly nothing left to run, means no staged content is ever stranded
      // (unless another flow's batch is already pending -- F-71e4a9c3 --
      // in which case it waits: nextPendingStep returns null from here on
      // for this build, so the "no pending step, isBuildComplete" branch
      // above retries surfacing on every subsequent /step).
      if (Object.keys(activeBuild.stagedWrites).length > 0) {
        const batch = refreshPendingWriteBatch(activeBuild.stagedWrites, 'build');
        if (batch) {
          consentSuffix = '\n\n' + formatBatchConsent(batch, { flow: 'build', goal: activeBuild.plan.goal });
        } else {
          consentSuffix = `\n\n${Object.keys(activeBuild.stagedWrites).length} file(s) staged for this build, but a tuning batch is awaiting confirmation first -- say "yes" or "no" to resolve it, then /step again.`;
        }
      }
    }

    const icon = toolResult.ok ? '●' : '✗';
    return `${icon} Step ${step.id}: ${step.description}\n${toolResult.summary}${consentSuffix}`;
  }

  async function executeAllBuildSteps(onStep?: BatchStepCallback): Promise<string> {
    if (!activeBuild) return 'No active build. Use "build <goal>" to create one.';

    const results: string[] = [];
    const maxSteps = activeBuild.plan.steps.length;
    const total = activeBuild.plan.steps.filter(s => s.status === 'pending').length;
    let executed = 0;
    // Early-abort bookkeeping (F-4be7a3c2): with the daemon down mid-build,
    // every remaining step burns its full retry cycle just to fail the same
    // way — the user waits N × (attempts + delays) to learn ONE thing. Two
    // consecutive identical failures are treated as systemic and stop the batch.
    let lastFailure: string | null = null;
    let abortNote: string | null = null;

    while (executed < maxSteps) {
      const step = nextPendingStep(activeBuild);
      if (!step) break;
      const result = await executeBuildStep();
      results.push(result);

      // F-591fae03 REQUIRED companion fix: the flush gate blocks emit-pack's
      // own execution without marking the step executed/failed — it stays
      // 'pending' so nextPendingStep keeps returning the SAME step. Without
      // this break, the while-loop would re-call executeBuildStep() on that
      // gated step forever (an infinite loop the gate itself would otherwise
      // introduce). `step` is the same object executeBuildStep mutates in
      // place, so its status reflects what just happened.
      if (step.status === 'pending') {
        break;
      }

      executed++;
      const ok = !result.startsWith('✗');
      onStep?.({
        index: executed, total,
        stepId: step.id, description: step.description,
        ok, result,
      });

      if (!ok) {
        const reason = result.slice(result.indexOf('\n') + 1);
        if (lastFailure !== null && reason === lastFailure) {
          const remaining = activeBuild.plan.steps.filter(s => s.status === 'pending').length;
          if (remaining > 0) {
            abortNote = `Stopped early: two consecutive steps failed the same way, so the remaining ${remaining} step(s) were skipped instead of repeating the failure. Fix the cause and run the build again to resume.`;
          }
          break;
        }
        lastFailure = reason;
      } else {
        lastFailure = null;
      }
    }

    if (results.length === 0) {
      return 'No pending steps to execute.';
    }

    const session = await tryLoadSession(projectRoot);
    const diag = buildDiagnostics(activeBuild, session);

    return results.join('\n\n')
      + (abortNote ? `\n\n${abortNote}` : '')
      + '\n\n' + formatBuildDiagnostics(diag);
  }

  // --- Tuning execution ---

  async function executeTuningStep(): Promise<string> {
    if (!activeTuning) return 'No active tuning plan. Use "tune <goal>" to create one.';

    const step = nextPendingTuningStep(activeTuning);
    if (!step) {
      if (isTuningComplete(activeTuning)) {
        finalizeTuning(activeTuning);
        const session = await tryLoadSession(projectRoot);
        if (session) {
          recordEvent(session, 'tune_plan_completed', `Tuning completed: ${activeTuning.plan.goal}`);
          await saveSession(projectRoot, session);
        }
        // F-71e4a9c3: mirrors executeBuildStep's identical retry — an
        // earlier completion-promotion may have been refused because a
        // build batch was still unconfirmed at the time.
        let consentSuffix = '';
        if (Object.keys(activeTuning.stagedWrites).length > 0) {
          const batch = refreshPendingWriteBatch(activeTuning.stagedWrites, 'tuning');
          if (batch) {
            consentSuffix = '\n\n' + formatBatchConsent(batch, { flow: 'tuning', goal: activeTuning.plan.goal });
          }
        }
        return formatTuningStatus(activeTuning) + consentSuffix;
      }
      return 'No pending tuning steps.';
    }

    activeTuning.status = 'executing';

    const tool = findToolForIntent(step.intent);
    if (!tool) {
      markTuningStepFailed(activeTuning, step.id, `No tool for intent: ${step.intent}`);
      const session = await tryLoadSession(projectRoot);
      if (session) {
        recordEvent(session, 'tune_step_failed', `${step.command}: no tool`);
        await saveSession(projectRoot, session);
      }
      return `Step ${step.id} failed: no tool for ${step.intent}`;
    }

    const session = await tryLoadSession(projectRoot);
    const sessionCtx = session ? renderSessionContext(session) : undefined;

    const toolResult = await tool.execute({
      client, session, sessionContext: sessionCtx,
      projectRoot, params: step.params, userMessage: step.description,
      replayProducer,
      engineState: { lastAnalysis, lastExperiment, baselineExperiment, activeBuild, activeTuning },
    });

    // F-591fae03 tuning parity (executeBuildStep's sibling — see the
    // identical accumulate above): accumulate into activeTuning.stagedWrites
    // instead of the old single shared engine slot. tuneApplyTool and every
    // other mutating tuning tool stage via pendingWrite and tell the user
    // "say yes to apply" in their own summary, so dropping it here left every
    // guided-tuning patch either unappliable, or — worse, under the OLD
    // shared-slot contract — confirmed whatever unrelated content an earlier
    // interaction had staged on that same shared slot. No flush gate needed:
    // tuning has no emit-pack-equivalent tail step that reads staged content
    // back off disk.
    if (toolResult.pendingWrite) {
      const key = toolResult.pendingWrite.suggestedPath;
      const prior = activeTuning.stagedWrites[key];
      if (prior) {
        activeTuning.plan.warnings.push(
          `Step ${step.id} restaged ${key}, replacing step ${prior.sourceStepId}'s staged content -- check both steps generated distinct ids.`,
        );
      }
      activeTuning.stagedWrites[key] = {
        content: toolResult.pendingWrite.content,
        suggestedPath: key,
        label: toolResult.pendingWrite.label,
        sourceStepId: step.id,
      };
    }

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

    let consentSuffix = '';
    if (isTuningComplete(activeTuning)) {
      finalizeTuning(activeTuning);
      if (session) {
        recordEvent(session, 'tune_plan_completed', `Tuning: ${activeTuning.plan.goal}`);
        await saveSession(projectRoot, session);
      }
      // Mirrors executeBuildStep's identical completion promotion: once
      // there's truly nothing left to run, surface whatever's still staged
      // so /tune-execute's final summary shows the batch consent surface
      // instead of the old single-file "Content staged for X" line.
      // F-71e4a9c3: refused when a build batch is already awaiting
      // confirmation — this tuning content stays staged, and the
      // "no pending step, isTuningComplete" branch above retries surfacing
      // it on every subsequent /tune-step once that build batch resolves.
      if (Object.keys(activeTuning.stagedWrites).length > 0) {
        const batch = refreshPendingWriteBatch(activeTuning.stagedWrites, 'tuning');
        if (batch) {
          consentSuffix = '\n\n' + formatBatchConsent(batch, { flow: 'tuning', goal: activeTuning.plan.goal });
        } else {
          consentSuffix = `\n\n${Object.keys(activeTuning.stagedWrites).length} file(s) staged for this tuning plan, but a build batch is awaiting confirmation first -- say "yes" or "no" to resolve it, then /tune-step again.`;
        }
      }
    }

    const icon = toolResult.ok ? '●' : '✗';
    return `${icon} Step ${step.id}: ${step.description}\n${toolResult.summary}${consentSuffix}`;
  }

  async function executeAllTuningSteps(onStep?: BatchStepCallback): Promise<string> {
    if (!activeTuning) return 'No active tuning plan. Use "tune <goal>" to create one.';

    const results: string[] = [];
    const maxSteps = activeTuning.plan.steps.length;
    const total = activeTuning.plan.steps.filter(s => s.status === 'pending').length;
    let executedCount = 0;
    // Same liveness + early-abort contract as executeAllBuildSteps (F-4be7a3c2).
    let lastFailure: string | null = null;
    let abortNote: string | null = null;

    while (executedCount < maxSteps) {
      const step = nextPendingTuningStep(activeTuning);
      if (!step) break;
      const result = await executeTuningStep();
      results.push(result);
      executedCount++;

      const ok = !result.startsWith('✗');
      onStep?.({
        index: executedCount, total,
        stepId: step.id, description: step.description,
        ok, result,
      });

      if (!ok) {
        const reason = result.slice(result.indexOf('\n') + 1);
        if (lastFailure !== null && reason === lastFailure) {
          const remaining = activeTuning.plan.steps.filter(s => s.status === 'pending').length;
          if (remaining > 0) {
            abortNote = `Stopped early: two consecutive tuning steps failed the same way, so the remaining ${remaining} step(s) were skipped instead of repeating the failure. Fix the cause and run the tuning plan again to resume.`;
          }
          break;
        }
        lastFailure = reason;
      } else {
        lastFailure = null;
      }
    }

    if (results.length === 0) {
      return 'No pending tuning steps to execute.';
    }

    return results.join('\n\n')
      + (abortNote ? `\n\n${abortNote}` : '')
      + '\n\n' + formatTuningStatus(activeTuning);
  }

  return {
    client,
    memory,
    get pendingWrite() { return pendingWrite; },
    set pendingWrite(v) { pendingWrite = v; },
    get pendingWriteBatch() { return pendingWriteBatch; },
    set pendingWriteBatch(v) { pendingWriteBatch = v; },
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
    replayProducer,
    process,
    undoLastWrite,
    executeBuildStep,
    executeAllBuildSteps,
    executeTuningStep,
    executeAllTuningSteps,
  };
}

// --- Helpers ---

/**
 * Parse a tool's structured `output` back into a typed plan/summary.
 *
 * Tools emit their plan as JSON in `toolResult.output`; the engine parses it to
 * drive multi-step build/tune/experiment flows. If that JSON is malformed
 * (truncated model output, a future tool emitting a non-JSON blob), the parse
 * fails. Rather than swallow the error silently — which leaves the user thinking
 * a plan is active when none was captured — return a null value plus a one-line,
 * actionable notice naming what was dropped. Callers append the notice to the
 * response.
 */
export function capturePlanFromOutput<T>(
  output: string,
  kind: string,
): { value: T | null; notice: string | null } {
  try {
    return { value: JSON.parse(output) as T, notice: null };
  } catch {
    return {
      value: null,
      notice: `Note: I generated a ${kind} but couldn't read it back (the model's output wasn't valid JSON), so no plan is active. Try rephrasing the request or running it again.`,
    };
  }
}

/**
 * Format the batched-write consent prompt (F-591fae03). Core wording is
 * Director-specified: a `${N} file(s) staged -- write all?` header, one
 * indented bullet per entry mirroring formatBuildStatus's existing bullet
 * style, then the yes/no instruction line. F-71e4a9c3: names the owning
 * flow and its goal so the prompt itself is unambiguous about which plan's
 * content it holds — no textual cue existed before this, so a user with a
 * build AND a tuning plan both in flight had no way to tell which one a
 * consent prompt belonged to.
 */
function formatBatchConsent(entries: StagedWriteEntry[], source: { flow: 'build' | 'tuning'; goal: string }): string {
  const lines = [`${entries.length} file(s) staged -- write all? (${source.flow} "${source.goal}")`];
  for (const entry of entries) {
    lines.push(`  - ${entry.suggestedPath} (${entry.content.length} bytes)`);
  }
  lines.push('Say "yes" to write all, or "no" to discard all.');
  return lines.join('\n');
}

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
