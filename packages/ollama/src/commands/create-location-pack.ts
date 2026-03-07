// Command: create-location-pack — theme in, district + rooms YAML out

import type { OllamaTextClient } from '../client.js';
import { createLocationPackPrompt } from '../prompts/create-location-pack.js';
import { extractYaml } from '../parsers.js';

export type CreateLocationPackInput = {
  theme: string;
  rulesetId?: string;
  factions?: string[];
  constraints?: string[];
  sessionContext?: string;
};

export type GeneratedLocationPackResult = {
  ok: true;
  yaml: string;
} | {
  ok: false;
  error: string;
};

export async function createLocationPack(
  client: OllamaTextClient,
  input: CreateLocationPackInput,
): Promise<GeneratedLocationPackResult> {
  const result = await client.generate({
    system: createLocationPackPrompt.system,
    prompt: createLocationPackPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      factions: input.factions,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
  });

  if (!result.ok) return result;
  return { ok: true, yaml: extractYaml(result.text) };
}
