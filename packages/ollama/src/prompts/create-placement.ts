// Prompt: generate a ContentPack.placements record

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createPlacementPrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML EntityPlacementRecord documents that ContentPack.placements consumes.

A placement has:
  entityId: string (required, an EntityBlueprint.id)
  zoneId: string (required, a ZoneDefinition.id)
  spawnCondition: optional ConditionSpec object — omit unless the theme needs a gate

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case
- Prefer existing entity and zone ids from session context when they match the theme
- Do not invent schema fields that aren't listed above`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;
    const entityId = ctx['entityId'] as string | undefined;
    const zoneId = ctx['zoneId'] as string | undefined;

    let prompt = `Generate an entity placement with theme: "${theme}"`;
    if (entityId) prompt += `\nEntity id: ${entityId}`;
    if (zoneId) prompt += `\nZone id: ${zoneId}`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    if (sessionContext) prompt += `\n\nSession context:\n${sessionContext}`;
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
