// In-memory asset store — useful for testing and ephemeral sessions

import type { AssetMetadata, AssetInput, AssetFilter, AssetGetOptions, AssetStore } from './types.js';
import { hashBytes } from './hash.js';
import { matchesFilter, unionTags, cloneMetadata } from './filter.js';

export class MemoryAssetStore implements AssetStore {
  private data = new Map<string, Uint8Array>();
  private meta = new Map<string, AssetMetadata>();

  async put(data: Uint8Array, input: AssetInput): Promise<AssetMetadata> {
    const hash = hashBytes(data);

    // Dedup — same bytes reuse the stored asset. Union incoming tags so a
    // second writer (e.g. char:Alice: after char:Alice) is still findable
    // (F-930e6b5b). Other metadata stays first-writer-wins.
    const existing = this.meta.get(hash);
    if (existing) {
      const mergedTags = unionTags(existing.tags, input.tags);
      if (!mergedTags) return cloneMetadata(existing);
      const merged: AssetMetadata = { ...existing, tags: mergedTags };
      this.meta.set(hash, merged);
      return cloneMetadata(merged);
    }

    const metadata: AssetMetadata = {
      hash,
      kind: input.kind,
      mimeType: input.mimeType,
      width: input.width,
      height: input.height,
      sizeBytes: data.length,
      // Clone tags on put so the Map is not aliased to the caller's array
      // (F-b2b8a190). File stringify/re-parse already isolates; Memory must
      // copy explicitly.
      tags: input.tags ? [...input.tags] : [],
      createdAt: new Date().toISOString(),
      source: input.source,
    };

    this.data.set(hash, new Uint8Array(data));
    this.meta.set(hash, metadata);
    return cloneMetadata(metadata);
  }

  async get(hash: string, opts?: AssetGetOptions): Promise<Uint8Array | null> {
    const bytes = this.data.get(hash);
    if (!bytes) return null;
    // Honor the AssetStore verify contract for parity with FileAssetStore —
    // in-memory bytes are keyed by their own digest, so this only fires if
    // something reached in and mutated the map.
    if (opts?.verify && hashBytes(bytes) !== hash) return null;
    return new Uint8Array(bytes);
  }

  async getMeta(hash: string): Promise<AssetMetadata | null> {
    const stored = this.meta.get(hash);
    return stored ? cloneMetadata(stored) : null;
  }

  async has(hash: string): Promise<boolean> {
    return this.data.has(hash);
  }

  async list(filter?: AssetFilter): Promise<AssetMetadata[]> {
    const all = [...this.meta.values()];
    const matched = filter ? all.filter((m) => matchesFilter(m, filter)) : all;
    return matched.map(cloneMetadata);
  }

  async delete(hash: string): Promise<boolean> {
    const existed = this.data.has(hash);
    this.data.delete(hash);
    this.meta.delete(hash);
    return existed;
  }

  async count(): Promise<number> {
    return this.data.size;
  }
}
