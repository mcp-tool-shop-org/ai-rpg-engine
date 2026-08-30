// Packaging integrity — the `ai` design-studio CLI must actually be
// installable (v2.6 F1-ai). The regression this guards: cli.ts implemented
// ~25 subcommands + `ai chat`, shipped in the tarball, and was documented in
// handbook Ch. 36 — but package.json had no `bin` field and no entry had a
// shebang, so one of the product's two headline pillars could not be invoked.
//
// CI runs `npm run build` before `npm run test` (ci.yml), and `npm run
// verify` is `build && test`, so asserting on dist/ artifacts here is
// contract-legitimate: if these fail on a built tree, the published tarball
// is broken.
import { describe, it, expect } from 'vitest';
import { readFile, access, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

async function readPkg(): Promise<{
  bin?: Record<string, string>;
  files?: string[];
}> {
  return JSON.parse(await readFile(join(pkgRoot, 'package.json'), 'utf-8'));
}

describe('packaging: the `ai` bin is installable', () => {
  it('package.json declares the documented `ai` command (handbook Ch. 36)', async () => {
    const pkg = await readPkg();
    expect(pkg.bin, 'bin field must exist — without it npm creates no shim and the studio CLI is uninstallable').toBeDefined();
    expect(pkg.bin).toHaveProperty('ai', './dist/bin.js');
  });

  it('the bin target ships in the tarball (files whitelist covers dist/)', async () => {
    const pkg = await readPkg();
    expect(pkg.files).toContain('dist');
  });

  it('src/bin.ts starts with a node shebang (tsc preserves it into dist)', async () => {
    const src = await readFile(join(pkgRoot, 'src', 'bin.ts'), 'utf-8');
    // First LINE, eol-tolerant: the honest claim is about the shebang, not the
    // checkout's line endings (a CRLF working tree must not fail this).
    expect(src.split(/\r?\n/)[0]).toBe('#!/usr/bin/env node');
  });

  it('built dist/bin.js exists and starts with the shebang', async () => {
    const built = await readFile(join(pkgRoot, 'dist', 'bin.js'), 'utf-8');
    expect(built.startsWith('#!/usr/bin/env node\n'),
      'dist/bin.js must open with the shebang or POSIX installs get "syntax error" from sh').toBe(true);
  });

  it('the command surface module dist/cli.js the bin wires into exists', async () => {
    await expect(access(join(pkgRoot, 'dist', 'cli.js'))).resolves.toBeUndefined();
  });
});

// F-45ad6263 — translated READMEs imported phantom translateMarkdown / ChatEngine.
describe('packaging: README import lists are live barrel names (F-45ad6263)', () => {
  function exportedNames(indexSrc: string): Set<string> {
    const names = new Set<string>();
    for (const m of indexSrc.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) {
      for (const part of m[1].split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const id = trimmed.split(/\s+as\s+/).pop()?.trim();
        if (id) names.add(id);
      }
    }
    return names;
  }

  function importedFromOllama(readme: string): string[] {
    const names: string[] = [];
    const re = /import\s+\{([^}]+)\}\s+from\s+['"]@ai-rpg-engine\/ollama['"]/g;
    for (const m of readme.matchAll(re)) {
      for (const part of m[1].split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const id = trimmed.split(/\s+as\s+/)[0]?.replace(/\s+type\s+/, '').trim();
        if (id) names.push(id);
      }
    }
    return names;
  }

  it('every README*.md import list is a subset of the package exports map', async () => {
    const indexSrc = await readFile(join(pkgRoot, 'src', 'index.ts'), 'utf-8');
    const exported = exportedNames(indexSrc);
    const files = (await readdir(pkgRoot)).filter((f) => /^README(.*)?\.md$/i.test(f));
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const file of files) {
      const src = await readFile(join(pkgRoot, file), 'utf-8');
      expect(src).not.toMatch(/translateMarkdown/);
      expect(src).not.toMatch(/new ChatEngine\b/);
      for (const name of importedFromOllama(src)) {
        expect(exported.has(name), `${file} imports ${name} which is not exported from index.ts`).toBe(true);
      }
    }
  });
});
