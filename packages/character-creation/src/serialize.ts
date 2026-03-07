// Character build serialization — import/export as JSON

import type { CharacterBuild } from './types.js';

const REQUIRED_FIELDS = ['name', 'archetypeId', 'backgroundId', 'traitIds'] as const;

/** Serialize a character build to a JSON string. */
export function serializeBuild(build: CharacterBuild): string {
  return JSON.stringify(build, null, 2);
}

/** Deserialize a character build from a JSON string. Throws on invalid JSON. */
export function deserializeBuild(json: string): CharacterBuild {
  const parsed = JSON.parse(json);
  const validation = validateSerializedBuild(json);
  if (!validation.ok) {
    throw new Error(`Invalid build JSON: ${validation.errors.join('; ')}`);
  }
  return parsed as CharacterBuild;
}

/** Validate a JSON string as a valid CharacterBuild shape. */
export function validateSerializedBuild(json: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, errors: ['Invalid JSON'] };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, errors: ['Root must be an object'] };
  }

  const obj = parsed as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (!(field in obj)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (typeof obj.name !== 'string') errors.push('name must be a string');
  if (typeof obj.archetypeId !== 'string') errors.push('archetypeId must be a string');
  if (typeof obj.backgroundId !== 'string') errors.push('backgroundId must be a string');

  if (!Array.isArray(obj.traitIds)) {
    errors.push('traitIds must be an array');
  } else {
    for (const tid of obj.traitIds) {
      if (typeof tid !== 'string') errors.push('traitIds entries must be strings');
    }
  }

  if (obj.disciplineId !== undefined && typeof obj.disciplineId !== 'string') {
    errors.push('disciplineId must be a string if provided');
  }

  if (obj.portraitRef !== undefined && typeof obj.portraitRef !== 'string') {
    errors.push('portraitRef must be a string if provided');
  }

  if (obj.statAllocations !== undefined) {
    if (typeof obj.statAllocations !== 'object' || obj.statAllocations === null || Array.isArray(obj.statAllocations)) {
      errors.push('statAllocations must be an object');
    } else {
      for (const [key, val] of Object.entries(obj.statAllocations as Record<string, unknown>)) {
        if (typeof val !== 'number') errors.push(`statAllocations.${key} must be a number`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
