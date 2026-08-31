import { describe, it, expect } from 'vitest';
import { MemoryAssetStore } from '@ai-rpg-engine/asset-registry';
import { generatePortraits, ensurePortraits, isPortraitBatchFailure } from './batch.js';
import { PlaceholderProvider } from './placeholder-provider.js';
import type { PortraitRequest, ImageProvider, GenerationOutcome, GenerationOptions } from './types.js';

const base: PortraitRequest = {
  characterName: 'Aldric',
  archetypeName: 'Penitent Knight',
  backgroundName: 'Oath-Breaker',
  traits: ['Iron Frame'],
  tags: ['martial'],
  genre: 'fantasy',
};

function req(name: string): PortraitRequest {
  return { ...base, characterName: name };
}

/** Provider that can fail specific character names and count generate() calls. */
class NamedProvider implements ImageProvider {
  readonly name: string;
  calls: string[] = [];
  inFlight = 0;
  maxInFlight = 0;
  constructor(
    name: string,
    private readonly failFor: ReadonlySet<string> = new Set(),
    private readonly delayMs = 0,
  ) {
    this.name = name;
  }
  async isAvailable(): Promise<boolean> {
    return true;
  }
  async generate(prompt: string, opts?: GenerationOptions): Promise<GenerationOutcome> {
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    this.calls.push(prompt);
    try {
      if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
      const who = /Portrait of ([^,]+)/.exec(prompt)?.[1] ?? prompt;
      if (this.failFor.has(who)) {
        return { ok: false, code: 'timeout', error: `failed ${who}`, hint: 'retry' };
      }
      return {
        ok: true,
        image: new TextEncoder().encode(`png:${who}`),
        mimeType: 'image/png',
        width: opts?.width ?? 512,
        height: opts?.height ?? 512,
        prompt,
        durationMs: this.delayMs,
      };
    } finally {
      this.inFlight -= 1;
    }
  }
}

describe('generatePortraits (F-48a47f12)', () => {
  it('returns empty results for an empty roster', async () => {
    const store = new MemoryAssetStore();
    const out = await generatePortraits([], new PlaceholderProvider(), store);
    expect(out.results).toEqual([]);
  });

  it('throws on concurrency < 1', async () => {
    const store = new MemoryAssetStore();
    await expect(
      generatePortraits([req('A')], new PlaceholderProvider(), store, { concurrency: 0 }),
    ).rejects.toThrow(/concurrency/);
  });

  it('isolates ImageGenError per item so a later request still succeeds', async () => {
    const store = new MemoryAssetStore();
    const provider = new NamedProvider('comfyui', new Set(['Nyx']));
    const out = await generatePortraits(
      [req('Aldric'), req('Nyx'), req('Bram')],
      provider,
      store,
      { concurrency: 1 },
    );

    expect(out.results).toHaveLength(3);
    expect(isPortraitBatchFailure(out.results[0])).toBe(false);
    expect(isPortraitBatchFailure(out.results[1])).toBe(true);
    expect(isPortraitBatchFailure(out.results[2])).toBe(false);
    if (isPortraitBatchFailure(out.results[1])) {
      expect(out.results[1].request.characterName).toBe('Nyx');
      expect(out.results[1].error.message).toMatch(/Nyx/);
    }
    expect(await store.count()).toBe(2);
  });

  it('reports progress after each item', async () => {
    const store = new MemoryAssetStore();
    const progress: Array<{ completed: number; ok: boolean; index: number }> = [];
    await generatePortraits(
      [req('A'), req('B')],
      new PlaceholderProvider(),
      store,
      { onProgress: (p) => progress.push({ completed: p.completed, ok: p.ok, index: p.index }) },
    );
    expect(progress).toEqual([
      { completed: 1, ok: true, index: 0 },
      { completed: 2, ok: true, index: 1 },
    ]);
  });

  it('caps in-flight work at the concurrency setting', async () => {
    const store = new MemoryAssetStore();
    const provider = new NamedProvider('farm', new Set(), 30);
    await generatePortraits(
      [req('A'), req('B'), req('C'), req('D')],
      provider,
      store,
      { concurrency: 2 },
    );
    expect(provider.maxInFlight).toBeLessThanOrEqual(2);
    expect(provider.maxInFlight).toBeGreaterThan(1);
  });

  it('fails remaining items when the signal is already aborted', async () => {
    const store = new MemoryAssetStore();
    const ac = new AbortController();
    ac.abort();
    const provider = new NamedProvider('comfyui');
    const out = await generatePortraits([req('A'), req('B')], provider, store, { signal: ac.signal });
    expect(out.results.every(isPortraitBatchFailure)).toBe(true);
    expect(provider.calls).toHaveLength(0);
  });
});

describe('ensurePortraits (F-48a47f12)', () => {
  it('reuses ensurePortrait identity matching so a second batch does not re-generate', async () => {
    const store = new MemoryAssetStore();
    const provider = new NamedProvider('farm');
    const requests = [req('Aldric'), req('Nyx')];

    const first = await ensurePortraits(requests, provider, store);
    expect(first.results.every((r) => !isPortraitBatchFailure(r))).toBe(true);
    const callsAfterFirst = provider.calls.length;

    const second = await ensurePortraits(requests, provider, store);
    expect(second.results.every((r) => !isPortraitBatchFailure(r))).toBe(true);
    expect(provider.calls.length).toBe(callsAfterFirst);
    expect(await store.count()).toBe(2);

    if (!isPortraitBatchFailure(first.results[0]) && !isPortraitBatchFailure(second.results[0])) {
      expect(second.results[0].hash).toBe(first.results[0].hash);
    }
  });
});
