// Command: compare-replays — before/after simulation comparison

import type { OllamaTextClient } from '../client.js';
import { compareReplaysPrompt } from '../prompts/compare-replays.js';
import { parseCompareOutput } from '../parsers.js';
import type { ReplayChange, ReplayComparison } from '../parsers.js';

export type CompareReplaysInput = {
  before: string;
  after: string;
  labelBefore?: string;
  labelAfter?: string;
  focus?: string;
  sessionContext?: string;
};

export type CompareReplaysResult = {
  ok: true;
  text: string;
  improvements: ReplayChange[];
  regressions: ReplayChange[];
  unchanged: ReplayChange[];
  verdict: string;
  summary: string;
} | {
  ok: false;
  error: string;
};

export async function compareReplays(
  client: OllamaTextClient,
  input: CompareReplaysInput,
): Promise<CompareReplaysResult> {
  const result = await client.generate({
    system: compareReplaysPrompt.system,
    prompt: compareReplaysPrompt.render({
      before: input.before,
      after: input.after,
      labelBefore: input.labelBefore,
      labelAfter: input.labelAfter,
      focus: input.focus,
      sessionContext: input.sessionContext,
    }),
  });

  if (!result.ok) return result;

  const { prose, structured } = parseCompareOutput(result.text);
  return {
    ok: true,
    text: prose,
    improvements: structured.improvements,
    regressions: structured.regressions,
    unchanged: structured.unchanged,
    verdict: structured.verdict,
    summary: structured.summary,
  };
}
