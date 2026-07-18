#!/usr/bin/env node
/**
 * Packaging gate (PG-5) — asserts that every publishable workspace's tarball
 * actually contains LICENSE and README.md, via `npm pack --dry-run --json`
 * (the same file list `npm publish` would ship).
 *
 * Why this exists: npm silently DROPS `files` entries that do not exist on
 * disk, so a package.json that lists "LICENSE" is not proof the tarball
 * carries one. That is exactly how G3 shipped — templates/starter declared
 * `"files": [..., "LICENSE"]` and `"license": "MIT"` but had no LICENSE file,
 * so the published artifact had none. Nothing in `verify`, ci.yml, or
 * release.yml asserted the tarball's contents. This script is that gate.
 *
 * Usage:
 *   node scripts/check-packaging.mjs             # gate the whole workspace
 *   node scripts/check-packaging.mjs --dir=<p>   # gate one package dir
 *                                                # (testability seam used by
 *                                                # scripts/gates.test.ts)
 *
 * Exit codes: 0 = every publishable package carries the required files;
 *             1 = at least one package is missing a required file (or cannot
 *                 be packed). Output names each offending package and file.
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Files every published tarball must contain. */
const REQUIRED_FILES = ['LICENSE', 'README.md'];

/** Resolve the package dirs to gate: --dir=<path> override, else workspaces. */
function packageDirs() {
  const dirArg = process.argv.find((a) => a.startsWith('--dir='));
  if (dirArg) return [dirArg.slice('--dir='.length)];

  const { workspaces = [] } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const dirs = [];
  for (const pattern of workspaces) {
    if (pattern.endsWith('/*')) {
      // The repo's workspace globs are all "<parent>/*".
      const parent = join(root, pattern.slice(0, -2));
      if (!existsSync(parent)) continue;
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (entry.isDirectory() && existsSync(join(parent, entry.name, 'package.json'))) {
          dirs.push(join(parent, entry.name));
        }
      }
    } else if (existsSync(join(root, pattern, 'package.json'))) {
      dirs.push(join(root, pattern));
    }
  }
  return dirs;
}

let checked = 0;
let skipped = 0;
const failures = [];

for (const dir of packageDirs()) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  if (pkg.private === true) {
    skipped++;
    console.log(`skip  ${pkg.name} (private)`);
    continue;
  }

  let fileSet;
  try {
    const out = execSync('npm pack --dry-run --json', {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const report = JSON.parse(out);
    // `npm pack --dry-run --json` changed shape in npm 12: it was an array
    // `[{ name, files, ... }]` through npm 11, and is now a name-keyed object
    // `{ "<pkg>": { files, ... } }`. The publish job runs `npm install -g
    // npm@latest`, so this gate must read either shape or it throws
    // "Cannot read properties of undefined (reading 'files')" under npm 12.
    const entry = Array.isArray(report) ? report[0] : Object.values(report)[0];
    fileSet = new Set(entry.files.map((f) => f.path));
  } catch (err) {
    failures.push({
      name: pkg.name ?? dir,
      missing: [`npm pack --dry-run failed: ${String(err.message ?? err).split('\n')[0]}`],
    });
    console.log(`FAIL  ${pkg.name ?? dir} — npm pack --dry-run failed`);
    continue;
  }

  checked++;
  const missing = REQUIRED_FILES.filter((f) => !fileSet.has(f));
  if (missing.length > 0) {
    failures.push({ name: pkg.name, missing });
    console.log(`FAIL  ${pkg.name} — tarball missing: ${missing.join(', ')}`);
  } else {
    console.log(`ok    ${pkg.name}`);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} package(s) would publish without required files:`);
  for (const f of failures) {
    console.error(`  - ${f.name}: ${f.missing.join(', ')}`);
  }
  console.error(
    '\nHint: npm silently drops `files` entries that do not exist on disk — a\n' +
    'package.json listing "LICENSE" is not proof the tarball contains it. Copy\n' +
    'the root LICENSE (and add a README.md) into each package directory above.',
  );
  process.exit(1);
}
console.log(`\nALL ${checked} publishable package(s) carry ${REQUIRED_FILES.join(' + ')} (${skipped} private skipped).`);
