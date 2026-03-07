import { describe, it, expect } from 'vitest';
import { MemoryAssetStore } from '@ai-rpg-engine/asset-registry';
import { PlaceholderProvider } from './placeholder-provider.js';
import { generatePortrait, ensurePortrait } from './pipeline.js';
import type { PortraitRequest } from './types.js';

const testRequest: PortraitRequest = {
  characterName: 'Aldric',
  archetypeName: 'Penitent Knight',
  backgroundName: 'Oath-Breaker',
  traits: ['Iron Frame', 'Cursed Blood'],
  tags: ['martial', 'oath-broken', 'curse-touched'],
  genre: 'fantasy',
};

describe('generatePortrait', () => {
  it('generates and stores a portrait', async () => {
    const store = new MemoryAssetStore();
    const provider = new PlaceholderProvider();

    const meta = await generatePortrait(testRequest, provider, store);

    expect(meta.hash).toHaveLength(64);
    expect(meta.kind).toBe('portrait');
    expect(meta.mimeType).toBe('image/svg+xml');
    expect(meta.tags).toContain('portrait');
    expect(meta.tags).toContain('fantasy');
    expect(meta.source).toContain('Aldric');

    // Verify stored in registry
    expect(await store.has(meta.hash)).toBe(true);
    const bytes = await store.get(meta.hash);
    expect(bytes).not.toBeNull();
  });

  it('includes character tags in metadata', async () => {
    const store = new MemoryAssetStore();
    const provider = new PlaceholderProvider();

    const meta = await generatePortrait(testRequest, provider, store);
    expect(meta.tags).toContain('martial');
    expect(meta.tags).toContain('oath-broken');
    expect(meta.tags).toContain('curse-touched');
  });

  it('excludes the player tag from asset tags', async () => {
    const store = new MemoryAssetStore();
    const provider = new PlaceholderProvider();

    const req = { ...testRequest, tags: ['player', 'martial'] };
    const meta = await generatePortrait(req, provider, store);
    expect(meta.tags).not.toContain('player');
    expect(meta.tags).toContain('martial');
  });

  it('appends extra tags', async () => {
    const store = new MemoryAssetStore();
    const provider = new PlaceholderProvider();

    const meta = await generatePortrait(testRequest, provider, store, {
      extraTags: ['generated', 'v1'],
    });
    expect(meta.tags).toContain('generated');
    expect(meta.tags).toContain('v1');
  });

  it('passes generation options through', async () => {
    const store = new MemoryAssetStore();
    const provider = new PlaceholderProvider();

    const meta = await generatePortrait(testRequest, provider, store, {
      generation: { width: 256, height: 256 },
    });
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
  });
});

describe('ensurePortrait', () => {
  it('generates on first call', async () => {
    const store = new MemoryAssetStore();
    const provider = new PlaceholderProvider();

    const meta = await ensurePortrait(testRequest, provider, store);
    expect(meta.hash).toHaveLength(64);
    expect(await store.count()).toBe(1);
  });

  it('returns existing portrait on second call', async () => {
    const store = new MemoryAssetStore();
    const provider = new PlaceholderProvider();

    const first = await ensurePortrait(testRequest, provider, store);
    const second = await ensurePortrait(testRequest, provider, store);

    expect(second.hash).toBe(first.hash);
    expect(await store.count()).toBe(1);
  });

  it('generates new portrait for different character', async () => {
    const store = new MemoryAssetStore();
    const provider = new PlaceholderProvider();

    await ensurePortrait(testRequest, provider, store);
    const other: PortraitRequest = {
      ...testRequest,
      characterName: 'Nyx',
      archetypeName: 'Netrunner',
      genre: 'cyberpunk',
    };
    await ensurePortrait(other, provider, store);

    expect(await store.count()).toBe(2);
  });
});
