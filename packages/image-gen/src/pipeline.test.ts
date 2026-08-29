import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryAssetStore } from '@ai-rpg-engine/asset-registry';
import { PlaceholderProvider } from './placeholder-provider.js';
import { generatePortrait, ensurePortrait, resolveProvider, ImageGenError, portraitIdentityTag } from './pipeline.js';
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
    // F-a55397ab: genre is not a free-form tag; it lives in the char: JSON.
    expect(meta.tags).not.toContain('fantasy');
    expect(meta.tags).toContain(portraitIdentityTag(testRequest));
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

// F-525d6bb6: identity was `char:${name}::${archetype}`, so 'Alice::Mage'+'Wizard'
// collided with 'Alice'+'Mage::Wizard'. Caller tags / extraTags of `char:…` or
// `placeholder` poisoned matching and placeholder-vs-real selection.
describe('portrait identity is delimiter-safe (F-525d6bb6)', () => {
  function realProvider(name = 'comfyui'): ImageProvider {
    return {
      name,
      async isAvailable() { return true; },
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

  it('does not collide on delimiter-unsafe name/archetype pairs', async () => {
    const store = new MemoryAssetStore();
    const provider = realProvider();
    const a: PortraitRequest = {
      ...testRequest,
      characterName: 'Alice::Mage',
      archetypeName: 'Wizard',
    };
    const b: PortraitRequest = {
      ...testRequest,
      characterName: 'Alice',
      archetypeName: 'Mage::Wizard',
    };

    const metaA = await ensurePortrait(a, provider, store);
    const metaB = await ensurePortrait(b, provider, store);

    expect(portraitIdentityTag(a)).not.toBe(portraitIdentityTag(b));
    expect(metaA.hash).not.toBe(metaB.hash);
    expect(await store.count()).toBe(2);
    expect(metaA.tags).toContain(portraitIdentityTag(a));
    expect(metaA.tags).not.toContain(portraitIdentityTag(b));
    expect(metaB.tags).toContain(portraitIdentityTag(b));
    expect(metaB.tags).not.toContain(portraitIdentityTag(a));
    // Prompt sanitizer strips `:` (attention/LoRA syntax). Identity keys off
    // the same sanitized name/archetype, so these stay distinct
    // (AliceMage/Wizard vs Alice/MageWizard) while Alice vs Alice: share a key.
    expect(metaA.source).toContain('AliceMage');
    expect(metaB.source).toContain('Alice');
  });

  it('strips caller tags that use engine-owned prefixes', async () => {
    const store = new MemoryAssetStore();
    const req: PortraitRequest = {
      ...testRequest,
      tags: ['martial', 'placeholder', 'char:Other::Class', 'provider:evil', 'player'],
    };
    const meta = await generatePortrait(req, realProvider(), store);

    expect(meta.tags).toContain('martial');
    expect(meta.tags).not.toContain('player');
    expect(meta.tags).not.toContain('placeholder');
    expect(meta.tags).not.toContain('char:Other::Class');
    expect(meta.tags).not.toContain('provider:evil');
    expect(meta.tags).toContain('provider:comfyui');
  });

  it('does not treat extraTags as identity keys or placeholder markers', async () => {
    const store = new MemoryAssetStore();
    const attacker: PortraitRequest = {
      ...testRequest,
      characterName: 'Aldric',
      archetypeName: 'Penitent Knight',
    };
    const victim: PortraitRequest = {
      ...testRequest,
      characterName: 'Nyx',
      archetypeName: 'Netrunner',
    };
    const victimIdentity = portraitIdentityTag(victim);

    const attackerMeta = await generatePortrait(attacker, realProvider(), store, {
      extraTags: [victimIdentity, 'placeholder', 'char:Nyx::Netrunner'],
    });
    expect(attackerMeta.tags).not.toContain(victimIdentity);
    expect(attackerMeta.tags).not.toContain('placeholder');
    expect(attackerMeta.tags).not.toContain('char:Nyx::Netrunner');

    const victimMeta = await ensurePortrait(victim, realProvider(), store);
    expect(victimMeta.hash).not.toBe(attackerMeta.hash);
    expect(victimMeta.source).toContain('Nyx');
    expect(await store.count()).toBe(2);
  });
});

// F-930e6b5b: identity was JSON([raw name, archetype, genre]) while the
// provider prompt (and therefore the CAS hash) is built from sanitize()d
// fields. 'Alice' and 'Alice:' (or 'Alice()') shared bytes but not the
// char: tag; put() first-writer-wins then made ensurePortrait miss and
// re-queue forever. Identity now keys off the same sanitized strings, and
// a hash-hit unions incoming char: tags so the second name still matches.
describe('portrait identity tracks sanitized prompt fields (F-930e6b5b)', () => {
  function countingProvider() {
    let calls = 0;
    const provider: ImageProvider = {
      name: 'comfyui',
      async isAvailable() { return true; },
      async generate(prompt: string, opts?: GenerationOptions): Promise<GenerationOutcome> {
        calls += 1;
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
    return { provider, getCalls: () => calls };
  }

  it('generatePortrait(Alice) then generatePortrait(Alice:) share identity and do not re-generate on ensurePortrait', async () => {
    const store = new MemoryAssetStore();
    const { provider, getCalls } = countingProvider();
    const alice: PortraitRequest = { ...testRequest, characterName: 'Alice' };
    const aliceColon: PortraitRequest = { ...testRequest, characterName: 'Alice:' };

    expect(portraitIdentityTag(alice)).toBe(portraitIdentityTag(aliceColon));
    expect(portraitIdentityTag(alice)).toBe(
      'char:["Alice","Penitent Knight","fantasy","","","Oath-Breaker",["Iron Frame","Cursed Blood"],"",512,512,null]',
    );

    const first = await generatePortrait(alice, provider, store);
    const second = await generatePortrait(aliceColon, provider, store);

    expect(second.hash).toBe(first.hash);
    expect(await store.count()).toBe(1);
    expect(first.tags).toContain(portraitIdentityTag(alice));
    expect(second.tags).toContain(portraitIdentityTag(aliceColon));
    const stored = await store.getMeta(first.hash);
    expect(stored?.tags).toContain(portraitIdentityTag(aliceColon));

    const beforeEnsure = getCalls();
    const ensured = await ensurePortrait(aliceColon, provider, store);
    expect(ensured.hash).toBe(first.hash);
    expect(ensured.tags).toContain(portraitIdentityTag(aliceColon));
    expect(getCalls()).toBe(beforeEnsure);
  });

  it('Alice() shares identity with Alice (sanitize strips parens)', async () => {
    const store = new MemoryAssetStore();
    const { provider, getCalls } = countingProvider();
    const alice: PortraitRequest = { ...testRequest, characterName: 'Alice' };
    const aliceParens: PortraitRequest = { ...testRequest, characterName: 'Alice()' };

    expect(portraitIdentityTag(alice)).toBe(portraitIdentityTag(aliceParens));

    await generatePortrait(alice, provider, store);
    const beforeEnsure = getCalls();
    const ensured = await ensurePortrait(aliceParens, provider, store);
    expect(ensured.tags).toContain(portraitIdentityTag(alice));
    expect(getCalls()).toBe(beforeEnsure);
    expect(await store.count()).toBe(1);
  });
});

// F-a55397ab: request.genre was copied as a free-form tag and used as the
// ensurePortrait list() filter. genre:'placeholder' therefore tagged a real
// ComfyUI PNG as placeholder, isPlaceholderAsset treated it as degraded, and
// ensurePortrait re-queued forever. Genre lives in the char: JSON only.
describe('genre is not a free-form asset tag (F-a55397ab)', () => {
  function countingProvider() {
    let calls = 0;
    const provider: ImageProvider = {
      name: 'comfyui',
      async isAvailable() { return true; },
      async generate(prompt: string, opts?: GenerationOptions): Promise<GenerationOutcome> {
        calls += 1;
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
    return { provider, getCalls: () => calls };
  }

  it('generatePortrait(genre:placeholder) does not mark a real PNG as placeholder', async () => {
    const store = new MemoryAssetStore();
    const { provider, getCalls } = countingProvider();
    const req: PortraitRequest = { ...testRequest, genre: 'placeholder' };

    const meta = await generatePortrait(req, provider, store);
    expect(meta.mimeType).toBe('image/png');
    expect(meta.tags).not.toContain('placeholder');
    expect(meta.tags).toContain(portraitIdentityTag(req));
    expect(portraitIdentityTag(req)).toContain('"placeholder"');

    const before = getCalls();
    const second = await ensurePortrait(req, provider, store);
    const third = await ensurePortrait(req, provider, store);
    expect(second.hash).toBe(meta.hash);
    expect(third.hash).toBe(meta.hash);
    expect(getCalls()).toBe(before);
    expect(await store.count()).toBe(1);
  });
});

// F-e9ea394a: identity was only JSON([name, archetype, genre]), but the
// prompt interpolates title, discipline, background, traits, and style, and
// generatePortrait forwards generation width/height/seed. Queen vs Beggar
// sharing name/archetype/genre must not collide. Alice/Alice: still share.
describe('portrait identity includes every prompt-affecting field (F-e9ea394a)', () => {
  function countingProvider() {
    let calls = 0;
    const provider: ImageProvider = {
      name: 'comfyui',
      async isAvailable() { return true; },
      async generate(prompt: string, opts?: GenerationOptions): Promise<GenerationOutcome> {
        calls += 1;
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
    return { provider, getCalls: () => calls };
  }

  it('ensurePortrait(Queen) vs ensurePortrait(Beggar) with same name/archetype/genre are distinct', async () => {
    const store = new MemoryAssetStore();
    const { provider, getCalls } = countingProvider();
    const queen: PortraitRequest = {
      ...testRequest,
      characterName: 'Alice',
      archetypeName: 'Mage',
      genre: 'fantasy',
      title: 'Queen',
      backgroundName: 'Royal Court',
      traits: ['Regal'],
    };
    const beggar: PortraitRequest = {
      ...testRequest,
      characterName: 'Alice',
      archetypeName: 'Mage',
      genre: 'fantasy',
      title: 'Beggar',
      backgroundName: 'Gutters',
      traits: ['Starving'],
    };

    expect(portraitIdentityTag(queen)).not.toBe(portraitIdentityTag(beggar));

    const queenMeta = await ensurePortrait(queen, provider, store);
    const beggarMeta = await ensurePortrait(beggar, provider, store);

    expect(queenMeta.hash).not.toBe(beggarMeta.hash);
    expect(getCalls()).toBe(2);
    expect(await store.count()).toBe(2);
    expect(queenMeta.source).toContain('Queen');
    expect(beggarMeta.source).toContain('Beggar');
    expect(beggarMeta.source).not.toContain('Queen');
  });

  it('identity includes generation width/height/seed', () => {
    const base = { ...testRequest, characterName: 'Alice' };
    expect(portraitIdentityTag(base, { width: 256 })).not.toBe(portraitIdentityTag(base));
    expect(portraitIdentityTag(base, { seed: 1 })).not.toBe(portraitIdentityTag(base, { seed: 2 }));
    expect(portraitIdentityTag(base)).toBe(portraitIdentityTag(base, { width: 512, height: 512 }));
  });

  it('ensurePortrait with generation options matches generatePortrait identity', async () => {
    const store = new MemoryAssetStore();
    const { provider, getCalls } = countingProvider();
    const opts = { generation: { width: 256, height: 256, seed: 9 } };
    const first = await generatePortrait(testRequest, provider, store, opts);
    const before = getCalls();
    const ensured = await ensurePortrait(testRequest, provider, store, opts);
    expect(ensured.hash).toBe(first.hash);
    expect(getCalls()).toBe(before);
  });
});
