// F-84b809de: README Usage must import real starter-fantasy exports
// (buildCatalog, fantasyMinimalRuleset) -- there is no `content` namespace.
// Translations keep the same identifiers. Later fences reuse those names
// without re-importing, so they must not still say content.ruleset.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as characterCreation from './index.js';
import * as fantasy from '@ai-rpg-engine/starter-fantasy';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const README_FILES = [
  'README.md',
  'README.ja.md',
  'README.zh.md',
  'README.es.md',
  'README.fr.md',
  'README.hi.md',
  'README.it.md',
  'README.pt-BR.md',
];

function typescriptFences(readme: string, file: string): string[] {
  const fences = [...readme.matchAll(/```typescript\r?\n([\s\S]*?)```/g)].map(
    (m) => m[1],
  );
  if (fences.length === 0) throw new Error(`${file} has no typescript fence`);
  return fences;
}

describe('character-creation README Usage names real starter-fantasy exports', () => {
  it('source README first fence imports buildCatalog and fantasyMinimalRuleset, not content.*', () => {
    const src = readFileSync(join(pkgRoot, 'README.md'), 'utf8');
    const [block] = typescriptFences(src, 'README.md');
    expect(block).toContain(
      "import { buildCatalog, fantasyMinimalRuleset } from '@ai-rpg-engine/starter-fantasy'",
    );
    expect(block).toContain('validateBuild(build, buildCatalog, fantasyMinimalRuleset)');
    expect(block).not.toContain('content.ruleset');
    expect(block).not.toMatch(/\{ content,/);
  });

  it('named Usage identifiers exist on the named barrels', () => {
    expect(typeof characterCreation.validateBuild).toBe('function');
    expect(typeof characterCreation.resolveEntity).toBe('function');
    expect(fantasy).toHaveProperty('buildCatalog');
    expect(fantasy).toHaveProperty('fantasyMinimalRuleset');
    expect(fantasy).not.toHaveProperty('content');
  });

  it('seven translations carry the same Usage identifiers', () => {
    for (const file of README_FILES) {
      const fences = typescriptFences(
        readFileSync(join(pkgRoot, file), 'utf8'),
        file,
      );
      const [block] = fences;
      expect(block, file).toContain('buildCatalog');
      expect(block, file).toContain('fantasyMinimalRuleset');
      expect(block, file).not.toContain('content.ruleset');
      expect(block, file).not.toMatch(/\{ content,/);

      for (const [i, fence] of fences.entries()) {
        expect(fence, `${file} fence ${i}`).not.toContain('content.ruleset');
        expect(fence, `${file} fence ${i}`).not.toMatch(/\bcontent\./);
      }
    }
  });
});
