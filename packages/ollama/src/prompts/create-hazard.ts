// Prompt: generate a schema-valid hazard definition

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createHazardPrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML hazard definitions that conform to the engine's HazardDefinition schema.

A HazardDefinition has:
  id: string (lowercase_snake_case, required)
  trigger: string (required, e.g. on-enter, on-tick, on-exit)
  effects: array of objects (required), each with kind and optional amount/params
  name: optional string
  moveCostDelta: optional number
  passable: optional string
  blocksVision: optional boolean
  weatherConditions: optional array of strings
  immuneTags: optional array of strings
  tags: optional array of strings

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case
- effects is required and must be a non-empty array of objects
- Prefer a single damage or apply-status effect unless the theme needs more
- Do not invent schema fields that aren't listed above`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;

    let prompt = `Generate a hazard definition with theme: "${theme}"`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    if (sessionContext) prompt += `\n\nSession context:\n${sessionContext}`;
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
