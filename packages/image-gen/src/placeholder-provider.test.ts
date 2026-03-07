import { describe, it, expect } from 'vitest';
import { PlaceholderProvider } from './placeholder-provider.js';

describe('PlaceholderProvider', () => {
  const provider = new PlaceholderProvider();

  it('is always available', async () => {
    expect(await provider.isAvailable()).toBe(true);
  });

  it('has name "placeholder"', () => {
    expect(provider.name).toBe('placeholder');
  });

  it('generates an SVG image', async () => {
    const result = await provider.generate('Portrait of Aldric, Penitent Knight');
    expect(result.mimeType).toBe('image/svg+xml');
    expect(result.image.length).toBeGreaterThan(0);

    const svg = new TextDecoder().decode(result.image);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('includes character initials in the SVG', async () => {
    const result = await provider.generate('Portrait of Aldric, Penitent Knight');
    const svg = new TextDecoder().decode(result.image);
    expect(svg).toContain('>A<');
  });

  it('respects custom dimensions', async () => {
    const result = await provider.generate('Portrait of Test', { width: 256, height: 256 });
    expect(result.width).toBe(256);
    expect(result.height).toBe(256);
    const svg = new TextDecoder().decode(result.image);
    expect(svg).toContain('width="256"');
  });

  it('defaults to 512x512', async () => {
    const result = await provider.generate('Portrait of Test');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it('includes the prompt in the result', async () => {
    const prompt = 'Portrait of Nyx, Netrunner';
    const result = await provider.generate(prompt);
    expect(result.prompt).toBe(prompt);
  });

  it('records generation time', async () => {
    const result = await provider.generate('Portrait of Test');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('produces deterministic output for same input', async () => {
    const a = await provider.generate('Portrait of Aldric, Knight');
    const b = await provider.generate('Portrait of Aldric, Knight');
    const svgA = new TextDecoder().decode(a.image);
    const svgB = new TextDecoder().decode(b.image);
    expect(svgA).toBe(svgB);
  });

  it('produces different output for different names', async () => {
    const a = await provider.generate('Portrait of Aldric, Knight');
    const b = await provider.generate('Portrait of Nyx, Hacker');
    const svgA = new TextDecoder().decode(a.image);
    const svgB = new TextDecoder().decode(b.image);
    expect(svgA).not.toBe(svgB);
  });
});
