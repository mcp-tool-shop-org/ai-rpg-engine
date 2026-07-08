// Command: create-district — theme in, district config YAML out

import type { OllamaTextClient } from '../client.js';
import { createDistrictPrompt } from '../prompts/create-district.js';
import { extractYaml } from '../parsers.js';
import { parseYamlish, validateGeneratedDistrict } from '../validators.js';
import type { GeneratedContentResult } from '../validators.js';

export type CreateDistrictInput = {
  theme: string;
  rulesetId?: string;
  factions?: string[];
  existingZones?: string[];
  constraints?: string[];
  sessionContext?: string;
};

export type GeneratedDistrictResult = {
  ok: true;
  yaml: string;
  /** Schema check of the draft (v2.5 audit PA-4) — advisory unless the CLI --validate gate is on. */
  validation: GeneratedContentResult;
} | {
  ok: false;
  error: string;
};

export async function createDistrict(
  client: OllamaTextClient,
  input: CreateDistrictInput,
): Promise<GeneratedDistrictResult> {
  const result = await client.generate({
    system: createDistrictPrompt.system,
    prompt: createDistrictPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      factions: input.factions,
      existingZones: input.existingZones,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
  });

  if (!result.ok) return result;
  const yaml = extractYaml(result.text);
  return { ok: true, yaml, validation: validateGeneratedDistrict(yaml, parseYamlish(yaml)) };
}
