// Validate generated content against engine schemas

import {
  validateRoomDefinition,
  validateQuestDefinition,
  validateEntityBlueprint,
} from '@ai-rpg-engine/content-schema';
import type { ValidationResult, ValidationError } from '@ai-rpg-engine/content-schema';

export type GeneratedContentResult = {
  valid: boolean;
  content: unknown;
  validation: ValidationResult;
  raw: string;
};

/**
 * Parse YAML text into an object without external dependencies.
 *
 * Handles the block-style subset the engine's content prompts specify: nested
 * maps, sequences of scalars, and sequences of maps at arbitrary depth, plus
 * scalar coercion. (v2.5 audit PA-4: the previous parser was flat-only, so
 * nested shapes — room zones, pack sections — could never validate against
 * their schemas unless the model happened to emit JSON.)
 *
 * Not a YAML parser: no flow style, no multi-line scalars, no anchors.
 * Unparseable lines are skipped, so garbage degrades to validation errors
 * rather than throws.
 */
export function parseYamlish(text: string): unknown {
  // Attempt JSON parse first (some models output JSON even when asked for YAML)
  try {
    return JSON.parse(text);
  } catch { /* not JSON, continue */ }

  const lines: YamlishLine[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.trim()) continue;            // blank
    if (/^\s*#/.test(line)) continue;      // full-line comment
    lines.push({ indent: line.length - line.trimStart().length, content: line.trim() });
  }
  if (lines.length === 0) return {};

  const rootIndent = Math.min(...lines.map((l) => l.indent));
  return parseBlock(lines, 0, rootIndent).value;
}

type YamlishLine = { indent: number; content: string };

const YAMLISH_KEY = /^(\w[\w-]*):\s*(.*)$/;

function isDashItem(content: string): boolean {
  return content === '-' || content.startsWith('- ');
}

/** Parse the block starting at `start`, deciding map vs sequence from its first line at `indent`. */
function parseBlock(lines: YamlishLine[], start: number, indent: number): { value: unknown; next: number } {
  let i = start;
  while (i < lines.length && lines[i].indent > indent) i++; // skip stray deeper lines
  if (i >= lines.length || lines[i].indent < indent) return { value: {}, next: i };
  return isDashItem(lines[i].content)
    ? parseSequence(lines, i, indent)
    : parseMap(lines, i, indent);
}

function parseMap(lines: YamlishLine[], start: number, indent: number): { value: Record<string, unknown>; next: number } {
  const map: Record<string, unknown> = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;                 // block ended
    if (line.indent > indent) { i++; continue; }     // stray deeper line — skip defensively
    if (isDashItem(line.content)) break;             // sequence at this level ends the map
    const m = YAMLISH_KEY.exec(line.content);
    if (!m) { i++; continue; }                       // unparseable line — garbage tolerance
    const key = m[1];
    const rest = m[2].trim();
    if (rest) {
      map[key] = coerce(rest);
      i++;
      continue;
    }
    // Bare `key:` — value is the nested block below, a same-indent sequence, or omitted.
    const next = lines[i + 1];
    if (next && next.indent > indent) {
      const child = parseBlock(lines, i + 1, next.indent);
      map[key] = child.value;
      i = child.next;
    } else if (next && next.indent === indent && isDashItem(next.content)) {
      const child = parseSequence(lines, i + 1, indent);
      map[key] = child.value;
      i = child.next;
    } else {
      i++; // `key:` with no content — omit the key (legacy behavior)
    }
  }
  return { value: map, next: i };
}

function parseSequence(lines: YamlishLine[], start: number, indent: number): { value: unknown[]; next: number } {
  const arr: unknown[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (line.indent > indent) { i++; continue; }     // stray deeper line — skip defensively
    if (!isDashItem(line.content)) break;            // sequence ended
    const rest = line.content === '-' ? '' : line.content.slice(2).trim();

    // Everything deeper than the dash belongs to this item.
    let end = i + 1;
    while (end < lines.length && lines[end].indent > indent) end++;

    if (!rest) {
      // Bare `-`: nested block item (or null when empty).
      arr.push(end > i + 1 ? parseBlock(lines, i + 1, lines[i + 1].indent).value : null);
    } else if (YAMLISH_KEY.test(rest)) {
      // `- key: …` — a map item. Re-parse the inline part as a synthetic first
      // line aligned with the item's shallowest continuation line so the
      // item's remaining fields join the same map level.
      const body = lines.slice(i + 1, end);
      const itemIndent = body.length > 0 ? Math.min(...body.map((l) => l.indent)) : indent + 2;
      const itemLines: YamlishLine[] = [{ indent: itemIndent, content: rest }, ...body];
      arr.push(parseMap(itemLines, 0, itemIndent).value);
    } else {
      arr.push(coerce(rest)); // scalar item
    }
    i = end;
  }
  return { value: arr, next: i };
}

