// Prompt: generate a schema-valid ProgressionTreeDefinition

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createProgressionTreePrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML progression trees that conform to ProgressionTreeDefinition.
Chargen archetypes must name a tree via progressionTreeId; this verb authors that tree.

A ProgressionTreeDefinition has:
  id: string (required, lowercase_snake_case)
  name: string (required)
  currency: string (required, typically xp)
  nodes: required array of ProgressionNode, each with:
    id: string (required, lowercase_snake_case)
    name: string (required)
    description: optional string
    cost: number (required, non-negative)
    requires: optional string array of other node ids in THIS tree
    effects: required array of effect objects, each { type: string, params?: object }
      Prefer: resource-boost (resource, amount), stat-boost (stat, amount), grant-tag (tag)

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case
- Generate 3–6 nodes that form a small tree; later nodes may require earlier ones
- requires[] must only name ids that exist in nodes[]
- Do not invent schema fields that aren't listed above`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;

    let prompt = `Generate a progression tree with theme: "${theme}"`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    if (sessionContext) prompt += `\n\nSession context:\n${sessionContext}`;
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
