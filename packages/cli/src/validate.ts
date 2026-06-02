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

import { loadContentFromFile } from '@ai-rpg-engine/content-schema';

/** Injectable output sink (defaults to console) so tests can capture lines. */
export interface ValidateDeps {
  log: (msg: string) => void;
  error: (msg: string) => void;
}

const defaultDeps: ValidateDeps = {
  log: (m) => console.log(m),
  error: (m) => console.error(m),
};

function printValidateHelp(log: (msg: string) => void): void {
  log('Usage: ai-rpg-engine validate <file.json>');
  log('');
  log('Loads a content pack from a JSON file and validates it.');
  log('Prints structured errors (path + message + hint) and advisories separately.');
  log('Exit code: 0 when valid, 1 when there are errors.');
  log('');
  log('Example:');
  log('  ai-rpg-engine validate ./content/zones.json');
}

/**
 * Run the validate command. Returns the process exit code (0 = valid, 1 = errors or a
 * usage problem). Pure with respect to its inputs aside from the injected logger.
 */
export function runValidate(args: string[], deps: ValidateDeps = defaultDeps): number {
  const { log, error } = deps;

  if (args.includes('--help') || args.includes('-h')) {
    printValidateHelp(log);
    return 0;
  }

  // First non-flag token is the file path.
  const file = args.find((a) => !a.startsWith('-'));
  if (!file) {
    error('✗ [VALIDATE_FILE_MISSING] Missing <file.json>.');
    error('  Hint: provide a path to a JSON content pack, e.g. ai-rpg-engine validate ./content/zones.json');
    printValidateHelp(log);
    return 1;
  }

  const result = loadContentFromFile(file);

  // --- Errors (block; nonzero exit) ---
  if (result.errors.length > 0) {
    error(`✗ Content invalid — ${result.errors.length} error${result.errors.length === 1 ? '' : 's'} in ${file}:`);
    for (const e of result.errors) {
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

  if (result.errors.length > 0) {
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
