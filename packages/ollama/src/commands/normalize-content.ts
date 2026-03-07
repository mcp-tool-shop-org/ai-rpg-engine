// Command: normalize-content — messy YAML in, clean YAML out

import type { OllamaTextClient } from '../client.js';
import { normalizeContentPrompt } from '../prompts/normalize-content.js';
import { extractYaml } from '../parsers.js';

export type NormalizeContentInput = {
  content: string;
  contentType?: string;
};

export type NormalizeContentResult = {
  ok: true;
  yaml: string;
} | {
  ok: false;
  error: string;
};

export async function normalizeContent(
  client: OllamaTextClient,
  input: NormalizeContentInput,
): Promise<NormalizeContentResult> {
  const result = await client.generate({
    system: normalizeContentPrompt.system,
    prompt: normalizeContentPrompt.render({
      content: input.content,
      contentType: input.contentType,
    }),
  });

  if (!result.ok) return result;
  return { ok: true, yaml: extractYaml(result.text) };
}
