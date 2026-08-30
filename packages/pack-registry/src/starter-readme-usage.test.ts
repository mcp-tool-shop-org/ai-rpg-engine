// F-5ff2b341: every starter README typescript fence's named imports must
// exist on that package's public barrel. Class pin — not one README at a time.
//
// F-122e1140: engine.<member> in those fences must be a live Engine API
// (submitAction / serialize / shutdown / world / tick / …). `engine.start()`
// is not one; createGame already boots.

import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Engine } from '@ai-rpg-engine/core';

const packagesDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

const NAMED_IMPORT_RE =
  /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]@ai-rpg-engine\/(starter-[a-z0-9-]+)['"]/g;

const ENGINE_MEMBER_RE = /\bengine\.([A-Za-z_][A-Za-z0-9_]*)/g;

function starterPackagesOnDisk(): string[] {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('starter-'))
    .map((e) => e.name)
    .sort();
}

function typescriptFences(readme: string, file: string): string[] {
  const fences = [...readme.matchAll(/```typescript\r?\n([\s\S]*?)```/g)].map(
    (m) => m[1],
  );
  if (fences.length === 0) throw new Error(`${file} has no typescript fence`);
  return fences;
}

function exportedNames(inner: string): string[] {
  return inner
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^type\s+/, ''))
    .map((s) => s.split(/\s+as\s+/)[0].trim())
    .filter((s) => s.length > 0);
}

function enginePublicMembers(): Set<string> {
  const names = new Set<string>([
    'store',
    'dispatcher',
    'moduleManager',
    'ruleset',
  ]);
  let proto: object | null = Engine.prototype;
  while (proto && proto !== Object.prototype) {
    for (const n of Object.getOwnPropertyNames(proto)) {
      if (n !== 'constructor') names.add(n);
    }
    proto = Object.getPrototypeOf(proto);
  }
  return names;
}

describe('F-5ff2b341 / F-122e1140: starter README fences are live', () => {
  const starters = starterPackagesOnDisk();
  const barrels: Record<string, Record<string, unknown>> = {};
  const members = enginePublicMembers();

  beforeAll(async () => {
    await Promise.all(
      starters.map(async (pkg) => {
        const href = pathToFileURL(join(packagesDir, pkg, 'src', 'index.ts')).href;
        barrels[pkg] = (await import(href)) as Record<string, unknown>;
      }),
    );
  });

  it('discovers the full catalog of starter packages and their README translations', () => {
    expect(starters.length).toBeGreaterThanOrEqual(12);
    for (const pkg of starters) {
      const dir = join(packagesDir, pkg);
      for (const file of README_FILES) {
        expect(
          readdirSync(dir).includes(file),
          `${pkg} is missing ${file}`,
        ).toBe(true);
      }
    }
  });

  it('named Usage imports exist on the named barrel', () => {
    let importCount = 0;
    for (const pkg of starters) {
      for (const file of README_FILES) {
        const path = join(packagesDir, pkg, file);
        const fences = typescriptFences(readFileSync(path, 'utf8'), `${pkg}/${file}`);
        for (const [i, block] of fences.entries()) {
          NAMED_IMPORT_RE.lastIndex = 0;
          for (const match of block.matchAll(NAMED_IMPORT_RE)) {
            const fromPkg = match[2];
            const barrel = barrels[fromPkg];
            expect(
              barrel,
              `${pkg}/${file} fence ${i} imports unknown package @ai-rpg-engine/${fromPkg}`,
            ).toBeTruthy();
            for (const name of exportedNames(match[1])) {
              importCount += 1;
              expect(
                barrel,
                `${pkg}/${file} fence ${i}: ${name} is not exported by @ai-rpg-engine/${fromPkg}`,
              ).toHaveProperty(name);
            }
          }
        }
      }
    }
    expect(importCount).toBeGreaterThan(0);
  });

  it('engine.<member> in fences is a live Engine API, never start()', () => {
    for (const pkg of starters) {
      for (const file of README_FILES) {
        const path = join(packagesDir, pkg, file);
        const fences = typescriptFences(readFileSync(path, 'utf8'), `${pkg}/${file}`);
        for (const [i, block] of fences.entries()) {
          expect(block, `${pkg}/${file} fence ${i}`).not.toMatch(
            /\bengine\.start\s*\(/,
          );
          ENGINE_MEMBER_RE.lastIndex = 0;
          for (const match of block.matchAll(ENGINE_MEMBER_RE)) {
            const member = match[1];
            expect(
              members.has(member),
              `${pkg}/${file} fence ${i}: Engine has no public member '${member}'`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('F-703f101c: every starter README ships the engine logo and CI / License / Landing_Page badges', () => {
    for (const pkg of starters) {
      for (const file of README_FILES) {
        const src = readFileSync(join(packagesDir, pkg, file), 'utf8');
        expect(src, `${pkg}/${file} missing readme.png`).toContain('readme.png');
        expect(src, `${pkg}/${file} missing CI badge.svg`).toContain('badge.svg');
        expect(src, `${pkg}/${file} missing License badge`).toContain('License-MIT');
        expect(src, `${pkg}/${file} missing Landing_Page badge`).toContain('Landing_Page');
      }
    }
  });

  it('F-98b01fde: English README hero is packMeta.name — packMeta.tagline', () => {
    for (const pkg of starters) {
      const meta = barrels[pkg]?.packMeta as { name?: string; tagline?: string } | undefined;
      expect(meta?.name, `${pkg} barrel missing packMeta.name`).toBeTruthy();
      expect(meta?.tagline, `${pkg} barrel missing packMeta.tagline`).toBeTruthy();
      const src = readFileSync(join(packagesDir, pkg, 'README.md'), 'utf8');
      expect(src, `${pkg}/README.md hero must be **${meta!.name}** — ${meta!.tagline}`).toContain(
        `**${meta!.name}** — ${meta!.tagline}`,
      );
      expect(src, `${pkg}/README.md must not ship a generic 'a {genre} starter world' hero`).not.toMatch(
        /a .+ starter world for AI RPG Engine/i,
      );
    }
  });
});
