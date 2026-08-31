import { describe, it, expect } from 'vitest';
import { PlaceholderProvider } from './placeholder-provider.js';
import type { GenerationOptions, GenerationSuccess } from './types.js';

describe('PlaceholderProvider', () => {
  const provider = new PlaceholderProvider();

  /** The placeholder has no failure modes — narrow the outcome to its ok arm. */
  async function generate(prompt: string, opts?: GenerationOptions): Promise<GenerationSuccess> {
    const result = await provider.generate(prompt, opts);
    if (!result.ok) throw new Error(`placeholder unexpectedly failed: ${result.error}`);
    return result;
  }

  it('is always available', async () => {
    expect(await provider.isAvailable()).toBe(true);
  });

  it('always resolves the ok:true arm of the GenerationOutcome contract', async () => {
    const result = await provider.generate('Portrait of Test');
    expect(result.ok).toBe(true);
  });

  it('has name "placeholder"', () => {
    expect(provider.name).toBe('placeholder');
  });

  it('generates an SVG image', async () => {
    const result = await generate('Portrait of Aldric, Penitent Knight');
    expect(result.mimeType).toBe('image/svg+xml');
    expect(result.image.length).toBeGreaterThan(0);

    const svg = new TextDecoder().decode(result.image);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('includes character initials in the SVG', async () => {
    const result = await generate('Portrait of Aldric, Penitent Knight');
    const svg = new TextDecoder().decode(result.image);
    expect(svg).toContain('>A<');
  });

  it('respects custom dimensions', async () => {
    const result = await generate('Portrait of Test', { width: 256, height: 256 });
    expect(result.width).toBe(256);
    expect(result.height).toBe(256);
    const svg = new TextDecoder().decode(result.image);
    expect(svg).toContain('width="256"');
  });

  it('defaults to 512x512', async () => {
    const result = await generate('Portrait of Test');
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
  });

  it('includes the prompt in the result', async () => {
    const prompt = 'Portrait of Nyx, Netrunner';
    const result = await generate(prompt);
    expect(result.prompt).toBe(prompt);
  });

  it('records generation time', async () => {
    const result = await generate('Portrait of Test');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('produces deterministic output for same input', async () => {
    const a = await generate('Portrait of Aldric, Knight');
    const b = await generate('Portrait of Aldric, Knight');
    const svgA = new TextDecoder().decode(a.image);
    const svgB = new TextDecoder().decode(b.image);
    expect(svgA).toBe(svgB);
  });

  it('produces different output for different names', async () => {
    const a = await generate('Portrait of Aldric, Knight');
    const b = await generate('Portrait of Nyx, Hacker');
    const svgA = new TextDecoder().decode(a.image);
    const svgB = new TextDecoder().decode(b.image);
    expect(svgA).not.toBe(svgB);
  });

  it('uses title/class as subtitle, not the SD prompt (F-e27ee3c1)', async () => {
    const prompt = 'Portrait of Aldric, Grave Warden, Penitent Knight and Occultist, Oath-Breaker origin, known for being Iron Frame and Cursed Blood, dark fantasy oil painting, dramatic lighting, detailed armor and cloth textures, medieval setting';
    const result = await generate(prompt);
    const svg = new TextDecoder().decode(result.image);

    expect(svg).toContain('Grave Warden');
    expect(svg).not.toContain('dark fantasy oil painting');
    expect(svg).not.toContain('Portrait of Aldric, Grave Warden, Penitent Knight and Occ');
    expect(svg).toMatch(/<title[^>]*>Portrait placeholder: Aldric<\/title>/);
    expect(svg).toContain('role="img"');
    expect(svg).toMatch(/>(placeholder)</);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('clip-path=');
  });

  it('falls back to archetype when the prompt has no title', async () => {
    const result = await generate('Portrait of Aldric, Penitent Knight, Oath-Breaker origin, dark fantasy oil painting');
    const svg = new TextDecoder().decode(result.image);
    expect(svg).toContain('Penitent Knight');
    expect(svg).not.toContain('dark fantasy oil painting');
  });

  // PM-04: initials are interpolated into <text>; they must be XML-escaped like the subtitle.
  it('escapes XML-special characters in the initials', async () => {
    // Prompt -> name "<x" -> initials "<". The bold text node renders the initials.
    const result = await generate('Portrait of <x, Villain');
    const svg = new TextDecoder().decode(result.image);

    // The initials node is the one with font-weight="bold". Before the fix its content
    // is a raw "<" (`bold"><`), which is invalid XML and a markup-injection vector.
    expect(svg).not.toMatch(/font-weight="bold">\s*</);
    // After the fix the initial appears escaped inside that node.
    expect(svg).toMatch(/font-weight="bold">&lt;/);
  });

  it('overlays a variant mark on an initImage SVG (F-9daede34)', async () => {
    const base = await generate('Portrait of Aldric, Penitent Knight');
    const variant = await generate('Portrait of Aldric, Penitent Knight', {
      initImage: base.image,
      denoise: 0.55,
    });
    const svg = new TextDecoder().decode(variant.image);
    expect(svg).toContain('data-variant="1"');
    expect(svg).toContain('Aldric');
  });

  it('clips the overlay to the mask bounding box (F-f4a0a8ec)', async () => {
    const base = await generate('Portrait of Aldric, Penitent Knight');
    const width = 512;
    const height = 512;
    const mask = new Uint8Array(width * height);
    for (let y = 40; y < 80; y++) {
      for (let x = 100; x < 140; x++) mask[y * width + x] = 255;
    }
    const variant = await generate('Portrait of Aldric, Penitent Knight', {
      initImage: base.image,
      mask,
      denoise: 0.55,
    });
    const svg = new TextDecoder().decode(variant.image);
    expect(svg).toContain('data-variant="1"');
    expect(svg).toContain('data-mask="1"');
    expect(svg).toContain('x="100"');
    expect(svg).toContain('y="40"');
    expect(svg).toContain('width="40"');
    expect(svg).toContain('height="40"');
  });

  it('parses Scene of / Icon of prompts for initials', async () => {
    const scene = await generate('Scene of Ashen Chapel, cracked stone nave');
    expect(new TextDecoder().decode(scene.image)).toContain('AC');
    const icon = await generate('Icon of Ashen Chalice, tarnished silver');
    expect(new TextDecoder().decode(icon.image)).toContain('AC');
  });
});
