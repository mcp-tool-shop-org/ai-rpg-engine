// Command: create-entity — theme in, schema-valid YAML entity blueprint out

import type { OllamaTextClient } from '../client.js';
import { createEntityPrompt } from '../prompts/create-entity.js';
import { validateGeneratedEntity } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateEntityInput = {
  theme: string;
  rulesetId?: string;
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export type GeneratedEntityResult = GeneratedTextResult;

export async function createEntity(
  client: OllamaTextClient,
  input: CreateEntityInput,
): Promise<GeneratedEntityResult> {
  return generateWithRepair({
    client,
    system: createEntityPrompt.system,
    prompt: createEntityPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
    repair: input.repair,
    kindLabel: 'entity',
    validate: validateGeneratedEntity,
  });
}
