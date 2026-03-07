// Command: create-encounter-pack — theme in, room + entities + quest YAML out

import type { OllamaTextClient } from '../client.js';
import { createEncounterPackPrompt } from '../prompts/create-encounter-pack.js';
import { extractYaml } from '../parsers.js';

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
  return { ok: true, yaml: extractYaml(result.text) };
}
