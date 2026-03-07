// Command: create-district — theme in, district config YAML out

import type { OllamaTextClient } from '../client.js';
import { createDistrictPrompt } from '../prompts/create-district.js';
import { extractYaml } from '../parsers.js';

export type CreateDistrictInput = {
  theme: string;
  rulesetId?: string;
  factions?: string[];
  existingZones?: string[];
  constraints?: string[];
};

export type GeneratedDistrictResult = {
  ok: true;
  yaml: string;
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
    }),
  });

  if (!result.ok) return result;
  return { ok: true, yaml: extractYaml(result.text) };
}
