// profile — validate a profile / profile-set JSON, or scaffold a starter profile.
//
// `ai-rpg-engine profile validate <file.json>` loads one or more Profiles from a JSON
// file and runs them through the modules package's REAL validators:
//   - buildProfile       — per-profile packaging warnings (warn-and-degrade; NEVER
//                          affects the exit code, mirroring the library's semantics)
//   - validateProfileSet — cross-profile ERRORS (block, exit 1: duplicate ability ids,
//                          conflicting resource caps) + advisories (never block:
//                          stat-name drift, contradictory pack biases)
//
// Accepted file shapes (all three normalize to a Profile[]):
//   1. a single Profile object      { "id": "...", "statMapping": {...}, ... }
//   2. an array of Profiles         [ {...}, {...} ]
//   3. a profile-set object         { "profiles": [ {...}, ... ] }
//
// `ai-rpg-engine profile scaffold <name>` writes a minimal profile stub. "Valid" is
// the load-bearing contract (same as scaffold.ts): the stub passes
// `ai-rpg-engine profile validate` with zero errors AND zero warnings out of the box.
//
// Structured errors carry a [CODE], a message, and a Hint line — the shape validate.ts
// and scaffold.ts already pin. Determinism: output is a pure function of the inputs
// (no clock/RNG/network; JSON.stringify with fixed 2-space indent for the stub).
// runProfile RETURNS the exit code and accepts an injected logger so it is
// unit-testable without spawning a process; bin.ts converts the code to process.exit.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildProfile, validateProfileSet, type Profile } from '@ai-rpg-engine/modules';

/** Injectable output sink (defaults to console) so tests can capture lines. */
export interface ProfileCliDeps {
  log: (msg: string) => void;
  error: (msg: string) => void;
}

const defaultDeps: ProfileCliDeps = {
  log: (m) => console.log(m),
  error: (m) => console.error(m),
};

function printProfileHelp(log: (msg: string) => void): void {
  log('Usage: ai-rpg-engine profile <subcommand>');
  log('');
  log('Subcommands:');
  log('  profile validate <file.json>                     Validate a profile or profile-set JSON');
  log('  profile scaffold <name> [--force] [--out=<file>] Write a starter profile template');
  log('');
  log('validate accepts a single profile object, an array of profiles, or');
  log('{ "profiles": [...] }. Cross-profile ERRORS (duplicate ability ids, conflicting');
  log('resource caps) block with exit code 1. Per-profile build warnings and');
  log('cross-profile advisories are printed separately and never affect the exit code.');
  log('');
  log('scaffold writes <name>.profile.json (override with --out=<file>); the stub');
  log('passes "ai-rpg-engine profile validate" out of the box.');
  log('');
  log('Examples:');
  log('  ai-rpg-engine profile scaffold storm-mystic');
  log('  ai-rpg-engine profile validate storm-mystic.profile.json');
}

/**
 * Run the profile command. Returns the process exit code (0 = success, 1 = errors or
 * a usage problem). Pure with respect to its inputs aside from the injected logger
 * and (for scaffold) the file write.
 */
export function runProfile(args: string[], deps: ProfileCliDeps = defaultDeps): number {
  const { log, error } = deps;

  // A help flag anywhere routes to the profile command's own help (CLI-011 semantics:
  // bin.ts defers to us because `profile` owns a distinct help screen).
  if (args.includes('--help') || args.includes('-h')) {
    printProfileHelp(log);
    return 0;
  }

  const sub = args[0];
  if (!sub) {
    error('✗ [PROFILE_SUBCOMMAND_MISSING] Missing subcommand.');
    error('  Hint: use "profile validate <file.json>" or "profile scaffold <name>".');
    printProfileHelp(log);
    return 1;
  }

  switch (sub) {
    case 'validate':
      return runProfileValidate(args.slice(1), deps);
    case 'scaffold':
      return runProfileScaffold(args.slice(1), deps);
    default:
      error(`✗ [PROFILE_SUBCOMMAND_UNKNOWN] Unknown profile subcommand "${sub}".`);
      error('  Hint: use "profile validate <file.json>" or "profile scaffold <name>".');
      printProfileHelp(log);
      return 1;
  }
}

// ---------------------------------------------------------------------------
// profile validate
// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Structural boundary check for one candidate profile. buildProfile assumes the
 * top-level Profile shape (deriveRuleset reads statMapping.attack unconditionally),
 * so a malformed file must fail HERE with a structured report, not deeper down with
 * a raw TypeError. Deep ability-shape problems are NOT checked here — buildProfile /
 * validateAbilityPack own those and degrade them to warnings.
 */
