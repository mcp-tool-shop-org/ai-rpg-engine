// F-d5d83dd8: README Usage must name real barrel exports (loadContent /
// validateGameContent, result.ok), not the phantom validateContentPack /
// RoomSchema / EntitySchema / result.valid. Translations keep the same
// identifiers (I18N-01: code spans stay in the source script).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as contentSchema from './index.js';

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

describe('content-schema README Usage names real barrel exports', () => {
  it('source README imports loadContent and validateGameContent, not phantom names', () => {
    const src = readFileSync(join(pkgRoot, 'README.md'), 'utf8');
    const block = usageBlock(src, 'README.md');
    expect(block).toContain('loadContent');
    expect(block).toContain('validateGameContent');
    expect(block).toMatch(/\.ok\b/);
    expect(block).not.toContain('validateContentPack');
    expect(block).not.toContain('RoomSchema');
    expect(block).not.toContain('EntitySchema');
    expect(block).not.toContain('result.valid');
  });

  it('named Usage identifiers exist on the public barrel', () => {
    expect(typeof contentSchema.loadContent).toBe('function');
    expect(typeof contentSchema.validateGameContent).toBe('function');
    expect(contentSchema).not.toHaveProperty('validateContentPack');
    expect(contentSchema).not.toHaveProperty('RoomSchema');
    expect(contentSchema).not.toHaveProperty('EntitySchema');
  });

  it('seven translations carry the same Usage identifiers', () => {
    for (const file of README_FILES) {
      const block = usageBlock(readFileSync(join(pkgRoot, file), 'utf8'), file);
      expect(block, file).toContain('loadContent');
      expect(block, file).toContain('validateGameContent');
      expect(block, file).not.toContain('validateContentPack');
      expect(block, file).not.toContain('RoomSchema');
      expect(block, file).not.toContain('EntitySchema');
    }
  });
});
