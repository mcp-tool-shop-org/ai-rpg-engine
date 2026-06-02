// Content loader/compiler — validates + compiles a ContentPack into a LoadedContent result

import * as fs from 'node:fs';
import type { ContentPack } from './refs.js';
import type { ValidationError } from './validate.js';
import {
  validateEntityBlueprint,
  validateZoneDefinition,
  validateDialogueDefinition,
  validateQuestDefinition,
  formatErrors,
} from './validate.js';
import { validateRefs, validateGameContent } from './refs.js';

export type LoadResult = {
  ok: boolean;
  errors: ValidationError[];
  pack: ContentPack;
  summary: string;
};

/**
 * Result of loading content from a file. Extends {@link LoadResult} with the
 * cross-reference `advisories` surfaced by {@link validateGameContent} (likely-mistake
 * signals — one-way passages, etc. — that never flip `ok`).
 */
export type LoadFromFileResult = LoadResult & {
  advisories: ValidationError[];
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

/**
 * Loads a content pack from a JSON file on local disk, then validates it.
 *
 * Pipeline (all local, deterministic — no network, no clock, no RNG):
 * 1. Read the file. A missing/unreadable file is reported as a structured `file`
 *    error, never a raw fs throw.
 * 2. Parse the JSON. Malformed JSON is reported as a structured `file` error with a
 *    parse hint (CA-02 boundary discipline) — the caller never sees a raw `SyntaxError`.
 * 3. Run {@link loadContent} (structural + per-element validation) AND
 *    {@link validateGameContent} (cross-reference validation, deriving registries from
 *    the pack itself). Errors from both are merged; cross-ref advisories are surfaced
 *    separately in `advisories` so they never flip `ok`.
 *
 * On any boundary failure (read/parse) the returned `pack` is `{}` and `ok` is false.
 */
export function loadContentFromFile(filePath: string): LoadFromFileResult {
  // Boundary 1: read the file. Wrap the fs call so ENOENT/EACCES/EISDIR surface as a
  // structured error rather than a raw throw the caller would have to try/catch.
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      errors: [
        {
          path: 'file',
          message: `could not read content file "${filePath}": ${reason} — check the path exists and is readable`,
        },
      ],
      pack: {},
      summary: `Content invalid (1 error): could not read "${filePath}".`,
      advisories: [],
    };
  }

  // Boundary 2: parse the JSON. Malformed JSON becomes a structured `file` error with a
  // hint — never a raw SyntaxError escaping to the caller.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      errors: [
        {
          path: 'file',
          message: `invalid JSON in "${filePath}": ${reason} — fix the JSON syntax (a trailing comma or unclosed bracket is the usual cause)`,
        },
      ],
      pack: {},
      summary: `Content invalid (1 error): "${filePath}" is not valid JSON.`,
      advisories: [],
    };
  }

  // loadContent already guards a non-object/array pack shape (CA-02) and returns a
  // structured `pack` error, so passing `parsed` through is safe even if it is, e.g.,
  // a bare number or array.
  const structural = loadContent(parsed as ContentPack);

  // Cross-reference pass. validateGameContent re-runs validateRefs internally and adds
  // registry-backed checks (startingStatuses, ability verbs, apply-status, …) deriving
  // the registries from the pack itself. It is null-safe at its boundary.
  const cross = validateGameContent(structural.pack);

  // Merge errors from both passes, de-duplicated by (path|message) so a reference error
  // reported by both validateRefs (inside loadContent) and validateGameContent appears
  // once. Order is preserved (structural first, then cross-ref extras) for deterministic,
  // byte-identical output across runs.
  const seen = new Set<string>();
  const errors: ValidationError[] = [];
  for (const e of [...structural.errors, ...cross.errors]) {
    const key = `${e.path} ${e.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    errors.push(e);
  }

  const ok = errors.length === 0;
  // Recompute the summary off the merged error set so a cross-ref-only failure still
  // reports as invalid (structural.summary would have said "loaded").
  const summary = ok
    ? structural.summary
    : `Content invalid (${errors.length} errors):\n${formatErrors({ ok: false, errors })}`;

  return {
    ok,
    errors,
    pack: structural.pack,
    summary,
    advisories: cross.advisories,
  };
}
