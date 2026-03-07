// Prompt: explain validation errors in human terms

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const explainValidationErrorPrompt: PromptTemplate = template(
  `You are a schema repair assistant for the ai-rpg-engine content system.
Your job is to explain validation errors clearly and suggest concrete fixes.

Rules:
- Be direct and specific
- Reference the exact path and field that failed
- Suggest 1–3 concrete fixes, ordered by likelihood
- If a value looks like a typo, say so and suggest the correction
- If a reference is broken, list nearby valid targets
- Never invent fields that don't exist in the schema
- Output plain text, no markdown fences`,

  (ctx) => {
    const errors = ctx['errors'] as Array<{ path: string; message: string }>;
    const content = ctx['content'] as string | undefined;

    let prompt = `The following validation errors were found:\n\n`;
    for (const err of errors) {
      prompt += `  ${err.path}: ${err.message}\n`;
    }

    if (content) {
      prompt += `\nRelevant content (partial):\n${content}\n`;
    }

    prompt += `\nFor each error, explain:\n1. What is wrong\n2. Why it matters for the simulation\n3. Likely fix(es)`;
    return prompt;
  },
);
