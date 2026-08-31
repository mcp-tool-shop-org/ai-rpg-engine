// Command: create-entity-ai — theme in, schema-valid YAML EntityAiState overlay out

import type { OllamaTextClient } from '../client.js';
import { createEntityAiPrompt } from '../prompts/create-entity-ai.js';
import { validateGeneratedEntityAi } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateEntityAiInput = {
  theme: string;
  rulesetId?: string;
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
  entityId?: string;
};

export type GeneratedEntityAiResult = GeneratedTextResult;

export async function createEntityAi(
  client: OllamaTextClient,
  input: CreateEntityAiInput,
): Promise<GeneratedEntityAiResult> {
  const constraints = [
    ...(input.constraints ?? []),
    ...(input.entityId ? [`entityId must be ${input.entityId}`] : []),
  ];
  return generateWithRepair({
    client,
    system: createEntityAiPrompt.system,
    prompt: createEntityAiPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      constraints: constraints.length > 0 ? constraints : undefined,
      sessionContext: input.sessionContext,
      entityId: input.entityId,
    }),
    repair: input.repair,
    kindLabel: 'entity AI overlay',
    validate: validateGeneratedEntityAi,
  });
}
