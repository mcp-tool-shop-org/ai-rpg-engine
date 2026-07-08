import { describe, it, expect } from 'vitest';
import { MemoryAssetStore } from '@ai-rpg-engine/asset-registry';
import { PlaceholderProvider } from './placeholder-provider.js';
import { generatePortrait, ensurePortrait, resolveProvider, ImageGenError } from './pipeline.js';
import type { PortraitRequest, ImageProvider, GenerationOutcome, GenerationOptions } from './types.js';

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

// IMG-001: generatePortrait/ensurePortrait call provider.generate() unconditionally,
// so an offline ComfyUI throws 'fetch failed' deep in the pipeline. resolveProvider
// degrades a likely-mistake (passing an unavailable provider) to the always-on
// placeholder instead of crashing — the WARN-AND-DEGRADE contract for runtime media.
describe('resolveProvider (IMG-001)', () => {
  /** A provider whose availability and generate() behavior are controllable. */
  class StubProvider implements ImageProvider {
    readonly name: string;
    constructor(
      name: string,
      private readonly available: boolean,
      private readonly onGenerate?: () => void,
    ) {
      this.name = name;
    }
    async isAvailable(): Promise<boolean> {
      return this.available;
    }
    async generate(prompt: string, opts?: GenerationOptions): Promise<GenerationOutcome> {
      this.onGenerate?.();
      return {
        ok: true,
        image: new TextEncoder().encode('stub'),
        mimeType: 'image/png',
        width: opts?.width ?? 512,
        height: opts?.height ?? 512,
        prompt,
        durationMs: 0,
      };
    }
  }

  it('returns the preferred provider when it is available', async () => {
    const preferred = new StubProvider('comfyui', true);
    const resolved = await resolveProvider(preferred);
    expect(resolved.name).toBe('comfyui');
  });

  it('falls back to the PlaceholderProvider when the preferred is unavailable', async () => {
    const preferred = new StubProvider('comfyui', false);
    const resolved = await resolveProvider(preferred);
    expect(resolved.name).toBe('placeholder');
  });

  it('uses a custom fallback when one is supplied', async () => {
    const preferred = new StubProvider('comfyui', false);
    const fallback = new StubProvider('custom-fallback', true);
    const resolved = await resolveProvider(preferred, fallback);
    expect(resolved.name).toBe('custom-fallback');
  });

  it('falls back when isAvailable() itself throws, rather than propagating', async () => {
    const flaky: ImageProvider = {
      name: 'flaky',
      async isAvailable() {
        throw new Error('network down');
      },
      async generate() {
        throw new Error('should not be called');
      },
    };
    const resolved = await resolveProvider(flaky);
    expect(resolved.name).toBe('placeholder');
  });

  it('lets an offline provider degrade to a real placeholder portrait end-to-end', async () => {
    const store = new MemoryAssetStore();
    let offlineCalled = false;
    // Offline ComfyUI: generate() would report a typed failure if ever reached.
    const offline = new StubProvider('comfyui', false, () => {
      offlineCalled = true;
    });

    const provider = await resolveProvider(offline);
    const meta = await generatePortrait(testRequest, provider, store);

    expect(meta.kind).toBe('portrait');
    expect(meta.mimeType).toBe('image/svg+xml'); // placeholder, not the offline provider
    expect(offlineCalled).toBe(false);
  });
});

// A1 seam: when a provider resolves {ok:false} (the new GenerationOutcome
// contract), the pipeline must surface it as ONE named error type carrying the
// stable code + hint — never a raw fetch error, never a silent store write.
describe('generatePortrait — typed failure propagation (A1)', () => {
  it('throws ImageGenError with the provider code/hint and stores nothing', async () => {
    const failing: ImageProvider = {
      name: 'failing-comfyui',
      async isAvailable() {
        return true;
      },
      async generate() {
        return {
          ok: false,
          code: 'timeout',
          error: 'ComfyUI request timed out after 5ms',
          hint: 'raise timeoutMs',
        };
      },
    };
    const store = new MemoryAssetStore();

    await expect(generatePortrait(testRequest, failing, store)).rejects.toMatchObject({
      name: 'ImageGenError',
      code: 'timeout',
      hint: 'raise timeoutMs',
      message: 'ComfyUI request timed out after 5ms',
    });
    await expect(generatePortrait(testRequest, failing, store)).rejects.toBeInstanceOf(ImageGenError);
    expect(await store.count()).toBe(0); // no partial asset landed
  });
});
