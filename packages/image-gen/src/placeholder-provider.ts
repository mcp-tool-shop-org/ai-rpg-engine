// Placeholder image provider — generates SVG portraits with zero external deps
// Always available, deterministic, useful for testing and development.

import type { ImageProvider, GenerationResult, GenerationOptions } from './types.js';

/** Deterministic color from a string (hash-based). */
function stringToColor(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 45%, 35%)`;
}

/** Extract initials from a name (up to 2 characters). */
function initials(name: string): string {
  return name
    .split(/[\s-]+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Generate an SVG portrait placeholder. */
function generateSvg(
  name: string,
  prompt: string,
  width: number,
  height: number,
): Uint8Array {
  const bg = stringToColor(name);
  const letters = initials(name) || '??';
  const fontSize = Math.floor(Math.min(width, height) * 0.35);
  const subtitleSize = Math.floor(fontSize * 0.22);

  // Extract the class/title from the prompt for subtitle
  const subtitle = prompt.length > 60 ? prompt.slice(0, 57) + '...' : prompt;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <rect width="${width}" height="${height}" fill="${bg}"/>`,
    `  <text x="${width / 2}" y="${height * 0.45}" font-size="${fontSize}" fill="rgba(255,255,255,0.9)" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-weight="bold">${letters}</text>`,
    `  <text x="${width / 2}" y="${height * 0.72}" font-size="${subtitleSize}" fill="rgba(255,255,255,0.5)" text-anchor="middle" font-family="sans-serif">${escapeXml(subtitle)}</text>`,
    `</svg>`,
  ].join('\n');

  return new TextEncoder().encode(svg);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class PlaceholderProvider implements ImageProvider {
  readonly name = 'placeholder';

  async generate(prompt: string, opts?: GenerationOptions): Promise<GenerationResult> {
    const width = opts?.width ?? 512;
    const height = opts?.height ?? 512;
    const start = Date.now();

    // Extract character name from prompt (first "Portrait of X," segment)
    const nameMatch = prompt.match(/Portrait of ([^,]+)/);
    const charName = nameMatch?.[1] ?? 'Unknown';

    const image = generateSvg(charName, prompt, width, height);

    return {
      image,
      mimeType: 'image/svg+xml',
      width,
      height,
      prompt,
      seed: opts?.seed,
      model: 'placeholder-svg',
      durationMs: Date.now() - start,
    };
  }

  async isAvailable(): Promise<boolean> {
    return true; // Always available
  }
}
