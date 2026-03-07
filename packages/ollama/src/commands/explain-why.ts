// Command: explain-why — causal explanation for simulation state questions

import type { OllamaTextClient } from '../client.js';
import { explainWhyPrompt } from '../prompts/explain-why.js';
import { extractText } from '../parsers.js';

export type ExplainWhyInput = {
  question: string;
  state: string;
  targetType?: string;
  targetId?: string;
  sessionContext?: string;
};

export type TextResult = {
  ok: true;
  text: string;
} | {
  ok: false;
  error: string;
};

export async function explainWhy(
  client: OllamaTextClient,
  input: ExplainWhyInput,
): Promise<TextResult> {
  const result = await client.generate({
    system: explainWhyPrompt.system,
    prompt: explainWhyPrompt.render({
      question: input.question,
      state: input.state,
      targetType: input.targetType,
      targetId: input.targetId,
      sessionContext: input.sessionContext,
    }),
  });

  if (!result.ok) return result;
  return { ok: true, text: extractText(result.text) };
}
