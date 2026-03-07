// Prompt: explain a district's current runtime state in narrative terms

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const explainDistrictStatePrompt: PromptTemplate = template(
  `You are an inspector for the ai-rpg-engine — a deterministic simulation engine.
You explain district runtime state to content authors in clear, narrative terms.

The engine's district system tracks five real-time metrics:
- alertPressure (0–100): rises from combat and hostile events, decays over time
- rumorDensity (0–100): rises from rumor propagation events between entities
- intruderLikelihood (0–100): rises from non-faction entity sightings in the district
- surveillance (0–100): faction watchfulness — higher means more patrols and checks
- stability (0.0–1.0): environmental stability — low means hazards affect the district

Additional context:
- threatLevel is a weighted score (0–100): alertPressure ×40% + intruderLikelihood ×35% + rumorDensity ×25%
- A district is "on alert" when alertPressure > 30
- eventCount tracks total events processed by this district
- lastUpdateTick shows when the district state was last computed

Your job:
1. Describe what the numbers mean in plain language for a content author
2. Explain what is likely happening in the district narratively
3. Identify which metrics are driving the current state
4. Suggest what a content author might do in response (add events, adjust factions, rebalance)

Keep the tone practical and concise. You are a simulation microscope, not a storyteller.`,

  (ctx) => {
    const districtId = ctx['districtId'] as string;
    const districtName = ctx['districtName'] as string | undefined;
    const metrics = ctx['metrics'] as Record<string, number>;
    const threatLevel = ctx['threatLevel'] as number | undefined;
    const onAlert = ctx['onAlert'] as boolean | undefined;
    const eventCount = ctx['eventCount'] as number | undefined;
    const lastUpdateTick = ctx['lastUpdateTick'] as number | undefined;
    const controllingFaction = ctx['controllingFaction'] as string | undefined;
    const tags = ctx['tags'] as string[] | undefined;

    let prompt = `Explain the current state of district "${districtName ?? districtId}" (${districtId}).\n`;
    prompt += `\nMetrics:`;
    for (const [key, val] of Object.entries(metrics)) {
      prompt += `\n  ${key}: ${val}`;
    }
    if (threatLevel !== undefined) prompt += `\nThreat level: ${threatLevel}/100`;
    if (onAlert !== undefined) prompt += `\nOn alert: ${onAlert}`;
    if (eventCount !== undefined) prompt += `\nTotal events processed: ${eventCount}`;
    if (lastUpdateTick !== undefined) prompt += `\nLast updated at tick: ${lastUpdateTick}`;
    if (controllingFaction) prompt += `\nControlling faction: ${controllingFaction}`;
    if (tags?.length) prompt += `\nDistrict tags: ${tags.join(', ')}`;

    prompt += `\n\nExplain what this means for a content author.`;
    return prompt;
  },
);
