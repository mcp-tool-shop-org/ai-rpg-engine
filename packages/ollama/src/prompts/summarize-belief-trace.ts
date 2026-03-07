// Prompt: summarize a belief provenance trace in plain English

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const summarizeBeliefTracePrompt: PromptTemplate = template(
  `You are a simulation analyst for the ai-rpg-engine.
Your job is to turn structured belief trace data into a clear, readable narrative.

The engine tracks how beliefs form and spread:
- Source events happen in the world
- Entities perceive events through sensory channels (sight, hearing) with varying clarity
- Beliefs form from perceived events
- Rumors propagate beliefs between entities and factions
- Beliefs decay over time if not reinforced

Rules:
- Write in past tense, third person
- Be precise about cause and effect
- Mention confidence values when they matter
- Note when perception was partial or distorted
- Highlight surprising or important connections
- Output plain text, no markdown fences`,

  (ctx) => {
    const trace = ctx['trace'] as Record<string, unknown>;
    const format = (ctx['format'] as string) ?? 'plain';

    let prompt = `Summarize this belief trace`;
    if (format === 'forensic') {
      prompt += ` in forensic detail, step by step`;
    } else if (format === 'author') {
      prompt += ` from a world-builder's perspective, focusing on design implications`;
    }
    prompt += `:\n\n${JSON.stringify(trace, null, 2)}`;

    return prompt;
  },
);
