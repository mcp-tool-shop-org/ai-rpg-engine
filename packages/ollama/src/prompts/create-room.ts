// Prompt: generate a schema-valid room definition

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createRoomPrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML room definitions that conform to the engine's content schema.

A RoomDefinition has:
  id: string (lowercase_snake_case)
  name: string
  zones: array of ZoneDefinition (2–5 zones recommended)
  tags: optional string array
  ambientText: optional array of { text: string }
  hazards: optional string array
  exits: optional array of { targetZoneId: string, label?: string }

Each ZoneDefinition has:
  id: string (lowercase_snake_case)
  name: string
  tags: optional string array
  description: optional array of { text: string }
  neighbors: optional string array (other zone IDs in this room)
  light: optional number (0.0–1.0, default ~0.7)
  noise: optional number (0.0–1.0, default ~0.3)
  hazards: optional string array
  entities: optional string array
  exits: optional array of { targetZoneId: string, label?: string }

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case
- Zones should reference each other via neighbors for connectivity
- Use the theme and constraints to guide the content
- Keep descriptions evocative but concise (1–2 sentences per text block)
- Prefer 2–5 zones per room
- Do not invent schema fields that aren't listed above`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const districtId = ctx['districtId'] as string | undefined;
    const existingZones = ctx['existingZones'] as string[] | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;

    let prompt = `Generate a room definition with theme: "${theme}"`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (districtId) prompt += `\nDistrict: ${districtId}`;
    if (existingZones?.length) {
      prompt += `\nExisting zone IDs nearby (for exits): ${existingZones.join(', ')}`;
    }
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