function coerce(v: string): unknown {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  const n = Number(v);
  if (!Number.isNaN(n) && v !== '') return n;
  // Strip surrounding quotes
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * Validate a parsed room object against the engine schema.
 */
export function validateGeneratedRoom(raw: string, parsed: unknown): GeneratedContentResult {
  const obj = (typeof parsed === 'object' && parsed !== null) ? parsed : {};
  const validation = validateRoomDefinition(obj as Record<string, unknown>);
  return {
    valid: validation.ok,
    content: parsed,
    validation,
    raw,
  };
}

/**
 * Validate a parsed quest object against the engine schema.
 */
export function validateGeneratedQuest(raw: string, parsed: unknown): GeneratedContentResult {
  const obj = (typeof parsed === 'object' && parsed !== null) ? parsed : {};
  const validation = validateQuestDefinition(obj as Record<string, unknown>);
  return {
    valid: validation.ok,
    content: parsed,
    validation,
    raw,
  };
}

// --- Faction / district / pack validators (v2.5 audit PA-4) ---
//
// content-schema ships no faction or district validators (factions belong to
// the faction-cognition module, districts to district-core), so until now the
// create-faction/district/pack generators ran NO validation at all and --write
// persisted structurally invalid content that only failed later at engine
// load. These validators mirror the module config types
// (packages/modules/src/district-core.ts DistrictDefinition, the
// create-faction prompt contract) and compose the content-schema validators
// for the nested room/entity/quest parts of packs.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function requireString(errors: ValidationError[], obj: Record<string, unknown>, key: string, path: string): void {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    errors.push({ path: `${path}.${key}`, message: 'required non-empty string' });
  }
}

function checkStringArray(
  errors: ValidationError[],
  obj: Record<string, unknown>,
  key: string,
  path: string,
  opts: { required?: boolean; minItems?: number } = {},
): void {
  const v = obj[key];
  if (v === undefined) {
    if (opts.required) errors.push({ path: `${path}.${key}`, message: 'required array of strings' });
    return;
  }
  if (!Array.isArray(v)) {
    errors.push({ path: `${path}.${key}`, message: 'must be an array of strings' });
    return;
  }
  if (opts.minItems !== undefined && v.length < opts.minItems) {
    errors.push({ path: `${path}.${key}`, message: `must have at least ${opts.minItems} item(s)` });
  }
  v.forEach((item, idx) => {
    if (typeof item !== 'string') {
      errors.push({ path: `${path}.${key}[${idx}]`, message: 'must be a string' });
    }
  });
}

function checkNumberInRange(
  errors: ValidationError[],
  obj: Record<string, unknown>,
  key: string,
  path: string,
  min: number,
  max: number,
): void {
  const v = obj[key];
  if (v === undefined) return;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    errors.push({ path: `${path}.${key}`, message: `must be a number between ${min} and ${max}` });
  }
}

/**
 * Validate a faction configuration draft (the create-faction prompt contract,
 * feeding the faction-cognition module: id/name/members plus optional
 * cohesion, attitudes, and belief seeds).
 */
