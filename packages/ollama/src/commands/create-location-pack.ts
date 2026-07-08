// Command: create-location-pack — theme in, district + rooms YAML out

import type { OllamaTextClient } from '../client.js';
import { createLocationPackPrompt } from '../prompts/create-location-pack.js';
import { extractYaml } from '../parsers.js';
import { parseYamlish, validateGeneratedLocationPack } from '../validators.js';
import type { GeneratedContentResult } from '../validators.js';

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
  /** Schema check of the draft (v2.5 audit PA-4) — advisory unless the CLI --validate gate is on. */
  validation: GeneratedContentResult;
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
  const yaml = extractYaml(result.text);
  return { ok: true, yaml, validation: validateGeneratedLocationPack(yaml, parseYamlish(yaml)) };
}
