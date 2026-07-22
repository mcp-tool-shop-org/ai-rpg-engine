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

// F-SEED-combat-rolls-seed-blind — seed plumbing end-to-end through the real
// binary. The mini-pack fixture (createGame(seed = 1)) proves the external
// pass-through: the printed seed line reads world.meta.seed back out of the
// constructed engine, so 'Seed: 4242' on screen means the seed actually
// reached WorldStore. Scripted stdin is a supported drive mode (prompts.ts
// queues piped lines).
describe('CLI run seeds e2e (F-SEED-combat-rolls-seed-blind)', () => {
  const MINI_PACK = path.resolve(import.meta.dirname, '../test-fixtures/mini-pack');
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-cli-seed-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Drive one scripted session in an isolated cwd (no save file → no resume offer). */
  function runSession(args: string[], input: string): { code: number; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync('node', [bin, ...args], {
        encoding: 'utf-8',
        timeout: 15_000,
        input,
        cwd: tmpDir,
        stdio: ['pipe', 'pipe', 'pipe'],
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

  it.each([
    ['letters', ['run', '--seed', 'abc']],
    ['float', ['run', '--seed', '1.5']],
    ['negative', ['run', '--seed', '-7']],
    ['missing value', ['run', '--seed']],
  ])('rejects an invalid --seed (%s) with INVALID_SEED + hint, exit 1, before anything interactive', (_label, args) => {
    const r = runSession(args as string[], '');
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('INVALID_SEED');
    expect(r.stderr).toContain('Hint:');
  });

  it('an external pack run honors --seed: the printed line reads the world truth and the replay command includes the path', () => {
    const r = runSession(['run', MINI_PACK, '--seed', '4242'], 'quit\n');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Seed: 4242');
    expect(r.stdout).toContain(`ai-rpg-engine run ${MINI_PACK} --seed 4242`);
  });

  it('without --seed, a fresh session MINTS a seed and prints it with the replay affordance', () => {
    const r = runSession(['run', MINI_PACK], 'quit\n');
    expect(r.code).toBe(0);
    const m = r.stdout.match(/Seed: (\d+) — replay this run with: ai-rpg-engine run .+ --seed (\d+)/);
    expect(m, `no seed line in stdout:\n${r.stdout.slice(0, 400)}`).not.toBeNull();
    expect(m![1]).toBe(m![2]);
    expect(Number(m![1])).toBeLessThan(1_000_000);
  });

  it('two mint-seeded runs differ; two runs with the same --seed are byte-identical on the same script', () => {
    const seedOf = (out: string) => out.match(/Seed: (\d+)/)?.[1];

    // Minted seeds differ across runs (three strikes so a 1-in-a-million
    // collision cannot flake the suite).
    const s1 = seedOf(runSession(['run', MINI_PACK], 'quit\n').stdout);
    const s2 = seedOf(runSession(['run', MINI_PACK], 'quit\n').stdout);
    const s3 = s1 === s2 ? seedOf(runSession(['run', MINI_PACK], 'quit\n').stdout) : s2;
    expect(s1).toBeDefined();
    expect(new Set([s1, s2, s3]).size).toBeGreaterThan(1);

    // Same --seed, same input script → byte-identical stdout (no timestamps,
    // no wall-clock anywhere on the quit path).
    const a = runSession(['run', MINI_PACK, '--seed', '777'], 'quit\n');
    const b = runSession(['run', MINI_PACK, '--seed', '777'], 'quit\n');
    expect(a.code).toBe(0);
    expect(a.stdout).toBe(b.stdout);
    expect(a.stdout).toContain('Seed: 777');
  });
});
