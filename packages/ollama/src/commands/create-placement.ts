// Command: create-placement — theme in, schema-valid YAML {entityId, zoneId} out

import type { OllamaTextClient } from '../client.js';
import { createPlacementPrompt } from '../prompts/create-placement.js';
import { validateGeneratedPlacement } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreatePlacementInput = {
  theme?: string;
  rulesetId?: string;
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
  entityId?: string;
  zoneId?: string;
};

export type GeneratedPlacementResult = GeneratedTextResult;

export function placementYaml(entityId: string, zoneId: string): string {
  return `entityId: ${entityId}\nzoneId: ${zoneId}\n`;
}

export function placementRecordId(entityId: string, zoneId: string): string {
  return `${entityId}@${zoneId}`;
}

export async function createPlacement(
  client: OllamaTextClient,
  input: CreatePlacementInput,
): Promise<GeneratedPlacementResult> {
  if (input.entityId && input.zoneId) {
    const yaml = placementYaml(input.entityId, input.zoneId);
    return {
      ok: true,
      yaml,
      validation: validateGeneratedPlacement(yaml, { entityId: input.entityId, zoneId: input.zoneId }),
    };
  }
  const constraints = [
    ...(input.constraints ?? []),
    ...(input.entityId ? [`entityId must be ${input.entityId}`] : []),
    ...(input.zoneId ? [`zoneId must be ${input.zoneId}`] : []),
  ];
  return generateWithRepair({
    client,
    system: createPlacementPrompt.system,
    prompt: createPlacementPrompt.render({
      theme: input.theme ?? 'placement',
      rulesetId: input.rulesetId,
      constraints: constraints.length > 0 ? constraints : undefined,
      sessionContext: input.sessionContext,
      entityId: input.entityId,
      zoneId: input.zoneId,
    }),
    repair: input.repair,
    kindLabel: 'placement',
    validate: validateGeneratedPlacement,
  });
}
