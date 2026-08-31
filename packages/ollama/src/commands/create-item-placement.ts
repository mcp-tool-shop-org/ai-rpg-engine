// Command: create-item-placement — theme in, schema-valid YAML {itemId, entityId} out
// Overlay path for giving a catalog item to an already-authored/imported
// entity — the item-catalog analogue of create-placement.ts's {entityId, zoneId}.

import type { OllamaTextClient } from '../client.js';
import { createItemPlacementPrompt } from '../prompts/create-item-placement.js';
import { validateGeneratedItemPlacement } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateItemPlacementInput = {
  theme?: string;
  rulesetId?: string;
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
  itemId?: string;
  entityId?: string;
};

export type GeneratedItemPlacementResult = GeneratedTextResult;

export function itemPlacementYaml(itemId: string, entityId: string): string {
  return `itemId: ${itemId}\nentityId: ${entityId}\n`;
}

export function itemPlacementRecordId(itemId: string, entityId: string): string {
  return `${itemId}@${entityId}`;
}

export async function createItemPlacement(
  client: OllamaTextClient,
  input: CreateItemPlacementInput,
): Promise<GeneratedItemPlacementResult> {
  if (input.itemId && input.entityId) {
    const yaml = itemPlacementYaml(input.itemId, input.entityId);
    return {
      ok: true,
      yaml,
      validation: validateGeneratedItemPlacement(yaml, { itemId: input.itemId, entityId: input.entityId }),
    };
  }
  const constraints = [
    ...(input.constraints ?? []),
    ...(input.itemId ? [`itemId must be ${input.itemId}`] : []),
    ...(input.entityId ? [`entityId must be ${input.entityId}`] : []),
  ];
  return generateWithRepair({
    client,
    system: createItemPlacementPrompt.system,
    prompt: createItemPlacementPrompt.render({
      theme: input.theme ?? 'item placement',
      rulesetId: input.rulesetId,
      constraints: constraints.length > 0 ? constraints : undefined,
      sessionContext: input.sessionContext,
      itemId: input.itemId,
      entityId: input.entityId,
    }),
    repair: input.repair,
    kindLabel: 'item placement',
    validate: validateGeneratedItemPlacement,
  });
}
