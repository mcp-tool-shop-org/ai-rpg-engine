// Command: create-ability — theme in, schema-valid YAML ability out

import type { OllamaTextClient } from '../client.js';
import { createAbilityPrompt } from '../prompts/create-ability.js';
import { validateGeneratedAbility } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateAbilityInput = {
  theme: string;
  rulesetId?: string;
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export type GeneratedAbilityResult = GeneratedTextResult;

export async function createAbility(
  client: OllamaTextClient,
  input: CreateAbilityInput,
): Promise<GeneratedAbilityResult> {
  return generateWithRepair({
    client,
    system: createAbilityPrompt.system,
    prompt: createAbilityPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
    repair: input.repair,
    kindLabel: 'ability',
    validate: validateGeneratedAbility,
  });
}
