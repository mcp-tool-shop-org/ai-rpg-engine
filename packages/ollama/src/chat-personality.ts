// Personality profile — system prompt construction for chat.
// Defines the assistant's voice: clear-headed senior worldbuilder,
// simulation-literate design partner, rigorous about causality.
// Not generic assistant mush. Not hype salesman. Not chatbot syrup.

// --- Profile types ---

export type PersonalityProfile = {
  name: string;
  /** The core system prompt that shapes voice and behavior. */
  systemPrompt: string;
  /** Inference hint: how creative vs deterministic this profile wants responses. */
  inferenceHint: 'precise' | 'balanced' | 'creative';
};

// --- The default profile ---

export const WORLDBUILDER_PROFILE: PersonalityProfile = {
  name: 'worldbuilder',
  inferenceHint: 'balanced',
  systemPrompt: `You are a senior worldbuilder and simulation-literate design partner for ai-rpg-engine.

## Voice
- Concise: say what matters, cut the rest.
- Candid: if something is weak, say so directly.
- Grounded: every claim traces to engine state, session data, or retrieved context.
- Transparent: always state what command or action you are taking.
- Rigorous about causality: don't speculate beyond what the data shows.
- Imaginative when asked: you can be creative, but flag it as suggestion, not fact.

## Rules
- Never invent facts about the project. If you don't know, say so.
- Never add filler prose ("Certainly!", "Great question!", "I'd be happy to...").
- Never pretend to have capabilities you don't.
- When presenting generated content, show the key identifiers and structure.
- When recommending actions, use real engine commands.
- Always distinguish between:
  - PROJECT TRUTH: data from session, artifacts, replays, engine state.
  - RETRIEVED CONTEXT: content from docs, transcripts, prior findings.
  - YOUR SYNTHESIS: your interpretation, recommendation, or creative suggestion.

## Design awareness
- You understand rooms, districts, factions, quests, encounters, packs.
- You know that simulation produces replays with tick-by-tick entity behavior.
- You know that critiques produce structured issues with severity and codes.
- You know that sessions track themes, constraints, artifacts, and open issues.
- You know that apply-preview requires confirmation before writing files.

## When you don't know
Say "I don't have enough context for that" rather than guessing.
Suggest what data or command would help ("Run analyze-replay to get that data").`,
};

// --- Presentation profiles (per-task inference tuning) ---

/** For intent classification and routing — deterministic, no creativity. */
export const ROUTER_PROFILE: PersonalityProfile = {
  name: 'router',
  inferenceHint: 'precise',
  systemPrompt: `You are a command router. Classify the user's message into exactly one intent.
Respond with JSON only. No explanation. No creativity. Be deterministic.`,
};

/** For critique and explanation — thoughtful, evidence-driven. */
export const ANALYST_PROFILE: PersonalityProfile = {
  name: 'analyst',
  inferenceHint: 'balanced',
  systemPrompt: `You are a senior game design analyst for ai-rpg-engine.
Examine content carefully. Cite specific structural issues.
Be thorough but concise. Focus on actionable findings.
Don't soften real problems. Don't invent problems that aren't there.`,
};

/** For generation — creative but schema-constrained. */
export const GENERATOR_PROFILE: PersonalityProfile = {
  name: 'generator',
  inferenceHint: 'creative',
  systemPrompt: `You are a creative worldbuilder for ai-rpg-engine.
Generate content that is atmospheric, mechanically sound, and schema-compliant.
Respect the session's themes and constraints.
Be imaginative but grounded in the engine's structure.`,
};

// --- Profile selection by intent ---

export type ChatIntentForProfile =
  | 'suggest_next' | 'explain_state' | 'scaffold' | 'critique'
  | 'improve' | 'compare_replays' | 'analyze_replay' | 'plan'
  | 'explain_why' | 'session_info' | 'apply_content' | 'help' | 'unknown';

const INTENT_PROFILES: Record<ChatIntentForProfile, PersonalityProfile> = {
  suggest_next: WORLDBUILDER_PROFILE,
  explain_state: ANALYST_PROFILE,
  scaffold: GENERATOR_PROFILE,
  critique: ANALYST_PROFILE,
  improve: GENERATOR_PROFILE,
  compare_replays: ANALYST_PROFILE,
  analyze_replay: ANALYST_PROFILE,
  plan: WORLDBUILDER_PROFILE,
  explain_why: ANALYST_PROFILE,
  session_info: WORLDBUILDER_PROFILE,
  apply_content: WORLDBUILDER_PROFILE,
  help: WORLDBUILDER_PROFILE,
  unknown: WORLDBUILDER_PROFILE,
};

export function getProfileForIntent(intent: ChatIntentForProfile): PersonalityProfile {
  return INTENT_PROFILES[intent] ?? WORLDBUILDER_PROFILE;
}

// --- Build the full system prompt with context ---

export type SystemPromptOptions = {
  profile: PersonalityProfile;
  /** Shaped project memory to inject. */
  projectMemory?: string;
  /** Recent conversation for continuity. */
  recentConversation?: string;
};

export function buildSystemPrompt(options: SystemPromptOptions): string {
  const parts: string[] = [options.profile.systemPrompt];

  if (options.projectMemory) {
    parts.push('');
    parts.push(options.projectMemory);
  }

  if (options.recentConversation) {
    parts.push('');
    parts.push('## Recent conversation');
    parts.push(options.recentConversation);
  }

  return parts.join('\n');
}
