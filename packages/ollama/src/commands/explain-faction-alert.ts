// Command: explain-faction-alert — faction cognition state in, alert explanation out

import type { OllamaTextClient } from '../client.js';
import { explainFactionAlertPrompt } from '../prompts/explain-faction-alert.js';
import { extractText } from '../parsers.js';

export type FactionAlertInput = {
  factionId: string;
  factionName?: string;
  alertLevel: number;
  cohesion: number;
  beliefs?: Array<{
    subject: string;
    key: string;
    value: unknown;
    confidence: number;
  }>;
  reputation?: number;
  disposition?: string;
  districtIds?: string[];
};

export type TextResult = {
  ok: true;
  text: string;
} | {
  ok: false;
  error: string;
};

export async function explainFactionAlert(
  client: OllamaTextClient,
  input: FactionAlertInput,
): Promise<TextResult> {
  const result = await client.generate({
    system: explainFactionAlertPrompt.system,
    prompt: explainFactionAlertPrompt.render({
      factionId: input.factionId,
      factionName: input.factionName,
      alertLevel: input.alertLevel,
      cohesion: input.cohesion,
      beliefs: input.beliefs,
      reputation: input.reputation,
      disposition: input.disposition,
      districtIds: input.districtIds,
    }),
  });

  if (!result.ok) return result;
  return { ok: true, text: extractText(result.text) };
}
