// Prompt: generate a schema-valid item definition

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createItemPrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML item definitions that conform to the engine's ItemDefinition schema.

An ItemDefinition has:
  id: string (lowercase_snake_case, required)
  name: optional string
  description: optional string
  slot: optional string (e.g. weapon, armor, trinket, none)
  rarity: optional string (e.g. common, uncommon, rare, mythic)
  statModifiers: optional map of stat name → number
  resourceModifiers: optional map of resource name → number
  grantedTags: optional array of strings
  grantedVerbs: optional array of strings
  requiredTags: optional array of strings

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case
- id is required; give name and a one-line description
- Prefer a single slot and small statModifiers unless the theme needs more
- Do not invent schema fields that aren't listed above`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;

    let prompt = `Generate an item definition with theme: "${theme}"`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    if (sessionContext) prompt += `\n\nSession context:\n${sessionContext}`;
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
