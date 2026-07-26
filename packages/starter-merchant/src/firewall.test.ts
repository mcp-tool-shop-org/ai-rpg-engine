// THE FIREWALL, from the pack's side.
//
// The adapter's own firewall test proves the ADAPTER never mutates the world.
// This proves the converse, which is the half a showcase pack is most likely to
// break: the pack never reaches for the adapter. A starter authored to
// demonstrate on-ledger settlement is the single most tempting place in the repo
// to `import { settleCheckpoint }` and be done with it — and the moment it does,
// the claim the whole layer rests on ("a run is byte-identical with or without
// the adapter") stops being true of the one pack people will read first.
//
// Asserted mechanically rather than trusted to review, because a reviewer sees a
// diff and this needs to hold across every future edit.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(import.meta.dirname, '.');
const PKG = join(import.meta.dirname, '..', 'package.json');

function sourceFiles(): string[] {
  return readdirSync(SRC).filter((f) => f.endsWith('.ts'));
}

/**
 * Source with comments removed.
 *
 * Load-bearing: these checks scan for banned identifiers, and this pack's files
 * DOCUMENT the very things they must not do ("no Math.random", "the ledger
 * adapter is absent from this package's dependencies"). Scanning raw text made
 * every honest explanatory comment a false positive — the first run of this file
 * failed three ways on its own prose. Strip comments and the assertions describe
 * code, which is what they were always meant to be about.
 */
function codeOf(file: string): string {
  return readFileSync(join(SRC, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments, including JSDoc
    .replace(/^\s*\/\/.*$/gm, '') // whole-line line comments
    .replace(/([^:])\/\/.*$/gm, '$1'); // trailing line comments (not '://' in a URL)
}

describe('determinism firewall — the pack never reaches for the ledger adapter', () => {
  it('package.json declares no dependency on @ai-rpg-engine/ledger-adapter', () => {
    const pkg = JSON.parse(readFileSync(PKG, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
      const deps = Object.keys(pkg[field] ?? {});
      expect(deps, `${field} must not include the ledger adapter`).not.toContain('@ai-rpg-engine/ledger-adapter');
    }
  });

  it('no source file references the ledger adapter, in any import form', () => {
    // Covers `import`, `import type`, and a dynamic `import(...)` — a type-only
    // import would satisfy the dependency check above while still coupling the
    // pack's design to the adapter's shapes.
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      // Skip this file: it necessarily names the package in its own assertions.
      if (file === 'firewall.test.ts') continue;
      if (codeOf(file).includes('@ai-rpg-engine/ledger-adapter')) offenders.push(file);
    }
    expect(offenders, 'these files reference the ledger adapter').toEqual([]);
  });

  it('no source file mentions XRPL, escrow, or settlement concepts', () => {
    // The subtler failure: no import, but the pack's mechanics quietly authored
    // AROUND on-chain semantics — an `escrowId` field, an `xrplAddress` on an
    // obligation. `consign` must stand on its own as a game mechanic; that it
    // happens to map onto a settlement primitive is the adapter's business.
    const banned = [/\bxrpl\b/i, /\bNFToken/, /\btestnet\b/i, /\bescrowCreate\b/, /\bissuerAddress\b/];
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      if (file === 'firewall.test.ts') continue;
      const code = codeOf(file);
      for (const pattern of banned) {
        if (pattern.test(code)) offenders.push(`${file} matches ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('contract-core draws no randomness and reads no clock', () => {
    // Determinism at the source level. The obligation clock derives every due
    // date from world.meta.tick and picks its seizure victim by sorted id; a
    // Math.random or Date.now here would make a replay diverge and would not
    // necessarily fail any behavioural test.
    const code = codeOf('contract-core.ts');
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/Date\.now/);
    expect(code).not.toMatch(/new Date\(\s*\)/);
  });
});
