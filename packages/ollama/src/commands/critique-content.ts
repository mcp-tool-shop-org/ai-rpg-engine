// Command: critique-content — content in, senior designer review out

import type { OllamaTextClient } from '../client.js';
import { critiqueContentPrompt } from '../prompts/critique-content.js';
import { extractText } from '../parsers.js';

export type CritiqueContentInput = {
  content: string;
  contentType?: string;
  focus?: string;
};

export type CritiqueContentResult = {
  ok: true;
  text: string;
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
    }),
  });

  if (!result.ok) return result;
  return { ok: true, text: extractText(result.text) };
}
