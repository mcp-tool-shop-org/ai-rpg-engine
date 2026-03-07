// Command: summarize-belief-trace — structured trace in, readable narrative out

import type { OllamaTextClient } from '../client.js';
import { summarizeBeliefTracePrompt } from '../prompts/summarize-belief-trace.js';
import { extractText } from '../parsers.js';
import type { BeliefTrace } from '@ai-rpg-engine/modules';

export type BeliefTraceSummaryInput = {
  trace: BeliefTrace;
  format?: 'plain' | 'forensic' | 'author';
};

export type TextResult = {
  ok: true;
  text: string;
} | {
  ok: false;
  error: string;
};

export async function summarizeBeliefTrace(
  client: OllamaTextClient,
  input: BeliefTraceSummaryInput,
): Promise<TextResult> {
  const result = await client.generate({
    system: summarizeBeliefTracePrompt.system,
    prompt: summarizeBeliefTracePrompt.render({
      trace: input.trace,
      format: input.format ?? 'plain',
    }),
  });

  if (!result.ok) return result;
  return { ok: true, text: extractText(result.text) };
}
