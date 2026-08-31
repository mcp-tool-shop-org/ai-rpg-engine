// Glyph layer — accessibility sibling of styles.ts's palette.
//
// Color (NO_COLOR / TERM=dumb / non-TTY) is redundant emphasis and already
// gated in detectColorEnabled. Glyphs are a separate contract: box-drawing
// rules, ellipses, ticks, and mid-dots become unreadable on a legacy code
// page and are announced as "box drawings light horizontal" by a screen
// reader reading a transcript. ASCII_ONLY / --ascii / TERM=dumb swap them
// for 7-bit stand-ins. NO_COLOR does NOT flip glyphs.

export type GlyphSet = {
  /** One-column rule character (U+2500 or hyphen). */
  rule: string;
  /** Clip ellipsis (U+2026 or '...'). ASCII form is 3 columns. */
  ellipsis: string;
  /** HUD/list separator (U+00B7 or hyphen). */
  midDot: string;
  /** Em dash in event lines (U+2014 or hyphen). */
  emDash: string;
  /** Arrow in event lines (U+2192 or '->'). */
  arrow: string;
  /** formatRecentRuns victory mark. */
  victory: string;
  /** formatRecentRuns defeat mark. */
  defeat: string;
  /** CLI structured-error mark. */
  errorMark: string;
  /** CLI success mark. */
  okMark: string;
};

export const UNICODE_GLYPHS: GlyphSet = {
  rule: '\u2500',
  ellipsis: '\u2026',
  midDot: '\u00B7',
  emDash: '\u2014',
  arrow: '\u2192',
  victory: '\u2713 Victory',
  defeat: '\u2717 Defeat',
  errorMark: '\u2717',
  okMark: '\u2713',
};

export const ASCII_GLYPHS: GlyphSet = {
  rule: '-',
  ellipsis: '...',
  midDot: '-',
  emDash: '-',
  arrow: '->',
  victory: '+ Victory',
  defeat: 'x Defeat',
  errorMark: 'x',
  okMark: '+',
};

/**
 * Decide whether ASCII glyphs should be emitted.
 *
 * Precedence (first match wins):
 *   1. ASCII_ONLY set to a non-empty value other than '0'  -> true
 *   2. Under vitest, stop here (keep unicode so existing screen pins hold
 *      unless the test opts in via ASCII_ONLY / { ascii: true })
 *   3. TERM=dumb                                           -> true
 *   4. otherwise false
 *
 * NO_COLOR is deliberately ignored — it remains the color gate.
 */
export function detectAsciiOnly(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const ascii = env.ASCII_ONLY;
  if (ascii !== undefined && ascii !== '' && ascii !== '0') return true;
  if (env.VITEST !== undefined) return false;
  if (env.TERM === 'dumb') return true;
  return false;
}

let glyphOverride: boolean | undefined;

/** Run `fn` with an explicit ascii/unicode glyph decision (sync renderers). */
export function withGlyphs<T>(ascii: boolean, fn: () => T): T {
  const prev = glyphOverride;
  glyphOverride = ascii;
  try {
    return fn();
  } finally {
    glyphOverride = prev;
  }
}

/** Active glyph set. `opts.ascii` wins, then withGlyphs(), then env. */
export function glyphsFor(opts?: { ascii?: boolean }): GlyphSet {
  const ascii = opts?.ascii ?? glyphOverride ?? detectAsciiOnly();
  return ascii ? ASCII_GLYPHS : UNICODE_GLYPHS;
}

/**
 * Swap renderer-owned punctuation (em dash, arrow) for the active glyph set.
 * Applied at formatEventLine emission so wrapToWidth sees the ASCII widths.
 */
export function applyGlyphPunctuation(text: string, opts?: { ascii?: boolean }): string {
  const g = glyphsFor(opts);
  if (g.emDash === UNICODE_GLYPHS.emDash && g.arrow === UNICODE_GLYPHS.arrow) return text;
  return text.replaceAll(UNICODE_GLYPHS.emDash, g.emDash).replaceAll(UNICODE_GLYPHS.arrow, g.arrow);
}
