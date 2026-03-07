// Prompt: generate a schema-valid quest definition

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createQuestPrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML quest definitions that conform to the engine's content schema.

A QuestDefinition has:
  id: string (lowercase_snake_case)
  name: string
  stages: array of QuestStage (at least 2)
  triggers: optional array of TriggerDefinition
  rewards: optional array of { type: string, params: object }
  failConditions: optional array of { type: string, params: object }

Each QuestStage has:
  id: string (lowercase_snake_case)
  name: string
  description: optional string
  objectives: optional string array (what the player must do)
  triggers: optional array of { event: string, effect: { type: string, params: object } }
  nextStage: optional string (ID of the next stage)
  failStage: optional string (ID of failure stage)

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case
- Stages should form a clear progression with at least one success and one failure path
- Triggers should reference believable engine events
- If factions are specified, weave them into objectives and triggers
- If districts are specified, ground stages in those locations
- Keep descriptions concise and action-oriented`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const factions = ctx['factions'] as string[] | undefined;
    const districts = ctx['districts'] as string[] | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;

    let prompt = `Generate a quest definition with theme: "${theme}"`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (factions?.length) {
      prompt += `\nFactions involved: ${factions.join(', ')}`;
    }
    if (districts?.length) {
      prompt += `\nDistricts: ${districts.join(', ')}`;
    }
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    if (sessionContext) prompt += `\n\nSession context:\n${sessionContext}`;
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
