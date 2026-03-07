// Command: suggest-next — session-aware guided design recommendations

import type { OllamaTextClient } from '../client.js';
import { suggestNextPrompt } from '../prompts/suggest-next.js';
import { parseSuggestNextOutput } from '../parsers.js';
import type { NextAction, GuidedSuggestions } from '../parsers.js';

export type SuggestNextInput = {
  sessionState: string;
  recentActivity?: string;
};

export type SuggestNextResult = {
  ok: true;
  text: string;
  actions: NextAction[];
  summary: string;
} | {
  ok: false;
  error: string;
};

export async function suggestNext(
  client: OllamaTextClient,
  input: SuggestNextInput,
): Promise<SuggestNextResult> {
  const result = await client.generate({
    system: suggestNextPrompt.system,
    prompt: suggestNextPrompt.render({
      sessionState: input.sessionState,
      recentActivity: input.recentActivity,
    }),
  });

  if (!result.ok) return result;

  const { prose, structured } = parseSuggestNextOutput(result.text);
  return {
    ok: true,
    text: prose,
    actions: structured.actions,
    summary: structured.summary,
  };
}
