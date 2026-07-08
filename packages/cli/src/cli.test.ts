import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const bin = path.resolve(import.meta.dirname, '../dist/bin.js');

function run(...args: string[]): string {
  return execFileSync('node', [bin, ...args], {
    encoding: 'utf-8',
    timeout: 10_000,
  }).trim();
}

/** Run the bin and capture stdout+stderr+exit code without throwing on nonzero exit. */
function runResult(...args: string[]): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [bin, ...args], {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout: stdout.toString(), stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      code: typeof e.status === 'number' ? e.status : 1,
      stdout: (e.stdout ?? '').toString(),
      stderr: (e.stderr ?? '').toString(),
    };
  }
}

describe('CLI', () => {
  it('--version prints version', () => {
    const out = run('--version');
    expect(out).toBe(`ai-rpg-engine v${version}`);
  });

  it('-v prints version', () => {
    const out = run('-v');
    expect(out).toBe(`ai-rpg-engine v${version}`);
  });

  it('version command prints version', () => {
    const out = run('version');
    expect(out).toBe(`ai-rpg-engine v${version}`);
  });

  it('--help prints usage', () => {
    const out = run('--help');
    expect(out).toContain('Usage: ai-rpg-engine');
    expect(out).toContain('Commands:');
    expect(out).toContain('run');
    expect(out).toContain('replay');
    expect(out).toContain('inspect-save');
  });

  it('unknown command exits with error', () => {
    expect(() => run('nonsense')).toThrow();
  });

  // CLI-011 — `<command> --help` must route into that command's own help, not
  // the top-level help. Verified for create-starter (the command with a distinct
  // help screen).
  it('create-starter --help shows create-starter help, not top-level help', () => {
    const out = run('create-starter', '--help');
    // create-starter-specific content
    expect(out).toContain('create-starter <name>');
    expect(out).toContain('Examples:');
    // NOT the top-level command list
    expect(out).not.toContain('inspect-save');
  });

  it('create-starter -h shows create-starter help', () => {
    const out = run('create-starter', '-h');
    expect(out).toContain('create-starter <name>');
  });

  it('top-level --help still shows the command list', () => {
    const out = run('--help');
    expect(out).toContain('inspect-save');
    expect(out).toContain('create-starter');
    // content-dx: the newly-implemented commands appear in the top-level help.
    expect(out).toContain('validate');
    expect(out).toContain('scaffold');
  });
});

// content-dx — end-to-end through the real binary: validate + scaffold wired into bin.ts,
// and scaffold output passing validate. Also re-asserts the pre-existing commands still
// route (regression guard for the switch edit).
describe('CLI validate + scaffold (content-dx)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-cli-dx-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('validate exits 0 on a valid pack', () => {
    const file = path.join(tmpDir, 'good.json');
    fs.writeFileSync(file, JSON.stringify({ zones: [{ id: 'z', name: 'Z', neighbors: [] }] }), 'utf-8');
    const r = runResult('validate', file);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/valid/i);
  });

  it('validate exits nonzero and reports a structured error on a bad pack', () => {
    const file = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(file, JSON.stringify({ entities: [{ id: '', type: 'x', name: 'Y' }] }), 'utf-8');
    const r = runResult('validate', file);
    expect(r.code).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/✗/);
  });

  it('validate exits nonzero on malformed JSON', () => {
    const file = path.join(tmpDir, 'broken.json');
    fs.writeFileSync(file, '{ "zones": [ ', 'utf-8');
    const r = runResult('validate', file);
    expect(r.code).not.toBe(0);
    expect((r.stdout + r.stderr).toLowerCase()).toContain('json');
  });

  it('validate --help shows its own help, not the top-level list', () => {
    const out = run('validate', '--help');
    expect(out).toContain('validate <file.json>');
    expect(out).not.toContain('inspect-save');
  });

  it('scaffold writes a stub that then passes validate (round-trip through the binary)', () => {
    const file = path.join(tmpDir, 'status.json');
    const scaffoldRes = runResult('scaffold', 'status', 'on-fire', `--out=${file}`);
    expect(scaffoldRes.code).toBe(0);
    expect(fs.existsSync(file)).toBe(true);

    const validateRes = runResult('validate', file);
    expect(validateRes.code).toBe(0);
    expect(validateRes.stdout).toMatch(/valid/i);
  });

  it('scaffold exits nonzero on an unknown kind', () => {
    const r = runResult('scaffold', 'monster', 'grumpkin', `--out=${path.join(tmpDir, 'x.json')}`);
    expect(r.code).not.toBe(0);
    expect((r.stdout + r.stderr).toLowerCase()).toMatch(/kind/);
  });

  it('scaffold --help shows scaffold usage', () => {
    const out = run('scaffold', '--help');
    expect(out).toContain('scaffold <kind> <name>');
    expect(out).not.toContain('inspect-save');
  });

  // Regression: the pre-existing commands must still route after the switch edit.
  it('still routes inspect-save (no save file → exits 1 as before)', () => {
    const r = runResult('inspect-save');
    // Either a save exists (0) or not (1) depending on cwd; the point is it routes and
    // does not crash with "Unknown command".
    expect(r.stdout + r.stderr).not.toMatch(/Unknown command/);
  });
});

// prod-readiness — end-to-end through the real binary: `profile validate` +
// `profile scaffold` wired into bin.ts, and the scaffolded stub passing validate
// (the same round-trip contract the content scaffold pins above).
describe('CLI profile (entity profiles)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-cli-profile-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('profile scaffold writes a stub that then passes profile validate (round-trip through the binary)', () => {
    const file = path.join(tmpDir, 'mystic.profile.json');
    const scaffoldRes = runResult('profile', 'scaffold', 'mystic', `--out=${file}`);
    expect(scaffoldRes.code).toBe(0);
    expect(fs.existsSync(file)).toBe(true);

    const validateRes = runResult('profile', 'validate', file);
    expect(validateRes.code).toBe(0);
    expect(validateRes.stdout).toMatch(/valid/i);
  });

  it('profile validate exits nonzero with a structured error on a non-profile file', () => {
    const file = path.join(tmpDir, 'not-a-profile.json');
    fs.writeFileSync(file, JSON.stringify({ zones: [] }), 'utf-8');
    const r = runResult('profile', 'validate', file);
    expect(r.code).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('PROFILE_SHAPE_INVALID');
  });

  it('profile --help shows its own help, not the top-level list (CLI-011)', () => {
    const out = run('profile', '--help');
    expect(out).toContain('profile validate <file.json>');
    expect(out).not.toContain('inspect-save');
  });

  it('top-level --help lists the profile command', () => {
    const out = run('--help');
    expect(out).toContain('profile');
  });
});
