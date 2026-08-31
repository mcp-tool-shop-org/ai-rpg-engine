// Prompt: generate a schema-valid RulesetDefinition

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createRulesetPrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML RulesetDefinition documents — the declarative contract the
rest of a game's content (abilities, statuses, entities) is written against.

A RulesetDefinition has:
  id: string (lowercase_snake_case or lowercase-kebab-case, required)
  name: string (required)
  version: string (semver-ish, e.g. "0.1.0", required)
  stats: array of { id, name, min?, max?, default } (required, at least 1)
  resources: array of { id, name, min?, max?, default, regenRate? } (required, at least 1; almost always include "hp")
  verbs: array of { id, name, tags?, description? } (required, at least 1; unique ids — no duplicates)
  formulas: array of { id, name, description?, inputs, output } (required array, may be empty)
  defaultModules: array of strings naming engine modules this ruleset expects (required array, may be empty)
  progressionModels: array of strings (required array, may be empty)

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All ids must be lowercase_snake_case (stat/resource/verb/formula ids)
- Keep stats and resources small and thematic (3-6 stats, 2-4 resources) — do not invent a sprawling simulation
- Every verb needs a short one-line description
- Do not invent schema fields that aren't listed above`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const constraints = ctx['constraints'] as string[] | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;

    let prompt = `Generate a ruleset with theme: "${theme}"`;
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    if (sessionContext) prompt += `\n\nSession context:\n${sessionContext}`;
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
