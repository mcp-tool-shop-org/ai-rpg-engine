// Prompt: explain why a faction's alert level is where it is

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const explainFactionAlertPrompt: PromptTemplate = template(
  `You are an inspector for the ai-rpg-engine — a deterministic simulation engine.
You explain faction alert states and escalation to content authors.

The engine's faction cognition system tracks:
- alertLevel (0–100): rises by 20× rumor confidence when hostile rumors arrive
- cohesion (0.0–1.0): how unified the faction is — affects rumor confidence scaling
- beliefs: array of faction-level beliefs with subject, key, value, confidence, distortion, and sourceEntities
- reputation: faction's standing (-100 to 100)
- disposition: the faction's general stance (e.g. hostile, neutral, friendly, wary)

How alert escalation works:
1. A rumor with hostile=true arrives at the faction
2. The effective confidence is scaled by faction cohesion
3. alertLevel increases by 20 × effectiveConfidence
4. High alertLevel triggers faction behavioral changes (patrols, aggression, lockdown)

Your job:
1. Explain the current alert level in practical terms
2. Identify which beliefs are likely driving the alert state
3. Describe what faction behavior the alert level implies
4. Note whether cohesion is amplifying or dampening the response
5. Suggest what a content author might adjust

Keep the tone practical and concise.`,

  (ctx) => {
    const factionId = ctx['factionId'] as string;
    const factionName = ctx['factionName'] as string | undefined;
    const alertLevel = ctx['alertLevel'] as number;
    const cohesion = ctx['cohesion'] as number;
    const beliefs = ctx['beliefs'] as Array<Record<string, unknown>> | undefined;
    const reputation = ctx['reputation'] as number | undefined;
    const disposition = ctx['disposition'] as string | undefined;
    const districtIds = ctx['districtIds'] as string[] | undefined;

    let prompt = `Explain the alert state of faction "${factionName ?? factionId}" (${factionId}).\n`;
    prompt += `\nAlert level: ${alertLevel}/100`;
    prompt += `\nCohesion: ${cohesion}`;
    if (reputation !== undefined) prompt += `\nReputation: ${reputation}`;
    if (disposition) prompt += `\nDisposition: ${disposition}`;
    if (districtIds?.length) prompt += `\nOperates in districts: ${districtIds.join(', ')}`;

    if (beliefs?.length) {
      prompt += `\n\nCurrent beliefs:`;
      for (const b of beliefs.slice(0, 10)) {
        const conf = typeof b.confidence === 'number' ? ` (confidence: ${b.confidence})` : '';
        prompt += `\n  ${b.subject}.${b.key} = ${String(b.value)}${conf}`;
      }
      if (beliefs.length > 10) prompt += `\n  ... and ${beliefs.length - 10} more`;
    }

    prompt += `\n\nExplain what this alert state means and what is driving it.`;
    return prompt;
  },
);
