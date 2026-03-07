// Command: explain-belief-divergence — two traces in, divergence analysis out

import type { OllamaTextClient } from '../client.js';
import { explainBeliefDivergencePrompt } from '../prompts/explain-belief-divergence.js';
import { extractText } from '../parsers.js';
import type { BeliefTrace } from '@ai-rpg-engine/modules';

export type BeliefDivergenceInput = {
  traceA: BeliefTrace;
  traceB: BeliefTrace;
  labelA?: string;
  labelB?: string;
};

export type TextResult = {
  ok: true;
  text: string;
} | {
  ok: false;
  error: string;
};

export async function explainBeliefDivergence(
  client: OllamaTextClient,
  input: BeliefDivergenceInput,
): Promise<TextResult> {
  const result = await client.generate({
    system: explainBeliefDivergencePrompt.system,
    prompt: explainBeliefDivergencePrompt.render({
      traceA: input.traceA,
      traceB: input.traceB,
      labelA: input.labelA,
      labelB: input.labelB,
    }),
  });

  if (!result.ok) return result;
  return { ok: true, text: extractText(result.text) };
}
