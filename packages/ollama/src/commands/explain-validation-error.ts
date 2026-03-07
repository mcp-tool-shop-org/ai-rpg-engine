// Command: explain-validation-error — structured errors in, human explanation out

import type { OllamaTextClient } from '../client.js';
import { explainValidationErrorPrompt } from '../prompts/explain-validation-error.js';
import { extractText } from '../parsers.js';
import type { ValidationError } from '@ai-rpg-engine/content-schema';

export type ValidationExplainInput = {
  errors: ValidationError[];
  surroundingContent?: string;
  rulesetId?: string;
};

export type TextResult = {
  ok: true;
  text: string;
} | {
  ok: false;
  error: string;
};

export async function explainValidationError(
  client: OllamaTextClient,
  input: ValidationExplainInput,
): Promise<TextResult> {
  if (input.errors.length === 0) {
    return { ok: true, text: 'No validation errors to explain.' };
  }

  const result = await client.generate({
    system: explainValidationErrorPrompt.system,
    prompt: explainValidationErrorPrompt.render({
      errors: input.errors,
      content: input.surroundingContent,
    }),
  });

  if (!result.ok) return result;
  return { ok: true, text: extractText(result.text) };
}
