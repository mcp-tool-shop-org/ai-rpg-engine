// Command: create-faction — theme in, faction config YAML out

import type { OllamaTextClient } from '../client.js';
import { createFactionPrompt } from '../prompts/create-faction.js';
import { validateGeneratedFaction } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateFactionInput = {
  theme: string;
  rulesetId?: string;
  districtIds?: string[];
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export type GeneratedFactionResult = GeneratedTextResult;

export async function createFaction(
  client: OllamaTextClient,
  input: CreateFactionInput,
): Promise<GeneratedFactionResult> {
  return generateWithRepair({
    client,
    system: createFactionPrompt.system,
    prompt: createFactionPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      districtIds: input.districtIds,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
    repair: input.repair,
    kindLabel: 'faction',
    validate: validateGeneratedFaction,
  });
}
