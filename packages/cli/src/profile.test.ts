import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runProfile, buildProfileStub } from './profile.js';

// prod-readiness: `ai-rpg-engine profile validate <file.json>` loads one or more
// Profiles from a JSON file and runs the modules package's REAL validators —
// buildProfile (per-profile packaging warnings, warn-and-degrade) and
// validateProfileSet (cross-profile errors + advisories). Errors block (exit 1);
// warnings and advisories are printed separately and never affect the exit code.
// `ai-rpg-engine profile scaffold <name>` writes a starter profile that passes
// `profile validate` with zero errors AND zero warnings out of the box (the same
// "valid out of the box" contract scaffold.ts pins for content stubs).
//
// runProfile is written test-first to RETURN its exit code and accept an injected
// logger, so we can assert behavior without spawning a process or stubbing
// process.exit (the runValidate pattern). bin.ts converts the code to process.exit.

function capture() {
  const lines: string[] = [];
  return { log: (m: string) => lines.push(m), lines, text: () => lines.join('\n') };
}

/** A minimal clean profile: distinct stat names, one non-free ability, no tags. */
function cleanProfile(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: id.toUpperCase(),
    statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
    abilities: [
      {
        id: `${id}-strike`,
        name: `${id} strike`,
        verb: 'cast',
        tags: ['ability'],
        target: { type: 'self' },
        effects: [{ type: 'log', params: { message: 'resolves.' } }],
        cooldown: 1,
      },
    ],
    ...overrides,
  };
}

