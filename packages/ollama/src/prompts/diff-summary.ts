// Prompt: summarize the differences between two versions of content

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const diffSummaryPrompt: PromptTemplate = template(
  `You are a content diff analyst for the ai-rpg-engine.
Your job is to compare two versions of content and explain what changed
and what the simulation impact of those changes would be.

Analysis structure:
1. Changes — what was added, removed, or modified
2. Simulation impact — how these changes affect the engine's runtime behavior:
   faction cognition, belief propagation, district metrics, entity behavior, quest flow
3. Risk assessment — any changes that could cause runtime errors, orphan references,
   or broken quest progression

Rules:
- Be specific and reference exact fields/IDs
- Distinguish between cosmetic changes (text/descriptions) and structural changes (IDs, references, zones)
- Flag any removed references that other content might depend on
- Output plain text with clear section headings
- No markdown fences`,

  (ctx) => {
    const before = ctx['before'] as string;
    const after = ctx['after'] as string;
    const labelBefore = ctx['labelBefore'] as string | undefined;
    const labelAfter = ctx['labelAfter'] as string | undefined;

    let prompt = `== ${labelBefore ?? 'Before'} ==\n${before}\n\n`;
    prompt += `== ${labelAfter ?? 'After'} ==\n${after}\n\n`;
    prompt += `Compare these two versions. Explain what changed, the simulation impact, and any risks.`;
    return prompt;
  },
);
