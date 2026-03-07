// Prompt: generate a district configuration draft

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createDistrictPrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML district configuration drafts for the engine's district-core module.

A DistrictDefinition has:
  id: string (lowercase_snake_case)
  name: string
  zoneIds: string array (zones belonging to this district, lowercase_snake_case, at least 2)
  tags: string array (e.g. commercial, contested, sacred, industrial, residential)
  controllingFaction: optional string (faction ID that controls this district)
  baseMetrics: optional object with any of:
    alertPressure: number (0–100, rises from combat/hostile events, default 0)
    rumorDensity: number (0–100, rises from rumor propagation, default 0)
    intruderLikelihood: number (0–100, rises from non-faction sightings, default 0)
    surveillance: number (0–100, faction watchfulness, default 0)
    stability: number (0.0–1.0, environmental stability, default 1.0)

Design context for the engine:
- Districts aggregate zone-level events into spatial pressure
- High alertPressure triggers faction responses
- High rumorDensity accelerates information spread
- High intruderLikelihood triggers increased surveillance
- Low stability means environmental hazards affect the district
- A controllingFaction's beliefs are shaped by district events

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case
- Generate 3–6 zone IDs that fit the theme
- Tags should reflect the district's character and drive module behavior
- BaseMetrics should tell a story — a tense district starts with elevated pressure
- If a controlling faction is implied by the theme, include it`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const factions = ctx['factions'] as string[] | undefined;
    const existingZones = ctx['existingZones'] as string[] | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;

    let prompt = `Generate a district configuration with theme: "${theme}"`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (factions?.length) {
      prompt += `\nKnown factions: ${factions.join(', ')}`;
    }
    if (existingZones?.length) {
      prompt += `\nExisting zone IDs (may include): ${existingZones.join(', ')}`;
    }
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
