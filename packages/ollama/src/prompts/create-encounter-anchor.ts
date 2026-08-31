// Prompt: generate a ContentPack.encounterAnchors record (spawn SET)

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createEncounterAnchorPrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML EncounterAnchorRecord documents that ContentPack.encounterAnchors consumes.
A spawn SET is one blueprint that encounter-spawn rolls into N probabilistic encounters with cooldown.

An EncounterAnchorRecord has:
  id: string (required, lowercase_snake_case)
  zoneId: string (required, a ZoneDefinition.id the ambush/patrol rolls in)
  encounterType: string (required, one of: ambush, patrol, horde, duel)
  enemyIds: required string array of EntityBlueprint.id values to clone as participants
  probability: number (required, spawn chance in [0, 1] — not a percent)
  cooldownTurns: number (required, non-negative integer rounds before the zone can roll again)
  tags: required string array (1–4 tags the simulation can filter on)

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case
- Prefer existing zone and enemy ids from session context when they match the theme
- encounterType must be exactly ambush, patrol, horde, or duel — never boss-fight or solo
- probability is a fraction (e.g. 0.35), never 35
- Do not invent schema fields that aren't listed above`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;
    const zoneId = ctx['zoneId'] as string | undefined;
    const enemies = ctx['enemies'] as string[] | undefined;

    let prompt = `Generate an encounter anchor (spawn SET) with theme: "${theme}"`;
    if (zoneId) prompt += `\nZone id: ${zoneId}`;
    if (enemies?.length) prompt += `\nEnemy ids: ${enemies.join(', ')}`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    if (sessionContext) prompt += `\n\nSession context:\n${sessionContext}`;
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
