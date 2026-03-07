// Command: create-faction — theme in, faction config YAML out

import type { OllamaTextClient } from '../client.js';
import { createFactionPrompt } from '../prompts/create-faction.js';
import { extractYaml } from '../parsers.js';

export type CreateFactionInput = {
  theme: string;
  rulesetId?: string;
  districtIds?: string[];
  constraints?: string[];
  sessionContext?: string;
};

export type GeneratedFactionResult = {
  ok: true;
  yaml: string;
} | {
  ok: false;
  error: string;
};

export async function createFaction(
  client: OllamaTextClient,
  input: CreateFactionInput,
): Promise<GeneratedFactionResult> {
  const result = await client.generate({
    system: createFactionPrompt.system,
    prompt: createFactionPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      districtIds: input.districtIds,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
  });

  if (!result.ok) return result;
  return { ok: true, yaml: extractYaml(result.text) };
}
