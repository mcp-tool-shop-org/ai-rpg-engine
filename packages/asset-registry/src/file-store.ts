// Filesystem asset store — persistent, content-addressed directory layout
//
// Directory structure:
//   <root>/
//     <hash[0:2]>/
//       <hash>.bin     — raw bytes
//       <hash>.json    — metadata

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { AssetMetadata, AssetInput, AssetFilter, AssetStore } from './types.js';
import { hashBytes } from './hash.js';
import { matchesFilter } from './filter.js';

export class FileAssetStore implements AssetStore {
  constructor(private readonly root: string) {}

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

  async get(hash: string): Promise<Uint8Array | null> {
    try {
      const buf = await fs.readFile(this.dataPath(hash));
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  async getMeta(hash: string): Promise<AssetMetadata | null> {
    try {
      const json = await fs.readFile(this.metaPath(hash), 'utf-8');
      return JSON.parse(json) as AssetMetadata;
    } catch {
      return null;
    }
  }

  async has(hash: string): Promise<boolean> {
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
        try {
          const json = await fs.readFile(path.join(shardPath, file), 'utf-8');
          const meta = JSON.parse(json) as AssetMetadata;
          if (!filter || matchesFilter(meta, filter)) {
            results.push(meta);
          }
        } catch {
          // Skip corrupt metadata files
        }
      }
    }

    return results;
  }

  async delete(hash: string): Promise<boolean> {
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
