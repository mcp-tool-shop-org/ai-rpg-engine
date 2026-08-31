// File-source soundpack ingest — hash variants into an AssetStore as kind audio.

import { readFile, access } from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';
import { loadFile } from './authoring.js';
import type { SoundEntry, SoundPackManifest } from './types.js';
import { validateManifest, type ManifestError } from './validate.js';

/** Minimal store surface {@link ingestFilePack} writes audio blobs into. */
export type AudioAssetSink = {
  put(
    data: Uint8Array,
    input: {
      kind: 'audio';
      mimeType: string;
      tags?: string[];
      source?: string;
    },
  ): Promise<{ hash: string }>;
};

export type IngestError = {
  field: string;
  message: string;
};

export type IngestFilePackOptions = {
  /** Manifest to ingest. Default: `{dir}/manifest.json`. */
  manifest?: SoundPackManifest;
  /** Run {@link validateManifest}. Default true. */
  validate?: boolean;
};

export type IngestResult = {
  manifest: SoundPackManifest;
  ingested: number;
  errors: IngestError[];
  warnings: IngestError[];
};

function mimeFromName(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
  switch (ext) {
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    case 'mp3':
      return 'audio/mpeg';
    case 'flac':
      return 'audio/flac';
    case 'm4a':
      return 'audio/mp4';
    case 'webm':
      return 'audio/webm';
    default:
      return 'application/octet-stream';
  }
}

function cloneManifest(manifest: SoundPackManifest): SoundPackManifest {
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  return {
    ...manifest,
    entries: entries.map((e) => {
      if (!e || typeof e !== 'object') return e;
      const entry = {
        ...e,
        tags: [...(e.tags ?? [])],
        mood: [...(e.mood ?? [])],
        variants: [...(e.variants ?? [])],
      };
      if (e.hashes) entry.hashes = { ...e.hashes };
      else delete entry.hashes;
      return entry;
    }),
  };
}

/**
 * Validate a file pack, put each `source: 'file'` variant into `store` as
 * `kind: 'audio'`, and record content hashes on the entry.
 */
export async function ingestFilePack(
  dir: string,
  store: AudioAssetSink,
  opts?: IngestFilePackOptions,
): Promise<IngestResult> {
  const errors: IngestError[] = [];
  const warnings: IngestError[] = [];

  let manifest: SoundPackManifest;
  if (opts?.manifest) {
    manifest = cloneManifest(opts.manifest);
  } else {
    try {
      manifest = cloneManifest(await loadFile(join(dir, 'manifest.json'), { validate: false }));
    } catch (err) {
      return {
        manifest: { name: '', version: '', description: '', author: '', entries: [] },
        ingested: 0,
        errors: [
          {
            field: 'manifest',
            message:
              `could not read ${join(dir, 'manifest.json')}: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        warnings,
      };
    }
  }

  const validate = opts?.validate !== false;
  if (validate) {
    const schemaErrors: ManifestError[] = validateManifest(manifest);
    for (const e of schemaErrors) {
      errors.push({ field: e.field, message: e.message });
    }
    if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.entries)) {
      return { manifest, ingested: 0, errors, warnings };
    }
  }

  let ingested = 0;
  for (let i = 0; i < manifest.entries.length; i++) {
    const entry: SoundEntry = manifest.entries[i];
    if (!entry || typeof entry !== 'object') continue;
    if (entry.source !== 'file') continue;

    const hashes: Record<string, string> = { ...(entry.hashes ?? {}) };
    const variants = Array.isArray(entry.variants) ? entry.variants : [];
    if (variants.length === 0) {
      warnings.push({
        field: `entries[${i}].variants`,
        message: `file-source entry "${entry.id}" has no variants to ingest`,
      });
      continue;
    }

    for (let v = 0; v < variants.length; v++) {
      const variant = variants[v];
      if (typeof variant !== 'string' || variant.length === 0) {
        errors.push({
          field: `entries[${i}].variants[${v}]`,
          message: 'variant must be a non-empty filename',
        });
        continue;
      }
      const filePath = isAbsolute(variant) ? variant : join(dir, variant);
      try {
        await access(filePath);
      } catch {
        errors.push({
          field: `entries[${i}].variants[${v}]`,
          message: `file not found: ${filePath}`,
        });
        continue;
      }

      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await readFile(filePath));
      } catch (err) {
        errors.push({
          field: `entries[${i}].variants[${v}]`,
          message: `could not read ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }

      const meta = await store.put(bytes, {
        kind: 'audio',
        mimeType: mimeFromName(variant),
        tags: [
          `sound:${entry.id}`,
          `pack:${manifest.name}`,
          `variant:${basename(variant)}`,
        ],
        source: filePath,
      });
      hashes[variant] = meta.hash;
      ingested += 1;
    }

    entry.hashes = hashes;
  }

  return { manifest, ingested, errors, warnings };
}
