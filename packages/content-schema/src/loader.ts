// Content loader/compiler — validates + compiles a ContentPack into a LoadedContent result

import type { ContentPack } from './refs.js';
import type { ValidationError } from './validate.js';
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

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validates the top-level pack shape (CA-02). Returns a list of structured boundary
 * errors; an empty list means the pack is a plain object whose known collection fields
 * are arrays (or absent). This runs BEFORE any per-element iteration so a malformed pack
 * fails with an actionable message instead of a raw TypeError.
 */
function validatePackShape(pack: unknown): ValidationError[] {
  if (!isPlainObject(pack)) {
    return [
      {
        path: 'pack',
        message: `content pack must be a plain object (got ${describe(pack)}) — pass an object like { entities: [...], zones: [...] }`,
      },
    ];
  }

  const errors: ValidationError[] = [];
  // Every known collection field, when present, must be an array.
  for (const field of ['entities', 'zones', 'dialogues', 'quests'] as const) {
    const v = (pack as Record<string, unknown>)[field];
    if (v !== undefined && !Array.isArray(v)) {
      errors.push({
        path: `pack.${field}`,
        message: `must be an array if provided (got ${describe(v)})`,
      });
    }
  }
  return errors;
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

export function loadContent(pack: ContentPack): LoadResult {
  // CA-02: guard the boundary first. If the pack shape is wrong, bail with structured
  // errors rather than iterating into a TypeError or silently returning ok:true.
  const shapeErrors = validatePackShape(pack);
  if (shapeErrors.length > 0) {
    return {
      ok: false,
      errors: shapeErrors,
      pack: isPlainObject(pack) ? (pack as ContentPack) : {},
      summary: `Content invalid (${shapeErrors.length} errors):\n${formatErrors({ ok: false, errors: shapeErrors })}`,
    };
  }

  const allErrors: ValidationError[] = [];

  // Validate each schema individually. Each validator already rejects non-objects (incl.
  // null) with a structured error, so a null element is reported, never thrown on.
  for (let i = 0; i < (pack.entities ?? []).length; i++) {
    const entity = (pack.entities ?? [])[i];
    const label = `entities[${i}](${isPlainObject(entity) ? (entity.id ?? '?') : '?'})`;
    const r = validateEntityBlueprint(entity, label);
    allErrors.push(...r.errors);
  }
  for (let i = 0; i < (pack.zones ?? []).length; i++) {
    const zone = (pack.zones ?? [])[i];
    const label = `zones[${i}](${isPlainObject(zone) ? (zone.id ?? '?') : '?'})`;
    const r = validateZoneDefinition(zone, label);
    allErrors.push(...r.errors);
  }
  for (let i = 0; i < (pack.dialogues ?? []).length; i++) {
    const dialogue = (pack.dialogues ?? [])[i];
    const label = `dialogues[${i}](${isPlainObject(dialogue) ? (dialogue.id ?? '?') : '?'})`;
    const r = validateDialogueDefinition(dialogue, label);
    allErrors.push(...r.errors);
  }
  for (let i = 0; i < (pack.quests ?? []).length; i++) {
    const quest = (pack.quests ?? [])[i];
    const label = `quests[${i}](${isPlainObject(quest) ? (quest.id ?? '?') : '?'})`;
    const r = validateQuestDefinition(quest, label);
    allErrors.push(...r.errors);
  }

  // Cross-reference validation. validateRefs reads .id off elements, so only run it once
  // per-element structural validation has confirmed shapes (errors above already flag bad
  // elements). It is null-safe for the fields it touches here.
  if (allErrors.length === 0) {
    const refResult = validateRefs(pack);
    allErrors.push(...refResult.errors);
  }

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
