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

export type ChatEngine = {
  memory: ChatMemory;
  /** Last generated content available for write. */
  pendingWrite: { content: string; suggestedPath: string; label: string } | null;
  /** Last context snapshot from RAG + shaping. Available after first process() call. */
  lastContextSnapshot: ContextSnapshot | null;
  /** Process a user message and return the assistant response. */
  process: (message: string) => Promise<string>;
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
  /** Override the personality profile. */
  profile?: PersonalityProfile;
};

export function createChatEngine(options: ChatEngineOptions): ChatEngine {
  const {
    client, projectRoot, maxMemory = 50, rawMode = false,
    ragEnabled = true, webfetchEnabled = false,
    profile = WORLDBUILDER_PROFILE,
  } = options;
  const memory = createChatMemory(maxMemory, null);
  let pendingWrite: { content: string; suggestedPath: string; label: string } | null = null;
  let lastContextSnapshot: ContextSnapshot | null = null;

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

    // RAG retrieval — ground chat in project context
    let shapedContextStr = '';
    if (ragEnabled) {
      const keywords = extractKeywords(userMessage);
      const ragResult = await retrieve(
        { userMessage, maxSnippets: 6, maxChars: 4000 },
        session,
        projectRoot,
      );
      const shaped = shapeMemory({
        session,
        ragSnippets: ragResult.snippets,
        maxChars: 4000,
        includeSessionBaseline: true,
      });
      shapedContextStr = formatShapedContext(shaped);

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
      });
    }

    // Select personality profile for this intent
    const intentProfile = rawMode ? profile : getProfileForIntent(classification.intent);

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
    });

    // Track pending write from tool result
    if (toolResult.pendingWrite) {
      pendingWrite = toolResult.pendingWrite;
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

  return {
    memory,
    get pendingWrite() { return pendingWrite; },
    set pendingWrite(v) { pendingWrite = v; },
    get lastContextSnapshot() { return lastContextSnapshot; },
    process,
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
