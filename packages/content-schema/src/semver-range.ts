// semver-range.ts — a bounded semver-range checker for the load gate.
//
// Why hand-rolled: this repo ships zero runtime dependencies, and the gate needs
// exactly one question answered — "does the running engine satisfy the range this
// pack claims?" The full semver spec is not needed and its edge cases are not
// wanted at a security boundary.
//
// The safety bar is RG-C1 Lane 2's, applied to versions instead of conditions:
// a CLOSED, enumerated grammar, no eval, no user-defined operators, and
// termination by construction. Every parse is a linear scan over a bounded token
// set; there is no backtracking regex anywhere in this file, so a hostile range
// string cannot buy super-linear work.
//
// The grammar, in full:
//
//   range      := union ('||' union)*          -- OR
//   union      := comparator (WS comparator)*  -- AND
//   comparator := op? partial
//   op         := '>=' | '<=' | '>' | '<' | '=' | '^' | '~'
//   partial    := NUM ('.' NUM ('.' NUM)?)?    -- 'x' and '*' are wildcards
//
// Deliberately NOT supported, and REJECTED rather than guessed at: hyphen ranges
// ('1.0.0 - 2.0.0') and prerelease comparison. RFC 9413's posture is that
// tolerating input you do not understand ossifies the protocol; a range this
// module cannot parse is an error the author sees, not a default it invents.

/** A parsed semantic version. Prerelease is captured but never compared. */
export type SemVer = { major: number; minor: number; patch: number; prerelease?: string };

export type RangeErrorShape = { code: 'SEMVER_RANGE_INVALID' | 'SEMVER_INVALID'; message: string; hint: string };

export class SemVerError extends Error {
  readonly code: RangeErrorShape['code'];
  readonly hint: string;
  constructor(shape: RangeErrorShape) {
    super(shape.message);
    this.name = 'SemVerError';
    this.code = shape.code;
    this.hint = shape.hint;
  }
}

/** Parse `major.minor.patch[-prerelease][+build]`. Throws {@link SemVerError}. */
export function parseVersion(input: string): SemVer {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new SemVerError({
      code: 'SEMVER_INVALID',
      message: `Version must be a non-empty string, got ${JSON.stringify(input)}.`,
      hint: 'Use a semantic version like "3.8.0".',
    });
  }
  let s = input.trim();
  if (s.startsWith('v')) s = s.slice(1);

  const plus = s.indexOf('+');
  if (plus >= 0) s = s.slice(0, plus); // build metadata is never significant

  let prerelease: string | undefined;
  const dash = s.indexOf('-');
  if (dash >= 0) {
    prerelease = s.slice(dash + 1);
    s = s.slice(0, dash);
  }

  const parts = s.split('.');
  if (parts.length !== 3) {
    throw new SemVerError({
      code: 'SEMVER_INVALID',
      message: `Version "${input}" must have exactly three numeric parts (major.minor.patch).`,
      hint: 'Write "3.8.0", not "3.8" or "3.8.0.1".',
    });
  }
  const nums = parts.map((p) => {
    if (!/^\d+$/.test(p)) {
      throw new SemVerError({
        code: 'SEMVER_INVALID',
        message: `Version "${input}" has a non-numeric part "${p}".`,
        hint: 'Each of major, minor and patch must be a plain integer.',
      });
    }
    return Number(p);
  });
  return { major: nums[0], minor: nums[1], patch: nums[2], ...(prerelease ? { prerelease } : {}) };
}

