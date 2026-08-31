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

/** Bounding box of non-zero mask pixels so inpaint overlays stay local (F-f4a0a8ec). */
function maskBBox(
  mask: Uint8Array,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } | null {
  const n = width * height;
  if (n <= 0 || mask.length === 0) return null;
  const sample = (i: number): number => {
    if (mask.length >= n * 4) return mask[i * 4] || mask[i * 4 + 3];
    if (mask.length >= n) return mask[i];
    return mask[Math.min(mask.length - 1, Math.floor((i / n) * mask.length))] ?? 0;
  };
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (sample(y * width + x) > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: Math.max(1, maxX - minX + 1), h: Math.max(1, maxY - minY + 1) };
}

/** Overlay a corner mark so img2img variants are visually distinct (F-9daede34). */
function overlayVariantMark(
  svgBytes: Uint8Array,
  width: number,
  height: number,
  mask?: Uint8Array,
): Uint8Array {
  const text = new TextDecoder().decode(svgBytes);
  if (!text.includes('<svg')) return svgBytes;
  let x = 0;
  let y = 0;
  let markW = Math.max(8, Math.floor(width * 0.12));
  let markH = Math.max(8, Math.floor(height * 0.12));
  let masked = false;
  if (mask && mask.length > 0) {
    const bbox = maskBBox(mask, width, height);
    if (bbox) {
      x = bbox.x;
      y = bbox.y;
      markW = bbox.w;
      markH = bbox.h;
      masked = true;
    }
  }
  const mark = `  <rect x="${x}" y="${y}" width="${markW}" height="${markH}" fill="#c9a227" data-variant="1"${masked ? ' data-mask="1"' : ''}/>`;
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
        ? overlayVariantMark(opts.initImage, width, height, opts.mask)
        : overlayVariantMark(image, width, height, opts.mask);
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
