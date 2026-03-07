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