export function validateFactionDefinition(v: unknown, path = 'FactionDefinition'): ValidationResult {
  if (!isRecord(v)) return { ok: false, errors: [{ path, message: 'must be an object' }] };
  const errors: ValidationError[] = [];
  requireString(errors, v, 'id', path);
  requireString(errors, v, 'name', path);
  checkStringArray(errors, v, 'members', path, { required: true, minItems: 1 });
  // The engine defaults cohesion (FactionMembership.cohesion?) — optional, but range-checked when present.
  checkNumberInRange(errors, v, 'cohesion', path, 0, 1);
  checkStringArray(errors, v, 'tags', path);
  checkStringArray(errors, v, 'goals', path);
  checkStringArray(errors, v, 'districtIds', path);
  checkStringArray(errors, v, 'rumorHooks', path);
  const attitudes = v['attitudes'];
  if (attitudes !== undefined) {
    if (!isRecord(attitudes)) {
      errors.push({ path: `${path}.attitudes`, message: 'must be an object mapping faction IDs to numbers' });
    } else {
      for (const [factionId, value] of Object.entries(attitudes)) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < -1 || value > 1) {
          errors.push({ path: `${path}.attitudes.${factionId}`, message: 'must be a number between -1 and 1' });
        }
      }
    }
  }
  const beliefs = v['initialBeliefs'];
  if (beliefs !== undefined) {
    if (!Array.isArray(beliefs)) {
      errors.push({ path: `${path}.initialBeliefs`, message: 'must be an array' });
    } else {
      beliefs.forEach((belief, idx) => {
        const beliefPath = `${path}.initialBeliefs[${idx}]`;
        if (!isRecord(belief)) {
          errors.push({ path: beliefPath, message: 'must be an object' });
          return;
        }
        requireString(errors, belief, 'subject', beliefPath);
        requireString(errors, belief, 'key', beliefPath);
        const value = belief['value'];
        if (!['string', 'number', 'boolean'].includes(typeof value)) {
          errors.push({ path: `${beliefPath}.value`, message: 'required string, number, or boolean' });
        }
        checkNumberInRange(errors, belief, 'confidence', beliefPath, 0, 1);
      });
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Validate a district configuration draft against the district-core module's
 * DistrictDefinition shape (id/name/zoneIds/tags + optional controllingFaction
 * and baseMetrics).
 */
export function validateDistrictDefinition(v: unknown, path = 'DistrictDefinition'): ValidationResult {
  if (!isRecord(v)) return { ok: false, errors: [{ path, message: 'must be an object' }] };
  const errors: ValidationError[] = [];
  requireString(errors, v, 'id', path);
  requireString(errors, v, 'name', path);
  checkStringArray(errors, v, 'zoneIds', path, { required: true, minItems: 1 });
  checkStringArray(errors, v, 'tags', path, { required: true });
  const controllingFaction = v['controllingFaction'];
  if (controllingFaction !== undefined && (typeof controllingFaction !== 'string' || controllingFaction.length === 0)) {
    errors.push({ path: `${path}.controllingFaction`, message: 'must be a non-empty string' });
  }
  const metrics = v['baseMetrics'];
  if (metrics !== undefined) {
    if (!isRecord(metrics)) {
      errors.push({ path: `${path}.baseMetrics`, message: 'must be an object' });
    } else {
      const metricsPath = `${path}.baseMetrics`;
      checkNumberInRange(errors, metrics, 'alertPressure', metricsPath, 0, 100);
      checkNumberInRange(errors, metrics, 'rumorDensity', metricsPath, 0, 100);
      checkNumberInRange(errors, metrics, 'intruderLikelihood', metricsPath, 0, 100);
      checkNumberInRange(errors, metrics, 'surveillance', metricsPath, 0, 100);
      checkNumberInRange(errors, metrics, 'stability', metricsPath, 0, 1);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Validate a location pack draft: a `district` section plus a non-empty
 * `rooms` array, each room checked by the content-schema room validator.
 */
export function validateLocationPackDefinition(v: unknown, path = 'LocationPack'): ValidationResult {
  if (!isRecord(v)) return { ok: false, errors: [{ path, message: 'must be an object' }] };
  const errors: ValidationError[] = [];
  if (v['district'] === undefined) {
    errors.push({ path: `${path}.district`, message: 'required district object' });
  } else {
    errors.push(...validateDistrictDefinition(v['district'], `${path}.district`).errors);
  }
  const rooms = v['rooms'];
  if (!Array.isArray(rooms) || rooms.length === 0) {
    errors.push({ path: `${path}.rooms`, message: 'required non-empty array of rooms' });
  } else {
    rooms.forEach((room, idx) => {
      errors.push(...validateRoomDefinition(room, `${path}.rooms[${idx}]`).errors);
    });
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Validate an encounter pack draft: a `room`, a non-empty `entities` array,
 * and a `quest`, each checked by the matching content-schema validator.
 */
export function validateEncounterPackDefinition(v: unknown, path = 'EncounterPack'): ValidationResult {
  if (!isRecord(v)) return { ok: false, errors: [{ path, message: 'must be an object' }] };
  const errors: ValidationError[] = [];
  if (v['room'] === undefined) {
    errors.push({ path: `${path}.room`, message: 'required room object' });
  } else {
    errors.push(...validateRoomDefinition(v['room'], `${path}.room`).errors);
  }
  const entities = v['entities'];
  if (!Array.isArray(entities) || entities.length === 0) {
    errors.push({ path: `${path}.entities`, message: 'required non-empty array of entities' });
  } else {
    entities.forEach((entity, idx) => {
      errors.push(...validateEntityBlueprint(entity, `${path}.entities[${idx}]`).errors);
    });
  }
  if (v['quest'] === undefined) {
    errors.push({ path: `${path}.quest`, message: 'required quest object' });
  } else {
    errors.push(...validateQuestDefinition(v['quest'], `${path}.quest`).errors);
  }
  return { ok: errors.length === 0, errors };
}

/** Validate a parsed faction object (wrapper mirroring validateGeneratedRoom). */
export function validateGeneratedFaction(raw: string, parsed: unknown): GeneratedContentResult {
  const validation = validateFactionDefinition(parsed);
  return { valid: validation.ok, content: parsed, validation, raw };
}

/** Validate a parsed district object (wrapper mirroring validateGeneratedRoom). */
export function validateGeneratedDistrict(raw: string, parsed: unknown): GeneratedContentResult {
  const validation = validateDistrictDefinition(parsed);
  return { valid: validation.ok, content: parsed, validation, raw };
}

/** Validate a parsed location pack (wrapper mirroring validateGeneratedRoom). */
export function validateGeneratedLocationPack(raw: string, parsed: unknown): GeneratedContentResult {
  const validation = validateLocationPackDefinition(parsed);
  return { valid: validation.ok, content: parsed, validation, raw };
}

/** Validate a parsed encounter pack (wrapper mirroring validateGeneratedRoom). */
export function validateGeneratedEncounterPack(raw: string, parsed: unknown): GeneratedContentResult {
  const validation = validateEncounterPackDefinition(parsed);
  return { valid: validation.ok, content: parsed, validation, raw };
}
