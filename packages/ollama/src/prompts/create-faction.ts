// Prompt: generate a faction configuration draft

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createFactionPrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML faction configuration drafts for the engine's faction-cognition module.

A faction configuration has:
  id: string (lowercase_snake_case)
  name: string
  tags: optional string array (e.g. religious, militant, secretive)
  members: array of entity IDs (lowercase_snake_case) — at least 1
  cohesion: number (0.0–1.0, how unified the faction is)
  goals: optional string array (short phrases describing faction objectives)
  districtIds: optional string array (districts this faction operates in)
  attitudes: optional object mapping other faction IDs to number (-1.0 to 1.0)
  rumorHooks: optional array of short strings (events/beliefs this faction cares about)
  initialBeliefs: optional array of objects:
    subject: string (entity or concept being believed about)
    key: string (belief attribute)
    value: string or number or boolean
    confidence: number (0.0–1.0)

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case
- Generate 2–5 members with descriptive IDs
- Goals should reflect the theme and drive simulation behavior
- Rumor hooks should connect to believable world events
- Attitudes toward other factions should be justified by the theme
- Keep descriptions tight — this is config, not prose`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const districtIds = ctx['districtIds'] as string[] | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;

    let prompt = `Generate a faction configuration with theme: "${theme}"`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (districtIds?.length) {
      prompt += `\nDistricts: ${districtIds.join(', ')}`;
    }
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
