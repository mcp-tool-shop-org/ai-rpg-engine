// Character build serialization — import/export as JSON

import type { CharacterBuild } from './types.js';
import { BUILD_VERSION } from './types.js';

const REQUIRED_FIELDS = ['name', 'archetypeId', 'backgroundId', 'traitIds'] as const;

// --- Structured load error (mirrors core's SaveLoadError shape) ---

/** Structured error thrown when a build cannot be deserialized. */
export type BuildLoadErrorShape = {
  code: 'BUILD_MALFORMED' | 'BUILD_VERSION_UNSUPPORTED';
  message: string;
  hint: string;
};

export class BuildLoadError extends Error {
  readonly code: BuildLoadErrorShape['code'];
  readonly hint: string;
  constructor(shape: BuildLoadErrorShape) {
    super(shape.message);
    this.name = 'BuildLoadError';
    this.code = shape.code;
    this.hint = shape.hint;
  }
}

/** Serialize a character build to a JSON string. Stamps the current schema version. */
export function serializeBuild(build: CharacterBuild): string {
  return JSON.stringify({ ...build, version: build.version ?? BUILD_VERSION }, null, 2);
}

/**
 * Deserialize a character build from a JSON string.
 * Throws a structured BuildLoadError (never a raw SyntaxError) on invalid
 * input. Legacy builds without a version field are stamped with the current
 * schema version; builds from a newer schema are rejected.
 */
export function deserializeBuild(json: string): CharacterBuild {
  const result = inspectSerializedBuild(json);
  if (!result.ok) {
    throw new BuildLoadError({
      code: result.code,
      message: `Invalid build JSON: ${result.errors.join('; ')}`,
      hint: result.code === 'BUILD_VERSION_UNSUPPORTED'
        ? 'This build was exported by a newer engine version — upgrade to load it.'
        : 'The build JSON is corrupt or was not produced by serializeBuild.',
    });
  }
  const base = result.parsed as unknown as CharacterBuild;
  // Migrate legacy (pre-versioning) builds: stamp the current schema version.
  return { ...base, version: base.version ?? BUILD_VERSION };
}

/** Validate a JSON string as a valid CharacterBuild shape. */
export function validateSerializedBuild(json: string): { ok: boolean; errors: string[] } {
  const result = inspectSerializedBuild(json);
  return result.ok ? { ok: true, errors: [] } : { ok: false, errors: result.errors };
}

// --- Internal: single-parse validation shared by deserialize + validate ---

type InspectResult =
  | { ok: true; parsed: Record<string, unknown> }
  | { ok: false; errors: string[]; code: BuildLoadErrorShape['code'] };

function inspectSerializedBuild(json: string): InspectResult {
  const errors: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, errors: ['Invalid JSON'], code: 'BUILD_MALFORMED' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, errors: ['Root must be an object'], code: 'BUILD_MALFORMED' };
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

  // Schema version: optional (legacy builds predate it), but if present it
  // must be a number and must not come from a newer schema than this engine.
  let versionUnsupported = false;
  if (obj.version !== undefined) {
    if (typeof obj.version !== 'number' || Number.isNaN(obj.version)) {
      errors.push('version must be a number if provided');
    } else if (obj.version > BUILD_VERSION) {
      errors.push(`build version ${obj.version} is newer than supported version ${BUILD_VERSION}`);
      versionUnsupported = true;
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      code: versionUnsupported ? 'BUILD_VERSION_UNSUPPORTED' : 'BUILD_MALFORMED',
    };
  }

  return { ok: true, parsed: obj };
}
