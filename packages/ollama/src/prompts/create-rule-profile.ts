// Prompt: generate a ContentPack.ruleProfiles entry (PackRuleProfile)

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createRuleProfilePrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce a YAML rule profile: a per-archetype combat stat mapping that
ContentPack.ruleProfiles (keyed by id) consumes.

A rule profile has:
  id: string (lowercase_snake_case, required — the registry key entities bind
    to via EntityBlueprint.ruleProfileId)
  statMapping: required object with exactly three fields, each a
    lowercase_snake_case stat name from the active ruleset:
    attack: string (required — the stat driving offense)
    precision: string (required — the stat driving accuracy/hit chance)
    resolve: string (required — the stat driving defense/composure)

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All ids and stat names must be lowercase_snake_case
- statMapping's three values should be genre-appropriate stat names for the theme
  (e.g. a gritty brawler ruleset might map attack -> brawn, precision -> reflex, resolve -> grit)
- Do not invent schema fields that aren't listed above (formulaOverrides is reserved and unused)`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;
    const id = ctx['id'] as string | undefined;

    let prompt = `Generate a rule profile with theme: "${theme}"`;
    if (id) prompt += `\nid must be exactly: ${id}`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    if (sessionContext) prompt += `\n\nSession context:\n${sessionContext}`;
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