function checkProfileShape(value: unknown, label: string): string[] {
  const problems: string[] = [];

  if (!isObj(value)) {
    problems.push(
      `${label}: must be an object (got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value})`,
    );
    return problems;
  }

  if (typeof value.id !== 'string' || value.id.length === 0) {
    problems.push(`${label}.id: must be a non-empty string`);
  }
  if (typeof value.name !== 'string' || value.name.length === 0) {
    problems.push(`${label}.name: must be a non-empty string`);
  }

  const sm = value.statMapping;
  if (!isObj(sm)) {
    problems.push(`${label}.statMapping: must be an object mapping attack/precision/resolve to stat names`);
  } else {
    for (const role of ['attack', 'precision', 'resolve'] as const) {
      const stat = sm[role];
      if (typeof stat !== 'string' || stat.length === 0) {
        problems.push(`${label}.statMapping.${role}: must be a non-empty stat name`);
      }
    }
  }

  if (!Array.isArray(value.abilities)) {
    problems.push(`${label}.abilities: must be an array of ability definitions (use [] for none yet)`);
  }

  return problems;
}

function runProfileValidate(args: string[], deps: ProfileCliDeps): number {
  const { log, error } = deps;

  // First non-flag token is the file path (same convention as runValidate).
  const file = args.find((a) => !a.startsWith('-'));
  if (!file) {
    error('✗ [PROFILE_FILE_MISSING] Missing <file.json>.');
    error('  Hint: provide a path to a profile or profile-set JSON, e.g. ai-rpg-engine profile validate ./mystic.profile.json');
    printProfileHelp(log);
    return 1;
  }

  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (err) {
    error(`✗ [PROFILE_READ_FAILED] Cannot read "${file}": ${(err as Error).message}`);
    error('  Hint: check that the path exists and is readable.');
    return 1;
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    error(`✗ [PROFILE_JSON_INVALID] "${file}" is not valid JSON: ${(err as Error).message}`);
    error('  Hint: fix the JSON syntax — a linter or editor can pinpoint the offending character.');
    return 1;
  }

  // Normalize the three accepted shapes to a candidate list.
  let candidates: unknown[];
  if (Array.isArray(data)) {
    candidates = data;
  } else if (isObj(data) && Array.isArray(data.profiles)) {
    candidates = data.profiles;
  } else if (isObj(data)) {
    candidates = [data];
  } else {
    error(`✗ [PROFILE_SHAPE_INVALID] "${file}" must contain a profile object, an array of profiles, or { "profiles": [...] } (got ${data === null ? 'null' : typeof data}).`);
    error('  Hint: start from a valid stub with: ai-rpg-engine profile scaffold <name>');
    return 1;
  }

  if (candidates.length === 0) {
    error(`✗ [PROFILE_SHAPE_INVALID] "${file}" contains no profiles.`);
    error('  Hint: add at least one profile object, or start from: ai-rpg-engine profile scaffold <name>');
    return 1;
  }

  // Structural boundary pass — every candidate is checked so the author sees ALL
  // shape problems at once (mirrors the validators' report-everything discipline).
  const shapeProblems: string[] = [];
  candidates.forEach((candidate, i) => {
    const id = isObj(candidate) && typeof candidate.id === 'string' && candidate.id.length > 0
      ? candidate.id
      : `#${i}`;
    shapeProblems.push(...checkProfileShape(candidate, `Profile[${id}]`));
  });
  if (shapeProblems.length > 0) {
    error(`✗ [PROFILE_SHAPE_INVALID] "${file}" is not a valid profile file — ${shapeProblems.length} problem${shapeProblems.length === 1 ? '' : 's'}:`);
    for (const p of shapeProblems) {
      error(`  ✗ ${p}`);
    }
    error('  Hint: a profile needs id, name, statMapping { attack, precision, resolve }, and an abilities array.');
    error('  Compare against a fresh stub: ai-rpg-engine profile scaffold <name>');
    return 1;
  }

  // Boundary cast after the structural pass above. Deep ability shapes are re-checked
  // by buildProfile/validateAbilityPack below, which degrade problems to warnings.
  const profiles = candidates as Profile[];

  // Per-profile packaging warnings (warn-and-degrade — never affect the exit code).
  const warnings: string[] = [];
  for (const profile of profiles) {
    for (const w of buildProfile(profile).warnings) {
      warnings.push(`[${profile.id}] ${w}`);
    }
  }

  // Cross-profile validation — the pass/fail bit.
  const result = validateProfileSet(profiles);

  // --- Errors (block; nonzero exit) ---
  if (result.errors.length > 0) {
    error(`✗ Profile set invalid — ${result.errors.length} error${result.errors.length === 1 ? '' : 's'} in ${file}:`);
    for (const e of result.errors) {
      // The validator embeds the actionable hint inside `message`, so
      // `<path>: <message>` already carries path + message + hint.
      error(`  ✗ ${e.path}: ${e.message}`);
    }
  }

  // --- Warnings (do NOT block; printed separately, always) ---
  if (warnings.length > 0) {
    log('');
    log(`⚠ ${warnings.length} build warning${warnings.length === 1 ? '' : 's'} (not blocking):`);
    for (const w of warnings) {
      log(`  ⚠ ${w}`);
    }
  }

  // --- Advisories (do NOT block; printed separately, always) ---
  if (result.advisories.length > 0) {
    log('');
    log(`⚠ ${result.advisories.length} advisor${result.advisories.length === 1 ? 'y' : 'ies'} (not blocking):`);
    for (const a of result.advisories) {
      log(`  ⚠ ${a.path}: ${a.message}`);
    }
  }

  if (result.errors.length > 0) {
    return 1;
  }

  const ids = profiles.map((p) => p.id).join(', ');
  log(`✓ Profile set valid: ${file}`);
  log(`  ${profiles.length} profile${profiles.length === 1 ? '' : 's'}: ${ids}`);
  if (warnings.length > 0 || result.advisories.length > 0) {
    log('  (non-blocking notes above — review when convenient.)');
  }
  return 0;
}