describe('runProfile — validate subcommand', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-profile-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(name: string, contents: unknown): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, typeof contents === 'string' ? contents : JSON.stringify(contents), 'utf-8');
    return p;
  }

  it('exits 0 on a valid single-profile file', () => {
    const file = writeFile('fighter.json', cleanProfile('fighter'));
    const out = capture();
    const code = runProfile(['validate', file], { log: out.log, error: out.log });
    expect(code).toBe(0);
    expect(out.text()).toMatch(/valid/i);
    expect(out.text()).toContain('fighter');
  });

  it('exits 0 on a profile-set file ({ "profiles": [...] })', () => {
    const file = writeFile('party.json', {
      profiles: [cleanProfile('fighter'), cleanProfile('mystic')],
    });
    const out = capture();
    const code = runProfile(['validate', file], { log: out.log, error: out.log });
    expect(code).toBe(0);
    expect(out.text()).toMatch(/valid/i);
    // Both profile ids appear in the summary.
    expect(out.text()).toContain('fighter');
    expect(out.text()).toContain('mystic');
  });

  it('exits 0 on a bare array of profiles', () => {
    const file = writeFile('array.json', [cleanProfile('fighter'), cleanProfile('mystic')]);
    const out = capture();
    const code = runProfile(['validate', file], { log: out.log, error: out.log });
    expect(code).toBe(0);
    expect(out.text()).toMatch(/valid/i);
  });

  it('exits nonzero and reports the structured cross-profile error on a duplicate ability id', () => {
    // Both profiles define ability id "cleave" — a hard validateProfileSet error.
    const a = cleanProfile('fighter');
    const b = cleanProfile('mystic');
    (a.abilities as Record<string, unknown>[])[0].id = 'cleave';
    (b.abilities as Record<string, unknown>[])[0].id = 'cleave';
    const file = writeFile('dupes.json', { profiles: [a, b] });
    const out = capture();
    const errOut = capture();
    const code = runProfile(['validate', file], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    // Structured shape: the ProfileSet path and the offending id both appear.
    expect(errOut.text()).toContain('cleave');
    expect(errOut.text()).toMatch(/ProfileSet/);
  });

  it('prints cross-profile advisories separately and still exits 0', () => {
    // "grit" maps to attack in one profile and resolve in the other — semantic
    // drift is an advisory, never an error.
    const a = cleanProfile('fighter', {
      statMapping: { attack: 'grit', precision: 'agility', resolve: 'will' },
    });
    const b = cleanProfile('mystic', {
      statMapping: { attack: 'might', precision: 'agility', resolve: 'grit' },
    });
    const file = writeFile('drift.json', { profiles: [a, b] });
    const out = capture();
    const code = runProfile(['validate', file], { log: out.log, error: out.log });
    expect(code).toBe(0);
    const text = out.text();
    expect(text.toLowerCase()).toContain('advisor');
    expect(text).toContain('grit');
  });

  it('prints per-profile build warnings (non-blocking) and still exits 0', () => {
    // Zero cost + zero cooldown trips validateAbilityPack's advisory, which
    // buildProfile surfaces as a warning. Warnings never affect the exit code.
    const p = cleanProfile('fighter');
    (p.abilities as Record<string, unknown>[])[0].cooldown = 0;
    const file = writeFile('warn.json', p);
    const out = capture();
    const code = runProfile(['validate', file], { log: out.log, error: out.log });
    expect(code).toBe(0);
    const text = out.text().toLowerCase();
    expect(text).toContain('warning');
    expect(text).toContain('zero cost');
  });

  it('exits nonzero with a structured shape error when the JSON is not profile-shaped', () => {
    // A content pack, not a profile — missing id/name/statMapping/abilities.
    const file = writeFile('pack.json', { zones: [{ id: 'z', name: 'Z', neighbors: [] }] });
    const out = capture();
    const errOut = capture();
    const code = runProfile(['validate', file], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    const combined = errOut.text();
    expect(combined).toContain('PROFILE_SHAPE_INVALID');
    expect(combined).toContain('statMapping');
  });

  it('exits nonzero when a profile in a set is structurally broken (missing statMapping role)', () => {
    const bad = cleanProfile('broken', {
      statMapping: { attack: 'might', precision: 'agility' }, // no resolve
    });
    const file = writeFile('bad-mapping.json', { profiles: [cleanProfile('fighter'), bad] });
    const out = capture();
    const errOut = capture();
    const code = runProfile(['validate', file], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    // The offending profile and field are both named.
    expect(errOut.text()).toContain('broken');
    expect(errOut.text()).toContain('resolve');
  });

  it('exits nonzero on an empty profile set', () => {
    const file = writeFile('empty.json', { profiles: [] });
    const out = capture();
    const errOut = capture();
    const code = runProfile(['validate', file], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect(errOut.text().toLowerCase()).toMatch(/no profiles/);
  });

  it('exits nonzero with a structured error when the file is missing', () => {
    const out = capture();
    const errOut = capture();
    const code = runProfile(['validate', path.join(tmpDir, 'nope.json')], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect((out.text() + errOut.text()).toLowerCase()).toMatch(/read|not found|exist|file/);
  });

  it('exits nonzero with a structured error when the JSON is malformed', () => {
    const file = writeFile('broken.json', '{ "id": "x", ');
    const out = capture();
    const errOut = capture();
    const code = runProfile(['validate', file], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect((out.text() + errOut.text()).toLowerCase()).toContain('json');
  });

  it('exits nonzero with usage when no file argument is given', () => {
    const out = capture();
    const errOut = capture();
    const code = runProfile(['validate'], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect((out.text() + errOut.text()).toLowerCase()).toMatch(/usage|file|provide/);
  });
});

describe('runProfile — subcommand routing', () => {
  it('--help prints profile usage and exits 0', () => {
    const out = capture();
    const code = runProfile(['--help'], { log: out.log, error: out.log });
    expect(code).toBe(0);
    const text = out.text();
    expect(text).toContain('profile validate <file.json>');
    expect(text).toContain('profile scaffold <name>');
  });

  it('exits nonzero with usage when the subcommand is missing', () => {
    const out = capture();
    const errOut = capture();
    const code = runProfile([], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect(errOut.text()).toContain('PROFILE_SUBCOMMAND_MISSING');
    expect(out.text()).toContain('profile validate <file.json>');
  });

  it('exits nonzero on an unknown subcommand', () => {
    const out = capture();
    const errOut = capture();
    const code = runProfile(['frobnicate'], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect(errOut.text()).toContain('PROFILE_SUBCOMMAND_UNKNOWN');
    expect(errOut.text()).toContain('frobnicate');
  });
});

describe('runProfile — scaffold subcommand', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-profile-scaffold-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes a profile stub and exits 0', () => {
    const target = path.join(tmpDir, 'storm-mystic.profile.json');
    const out = capture();
    const code = runProfile(['scaffold', 'storm-mystic', `--out=${target}`], { log: out.log, error: out.log });
    expect(code).toBe(0);
    expect(fs.existsSync(target)).toBe(true);
    const written = JSON.parse(fs.readFileSync(target, 'utf-8'));
    expect(written.id).toBe('storm-mystic');
    expect(written.statMapping).toHaveProperty('attack');
    expect(written.statMapping).toHaveProperty('precision');
    expect(written.statMapping).toHaveProperty('resolve');
    expect(Array.isArray(written.abilities)).toBe(true);
  });

  it('scaffolded stub passes profile validate with zero errors AND zero warnings (round-trip)', () => {
    const target = path.join(tmpDir, 'clean.profile.json');
    const scaffoldOut = capture();
    expect(runProfile(['scaffold', 'clean', `--out=${target}`], { log: scaffoldOut.log, error: scaffoldOut.log })).toBe(0);

    const out = capture();
    const code = runProfile(['validate', target], { log: out.log, error: out.log });
    expect(code).toBe(0);
    const text = out.text().toLowerCase();
    expect(text).toMatch(/valid/);
    // The "valid out of the box" contract is strict: no warnings, no advisories.
    expect(text).not.toContain('warning');
    expect(text).not.toContain('advisor');
  });

  it('stub output is deterministic (byte-identical for the same name)', () => {
    expect(JSON.stringify(buildProfileStub('ash-ranger'))).toBe(JSON.stringify(buildProfileStub('ash-ranger')));
  });

  it('refuses to overwrite an existing file without --force', () => {
    const target = path.join(tmpDir, 'dup.profile.json');
    fs.writeFileSync(target, '{}', 'utf-8');
    const out = capture();
    const errOut = capture();
    const code = runProfile(['scaffold', 'dup', `--out=${target}`], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect(errOut.text().toLowerCase()).toContain('exists');
    // The pre-existing file is untouched.
    expect(fs.readFileSync(target, 'utf-8')).toBe('{}');
  });

  it('--force overwrites an existing file', () => {
    const target = path.join(tmpDir, 'dup2.profile.json');
    fs.writeFileSync(target, '{}', 'utf-8');
    const out = capture();
    const code = runProfile(['scaffold', 'dup2', `--out=${target}`, '--force'], { log: out.log, error: out.log });
    expect(code).toBe(0);
    expect(JSON.parse(fs.readFileSync(target, 'utf-8')).id).toBe('dup2');
  });

  it('rejects an invalid name (same rule as scaffold/create-starter)', () => {
    const out = capture();
    const errOut = capture();
    const code = runProfile(['scaffold', 'Bad_Name', `--out=${path.join(tmpDir, 'x.json')}`], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect(errOut.text().toLowerCase()).toMatch(/name/);
    expect(fs.existsSync(path.join(tmpDir, 'x.json'))).toBe(false);
  });

  it('exits nonzero when <name> is missing', () => {
    const out = capture();
    const errOut = capture();
    const code = runProfile(['scaffold'], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect(errOut.text()).toContain('PROFILE_NAME_MISSING');
  });

  it('exits nonzero when --out is present but empty (CLI-012 guard)', () => {
    const out = capture();
    const errOut = capture();
    const code = runProfile(['scaffold', 'fine-name', '--out='], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect(errOut.text()).toContain('CLI_OUT_EMPTY');
  });
});
