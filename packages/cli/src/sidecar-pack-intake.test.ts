// sidecar-pack-intake.test.ts — F-c6ff0f97 (cli-side half): a pack producing
// a dropped/advised field lands 1:1 in the constructed serverOptions.packIntake.
//
// startStdioServer/startSocketServer are mocked here (not spawned, not real
// sockets) so the test can inspect the exact object sidecar-command.ts hands
// them — the most direct proof of "the constructed serverOptions carries
// packIntake" the finding's own test-plan note names as an acceptable
// approach ("capture the startStdioServer/startSocketServer args"). This
// file mocks @ai-rpg-engine/sidecar for exactly this reason and therefore
// stays SEPARATE from c4-content-intake.test.ts, which deliberately runs the
// real transport (`--listen 0`) and would break under a module-wide mock.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const startStdioServer = vi.fn();
const startSocketServer = vi.fn();

vi.mock('@ai-rpg-engine/sidecar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ai-rpg-engine/sidecar')>();
  return {
    ...actual,
    startStdioServer: (...args: unknown[]) => startStdioServer(...args),
    startSocketServer: (...args: unknown[]) => startSocketServer(...args),
  };
});

import { runSidecar } from './sidecar-command.js';
import { ENGINE_VERSION } from './engine-version.js';

const HOST_PACK = 'chapel-threshold';

/** Mirrors c4-content-intake.test.ts's own writePack/writeManifest pattern. */
function writePack(pack: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sidecar-pack-intake-'));
  const file = path.join(dir, 'pack.json');
  fs.writeFileSync(file, JSON.stringify(pack), 'utf-8');
  return file;
}

function writeManifest(packFile: string, manifest: unknown = { engineVersion: `>=${ENGINE_VERSION}` }): string {
  const file = path.join(path.dirname(packFile), 'manifest.json');
  fs.writeFileSync(file, JSON.stringify(manifest), 'utf-8');
  return file;
}

const MINIMAL_PACK = {
  schemaVersion: '1.0.0',
  zones: [
    {
      id: 'test-drop-zone',
      name: 'Test Drop Zone',
      tags: ['exterior'],
      neighbors: [],
    },
  ],
};

describe('sidecar-command: PackIntakeSummary capture (F-c6ff0f97 cli-side half)', () => {
  beforeEach(() => {
    startStdioServer.mockClear();
    startSocketServer.mockClear();
  });

  it('a pack producing a dropped field lands 1:1 in the constructed serverOptions.packIntake', async () => {
    const file = writePack({
      ...MINIMAL_PACK,
      zones: [
        {
          ...MINIMAL_PACK.zones[0],
          // A TextBlock[] shape the runtime has no field for — the same
          // proven dropped-field fixture c4-content-intake.test.ts uses.
          description: [{ text: 'Prose the runtime has no field for.' }],
        },
      ],
    });
    const man = writeManifest(file);

    const code = await runSidecar(
      [HOST_PACK, '--content', file, '--manifest', man, '--start', 'test-drop-zone'],
      { error: () => {} },
    );

    expect(code).toBeNull(); // stdio transport: the command keeps the process alive
    expect(startStdioServer).toHaveBeenCalledTimes(1);
    expect(startSocketServer).not.toHaveBeenCalled();

    const serverOptions = startStdioServer.mock.calls[0][0] as {
      packIntake?: { dropped: Array<{ path: string; reason: string; detail: string }>; advisories: unknown[] };
    };
    expect(serverOptions.packIntake).toBeDefined();
    // dropped is the thing THIS test pins; advisories (the gate's own
    // "not verified" notices for the omitted modules/contentHash fields)
    // are covered by the dedicated advisories tests below — not asserted
    // here to keep this test focused on the dropped-field path.
    expect(serverOptions.packIntake!.dropped).toHaveLength(1);
    expect(serverOptions.packIntake!.dropped[0].path).toBe('zones[0](test-drop-zone).description');
    expect(typeof serverOptions.packIntake!.dropped[0].reason).toBe('string');
    expect(typeof serverOptions.packIntake!.dropped[0].detail).toBe('string');
  });

  it('a pack with nothing DROPPED but a manifest that omits modules/contentHash still carries the gate\'s own "not verified" advisories — 1:1, dropped: []', async () => {
    // Nothing here is dropped (MINIMAL_PACK's zone carries no unsupported
    // field), but omitting manifest.modules / manifest.contentHash is a real,
    // honest gap the load gate reports as an advisory rather than silently
    // treating as verified — see gate.ts's checkModuleIds/checkContentHash.
    const file = writePack(MINIMAL_PACK);
    const man = writeManifest(file);

    await runSidecar(
      [HOST_PACK, '--content', file, '--manifest', man, '--start', 'test-drop-zone'],
      { error: () => {} },
    );

    const serverOptions = startStdioServer.mock.calls[0][0] as {
      packIntake?: { dropped: unknown[]; advisories: Array<{ path: string; message: string }> };
    };
    expect(serverOptions.packIntake).toBeDefined();
    expect(serverOptions.packIntake!.dropped).toEqual([]);
    expect(serverOptions.packIntake!.advisories.length).toBeGreaterThan(0);
    expect(serverOptions.packIntake!.advisories.every((a) => typeof a.path === 'string' && typeof a.message === 'string')).toBe(true);
  });

  it('a pack with truly nothing to report (modules: [] declared, so module-ids is actually verified) still gets the content-hash "not verified" advisory — packIntake is never a false "all clear"', async () => {
    // Isolates the OTHER half: declaring modules explicitly (even empty)
    // satisfies checkModuleIds outright (no skip, no advisory) — proving
    // packIntake tracks the gate's REAL verdict per check, not a blanket
    // "any manifest omission" catch-all.
    const file = writePack(MINIMAL_PACK);
    const man = writeManifest(file, { engineVersion: `>=${ENGINE_VERSION}`, modules: [] });

    await runSidecar(
      [HOST_PACK, '--content', file, '--manifest', man, '--start', 'test-drop-zone'],
      { error: () => {} },
    );

    const serverOptions = startStdioServer.mock.calls[0][0] as {
      packIntake?: { dropped: unknown[]; advisories: Array<{ path: string; message: string }> };
    };
    expect(serverOptions.packIntake).toBeDefined();
    expect(serverOptions.packIntake!.dropped).toEqual([]);
    expect(serverOptions.packIntake!.advisories.some((a) => a.path === 'gate.module-ids')).toBe(false);
    expect(serverOptions.packIntake!.advisories.some((a) => a.path === 'gate.content-hash')).toBe(true);
  });

  it('no --content at all: packIntake is absent — byte-compat with every sidecar session before this fix', async () => {
    const code = await runSidecar([HOST_PACK], { error: () => {} });
    expect(code).toBeNull();

    const serverOptions = startStdioServer.mock.calls[0][0] as Record<string, unknown>;
    expect('packIntake' in serverOptions).toBe(false);
  });
});
