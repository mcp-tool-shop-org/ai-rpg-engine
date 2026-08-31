// In-memory asset store — useful for testing and ephemeral sessions

import type { AssetMetadata, AssetInput, AssetFilter, AssetGetOptions, AssetStore, StoreQuota } from './types.js';
import { hashBytes } from './hash.js';
import { matchesFilter, unionTags, cloneMetadata } from './filter.js';
import {
  OverQuotaError,
  wouldExceedQuota,
  sortOldestFirst,
  reserveQuota,
  applyPinFlags,
  tagsRequestPin,
  isEvictingPolicy,
  stampAccessed,
} from './quota.js';

export class MemoryAssetStore implements AssetStore {
  private data = new Map<string, Uint8Array>();
  private meta = new Map<string, AssetMetadata>();

  constructor(private readonly quota?: StoreQuota) {}

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

    await this.enforceQuota(data.length);

    const now = new Date().toISOString();
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
      createdAt: now,
      accessedAt: now,
      source: input.source,
    };
    const stored = tagsRequestPin(metadata.tags) ? applyPinFlags(metadata, true) : metadata;

    this.data.set(hash, new Uint8Array(data));
    this.meta.set(hash, stored);
    return cloneMetadata(stored);
  }

  async get(hash: string, opts?: AssetGetOptions): Promise<Uint8Array | null> {
    const bytes = this.data.get(hash);
    if (!bytes) return null;
    // Honor the AssetStore verify contract for parity with FileAssetStore —
    // in-memory bytes are keyed by their own digest, so this only fires if
    // something reached in and mutated the map.
    if (opts?.verify && hashBytes(bytes) !== hash) return null;
    if (opts?.touch !== false) this.stampNow(hash);
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

  async totalBytes(): Promise<number> {
    let total = 0;
    for (const m of this.meta.values()) total += m.sizeBytes;
    return total;
  }

  async evictUntil(quota: StoreQuota, keepHashes?: readonly string[]): Promise<number> {
    const all = [...this.meta.values()];
    const ordered = sortOldestFirst(all, keepHashes, quota.policy);
    let count = all.length;
    let bytes = all.reduce((s, m) => s + m.sizeBytes, 0);
    let n = 0;
    for (const meta of ordered) {
      const overCount = quota.maxCount !== undefined && count > quota.maxCount;
      const overBytes = quota.maxBytes !== undefined && bytes > quota.maxBytes;
      if (!overCount && !overBytes) break;
      const deleted = await this.delete(meta.hash);
      if (deleted) {
        count--;
        bytes -= meta.sizeBytes;
        n++;
      }
    }
    return n;
  }

  async pin(hash: string): Promise<boolean> {
    const stored = this.meta.get(hash);
    if (!stored) return false;
    this.meta.set(hash, applyPinFlags(stored, true));
    return true;
  }

  async unpin(hash: string): Promise<boolean> {
    const stored = this.meta.get(hash);
    if (!stored) return false;
    this.meta.set(hash, applyPinFlags(stored, false));
    return true;
  }

  async touch(hash: string): Promise<boolean>;
  async touch(hashes: readonly string[]): Promise<number>;
  async touch(hash: string | readonly string[]): Promise<boolean | number> {
    if (typeof hash === 'string') return this.stampNow(hash);
    let n = 0;
    for (const h of hash) {
      if (this.stampNow(h)) n++;
    }
    return n;
  }

  private stampNow(hash: string): boolean {
    const stored = this.meta.get(hash);
    if (!stored || !this.data.has(hash)) return false;
    this.meta.set(hash, stampAccessed(stored, new Date().toISOString()));
    return true;
  }

  /** New-blob puts only — hash-hits never consume quota (CAS identity). */
  private async enforceQuota(incomingBytes: number): Promise<void> {
    const quota = this.quota;
    if (!quota) return;
    if (isEvictingPolicy(quota.policy)) {
      await this.evictUntil(reserveQuota(quota, incomingBytes));
    }
    const count = await this.count();
    const bytes = await this.totalBytes();
    if (wouldExceedQuota(count, bytes, quota, 1, incomingBytes)) {
      throw new OverQuotaError({
        sizeBytes: bytes + incomingBytes,
        count: count + 1,
        quota,
      });
    }
  }
}
