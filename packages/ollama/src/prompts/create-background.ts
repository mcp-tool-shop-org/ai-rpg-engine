// Prompt: generate a schema-valid chargen background (origin)

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createBackgroundPrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML chargen backgrounds that conform to BackgroundDefinition.

A BackgroundDefinition has:
  id: string (lowercase_snake_case, required)
  name: string (required)
  description: string (required, 1–3 sentences)
  statModifiers: object mapping stat names to numbers (required, small signed integers)
  startingTags: required string array (2–4 tags)
  startingInventory: optional string array of item ids
  factionModifiers: optional object mapping faction ids to numbers (-1 to 1)

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case
- Prefer an origin that explains how the character entered this world
- Do not invent schema fields that aren't listed above`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;

    let prompt = `Generate a player origin / background with theme: "${theme}"`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    if (sessionContext) prompt += `\n\nSession context:\n${sessionContext}`;
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
