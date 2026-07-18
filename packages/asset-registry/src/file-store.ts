// Filesystem asset store — persistent, content-addressed directory layout
//
// Directory structure:
//   <root>/
//     <hash[0:2]>/
//       <hash>.bin     — raw bytes
//       <hash>.json    — metadata

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { AssetMetadata, AssetInput, AssetFilter, AssetGetOptions, AssetStore } from './types.js';
import { VALID_ASSET_KINDS } from './types.js';
import { hashBytes, isValidHash } from './hash.js';
import { matchesFilter } from './filter.js';

/**
 * Runtime shape check for a parsed metadata sidecar (F-4d8f612a). The sidecar
 * is a JSON boundary like every other load path in this domain — a file that
 * parses but is wrong-shaped (hand-edited, legacy, partially written) must be
 * treated as corrupt HERE, not returned under a blind `as AssetMetadata` cast
 * so the first caller to touch a missing field (e.g. matchesFilter's
 * `meta.tags.includes(...)`) raw-throws far from the root cause.
 * Optional fields (width/height/source) are only checked when present.
 */
function isAssetMetadataShape(v: unknown): v is AssetMetadata {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.hash === 'string' &&
    typeof m.kind === 'string' &&
    (VALID_ASSET_KINDS as readonly string[]).includes(m.kind) &&
    typeof m.mimeType === 'string' &&
    typeof m.sizeBytes === 'number' &&
    Number.isFinite(m.sizeBytes) &&
    Array.isArray(m.tags) &&
    typeof m.createdAt === 'string' &&
    (m.width === undefined || typeof m.width === 'number') &&
    (m.height === undefined || typeof m.height === 'number') &&
    (m.source === undefined || typeof m.source === 'string')
  );
}

export class FileAssetStore implements AssetStore {
  constructor(private readonly root: string) {}

  // Security (v2.5 audit A5): every public method that accepts a hash MUST
  // reject anything that is not a SHA-256 hex digest BEFORE it reaches
  // path.join — a "hash" like '../../x' would otherwise resolve outside the
  // store root (read oracle on get/getMeta/has, arbitrary unlink on delete).

  private shardDir(hash: string): string {
    return path.join(this.root, hash.slice(0, 2));
  }

  private dataPath(hash: string): string {
    return path.join(this.shardDir(hash), `${hash}.bin`);
  }

  private metaPath(hash: string): string {
    return path.join(this.shardDir(hash), `${hash}.json`);
  }

  async put(data: Uint8Array, input: AssetInput): Promise<AssetMetadata> {
    const hash = hashBytes(data);

    // Dedup — if already stored, return existing metadata
    const existing = await this.getMeta(hash);
    if (existing) return existing;

    const metadata: AssetMetadata = {
      hash,
      kind: input.kind,
      mimeType: input.mimeType,
      width: input.width,
      height: input.height,
      sizeBytes: data.length,
      tags: input.tags ?? [],
      createdAt: new Date().toISOString(),
      source: input.source,
    };

    const dir = this.shardDir(hash);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.dataPath(hash), data);
    await fs.writeFile(this.metaPath(hash), JSON.stringify(metadata, null, 2));

    return metadata;
  }

  async get(hash: string, opts?: AssetGetOptions): Promise<Uint8Array | null> {
    if (!isValidHash(hash)) return null;
    try {
      const buf = await fs.readFile(this.dataPath(hash));
      const bytes = new Uint8Array(buf);
      // Integrity on read (v2.5 audit A4): with `verify`, prove the bytes
      // still match their content address before serving them. Opt-in so hot
      // paths keep skipping the extra hash.
      if (opts?.verify && hashBytes(bytes) !== hash) return null;
      return bytes;
    } catch {
      return null;
    }
  }

  async getMeta(hash: string): Promise<AssetMetadata | null> {
    if (!isValidHash(hash)) return null;
    let parsed: unknown;
    try {
      const json = await fs.readFile(this.metaPath(hash), 'utf-8');
      parsed = JSON.parse(json);
    } catch {
      // Missing file or invalid JSON — not found.
      return null;
    }
    // Valid JSON, wrong shape — corrupt sidecar, same verdict (F-4d8f612a).
    return isAssetMetadataShape(parsed) ? parsed : null;
  }

  /**
   * NOTE: has() only guarantees the `.bin` BLOB exists — it does not confirm
   * the metadata sidecar is present or well-shaped, so `has(h) === true` does
   * NOT imply `getMeta(h)` will succeed. Callers that need the metadata should
   * call getMeta() and handle null (F-4d8f612a).
   */
  async has(hash: string): Promise<boolean> {
    if (!isValidHash(hash)) return false;
    try {
      await fs.access(this.dataPath(hash));
      return true;
    } catch {
      return false;
    }
  }

  async list(filter?: AssetFilter): Promise<AssetMetadata[]> {
    const results: AssetMetadata[] = [];

    let shards: string[];
    try {
      shards = await fs.readdir(this.root);
    } catch {
      return results;
    }

    for (const shard of shards) {
      const shardPath = path.join(this.root, shard);
      let files: string[];
      try {
        files = await fs.readdir(shardPath);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        let parsed: unknown;
        try {
          const json = await fs.readFile(path.join(shardPath, file), 'utf-8');
          parsed = JSON.parse(json);
        } catch {
          // Skip unreadable or non-JSON sidecars (I/O error / parse failure).
          continue;
        }
        // Skip valid-JSON-but-wrong-shaped sidecars too (F-4d8f612a) — BEFORE
        // matchesFilter, so a malformed entry is excluded consistently whether
        // or not a filter was passed. Previously an unfiltered list() returned
        // the malformed object while a filtered list() silently swallowed
        // matchesFilter's TypeError in this catch — same file, two behaviors.
        if (!isAssetMetadataShape(parsed)) continue;
        if (!filter || matchesFilter(parsed, filter)) {
          results.push(parsed);
        }
      }
    }

    return results;
  }

  async delete(hash: string): Promise<boolean> {
    if (!isValidHash(hash)) return false;
    const existed = await this.has(hash);
    if (!existed) return false;

    await fs.unlink(this.dataPath(hash)).catch(() => {});
    await fs.unlink(this.metaPath(hash)).catch(() => {});

    // Try to remove empty shard directory
    const dir = this.shardDir(hash);
    try {
      const remaining = await fs.readdir(dir);
      if (remaining.length === 0) await fs.rmdir(dir);
    } catch {
      // Shard dir already gone or not empty
    }

    return true;
  }

  async count(): Promise<number> {
    const all = await this.list();
    return all.length;
  }
}
