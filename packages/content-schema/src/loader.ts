// Content loader/compiler — validates + compiles a ContentPack into a LoadedContent result

import type { ContentPack } from './refs.js';
import type { ValidationError, ValidationResult } from './validate.js';
import {
  validateEntityBlueprint,
  validateZoneDefinition,
  validateDialogueDefinition,
  validateQuestDefinition,
  formatErrors,
} from './validate.js';
import { validateRefs } from './refs.js';

export type LoadResult = {
  ok: boolean;
  errors: ValidationError[];
  pack: ContentPack;
  summary: string;
};

export function loadContent(pack: ContentPack): LoadResult {
  const allErrors: ValidationError[] = [];

  // Validate each schema individually
  for (const entity of pack.entities ?? []) {
    const r = validateEntityBlueprint(entity, `entity(${entity.id ?? '?'})`);
    allErrors.push(...r.errors);
  }
  for (const zone of pack.zones ?? []) {
    const r = validateZoneDefinition(zone, `zone(${zone.id ?? '?'})`);
    allErrors.push(...r.errors);
  }
  for (const dialogue of pack.dialogues ?? []) {
    const r = validateDialogueDefinition(dialogue, `dialogue(${dialogue.id ?? '?'})`);
    allErrors.push(...r.errors);
  }
  for (const quest of pack.quests ?? []) {
    const r = validateQuestDefinition(quest, `quest(${quest.id ?? '?'})`);
    allErrors.push(...r.errors);
  }

  // Cross-reference validation
  const refResult = validateRefs(pack);
  allErrors.push(...refResult.errors);

  const ok = allErrors.length === 0;
  const counts = [
    `${(pack.entities ?? []).length} entities`,
    `${(pack.zones ?? []).length} zones`,
    `${(pack.dialogues ?? []).length} dialogues`,
    `${(pack.quests ?? []).length} quests`,
  ].join(', ');

  const summary = ok
    ? `Content loaded: ${counts}`
    : `Content invalid (${allErrors.length} errors): ${counts}\n${formatErrors({ ok: false, errors: allErrors })}`;

  return { ok, errors: allErrors, pack, summary };
}
