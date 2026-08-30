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
    // F-930e6b5b: hash hit unions incoming tags instead of first-writer-wins
    expect(meta2.tags).toEqual(['npc', 'medieval', 'other']);
  });

  it('hash-hit unions a new char: identity tag and persists the sidecar (F-930e6b5b)', async () => {
    const aliceTag = 'char:["Alice","Mage","fantasy"]';
    const aliceColonTag = 'char:["Alice:","Mage","fantasy"]';
    const first = await store.put(testData, { ...testInput, tags: [aliceTag] });
    const second = await store.put(testData, { ...testInput, tags: [aliceColonTag] });
    expect(second.hash).toBe(first.hash);
    expect(second.tags).toContain(aliceTag);
    expect(second.tags).toContain(aliceColonTag);
    expect(await store.count()).toBe(1);

    const sidecarPath = path.join(tmpDir, first.hash.slice(0, 2), `${first.hash}.json`);
    const parsed = JSON.parse(await fs.readFile(sidecarPath, 'utf-8')) as { tags: string[] };
    expect(parsed.tags).toContain(aliceTag);
    expect(parsed.tags).toContain(aliceColonTag);
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

// core-spine F-4d8f612a (MED): getMeta() did `JSON.parse(json) as AssetMetadata`
// with no runtime shape check — a sidecar that is syntactically valid JSON but
// wrong-shaped (hand-edited, legacy, partially written) was returned as-is, and
// the first caller to touch a missing field crashed with a raw TypeError far
// from the root cause (e.g. matchesFilter's `meta.tags.includes(...)`).
// Worse, visibility DIFFERED by call pattern: a FILTERED list() silently
// swallowed the TypeError in its catch (dropping the entry), while an
// UNfiltered list() returned the malformed object without complaint. The
// invariant now: a wrong-shaped sidecar is treated as corrupt at the JSON
// boundary — getMeta returns null, and list() excludes it consistently whether
// or not a filter is passed.
describe('FileAssetStore — wrong-shaped metadata sidecar is rejected at the boundary (F-4d8f612a)', () => {
  /** Overwrite the stored sidecar for `hash` with arbitrary JSON. */
  async function corruptSidecar(hash: string, contents: unknown): Promise<void> {
    const metaPath = path.join(tmpDir, hash.slice(0, 2), `${hash}.json`);
    await fs.writeFile(metaPath, JSON.stringify(contents));
  }

  it('getMeta returns null for valid JSON that is missing tags (the matchesFilter crash shape)', async () => {
    const meta = await store.put(testData, testInput);
    const { tags: _tags, ...withoutTags } = meta;
    await corruptSidecar(meta.hash, withoutTags);
    expect(await store.getMeta(meta.hash)).toBeNull();
  });

  it('getMeta returns null for an unknown kind', async () => {
    const meta = await store.put(testData, testInput);
    await corruptSidecar(meta.hash, { ...meta, kind: 'hologram' });
    expect(await store.getMeta(meta.hash)).toBeNull();
  });

  it('getMeta returns null for a non-numeric sizeBytes', async () => {
    const meta = await store.put(testData, testInput);
    await corruptSidecar(meta.hash, { ...meta, sizeBytes: 'big' });
    expect(await store.getMeta(meta.hash)).toBeNull();
  });

  it('getMeta returns null for a JSON scalar / array sidecar', async () => {
    const meta = await store.put(testData, testInput);
    await corruptSidecar(meta.hash, 'just a string');
    expect(await store.getMeta(meta.hash)).toBeNull();
    await corruptSidecar(meta.hash, [1, 2, 3]);
    expect(await store.getMeta(meta.hash)).toBeNull();
  });

  it('list() excludes a wrong-shaped entry CONSISTENTLY — with and without a filter', async () => {
    const good = await store.put(testData, testInput);
    const bad = await store.put(new Uint8Array([9, 9, 9]), testInput);
    await corruptSidecar(bad.hash, { hash: bad.hash, kind: 'portrait' }); // missing the rest

    // Unfiltered previously returned the malformed object; filtered silently
    // dropped it via the broad catch. Both must now agree.
    const unfiltered = await store.list();
    expect(unfiltered).toHaveLength(1);
    expect(unfiltered[0].hash).toBe(good.hash);
    const filtered = await store.list({ kind: 'portrait' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].hash).toBe(good.hash);
  });

  it('control — a well-formed sidecar still loads (including optional fields absent)', async () => {
    const meta = await store.put(new Uint8Array([5]), { kind: 'document', mimeType: 'text/plain' });
    // Optional width/height/source absent, tags defaulted by put().
    const retrieved = await store.getMeta(meta.hash);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.kind).toBe('document');
    expect(retrieved!.tags).toEqual([]);
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

// F-b2b8a190: File re-parses JSON so getMeta/list already isolate; pin that
// File and Memory agree — put clones tags, mutate returned.tags, getMeta
// unchanged. Keep byte-copy isolation of the written sidecar.
describe('FileAssetStore metadata isolation (F-b2b8a190)', () => {
  it('put clones tags so mutating the caller array does not poison the store', async () => {
    const tags = ['npc', 'medieval'];
    const meta = await store.put(testData, { ...testInput, tags });
    expect(meta.tags).not.toBe(tags);
    tags.push('placeholder');
    expect(meta.tags).toEqual(['npc', 'medieval']);
    expect((await store.getMeta(meta.hash))?.tags).toEqual(['npc', 'medieval']);
  });

  it('mutating put() return tags does not change getMeta', async () => {
    const meta = await store.put(testData, testInput);
    meta.tags.push('placeholder');
    expect((await store.getMeta(meta.hash))?.tags).toEqual(['npc', 'medieval']);
  });

  it('mutating getMeta() tags does not change the next getMeta', async () => {
    const meta = await store.put(testData, testInput);
    const a = await store.getMeta(meta.hash);
    a!.tags.push('placeholder');
    const b = await store.getMeta(meta.hash);
    expect(b?.tags).toEqual(['npc', 'medieval']);
  });

  it('mutating list() tags does not change getMeta or a later list', async () => {
    await store.put(testData, testInput);
    const listed = await store.list();
    listed[0].tags.push('placeholder');
    expect((await store.getMeta(listed[0].hash))?.tags).toEqual(['npc', 'medieval']);
    expect((await store.list())[0].tags).toEqual(['npc', 'medieval']);
  });

  it('hash-hit merge still isolates returned tags from the store', async () => {
    await store.put(testData, testInput);
    const merged = await store.put(testData, { ...testInput, tags: ['other'] });
    merged.tags.push('placeholder');
    expect((await store.getMeta(merged.hash))?.tags).toEqual(['npc', 'medieval', 'other']);
  });
});

// F-628ee72f: blob and sidecar can diverge; hash-hit used to rewrite only JSON
// and never restore the .bin. getMeta/list must not advertise a ghost sidecar.
describe('FileAssetStore repairs a missing blob on hash-hit (F-628ee72f)', () => {
  it('put, unlink bin, put same bytes → has() true and get() returns the bytes', async () => {
    const meta = await store.put(testData, testInput);
    const binPath = path.join(tmpDir, meta.hash.slice(0, 2), `${meta.hash}.bin`);
    await fs.unlink(binPath);

    expect(await store.has(meta.hash)).toBe(false);
    expect(await store.get(meta.hash)).toBeNull();
    expect(await store.getMeta(meta.hash)).toBeNull();
    expect(await store.list()).toHaveLength(0);
    expect(await store.count()).toBe(0);

    const repaired = await store.put(testData, { ...testInput, tags: ['extra'] });
    expect(repaired.hash).toBe(meta.hash);
    expect(await store.has(meta.hash)).toBe(true);
    expect(await store.get(meta.hash)).toEqual(testData);
    expect((await store.getMeta(meta.hash))?.tags).toEqual(['npc', 'medieval', 'extra']);
    expect(await store.list()).toHaveLength(1);
  });

  it('a sidecar without a blob is omitted from list and getMeta', async () => {
    const meta = await store.put(testData, testInput);
    const binPath = path.join(tmpDir, meta.hash.slice(0, 2), `${meta.hash}.bin`);
    await fs.unlink(binPath);
    expect(await store.getMeta(meta.hash)).toBeNull();
    expect(await store.list()).toEqual([]);
  });

  it('hash-hit rewrites a swapped blob whose bytes no longer match the hash', async () => {
    const meta = await store.put(testData, testInput);
    const binPath = path.join(tmpDir, meta.hash.slice(0, 2), `${meta.hash}.bin`);
    await fs.writeFile(binPath, Buffer.from('tampered!'));
    expect(await store.get(meta.hash, { verify: true })).toBeNull();

    await store.put(testData, testInput);
    expect(await store.get(meta.hash, { verify: true })).toEqual(testData);
  });
});
