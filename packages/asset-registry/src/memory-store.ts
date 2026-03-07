// In-memory asset store — useful for testing and ephemeral sessions

import type { AssetMetadata, AssetInput, AssetFilter, AssetStore } from './types.js';
import { hashBytes } from './hash.js';
import { matchesFilter } from './filter.js';

export class MemoryAssetStore implements AssetStore {
  private data = new Map<string, Uint8Array>();
  private meta = new Map<string, AssetMetadata>();

  async put(data: Uint8Array, input: AssetInput): Promise<AssetMetadata> {
    const hash = hashBytes(data);

    // Dedup — if already stored, return existing metadata
    const existing = this.meta.get(hash);
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

    this.data.set(hash, new Uint8Array(data));
    this.meta.set(hash, metadata);
    return metadata;
  }

  async get(hash: string): Promise<Uint8Array | null> {
    const bytes = this.data.get(hash);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async getMeta(hash: string): Promise<AssetMetadata | null> {
    return this.meta.get(hash) ?? null;
  }

  async has(hash: string): Promise<boolean> {
    return this.data.has(hash);
  }

  async list(filter?: AssetFilter): Promise<AssetMetadata[]> {
    const all = [...this.meta.values()];
    if (!filter) return all;
    return all.filter((m) => matchesFilter(m, filter));
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
