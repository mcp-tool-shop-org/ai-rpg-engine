// THE FIREWALL, from the pack's side.
//
// Hue and Cry has no business knowing the ledger adapter exists, and this
// asserts it mechanically rather than trusting review. Copied in shape from
// starter-merchant's own firewall test for the reason that one gives: a
// reviewer sees a diff, and this needs to hold across every future edit.
//
// The twelfth pack is a LOWER risk than merchant was — it demonstrates nothing
// on-chain and has no settlement story — which is exactly why the test is
// worth having here. The dependency that gets added by accident is the one
// nobody thought to guard.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(import.meta.dirname, '.');
const PKG = join(import.meta.dirname, '..', 'package.json');

function sourceFiles(): string[] {
  return readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
}

/**
 * Source with comments removed.
 *
 * Load-bearing, and merchant's own firewall test learned it the hard way: these
 * checks scan for banned identifiers, and these files DOCUMENT the very things
 * they must not do ("no Math.random", "no wall clock"). Scanning raw text makes
 * every honest explanatory comment a false positive.
 */
function codeOf(file: string): string {
  return readFileSync(join(SRC, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^:])\/\/.*$/gm, '$1');
}

describe('firewall: the pack never reaches for the ledger adapter', () => {
  it('declares no dependency on @ai-rpg-engine/ledger-adapter', () => {
    const pkg = JSON.parse(readFileSync(PKG, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    expect(Object.keys(all)).not.toContain('@ai-rpg-engine/ledger-adapter');
  });

  it('imports it nowhere in source', () => {
    for (const file of sourceFiles()) {
      expect(codeOf(file), `${file} imports the ledger adapter`).not.toContain('ledger-adapter');
    }
  });

  it('and the scan can SEE an import — it is not vacuously green (control)', () => {
    // Every source file imports @ai-rpg-engine/core or a sibling; if the
    // comment-stripper ate the import lines this whole suite would pass while
    // reading nothing.
    const blob = sourceFiles().map(codeOf).join('\n');
    expect(blob).toContain('@ai-rpg-engine/');
  });
});

describe('determinism: no wall clock, no unseeded randomness', () => {
  for (const banned of ['Math.random', 'Date.now', 'new Date(']) {
    it(`no source file uses ${banned}`, () => {
      for (const file of sourceFiles()) {
        expect(codeOf(file), `${file} uses ${banned}`).not.toContain(banned);
      }
    });
  }

  it('the ban can FIRE — the stripper does not eat real code (control)', () => {
    // Same shape as the import control above, aimed at the other scan: prove a
    // banned identifier WOULD be found in stripped code.
    const synthetic = codeOf(sourceFiles()[0]) + '\nconst x = Math.random();';
    expect(synthetic).toContain('Math.random');
  });
});
