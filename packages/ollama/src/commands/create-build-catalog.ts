// Command: create-build-catalog — theme in, schema-valid YAML BuildCatalog out

import type { OllamaTextClient } from '../client.js';
import { createBuildCatalogPrompt } from '../prompts/create-build-catalog.js';
import { validateGeneratedBuildCatalog } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateBuildCatalogInput = {
  theme: string;
  rulesetId?: string;
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export type GeneratedBuildCatalogResult = GeneratedTextResult;

export async function createBuildCatalog(
  client: OllamaTextClient,
  input: CreateBuildCatalogInput,
): Promise<GeneratedBuildCatalogResult> {
  return generateWithRepair({
    client,
    system: createBuildCatalogPrompt.system,
    prompt: createBuildCatalogPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
    repair: input.repair,
    kindLabel: 'build catalog',
    validate: validateGeneratedBuildCatalog,
  });
}
