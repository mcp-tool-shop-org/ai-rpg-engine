// Prompt: generate a coherent location pack (district + rooms + zones)

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createLocationPackPrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML location packs: a coherent district with multiple rooms that belong to it.

A location pack is a YAML document with three top-level keys:

district:
  id: string (lowercase_snake_case)
  name: string
  zoneIds: string array (every zone ID from all rooms below)
  tags: string array
  controllingFaction: optional string
  baseMetrics: optional object
    alertPressure: number (0–100)
    rumorDensity: number (0–100)
    intruderLikelihood: number (0–100)
    surveillance: number (0–100)
    stability: number (0.0–1.0)

rooms:
  - id: string (lowercase_snake_case)
    name: string
    zones:
      - id: string (lowercase_snake_case)
        name: string
        tags: optional string array
        neighbors: optional string array (other zone IDs)
        light: optional number (0.0–1.0)
        noise: optional number (0.0–1.0)
        hazards: optional string array
        entities: optional string array
    tags: optional string array
    ambientText: optional array of { text: string }
    hazards: optional string array
    exits: optional array of { targetZoneId: string }

Coherency rules:
- The district.zoneIds MUST list every zone ID defined in every room
- Rooms within the pack should share a consistent atmosphere
- Zone neighbors should connect logically within each room
- Cross-room connectivity uses exits with targetZoneId referencing zones in other rooms
- Generate 2–4 rooms with 2–4 zones each
- The pack should tell a spatial story that fits the theme

General rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const factions = ctx['factions'] as string[] | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;

    let prompt = `Generate a location pack with theme: "${theme}"`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (factions?.length) {
      prompt += `\nKnown factions: ${factions.join(', ')}`;
    }
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    if (sessionContext) prompt += `\n\nSession context:\n${sessionContext}`;
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
