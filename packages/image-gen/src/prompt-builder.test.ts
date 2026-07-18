import { describe, it, expect } from 'vitest';
import { buildPortraitPrompt, buildNegativePrompt, buildPromptPair } from './prompt-builder.js';
import type { PortraitRequest } from './types.js';

const baseRequest: PortraitRequest = {
  characterName: 'Aldric',
  archetypeName: 'Penitent Knight',
  backgroundName: 'Oath-Breaker',
  traits: ['Iron Frame', 'Cursed Blood'],
  tags: ['martial', 'oath-broken', 'curse-touched'],
  genre: 'fantasy',
};

describe('buildPortraitPrompt', () => {
  it('includes character name', () => {
    const prompt = buildPortraitPrompt(baseRequest);
    expect(prompt).toContain('Aldric');
  });

  it('includes archetype', () => {
    const prompt = buildPortraitPrompt(baseRequest);
    expect(prompt).toContain('Penitent Knight');
  });

  it('includes background', () => {
    const prompt = buildPortraitPrompt(baseRequest);
    expect(prompt).toContain('Oath-Breaker');
  });

  it('includes traits', () => {
    const prompt = buildPortraitPrompt(baseRequest);
    expect(prompt).toContain('Iron Frame');
    expect(prompt).toContain('Cursed Blood');
  });

  it('includes genre style preset', () => {
    const prompt = buildPortraitPrompt(baseRequest);
    expect(prompt).toContain('fantasy');
  });

  it('includes title when provided', () => {
    const req = { ...baseRequest, title: 'Grave Warden', disciplineName: 'Occultist' };
    const prompt = buildPortraitPrompt(req);
    expect(prompt).toContain('Grave Warden');
    expect(prompt).toContain('Occultist');
  });

  it('uses custom style when provided', () => {
    const req = { ...baseRequest, style: 'pixel art retro' };
    const prompt = buildPortraitPrompt(req);
    expect(prompt).toContain('pixel art retro');
  });

  it('works for cyberpunk genre', () => {
    const req: PortraitRequest = {
      characterName: 'Nyx',
      archetypeName: 'Netrunner',
      backgroundName: 'Corporate Dropout',
      traits: ['Chrome Spine'],
      tags: ['hacker', 'chrome'],
      genre: 'cyberpunk',
    };
    const prompt = buildPortraitPrompt(req);
    expect(prompt).toContain('Nyx');
    expect(prompt).toContain('Netrunner');
    expect(prompt).toContain('cyberpunk');
  });
});

// v2.6 audit F-4d700ceb — sanitize() strips `():[]\<>` to neutralize
// Stable-Diffusion-style prompt-control syntax (attention weighting
// `(word:1.5)`, LoRA tags `<lora:...>`) before untrusted-ish fields
// (characterName/archetypeName/backgroundName/title/disciplineName/traits)
// are joined into the generation prompt. The stripped set omitted `{}` and
// `|`, which several SD front-ends (including some ComfyUI text-encode
// nodes) also treat as alternation/weighting syntax (`{a|b}`) — a crafted
// field value could still inject prompt-control syntax past the sanitizer.
describe('buildPortraitPrompt — sanitize() strips hostile prompt-control syntax', () => {
  it('strips curly braces and pipes from character name and traits', () => {
    const req: PortraitRequest = {
      ...baseRequest,
      characterName: '{Aldric|EvilTwin}',
      traits: ['{cursed|blessed}'],
    };
    const prompt = buildPortraitPrompt(req);
    expect(prompt).not.toContain('{');
    expect(prompt).not.toContain('}');
    expect(prompt).not.toContain('|');
  });

  it('still strips the previously-covered characters (regression)', () => {
    const req: PortraitRequest = {
      ...baseRequest,
      characterName: '(Aldric:1.5)',
      archetypeName: '[Penitent Knight]',
      backgroundName: '<lora:evil:1>',
    };
    const prompt = buildPortraitPrompt(req);
    expect(prompt).not.toMatch(/[():[\]\\<>]/);
  });

  it('leaves ordinary punctuation-free content untouched', () => {
    const prompt = buildPortraitPrompt(baseRequest);
    expect(prompt).toContain('Aldric');
    expect(prompt).toContain('Penitent Knight');
  });

  // v2.6 audit F-ece77541 — request.style is the same open string type as the
  // sanitized fields and lands in the exact same final prompt string, but was
  // interpolated completely unsanitized. A crafted style override could inject
  // the very prompt-control syntax every sibling field is stripped of. Route
  // it through the same sanitize() for a consistent threat model.
  it('strips prompt-control syntax from the style override', () => {
    const req: PortraitRequest = {
      ...baseRequest,
      style: '(masterpiece:1.6), <lora:hijack:1>, {oil|neon}',
    };
    const prompt = buildPortraitPrompt(req);
    expect(prompt).not.toMatch(/[():[\]\\<>{}|]/);
    // The harmless words survive; only the control characters are removed.
    expect(prompt).toContain('masterpiece');
    expect(prompt).toContain('oil');
  });

  it('leaves a clean built-in preset style unchanged (no-op for presets)', () => {
    // Every STYLE_PRESETS value is free of the stripped characters, so
    // sanitizing the default path must not alter it.
    const prompt = buildPortraitPrompt(baseRequest);
    expect(prompt).toContain('dark fantasy oil painting');
  });
});

describe('buildNegativePrompt', () => {
  it('returns genre-appropriate negative prompt', () => {
    const neg = buildNegativePrompt(baseRequest);
    expect(neg).toContain('blurry');
    expect(neg).toContain('deformed');
  });

  it('returns fallback for unknown genre', () => {
    const req = { ...baseRequest, genre: 'steampunk-underwater' };
    const neg = buildNegativePrompt(req);
    expect(neg).toContain('blurry');
  });
});

describe('buildPromptPair', () => {
  it('returns both prompts', () => {
    const { prompt, negativePrompt } = buildPromptPair(baseRequest);
    expect(prompt).toContain('Aldric');
    expect(negativePrompt).toContain('blurry');
  });
});
