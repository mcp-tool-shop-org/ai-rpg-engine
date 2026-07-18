// ANSI styling layer — Stage D visual polish.
//
// Accessibility contract (extends the Stage C "never color-only" rule):
//   1. Color is ALWAYS redundant emphasis. Every piece of information the
//      renderer emits lives in the text itself (icons, labels, numbers), so
//      stripping every ANSI code yields the exact plain-text screen. This is
//      pinned by test: stripAnsi(colored render) === plain render, byte for
//      byte.
//   2. NO_COLOR (https://no-color.org) wins over EVERYTHING, including
//      FORCE_COLOR — a user's opt-out is never overridden.
//   3. Piped / redirected output (stdout not a TTY) gets plain text, so CI
//      captures, logs, and screen readers reading a transcript never see
//      escape codes.

export type Palette = {
  /** True when this palette emits ANSI codes; false = every helper is identity. */
  enabled: boolean;
  bold(text: string): string;
  dim(text: string): string;
  red(text: string): string;
  green(text: string): string;
  yellow(text: string): string;
  cyan(text: string): string;
};

/**
 * Decide whether color should be emitted, given an environment and an output
 * stream. Injectable for tests; callers normally use the defaults.
 *
 * Precedence (first match wins):
 *   1. NO_COLOR set to a non-empty value  -> false  (user opt-out is sacred)
 *   2. FORCE_COLOR set, non-empty, not '0' -> true  (explicit opt-in, e.g. piping
 *      to a pager that understands ANSI)
 *   3. Running under vitest               -> false  (test output is captured,
 *      never interactive; keeps every existing plain-text assertion
 *      deterministic regardless of how the runner wires stdout)
 *   4. TERM=dumb                          -> false
 *   5. stdout is an interactive TTY       -> true, otherwise false
 */
export function detectColorEnabled(
  env: Record<string, string | undefined> = process.env,
  stream: { isTTY?: boolean } | undefined = process.stdout,
): boolean {
  const noColor = env.NO_COLOR;
  if (noColor !== undefined && noColor !== '') return false;
  const force = env.FORCE_COLOR;
  if (force !== undefined && force !== '' && force !== '0') return true;
  if (env.VITEST !== undefined) return false;
  if (env.TERM === 'dumb') return false;
  return stream?.isTTY === true;
}

const ESC = '\u001b[';

/**
 * Build a style helper that wraps text in open/close codes when enabled, and
 * is the identity function when disabled. Empty strings pass through
 * unwrapped so a skipped segment never leaves stray codes behind.
 */
function styler(enabled: boolean, open: string, close: string): (text: string) => string {
  if (!enabled) return (text: string) => text;
  return (text: string) => (text.length === 0 ? text : `${ESC}${open}m${text}${ESC}${close}m`);
}

/** Create a palette. Disabled palettes are pure identity — zero codes emitted. */
export function makePalette(enabled: boolean): Palette {
  return {
    enabled,
    bold: styler(enabled, '1', '22'),
    dim: styler(enabled, '2', '22'),
    red: styler(enabled, '31', '39'),
    green: styler(enabled, '32', '39'),
    yellow: styler(enabled, '33', '39'),
    cyan: styler(enabled, '36', '39'),
  };
}

const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

/** Remove every ANSI SGR code — the no-color fallback in function form. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}
