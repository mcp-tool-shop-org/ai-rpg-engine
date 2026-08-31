// Placeholder image provider — generates SVG portraits with zero external deps
// Always available, deterministic, useful for testing and development.

import type { ImageProvider, GenerationOutcome, GenerationOptions } from './types.js';

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

/**
 * Pull character name plus title/class from an engine portrait prompt.
 * Engine prompts are `Portrait of {name}[, {title}], {archetype}…, {origin}, {style}`.
 * Style/origin/trait tails are dropped so the subtitle is the class or title,
 * not a mid-prompt fragment of the SD string (F-e27ee3c1).
 */
function extractNameAndSubtitle(prompt: string): { name: string; subtitle: string } {
  const nameMatch = prompt.match(/(?:Portrait|Scene|Background|Icon) of ([^,]+)/i);
  const name = (nameMatch?.[1] ?? 'Unknown').trim() || 'Unknown';
  const afterName = nameMatch
    ? prompt.slice((nameMatch.index ?? 0) + nameMatch[0].length).replace(/^,\s*/, '')
    : '';
  const identity: string[] = [];
  for (const raw of afterName.split(',')) {
    const seg = raw.trim();
    if (!seg) continue;
    const lower = seg.toLowerCase();
    if (/\borigin\b/.test(lower)) break;
    if (/^known for being\b/.test(lower)) break;
    if (/^[.…]+$/.test(seg)) break;
    if (/\b(oil painting|digital art|concept art|cinematic lighting|painterly|illustration|neon lighting|dramatic lighting|high contrast)\b/i.test(seg)) {
      break;
    }
    identity.push(seg.replace(/[.…]+$/u, '').trim());
  }
  return { name, subtitle: identity.find(Boolean) ?? '' };
}

function clipId(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash).toString(36);
}

/** Generate an SVG portrait placeholder. */
function generateSvg(
  name: string,
  subtitle: string,
  width: number,
  height: number,
): Uint8Array {
  const bg = stringToColor(name);
  const letters = initials(name) || '??';
  const fontSize = Math.floor(Math.min(width, height) * 0.35);
  const subtitleSize = Math.max(10, Math.floor(fontSize * 0.22));
  const markSize = Math.max(10, Math.floor(Math.min(width, height) * 0.04));
  const pad = Math.max(12, Math.floor(width * 0.05));
  const clipW = Math.max(1, width - pad * 2);
  const subY = height * 0.72;
  const clipH = Math.max(subtitleSize * 1.6, 1);
  const id = clipId(name);
  const clipPathId = `ph-clip-${id}`;
  const titleId = `ph-title-${id}`;
  const maxChars = Math.max(8, Math.floor(clipW / (subtitleSize * 0.55)));
  const shown = subtitle.length > maxChars
    ? `${subtitle.slice(0, Math.max(1, maxChars - 1))}\u2026`
    : subtitle;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleId}">`,
    `  <title id="${titleId}">Portrait placeholder: ${escapeXml(name)}</title>`,
    `  <desc>Initials placeholder for ${escapeXml(name)}${shown ? `, ${escapeXml(shown)}` : ''}. Not a final portrait.</desc>`,
    `  <defs>`,
    `    <clipPath id="${clipPathId}">`,
    `      <rect x="${pad}" y="${subY - clipH * 0.75}" width="${clipW}" height="${clipH}"/>`,
    `    </clipPath>`,
    `  </defs>`,
    `  <rect width="${width}" height="${height}" fill="${bg}"/>`,
    `  <text x="${width / 2}" y="${height * 0.45}" font-size="${fontSize}" fill="#ffffff" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-weight="bold">${escapeXml(letters)}</text>`,
    shown
      ? `  <text x="${width / 2}" y="${subY}" font-size="${subtitleSize}" fill="#ffffff" text-anchor="middle" font-family="sans-serif" clip-path="url(#${clipPathId})">${escapeXml(shown)}</text>`
      : '',
    `  <text x="${width - pad}" y="${height - pad}" font-size="${markSize}" fill="#ffffff" text-anchor="end" font-family="sans-serif">placeholder</text>`,
    `</svg>`,
  ].filter((line) => line.length > 0).join('\n');

  return new TextEncoder().encode(svg);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Overlay a corner mark so img2img variants are visually distinct (F-9daede34). */
function overlayVariantMark(svgBytes: Uint8Array, width: number, height: number): Uint8Array {
  const text = new TextDecoder().decode(svgBytes);
  if (!text.includes('<svg')) return svgBytes;
  const markW = Math.max(8, Math.floor(width * 0.12));
  const markH = Math.max(8, Math.floor(height * 0.12));
  const mark = `  <rect x="0" y="0" width="${markW}" height="${markH}" fill="#c9a227" data-variant="1"/>`;
  const patched = text.includes('</svg>')
    ? text.replace('</svg>', `${mark}\n</svg>`)
    : `${text}\n${mark}`;
  return new TextEncoder().encode(patched);
}

export class PlaceholderProvider implements ImageProvider {
  readonly name = 'placeholder';

  async generate(prompt: string, opts?: GenerationOptions): Promise<GenerationOutcome> {
    const width = opts?.width ?? 512;
    const height = opts?.height ?? 512;
    const start = Date.now();

    const { name, subtitle } = extractNameAndSubtitle(prompt);
    let image = generateSvg(name, subtitle, width, height);
    if (opts?.initImage && opts.initImage.length > 0) {
      const asText = new TextDecoder().decode(opts.initImage);
      image = asText.includes('<svg')
        ? overlayVariantMark(opts.initImage, width, height)
        : overlayVariantMark(image, width, height);
    }

    // Local + synchronous: this provider has no failure modes, so it always
    // resolves the ok:true arm of the GenerationOutcome contract.
    return {
      ok: true,
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
