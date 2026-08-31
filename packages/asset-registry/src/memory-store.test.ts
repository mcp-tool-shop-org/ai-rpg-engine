import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryAssetStore } from './memory-store.js';
import { OverQuotaError } from './quota.js';
import type { AssetInput } from './types.js';

const testInput: AssetInput = {
  kind: 'portrait',
  mimeType: 'image/png',
  width: 256,
  height: 256,
  tags: ['character', 'fantasy'],
  source: 'test',
};

const testData = new Uint8Array([137, 80, 78, 71, 0, 1, 2, 3]);

describe('MemoryAssetStore', () => {
  let store: MemoryAssetStore;

  beforeEach(() => {
    store = new MemoryAssetStore();
  });

  it('stores and retrieves asset bytes', async () => {
    const meta = await store.put(testData, testInput);
    const retrieved = await store.get(meta.hash);
    expect(retrieved).toEqual(testData);
  });

  it('returns content-addressed metadata', async () => {
    const meta = await store.put(testData, testInput);
    expect(meta.hash).toHaveLength(64);
    expect(meta.kind).toBe('portrait');
    expect(meta.mimeType).toBe('image/png');
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
    expect(meta.sizeBytes).toBe(testData.length);
    expect(meta.tags).toEqual(['character', 'fantasy']);
    expect(meta.source).toBe('test');
    expect(meta.createdAt).toBeTruthy();
  });

  it('deduplicates identical content', async () => {
    const meta1 = await store.put(testData, testInput);
    const meta2 = await store.put(testData, { ...testInput, tags: ['different'] });
    expect(meta1.hash).toBe(meta2.hash);
    expect(await store.count()).toBe(1);
    // F-930e6b5b: hash hit unions incoming tags; other metadata stays first-writer
    expect(meta2.tags).toEqual(['character', 'fantasy', 'different']);
    expect(meta2.source).toBe('test');
    expect((await store.getMeta(meta1.hash))?.tags).toEqual(['character', 'fantasy', 'different']);
  });

  it('hash-hit tag union is idempotent when tags already present (F-930e6b5b)', async () => {
    const meta1 = await store.put(testData, testInput);
    const meta2 = await store.put(testData, testInput);
    expect(meta2.tags).toEqual(meta1.tags);
    expect(meta2.createdAt).toBe(meta1.createdAt);
  });

  it('hash-hit unions a new char: identity tag onto stored metadata (F-930e6b5b)', async () => {
    const aliceTag = 'char:["Alice","Mage","fantasy"]';
    const aliceColonTag = 'char:["Alice:","Mage","fantasy"]';
    await store.put(testData, { ...testInput, tags: [aliceTag] });
    const meta2 = await store.put(testData, { ...testInput, tags: [aliceColonTag] });
    expect(meta2.tags).toContain(aliceTag);
    expect(meta2.tags).toContain(aliceColonTag);
    expect(await store.count()).toBe(1);
  });

  it('stores different content as separate assets', async () => {
    await store.put(testData, testInput);
    await store.put(new Uint8Array([9, 8, 7]), testInput);
    expect(await store.count()).toBe(2);
  });

  it('retrieves metadata by hash', async () => {
    const meta = await store.put(testData, testInput);
    const retrieved = await store.getMeta(meta.hash);
    expect(retrieved).toEqual(meta);
  });

  it('returns null for missing hash', async () => {
    expect(await store.get('0'.repeat(64))).toBeNull();
    expect(await store.getMeta('0'.repeat(64))).toBeNull();
  });

  it('checks existence by hash', async () => {
    const meta = await store.put(testData, testInput);
    expect(await store.has(meta.hash)).toBe(true);
    expect(await store.has('0'.repeat(64))).toBe(false);
  });

  it('lists all assets', async () => {
    await store.put(testData, testInput);
    await store.put(new Uint8Array([1]), { kind: 'icon', mimeType: 'image/svg+xml', tags: [] });
    const all = await store.list();
    expect(all).toHaveLength(2);
  });

  it('filters by kind', async () => {
    await store.put(testData, testInput);
    await store.put(new Uint8Array([1]), { kind: 'icon', mimeType: 'image/svg+xml', tags: [] });
    const portraits = await store.list({ kind: 'portrait' });
    expect(portraits).toHaveLength(1);
    expect(portraits[0].kind).toBe('portrait');
  });

  it('filters by tag', async () => {
    await store.put(testData, testInput);
    await store.put(new Uint8Array([1]), { kind: 'portrait', mimeType: 'image/png', tags: ['cyberpunk'] });
    const fantasy = await store.list({ tag: 'fantasy' });
    expect(fantasy).toHaveLength(1);
  });

  it('filters by size range', async () => {
    await store.put(testData, testInput);
    await store.put(new Uint8Array([1]), { kind: 'icon', mimeType: 'image/png', tags: [] });
    const big = await store.list({ minSize: 5 });
    expect(big).toHaveLength(1);
    const small = await store.list({ maxSize: 5 });
    expect(small).toHaveLength(1);
  });

  it('deletes an asset', async () => {
    const meta = await store.put(testData, testInput);
    expect(await store.delete(meta.hash)).toBe(true);
    expect(await store.has(meta.hash)).toBe(false);
    expect(await store.count()).toBe(0);
  });

  it('delete returns false for missing hash', async () => {
    expect(await store.delete('0'.repeat(64))).toBe(false);
  });

  it('returns isolated byte copies', async () => {
    const meta = await store.put(testData, testInput);
    const a = await store.get(meta.hash);
    const b = await store.get(meta.hash);
    expect(a).toEqual(b);
    // Mutating one copy shouldn't affect the other
    if (a) a[0] = 0;
    const c = await store.get(meta.hash);
    expect(c).toEqual(testData);
  });

  // A4 parity: the AssetStore interface exposes get(hash, {verify}) — the
  // memory backend honors the flag (intact bytes still come back).
  it('get honors the verify flag from the AssetStore contract', async () => {
    const meta = await store.put(testData, testInput);
    expect(await store.get(meta.hash, { verify: true })).toEqual(testData);
    expect(await store.get('0'.repeat(64), { verify: true })).toBeNull();
  });

  // F-b2b8a190: put stored the caller's tags array and getMeta/list returned
  // the Map value, so mutating generatePortrait's returned handle (or the
  // caller's input.tags) poisoned identity matching. File re-parses JSON;
  // Memory must clone on put and return copies from getMeta/list.
  describe('metadata isolation (F-b2b8a190)', () => {
    it('put clones tags so mutating the caller array does not poison the store', async () => {
      const tags = ['character', 'fantasy'];
      const meta = await store.put(testData, { ...testInput, tags });
      expect(meta.tags).not.toBe(tags);
      tags.push('placeholder');
      expect(meta.tags).toEqual(['character', 'fantasy']);
      expect((await store.getMeta(meta.hash))?.tags).toEqual(['character', 'fantasy']);
    });

    it('mutating put() return tags does not change getMeta', async () => {
      const meta = await store.put(testData, testInput);
      meta.tags.push('placeholder');
      expect((await store.getMeta(meta.hash))?.tags).toEqual(['character', 'fantasy']);
      expect((await store.getMeta(meta.hash))?.tags).not.toBe(meta.tags);
    });

    it('mutating getMeta() tags does not change the next getMeta', async () => {
      const meta = await store.put(testData, testInput);
      const a = await store.getMeta(meta.hash);
      a!.tags.push('placeholder');
      const b = await store.getMeta(meta.hash);
      expect(b?.tags).toEqual(['character', 'fantasy']);
      expect(b?.tags).not.toBe(a!.tags);
    });

    it('mutating list() tags does not change getMeta or a later list', async () => {
      await store.put(testData, testInput);
      const listed = await store.list();
      listed[0].tags.push('placeholder');
      expect((await store.getMeta(listed[0].hash))?.tags).toEqual(['character', 'fantasy']);
      expect((await store.list())[0].tags).toEqual(['character', 'fantasy']);
    });

    it('hash-hit merge still isolates returned tags from the store', async () => {
      await store.put(testData, testInput);
      const merged = await store.put(testData, { ...testInput, tags: ['different'] });
      merged.tags.push('placeholder');
      expect((await store.getMeta(merged.hash))?.tags).toEqual(['character', 'fantasy', 'different']);
    });
  });
});

