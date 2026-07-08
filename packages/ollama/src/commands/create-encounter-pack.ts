// Command: create-encounter-pack — theme in, room + entities + quest YAML out

import type { OllamaTextClient } from '../client.js';
import { createEncounterPackPrompt } from '../prompts/create-encounter-pack.js';
import { extractYaml } from '../parsers.js';
import { parseYamlish, validateGeneratedEncounterPack } from '../validators.js';
import type { GeneratedContentResult } from '../validators.js';

export type CreateEncounterPackInput = {
  theme: string;
  rulesetId?: string;
  districtId?: string;
  factions?: string[];
  difficulty?: string;
  constraints?: string[];
  sessionContext?: string;
};

export type GeneratedEncounterPackResult = {
  ok: true;
  yaml: string;
  /** Schema check of the draft (v2.5 audit PA-4) — advisory unless the CLI --validate gate is on. */
  validation: GeneratedContentResult;
} | {
  ok: false;
  error: string;
};

export async function createEncounterPack(
  client: OllamaTextClient,
  input: CreateEncounterPackInput,
): Promise<GeneratedEncounterPackResult> {
  const result = await client.generate({
    system: createEncounterPackPrompt.system,
    prompt: createEncounterPackPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      districtId: input.districtId,
      factions: input.factions,
      difficulty: input.difficulty,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
  });

  if (!result.ok) return result;
  const yaml = extractYaml(result.text);
  return { ok: true, yaml, validation: validateGeneratedEncounterPack(yaml, parseYamlish(yaml)) };
}
