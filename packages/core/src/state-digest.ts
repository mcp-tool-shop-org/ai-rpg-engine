// state-digest.ts — Shared cross-language state digest validation and scaling rules.
//
// Both @ai-rpg-engine/content-schema (content intake) and @ai-rpg-engine/sidecar
// (wire validation & canonicalStateHash) validate authoritative state with these rules.

/** Fixed decimal digits preserved on wire quantization and scaled in canonical digits. */
export const WIRE_PRECISION = 6;
/** Fixed integer multiplier applied before half-away-from-zero rounding (`10^6`). */
export const DIGEST_SCALE = 10 ** WIRE_PRECISION;

export type StateDigestErrorCode =
  | 'NON_FINITE_NUMBER'
  | 'UNSAFE_SCALED_INTEGER'
  | 'NON_ASCII_KEY'
  | 'LONE_SURROGATE'
  | 'NUL_CHARACTER'
  | 'UNSUPPORTED_VALUE_TYPE';

const DEFAULT_DIAGNOSTIC_MAX_LEN = 64;

function isControlOrLoneSurrogateCode(code: number, nextCode: number | undefined): {
  kind: 'quote' | 'backslash' | 'ctrl' | 'surrogate_pair' | 'lone_surrogate' | 'normal';
} {
  if (code === 0x22) return { kind: 'quote' };
  if (code === 0x5c) return { kind: 'backslash' };
  if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) {
    return { kind: 'ctrl' };
  }
  if (code >= 0xd800 && code <= 0xdbff) {
    if (nextCode !== undefined && nextCode >= 0xdc00 && nextCode <= 0xdfff) {
      return { kind: 'surrogate_pair' };
    }
    return { kind: 'lone_surrogate' };
  }
  if (code >= 0xdc00 && code <= 0xdfff) {
    return { kind: 'lone_surrogate' };
  }
  return { kind: 'normal' };
}

function formatControlUnit(code: number): string {
  switch (code) {
    case 0x08:
      return '\\b';
    case 0x09:
      return '\\t';
    case 0x0a:
      return '\\n';
    case 0x0c:
      return '\\f';
    case 0x0d:
      return '\\r';
    default:
      return `\\u${code.toString(16).padStart(4, '0')}`;
  }
}

function sanitizeBoundedText(
  raw: string,
  maxLen: number,
  escapeQuotesAndBackslashes: boolean,
): string {
  const limit = Math.max(4, maxLen);
  const atoms: string[] = [];
  let total = 0;
  let truncated = false;
  let i = 0;
  while (i < raw.length) {
    const code = raw.charCodeAt(i);
    const next = i + 1 < raw.length ? raw.charCodeAt(i + 1) : undefined;
    const { kind } = isControlOrLoneSurrogateCode(code, next);
    let atom: string;
    let advance = 1;
    if (escapeQuotesAndBackslashes && kind === 'quote') atom = '\\"';
    else if (escapeQuotesAndBackslashes && kind === 'backslash') atom = '\\\\';
    else if (kind === 'ctrl' || kind === 'lone_surrogate') atom = formatControlUnit(code);
    else if (kind === 'surrogate_pair') {
      atom = raw.slice(i, i + 2);
      advance = 2;
    } else {
      atom = raw[i];
    }

    if (total + atom.length > limit) {
      truncated = true;
      break;
    }
    atoms.push(atom);
    total += atom.length;
    i += advance;
  }
  if (!truncated) return atoms.join('');
  while (atoms.length > 0 && total > limit - 3) {
    total -= atoms.pop()!.length;
  }
  return `${atoms.join('')}...`;
}

/**
 * Escape quotes, backslashes, C0/DEL/C1 controls (including ANSI ESC `\\x1b`),
 * and lone surrogates for diagnostic messages and paths, bounding length cleanly
 * without slicing an escape sequence or valid surrogate pair in half.
 */
export function escapeDiagnosticText(raw: string, maxLen = DEFAULT_DIAGNOSTIC_MAX_LEN): string {
  return sanitizeBoundedText(raw, maxLen, true);
}

/** Escape only C0/DEL/C1 control characters and lone surrogates inside a preformatted message. */
function sanitizeDiagnosticMessage(raw: string, maxLen = 256): string {
  return sanitizeBoundedText(raw, maxLen, false);
}

function sanitizeDetailValue(v: unknown, depth = 0): unknown {
  if (depth > 4) return '...';
  if (typeof v === 'string') return escapeDiagnosticText(v);
  if (typeof v === 'symbol') return escapeDiagnosticText(String(v));
  if (typeof v === 'bigint') return escapeDiagnosticText(v.toString());
  if (typeof v === 'function') return '[function]';
  if (Array.isArray(v)) return v.slice(0, 8).map((item) => sanitizeDetailValue(item, depth + 1));
  if (v !== null && typeof v === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      clean[escapeDiagnosticText(k)] = sanitizeDetailValue(val, depth + 1);
    }
    return clean;
  }
  return v;
}

export class StateDigestError extends Error {
  readonly code: StateDigestErrorCode;
  readonly path: string;
  readonly detail: Record<string, unknown>;

