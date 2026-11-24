// validate — load + validate a content pack from a JSON file and print a structured report.
//
// `ai-rpg-engine validate <file.json>` is the command the package metadata advertises
// ("run, validate, replay, inspect, scaffold"). It delegates the actual loading + checking
// to content-schema's loadContentFromFile (which guards file-read and JSON-parse at the
// boundary and runs loadContent + validateGameContent), then renders the result:
//
//   - ERRORS are printed with their structured shape: `✗ <path>: <message>`. The message
//     carries the actionable hint (the validators embed "— do X" guidance inline).
//   - ADVISORIES are printed in a separate, clearly-labelled section. They never affect
//     the exit code (likely-mistake signals, not failures).
//   - Exit code is 0 when there are no errors, 1 otherwise.
//
// Determinism: output is a pure function of the file contents (no clock/RNG/network).
// runValidate RETURNS the exit code and accepts an injected logger so it is unit-testable
// without spawning a process; bin.ts converts the returned code into process.exit.

import * as fs from 'node:fs';
import {
  checkUnresolvedAiProfiles,
  loadContentFromFile,
  runLoadGate,
  sanitizeDiagnosticText,
  type GateContext,
} from '@ai-rpg-engine/content-schema';
import { BUILTIN_INTENT_PROFILES } from '@ai-rpg-engine/modules';
import { ENGINE_VERSION } from './engine-version.js';

/** Injectable output sink (defaults to console) so tests can capture lines. */
export interface ValidateDeps {
  log: (msg: string) => void;
  error: (msg: string) => void;
}

const defaultDeps: ValidateDeps = {
  log: (m) => console.log(m),
  error: (m) => console.error(m),
};

/** One value-flag: space form (`--flag value`) or equals form (`--flag=value`).
 *  Same shape as sidecar-command `readFlag` — `indexOf(flag)` alone dropped
 *  `--manifest=…` with no VALIDATE_MANIFEST_* error (F-5c018d2c). */
function readFlag(args: string[], flag: string): {
  present: boolean;
  raw: string | undefined;
  valueSlot: number;
} {
  const eq = `${flag}=`;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === flag) return { present: true, raw: args[i + 1], valueSlot: i + 1 };
    if (arg.startsWith(eq)) return { present: true, raw: arg.slice(eq.length), valueSlot: -1 };
  }
  return { present: false, raw: undefined, valueSlot: -1 };
}

function printValidateHelp(log: (msg: string) => void): void {
  log('Usage: ai-rpg-engine validate <file.json> [--manifest <manifest.json>] [--unresolved-ai-profile fail|warn] [--no-gate]');
  log('');
  log('Loads a content pack from a JSON file, validates it, and runs the load gate.');
  log('Prints structured errors (path + message + hint) and advisories separately.');
  log('Exit code: 0 when valid, 1 when there are errors.');
  log('');
  log('The load gate refuses a pack that carries unknown top-level keys, targets a');
  log('different engine version, names modules this engine did not register, does');
  log('not match the content hash its manifest records, or (under default fail');
  log('policy) names an aiProfile / entityAi profileId outside the built-in intent');
  log('profiles (matching `sidecar --content`). Checks it cannot run — module');
  log('resolution needs a booted engine — are reported as unverified, never as passed.');
  log('');
  log('Options:');
  log('  --manifest <path>              also check engineVersion and contentHash from a manifest.json');
  log('                                 (--manifest=<path> is accepted too)');
  log('  --unresolved-ai-profile fail|warn');
  log('                                 policy for unresolved aiProfile / entityAi profileIds');
  log('                                 (default: fail; warn emits stderr lines and exits 0)');
  log('  --no-gate                      structural validation only (pre-C1 behaviour)');
  log('  --json                         print one JSON object {ok, errors, advisories, checks, ...}');
  log('');
  log('Example:');
  log('  ai-rpg-engine validate ./content/content-pack.json --manifest ./content/manifest.json');
}

function wantsJsonFlag(args: string[]): boolean {
  return args.includes('--json') || args.some((a) => a.startsWith('--json='));
}

