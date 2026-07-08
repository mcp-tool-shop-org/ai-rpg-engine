// Command: create-faction — theme in, faction config YAML out

import type { OllamaTextClient } from '../client.js';
import { createFactionPrompt } from '../prompts/create-faction.js';
import { extractYaml } from '../parsers.js';
import { parseYamlish, validateGeneratedFaction } from '../validators.js';
import type { GeneratedContentResult } from '../validators.js';

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
  /** Schema check of the draft (v2.5 audit PA-4) — advisory unless the CLI --validate gate is on. */
  validation: GeneratedContentResult;
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
  const yaml = extractYaml(result.text);
  return { ok: true, yaml, validation: validateGeneratedFaction(yaml, parseYamlish(yaml)) };
}
