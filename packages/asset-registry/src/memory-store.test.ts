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
});
