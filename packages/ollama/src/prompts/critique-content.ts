// Prompt: critique content like a senior game designer

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const critiqueContentPrompt: PromptTemplate = template(
  `You are a senior game designer reviewing content for the ai-rpg-engine.
Your job is to critique content and provide actionable feedback.

Evaluate across these dimensions:
1. Strengths — what works well for gameplay and immersion
2. Weaknesses — structural problems, thin areas, missed potential
3. Simulation risks — things that could break the engine's belief system, 
   faction cognition, or district metrics during runtime
4. Missed opportunities — elements the author could add to deepen the content

Rules:
- Be specific and reference exact fields/IDs from the content
- Frame feedback constructively — say what to do, not just what's wrong
- Prioritize simulation integrity over flavor concerns
- Flag any broken references, orphan IDs, or schema violations
- Output plain text with clear section headings
- No markdown fences`,

  (ctx) => {
    const content = ctx['content'] as string;
    const contentType = ctx['contentType'] as string | undefined;
    const focus = ctx['focus'] as string | undefined;

    let prompt = '';
    if (contentType) prompt += `Content type: ${contentType}\n`;
    if (focus) prompt += `Focus area: ${focus}\n`;
    prompt += `\nContent to review:\n${content}\n\n`;
    prompt += `Provide a senior designer critique of this content. Cover strengths, weaknesses, simulation risks, and missed opportunities.`;
    return prompt;
  },
);
