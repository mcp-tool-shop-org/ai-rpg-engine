// Command: create-item — theme in, schema-valid YAML item out

import type { OllamaTextClient } from '../client.js';
import { createItemPrompt } from '../prompts/create-item.js';
import { validateGeneratedItem } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateItemInput = {
  theme: string;
  rulesetId?: string;
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export type GeneratedItemResult = GeneratedTextResult;

export async function createItem(
  client: OllamaTextClient,
  input: CreateItemInput,
): Promise<GeneratedItemResult> {
  return generateWithRepair({
    client,
    system: createItemPrompt.system,
    prompt: createItemPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
    repair: input.repair,
    kindLabel: 'item',
    validate: validateGeneratedItem,
  });
}
