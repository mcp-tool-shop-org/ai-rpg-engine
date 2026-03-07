// Command: create-quest — theme in, schema-valid quest YAML out

import type { OllamaTextClient } from '../client.js';
import { createQuestPrompt } from '../prompts/create-quest.js';
import { extractYaml } from '../parsers.js';
import { parseYamlish, validateGeneratedQuest } from '../validators.js';
import type { GeneratedContentResult } from '../validators.js';

export type CreateQuestInput = {
  theme: string;
  rulesetId?: string;
  factions?: string[];
  districts?: string[];
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
};

export type GeneratedQuestResult = {
  ok: true;
  yaml: string;
  validation: GeneratedContentResult;
  repaired?: boolean;
  repairNote?: string;
} | {
  ok: false;
  error: string;
};

export async function createQuest(
  client: OllamaTextClient,
  input: CreateQuestInput,
): Promise<GeneratedQuestResult> {
  const result = await client.generate({
    system: createQuestPrompt.system,
    prompt: createQuestPrompt.render({
      theme: input.theme,
      rulesetId: input.rulesetId,
      factions: input.factions,
      districts: input.districts,
      constraints: input.constraints,
      sessionContext: input.sessionContext,
    }),
  });

  if (!result.ok) return result;

  const yaml = extractYaml(result.text);
  const parsed = parseYamlish(yaml);
  const validation = validateGeneratedQuest(yaml, parsed);

  if (validation.valid || !input.repair) {
    return { ok: true, yaml, validation };
  }

  // Single repair pass
  const errorSummary = validation.validation.errors
    .map((e) => `${e.path}: ${e.message}`)
    .join('\n');

  const repairResult = await client.generate({
    system: createQuestPrompt.system,
    prompt: [
      `The following YAML quest definition has validation errors.`,
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
    return { ok: true, yaml, validation };
  }

  const repairedYaml = extractYaml(repairResult.text);
  const repairedParsed = parseYamlish(repairedYaml);
  const repairedValidation = validateGeneratedQuest(repairedYaml, repairedParsed);

  const repairNote = repairedValidation.valid
    ? `Repaired: ${validation.validation.errors.length} validation error(s) fixed.`
    : `Repair attempted: ${validation.validation.errors.length} original error(s), ${repairedValidation.validation.errors.length} remaining.`;

  return { ok: true, yaml: repairedYaml, validation: repairedValidation, repaired: true, repairNote };
}
