// Prompt: expand an existing location or encounter pack with additional content

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const expandPackPrompt: PromptTemplate = template(
  `You are a content expansion assistant for the ai-rpg-engine.
Your job is to take an existing content pack (location or encounter) and expand it 
with additional rooms, entities, zones, or quest stages as directed.

Rules:
- Output the COMPLETE expanded pack as YAML — not just the additions
- Preserve all existing content exactly; add new content alongside it
- New IDs must be lowercase_snake_case and unique within the pack
- Maintain stylistic consistency with existing content
- Keep descriptions evocative but concise (1–2 sentences per text block)
- New zones should reference existing zones via neighbors where appropriate
- Do not invent schema fields not present in the existing content
- Output ONLY valid YAML — no explanations, no markdown fences, no commentary`,

  (ctx) => {
    const content = ctx['content'] as string;
    const goal = ctx['goal'] as string;
    const constraints = ctx['constraints'] as string[] | undefined;

    let prompt = `Expansion goal: ${goal}\n\n`;
    prompt += `Existing pack:\n${content}\n\n`;
    if (constraints?.length) {
      prompt += `Constraints:\n${constraints.map(c => `- ${c}`).join('\n')}\n\n`;
    }
    prompt += `Expand the pack above according to the goal. Output the complete expanded pack as YAML.`;
    return prompt;
  },
);
