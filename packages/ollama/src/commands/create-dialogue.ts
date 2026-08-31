// Command: create-dialogue — theme in, schema-valid YAML dialogue tree out

import type { OllamaTextClient } from '../client.js';
import { createDialoguePrompt } from '../prompts/create-dialogue.js';
import { validateGeneratedDialogue } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateDialogueInput = {
  theme: string;
  rulesetId?: string;
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export type GeneratedDialogueResult = GeneratedTextResult;

export async function createDialogue(
  client: OllamaTextClient,
  input: CreateDialogueInput,
): Promise<GeneratedDialogueResult> {
  return generateWithRepair({
    client,
    system: createDialoguePrompt.system,
    prompt: createDialoguePrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
    repair: input.repair,
    kindLabel: 'dialogue',
    validate: validateGeneratedDialogue,
  });
}