  constructor(
    code: StateDigestErrorCode,
    path: string,
    message: string,
    detail: Record<string, unknown> = {},
  ) {
    super(sanitizeDiagnosticMessage(message, 256));
    this.name = 'StateDigestError';
    this.code = code;
    this.path = escapeDiagnosticText(path, 128);
    this.detail = sanitizeDetailValue(detail) as Record<string, unknown>;
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.name,
      code: this.code,
      path: this.path,
      message: this.message,
      ...this.detail,
    };
  }
}

/** Round `scaled` symmetrically half-away-from-zero and normalize `-0` to `0`. */
export function roundHalfAwayFromZero(scaled: number): number {
  if (scaled === 0) return 0;
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
  return rounded === 0 ? 0 : rounded;
}

/** Assert a string contains neither U+0000 nor lone UTF-16 surrogates (RFC 8785 §3.2.2.2). */
export function assertValidDigestString(str: string, path: string): void {
  const safePath = escapeDiagnosticText(path, 96);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 0x0000) {
      throw new StateDigestError(
        'NUL_CHARACTER',
        path,
        `string at ${safePath} contains U+0000 (NUL) at index ${i}, which cannot round-trip across UTF-32/C-string hosts`,
        { index: i, codeUnit: 'U+0000' },
      );
    }
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        i += 1;
        continue;
      }
      const hex = code.toString(16).toUpperCase().padStart(4, '0');
      throw new StateDigestError(
        'LONE_SURROGATE',
        path,
        `string at ${safePath} contains lone high surrogate U+${hex} at index ${i} (RFC 8785 §3.2.2.2)`,
        { index: i, codeUnit: `U+${hex}` },
      );
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      const hex = code.toString(16).toUpperCase().padStart(4, '0');
      throw new StateDigestError(
        'LONE_SURROGATE',
        path,
        `string at ${safePath} contains lone low surrogate U+${hex} at index ${i} (RFC 8785 §3.2.2.2)`,
        { index: i, codeUnit: `U+${hex}` },
      );
    }
  }
}

/** Assert an object key uses 7-bit ASCII without NUL (`0x01..0x7f`). */
export function assertAsciiKey(key: string, parentPath: string): void {
  const fullPath = `${parentPath}.${key}`;
  const safeKey = escapeDiagnosticText(key);
  const safeParent = escapeDiagnosticText(parentPath, 96);
  for (let i = 0; i < key.length; i++) {
    const code = key.charCodeAt(i);
    if (code === 0x0000) {
      throw new StateDigestError(
        'NUL_CHARACTER',
        fullPath,
        `object key "${safeKey}" at ${safeParent} contains U+0000 (NUL) at index ${i}`,
        { key, index: i, codeUnit: 'U+0000' },
      );
    }
    if (code > 0x7f) {
      const hex = code.toString(16).toUpperCase().padStart(4, '0');
      throw new StateDigestError(
        'NON_ASCII_KEY',
        fullPath,
        `object key "${safeKey}" at ${safeParent} contains non-ASCII character U+${hex}`,
        { key, codePoint: code },
      );
    }
  }
}

/** Multiply `value` by `1e6` in IEEE-754 binary64, verify safe-integer magnitude, and round half-away-from-zero. */
export function scaleDigestNumber(value: number, path: string): number {
  const safePath = escapeDiagnosticText(path, 96);
  if (!Number.isFinite(value)) {
    throw new StateDigestError(
      'NON_FINITE_NUMBER',
      path,
      `non-finite number (${String(value)}) at ${safePath} is not valid in canonical digest state`,
      { value: String(value) },
    );
  }
  const scaled = value * DIGEST_SCALE;
  const rounded = roundHalfAwayFromZero(scaled);
  if (
    !Number.isFinite(scaled) ||
    Math.abs(scaled) > Number.MAX_SAFE_INTEGER ||
    Math.abs(rounded) > Number.MAX_SAFE_INTEGER
  ) {
    throw new StateDigestError(
      'UNSAFE_SCALED_INTEGER',
      path,
      `scaled number ${value} * 1e6 = ${scaled} at ${safePath} exceeds safe integer bound (2^53 - 1)`,
      { value, scaled, rounded },
    );
  }
  return rounded;
}

/**
 * Validate a state tree for cross-language canonical digest compatibility:
 * - rejects non-finite numbers and numbers with |v * 1e6| > 2^53 - 1;
 * - rejects non-ASCII object keys (> 0x7f) and NUL characters (`U+0000`);
 * - rejects lone UTF-16 surrogates (RFC 8785 §3.2.2.2);
 * - rejects non-JSON runtime types (`function`, `symbol`, `bigint`);
 * - walks arrays by index so sparse holes map cleanly to `null` on wire.
 */
export function validateDigestState(value: unknown, path = '$'): void {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    const safePath = escapeDiagnosticText(path, 96);
    const kind = typeof value;
    throw new StateDigestError(
      'UNSUPPORTED_VALUE_TYPE',
      path,
      `unsupported non-JSON value of type ${kind} at ${safePath}`,
      { valueType: kind },
    );
  }
  if (typeof value === 'number') {
    scaleDigestNumber(value, path);
    return;
  }
  if (typeof value === 'string') {
    assertValidDigestString(value, path);
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      validateDigestState(value[i], `${path}[${i}]`);
    }
    return;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      assertAsciiKey(k, path);
      const v = obj[k];
      if (v === undefined) continue;
      validateDigestState(v, `${path}.${k}`);
    }
  }
}
