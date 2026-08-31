// Soundpack authoring DX — JSON load and CORE scaffold.

import { readFile } from 'node:fs/promises';
import { CORE_SOUND_PACK } from './core-pack.js';
import type { SoundPackManifest } from './types.js';
import { validateManifest } from './validate.js';

export type LoadJsonOptions = {
  /** Run {@link validateManifest}. Default true on the JSON path. */
  validate?: boolean;
};

export type ScaffoldManifestOptions = {
  name: string;
  author: string;
  from?: SoundPackManifest;
  version?: string;
  description?: string;
};

/** Parse a sound-pack JSON document. Validates the manifest by default. */
export function loadJson(text: string, opts?: LoadJsonOptions): SoundPackManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `[soundpack-core] loadJson() received invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const validate = opts?.validate !== false;
  if (validate) {
    const errors = validateManifest(parsed);
    if (errors.length > 0) {
      const detail = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
      throw new Error(`[soundpack-core] loadJson() manifest is invalid: ${detail}`);
    }
  }
  return parsed as SoundPackManifest;
}

/** Read a sound-pack JSON file and {@link loadJson} it. */
export async function loadFile(filePath: string, opts?: LoadJsonOptions): Promise<SoundPackManifest> {
  const text = await readFile(filePath, 'utf8');
  return loadJson(text, opts);
}

/**
 * Clone a pack (CORE_SOUND_PACK by default) into a new author-owned manifest.
 * Nested entry arrays are copied so mutating the scaffold cannot poison `from`.
 */
export function scaffoldManifest(opts: ScaffoldManifestOptions): SoundPackManifest {
  const from = opts.from ?? CORE_SOUND_PACK;
  return {
    name: opts.name,
    version: opts.version ?? '1.0.0',
    description: opts.description ?? `Sound pack scaffolded from ${from.name}`,
    author: opts.author,
    entries: from.entries.map((e) => {
      const entry = {
        ...e,
        tags: [...e.tags],
        mood: [...e.mood],
        variants: [...e.variants],
      };
      if (e.hashes) entry.hashes = { ...e.hashes };
      else delete entry.hashes;
      return entry;
    }),
  };
}