describe('MemoryAssetStore quota (F-158910cc)', () => {
  it('totalBytes sums sizeBytes and evictUntil drops oldest by createdAt', async () => {
    const store = new MemoryAssetStore();
    const a = await store.put(new Uint8Array([1, 2, 3]), testInput);
    const b = await store.put(new Uint8Array([4, 5]), testInput);
    expect(await store.totalBytes()).toBe(5);
    expect(await store.evictUntil({ maxCount: 1, policy: 'evict-oldest' })).toBe(1);
    expect(await store.count()).toBe(1);
    expect((await store.has(a.hash) ? 1 : 0) + (await store.has(b.hash) ? 1 : 0)).toBe(1);
  });

  it('reject policy throws OverQuotaError and does not write the new blob', async () => {
    const store = new MemoryAssetStore({ maxCount: 1, policy: 'reject' });
    await store.put(testData, testInput);
    await expect(store.put(new Uint8Array([9, 8, 7]), testInput)).rejects.toMatchObject({
      name: 'OverQuotaError',
      code: 'over_quota',
    });
    expect(await store.count()).toBe(1);
    try {
      await store.put(new Uint8Array([9, 8, 7]), testInput);
    } catch (err) {
      expect(err).toBeInstanceOf(OverQuotaError);
    }
  });

  it('reject policy still allows a hash-hit put (CAS identity is not quota)', async () => {
    const store = new MemoryAssetStore({ maxCount: 1, maxBytes: testData.length, policy: 'reject' });
    await store.put(testData, testInput);
    const again = await store.put(testData, { ...testInput, tags: ['extra'] });
    expect(again.tags).toContain('extra');
    expect(await store.count()).toBe(1);
  });

  it('evict-oldest put makes room then stores the incoming blob', async () => {
    const store = new MemoryAssetStore({ maxCount: 1, policy: 'evict-oldest' });
    const first = await store.put(new Uint8Array([1]), testInput);
    const second = await store.put(new Uint8Array([2]), testInput);
    expect(await store.count()).toBe(1);
    expect(await store.has(first.hash)).toBe(false);
    expect(await store.has(second.hash)).toBe(true);
  });

  it('reject policy throws when a single blob exceeds maxBytes even when empty', async () => {
    const store = new MemoryAssetStore({ maxBytes: 2, policy: 'reject' });
    await expect(store.put(new Uint8Array([1, 2, 3]), testInput)).rejects.toBeInstanceOf(OverQuotaError);
    expect(await store.count()).toBe(0);
  });
});

