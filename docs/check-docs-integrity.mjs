#!/usr/bin/env node
/**
 * Docs integrity guard — asserts honesty-surface invariants across the repo's
 * documentation and metadata files. Run with: `node docs/check-docs-integrity.mjs`
 *
 * This is a test-first regression guard for the Wave A2 docs fixes. Each block
 * proves a specific finding (DOCS-01..08, hygiene, CI). It reads only docs,
 * root markdown, package.json, .gitignore, and the site handbook tree — never
 * package source — so it stays in the docs domain.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// package.json is the single source of truth for the current version. Every other
// honesty surface is cross-checked AGAINST it, so this gate never pins a stale
// version number (the doc-regression anti-pattern) — it enforces consistency.
const VERSION = JSON.parse(read('package.json')).version;

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`  ok   - ${name}`);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.log(`  FAIL - ${name}: ${err.message}`);
  }
};

// ---------------------------------------------------------------------------
// DOCS-05 — root package.json version matches the latest git tag / README
// ---------------------------------------------------------------------------
console.log('DOCS-05 package.json version');
check('root package.json version is valid semver (source of truth)', () => {
  assert.ok(/^\d+\.\d+\.\d+$/.test(VERSION), `package.json version "${VERSION}" is not semver`);
});

// ---------------------------------------------------------------------------
// DOCS-01 — CHANGELOG documents every released tag (2.3.4..2.3.7)
// ---------------------------------------------------------------------------
console.log('DOCS-01 CHANGELOG completeness');
const changelog = read('CHANGELOG.md');
for (const v of ['2.3.4', '2.3.5', '2.3.6', '2.3.7']) {
  check(`CHANGELOG has a [${v}] section`, () => {
    assert.ok(
      new RegExp(`^## \\[${v.replace(/\./g, '\\.')}\\]`, 'm').test(changelog),
      `CHANGELOG.md missing "## [${v}]" section`,
    );
  });
}
check('CHANGELOG top entry matches package.json version', () => {
  const firstSection = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  assert.ok(firstSection, 'no version section found');
  assert.equal(firstSection[1], VERSION, `top entry is ${firstSection[1]}, expected ${VERSION} (package.json)`);
});

// ---------------------------------------------------------------------------
// DOCS-02 — site handbook contains every chapter from docs/handbook (source)
// ---------------------------------------------------------------------------
console.log('DOCS-02 site handbook parity');
const srcDir = 'docs/handbook';
const siteDir = 'site/src/content/docs/handbook';
const isChapter = (f) => f.endsWith('.md') && f !== 'index.md';
const srcChapters = readdirSync(join(root, srcDir)).filter(isChapter);
const siteChapters = new Set(readdirSync(join(root, siteDir)).filter(isChapter));
const missing = srcChapters.filter((f) => !siteChapters.has(f));
check(`every source chapter is rendered on the site (${srcChapters.length} chapters)`, () => {
  assert.deepEqual(missing, [], `site missing chapters: ${missing.join(', ')}`);
});
// Every site chapter must carry Starlight frontmatter (title) so the sidebar renders.
for (const f of readdirSync(join(root, siteDir)).filter(isChapter)) {
  check(`site/${f} has Starlight title frontmatter`, () => {
    const body = read(join(siteDir, f));
    assert.ok(/^---\r?\n[\s\S]*?\btitle:/.test(body), `site/${f} missing title frontmatter`);
  });
}

// ---------------------------------------------------------------------------
// DOCS-03 — SHIP_GATE reflects current version + real chapter count
// ---------------------------------------------------------------------------
console.log('DOCS-03 SHIP_GATE honesty');
const shipGate = read('SHIP_GATE.md');
const realChapterCount = srcChapters.filter((f) => f !== 'index.md' && !f.startsWith('appendix')).length;
check('SHIP_GATE does not claim stale v1.0.0', () => {
  assert.ok(!/v1\.0\.0/.test(shipGate), 'SHIP_GATE.md still references v1.0.0');
});
check('SHIP_GATE references the current package.json version', () => {
  assert.ok(shipGate.includes(VERSION), `SHIP_GATE.md does not mention current version ${VERSION}`);
});
check(`SHIP_GATE states the real chapter count (${realChapterCount})`, () => {
  assert.ok(!/25 chapters/.test(shipGate), 'SHIP_GATE.md still claims "25 chapters"');
  assert.ok(
    new RegExp(`${realChapterCount} chapters`).test(shipGate),
    `SHIP_GATE.md should state "${realChapterCount} chapters"`,
  );
});

// ---------------------------------------------------------------------------
// DOCS-04 — SCORECARD re-dated + chapter count current
// ---------------------------------------------------------------------------
console.log('DOCS-04 SCORECARD honesty');
const scorecard = read('SCORECARD.md');
check('SCORECARD is not stuck on the 2026-03-06 snapshot date', () => {
  const dateLine = scorecard.match(/\*\*Date:\*\*\s*(\S+)/);
  assert.ok(dateLine, 'no Date line in SCORECARD');
  assert.notEqual(dateLine[1], '2026-03-06', 'SCORECARD still dated 2026-03-06');
});
check('SCORECARD does not claim stale "29 chapters"', () => {
  assert.ok(!/29 chapters/.test(scorecard), 'SCORECARD still claims "29 chapters"');
});
check(`SCORECARD states the real chapter count (${realChapterCount})`, () => {
  assert.ok(
    new RegExp(`${realChapterCount} chapters`).test(scorecard),
    `SCORECARD should state "${realChapterCount} chapters"`,
  );
});

// ---------------------------------------------------------------------------
// DOCS-07 — README module count is consistent (one number everywhere)
// ---------------------------------------------------------------------------
console.log('DOCS-07 README module count consistency');
const readme = read('README.md');
check('README uses one consistent module/system count, not a mix of 30+/27+', () => {
  // Catches both "30+ ... modules" and "27+ composable systems" — the README
  // describes the same modules package in all three spots and must agree.
  const counts = [
    ...readme.matchAll(/(\d+)\+\s+(?:composable\s+)?(?:engine\s+)?(?:modules?|systems?)/gi),
  ].map((m) => m[1]);
  const unique = [...new Set(counts)];
  assert.ok(counts.length >= 3, `expected >=3 module-count phrases, found ${counts.length}`);
  assert.equal(unique.length, 1, `README mixes module counts: ${unique.join(', ')}`);
});

// ---------------------------------------------------------------------------
// DOCS-08 — handbook index TOC links chapter 58 to the correct file
// ---------------------------------------------------------------------------
console.log('DOCS-08 handbook index TOC');
const indexMd = read('docs/handbook/index.md');
check('index TOC does not mislabel ch58 as Profile Roadmap -> ../profile-roadmap.md', () => {
  assert.ok(
    !/^58\.\s*\[Profile Roadmap\]\(\.\.\/profile-roadmap\.md\)/m.test(indexMd),
    'index.md still links "58. Profile Roadmap" to ../profile-roadmap.md',
  );
});

// ---------------------------------------------------------------------------
// HYGIENE — stray .signalfire save removed + ignored
// ---------------------------------------------------------------------------
console.log('HYGIENE .signalfire');
check('.signalfire/save.json is removed', () => {
  assert.ok(!existsSync(join(root, '.signalfire/save.json')), '.signalfire/save.json still present');
});
check('.gitignore ignores .signalfire/', () => {
  assert.ok(/^\.signalfire\/?$/m.test(read('.gitignore')), '.gitignore does not ignore .signalfire/');
});

if (failures.length > 0) {
  console.error(`\n${failures.length} docs-integrity check(s) FAILED (${passed} passed).`);
  process.exit(1);
}
console.log(`\nALL ${passed} docs-integrity checks passed.`);
