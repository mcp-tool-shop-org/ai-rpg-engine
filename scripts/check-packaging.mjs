#!/usr/bin/env node
/**
 * Packaging gate (PG-5) — asserts that every publishable workspace's tarball
 * actually contains LICENSE, README.md, and every advertised entry point
 * (`main` / `types` / `bin` / `exports` import|default), via
 * `npm pack --dry-run --json` (the same file list `npm publish` would ship).
 *
 * Why this exists: npm silently DROPS `files` entries that do not exist on
 * disk, so a package.json that lists "LICENSE" or "dist" is not proof the
 * tarball carries them. That is exactly how G3 shipped — templates/starter
 * declared `"files": [..., "LICENSE"]` and `"license": "MIT"` but had no
 * LICENSE file, so the published artifact had none. The same drop applies to
 * `dist/index.js` when `files` lists `dist` but the build output is missing:
 * LICENSE+README still pack, the advertised `main` does not. This script is
 * the gate for both classes.
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

/** Per-package `npm pack` hang limit — fail closed instead of sitting on the runner. */
const PACK_TIMEOUT_MS = 60_000;

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

/** Strip `./` so package.json paths match `npm pack` file lists. */
function normalizePackPath(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const path = raw.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!path || path === '.') return null;
  return path;
}

function addAdvertised(out, raw, via) {
  const path = normalizePackPath(raw);
  if (!path) return;
  if (!out.some((e) => e.path === path && e.via === via)) {
    out.push({ path, via });
  }
}

/**
 * Walk `exports` for string targets and the `import` / `default` conditions
 * (including nested subpaths like `"."` / `"./foo"`).
 */
function walkExports(exp, via, out) {
  if (typeof exp === 'string') {
    addAdvertised(out, exp, via);
    return;
  }
  if (Array.isArray(exp)) {
    for (let i = 0; i < exp.length; i++) walkExports(exp[i], `${via}[${i}]`, out);
    return;
  }
  if (exp && typeof exp === 'object') {
    for (const [key, val] of Object.entries(exp)) {
      if (key === 'import' || key === 'default' || key.startsWith('.')) {
        const next = key.startsWith('.') ? `${via}["${key}"]` : `${via}.${key}`;
        walkExports(val, next, out);
      }
    }
  }
}

/** Advertised entry points that must actually land in the tarball. */
function advertisedEntryPoints(pkg) {
  const out = [];
  addAdvertised(out, pkg.main, 'main');
  addAdvertised(out, pkg.types, 'types');
  if (typeof pkg.bin === 'string') {
    addAdvertised(out, pkg.bin, 'bin');
  } else if (pkg.bin && typeof pkg.bin === 'object' && !Array.isArray(pkg.bin)) {
    for (const [name, p] of Object.entries(pkg.bin)) {
      addAdvertised(out, p, `bin.${name}`);
    }
  }
  walkExports(pkg.exports, 'exports', out);
  return out;
}

function inTarball(fileSet, path) {
  return fileSet.has(path) || fileSet.has(`package/${path}`);
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
      timeout: PACK_TIMEOUT_MS,
    });
    const report = JSON.parse(out);
    // `npm pack --dry-run --json` changed shape in npm 12: it was an array
    // `[{ name, files, ... }]` through npm 11, and is now a name-keyed object
    // `{ "<pkg>": { files, ... } }`. release.yml pins npm 11.x for OIDC, but
    // this gate still reads either shape so a local npm 12 CLI cannot throw
    // "Cannot read properties of undefined (reading 'files')".
    const entry = Array.isArray(report) ? report[0] : Object.values(report)[0];
    fileSet = new Set(entry.files.map((f) => String(f.path).replace(/\\/g, '/')));
  } catch (err) {
    const timedOut = err && (err.killed === true || err.code === 'ETIMEDOUT');
    const why = timedOut
      ? `npm pack --dry-run timed out after ${PACK_TIMEOUT_MS}ms`
      : `npm pack --dry-run failed: ${String(err.message ?? err).split('\n')[0]}`;
    failures.push({
      name: pkg.name ?? dir,
      missing: [why],
    });
    console.log(`FAIL  ${pkg.name ?? dir} — ${why}`);
    continue;
  }

  checked++;
  const missing = REQUIRED_FILES.filter((f) => !inTarball(fileSet, f));
  for (const { path, via } of advertisedEntryPoints(pkg)) {
    if (!inTarball(fileSet, path)) missing.push(`${path} (${via})`);
  }
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
    'package.json listing "LICENSE" or "dist" is not proof the tarball contains\n' +
    'them. Copy the root LICENSE (and add a README.md) into each package\n' +
    'directory above, and make sure advertised main/types/bin/exports paths\n' +
    'exist on disk (usually by running the package build) before packing.',
  );
  process.exit(1);
}
console.log(`\nALL ${checked} publishable package(s) carry ${REQUIRED_FILES.join(' + ')} and advertised entry points (${skipped} private skipped).`);