describe('MemoryAssetStore pin / keepHashes (F-0b108b56)', () => {
  it('pin skips the first portrait when evict-oldest makes room', async () => {
    const store = new MemoryAssetStore({ maxCount: 2, policy: 'evict-oldest' });
    const portrait = await store.put(new Uint8Array([1]), testInput);
    expect(await store.pin(portrait.hash)).toBe(true);
    const meta = await store.getMeta(portrait.hash);
    expect(meta?.pinned).toBe(true);
    expect(meta?.keep).toBe(true);
    expect(meta?.tags).toContain('pinned');

    const junk = await store.put(new Uint8Array([2]), { ...testInput, kind: 'icon' });
    const later = await store.put(new Uint8Array([3]), { ...testInput, kind: 'icon' });
    expect(await store.has(portrait.hash)).toBe(true);
    expect(await store.has(junk.hash)).toBe(false);
    expect(await store.has(later.hash)).toBe(true);
    expect(await store.count()).toBe(2);
  });

  it('keepHashes protects a live zone background without pin()', async () => {
    const store = new MemoryAssetStore();
    const bg = await store.put(new Uint8Array([1]), { ...testInput, kind: 'background' });
    const junk = await store.put(new Uint8Array([2]), { ...testInput, kind: 'icon' });
    expect(await store.evictUntil({ maxCount: 1, policy: 'evict-oldest' }, [bg.hash])).toBe(1);
    expect(await store.has(bg.hash)).toBe(true);
    expect(await store.has(junk.hash)).toBe(false);
  });

  it('tags.includes("pinned") is skipped by sortOldestFirst', async () => {
    const store = new MemoryAssetStore();
    const pinned = await store.put(new Uint8Array([1]), { ...testInput, tags: ['pinned'] });
    expect(pinned.pinned).toBe(true);
    await store.put(new Uint8Array([2]), testInput);
    expect(await store.evictUntil({ maxCount: 1, policy: 'evict-oldest' })).toBe(1);
    expect(await store.has(pinned.hash)).toBe(true);
    expect(await store.count()).toBe(1);
  });

  it('unpin returns the asset to FIFO eviction', async () => {
    const store = new MemoryAssetStore();
    const first = await store.put(new Uint8Array([1]), testInput);
    await store.pin(first.hash);
    const second = await store.put(new Uint8Array([2]), testInput);
    expect(await store.unpin(first.hash)).toBe(true);
    expect((await store.getMeta(first.hash))?.pinned).toBeUndefined();
    expect(await store.evictUntil({ maxCount: 1, policy: 'evict-oldest' })).toBe(1);
    expect(await store.has(first.hash)).toBe(false);
    expect(await store.has(second.hash)).toBe(true);
  });

  it('hash-hit put still never consumes quota while pinned', async () => {
    const store = new MemoryAssetStore({ maxCount: 1, policy: 'reject' });
    const first = await store.put(testData, testInput);
    await store.pin(first.hash);
    const again = await store.put(testData, { ...testInput, tags: ['extra'] });
    expect(again.tags).toContain('extra');
    expect(again.pinned).toBe(true);
    expect(await store.count()).toBe(1);
  });

  it('pin of a missing hash is false', async () => {
    const store = new MemoryAssetStore();
    expect(await store.pin('0'.repeat(64))).toBe(false);
    expect(await store.unpin('0'.repeat(64))).toBe(false);
  });

  it('evict-oldest still throws OverQuotaError when only pinned assets remain', async () => {
    const store = new MemoryAssetStore({ maxCount: 1, policy: 'evict-oldest' });
    const first = await store.put(new Uint8Array([1]), testInput);
    await store.pin(first.hash);
    await expect(store.put(new Uint8Array([2]), testInput)).rejects.toBeInstanceOf(OverQuotaError);
    expect(await store.has(first.hash)).toBe(true);
    expect(await store.count()).toBe(1);
  });
});

