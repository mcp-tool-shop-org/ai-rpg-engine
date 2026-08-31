// Command: create-hazard — theme in, schema-valid YAML hazard out

import type { OllamaTextClient } from '../client.js';
import { createHazardPrompt } from '../prompts/create-hazard.js';
import { validateGeneratedHazard } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateHazardInput = {
  theme: string;
  rulesetId?: string;
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export type GeneratedHazardResult = GeneratedTextResult;

export async function createHazard(
  client: OllamaTextClient,
  input: CreateHazardInput,
): Promise<GeneratedHazardResult> {
  return generateWithRepair({
    client,
    system: createHazardPrompt.system,
    prompt: createHazardPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
    repair: input.repair,
    kindLabel: 'hazard',
    validate: validateGeneratedHazard,
  });
}