/** -1 / 0 / 1. Prerelease is ignored: the gate compares release lines only. */
export function compareVersions(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

type Op = '>=' | '<=' | '>' | '<' | '=' | '^' | '~';
type Bound = { op: '>=' | '<=' | '>' | '<' | '='; version: SemVer };

const OPS: Op[] = ['>=', '<=', '>', '<', '=', '^', '~'];

/**
 * Expand one comparator into concrete bounds.
 *
 * `^1.2.3` → `>=1.2.3 <2.0.0` · `~1.2.3` → `>=1.2.3 <1.3.0` · `1.2.x` →
 * `>=1.2.0 <1.3.0` · `*` → no bounds (always satisfied).
 */
function expand(token: string): Bound[] {
  let op: Op = '=';
  let rest = token;
  for (const candidate of OPS) {
    if (token.startsWith(candidate)) {
      op = candidate;
      rest = token.slice(candidate.length).trim();
      break;
    }
  }

  if (rest === '*' || rest === 'x' || rest === 'X' || rest === '') {
    if (op !== '=' && rest === '') {
      throw new SemVerError({
        code: 'SEMVER_RANGE_INVALID',
        message: `Range comparator "${token}" has an operator with no version.`,
        hint: 'Write a full comparator like ">=3.8.0".',
      });
    }
    return []; // '*' — unbounded
  }

  const parts = rest.split('.');
  if (parts.length > 3) {
    throw new SemVerError({
      code: 'SEMVER_RANGE_INVALID',
      message: `Range comparator "${token}" has more than three version parts.`,
      hint: 'Use major.minor.patch, e.g. ">=3.8.0".',
    });
  }

  const isWild = (p: string | undefined): boolean => p === undefined || p === 'x' || p === 'X' || p === '*';
  const wildAt = parts.findIndex((p) => isWild(p));
  const hasWild = wildAt >= 0 || parts.length < 3;

  const num = (p: string | undefined): number => {
    if (isWild(p)) return 0;
    if (!/^\d+$/.test(p!)) {
      throw new SemVerError({
        code: 'SEMVER_RANGE_INVALID',
        message: `Range comparator "${token}" has a non-numeric part "${p}".`,
        hint: 'Version parts must be integers, "x", or "*".',
      });
    }
    return Number(p);
  };

  const lower: SemVer = { major: num(parts[0]), minor: num(parts[1]), patch: num(parts[2]) };

  // A wildcard or partial is a RANGE, not a point — regardless of operator.
  if (hasWild && (op === '=' || op === '^' || op === '~')) {
    const level = wildAt >= 0 ? wildAt : parts.length;
    if (level === 0) return [];
    const upper: SemVer =
      level === 1
        ? { major: lower.major + 1, minor: 0, patch: 0 }
        : { major: lower.major, minor: lower.minor + 1, patch: 0 };
    return [{ op: '>=', version: lower }, { op: '<', version: upper }];
  }

  switch (op) {
    case '^': {
      // Caret follows npm's leftmost-nonzero rule: ^0.2.3 → >=0.2.3 <0.3.0.
      const upper: SemVer =
        lower.major > 0
          ? { major: lower.major + 1, minor: 0, patch: 0 }
          : lower.minor > 0
            ? { major: 0, minor: lower.minor + 1, patch: 0 }
            : { major: 0, minor: 0, patch: lower.patch + 1 };
      return [{ op: '>=', version: lower }, { op: '<', version: upper }];
    }
    case '~':
      return [
        { op: '>=', version: lower },
        { op: '<', version: { major: lower.major, minor: lower.minor + 1, patch: 0 } },
      ];
    default:
      return [{ op, version: lower }];
  }
}

function satisfiesBound(v: SemVer, b: Bound): boolean {
  const c = compareVersions(v, b.version);
  switch (b.op) {
    case '>=': return c >= 0;
    case '>': return c > 0;
    case '<=': return c <= 0;
    case '<': return c < 0;
    case '=': return c === 0;
  }
}

/**
 * Does `version` satisfy `range`?
 *
 * Throws {@link SemVerError} on a range this grammar does not accept — loudly,
 * rather than defaulting to permissive. A gate that passes what it cannot parse
 * is not a gate.
 */
export function satisfiesRange(version: string | SemVer, range: string): boolean {
  const v = typeof version === 'string' ? parseVersion(version) : version;

  if (typeof range !== 'string' || range.trim().length === 0) {
    throw new SemVerError({
      code: 'SEMVER_RANGE_INVALID',
      message: 'Range must be a non-empty string.',
      hint: 'Use a range like ">=3.8.0 <4.0.0", "^3.8.0", or "3.x".',
    });
  }
  if (range.includes(' - ')) {
    throw new SemVerError({
      code: 'SEMVER_RANGE_INVALID',
      message: `Hyphen ranges are not supported ("${range}").`,
      hint: 'Write the equivalent comparator range instead, e.g. ">=1.0.0 <=2.0.0".',
    });
  }

  // PARSE EVERY ALTERNATIVE FIRST, then evaluate.
  //
  // ⚠ The obvious loop — parse-and-test each alternative, returning on the first
  // match — is WRONG at a gate, and a control caught it: ">=1.0.0 ||" returned
  // true for 3.8.0 because the first alternative matched and the empty second one
  // was never reached. A malformed range must be refused no matter where the
  // malformation sits, or "does this parse?" silently becomes "did I happen to
  // match before I noticed?".
  const alternatives = range.split('||').map((alternative) => {
    const tokens = alternative.trim().split(/\s+/).filter((t) => t.length > 0);
    if (tokens.length === 0) {
      throw new SemVerError({
        code: 'SEMVER_RANGE_INVALID',
        message: `Range "${range}" has an empty alternative around "||".`,
        hint: 'Each side of "||" must be a comparator set.',
      });
    }
    return tokens.flatMap(expand);
  });

  return alternatives.some((bounds) => bounds.every((b) => satisfiesBound(v, b)));
}

/**
 * True if `s` is a bare version rather than a range.
 *
 * The gate accepts a bare version as an exact-match range for backward
 * compatibility with packs written before ranges existed, and ADVISES on it —
 * `engineVersion: '2.0.0'` sitting unread against a 3.8.0 engine is exactly how
 * C0's version skew stayed invisible (REPORT §5, item 2).
 */
export function isBareVersion(s: string): boolean {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  if (t.length === 0) return false;
  if (/[<>=^~*|]/.test(t) || t.includes(' ')) return false;
  try {
    parseVersion(t);
    return true;
  } catch {
    return false;
  }
}
