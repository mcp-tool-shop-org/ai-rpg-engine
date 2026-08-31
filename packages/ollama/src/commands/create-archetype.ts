// Command: create-archetype — theme in, schema-valid YAML chargen class out

import type { OllamaTextClient } from '../client.js';
import { createArchetypePrompt } from '../prompts/create-archetype.js';
import { validateGeneratedArchetype } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateArchetypeInput = {
  theme: string;
  rulesetId?: string;
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export type GeneratedArchetypeResult = GeneratedTextResult;

export async function createArchetype(
  client: OllamaTextClient,
  input: CreateArchetypeInput,
): Promise<GeneratedArchetypeResult> {
  return generateWithRepair({
    client,
    system: createArchetypePrompt.system,
    prompt: createArchetypePrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
    repair: input.repair,
    kindLabel: 'archetype',
    validate: validateGeneratedArchetype,
  });
}
