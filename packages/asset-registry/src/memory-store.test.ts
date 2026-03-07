import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryAssetStore } from './memory-store.js';
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
    // Original metadata is preserved (first write wins)
    expect(meta2.tags).toEqual(['character', 'fantasy']);
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
});
