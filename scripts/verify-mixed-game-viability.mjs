#!/usr/bin/env node
/**
 * verify-mixed-game-viability.mjs
 *
 * CI runner for docs/mixed-game-viability-proof.ts.
 *
 * That file's own header labels it a "Release Gate" / "architecture test"
 * proving four distinct archetypes (interceptor, caster, skirmisher,
 * commander) coexist in one game on one stat model, one combat stack, one
 * world, and one set of encounters. Until this script existed, nothing in
 * CI invoked the file — the "Release Gate" label was aspirational, not
 * enforced (dogfood-swarm finding F-48b8595d). This script is the fix: wire
 * the file into CI so the label is true.
 *
 * The proof has no assertion-library calls. Per its own "PROOF ASSERTIONS"
 * section, the Engine constructor throws if any module has unresolvable
 * dependencies or conflicting registrations — so "type-checks under the
 * repo's strict settings, then runs top-to-bottom without throwing" IS the
 * pass condition the file's header already documents. There is nothing to
 * assert on top of that; a thrown exception (non-zero exit) or a compile
 * error IS the failure signal.
 *
 * Compiles via scripts/mixed-game-viability-proof.tsconfig.json, which
 * `extends` the repo's root tsconfig.json — so this can never silently drift
 * from the real compiler settings (strict, Node16/Node16, ES2022) the way a
 * hand-copied set of CLI flags could. Must run AFTER `npm run build`: the
 * proof imports the workspace packages by name (@ai-rpg-engine/core, etc.),
 * resolved through the npm workspace symlinks to their built dist/ output —
 * the same resolution path a real consumer gets, not source.
 *
 * Wired into ci.yml as a single step on the node 22 leg (see "Release gate
 * — mixed-game viability proof"), matching the existing doc-examples
 * typecheck/behavior-test steps this file sits next to.
 *
 * Usage: node scripts/verify-mixed-game-viability.mjs
 * Exit 0 = proof holds. Exit 1 = compile error or a thrown exception — a
 * real architecture regression (an archetype no longer wires without engine
 * changes), not a flaky test.
 */

import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPTS_DIR, '..');
const BUILD_DIR = join(SCRIPTS_DIR, '.viability-proof-build');
const PROOF_JS = join(BUILD_DIR, 'mixed-game-viability-proof.js');

// NOTE: cleanup must run via `finally` below and the process must exit
// naturally via `process.exitCode` (never `process.exit()` from inside a
// catch) — `process.exit()` terminates immediately and skips any enclosing
// `finally`, which would leak BUILD_DIR into the working tree on every
// failure, exactly the case where a clean retry matters most.
function main() {
  console.log('=== Mixed-Game Viability Proof (Release Gate) ===\n');

  // Clean up a leftover build dir from a prior crashed run before we start.
  rmSync(BUILD_DIR, { recursive: true, force: true });

  try {
    console.log('[1/2] Compiling docs/mixed-game-viability-proof.ts (strict, via root tsconfig)...');
    execSync('npx tsc -p scripts/mixed-game-viability-proof.tsconfig.json', { cwd: ROOT, stdio: 'inherit' });

    console.log('[2/2] Running the proof (wiring all 4 archetypes + 6 encounter zones)...');
    execSync(`node "${PROOF_JS}"`, { cwd: ROOT, stdio: 'inherit' });

    console.log('\nRelease gate PASS: 4 archetypes / 6 encounter modes wired with zero hacks.');
  } finally {
    // Always clean up, pass or fail — this directory must never be committed.
    rmSync(BUILD_DIR, { recursive: true, force: true });
  }
}

try {
  main();
} catch {
  console.error('\nRelease gate FAILED (see output above).');
  process.exitCode = 1;
}