/**
 * Run the validate command. Returns the process exit code (0 = valid, 1 = errors or a
 * usage problem). Pure with respect to its inputs aside from the injected logger.
 */
export function runValidate(args: string[], deps: ValidateDeps = defaultDeps): number {
  const json = wantsJsonFlag(args);
  const log = json ? deps.log : (msg: string) => deps.log(sanitizeDiagnosticText(msg, 1024));
  const error = (msg: string) => deps.error(sanitizeDiagnosticText(msg, 1024));

  if (args.includes('--help') || args.includes('-h')) {
    printValidateHelp(log);
    return 0;
  }

  // --manifest takes a value (space form AND equals form), so it must not be
  // mistaken for the pack path. Present-but-empty `--manifest=` is a missing
  // path, not an absent flag — otherwise engine-version/content-hash skip as
  // 'not verified' and a structurally valid pack still prints ✓ Content valid.
  const manifest = readFlag(args, '--manifest');
  const manifestPath = manifest.raw;
  if (manifest.present && (manifestPath === undefined || manifestPath === '' || manifestPath.startsWith('-'))) {
    if (json) {
      log(JSON.stringify({
        ok: false,
        errors: [{ path: 'args', message: '[VALIDATE_MANIFEST_MISSING] --manifest needs a path.' }],
        advisories: [],
      }));
      return 1;
    }
    error('✗ [VALIDATE_MANIFEST_MISSING] --manifest needs a path.');
    error('  Hint: ai-rpg-engine validate ./content-pack.json --manifest ./manifest.json');
    return 1;
  }

  const unresolvedAiProfileFlag = readFlag(args, '--unresolved-ai-profile');
  let unresolvedAiProfilePolicy: 'fail' | 'warn' = 'fail';
  if (unresolvedAiProfileFlag.present) {
    const rawPolicy = unresolvedAiProfileFlag.raw;
    if (rawPolicy !== 'fail' && rawPolicy !== 'warn') {
      if (json) {
        log(JSON.stringify({
          ok: false,
          errors: [{
            path: 'args',
            message: `[VALIDATE_INVALID_UNRESOLVED_AI_PROFILE] --unresolved-ai-profile must be "fail" or "warn", got "${rawPolicy ?? '(missing)'}".`,
          }],
          advisories: [],
        }));
        return 1;
      }
      error(
        `✗ [VALIDATE_INVALID_UNRESOLVED_AI_PROFILE] --unresolved-ai-profile must be "fail" or "warn", got "${rawPolicy ?? '(missing)'}".`,
      );
      error('  Hint: pass --unresolved-ai-profile fail (default) or --unresolved-ai-profile warn.');
      error('');
      printValidateHelp(error);
      return 1;
    }
    unresolvedAiProfilePolicy = rawPolicy;
  }

  // Skip space-form value slots so flag values are not mistaken for the pack path.
  const positional = args.filter(
    (a, i) => !a.startsWith('-') && i !== manifest.valueSlot && i !== unresolvedAiProfileFlag.valueSlot,
  );
  const file = positional[0];
  if (!file) {
    if (json) {
      log(JSON.stringify({
        ok: false,
        errors: [{ path: 'args', message: '[VALIDATE_FILE_MISSING] Missing <file.json>.' }],
        advisories: [],
      }));
      return 1;
    }
    error('✗ [VALIDATE_FILE_MISSING] Missing <file.json>.');
    error('  Hint: provide a path to a JSON content pack, e.g. ai-rpg-engine validate ./content/zones.json');
    printValidateHelp(log);
    return 1;
  }

  const result = loadContentFromFile(file);
  const skipGate = args.includes('--no-gate');
  const fileFailed = result.errors.some((e) => e.path === 'file');
  const profileIssues =
    skipGate || fileFailed
      ? []
      : checkUnresolvedAiProfiles(result.pack, { profiles: BUILTIN_INTENT_PROFILES });
  const profileErrors = unresolvedAiProfilePolicy === 'fail' ? profileIssues : [];
  const profileWarnings = unresolvedAiProfilePolicy === 'warn' ? profileIssues : [];

  for (const w of profileWarnings) {
    error(`⚠ [${w.code}] ${w.path}: ${w.message}`);
  }

  if (json) {
    const errors = [...result.errors, ...profileErrors];
    const advisories = [...result.advisories];
    let checks: ReturnType<typeof runLoadGate>['checks'] | undefined;
    if (!fileFailed && !skipGate) {
      const ctx: GateContext = { engineVersion: ENGINE_VERSION };
      if (manifestPath !== undefined) {
        try {
          const parsed: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            log(JSON.stringify({
              ok: false,
              errors: [...errors, { path: 'gate.manifest', message: `"${manifestPath}" is not a JSON object.` }],
              advisories,
              file,
            }));
            return 1;
          }
          ctx.manifest = parsed as GateContext['manifest'];
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          log(JSON.stringify({
            ok: false,
            errors: [...errors, { path: 'gate.manifest', message: `could not read "${manifestPath}": ${reason}` }],
            advisories,
            file,
          }));
          return 1;
        }
      }
      const gate = runLoadGate(result.pack, ctx);
      checks = gate.checks;
      errors.push(...gate.errors);
      advisories.push(...gate.advisories);
    }
    log(JSON.stringify({
      ok: errors.length === 0,
      errors,
      advisories,
      ...(profileWarnings.length > 0 ? { warnings: profileWarnings } : {}),
      ...(checks ? { checks } : {}),
      summary: result.summary,
      file,
    }));
    return errors.length === 0 ? 0 : 1;
  }

  const combinedErrors = [...result.errors, ...profileErrors];

  // --- Errors (block; nonzero exit) ---
  if (combinedErrors.length > 0) {
    error(`✗ Content invalid — ${combinedErrors.length} error${combinedErrors.length === 1 ? '' : 's'} in ${file}:`);
    for (const e of combinedErrors) {
      // The validators embed the actionable hint inside `message` (e.g. "… — fix the id"),
      // so `<path>: <message>` already carries path + message + hint.
      error(`  ✗ ${e.path}: ${e.message}`);
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

  // --- The load gate (C1/P2) ---
  // Structural validity is not loadability. C0's whole headline is that a pack
  // stamped for a two-major-old engine, carrying five keys nothing declares,
  // passed this command clean and exited 0.
  if (result.errors.length === 0 && !skipGate) {
    const ctx: GateContext = { engineVersion: ENGINE_VERSION };
    if (manifestPath !== undefined) {
      try {
        const parsed: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          error(`✗ gate.manifest: "${manifestPath}" is not a JSON object.`);
          return 1;
        }
        ctx.manifest = parsed as GateContext['manifest'];
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        error(`✗ gate.manifest: could not read "${manifestPath}": ${reason}`);
        error('  Hint: point --manifest at the manifest.json the exporter wrote next to the content pack.');
        return 1;
      }
    }

    const gate = runLoadGate(result.pack, ctx);
    if (!gate.ok) {
      error('');
      for (const line of gate.report.split('\n')) error(line);
      return 1;
    }
    if (combinedErrors.length > 0) {
      return 1;
    }
    // Unverified checks are stated, never implied to have passed.
    for (const c of gate.checks) {
      if (c.skipped) log(`  ⚠ gate.${c.check}: not verified — ${c.skipped}.`);
    }
    for (const a of gate.advisories) {
      if (!a.path.startsWith('gate.')) continue;
      log(`  ⚠ ${a.path}: ${a.message}`);
    }
  }

  if (combinedErrors.length > 0) {
    return 1;
  }

  // Clean (errors === 0). Report the positive summary from the loader.
  log(`✓ Content valid: ${file}`);
  log(`  ${result.summary}`);
  if (result.advisories.length > 0) {
    log(`  (${result.advisories.length} advisory note${result.advisories.length === 1 ? '' : 's'} above — review when convenient.)`);
  }
  return 0;
}
