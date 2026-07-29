// gate.ts — the load gate (C1/P2). Four checks, hard failures, diff-style reports.
//
// C0 measured what a missing gate costs: a pack stamped `engineVersion: '2.0.0'`
// passed the 3.8.0 validators clean; a pure nonsense key produced a
// BYTE-IDENTICAL load report to `districts`; and nine of eighteen module ids the
// exporter writes into every manifest do not exist in the engine, because
// manifest validation checks that `modules` is an array of strings and never
// resolves an id (docs/c0-alignment/REPORT.md §3.1, §5).
//
// Acceptance is not comprehension. RG-C1 Lane 3 settles the posture across eight
// sources: Factorio computes mod checksums and REFUSES mismatched joins, and its
// `factorio_version` is a gate rather than a comment; Minecraft's single
// dismissible `pack_format` int failed and was replaced by a supported RANGE;
// Paradox hashes only sim-affecting files; RFC 9413 (IETF 2023) states the
// general case — Postel-style tolerance ossifies, so unknown input should fail
// loudly; npm SRI and cargo both fail loudly on unresolvable ids.
//
// Every failure here is HARD and every report is a diff: what was expected, what
// arrived, and what to do about it. A gate that warns is a gate that is ignored.

import { createHash } from 'node:crypto';
import type { ContentPack } from './refs.js';
import type { ValidationError } from './validate.js';
import { satisfiesRange, isBareVersion, SemVerError } from './semver-range.js';

// --- The allowlist --------------------------------------------------------

/**
 * Every top-level key a `ContentPack` may carry. Anything else is refused.
 *
 * This list IS the contract. It is written out rather than derived from the type
 * because a type cannot be enumerated at runtime, and a gate that guesses its own
 * allowlist is the silent-pass it replaces.
 */
export const ALLOWED_PACK_KEYS = [
  'schemaVersion',
  'entities',
  'zones',
  'dialogues',
  'quests',
  'abilities',
  'statuses',
  'verbs',
  'archetypes',
  'backgrounds',
  'itemUseEffects',
  'districts',
  'buildCatalog',
  'progressionTrees',
  // Declared by C3/P1 — the space vocabulary. Each arrives here in the SAME
  // COMMIT as its `ContentPack` field and its shape guard, because a key
  // declared without a guard is C0's silent pass and a guard without a
  // declaration is a refusal nobody can fix.
  'placements',
  'encounterAnchors',
  // C3/P3 — typed hazards. Same-commit rule: declared here, on the ContentPack
  // type, and shape-guarded, together.
  'hazardDefinitions',
] as const;

/**
 * The keys whose contents can change what the simulation computes, and therefore
 * the ONLY keys the content hash covers.
 *
 * Paradox's shape: hash what affects the simulation, not the whole file, so a
 * comment or an asset path does not invalidate a pack. The exclusions are part
 * of the contract, not an implementation detail — `schemaVersion` is metadata,
 * and `buildCatalog`/`progressionTrees` are session-scoped (consumed before a
 * world exists; see `SESSION_SCOPED_KEYS` in intake.ts).
 */
export const SIM_AFFECTING_KEYS = [
  'entities',
  'zones',
  'dialogues',
  'quests',
  'abilities',
  'statuses',
  'verbs',
  'itemUseEffects',
  'districts',
  // C3/P1. Both change what the simulation computes, so both are inside the
  // hash: moving one NPC to a different zone changes who the player meets, and
  // an anchor's probability/cooldown changes what spawns. Editing either after
  // export must invalidate the pack — that is the whole job of this list.
  'placements',
  'encounterAnchors',
  // C3/P3 — a hazard changes what the simulation computes, so it is in the hash.
  'hazardDefinitions',
] as const;

// --- Report shapes --------------------------------------------------------

export type GateCheckId = 'engine-version' | 'module-ids' | 'content-hash' | 'key-allowlist';

/** One check's outcome, in diff shape: expected vs actual vs what to do. */
export type GateCheckResult = {
  check: GateCheckId;
  ok: boolean;
  /** Absent when the check was not applicable (e.g. no hash recorded). */
  skipped?: string;
  expected?: string;
  actual?: string;
  message?: string;
  hint?: string;
};

export type GateResult = {
  ok: boolean;
  checks: GateCheckResult[];
  errors: ValidationError[];
  advisories: ValidationError[];
  /** A human-readable diff report. Empty string when everything passed. */
  report: string;
};