// ---------------------------------------------------------------------------
// profile scaffold
// ---------------------------------------------------------------------------

/**
 * Turn a hyphenated id into a human Title Case display name, e.g.
 * "storm-mystic" → "Storm Mystic". Used only for display-name fields of the stub.
 */
function titleCase(s: string): string {
  return s
    .split('-')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Build the starter profile stub for one name. The MINIMAL shape that passes
 * `profile validate` with zero errors and zero warnings:
 *  - three distinct stat names (no cross-profile drift when combined later)
 *  - one ability with a nonzero cooldown (dodges the zero-cost-zero-cooldown advisory)
 *    in the same proven-valid shape scaffold.ts uses for ability stubs
 *  - one KNOWN role tag (role:skirmisher — passes the tag-taxonomy lint) showing
 *    the author where archetype tags go
 * Deterministic: a pure function of `name`.
 */
export function buildProfileStub(name: string): Record<string, unknown> {
  const display = titleCase(name);
  return {
    id: name,
    name: display,
    statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
    abilities: [
      {
        id: `${name}-signature`,
        name: `${display} Signature`,
        verb: 'cast',
        tags: ['ability'],
        target: { type: 'self' },
        effects: [
          { type: 'log', params: { message: `${display} Signature resolves.` } },
        ],
        cooldown: 1,
      },
    ],
    tags: ['role:skirmisher'],
  };
}

function runProfileScaffold(args: string[], deps: ProfileCliDeps): number {
  const { log, error } = deps;

  const force = args.includes('--force');

  // First positional (non-flag token) is the profile name.
  const positionals = args.filter((a) => !a.startsWith('-'));
  const name = positionals[0];

  // --out=<file> (same empty-value guard as create-starter/scaffold, CLI-012): a
  // present-but-empty value is a likely shell mishap and must fail loudly rather
  // than defaulting silently.
  const outToken = args.find((a) => a === '--out' || a.startsWith('--out='));
  let outFile: string | undefined;
  if (outToken !== undefined) {
    const eq = outToken.indexOf('=');
    const rawValue = eq === -1 ? '' : outToken.slice(eq + 1);
    if (rawValue.trim().length === 0) {
      error('✗ [CLI_OUT_EMPTY] --out was given but its value is empty.');
      error('  Hint: pass a target file, e.g. --out=./profiles/mystic.profile.json — or omit --out to write <name>.profile.json.');
      return 1;
    }
    outFile = path.resolve(rawValue);
  }

  if (!name) {
    error('✗ [PROFILE_NAME_MISSING] Missing <name>.');
    error('  Hint: provide a lowercase, hyphen-separated id, e.g. "storm-mystic".');
    printProfileHelp(log);
    return 1;
  }

  // The same name rule create-starter and scaffold enforce (CLI-003): lowercase
  // alphanumeric segments separated by single hyphens, no leading digit.
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
    error(`✗ [PROFILE_NAME_INVALID] Invalid profile name "${name}".`);
    error('  Hint: use lowercase letters and numbers in hyphen-separated segments (e.g. "storm-mystic"). No leading, trailing, or consecutive hyphens, and no leading digit.');
    return 1;
  }

  // Default target is <name>.profile.json — self-describing, and it cannot collide
  // with `scaffold <kind> <name>`'s default <name>.json content stub.
  const target = outFile ?? path.resolve(`${name}.profile.json`);

  // Safe-write: refuse to clobber an existing file unless --force (mirrors scaffold).
  if (fs.existsSync(target) && !force) {
    error(`✗ [PROFILE_FILE_EXISTS] File already exists: ${target}`);
    error('  Hint: use --force to overwrite.');
    return 1;
  }

  const stub = buildProfileStub(name);
  // Fixed 2-space indent + trailing newline → deterministic, diff-friendly bytes.
  const json = JSON.stringify(stub, null, 2) + '\n';

  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, json, 'utf-8');
  } catch (err) {
    error(`✗ [PROFILE_WRITE_FAILED] Cannot write "${target}": ${(err as Error).message}`);
    error('  Hint: check that the target directory is writable.');
    return 1;
  }

  const rel = path.relative(process.cwd(), target);
  log(`✓ Scaffolded profile "${name}" → ${rel}`);
  log('');
  log('Next steps:');
  log(`  1. Edit ${rel} — set the stat mapping and add this archetype's abilities.`);
  log(`  2. ai-rpg-engine profile validate ${rel}`);
  return 0;
}
