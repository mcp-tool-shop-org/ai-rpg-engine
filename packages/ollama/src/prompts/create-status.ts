// Prompt: generate a schema-valid status definition

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createStatusPrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML status definitions that conform to the engine's StatusDefinition schema.

A StatusDefinition has:
  id: string (lowercase_snake_case)
  name: string
  tags: array of strings (required)
  stacking: replace | stack | refresh (required)
  maxStacks: optional number
  duration: optional { type: ticks | permanent | conditional, value?: number }
  modifiers: optional array of { stat: string, operation: add | multiply, value: number }
  triggers: optional array of { event: string, effect: { type: string, params: object } }
  removal: optional array of { type: string, params: object }

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case
- stacking is required; prefer refresh for DoTs and replace for control
- Give 1–3 tags (e.g. debuff, fire, control)
- Keep modifiers small and named after plausible stats
- Do not invent schema fields that aren't listed above`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;

    let prompt = `Generate a status definition with theme: "${theme}"`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    if (sessionContext) prompt += `\n\nSession context:\n${sessionContext}`;
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
