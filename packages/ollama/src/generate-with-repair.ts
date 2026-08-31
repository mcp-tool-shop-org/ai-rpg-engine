// Shared create-* generate → validate → one repair generate → re-validate loop.
// Room and quest used to inline this; faction/district/packs and the new
// dialogue/entity/ability/status/item/hazard verbs share the same single correction pass.

import type { OllamaTextClient } from './client.js';
import { extractYaml } from './parsers.js';
import { parseYamlish } from './validators.js';
import type { GeneratedContentResult } from './validators.js';

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

export type GenerateWithRepairInput = {
  client: OllamaTextClient;
  system: string;
  prompt: string;
  repair?: boolean;
  /** Short kind label used in the repair prompt ("room", "faction", …). */
  kindLabel: string;
  validate: (raw: string, parsed: unknown) => GeneratedContentResult;
};

export async function generateWithRepair(
  input: GenerateWithRepairInput,
): Promise<GeneratedTextResult> {
  const result = await input.client.generate({
    system: input.system,
    prompt: input.prompt,
  });

  if (!result.ok) return result;

  const yaml = extractYaml(result.text);
  const parsed = parseYamlish(yaml);
  const validation = input.validate(yaml, parsed);

  if (validation.valid || !input.repair) {
    return { ok: true, yaml, validation };
  }

  const errorSummary = validation.validation.errors
    .map((e) => `${e.path}: ${e.message}`)
    .join('\n');

  const repairResult = await input.client.generate({
    system: input.system,
    prompt: [
      `The following YAML ${input.kindLabel} definition has validation errors.`,
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
    return {
      ok: true,
      yaml,
      validation,
      repaired: false,
      repairNote: `Repair failed: ${repairResult.error}`,
    };
  }

  const repairedYaml = extractYaml(repairResult.text);
  const repairedParsed = parseYamlish(repairedYaml);
  const repairedValidation = input.validate(repairedYaml, repairedParsed);

  const repairNote = repairedValidation.valid
    ? `Repaired: ${validation.validation.errors.length} validation error(s) fixed.`
    : `Repair attempted: ${validation.validation.errors.length} original error(s), ${repairedValidation.validation.errors.length} remaining.`;

  return {
    ok: true,
    yaml: repairedYaml,
    validation: repairedValidation,
    repaired: true,
    repairNote,
  };
}
