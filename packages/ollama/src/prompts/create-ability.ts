// Prompt: generate a schema-valid ability definition

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createAbilityPrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML ability definitions that conform to the engine's AbilityDefinition schema.

An AbilityDefinition has:
  id: string (lowercase_snake_case)
  name: string
  verb: string (the action word, e.g. strike, cast, fire)
  tags: array of strings (required, at least empty)
  costs: optional array of { resourceId: string, amount: number }
  target: object with required type: self | single | zone | all-enemies | none
    optional: range (number), filter (string array),
    scope (self|single|all), affiliation (ally|enemy|any),
    life (alive|dead|any), includeSelf (boolean)
  checks: optional array of { stat: string, difficulty: number }
  effects: array of { type: string, target?: actor|target|zone, params: object }
  cooldown: optional number
  requirements: optional array of { type: string, params: object }

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case
- effects is required and must be a non-empty array
- Prefer a single damage, heal, or apply-status effect unless the theme needs more
- Do not invent schema fields that aren't listed above`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;

    let prompt = `Generate an ability definition with theme: "${theme}"`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    if (sessionContext) prompt += `\n\nSession context:\n${sessionContext}`;
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
