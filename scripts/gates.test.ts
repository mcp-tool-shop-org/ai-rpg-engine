// Gate meta-tests — every quality gate this repo relies on must be shown to
// FIRE when the invariant it protects is mutated, or the gate is theater.
//
// Covers:
//   PG-2  docs-integrity DOCS-05 (version vs latest release tag)
//   PG-3  coverage ratchet declared in vitest.config.ts
//   PG-5  packaging gate (LICENSE/README present in every publish tarball)
//
// The scripts under test run as child processes (black boxes), exactly as CI
// invokes them — so these tests exercise the real entry points, not internals.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import vitestConfig from '../vitest.config.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsIntegrity = join(repoRoot, 'docs', 'check-docs-integrity.mjs');
const checkPackaging = join(repoRoot, 'scripts', 'check-packaging.mjs');

function runNode(args: string[], extraEnv: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    timeout: 110_000,
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  };
}

// ---------------------------------------------------------------------------
// PG-2 — DOCS-05 must actually compare package.json to the latest release tag.
// Before the fix it asserted only semver FORMAT (any well-formed version
// passed, however stale). DOCS_INTEGRITY_LATEST_TAG injects the tag so the
// mutation needs no git surgery.
// ---------------------------------------------------------------------------
describe('PG-2: docs-integrity DOCS-05 tag-match gate', () => {
  it('FIRES when package.json version is behind the latest release tag', () => {
    const { status, output } = runNode([docsIntegrity], {
      DOCS_INTEGRITY_LATEST_TAG: 'v999.0.0',
    });
    expect(status, 'a version behind the release tag must fail the script').not.toBe(0);
    expect(output).toMatch(/FAIL - package\.json version .* is not behind the latest release tag/);
    expect(output).toContain('BEHIND the latest release tag v999.0.0');
  });

  it('passes (with a note, not a failure) when version is AHEAD — pre-release bumps do not break branch CI', () => {
    const { output } = runNode([docsIntegrity], {
      DOCS_INTEGRITY_LATEST_TAG: 'v0.0.1',
    });
    expect(output).toMatch(/ok {3}- package\.json version .* is not behind the latest release tag \(v0\.0\.1\)/);
    expect(output).toContain('ahead of v0.0.1');
    expect(output).not.toContain('BEHIND');
  });

  it('degrades gracefully when the latest tag is not a vX.Y.Z release tag', () => {
    const { output } = runNode([docsIntegrity], {
      DOCS_INTEGRITY_LATEST_TAG: 'dogfood-save-123',
    });
    expect(output).toContain('skip - latest tag "dogfood-save-123" is not vX.Y.Z');
  });

  it('real-git path: either enforces the tag match or skips with a clear shallow-checkout message', () => {
    // In a full checkout this exercises the real `git tag` discovery; in a
    // shallow CI checkout it must degrade to the documented skip — never to a
    // spurious failure or a silent pass without explanation.
    const { output } = runNode([docsIntegrity]);
    const enforced = / - package\.json version .* is not behind the latest release tag/.test(output);
    const skipped = output.includes('skip - no v* release tags visible');
    expect(enforced || skipped).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PG-3 — the coverage ratchet must stay declared and meaningful. The ratchet
// itself is enforced by `vitest run --coverage` (CI's coverage step); this
// structural guard makes sure it cannot be silently deleted or zeroed.
// ---------------------------------------------------------------------------
describe('PG-3: coverage ratchet is declared and non-vacuous', () => {
  it('vitest.config.ts declares coverage thresholds for all four metrics', () => {
    const coverage = (vitestConfig as { test?: { coverage?: { thresholds?: Record<string, unknown> } } })
      .test?.coverage;
    expect(coverage?.thresholds, 'coverage.thresholds must not be removed').toBeDefined();
    const t = coverage!.thresholds!;
    for (const metric of ['statements', 'branches', 'functions', 'lines'] as const) {
      expect(typeof t[metric], `thresholds.${metric} must be a number`).toBe('number');
      // A floor of 0/near-0 would make the ratchet vacuous. Baseline at the
      // time the ratchet was installed: stmts 76.89 / branch 83.55 /
      // funcs 68.40 / lines 76.89. Floors only ratchet UP.
      expect(t[metric] as number, `thresholds.${metric} must stay a real floor`).toBeGreaterThanOrEqual(60);
    }
  });
});

// ---------------------------------------------------------------------------
// PG-5 — the packaging gate must FAIL a publishable package whose tarball
// lacks LICENSE (the exact G3 failure: `files` listed LICENSE, no file on
// disk, npm silently dropped it, artifact published license-less).
// ---------------------------------------------------------------------------
describe('PG-5: packaging gate (LICENSE/README in publish tarball)', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), 'gate-fixture-'));
    writeFileSync(
      join(fixtureDir, 'package.json'),
      JSON.stringify(
        {
          name: 'gate-fixture-pkg',
          version: '0.0.0',
          // G3 shape: LICENSE listed in files but absent on disk — npm drops
          // it silently instead of erroring.
          files: ['index.js', 'LICENSE'],
          license: 'MIT',
        },
        null,
        2,
      ),
    );
    writeFileSync(join(fixtureDir, 'index.js'), 'export {};\n');
    writeFileSync(join(fixtureDir, 'README.md'), '# gate fixture\n');
  });

  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('FIRES on a package whose tarball is missing LICENSE (G3 reproduction)', () => {
    const { status, output } = runNode([checkPackaging, `--dir=${fixtureDir}`]);
    expect(status, 'missing LICENSE must fail the gate').not.toBe(0);
    expect(output).toContain('gate-fixture-pkg');
    expect(output).toContain('LICENSE');
    // The hint must teach the failure mode, not just report it.
    expect(output).toContain('npm silently drops');
  }, 120_000);

  it('passes once LICENSE exists on disk', () => {
    writeFileSync(join(fixtureDir, 'LICENSE'), 'MIT\n');
    const { status, output } = runNode([checkPackaging, `--dir=${fixtureDir}`]);
    expect(output).toContain('ok    gate-fixture-pkg');
    expect(status).toBe(0);
  }, 120_000);
});
