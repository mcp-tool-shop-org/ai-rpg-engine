// Command: create-rule-profile — theme in, ContentPack.ruleProfiles entry out
//
// Unlike create-item/create-room, a PackRuleProfile has no natural `id`
// field of its own (content-schema PackRuleProfile is just
// `{ statMapping: { attack, precision, resolve } }`) — the id is the
// REGISTRY KEY it is filed under in ContentPack.ruleProfiles. The generated
// YAML still carries a top-level `id:` line (matching every other create-*
// command's shape, and what classifyDocument's 'rule-profile' branch reads
// to key emit-pack's ingest) but that id is overlaid deterministically from
// --id when the caller already knows it, rather than trusted to the model.

import type { OllamaTextClient } from '../client.js';
import { createRuleProfilePrompt } from '../prompts/create-rule-profile.js';
import { validateGeneratedRuleProfile } from '../validators.js';
import { generateWithRepair } from '../generate-with-repair.js';
import { parseYamlish } from '../validators.js';
import type { GeneratedTextResult } from '../generate-with-repair.js';

export type CreateRuleProfileInput = {
  theme?: string;
  rulesetId?: string;
  constraints?: string[];
  repair?: boolean;
  sessionContext?: string;
  /** Registry key this profile is filed under in ContentPack.ruleProfiles. */
  id?: string;
};

export type GeneratedRuleProfileResult = GeneratedTextResult;

/** Force (or insert) a top-level `id:` line — the registry key --id sets. */
export function overlayRuleProfileId(yaml: string, id: string): string {
  if (/^id:\s*\S+.*$/m.test(yaml)) {
    return yaml.replace(/^id:\s*\S+.*$/m, `id: ${id}`);
  }
  return `id: ${id}\n${yaml}`;
}

export async function createRuleProfile(
  client: OllamaTextClient,
  input: CreateRuleProfileInput,
): Promise<GeneratedRuleProfileResult> {
  const constraints = [
    ...(input.constraints ?? []),
    ...(input.id ? [`id must be ${input.id}`] : []),
  ];
  const result = await generateWithRepair({
    client,
    system: createRuleProfilePrompt.system,
    prompt: createRuleProfilePrompt.render({
      theme: input.theme ?? 'rule profile',
      rulesetId: input.rulesetId,
      constraints: constraints.length > 0 ? constraints : undefined,
      sessionContext: input.sessionContext,
      id: input.id,
    }),
    repair: input.repair,
    kindLabel: 'rule profile',
    validate: validateGeneratedRuleProfile,
  });

  if (!result.ok || !input.id) return result;

  // --id is the registry key the caller already knows — force it rather
  // than trust the model echoed it verbatim (mirrors createPlacement's
  // deterministic short-circuit philosophy for caller-supplied identity).
  const yaml = overlayRuleProfileId(result.yaml, input.id);
  return {
    ...result,
    yaml,
    validation: validateGeneratedRuleProfile(yaml, parseYamlish(yaml)),
  };
}
