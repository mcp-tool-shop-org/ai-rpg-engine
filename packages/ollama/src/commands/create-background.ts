// Command: create-background — theme in, schema-valid YAML chargen origin out

import type { OllamaTextClient } from '../client.js';
import { createBackgroundPrompt } from '../prompts/create-background.js';
import { validateGeneratedBackground } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateBackgroundInput = {
  theme: string;
  rulesetId?: string;
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export type GeneratedBackgroundResult = GeneratedTextResult;

export async function createBackground(
  client: OllamaTextClient,
  input: CreateBackgroundInput,
): Promise<GeneratedBackgroundResult> {
  return generateWithRepair({
    client,
    system: createBackgroundPrompt.system,
    prompt: createBackgroundPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
    repair: input.repair,
    kindLabel: 'background',
    validate: validateGeneratedBackground,
  });
}