describe('MemoryAssetStore accessedAt / evict-lru (F-caad5a4d)', () => {
  it('put stamps accessedAt; get() and touch() update it', async () => {
    const store = new MemoryAssetStore();
    const first = await store.put(new Uint8Array([1]), testInput);
    expect(first.accessedAt).toBe(first.createdAt);
    await new Promise((r) => setTimeout(r, 8));
    expect(await store.get(first.hash)).toEqual(new Uint8Array([1]));
    const afterGet = await store.getMeta(first.hash);
    expect(afterGet?.accessedAt).toBeDefined();
    expect(afterGet!.accessedAt! >= first.createdAt).toBe(true);
    await new Promise((r) => setTimeout(r, 8));
    expect(await store.touch(first.hash)).toBe(true);
    const afterTouch = await store.getMeta(first.hash);
    expect(afterTouch!.accessedAt! >= afterGet!.accessedAt!).toBe(true);
    expect(await store.touch(['0'.repeat(64), first.hash])).toBe(1);
  });

  it('evict-lru drops unshown junk before a last-shown unpinned portrait', async () => {
    const store = new MemoryAssetStore({ maxCount: 2, policy: 'evict-lru' });
    const portrait = await store.put(new Uint8Array([1]), testInput);
    const junk = await store.put(new Uint8Array([2]), { ...testInput, kind: 'icon' });
    await new Promise((r) => setTimeout(r, 8));
    await store.get(portrait.hash);
    await new Promise((r) => setTimeout(r, 8));
    const later = await store.put(new Uint8Array([3]), { ...testInput, kind: 'icon' });
    expect(await store.has(portrait.hash)).toBe(true);
    expect(await store.has(junk.hash)).toBe(false);
    expect(await store.has(later.hash)).toBe(true);
  });

  it('pin still skips eviction under evict-lru; hash-hit put never consumes quota', async () => {
    const store = new MemoryAssetStore({ maxCount: 1, policy: 'evict-lru' });
    const portrait = await store.put(new Uint8Array([1]), testInput);
    expect(await store.pin(portrait.hash)).toBe(true);
    await expect(store.put(new Uint8Array([2]), testInput)).rejects.toBeInstanceOf(OverQuotaError);
    expect(await store.has(portrait.hash)).toBe(true);

    const rejectStore = new MemoryAssetStore({ maxCount: 1, policy: 'reject' });
    const first = await rejectStore.put(testData, testInput);
    const again = await rejectStore.put(testData, { ...testInput, tags: ['extra'] });
    expect(again.hash).toBe(first.hash);
    expect(again.tags).toContain('extra');
    expect(await rejectStore.count()).toBe(1);
  });
});
