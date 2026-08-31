// Command: create-progression-tree — theme in, schema-valid YAML tree out

import type { OllamaTextClient } from '../client.js';
import { createProgressionTreePrompt } from '../prompts/create-progression-tree.js';
import { validateGeneratedProgressionTree } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateProgressionTreeInput = {
  theme: string;
  rulesetId?: string;
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export type GeneratedProgressionTreeResult = GeneratedTextResult;

export async function createProgressionTree(
  client: OllamaTextClient,
  input: CreateProgressionTreeInput,
): Promise<GeneratedProgressionTreeResult> {
  return generateWithRepair({
    client,
    system: createProgressionTreePrompt.system,
    prompt: createProgressionTreePrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
    repair: input.repair,
    kindLabel: 'progression tree',
    validate: validateGeneratedProgressionTree,
  });
}