/**
 * What the gate needs to know about the engine it is admitting a pack into.
 *
 * Two fields are optional ON PURPOSE, and their absence is REPORTED rather than
 * treated as a pass. `ai-rpg-engine validate <pack.json>` has no booted engine
 * and, because the forge writes `content-pack.json` and `manifest.json` as
 * separate files, usually no manifest either — so it can genuinely only run the
 * key allowlist. A gate that silently "passes" the three checks it never ran is
 * the failure mode this whole cycle exists to remove.
 */
export type GateContext = {
  /** The running engine's version, e.g. the `version` from package.json. */
  engineVersion: string;
  /**
   * The module ids actually REGISTERED in the booted engine —
   * `engine.moduleManager.getModules().map(m => m.id)`.
   *
   * Resolution happens against reality, not against a static catalog. C0's
   * phantom nine exist precisely because `DEFAULT_MODULES` was a hand-maintained
   * list with a comment asking a human to keep it in sync. A list cannot drift
   * if there is no list; and this also accepts a pack that ships its OWN module
   * (starter-merchant's `contract-core`), which a static engine catalog would
   * wrongly refuse.
   *
   * Omit when no engine is booted — the module check then reports itself
   * unverified instead of passing or failing on nothing.
   */
  registeredModuleIds?: readonly string[];
  /** The manifest the pack claims. Omit when the caller has no manifest to check. */
  manifest?: { engineVersion?: unknown; modules?: unknown; contentHash?: unknown };
};

// --- Canonical hashing ----------------------------------------------------

/**
 * Deterministic JSON: object keys sorted at every depth, array order preserved.
 *
 * Array order is content, not formatting — reordering zones can change which
 * zone a fallback picks — so it is inside the hash on purpose.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const obj = value as Record<string, unknown>;
  // ⚠ `undefined`-valued keys are SKIPPED, matching JSON.stringify. Without this
  // the hash is useless for the only job it has: an in-memory `{ label:
  // undefined }` hashed as `{"label":null}`, while the same object written to
  // disk and read back hashed as `{}` — so the exporter's hash could never match
  // the loader's. Found by the cross-repo equivalence test, which is the reason
  // that test exists.
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',')}}`;
}

/**
 * SHA-256 over the pack's sim-affecting subset. Absent keys are omitted (not
 * hashed as `undefined`), so adding an empty `quests: []` does change the hash —
 * an empty declaration is a claim, and the gate treats it as one.
 */
export function computeContentHash(pack: ContentPack): string {
  const raw = pack as unknown as Record<string, unknown>;
  const subset: Record<string, unknown> = {};
  for (const key of SIM_AFFECTING_KEYS) {
    if (raw[key] !== undefined) subset[key] = raw[key];
  }
  return `sha256:${createHash('sha256').update(canonicalize(subset)).digest('hex')}`;
}

// --- Suggestion (a courtesy, never a fallback) ----------------------------

/**
 * Closest registered id to an unknown one, by shared stem then edit distance.
 *
 * ⚠ STATED CEILING, because the alternative is a hardcoded alias table that
 * would rot: this recovers `rumor-core → rumor-propagation` (shared `rumor`
 * stem) and does NOT recover `movement-core → traversal-core` or
 * `npc-ai-core → cognition-core`, which share no surface at all. Those two are
 * fixed at the source in world-forge rather than guessed at here. A suggestion
 * is a courtesy; the refusal is the contract.
 */
export function suggestModuleId(unknown: string, candidates: readonly string[]): string | undefined {
  if (candidates.length === 0) return undefined;
  const stem = unknown.split('-')[0];
  const stemMatches = candidates.filter((c) => c.split('-')[0] === stem);
  const pool = stemMatches.length > 0 ? stemMatches : candidates;

  let best: string | undefined;
  let bestScore = Infinity;
  for (const c of pool) {
    const d = editDistance(unknown, c);
    if (d < bestScore) {
      bestScore = d;
      best = c;
    }
  }
  // A suggestion only helps if it is actually close. Past a third of the length
  // it is noise, and noise in an error message is worse than silence.
  if (stemMatches.length === 0 && bestScore > Math.ceil(unknown.length / 3)) return undefined;
  return best;
}

