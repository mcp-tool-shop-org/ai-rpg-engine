// Game-manifest validation — the missing front-door validator (v2.5 C5).
//
// `new Engine({ manifest })` / `new WorldStore({ manifest })` previously
// consumed the manifest unchecked: a manifest missing `modules` raw-threw
// `TypeError: options.manifest.modules is not iterable` from deep inside the
// WorldStore constructor — inconsistent with the structured-error discipline
// the save boundary already has (SaveLoadError with code/message/hint).
//
// Scope is deliberately bounded to the fields the engine RUNTIME consumes
// (id, ruleset, modules). NOT validated: title/version/engineVersion/
// contentPacks — the runtime never reads them (Engine.deserialize itself
// reconstructs manifests with empty title/version), and empty-string ids are
// allowed because saves written by earlier engine versions may legitimately
// carry a gameId of ''. Strictness here is bounded by "what would otherwise
// crash or corrupt", not by style preferences.

import type { GameManifest } from './types.js';

/** Structured error shape for an invalid game manifest. */
export type ManifestErrorShape = {
  code: 'MANIFEST_INVALID';
  message: string;
  hint: string;
};

export class ManifestError extends Error {
  readonly code: ManifestErrorShape['code'];
  readonly hint: string;
  constructor(shape: ManifestErrorShape) {
    super(shape.message);
    this.name = 'ManifestError';
    this.code = shape.code;
    this.hint = shape.hint;
  }
}

/** One-word description of a value for error messages (JSON-flavored). */
function describeValue(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'an array';
  return `${typeof v}`;
}

/**
 * Validate the runtime-consumed shape of a GameManifest before the engine
 * adopts it. Throws a structured {@link ManifestError} (code MANIFEST_INVALID,
 * with a hint) instead of letting a malformed manifest raw-throw from
 * `[...manifest.modules]` at WorldStore construction.
 *
 * Called automatically by the WorldStore constructor (and therefore by
 * `new Engine(...)`); exported so tooling (CLI validate, pack loaders) can
 * check a manifest without constructing a world.
 */
export function validateGameManifest(manifest: unknown): asserts manifest is GameManifest {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new ManifestError({
      code: 'MANIFEST_INVALID',
      message: `Game manifest must be an object, got ${describeValue(manifest)}.`,
      hint: 'Pass a GameManifest ({ id, ruleset, modules, ... }) as the `manifest` option.',
    });
  }
  const m = manifest as Record<string, unknown>;
  if (typeof m.id !== 'string') {
    throw new ManifestError({
      code: 'MANIFEST_INVALID',
      message: `Game manifest "id" must be a string, got ${describeValue(m.id)}.`,
      hint: 'Set manifest.id to the game\'s stable identifier (e.g. "my-game").',
    });
  }
  if (typeof m.ruleset !== 'string') {
    throw new ManifestError({
      code: 'MANIFEST_INVALID',
      message: `Game manifest "ruleset" must be a string, got ${describeValue(m.ruleset)}.`,
      hint: 'Set manifest.ruleset to the id of the ruleset this game uses.',
    });
  }
  if (!Array.isArray(m.modules)) {
    throw new ManifestError({
      code: 'MANIFEST_INVALID',
      message: `Game manifest "modules" must be an array of module ids, got ${describeValue(m.modules)}.`,
      hint: 'Set manifest.modules to the module ids this game activates (an empty array [] is valid).',
    });
  }
  for (const mod of m.modules) {
    if (typeof mod !== 'string') {
      throw new ManifestError({
        code: 'MANIFEST_INVALID',
        message: `Game manifest "modules" must contain only strings; found ${describeValue(mod)}.`,
        hint: 'Each entry in manifest.modules is a module id string (e.g. "combat-core").',
      });
    }
  }
}
