// Gate meta-tests — every quality gate this repo relies on must be shown to
// FIRE when the invariant it protects is mutated, or the gate is theater.
//
// Covers:
//   PG-2  docs-integrity DOCS-05 (version vs latest release tag)
//   PG-3  coverage ratchet declared in vitest.config.ts
//   PG-5  packaging gate (LICENSE/README + advertised main/types/bin/exports)
//   PG-6  docs-integrity I18N-01 (translated code spans stay in the source script)
//   CI    isolated-consumer / docker-smoke / release bar / job-scoped creds / pages PR compile
//
// The scripts under test run as child processes (black boxes), exactly as CI
// invokes them — so these tests exercise the real entry points, not internals.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// PG-5 advertised entry points: files[] listing dist/index.js is not proof
// the tarball contains it. npm drops the missing path; LICENSE+README still
// pack and the old gate printed ok. A publishable package whose `main`
// points at a dist that was never built must FAIL.
describe('PG-5: packaging gate advertised entry points (main in tarball)', () => {
  it('FIRES when files lists dist/index.js, main points at it, and dist is missing', () => {
    const emptyDistDir = mkdtempSync(join(tmpdir(), 'gate-empty-dist-'));
    try {
      writeFileSync(
        join(emptyDistDir, 'package.json'),
        JSON.stringify(
          {
            name: 'gate-fixture-empty-dist',
            version: '0.0.0',
            main: './dist/index.js',
            files: ['dist/index.js', 'LICENSE', 'README.md'],
            license: 'MIT',
          },
          null,
          2,
        ),
      );
      writeFileSync(join(emptyDistDir, 'LICENSE'), 'MIT\n');
      writeFileSync(join(emptyDistDir, 'README.md'), '# empty dist fixture\n');
      const { status, output } = runNode([checkPackaging, `--dir=${emptyDistDir}`]);
      expect(status, 'missing advertised main must fail the gate').not.toBe(0);
      expect(output).toContain('gate-fixture-empty-dist');
      expect(output).toMatch(/dist\/index\.js/);
    } finally {
      rmSync(emptyDistDir, { recursive: true, force: true });
    }
  }, 120_000);
});

