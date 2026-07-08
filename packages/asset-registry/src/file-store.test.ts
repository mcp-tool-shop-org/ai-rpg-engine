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

// v2.5 audit A5 (MED, security): get/getMeta/has/delete build filesystem paths
// straight from the caller-supplied `hash`. The invariant: every public method
// rejects a hash that is not a SHA-256 hex digest (/^[a-f0-9]{64}$/) with a
// null/false no-op — a traversal "hash" like '../../x' must never read, probe,
// or unlink anything outside the store root.
describe('FileAssetStore — hash validation blocks path traversal (A5)', () => {
  it('a traversal hash cannot read, probe, or delete files outside the store root', async () => {
    // Layout: base/a/x.bin is the victim OUTSIDE the store; the store root is
    // nested at base/a/b/c/store so '../../x' resolves exactly onto the victim
    // (shard '..' → base/a/b/c, then '../../x.bin' → base/a/x.bin).
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'asset-traversal-'));
    try {
      const victimBin = path.join(base, 'a', 'x.bin');
      const victimMeta = path.join(base, 'a', 'x.json');
      const nestedRoot = path.join(base, 'a', 'b', 'c', 'store');
      await fs.mkdir(nestedRoot, { recursive: true });
      await fs.writeFile(victimBin, Buffer.from('victim-bytes'));
      await fs.writeFile(victimMeta, JSON.stringify({ hash: 'not-yours' }));

      const evilStore = new FileAssetStore(nestedRoot);
      const evil = '../../x'; // the exact shape from the audit finding

      expect(await evilStore.get(evil)).toBeNull();
      expect(await evilStore.getMeta(evil)).toBeNull();
      expect(await evilStore.has(evil)).toBe(false);
      expect(await evilStore.delete(evil)).toBe(false);

      // The victim outside the store root must be untouched.
      await expect(fs.access(victimBin)).resolves.toBeUndefined();
      await expect(fs.access(victimMeta)).resolves.toBeUndefined();
    } finally {
      await fs.rm(base, { recursive: true, force: true });
    }
  });

  it('rejects every malformed hash across the whole public-method family', async () => {
    const malformed = [
      '',                       // empty
      '../victim',              // relative traversal
      '..\\..\\windows',        // windows-style traversal
      'a'.repeat(63),           // one short
      'a'.repeat(65),           // one long
      'A'.repeat(64),           // uppercase hex is not canonical
      'g'.repeat(64),           // non-hex
      `${'a'.repeat(32)}/${'a'.repeat(31)}`, // embedded separator
    ];

    for (const bad of malformed) {
      expect(await store.get(bad), `get(${JSON.stringify(bad)})`).toBeNull();
      expect(await store.getMeta(bad), `getMeta(${JSON.stringify(bad)})`).toBeNull();
      expect(await store.has(bad), `has(${JSON.stringify(bad)})`).toBe(false);
      expect(await store.delete(bad), `delete(${JSON.stringify(bad)})`).toBe(false);
    }
  });
});

// v2.5 audit A4 (MED): get() serves bytes without re-hashing, so bit-rot or a
// swapped .bin is served silently. The invariant: get(hash, {verify:true})
// re-hashes on read and returns null when the bytes no longer match their
// content address. Default stays verification-off for hot paths.
describe('FileAssetStore — integrity verification on read (A4)', () => {
  it('get(hash, {verify:true}) returns null when the stored bytes were tampered', async () => {
    const meta = await store.put(testData, testInput);
    const binPath = path.join(tmpDir, meta.hash.slice(0, 2), `${meta.hash}.bin`);
    await fs.writeFile(binPath, Buffer.from('tampered!'));

    // Default (no verify) documents the hot path: bytes are served as-is.
    expect(await store.get(meta.hash)).toEqual(new TextEncoder().encode('tampered!'));
    // Verified read detects the mismatch and refuses to serve the bytes.
    expect(await store.get(meta.hash, { verify: true })).toBeNull();
  });

  it('get(hash, {verify:true}) still returns intact bytes', async () => {
    const meta = await store.put(testData, testInput);
    expect(await store.get(meta.hash, { verify: true })).toEqual(testData);
  });
});