/** Iterative Levenshtein over two rows — O(n·m) time, O(m) space, no recursion. */
function editDistance(a: string, b: string): number {
  const m = b.length;
  let prev = Array.from({ length: m + 1 }, (_, i) => i);
  let curr = new Array<number>(m + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}

// --- The four checks ------------------------------------------------------

function checkKeyAllowlist(pack: ContentPack): GateCheckResult {
  const raw = pack as unknown as Record<string, unknown>;
  const unknown = Object.keys(raw).filter((k) => !(ALLOWED_PACK_KEYS as readonly string[]).includes(k));
  if (unknown.length === 0) return { check: 'key-allowlist', ok: true };
  return {
    check: 'key-allowlist',
    ok: false,
    expected: `only these top-level keys: ${ALLOWED_PACK_KEYS.join(', ')}`,
    actual: `unknown key${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`,
    message: `Content pack carries ${unknown.length} key${unknown.length > 1 ? 's' : ''} the engine does not declare.`,
    hint:
      'Remove the key, or add it to the engine\'s ContentPack type AND to ALLOWED_PACK_KEYS. ' +
      'Silently preserving unknown keys is what made a typo indistinguishable from real content (C0 REPORT §3.1).',
  };
}

function checkEngineVersion(ctx: GateContext): GateCheckResult {
  if (ctx.manifest === undefined) {
    return { check: 'engine-version', ok: true, skipped: 'no manifest supplied to check against' };
  }
  const claimed = ctx.manifest.engineVersion;
  if (claimed === undefined) {
    return {
      check: 'engine-version',
      ok: false,
      expected: `a semver range satisfied by ${ctx.engineVersion}`,
      actual: 'no engineVersion in the manifest',
      message: 'Content pack does not declare which engine versions it supports.',
      hint: `Set manifest.engineVersion to a range, e.g. ">=${ctx.engineVersion} <4.0.0".`,
    };
  }
  if (typeof claimed !== 'string') {
    return {
      check: 'engine-version',
      ok: false,
      expected: 'a semver range string',
      actual: `${typeof claimed}`,
      message: 'manifest.engineVersion must be a string.',
      hint: 'Write a range like ">=3.8.0 <4.0.0".',
    };
  }

  try {
    if (satisfiesRange(ctx.engineVersion, claimed)) return { check: 'engine-version', ok: true };
    return {
      check: 'engine-version',
      ok: false,
      expected: `a range satisfied by engine ${ctx.engineVersion}`,
      actual: `engineVersion: "${claimed}"`,
      message: `This pack targets "${claimed}"; the running engine is ${ctx.engineVersion}.`,
      hint:
        `Re-export the pack against ${ctx.engineVersion}, or widen the range if it is genuinely compatible. ` +
        'A version claim nothing checks is how eight minor releases of drift went unnoticed (C0 REPORT §5).',
    };
  } catch (err) {
    const e = err as SemVerError;
    return {
      check: 'engine-version',
      ok: false,
      expected: 'a parseable semver range',
      actual: `engineVersion: "${claimed}"`,
      message: e.message,
      hint: e.hint,
    };
  }
}

function checkModuleIds(ctx: GateContext): GateCheckResult {
  if (ctx.manifest === undefined) {
    return { check: 'module-ids', ok: true, skipped: 'no manifest supplied to check against' };
  }
  if (ctx.registeredModuleIds === undefined) {
    // The check resolves against a BOOTED engine's ModuleManager. Without one
    // there is nothing to resolve against, and saying so beats inventing a
    // static catalog that would drift exactly the way DEFAULT_MODULES did.
    return { check: 'module-ids', ok: true, skipped: 'requires a booted engine to resolve ids against' };
  }
  const modules = ctx.manifest.modules;
  if (modules === undefined) return { check: 'module-ids', ok: true, skipped: 'manifest declares no modules' };
  if (!Array.isArray(modules)) {
    return {
      check: 'module-ids',
      ok: false,
      expected: 'an array of module id strings',
      actual: typeof modules,
      message: 'manifest.modules must be an array.',
      hint: 'Set manifest.modules to the ids this pack activates (an empty array is valid).',
    };
  }

  const registered: readonly string[] = ctx.registeredModuleIds;
  const unresolved: string[] = [];
  for (const id of modules) {
    if (typeof id !== 'string') {
      return {
        check: 'module-ids',
        ok: false,
        expected: 'only strings in manifest.modules',
        actual: `found ${typeof id}`,
        message: 'manifest.modules must contain only module id strings.',
        hint: 'Each entry is an id like "combat-core".',
      };
    }
    if (!registered.includes(id)) unresolved.push(id);
  }
  if (unresolved.length === 0) return { check: 'module-ids', ok: true };

  const lines = unresolved.map((id) => {
    const s = suggestModuleId(id, registered);
    return s ? `  ${id}  — did you mean "${s}"?` : `  ${id}`;
  });
  return {
    check: 'module-ids',
    ok: false,
    expected: `module ids registered in this engine: ${[...registered].sort().join(', ')}`,
    actual: `${unresolved.length} unresolved:\n${lines.join('\n')}`,
    message: `manifest.modules names ${unresolved.length} module id${unresolved.length > 1 ? 's' : ''} this engine did not register.`,
    hint:
      'Fix the manifest, or register the module in the pack\'s createGame. Manifest validation used to check only ' +
      'that modules was an array of strings, which is how nine phantom ids rode along in every export (C0 REPORT §5).',
  };
}

function checkContentHash(pack: ContentPack, ctx: GateContext): GateCheckResult {
  if (ctx.manifest === undefined) {
    return { check: 'content-hash', ok: true, skipped: 'no manifest supplied to check against' };
  }
  const claimed = ctx.manifest.contentHash;
  if (claimed === undefined) {
    // Not a failure: packs predating the hash are legitimate. It IS reported, so
    // "no hash" never reads as "hash verified".
    return { check: 'content-hash', ok: true, skipped: 'manifest records no contentHash' };
  }
  if (typeof claimed !== 'string') {
    return {
      check: 'content-hash',
      ok: false,
      expected: 'a "sha256:..." string',
      actual: typeof claimed,
      message: 'manifest.contentHash must be a string.',
      hint: 'Let the exporter compute it; do not hand-write this field.',
    };
  }
  const actual = computeContentHash(pack);
  if (actual === claimed) return { check: 'content-hash', ok: true };
  return {
    check: 'content-hash',
    ok: false,
    expected: claimed,
    actual,
    message: 'Content hash mismatch — the pack does not match the hash its manifest records.',
    hint:
      `The hash covers ${SIM_AFFECTING_KEYS.join(', ')}. Either the content was edited after export, or the ` +
      'manifest is stale. Re-export rather than updating the hash by hand.',
  };
}

// --- The gate -------------------------------------------------------------

/**
 * Run all four checks and produce a diff-style report.
 *
 * Every check runs even after one fails: an author fixing a version range should
 * find out about the phantom module id in the same pass, not on the next one.
 */
export function runLoadGate(pack: ContentPack, ctx: GateContext): GateResult {
  const checks: GateCheckResult[] = [
    checkEngineVersion(ctx),
    checkModuleIds(ctx),
    checkContentHash(pack, ctx),
    checkKeyAllowlist(pack),
  ];

  const errors: ValidationError[] = [];
  const advisories: ValidationError[] = [];

  for (const c of checks) {
    if (!c.ok) {
      errors.push({ path: `gate.${c.check}`, message: `${c.message ?? 'check failed'} ${c.hint ?? ''}`.trim() });
    } else if (c.skipped) {
      advisories.push({ path: `gate.${c.check}`, message: `not verified — ${c.skipped}.` });
    }
  }

  // A bare version is accepted as an exact-match range and CALLED OUT. C0's skew
  // hid behind exactly this: `engineVersion: '2.0.0'` that nothing read.
  const claimedVersion = ctx.manifest?.engineVersion;
  if (typeof claimedVersion === 'string' && isBareVersion(claimedVersion)) {
    advisories.push({
      path: 'gate.engine-version',
      message:
        `engineVersion "${claimedVersion}" is a bare version, treated as an exact match. ` +
        'Prefer an explicit range (">=3.8.0 <4.0.0") so compatibility is a claim the gate can check.',
    });
  }

  const ok = checks.every((c) => c.ok);
  return { ok, checks, errors, advisories, report: ok ? '' : formatGateReport(checks) };
}

/** The diff-style report. Failures first, each as expected / actual / fix. */
export function formatGateReport(checks: readonly GateCheckResult[]): string {
  const failed = checks.filter((c) => !c.ok);
  if (failed.length === 0) return '';

  const lines: string[] = [
    `Content pack REFUSED — ${failed.length} of ${checks.length} load-gate checks failed.`,
    '',
  ];
  for (const c of failed) {
    lines.push(`✗ ${c.check}`);
    if (c.message) lines.push(`  ${c.message}`);
    if (c.expected !== undefined) lines.push(`  expected: ${c.expected}`);
    if (c.actual !== undefined) lines.push(`  actual:   ${c.actual}`);
    if (c.hint) lines.push(`  fix:      ${c.hint}`);
    lines.push('');
  }
  // Verified and unverified are listed SEPARATELY. Printing "✓ passed:
  // engine-version (not verified)" puts a tick next to a check that never ran,
  // which is the same class of claim as losslessPercent: 100 computed from zero
  // observations (C0 REPORT §1). A check that did not run has no verdict.
  const passed = checks.filter((c) => c.ok && !c.skipped);
  const unverified = checks.filter((c) => c.ok && c.skipped);
  if (passed.length > 0) lines.push(`✓ passed: ${passed.map((c) => c.check).join(', ')}`);
  for (const c of unverified) lines.push(`⚠ NOT VERIFIED — ${c.check}: ${c.skipped}`);
  return lines.join('\n');
}
