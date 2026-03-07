// Command: expand-pack — existing pack YAML + goal in, expanded pack YAML out

import type { OllamaTextClient } from '../client.js';
import { expandPackPrompt } from '../prompts/expand-pack.js';
import { extractYaml } from '../parsers.js';

export type ExpandPackInput = {
  content: string;
  goal: string;
  constraints?: string[];
  sessionContext?: string;
};

export type ExpandPackResult = {
  ok: true;
  yaml: string;
} | {
  ok: false;
  error: string;
};

export async function expandPack(
  client: OllamaTextClient,
  input: ExpandPackInput,
): Promise<ExpandPackResult> {
  const result = await client.generate({
    system: expandPackPrompt.system,
    prompt: expandPackPrompt.render({
      content: input.content,
      goal: input.goal,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
  });

  if (!result.ok) return result;
  return { ok: true, yaml: extractYaml(result.text) };
}
