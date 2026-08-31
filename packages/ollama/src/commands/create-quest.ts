// Command: create-quest — theme in, schema-valid quest YAML out

import type { OllamaTextClient } from '../client.js';
import { createQuestPrompt } from '../prompts/create-quest.js';
import { validateGeneratedQuest } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateQuestInput = {
  theme: string;
  rulesetId?: string;
  factions?: string[];
  districts?: string[];
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export type GeneratedQuestResult = GeneratedTextResult;

export async function createQuest(
  client: OllamaTextClient,
  input: CreateQuestInput,
): Promise<GeneratedQuestResult> {
  return generateWithRepair({
    client,
    system: createQuestPrompt.system,
    prompt: createQuestPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      factions: input.factions,
      districts: input.districts,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
    repair: input.repair,
    kindLabel: 'quest',
    validate: validateGeneratedQuest,
  });
}
