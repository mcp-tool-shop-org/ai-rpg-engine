// Chat contract — types that define what chat can read, call, write, and confirm.
// Chat is a conversational orchestrator over existing structured commands.
// It never invents hidden state, bypasses validation, or writes without consent.

import type { OllamaTextClient } from './client.js';
import type { DesignSession, SessionEventKind } from './session.js';

// --- Chat message types ---

export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatMessage = {
  role: ChatRole;
  content: string;
  timestamp: string;
  /** If assistant, the actions it took (transparency). */
  actions?: PlannedAction[];
};

// --- Intent classification ---

export type ChatIntent =
  | 'suggest_next'      // "What should I do next?"
  | 'explain_state'     // "Why is this district unstable?"
  | 'scaffold'          // "Generate a faction for this district."
  | 'critique'          // "Review this content."
  | 'improve'           // "Improve this quest based on the latest critique."
  | 'compare_replays'   // "Compare the last two replays."
  | 'analyze_replay'    // "Analyze this replay."
  | 'plan'              // "Plan out a new district."
  | 'explain_why'       // "Why did the guards never escalate?"
  | 'session_info'      // "What's in my session?" / "Show me open issues."
  | 'apply_content'     // "Write this to disk."
  | 'help'              // "What can you do?"
  | 'context_info'      // "What context are you using?" / "/context"
  | 'show_plan'         // "What's the plan?" / "Make a plan"
  | 'recommend'         // "What should I prioritize?" / "Recommendations"
  | 'build_goal'        // "Build a rumor-driven market district."
  | 'unknown';          // Fallback — ask for clarification.

export type IntentClassification = {
  intent: ChatIntent;
  confidence: 'high' | 'medium' | 'low';
  /** Extracted parameters from the user message. */
  params: Record<string, string>;
};

// --- Planned actions (transparency contract) ---

export type PlannedAction = {
  /** The engine command that will be called. */
  command: string;
  /** Human-readable description of what it does. */
  description: string;
  /** Whether this action requires explicit user confirmation. */
  requiresConfirmation: boolean;
  /** Status after execution. */
  status: 'pending' | 'approved' | 'executed' | 'rejected' | 'failed';
  /** Result summary after execution. */
  result?: string;
};

// --- Chat tool (registered command the chat can invoke) ---

export type ChatTool = {
  name: string;
  description: string;
  /** Intent(s) this tool serves. */
  intents: ChatIntent[];
  /** Whether this tool writes/mutates files (requires confirmation). */
  mutates: boolean;
  /** Execute the tool. Returns a structured response for the chat to present. */
  execute: (params: ChatToolParams) => Promise<ChatToolResult>;
};

export type ChatToolParams = {
  client: OllamaTextClient;
  session: DesignSession | null;
  sessionContext: string | undefined;
  projectRoot: string;
  /** Parameters extracted from user message + intent classification. */
  params: Record<string, string>;
  /** Raw user message for context. */
  userMessage: string;
};

export type ChatToolResult = {
  ok: boolean;
  /** Human-readable summary of what happened. */
  summary: string;
  /** Structured output (YAML, JSON, etc.) if applicable. */
  output?: string;
  /** Actions that were taken (for transparency). */
  actions: PlannedAction[];
  /** Session events to record. */
  sessionEvents?: Array<{ kind: SessionEventKind; detail: string }>;
  /** If the tool produced content that could be written to disk. */
  pendingWrite?: {
    content: string;
    suggestedPath: string;
    label: string;
  };
};

// --- Chat memory (bounded conversational state) ---

export type ChatMemory = {
  messages: ChatMessage[];
  /** Max messages to keep (oldest get trimmed). */
  maxMessages: number;
  /** Session name for grounding. */
  sessionName: string | null;
};

// --- Chat transcript ---

export type ChatTranscript = {
  sessionName: string | null;
  startedAt: string;
  messages: ChatMessage[];
};

// --- Chat engine config ---

export type ChatConfig = {
  maxMemory: number;
  /** Whether to auto-save transcripts. */
  saveTranscripts: boolean;
  /** Root directory for transcript files. */
  transcriptDir: string;
};

export const DEFAULT_CHAT_CONFIG: ChatConfig = {
  maxMemory: 50,
  saveTranscripts: false,
  transcriptDir: '.ai-transcripts',
};
