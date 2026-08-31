// Command: create-location-pack — theme in, district + rooms YAML out

import type { OllamaTextClient } from '../client.js';
import { createLocationPackPrompt } from '../prompts/create-location-pack.js';
import { validateGeneratedLocationPack } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateLocationPackInput = {
  theme: string;
  rulesetId?: string;
  factions?: string[];
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export type GeneratedLocationPackResult = GeneratedTextResult;

export async function createLocationPack(
  client: OllamaTextClient,
  input: CreateLocationPackInput,
): Promise<GeneratedLocationPackResult> {
  return generateWithRepair({
    client,
    system: createLocationPackPrompt.system,
    prompt: createLocationPackPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      factions: input.factions,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
    repair: input.repair,
    kindLabel: 'location pack',
    validate: validateGeneratedLocationPack,
  });
}
