// Command: explain-district-state — district metrics in, narrative explanation out

import type { OllamaTextClient } from '../client.js';
import { explainDistrictStatePrompt } from '../prompts/explain-district-state.js';
import { extractText } from '../parsers.js';

export type DistrictStateInput = {
  districtId: string;
  districtName?: string;
  metrics: {
    alertPressure: number;
    rumorDensity: number;
    intruderLikelihood: number;
    surveillance: number;
    stability: number;
  };
  threatLevel?: number;
  onAlert?: boolean;
  eventCount?: number;
  lastUpdateTick?: number;
  controllingFaction?: string;
  tags?: string[];
};

export type TextResult = {
  ok: true;
  text: string;
} | {
  ok: false;
  error: string;
};

export async function explainDistrictState(
  client: OllamaTextClient,
  input: DistrictStateInput,
): Promise<TextResult> {
  const result = await client.generate({
    system: explainDistrictStatePrompt.system,
    prompt: explainDistrictStatePrompt.render({
      districtId: input.districtId,
      districtName: input.districtName,
      metrics: input.metrics,
      threatLevel: input.threatLevel,
      onAlert: input.onAlert,
      eventCount: input.eventCount,
      lastUpdateTick: input.lastUpdateTick,
      controllingFaction: input.controllingFaction,
      tags: input.tags,
    }),
  });

  if (!result.ok) return result;
  return { ok: true, text: extractText(result.text) };
}
