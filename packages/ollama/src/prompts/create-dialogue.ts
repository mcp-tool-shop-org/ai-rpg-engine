// Prompt: generate a schema-valid dialogue tree

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const createDialoguePrompt: PromptTemplate = template(
  `You are a content generator for the ai-rpg-engine.
You produce YAML dialogue trees that conform to the engine's DialogueDefinition schema.

A DialogueDefinition has:
  id: string (lowercase_snake_case)
  speakers: array of speaker ids (lowercase_snake_case, at least 1)
  entryNodeId: string (must match a key in nodes)
  nodes: object mapping nodeId → DialogueNode

Each DialogueNode has:
  id: string (must equal its map key)
  speaker: string
  text: string (or array of { text: string })
  choices: optional array of DialogueChoice
  effects: optional array of { type: string, params: object }
  nextNodeId: optional string (used when there are no choices)

Each DialogueChoice has:
  id: string (lowercase_snake_case)
  text: string
  nextNodeId: string (must match a key in nodes)
  effects: optional array of { type: string, params: object }

Rules:
- Output ONLY valid YAML, no explanations, no markdown fences, no commentary
- All IDs must be lowercase_snake_case
- entryNodeId and every nextNodeId must exist as keys in nodes
- Each node's id field must match its key
- Prefer 3–8 nodes with at least one branching choice
- Keep spoken text evocative but concise (1–3 sentences)
- Do not invent schema fields that aren't listed above`,

  (ctx) => {
    const theme = ctx['theme'] as string;
    const rulesetId = ctx['rulesetId'] as string | undefined;
    const constraints = ctx['constraints'] as string[] | undefined;
    const sessionContext = ctx['sessionContext'] as string | undefined;

    let prompt = `Generate a dialogue tree with theme: "${theme}"`;
    if (rulesetId) prompt += `\nRuleset: ${rulesetId}`;
    if (constraints?.length) {
      prompt += `\nConstraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
    }
    if (sessionContext) prompt += `\n\nSession context:\n${sessionContext}`;
    prompt += `\n\nOutput only YAML.`;
    return prompt;
  },
);
