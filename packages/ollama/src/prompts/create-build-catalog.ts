// Prompt: generate a schema-valid chargen BuildCatalog

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createBuildCatalogPrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML BuildCatalog documents that chargen consumes via extractSessionContent.

A BuildCatalog has:
  packId: string (lowercase_snake_case)
  statBudget: number (e.g. 6)
  maxTraits: number (required)
  requiredFlaws: number (required, 0 or 1 for most packs)
  archetypes: array of ArchetypeDefinition (id, name, description, statPriorities, startingTags, progressionTreeId)
  backgrounds: array of BackgroundDefinition (id, name, description, statModifiers, startingTags)
  traits: array of TraitDefinition, each:
    id: string
    name: string
    description: string
    category: perk or flaw
    effects: array of { type: stat-modifier, stat: string, amount: number } or similar
    incompatibleWith: optional string array of trait ids
  disciplines: optional array
  crossTitles: optional array
  entanglements: optional array

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case
- Include at least 2 archetypes, 2 backgrounds, 2 perks, and enough flaws to satisfy requiredFlaws
- If requiredFlaws is 1, include at least 2 mutually compatible flaw traits
- requiredFlaws must not exceed maxTraits
- Do not invent schema fields that aren't listed above`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;

    let prompt = `Generate a character-creation build catalog with theme: "${theme}"`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    if (sessionContext) prompt += `\n\nSession context:\n${sessionContext}`;
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
