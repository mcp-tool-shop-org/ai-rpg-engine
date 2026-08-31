// Prompt: generate a schema-valid entity blueprint

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createEntityPrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML entity blueprints that conform to the engine's EntityBlueprint schema.

An EntityBlueprint has:
  id: string (lowercase_snake_case)
  type: string (npc, creature, or similar)
  name: string
  tags: optional string array
  baseStats: optional object mapping stat names to numbers
  baseResources: optional object mapping resource names to numbers (e.g. hp)
  startingStatuses: optional string array of status ids
  inventory: optional string array of item ids
  equipment: optional object mapping slot names to item ids
  aiProfile: optional string
  scripts: optional string array

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case
- Prefer type: npc unless the theme is a creature or object
- Give 2–4 tags that the simulation can filter on
- Keep baseStats/baseResources small and plausible
- Do not invent schema fields that aren't listed above`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;

    let prompt = `Generate an entity blueprint with theme: "${theme}"`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    if (sessionContext) prompt += `\n\nSession context:\n${sessionContext}`;
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
