// Command: create-district — theme in, district config YAML out

import type { OllamaTextClient } from '../client.js';
import { createDistrictPrompt } from '../prompts/create-district.js';
import { validateGeneratedDistrict } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateDistrictInput = {
  theme: string;
  rulesetId?: string;
  factions?: string[];
  existingZones?: string[];
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export type GeneratedDistrictResult = GeneratedTextResult;

export async function createDistrict(
  client: OllamaTextClient,
  input: CreateDistrictInput,
): Promise<GeneratedDistrictResult> {
  return generateWithRepair({
    client,
    system: createDistrictPrompt.system,
    prompt: createDistrictPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      factions: input.factions,
      existingZones: input.existingZones,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
    repair: input.repair,
    kindLabel: 'district',
    validate: validateGeneratedDistrict,
  });
}
