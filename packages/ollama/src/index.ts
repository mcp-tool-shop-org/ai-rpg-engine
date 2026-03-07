// @ai-rpg-engine/ollama — optional local AI layer

// Config
export { resolveConfig } from './config.js';
export type { OllamaConfig } from './config.js';

// Client
export { createClient } from './client.js';
export type { OllamaTextClient, PromptInput, PromptResult } from './client.js';

// Commands
export { explainValidationError } from './commands/explain-validation-error.js';
export type { ValidationExplainInput } from './commands/explain-validation-error.js';

export { summarizeBeliefTrace } from './commands/summarize-belief-trace.js';
export type { BeliefTraceSummaryInput } from './commands/summarize-belief-trace.js';

export { createRoom } from './commands/create-room.js';
export type { CreateRoomInput, GeneratedTextResult } from './commands/create-room.js';

export { createFaction } from './commands/create-faction.js';
export type { CreateFactionInput, GeneratedFactionResult } from './commands/create-faction.js';

export { createQuest } from './commands/create-quest.js';
export type { CreateQuestInput, GeneratedQuestResult } from './commands/create-quest.js';

export { explainLint } from './commands/explain-lint.js';
export type { LintExplainInput } from './commands/explain-lint.js';

export { createDistrict } from './commands/create-district.js';
export type { CreateDistrictInput, GeneratedDistrictResult } from './commands/create-district.js';

export { explainBeliefDivergence } from './commands/explain-belief-divergence.js';
export type { BeliefDivergenceInput } from './commands/explain-belief-divergence.js';

export { createLocationPack } from './commands/create-location-pack.js';
export type { CreateLocationPackInput, GeneratedLocationPackResult } from './commands/create-location-pack.js';

export { createEncounterPack } from './commands/create-encounter-pack.js';
export type { CreateEncounterPackInput, GeneratedEncounterPackResult } from './commands/create-encounter-pack.js';

export { explainDistrictState } from './commands/explain-district-state.js';
export type { DistrictStateInput } from './commands/explain-district-state.js';

export { explainFactionAlert } from './commands/explain-faction-alert.js';
export type { FactionAlertInput } from './commands/explain-faction-alert.js';

export { improveContent } from './commands/improve-content.js';
export type { ImproveContentInput, ImproveContentResult } from './commands/improve-content.js';

export { expandPack } from './commands/expand-pack.js';
export type { ExpandPackInput, ExpandPackResult } from './commands/expand-pack.js';

export { critiqueContent } from './commands/critique-content.js';
export type { CritiqueContentInput, CritiqueContentResult } from './commands/critique-content.js';

export { normalizeContent } from './commands/normalize-content.js';
export type { NormalizeContentInput, NormalizeContentResult } from './commands/normalize-content.js';

export { diffSummary } from './commands/diff-summary.js';
export type { DiffSummaryInput, DiffSummaryResult } from './commands/diff-summary.js';

export { analyzeReplay } from './commands/analyze-replay.js';
export type { AnalyzeReplayInput, AnalyzeReplayResult } from './commands/analyze-replay.js';

export { explainWhy } from './commands/explain-why.js';
export type { ExplainWhyInput } from './commands/explain-why.js';

export { suggestNext } from './commands/suggest-next.js';
export type { SuggestNextInput, SuggestNextResult } from './commands/suggest-next.js';

export { planDistrict } from './commands/plan-district.js';
export type { PlanDistrictInput, PlanDistrictResult } from './commands/plan-district.js';

export { compareReplays } from './commands/compare-replays.js';
export type { CompareReplaysInput, CompareReplaysResult } from './commands/compare-replays.js';

// Parsers (useful for custom prompt workflows)
export {
  extractYaml, extractJson, extractText,
  parseCritiqueOutput, parseSuggestNextOutput, parsePlanOutput, parseCompareOutput,
} from './parsers.js';
export type {
  CritiqueIssue, CritiqueSuggestion, StructuredCritique,
  NextAction, GuidedSuggestions,
  PlanStep, DesignPlan,
  ReplayChange, ReplayComparison,
} from './parsers.js';

// Validators
export { parseYamlish, validateGeneratedRoom, validateGeneratedQuest } from './validators.js';
export type { GeneratedContentResult } from './validators.js';

