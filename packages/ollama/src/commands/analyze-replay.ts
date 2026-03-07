// Command: analyze-replay — simulation output in, structured findings out

import type { OllamaTextClient } from '../client.js';
import { analyzeReplayPrompt } from '../prompts/analyze-replay.js';
import { parseCritiqueOutput } from '../parsers.js';
import type { CritiqueIssue, CritiqueSuggestion } from '../parsers.js';

export type AnalyzeReplayInput = {
  replay: string;
  focus?: string;
  tickRange?: string;
  sessionContext?: string;
};

export type AnalyzeReplayResult = {
  ok: true;
  text: string;
  issues: CritiqueIssue[];
  suggestions: CritiqueSuggestion[];
  summary: string;
} | {
  ok: false;
  error: string;
};

export async function analyzeReplay(
  client: OllamaTextClient,
  input: AnalyzeReplayInput,
): Promise<AnalyzeReplayResult> {
  const result = await client.generate({
    system: analyzeReplayPrompt.system,
    prompt: analyzeReplayPrompt.render({
      replay: input.replay,
      focus: input.focus,
      tickRange: input.tickRange,
      sessionContext: input.sessionContext,
    }),
  });

  if (!result.ok) return result;

  const { prose, structured } = parseCritiqueOutput(result.text);
  return {
    ok: true,
    text: prose,
    issues: structured.issues,
    suggestions: structured.suggestions,
    summary: structured.summary,
  };
}
