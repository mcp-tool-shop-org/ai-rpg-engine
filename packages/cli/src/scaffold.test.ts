import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { scaffoldContent, SCAFFOLD_KINDS, runScaffold } from './scaffold.js';
import { loadContentFromFile } from '@ai-rpg-engine/content-schema';

// content-dx: `ai-rpg-engine scaffold <kind> <name>` writes a minimal VALID content
// stub (matching the content-schema shapes) the author can fill in. It reuses
// create-starter's safe-write discipline: name validation, no overwrite without
// --force, structured errors. "Valid" means the written stub passes `validate`
// (loadContentFromFile reports ok:true) — this is the load-bearing contract.

describe('scaffoldContent', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-scaffold-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exposes the five advertised kinds', () => {
    expect([...SCAFFOLD_KINDS].sort()).toEqual(
      ['ability', 'dialogue', 'quest', 'status', 'zone'].sort(),
    );
  });

  // The core contract: every kind's stub must pass validate (round-trips through
  // loadContentFromFile with ok:true and zero errors).
  for (const kind of ['ability', 'zone', 'quest', 'status', 'dialogue'] as const) {
    it(`writes a ${kind} stub that passes validate`, () => {
      const outFile = path.join(tmpDir, `${kind}-stub.json`);
      const written = scaffoldContent({ kind, name: `my-${kind}`, outFile });

      expect(written).toBe(outFile);
      expect(fs.existsSync(outFile)).toBe(true);

      // It must be valid JSON.
      const text = fs.readFileSync(outFile, 'utf-8');
      expect(() => JSON.parse(text)).not.toThrow();

      // And it must pass full validation (structural + cross-ref).
      const result = loadContentFromFile(outFile);
      expect(result.errors).toEqual([]);
      expect(result.ok).toBe(true);
    });
  }

  it('embeds the provided name into the stub id', () => {
    const outFile = path.join(tmpDir, 'named.json');
    scaffoldContent({ kind: 'status', name: 'on-fire', outFile });
    const pack = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
    expect(pack.statuses[0].id).toBe('on-fire');
  });

  it('rejects an unknown kind with a structured error', () => {
    const outFile = path.join(tmpDir, 'x.json');
    expect(() => scaffoldContent({ kind: 'monster' as never, name: 'x', outFile })).toThrow(
      /unknown kind|one of/i,
    );
  });

  it('rejects an invalid name (same rule as create-starter)', () => {
    const outFile = path.join(tmpDir, 'x.json');
    expect(() => scaffoldContent({ kind: 'zone', name: 'Bad Name!', outFile })).toThrow(
      /invalid.*name/i,
    );
    expect(() => scaffoldContent({ kind: 'zone', name: 'my--zone', outFile })).toThrow(
      /invalid.*name/i,
    );
    expect(() => scaffoldContent({ kind: 'zone', name: '-leading', outFile })).toThrow(
      /invalid.*name/i,
    );
  });

  it('refuses to overwrite an existing file without --force', () => {
    const outFile = path.join(tmpDir, 'exists.json');
    fs.writeFileSync(outFile, '{"keep":true}', 'utf-8');
    expect(() => scaffoldContent({ kind: 'zone', name: 'zone-a', outFile })).toThrow(
      /already exists/i,
    );
    // The original file is untouched.
    expect(JSON.parse(fs.readFileSync(outFile, 'utf-8'))).toEqual({ keep: true });
  });

  it('overwrites an existing file with force:true', () => {
    const outFile = path.join(tmpDir, 'overwrite.json');
    fs.writeFileSync(outFile, '{"keep":true}', 'utf-8');
    scaffoldContent({ kind: 'zone', name: 'zone-a', outFile, force: true });
    const pack = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
    expect(pack.zones[0].id).toBe('zone-a');
  });

  it('is deterministic — same kind+name yields byte-identical output', () => {
    const a = path.join(tmpDir, 'a.json');
    const b = path.join(tmpDir, 'b.json');
    scaffoldContent({ kind: 'ability', name: 'fireball', outFile: a });
    scaffoldContent({ kind: 'ability', name: 'fireball', outFile: b });
    expect(fs.readFileSync(a, 'utf-8')).toBe(fs.readFileSync(b, 'utf-8'));
  });
});

// runScaffold is the CLI-facing entry: it parses argv-style args, validates them,
// prints structured errors, and exits nonzero on failure (mirrors runCreateStarter).
describe('runScaffold (CLI entry)', () => {
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-runscaffold-test-'));
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit__${code ?? 0}`);
    }) as never);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    errSpy.mockRestore();
    logSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes a stub to the named --out file and does not exit on success', () => {
    const outFile = path.join(tmpDir, 'q.json');
    runScaffold(['quest', 'rescue-the-mayor', `--out=${outFile}`]);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(fs.existsSync(outFile)).toBe(true);
    const result = loadContentFromFile(outFile);
    expect(result.ok).toBe(true);
  });

  it('exits nonzero with a structured error on an unknown kind', () => {
    expect(() => runScaffold(['monster', 'grumpkin', `--out=${path.join(tmpDir, 'x.json')}`])).toThrow(
      /__exit__/,
    );
    const combined = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(combined).toMatch(/kind/i);
  });

  it('exits nonzero when name is missing', () => {
    expect(() => runScaffold(['zone'])).toThrow(/__exit__/);
  });

  it('--help prints scaffold usage and does not exit nonzero', () => {
    runScaffold(['--help']);
    const combined = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(combined).toMatch(/scaffold/i);
    expect(combined).toMatch(/ability|zone|quest|status|dialogue/);
  });
});
