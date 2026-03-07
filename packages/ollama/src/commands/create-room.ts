// Command: create-room — theme in, schema-valid YAML room out
// Supports optional repair pass: if first generation is invalid, feeds
// validation errors back to the model for a single correction attempt.

import type { OllamaTextClient } from '../client.js';
import { createRoomPrompt } from '../prompts/create-room.js';
import { extractYaml } from '../parsers.js';
import { parseYamlish, validateGeneratedRoom } from '../validators.js';
import type { GeneratedContentResult } from '../validators.js';

export type CreateRoomInput = {
  theme: string;
  rulesetId?: string;
  districtId?: string;
  existingZones?: string[];
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export type GeneratedTextResult = {
  ok: true;
  yaml: string;
  validation: GeneratedContentResult;
  repaired?: boolean;
  repairNote?: string;
} | {
  ok: false;
  error: string;
};

export async function createRoom(
  client: OllamaTextClient,
  input: CreateRoomInput,
): Promise<GeneratedTextResult> {
  const result = await client.generate({
    system: createRoomPrompt.system,
    prompt: createRoomPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      districtId: input.districtId,
      existingZones: input.existingZones,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
  });

  if (!result.ok) return result;

  const yaml = extractYaml(result.text);
  const parsed = parseYamlish(yaml);
  const validation = validateGeneratedRoom(yaml, parsed);

  // If valid or repair not requested, return as-is
  if (validation.valid || !input.repair) {
    return { ok: true, yaml, validation };
  }

  // Single repair pass: feed validation errors back to the model
  const errorSummary = validation.validation.errors
    .map((e) => `${e.path}: ${e.message}`)
    .join('\n');

  const repairResult = await client.generate({
    system: createRoomPrompt.system,
    prompt: [
      `The following YAML room definition has validation errors.`,
      `Fix the errors and output only the corrected YAML.`,
      ``,
      `Original YAML:`,
      yaml,
      ``,
      `Validation errors:`,
      errorSummary,
      ``,
      `Output only corrected YAML, no explanations.`,
    ].join('\n'),
  });

  if (!repairResult.ok) {
    // Repair failed — return the original with its diagnostics
    return { ok: true, yaml, validation };
  }

  const repairedYaml = extractYaml(repairResult.text);
  const repairedParsed = parseYamlish(repairedYaml);
  const repairedValidation = validateGeneratedRoom(repairedYaml, repairedParsed);

  const repairNote = repairedValidation.valid
    ? `Repaired: ${validation.validation.errors.length} validation error(s) fixed.`
    : `Repair attempted: ${validation.validation.errors.length} original error(s), ${repairedValidation.validation.errors.length} remaining.`;

  return { ok: true, yaml: repairedYaml, validation: repairedValidation, repaired: true, repairNote };
}
