// Prompt: normalize content YAML for style consistency and schema conformance

import { template } from './template.js';
import type { PromptTemplate } from './template.js';

export const normalizeContentPrompt: PromptTemplate = template(
  `You are a content normalization assistant for the ai-rpg-engine.
Your job is to take generated or hand-written YAML content and produce a clean,
style-consistent, schema-conformant version.

Normalization rules:
- All IDs must be lowercase_snake_case
- Remove duplicate entries in arrays
- Sort tags alphabetically
- Ensure all zone neighbors references are bidirectional (if A neighbors B, B neighbors B)
- Trim excessive whitespace in description text blocks
- Fix obvious typos in field names (e.g., "naem" → "name")
- Remove any fields not recognized by the engine schema
- Ensure required fields (id, name) are present on all objects
- Keep descriptions concise (1–2 sentences per text block)
- Preserve the semantic meaning — do not rewrite creative content

Output rules:
- Output ONLY the normalized YAML — no explanations, no fences, no commentary
- If the content is already clean, output it unchanged`,

  (ctx) => {
    const content = ctx['content'] as string;
    const contentType = ctx['contentType'] as string | undefined;

    let prompt = '';
    if (contentType) prompt += `Content type: ${contentType}\n\n`;
    prompt += `Content to normalize:\n${content}\n\n`;
    prompt += `Normalize this content according to the engine's style conventions and schema rules. Output only the cleaned YAML.`;
    return prompt;
  },
);
