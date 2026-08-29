// Content loader/compiler — validates + compiles a ContentPack into a LoadedContent result

import * as fs from 'node:fs';
import type { ContentPack } from './refs.js';
import type { ValidationError } from './validate.js';
import {
  validateEntityBlueprint,
  validateZoneDefinition,
  validateDialogueDefinition,
  validateQuestDefinition,
  validateEntityPlacementRecord,
  validateEncounterAnchorRecord,
  validateAbilityDefinition,
  validateStatusDefinition,
  validateDistrictDefinition,
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
 * Every collection field `validateRefs` iterates, and therefore every field the
 * shape guard must cover.
 *
 * ⚠ C1/P2 CLOSES A C0 FINDING HERE. This list used to be four entries long while
 * `validateRefs` went on to do `pack.abilities?.map(...)` on six MORE — so a
 * non-array in any of those six escaped as a raw `TypeError`, straight past the
 * boundary discipline this module's own docstring promises ("never a raw fs
 * throw", "the caller never sees a raw SyntaxError"). C0 pinned it by asserting
 * the throw; that pin is flipped in the same commit as this fix.
 *
 * The invariant to keep: if `validateRefs` reads a key, it belongs here. A
 * guard list shorter than the iteration list is the bug, not a style choice.
 */
const REFS_ITERATED_KEYS = [
  'entities',
  'zones',
  'dialogues',
  'quests',
  'abilities',
  'statuses',
  'verbs',
  'archetypes',
  'backgrounds',
  'itemUseEffects',
  // C3/P1 — the two space-vocabulary collections. `validateRefs` resolves
  // `placements[].entityId`/`.zoneId` and `encounterAnchors[].zoneId`/`.enemyIds[]`
  // against the pack, so by the invariant above they belong here. Added in the
  // SAME commit as their iteration, which is the whole point of the invariant:
  // C0's raw-`TypeError` hole existed because six keys were iterated and not
  // guarded.
  'placements',
  'encounterAnchors',
  'hazardDefinitions',
  'items',
  'districts',
] as const;

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
  // Every collection field validateRefs will touch, when present, must be an array.
  for (const field of REFS_ITERATED_KEYS) {
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
  // C3/P1 — the space-vocabulary collections, validated per element like the
  // four above. Labelled by the id an author would recognise: a placement's
  // identity is the pair it names, not an id of its own.
  for (let i = 0; i < (pack.placements ?? []).length; i++) {
    const p = (pack.placements ?? [])[i];
    const label = `placements[${i}](${isPlainObject(p) ? (p.entityId ?? '?') : '?'})`;
    allErrors.push(...validateEntityPlacementRecord(p, label).errors);
  }
  for (let i = 0; i < (pack.encounterAnchors ?? []).length; i++) {
    const a = (pack.encounterAnchors ?? [])[i];
    const label = `encounterAnchors[${i}](${isPlainObject(a) ? (a.id ?? '?') : '?'})`;
    allErrors.push(...validateEncounterAnchorRecord(a, label).errors);
  }
  // F-b6ded9eb: abilities/statuses/verbs were unwalked, so a null element
  // survived as structural ok:true then TypeError'd in validateGameContent.
  // Per-element validators report structured errors, matching entities/zones.
  for (let i = 0; i < (pack.abilities ?? []).length; i++) {
    const ability = (pack.abilities ?? [])[i];
    const label = `abilities[${i}](${isPlainObject(ability) ? (ability.id ?? '?') : '?'})`;
    allErrors.push(...validateAbilityDefinition(ability, label).errors);
  }
  for (let i = 0; i < (pack.statuses ?? []).length; i++) {
    const status = (pack.statuses ?? [])[i];
    const label = `statuses[${i}](${isPlainObject(status) ? (status.id ?? '?') : '?'})`;
    allErrors.push(...validateStatusDefinition(status, label).errors);
  }
  for (let i = 0; i < (pack.verbs ?? []).length; i++) {
    const verb = (pack.verbs ?? [])[i];
    const label = `verbs[${i}](${isPlainObject(verb) ? (verb.id ?? '?') : '?'})`;
    if (!isPlainObject(verb)) {
      allErrors.push({ path: label, message: 'must be an object' });
    } else if (typeof verb.id !== 'string' || verb.id.length === 0) {
      allErrors.push({ path: `${label}.id`, message: 'required non-empty string' });
    }
  }
  // F-6fbd6e71: per-element district shape (id/name/zoneIds/tags). Zone-id
  // resolution is validateRefs' job and runs after this pass is clean.
  for (let i = 0; i < (pack.districts ?? []).length; i++) {
    const d = (pack.districts ?? [])[i];
    const label = `districts[${i}](${isPlainObject(d) ? (d.id ?? '?') : '?'})`;
    allErrors.push(...validateDistrictDefinition(d, label).errors);
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
  // the registries from the pack itself.
  //
  // ⚠ GATED ON STRUCTURAL SUCCESS (C1/P2). It was called unconditionally, so a
  // pack whose shape `loadContent` had ALREADY refused was still handed to
  // `validateGameContent`, which does `pack.abilities?.map(...)` and raw-threw a
  // TypeError — past the boundary discipline this module's docstring promises.
  // Widening the shape guard alone did not fix it: the guard reported the error
  // correctly and then this line threw anyway. Cross-referencing a pack that
  // failed structural validation is meaningless work on known-bad input.
  const cross = structural.ok
    ? validateGameContent(structural.pack)
    : { errors: [] as ValidationError[], advisories: [] as ValidationError[] };

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
