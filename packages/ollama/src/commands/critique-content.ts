// Command: critique-content — content in, structured designer review out

import type { OllamaTextClient } from '../client.js';
import { critiqueContentPrompt } from '../prompts/critique-content.js';
import { parseCritiqueOutput } from '../parsers.js';
import type { CritiqueIssue, CritiqueSuggestion } from '../parsers.js';

export type CritiqueContentInput = {
  content: string;
  contentType?: string;
  focus?: string;
  sessionContext?: string;
};

export type CritiqueContentResult = {
  ok: true;
  text: string;
  issues: CritiqueIssue[];
  suggestions: CritiqueSuggestion[];
  summary: string;
} | {
  ok: false;
  error: string;
};

export async function critiqueContent(
  client: OllamaTextClient,
  input: CritiqueContentInput,
): Promise<CritiqueContentResult> {
  const result = await client.generate({
    system: critiqueContentPrompt.system,
    prompt: critiqueContentPrompt.render({
      content: input.content,
      contentType: input.contentType,
      focus: input.focus,
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