// ---------------------------------------------------------------------------
// PG-6 — I18N-01 must FAIL a translated README whose inline code spans were
// transliterated out of the source script. The real failure: README.hi.md
// shipped `रन <पथ>` for `run <path>`, `--चेकपॉइंट` for `--checkpoint`, and
// `@ai-rpg-इंजन/कोर` for `@ai-rpg-engine/core` — a CLI command, a flag, and an
// npm package name that do not work when copied out of the docs.
//
// DOCS_INTEGRITY_I18N_ROOT points the scan at a fixture tree, so the mutation
// needs no edit to a tracked README.
// ---------------------------------------------------------------------------
describe('PG-6: docs-integrity I18N-01 code-span script gate', () => {
  let i18nDir: string;

  beforeAll(() => {
    i18nDir = mkdtempSync(join(tmpdir(), 'gate-i18n-'));
    writeFileSync(join(i18nDir, 'README.md'), 'Run `run <path>` with `@ai-rpg-engine/core`.\n');
    // Clean translation: prose translated, identifiers left in Latin.
    writeFileSync(join(i18nDir, 'README.es.md'), 'Ejecuta `run <path>` con `@ai-rpg-engine/core`.\n');
  });

  afterAll(() => {
    rmSync(i18nDir, { recursive: true, force: true });
  });

  it('passes when translated code spans keep the source script', () => {
    const { status, output } = runNode([docsIntegrity], { DOCS_INTEGRITY_I18N_ROOT: i18nDir });
    expect(output).toMatch(/ok {3}- no translated README transliterates a code identifier/);
    expect(status).toBe(0);
  }, 120_000);

  it('FIRES when a translated code span is transliterated (README.hi.md reproduction)', () => {
    writeFileSync(
      join(i18nDir, 'README.hi.md'),
      'शुरू करने के लिए `रन <पथ>` चलाएँ, `@ai-rpg-इंजन/कोर` के साथ।\n',
    );
    const { status, output } = runNode([docsIntegrity], { DOCS_INTEGRITY_I18N_ROOT: i18nDir });
    expect(status, 'a transliterated identifier must fail the script').not.toBe(0);
    expect(output).toMatch(/FAIL - no translated README transliterates a code identifier/);
    // The report must name the file, the offending span, and the script — a
    // bare count would not tell a maintainer what to fix.
    expect(output).toContain('README.hi.md');
    expect(output).toContain('`रन <पथ>`');
    expect(output).toContain('Devanagari');
  }, 120_000);

  it('does not flag a non-Latin code span the SOURCE already uses', () => {
    // The invariant is "stay in the source script", not "Latin only": a source
    // that puts Devanagari in a code span (a string literal, a locale sample)
    // permits it downstream instead of failing a legitimate doc.
    const okDir = mkdtempSync(join(tmpdir(), 'gate-i18n-ok-'));
    try {
      writeFileSync(join(okDir, 'README.md'), 'Locale sample: `नमस्ते` and `run`.\n');
      writeFileSync(join(okDir, 'README.hi.md'), 'लोकेल नमूना: `नमस्ते` और `run`।\n');
      const { status, output } = runNode([docsIntegrity], { DOCS_INTEGRITY_I18N_ROOT: okDir });
      expect(output).toMatch(/ok {3}- no translated README transliterates a code identifier/);
      expect(status).toBe(0);
    } finally {
      rmSync(okDir, { recursive: true, force: true });
    }
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Workflow wiring — ship gates that exist as scripts must actually run in CI
// and on the credentialed publish path. A missing step is the same class of
// theater as a gate that never fires: the script is local-only ritual.
// ---------------------------------------------------------------------------
describe('workflow wiring: ship gates run in CI and release', () => {
  const ci = readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
  const release = readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8');
  const pages = readFileSync(join(repoRoot, '.github/workflows/pages.yml'), 'utf8');

  it('ci.yml path filters include Dockerfile and tsconfig.tests.json', () => {
    expect(ci).toContain("'Dockerfile'");
    expect(ci).toContain("'tsconfig.tests.json'");
  });

  it('ci.yml node-22 leg runs the isolated-consumer proof', () => {
    expect(ci).toContain('node scripts/verify-isolated-consumer.mjs');
    expect(ci).toMatch(
      /Isolated-consumer proof[\s\S]{0,200}if: matrix\.node-version == 22/,
    );
  });

  it('ci.yml docker-smoke job loads the image and docker-runs --help (no push)', () => {
    expect(ci).toMatch(/docker-smoke:/);
    expect(ci).toContain('docker/setup-buildx-action@');
    expect(ci).toMatch(/load:\s*true/);
    expect(ci).toMatch(/push:\s*false/);
    expect(ci).toContain('docker run --rm ai-rpg-engine:ci-smoke --help');
  });

  it('release.yml npm job runs the node-22-class gates before any publish', () => {
    const npmJob = release.slice(
      release.indexOf('name: Publish npm packages'),
      release.indexOf('name: Build & push CLI image'),
    );
    expect(npmJob).toContain('npm run lint');
    expect(npmJob).toContain('npm run typecheck:tests');
    expect(npmJob).toContain('node scripts/verify-mixed-game-viability.mjs');
    expect(npmJob).toContain('node scripts/check-packaging.mjs');
    expect(npmJob).toContain('node scripts/verify-isolated-consumer.mjs');
    const consumerAt = npmJob.indexOf('node scripts/verify-isolated-consumer.mjs');
    const publishAt = npmJob.indexOf('npm publish');
    expect(consumerAt).toBeGreaterThan(-1);
    expect(publishAt).toBeGreaterThan(consumerAt);
  });

  it('release.yml pins npm to an exact 11.x version, not @latest', () => {
    expect(release).not.toMatch(/npm install -g npm@latest/);
    expect(release).toMatch(/npm install -g npm@11\.\d+\.\d+ --ignore-scripts/);
  });

  it('release.yml docker needs npm, smokes before push, and does not share npm OIDC', () => {
    const dockerJob = release.slice(release.indexOf('name: Build & push CLI image'));
    expect(dockerJob).toMatch(/needs:\s*\[npm\]/);
    expect(dockerJob).toContain('docker run --rm ai-rpg-engine:ci-smoke --help');
    expect(dockerJob).toMatch(/load:\s*true/);
    expect(dockerJob).toMatch(/push:\s*false/);
    expect(dockerJob).toContain('docker push');
    const smokeAt = dockerJob.indexOf('Smoke — CLI --help');
    const pushAt = dockerJob.lastIndexOf('docker push');
    expect(smokeAt).toBeGreaterThan(-1);
    expect(pushAt).toBeGreaterThan(smokeAt);
    expect(dockerJob).not.toMatch(/id-token:\s*write/);
    expect(dockerJob).toMatch(/packages:\s*write/);
  });

  it('release.yml keeps id-token write on the npm job only', () => {
    const header = release.slice(0, release.indexOf('jobs:'));
    expect(header).not.toMatch(/id-token:\s*write/);
    expect(header).not.toMatch(/packages:\s*write/);
    const npmJob = release.slice(
      release.indexOf('name: Publish npm packages'),
      release.indexOf('name: Build & push CLI image'),
    );
    expect(npmJob).toMatch(/id-token:\s*write/);
    expect(npmJob).not.toMatch(/packages:\s*write/);
  });

  it('pages.yml compiles the Astro handbook on pull_request; deploy stays main-only', () => {
    expect(pages).toMatch(/pull_request:\s*\n\s*paths:/);
    expect(pages).toContain("'site/**'");
    expect(pages).toContain('npm run build');
    expect(pages).toMatch(/if:\s*github\.ref == 'refs\/heads\/main'/);
  });
});

