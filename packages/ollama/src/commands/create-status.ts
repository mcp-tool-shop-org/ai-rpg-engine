// Command: create-status — theme in, schema-valid YAML status out

import type { OllamaTextClient } from '../client.js';
import { createStatusPrompt } from '../prompts/create-status.js';
import { validateGeneratedStatus } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateStatusInput = {
  theme: string;
  rulesetId?: string;
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export type GeneratedStatusResult = GeneratedTextResult;

export async function createStatus(
  client: OllamaTextClient,
  input: CreateStatusInput,
): Promise<GeneratedStatusResult> {
  return generateWithRepair({
    client,
    system: createStatusPrompt.system,
    prompt: createStatusPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
    repair: input.repair,
    kindLabel: 'status',
    validate: validateGeneratedStatus,
  });
}
