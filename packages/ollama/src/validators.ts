// Validate generated content against engine schemas

import { validateRoomDefinition, validateQuestDefinition } from '@ai-rpg-engine/content-schema';
import type { ValidationResult } from '@ai-rpg-engine/content-schema';

export type GeneratedContentResult = {
  valid: boolean;
  content: unknown;
  validation: ValidationResult;
  raw: string;
};

/**
 * Parse YAML text into an object. Uses a minimal inline parser
 * for flat/shallow structures to avoid external dependencies.
 * Falls back gracefully if shape is wrong — the schema validator
 * catches structural issues.
 */
export function parseYamlish(text: string): unknown {
  // Attempt JSON parse first (some models output JSON even when asked for YAML)
  try {
    return JSON.parse(text);
  } catch { /* not JSON, continue */ }

  // Minimal YAML-like parser for flat key: value and arrays.
  // This handles the subset of YAML the engine's content schemas use.
  // For production, swap in a proper YAML parser.
  const result: Record<string, unknown> = {};
  const lines = text.split('\n');
  let currentKey = '';
  let currentArr: unknown[] | null = null;
  let insideArray = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');

    // Array item at root level: "- item"
    if (insideArray && currentArr && /^\s+-\s+/.test(line)) {
      const val = line.replace(/^\s+-\s+/, '').trim();
      currentArr.push(coerce(val));
      continue;
    }

    // End nested context on de-indent
    if (insideArray && currentArr && /^\S/.test(line)) {
      result[currentKey] = currentArr;
      currentArr = null;
      insideArray = false;
    }

    // Top-level "key: value" or "key:"
    const topMatch = /^(\w[\w-]*):\s*(.*)/.exec(line);
    if (topMatch) {
      const [, key, rest] = topMatch;
      currentKey = key;
      if (rest.trim()) {
        result[key] = coerce(rest.trim());
      }
      // Peek for array or object on next lines — handled by list detection above
      continue;
    }

    // Array start: "- " at indent after a key with no value
    if (/^\s+-\s/.test(line) && currentKey && !(currentKey in result)) {
      insideArray = true;
      currentArr = [];
      const val = line.replace(/^\s+-\s+/, '').trim();
      if (val) currentArr.push(coerce(val));
      continue;
    }
  }

  // Flush trailing array
  if (insideArray && currentArr) result[currentKey] = currentArr;

  return result;
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
