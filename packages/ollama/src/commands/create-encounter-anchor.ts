// Command: create-encounter-anchor — theme in, schema-valid YAML spawn SET out

import type { OllamaTextClient } from '../client.js';
import { createEncounterAnchorPrompt } from '../prompts/create-encounter-anchor.js';
import { validateGeneratedEncounterAnchor } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateEncounterAnchorInput = {
  theme: string;
  rulesetId?: string;
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
  zoneId?: string;
  enemies?: string[];
};

export type GeneratedEncounterAnchorResult = GeneratedTextResult;

export async function createEncounterAnchor(
  client: OllamaTextClient,
  input: CreateEncounterAnchorInput,
): Promise<GeneratedEncounterAnchorResult> {
  const constraints = [
    ...(input.constraints ?? []),
    ...(input.zoneId ? [`zoneId must be ${input.zoneId}`] : []),
    ...(input.enemies?.length ? [`enemyIds must include: ${input.enemies.join(', ')}`] : []),
  ];
  return generateWithRepair({
    client,
    system: createEncounterAnchorPrompt.system,
    prompt: createEncounterAnchorPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      constraints: constraints.length > 0 ? constraints : undefined,
      sessionContext: input.sessionContext,
      zoneId: input.zoneId,
      enemies: input.enemies,
    }),
    repair: input.repair,
    kindLabel: 'encounter anchor',
    validate: validateGeneratedEncounterAnchor,
  });
}
