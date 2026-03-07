// Command: improve-content — existing YAML + goal in, revised YAML out

import type { OllamaTextClient } from '../client.js';
import { improveContentPrompt } from '../prompts/improve-content.js';
import { extractYaml } from '../parsers.js';

export type ImproveContentInput = {
  content: string;
  goal: string;
  contentType?: string;
  sessionContext?: string;
};

export type ImproveContentResult = {
  ok: true;
  yaml: string;
} | {
  ok: false;
  error: string;
};

export async function improveContent(
  client: OllamaTextClient,
  input: ImproveContentInput,
): Promise<ImproveContentResult> {
  const result = await client.generate({
    system: improveContentPrompt.system,
    prompt: improveContentPrompt.render({
      content: input.content,
      goal: input.goal,
      contentType: input.contentType,
      sessionContext: input.sessionContext,
    }),
  });

  if (!result.ok) return result;
  return { ok: true, yaml: extractYaml(result.text) };
}
