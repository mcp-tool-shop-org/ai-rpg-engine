// Command: create-ruleset — theme in, schema-valid YAML RulesetDefinition out

import type { OllamaTextClient } from '../client.js';
import { createRulesetPrompt } from '../prompts/create-ruleset.js';
import { validateGeneratedRuleset } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateRulesetInput = {
  theme: string;
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export type GeneratedRulesetResult = GeneratedTextResult;

export async function createRuleset(
  client: OllamaTextClient,
  input: CreateRulesetInput,
): Promise<GeneratedRulesetResult> {
  return generateWithRepair({
    client,
    system: createRulesetPrompt.system,
    prompt: createRulesetPrompt.render({
      theme: input.theme,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
    repair: input.repair,
    kindLabel: 'ruleset',
    validate: validateGeneratedRuleset,
  });
}
