// Chat engine — the core orchestrator.
// Routes user messages through: intent → tool → execute → present.
// Manages bounded conversational memory and pending writes.
// Never invents hidden state or writes without explicit consent.

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

const PRESENT_SYSTEM = `You are a helpful game world design assistant for ai-rpg-engine.
You present command results conversationally while staying grounded in facts.
Keep responses concise, direct, and helpful. Do not embellish or invent information.
When showing content, quote it accurately. When suggesting actions, use real engine commands.
Never say "Certainly!" or add filler prose. Be the sharp aide, not the decorative narrator.`;

export async function presentResult(
  client: OllamaTextClient,
  toolResult: ChatToolResult,
  userMessage: string,
  recentContext: string,
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

  const result = await client.generate({ system: PRESENT_SYSTEM, prompt });
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
  /** Process a user message and return the assistant response. */
  process: (message: string) => Promise<string>;
};

export type ChatEngineOptions = {
  client: OllamaTextClient;
  projectRoot: string;
  maxMemory?: number;
  /** If true, skip LLM presentation (return raw tool output). Useful for testing. */
  rawMode?: boolean;
};

export function createChatEngine(options: ChatEngineOptions): ChatEngine {
  const { client, projectRoot, maxMemory = 50, rawMode = false } = options;
  const memory = createChatMemory(maxMemory, null);
  let pendingWrite: { content: string; suggestedPath: string; label: string } | null = null;

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

    // Classify intent
    const classification = await classifyIntent(client, userMessage);

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

    // Execute tool
    const toolResult = await tool.execute({
      client,
      session,
      sessionContext: sessionCtx,
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
        client, toolResult, userMessage, getRecentContext(memory),
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

  return {
    memory,
    get pendingWrite() { return pendingWrite; },
    set pendingWrite(v) { pendingWrite = v; },
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
