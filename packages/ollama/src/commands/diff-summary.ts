// Command: diff-summary — two content versions in, change analysis out

import type { OllamaTextClient } from '../client.js';
import { diffSummaryPrompt } from '../prompts/diff-summary.js';
import { extractText } from '../parsers.js';

export type DiffSummaryInput = {
  before: string;
  after: string;
  labelBefore?: string;
  labelAfter?: string;
};

export type DiffSummaryResult = {
  ok: true;
  text: string;
} | {
  ok: false;
  error: string;
};

export async function diffSummary(
  client: OllamaTextClient,
  input: DiffSummaryInput,
): Promise<DiffSummaryResult> {
  const result = await client.generate({
    system: diffSummaryPrompt.system,
    prompt: diffSummaryPrompt.render({
      before: input.before,
      after: input.after,
      labelBefore: input.labelBefore,
      labelAfter: input.labelAfter,
    }),
  });

  if (!result.ok) return result;
  return { ok: true, text: extractText(result.text) };
}
