import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryAssetStore } from '@ai-rpg-engine/asset-registry';
import { ingestFilePack } from './ingest.js';
import { SoundRegistry } from './registry.js';
import type { SoundPackManifest } from './types.js';

const wavBytes = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]);

function fileEntry(id: string, variants: string[]): SoundPackManifest['entries'][number] {
  return {
    id,
    tags: ['ambient'],
    domain: 'ambient',
    intensity: 'low',
    mood: ['calm'],
    durationClass: 'long-loop',
    cooldownMs: 0,
    variants,
    source: 'file',
  };
}

describe('ingestFilePack (F-2f138ec3)', () => {
  it('puts each file variant as kind audio and records hashes on the entry', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sp-ingest-'));
    await writeFile(join(dir, 'tavern_chatter_01.wav'), wavBytes);
    const manifest: SoundPackManifest = {
      name: 'medieval-tavern',
      version: '1.0.0',
      description: 'Tavern ambience',
      author: 'test',
      entries: [fileEntry('tavern_chatter', ['tavern_chatter_01.wav'])],
    };
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf8');

    const store = new MemoryAssetStore();
    const result = await ingestFilePack(dir, store);

    expect(result.errors).toEqual([]);
    expect(result.ingested).toBe(1);
    const hash = result.manifest.entries[0].hashes?.['tavern_chatter_01.wav'];
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    const listed = await store.list({ kind: 'audio' });
    expect(listed).toHaveLength(1);
    expect(listed[0].kind).toBe('audio');
    expect(listed[0].mimeType).toBe('audio/wav');
    expect(listed[0].tags).toContain('sound:tavern_chatter');
    expect(listed[0].hash).toBe(hash);

    const registry = new SoundRegistry();
    registry.load(result.manifest);
    expect(registry.get('tavern_chatter')!.hashes?.['tavern_chatter_01.wav']).toBe(hash);
    expect(registry.pickVariant('tavern_chatter', 0)).toBe('tavern_chatter_01.wav');
    const poisoned = registry.get('tavern_chatter')!;
    poisoned.hashes!['tavern_chatter_01.wav'] = 'poison';
    expect(registry.get('tavern_chatter')!.hashes?.['tavern_chatter_01.wav']).toBe(hash);
  });

  it('reports a missing variant instead of putting a silent play', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sp-ingest-miss-'));
    const manifest: SoundPackManifest = {
      name: 'medieval-tavern',
      version: '1.0.0',
      description: 'Tavern ambience',
      author: 'test',
      entries: [fileEntry('tavern_chatter', ['tavern_chatter_01.wav'])],
    };

    const store = new MemoryAssetStore();
    const result = await ingestFilePack(dir, store, { manifest });

    expect(result.ingested).toBe(0);
    expect(result.errors.some((e) => /file not found/.test(e.message))).toBe(true);
    expect(await store.count()).toBe(0);
  });

  it('skips voice-soundboard entries and only hashes file-source variants', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sp-ingest-mix-'));
    await writeFile(join(dir, 'door.wav'), wavBytes);
    const manifest: SoundPackManifest = {
      name: 'mixed',
      version: '1.0.0',
      description: 'mixed',
      author: 'test',
      entries: [
        {
          id: 'ui_click',
          tags: ['ui'],
          domain: 'sfx',
          intensity: 'low',
          mood: ['neutral'],
          durationClass: 'oneshot',
          cooldownMs: 200,
          variants: [],
          source: 'voice-soundboard',
          voiceSoundboardEffect: 'click',
        },
        fileEntry('door_open', ['door.wav']),
      ],
    };

    const store = new MemoryAssetStore();
    const result = await ingestFilePack(dir, store, { manifest });
    expect(result.ingested).toBe(1);
    expect(result.manifest.entries[0].hashes).toBeUndefined();
    expect(result.manifest.entries[1].hashes?.['door.wav']).toBeTruthy();
  });

  it('surfaces schema errors from validateManifest on the ingest report', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sp-ingest-bad-'));
    const manifest = {
      name: 'bad',
      version: '1.0.0',
      description: 'bad',
      author: 'test',
      entries: [{ ...fileEntry('x', []), domain: 'not-a-domain' }],
    } as unknown as SoundPackManifest;

    const store = new MemoryAssetStore();
    const result = await ingestFilePack(dir, store, { manifest });
    expect(result.errors.some((e) => /domain/.test(e.message))).toBe(true);
  });
});
