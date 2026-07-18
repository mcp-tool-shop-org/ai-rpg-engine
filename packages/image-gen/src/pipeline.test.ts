import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryAssetStore } from '@ai-rpg-engine/asset-registry';
import { PlaceholderProvider } from './placeholder-provider.js';
import { generatePortrait, ensurePortrait, resolveProvider, ImageGenError } from './pipeline.js';
import type { PortraitRequest, ImageProvider, GenerationOutcome, GenerationOptions } from './types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

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
      // F-72a9c4d0: the hint is folded into .message so consumers that only
      // log err.message (and uncaught-exception displays) still see it.
      message: 'ComfyUI request timed out after 5ms — raise timeoutMs',
    });
    await expect(generatePortrait(testRequest, failing, store)).rejects.toBeInstanceOf(ImageGenError);
    expect(await store.count()).toBe(0); // no partial asset landed
  });

  it('keeps .message equal to the error when no hint exists (F-72a9c4d0)', () => {
    const err = new ImageGenError({ ok: false, code: 'network', error: 'fetch failed' });
    expect(err.message).toBe('fetch failed');
    expect(err.hint).toBeUndefined();
  });
});

// v2.6 Stage C F-6c3d9a48 — the provider-selection seam silently swapped in
// the PlaceholderProvider (no breadcrumb, nothing on the returned value), and
// ensurePortrait matched on character tags alone, so ONE outage permanently
// poisoned the portrait cache with initials-tiles that no code path would
// ever regenerate. The invariants: (1) degradation warns by default and is
// observable via onFallback, (2) a stored placeholder is marked as such,
// (3) a cached placeholder is replaced as soon as a real provider is available.
describe('provider degradation is observable + placeholders are not cached as final (F-6c3d9a48)', () => {
  /** A "real" (non-placeholder) provider that renders PNG bytes. */
  function realProvider(name = 'comfyui', available = true): ImageProvider {
    return {
      name,
      async isAvailable() { return available; },
      async generate(prompt: string, opts?: GenerationOptions): Promise<GenerationOutcome> {
        return {
          ok: true,
          image: new TextEncoder().encode(`png-bytes-for:${prompt}`),
          mimeType: 'image/png',
          width: opts?.width ?? 512,
          height: opts?.height ?? 512,
          prompt,
          durationMs: 1,
        };
      },
    };
  }

  it('emits a stderr breadcrumb by default when degrading to the fallback', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const resolved = await resolveProvider(realProvider('comfyui', false));

    expect(resolved.name).toBe('placeholder');
    const stderr = errSpy.mock.calls.flat().join('\n');
    expect(stderr).toContain('comfyui');
    expect(stderr).toContain('placeholder');
    expect(stderr).toMatch(/unavailable/i);
  });

  it('routes degradation through a custom onFallback hook (and stays silent on stderr)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const events: Array<{ preferred: string; fallback: string; reason: string }> = [];
    const resolved = await resolveProvider(
      realProvider('comfyui', false),
      undefined,
      { onFallback: (info) => events.push(info) },
    );

    expect(resolved.name).toBe('placeholder');
    expect(events).toHaveLength(1);
    expect(events[0].preferred).toBe('comfyui');
    expect(events[0].fallback).toBe('placeholder');
    expect(events[0].reason).toMatch(/isAvailable/i);
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('does not fire onFallback when the preferred provider is available', async () => {
    const onFallback = vi.fn();
    const resolved = await resolveProvider(realProvider('comfyui', true), undefined, { onFallback });
    expect(resolved.name).toBe('comfyui');
    expect(onFallback).not.toHaveBeenCalled();
  });

  it('names the thrown availability error in the fallback reason', async () => {
    const events: Array<{ reason: string }> = [];
    const flaky: ImageProvider = {
      name: 'flaky',
      async isAvailable() { throw new Error('DNS exploded'); },
      async generate() { throw new Error('unreachable'); },
    };
    await resolveProvider(flaky, undefined, { onFallback: (info) => events.push(info) });
    expect(events[0].reason).toContain('DNS exploded');
  });

  it('tags a placeholder render as placeholder + records the provider', async () => {
    const store = new MemoryAssetStore();
    const meta = await generatePortrait(testRequest, new PlaceholderProvider(), store);
    expect(meta.tags).toContain('placeholder');
    expect(meta.tags).toContain('provider:placeholder');
  });

  it('does not tag a real render as placeholder', async () => {
    const store = new MemoryAssetStore();
    const meta = await generatePortrait(testRequest, realProvider(), store);
    expect(meta.tags).not.toContain('placeholder');
    expect(meta.tags).toContain('provider:comfyui');
  });

  it('ensurePortrait regenerates a cached placeholder once a real provider is available', async () => {
    const store = new MemoryAssetStore();

    // Outage: placeholder gets cached for the character.
    const placeholderMeta = await ensurePortrait(testRequest, new PlaceholderProvider(), store);
    expect(placeholderMeta.mimeType).toBe('image/svg+xml');

    // ComfyUI is back: the placeholder must NOT be treated as final.
    const realMeta = await ensurePortrait(testRequest, realProvider(), store);
    expect(realMeta.mimeType).toBe('image/png');
    expect(realMeta.hash).not.toBe(placeholderMeta.hash);

    // And from now on the real render is the preferred match.
    const again = await ensurePortrait(testRequest, realProvider(), store);
    expect(again.hash).toBe(realMeta.hash);
  });

  it('ensurePortrait still reuses the cached placeholder while the provider is a placeholder', async () => {
    const store = new MemoryAssetStore();
    const first = await ensurePortrait(testRequest, new PlaceholderProvider(), store);
    const second = await ensurePortrait(testRequest, new PlaceholderProvider(), store);
    expect(second.hash).toBe(first.hash);
    expect(await store.count()).toBe(1);
  });

  it('ensurePortrait prefers an existing real render even when handed a placeholder provider', async () => {
    const store = new MemoryAssetStore();
    const realMeta = await ensurePortrait(testRequest, realProvider(), store);

    // Later outage: resolveProvider hands ensurePortrait the placeholder —
    // the stored real render must still win (no downgrade).
    const resolved = await ensurePortrait(testRequest, new PlaceholderProvider(), store);
    expect(resolved.hash).toBe(realMeta.hash);
    expect(resolved.mimeType).toBe('image/png');
  });
});
