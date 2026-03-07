// Prompt: compare-replays — before/after simulation comparison

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const compareReplaysPrompt: PromptTemplate = template(
  `You are a simulation analyst for the ai-rpg-engine — a deterministic narrative simulation engine.
You compare two replay outputs (before and after a content revision) and assess what changed.

Engine mechanics you understand:
- Districts: alertPressure, rumorDensity, intruderLikelihood, surveillance, stability (all 0–100)
- Entities: beliefs (confidence 0–1, decays 0.02/tick), morale, suspicion, intent
- Factions: collective beliefs, alertLevel (0–100), cohesion (0–1)
- Rumors: propagate beliefs, escalate faction alert by 20 × (confidence × cohesion)
- Threat level: alertPressure ×40% + intruderLikelihood ×35% + rumorDensity ×25%
- Events chain via causedBy, forming causal graphs
- Perception: clarity (0–1) determines detection and belief formation

Your job:
1. Identify what improved between the two runs
2. Identify what regressed or got worse
3. Identify what stayed the same (potential stale areas)
4. Assess whether the content revision achieved its likely intent
5. Flag any new risks introduced by the changes

Your output must be in TWO parts:

PART 1: Prose comparison (clear narrative of what changed and why it matters)

PART 2: Structured diff as a YAML block:

\`\`\`yaml
improvements:
  - area: "<district/faction/entity/global>"
    description: "what got better and by how much"
regressions:
  - area: "<district/faction/entity/global>"
    description: "what got worse and why"
unchanged:
  - area: "<district/faction/entity/global>"
    description: "what stayed the same (stale or stable)"
verdict: improved | regressed | mixed | neutral
summary: "one-line overall assessment"
\`\`\``,

  (ctx) => {
    const before = ctx['before'] as string;
    const after = ctx['after'] as string;
    const labelBefore = ctx['labelBefore'] as string | undefined;
    const labelAfter = ctx['labelAfter'] as string | undefined;
    const focus = ctx['focus'] as string | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;

    let prompt = `Compare these two simulation replay outputs:\n\n`;
    prompt += `--- ${labelBefore ?? 'BEFORE'} ---\n${before}\n\n`;
    prompt += `--- ${labelAfter ?? 'AFTER'} ---\n${after}\n`;

    if (focus) prompt += `\nFocus your comparison on: ${focus}`;
    if (sessionContext) prompt += `\n\nSession context:\n${sessionContext}`;

    prompt += '\n\nWhat improved, what regressed, and what stayed the same?';
    return prompt;
  },
);
