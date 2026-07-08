// v2.5 audit A2 (MED, security): the CLI's emit() --write branch landed
// AI-generated output on disk with no withinRoot sandbox — the ONE write path
// lacking the confinement every other write (apply-preview/applyConfirmed)
// enforces. The invariant: a --write target that escapes the project root is
// rejected with a structured error and exit code 1, and NOTHING is written.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { emit } from './cli.js';

let tmpDir: string;
let projectRoot: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-emit-'));
  projectRoot = path.join(tmpDir, 'project');
  await fs.mkdir(projectRoot, { recursive: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function trapExit() {
  return vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`exit:${code}`);
  }) as never);
}

describe('cli emit() --write sandbox (A2)', () => {
  it('rejects a --write target that escapes the project root and writes nothing', async () => {
    const escapePath = path.join(tmpDir, 'escape.txt'); // sibling of projectRoot — outside it
    const exitSpy = trapExit();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(emit('model output', escapePath, projectRoot)).rejects.toThrow('exit:1');

    expect(exitSpy).toHaveBeenCalledWith(1);
    await expect(fs.access(escapePath)).rejects.toThrow(); // nothing written
    const stderr = errSpy.mock.calls.flat().join('\n');
    expect(stderr).toMatch(/escapes the project root/i);
  });

  it('rejects the literal ../ traversal shape (--write ../escape)', async () => {
    // What `--write ../escape.txt` resolves to when run from the project root.
    const escapePath = path.join(projectRoot, '..', 'escape-rel.txt');
    trapExit();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(emit('model output', escapePath, projectRoot)).rejects.toThrow('exit:1');
    await expect(fs.access(path.join(tmpDir, 'escape-rel.txt'))).rejects.toThrow();
  });

  it('still writes inside the project root, creating parent directories', async () => {
    const target = path.join(projectRoot, 'out', 'generated.yaml');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await emit('id: room-1\n', target, projectRoot);

    expect(await fs.readFile(target, 'utf-8')).toBe('id: room-1\n');
  });

  it('without --write, emits to stdout and touches no files', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await emit('plain output', undefined, projectRoot);

    expect(logSpy).toHaveBeenCalledWith('plain output');
  });
});
