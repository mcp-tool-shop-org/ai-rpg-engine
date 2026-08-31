// Prompt: generate a schema-valid chargen archetype (class)

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createArchetypePrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML chargen archetypes that conform to ArchetypeDefinition.

An ArchetypeDefinition has:
  id: string (lowercase_snake_case, required)
  name: string (required)
  description: string (required, 1–3 sentences)
  statPriorities: object mapping stat names to numbers (required, e.g. might: 2, wit: 1)
  resourceOverrides: optional object mapping resource names to numbers
  startingTags: required string array (2–4 tags)
  startingInventory: optional string array of item ids
  progressionTreeId: string (required, lowercase_snake_case)
  grantedVerbs: optional string array

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case
- Prefer 2–4 startingTags the simulation can filter on
- statPriorities should name 2–4 stats with small integers
- Do not invent schema fields that aren't listed above`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;

    let prompt = `Generate a player class / archetype with theme: "${theme}"`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    if (sessionContext) prompt += `\n\nSession context:\n${sessionContext}`;
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
