// Command: plan-district — multi-step design plan for a district

import type { OllamaTextClient } from '../client.js';
import { planDistrictPrompt } from '../prompts/plan-district.js';
import { parsePlanOutput } from '../parsers.js';
import type { PlanStep, DesignPlan } from '../parsers.js';

export type PlanDistrictInput = {
  theme: string;
  existingFactions?: string;
  existingDistricts?: string;
  constraints?: string;
  sessionContext?: string;
};

export type PlanDistrictResult = {
  ok: true;
  text: string;
  steps: PlanStep[];
  rationale: string;
} | {
  ok: false;
  error: string;
};

export async function planDistrict(
  client: OllamaTextClient,
  input: PlanDistrictInput,
): Promise<PlanDistrictResult> {
  const result = await client.generate({
    system: planDistrictPrompt.system,
    prompt: planDistrictPrompt.render({
      theme: input.theme,
      existingFactions: input.existingFactions,
      existingDistricts: input.existingDistricts,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
  });

  if (!result.ok) return result;

  const { prose, structured } = parsePlanOutput(result.text);
  return {
    ok: true,
    text: prose,
    steps: structured.steps,
    rationale: structured.rationale,
  };
}
