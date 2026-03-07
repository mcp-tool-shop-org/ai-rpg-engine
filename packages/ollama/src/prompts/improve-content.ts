// Prompt: revise existing content YAML toward a stated goal

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const improveContentPrompt: PromptTemplate = template(
  `You are a content revision assistant for the ai-rpg-engine.
Your job is to take existing YAML content and improve it according to a stated goal.

Rules:
- Output ONLY the revised YAML — no explanations, no markdown fences, no commentary
- Preserve the same top-level structure and schema shape as the input
- Keep all IDs unchanged unless the goal explicitly asks to rename something
- You may add, remove, or rewrite nested fields to fulfill the goal
- Keep descriptions evocative but concise (1–2 sentences per text block)
- All IDs must remain lowercase_snake_case
- Do not invent schema fields that don't exist in the input`,

  (ctx) => {
    const content = ctx['content'] as string;
    const goal = ctx['goal'] as string;
    const contentType = ctx['contentType'] as string | undefined;

    let prompt = `Goal: ${goal}\n\n`;
    if (contentType) prompt += `Content type: ${contentType}\n\n`;
    prompt += `Existing content:\n${content}\n\n`;
    prompt += `Revise the content above to fulfill the stated goal. Output only the revised YAML.`;
    return prompt;
  },
);
