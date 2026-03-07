import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { FileAssetStore } from './file-store.js';
import type { AssetInput } from './types.js';

const testInput: AssetInput = {
  kind: 'portrait',
  mimeType: 'image/png',
  width: 512,
  height: 512,
  tags: ['npc', 'medieval'],
  source: 'generated',
};

const testData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 42]);

let tmpDir: string;
let store: FileAssetStore;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'asset-test-'));
  store = new FileAssetStore(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('FileAssetStore', () => {
  it('stores and retrieves asset bytes', async () => {
    const meta = await store.put(testData, testInput);
    const retrieved = await store.get(meta.hash);
    expect(retrieved).toEqual(testData);
  });

  it('creates shard directories based on hash prefix', async () => {
    const meta = await store.put(testData, testInput);
    const shardDir = path.join(tmpDir, meta.hash.slice(0, 2));
    const stat = await fs.stat(shardDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('stores metadata as JSON sidecar', async () => {
    const meta = await store.put(testData, testInput);
    const jsonPath = path.join(tmpDir, meta.hash.slice(0, 2), `${meta.hash}.json`);
    const json = await fs.readFile(jsonPath, 'utf-8');
    const parsed = JSON.parse(json);
    expect(parsed.hash).toBe(meta.hash);
    expect(parsed.kind).toBe('portrait');
    expect(parsed.mimeType).toBe('image/png');
  });

  it('deduplicates identical content', async () => {
    const meta1 = await store.put(testData, testInput);
    const meta2 = await store.put(testData, { ...testInput, tags: ['other'] });
    expect(meta1.hash).toBe(meta2.hash);
    expect(await store.count()).toBe(1);
  });

  it('retrieves metadata by hash', async () => {
    const meta = await store.put(testData, testInput);
    const retrieved = await store.getMeta(meta.hash);
    expect(retrieved?.hash).toBe(meta.hash);
    expect(retrieved?.kind).toBe('portrait');
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
    await store.put(new Uint8Array([1, 2]), { kind: 'icon', mimeType: 'image/svg+xml', tags: [] });
    const all = await store.list();
    expect(all).toHaveLength(2);
  });

  it('filters by kind', async () => {
    await store.put(testData, testInput);
    await store.put(new Uint8Array([1, 2]), { kind: 'icon', mimeType: 'image/svg+xml', tags: [] });
    const portraits = await store.list({ kind: 'portrait' });
    expect(portraits).toHaveLength(1);
  });

  it('filters by tag', async () => {
    await store.put(testData, testInput);
    await store.put(new Uint8Array([1]), { kind: 'portrait', mimeType: 'image/png', tags: ['cyberpunk'] });
    const medieval = await store.list({ tag: 'medieval' });
    expect(medieval).toHaveLength(1);
  });

  it('deletes an asset and cleans up files', async () => {
    const meta = await store.put(testData, testInput);
    expect(await store.delete(meta.hash)).toBe(true);
    expect(await store.has(meta.hash)).toBe(false);
    expect(await store.count()).toBe(0);
  });

  it('delete returns false for missing hash', async () => {
    expect(await store.delete('0'.repeat(64))).toBe(false);
  });

  it('handles empty store gracefully', async () => {
    expect(await store.list()).toEqual([]);
    expect(await store.count()).toBe(0);
  });
});
