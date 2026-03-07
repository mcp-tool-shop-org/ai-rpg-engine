// Prompt: generate a coherent encounter pack (room + entities + quest seed)

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createEncounterPackPrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML encounter packs: a room, entity blueprints placed within it, and a quest seed that connects them.

An encounter pack is a YAML document with three top-level keys:

room:
  id: string (lowercase_snake_case)
  name: string
  zones:
    - id: string (lowercase_snake_case)
      name: string
      tags: optional string array
      neighbors: optional string array
      light: optional number (0.0–1.0)
      noise: optional number (0.0–1.0)
      hazards: optional string array
      entities: optional string array (entity blueprint IDs placed here)
  tags: optional string array
  ambientText: optional array of { text: string }

entities:
  - id: string (lowercase_snake_case)
    type: string (e.g. enemy, npc, creature, merchant)
    name: string
    tags: optional string array
    baseStats: optional object (string keys → number values, e.g. hp: 30, attack: 8)
    baseResources: optional object (string keys → number values)
    startingStatuses: optional string array (e.g. hostile, patrolling)
    inventory: optional string array
    equipment: optional object (slot → item_id)
    aiProfile: optional string (e.g. aggressive, cautious, fleeing)

quest:
  id: string (lowercase_snake_case)
  name: string
  stages:
    - id: string (lowercase_snake_case)
      name: string
  triggers: optional string array
  rewards: optional string array
  failConditions: optional string array

Coherency rules:
- Entity IDs referenced in room.zones[].entities MUST match entities[].id
- The quest should involve the entities and take place in the room
- Generate 1–3 entities and 1 quest with 2–4 stages
- Entity types and stats should fit the theme and difficulty
- Quest stages should form a logical progression

General rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const districtId = ctx['districtId'] as string | undefined;
    const factions = ctx['factions'] as string[] | undefined;
    const difficulty = ctx['difficulty'] as string | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;

    let prompt = `Generate an encounter pack with theme: "${theme}"`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (districtId) prompt += `\nDistrict: ${districtId}`;
    if (factions?.length) {
      prompt += `\nKnown factions: ${factions.join(', ')}`;
    }
    if (difficulty) prompt += `\nDifficulty: ${difficulty}`;
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
