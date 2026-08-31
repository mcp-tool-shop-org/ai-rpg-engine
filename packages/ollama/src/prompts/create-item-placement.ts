// Prompt: generate a ContentPack.itemPlacements record (authored giveItem)

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createItemPlacementPrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML ItemPlacementRecord documents that ContentPack.itemPlacements
consumes — placing a catalog item onto an entity's inventory at intake.

An item placement has:
  itemId: string (required, an ItemDefinition.id from the pack's items catalog)
  entityId: string (required, an EntityBlueprint.id)

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case
- Prefer existing item and entity ids from session context when they match the theme
- Do not invent schema fields that aren't listed above (this is not entity.inventory —
  it is the overlay path for kitting an already-authored entity with a catalog item)`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;
    const itemId = ctx['itemId'] as string | undefined;
    const entityId = ctx['entityId'] as string | undefined;

    let prompt = `Generate an item placement with theme: "${theme}"`;
    if (itemId) prompt += `\nItem id: ${itemId}`;
    if (entityId) prompt += `\nEntity id: ${entityId}`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    if (sessionContext) prompt += `\n\nSession context:\n${sessionContext}`;
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