// Session
export {
  loadSession,
  saveSession,
  deleteSession,
  createSession,
  addThemes,
  addConstraints,
  addArtifact,
  addCritiqueIssues,
  acceptSuggestion,
  resolveIssue,
  recordEvent,
  renderSessionContext,
  formatSessionStatus,
  formatSessionHistory,
} from './session.js';
export type {
  DesignSession,
  SessionArtifacts,
  SessionIssue,
  SessionEvent,
  SessionEventKind,
} from './session.js';

// Session doctor
export { sessionDoctor, formatDoctorReport } from './session-doctor.js';
export type { SessionDiagnostic, SessionDoctorResult } from './session-doctor.js';

// Workflow macros
export {
  scaffoldAndCritique,
  compareAndFix,
  planAndGenerate,
  createMacroProgress,
  buildMacroResult,
} from './macros.js';
export type {
  MacroStep,
  MacroProgress,
  MacroResult,
  ProgressCallback,
  ScaffoldKind,
  ScaffoldAndCritiqueInput,
  CompareAndFixInput,
  PlanAndGenerateInput,
} from './macros.js';

// Apply preview
export { generatePreview, applyConfirmed } from './apply-preview.js';
export type { ApplyPreviewInput, ApplyPreviewResult } from './apply-preview.js';

// Chat
export type {
  ChatRole, ChatMessage, ChatIntent, IntentClassification,
  PlannedAction, ChatTool, ChatToolParams, ChatToolResult,
  ChatMemory, ChatTranscript, ChatConfig,
} from './chat-types.js';
export { DEFAULT_CHAT_CONFIG } from './chat-types.js';
export { classifyIntent, classifyByKeywords, classifyByLLM } from './chat-router.js';
export { findToolForIntent, getAllTools } from './chat-tools.js';
export { createChatEngine, createChatMemory, addMessage, getRecentContext } from './chat-engine.js';
export type { ChatEngine, ChatEngineOptions } from './chat-engine.js';
export { createTranscript, addToTranscript, saveTranscript, loadTranscript, defaultTranscriptPath } from './chat-transcript.js';
export { runChatShell } from './chat-shell.js';
export type { ChatShellOptions } from './chat-shell.js';

// RAG — project-grounded retrieval
export { retrieve, extractKeywords, formatRetrievedContext } from './chat-rag.js';
export type { SourceKind, RetrievedSnippet, RetrievalQuery, RetrievalResult } from './chat-rag.js';

// Memory shaping
export { shapeMemory, formatShapedContext } from './chat-memory-shaper.js';
export type { MemoryClass, ShapedMemory, ShapedContext } from './chat-memory-shaper.js';

// Personality profiles
export { WORLDBUILDER_PROFILE, ANALYST_PROFILE, GENERATOR_PROFILE, ROUTER_PROFILE, getProfileForIntent, buildSystemPrompt } from './chat-personality.js';
export type { PersonalityProfile } from './chat-personality.js';

// Webfetch adapter
export { webfetch, isAllowedUrl, formatWebfetchForPrompt } from './chat-webfetch.js';
export type { WebfetchResult, WebfetchOptions } from './chat-webfetch.js';

// Planner — session-aware multi-step planning
export { planFromSession, formatPlan, validatePlan } from './chat-planner.js';
export type { PlanStep as ActionPlanStep, ActionPlan, PlanSignal } from './chat-planner.js';

// Recommendations — leverage-scored structured suggestions
export { generateRecommendations, formatRecommendations } from './chat-recommendations.js';
export type { Recommendation, RecommendationSet } from './chat-recommendations.js';

// Replay classifier — deeper replay diff classification
export { classifyReplayChanges, formatClassification } from './replay-classifier.js';
export type { ChangeClassification, ClassifiedChange, ClassificationResult, ClassificationSummary } from './replay-classifier.js';

// Context browser — introspection into RAG/shaping/profile decisions
export { buildContextSnapshot, formatContextSnapshot, formatSources } from './chat-context-browser.js';
export type { ContextSnapshot, RetrievalSummary, SnippetSummary, ShapingSummary, BudgetSummary } from './chat-context-browser.js';

// CLI entry
export { runCli } from './cli.js';
