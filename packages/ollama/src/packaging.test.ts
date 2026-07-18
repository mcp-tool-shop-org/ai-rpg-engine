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
import { readFile, access } from 'node:fs/promises';
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
    expect(src.startsWith('#!/usr/bin/env node\n')).toBe(true);
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
