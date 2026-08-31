// F-bf0a9b6f: README Usage must import real starter-fantasy exports
// (manifest, fantasyMinimalRuleset, createGame, packMeta) — there is no
// `content` namespace. Translations keep the same identifiers.
//
// F-94cfb964: EVERY typescript fence is pinned, not only the first. The
// Quality Rubric snippet must call validatePackRubric(packEntry, getAllPacks())
// — a one-arg copy-paste used to throw TypeError on allPacks.filter.

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

function typescriptFences(readme: string, file: string): string[] {
  const fences = [...readme.matchAll(/```typescript\r?\n([\s\S]*?)```/g)].map(
    (m) => m[1],
  );
  if (fences.length === 0) throw new Error(`${file} has no typescript fence`);
  return fences;
}

describe('pack-registry README Usage names real starter-fantasy exports', () => {
  it('source README imports manifest and fantasyMinimalRuleset, not content.*', () => {
    const src = readFileSync(join(pkgRoot, 'README.md'), 'utf8');
    const [block] = typescriptFences(src, 'README.md');
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
    expect(typeof packRegistry.validatePackRubric).toBe('function');
    expect(typeof packRegistry.getAllPacks).toBe('function');
    expect(typeof packRegistry.discoverInstalledPacks).toBe('function');
    expect(typeof packRegistry.registerFromModule).toBe('function');
    expect(fantasy).toHaveProperty('manifest');
    expect(fantasy).toHaveProperty('fantasyMinimalRuleset');
    expect(typeof fantasy.createGame).toBe('function');
    expect(fantasy).toHaveProperty('packMeta');
    expect(fantasy).not.toHaveProperty('content');
  });

  it('seven translations carry the same Usage identifiers', () => {
    for (const file of README_FILES) {
      const [block] = typescriptFences(
        readFileSync(join(pkgRoot, file), 'utf8'),
        file,
      );
      expect(block, file).toContain('fantasyMinimalRuleset');
      expect(block, file).toContain('manifest');
      expect(block, file).not.toContain('content.manifest');
      expect(block, file).not.toContain('content.ruleset');
    }
  });
});

describe('F-94cfb964: every typescript fence is live, not only the first', () => {
  it('each README has three typescript fences and none is a one-arg rubric call', () => {
    for (const file of README_FILES) {
      const fences = typescriptFences(
        readFileSync(join(pkgRoot, file), 'utf8'),
        file,
      );
      expect(fences, file).toHaveLength(3);

      expect(fences[0], `${file} fence 0`).toContain('registerPack');
      expect(fences[0], `${file} fence 0`).toContain('getPackSummaries');
      expect(fences[0], `${file} fence 0`).toContain('filterPacks');
      expect(fences[0], `${file} fence 0`).toContain('fantasyMinimalRuleset');
      expect(fences[0], `${file} fence 0`).toContain('discoverInstalledPacks');

      expect(fences[1], `${file} fence 1`).toContain('validatePackRubric');
      expect(fences[1], `${file} fence 1`).toContain('getAllPacks');
      expect(fences[1], `${file} fence 1`).toContain(
        'validatePackRubric(packEntry, getAllPacks())',
      );
      expect(fences[1], `${file} fence 1`).not.toContain(
        'validatePackRubric(packEntry);',
      );

      expect(fences[2], `${file} fence 2`).toContain('import type');
      expect(fences[2], `${file} fence 2`).toContain('PackEntry');
      expect(fences[2], `${file} fence 2`).toContain('RubricResult');
      expect(fences[2], `${file} fence 2`).toContain('PackMetadata');

      for (const [i, block] of fences.entries()) {
        if (block.includes('validatePackRubric')) {
          expect(block, `${file} fence ${i}`).toContain(
            'validatePackRubric(packEntry, getAllPacks())',
          );
          expect(block, `${file} fence ${i}`).not.toContain(
            'validatePackRubric(packEntry);',
          );
        }
      }
    }
  });
});
