// F-bf0a9b6f: README Usage must import real starter-fantasy exports
// (manifest, fantasyMinimalRuleset, createGame, packMeta) — there is no
// `content` namespace. Translations keep the same identifiers.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as packRegistry from './index.js';
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

function usageBlock(readme: string, file: string): string {
  const match = readme.match(/```typescript\r?\n([\s\S]*?)```/);
  if (!match) throw new Error(`${file} has no typescript fence`);
  return match[1];
}

describe('pack-registry README Usage names real starter-fantasy exports', () => {
  it('source README imports manifest and fantasyMinimalRuleset, not content.*', () => {
    const src = readFileSync(join(pkgRoot, 'README.md'), 'utf8');
    const block = usageBlock(src, 'README.md');
    expect(block).toContain('manifest');
    expect(block).toContain('fantasyMinimalRuleset');
    expect(block).toContain('createGame');
    expect(block).toContain('packMeta');
    expect(block).not.toContain('content.manifest');
    expect(block).not.toContain('content.ruleset');
    expect(block).not.toMatch(/\{ content,/);
  });

  it('named Usage identifiers exist on the named barrels', () => {
    expect(typeof packRegistry.registerPack).toBe('function');
    expect(typeof packRegistry.getPackSummaries).toBe('function');
    expect(typeof packRegistry.filterPacks).toBe('function');
    expect(fantasy).toHaveProperty('manifest');
    expect(fantasy).toHaveProperty('fantasyMinimalRuleset');
    expect(typeof fantasy.createGame).toBe('function');
    expect(fantasy).toHaveProperty('packMeta');
    expect(fantasy).not.toHaveProperty('content');
  });

  it('seven translations carry the same Usage identifiers', () => {
    for (const file of README_FILES) {
      const block = usageBlock(readFileSync(join(pkgRoot, file), 'utf8'), file);
      expect(block, file).toContain('fantasyMinimalRuleset');
      expect(block, file).toContain('manifest');
      expect(block, file).not.toContain('content.manifest');
      expect(block, file).not.toContain('content.ruleset');
    }
  });
});
