// Command: create-encounter-pack — theme in, room + entities + quest YAML out

import type { OllamaTextClient } from '../client.js';
import { createEncounterPackPrompt } from '../prompts/create-encounter-pack.js';
import { validateGeneratedEncounterPack } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateEncounterPackInput = {
  theme: string;
  rulesetId?: string;
  districtId?: string;
  factions?: string[];
  difficulty?: string;
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export type GeneratedEncounterPackResult = GeneratedTextResult;

export async function createEncounterPack(
  client: OllamaTextClient,
  input: CreateEncounterPackInput,
): Promise<GeneratedEncounterPackResult> {
  return generateWithRepair({
    client,
    system: createEncounterPackPrompt.system,
    prompt: createEncounterPackPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      districtId: input.districtId,
      factions: input.factions,
      difficulty: input.difficulty,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
    repair: input.repair,
    kindLabel: 'encounter pack',
    validate: validateGeneratedEncounterPack,
  });
}
