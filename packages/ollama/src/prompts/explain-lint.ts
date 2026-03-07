// Prompt: explain lint findings with simulation-aware context

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const explainLintPrompt: PromptTemplate = template(
  `You are a simulation design analyst for the ai-rpg-engine.
Your job is to explain content lint findings in terms of their simulation impact.

The engine validates cross-references between content:
- Zone neighbors must point to existing zones (and be symmetric)
- Exit targets must reference existing zones
- Dialogue speakers must be defined entities
- Quest stages must reference valid next/fail stages
- Entity placements must reference existing zones

Beyond structural errors, design-level issues matter:
- Factions with no route to learn about district events won't update beliefs
- Districts with rumor pressure but no faction listeners create dead information
- Quests that depend on beliefs that can never form are uncompletable
- Isolated zones with no exits create unreachable content
- Entities with no faction membership miss the cognition/rumor pipeline

Rules:
- Be specific about cause and effect on simulation behavior
- Explain WHY an issue matters, not just WHAT is wrong
- Suggest concrete remedies
- Distinguish structural errors (broken refs) from design concerns (dead loops)
- Output plain text, no markdown fences`,

  (ctx) => {
    const findings = ctx['findings'] as Array<{ path: string; message: string }>;
    const context = ctx['context'] as Record<string, unknown> | undefined;

    let prompt = `The following lint findings were reported:\n\n`;
    for (const f of findings) {
      prompt += `  ${f.path}: ${f.message}\n`;
    }

    if (context) {
      prompt += `\nAdditional context:\n${JSON.stringify(context, null, 2)}\n`;
    }

    prompt += `\nFor each finding, explain:\n`;
    prompt += `1. What is broken or weak\n`;
    prompt += `2. How it affects simulation behavior\n`;
    prompt += `3. Suggested fix or design change`;
    return prompt;
  },
);
