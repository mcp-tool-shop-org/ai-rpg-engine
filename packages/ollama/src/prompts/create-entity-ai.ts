// Prompt: generate a ContentPack.entityAi overlay for one NPC

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createEntityAiPrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML EntityAiState overlays that ContentPack.entityAi consumes.

An overlay has:
  entityId: string (lowercase_snake_case, the EntityBlueprint.id this brain belongs to)
  profileId: string (required, lowercase_snake_case intent profile name)
  goals: optional string array (2–4 concrete goals)
  fears: optional string array (1–3 fears)
  alertLevel: optional number between 0 and 1

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case
- Invent goals and fears from the theme — a name is not enough
- Do not invent schema fields that aren't listed above`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;
    const entityId = ctx['entityId'] as string | undefined;

    let prompt = `Generate an NPC AI overlay with theme: "${theme}"`;
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
