// Command: explain-lint — structured lint findings in, design-aware explanation out

import type { OllamaTextClient } from '../client.js';
import { explainLintPrompt } from '../prompts/explain-lint.js';
import { extractText } from '../parsers.js';
import type { ValidationError } from '@ai-rpg-engine/content-schema';

export type LintExplainInput = {
  findings: ValidationError[];
  relevantContext?: Record<string, unknown>;
};

export type TextResult = {
  ok: true;
  text: string;
} | {
  ok: false;
  error: string;
};

export async function explainLint(
  client: OllamaTextClient,
  input: LintExplainInput,
): Promise<TextResult> {
  if (input.findings.length === 0) {
    return { ok: true, text: 'No lint findings to explain.' };
  }

  const result = await client.generate({
    system: explainLintPrompt.system,
    prompt: explainLintPrompt.render({
      findings: input.findings,
      context: input.relevantContext,
    }),
  });

  if (!result.ok) return result;
  return { ok: true, text: extractText(result.text) };
}
