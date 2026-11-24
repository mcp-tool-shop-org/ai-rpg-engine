import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { runValidate } from './validate.js';
import { FIXTURE_PACK_PATH } from './c0/fixture-path.js';

const FORGE_MANIFEST_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__/c1-forge-manifest.json',
);

// content-dx: `ai-rpg-engine validate <file.json>` loads + validates a content pack
// from a JSON file and prints a structured report: errors (path + message + hint) and
// advisories printed SEPARATELY. Exit code is 0 on valid, nonzero when there are errors.
// This is the command the package metadata already advertises but bin.ts never had.
//
// runValidate is written test-first to RETURN its exit code (0/nonzero) and accept an
// injected logger, so we can assert behavior without spawning a process or stubbing
// process.exit. bin.ts turns the returned code into process.exit.

function capture() {
  const lines: string[] = [];
  return { log: (m: string) => lines.push(m), lines, text: () => lines.join('\n') };
}

describe('runValidate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-validate-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writePack(name: string, contents: unknown): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, typeof contents === 'string' ? contents : JSON.stringify(contents), 'utf-8');
    return p;
  }

  it('exits 0 on a valid content pack', () => {
    const file = writePack('good.json', {
      entities: [{ id: 'player', type: 'player', name: 'Wanderer' }],
      zones: [{ id: 'cave', name: 'Cave', neighbors: [] }],
    });
    const out = capture();
    const code = runValidate([file], { log: out.log, error: out.log });
    expect(code).toBe(0);
    expect(out.text()).toMatch(/valid|ok|passed/i);
  });

  it('exits nonzero and reports structured errors (path + message) on a bad pack', () => {
    const file = writePack('bad.json', { entities: [{ id: '', type: 'x', name: 'Y' }] });
    const out = capture();
    const errOut = capture();
    const code = runValidate([file], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    const combined = out.text() + '\n' + errOut.text();
    // The path of the offending field must appear in the report.
    expect(combined).toMatch(/id/);
    // And a human message.
    expect(combined.length).toBeGreaterThan(0);
  });

  it('reports a hint line alongside errors (path + message + hint)', () => {
    // A dangling cross-reference error carries an actionable hint in its message.
    const file = writePack('bad-ref.json', {
      entities: [{ id: 'hero', type: 'player', name: 'Hero', startingStatuses: ['ghost-buff'] }],
      statuses: [{ id: 'real-buff', name: 'Real Buff', tags: ['buff'], stacking: 'refresh' }],
    });
    const out = capture();
    const code = runValidate([file], { log: out.log, error: out.log });
    expect(code).not.toBe(0);
    expect(out.text()).toContain('ghost-buff');
  });

  it('prints advisories SEPARATELY from errors and still exits 0 when there are no errors', () => {
    // One-way passage is an advisory, not an error → exit 0 but the advisory is shown.
    const file = writePack('advisory.json', {
      zones: [
        { id: 'a', name: 'A', neighbors: ['b'] },
        { id: 'b', name: 'B', neighbors: [] },
      ],
    });
    const out = capture();
    const code = runValidate([file], { log: out.log, error: out.log });
    expect(code).toBe(0);
    const text = out.text();
    expect(text.toLowerCase()).toContain('advisor');
    expect(text).toMatch(/one-way/);
  });

  it('exits nonzero with a structured error when the file is missing', () => {
    const out = capture();
    const errOut = capture();
    const code = runValidate([path.join(tmpDir, 'nope.json')], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect((out.text() + errOut.text()).toLowerCase()).toMatch(/read|not found|exist|file/);
  });

  it('exits nonzero with a structured error when the JSON is malformed', () => {
    const file = writePack('broken.json', '{ "zones": [ ');
    const out = capture();
    const errOut = capture();
    const code = runValidate([file], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect((out.text() + errOut.text()).toLowerCase()).toContain('json');
  });

  it('exits nonzero with usage when no file argument is given', () => {
    const out = capture();
    const errOut = capture();
    const code = runValidate([], { log: out.log, error: errOut.log });
    expect(code).not.toBe(0);
    expect((out.text() + errOut.text()).toLowerCase()).toMatch(/usage|file|provide/);
  });

  it('--help prints validate usage and exits 0', () => {
    const out = capture();
    const code = runValidate(['--help'], { log: out.log, error: out.log });
    expect(code).toBe(0);
    expect(out.text().toLowerCase()).toContain('validate');
  });

  it('uses the default console logger when no deps are injected (no throw)', () => {
    const file = writePack('good2.json', { zones: [{ id: 'z', name: 'Z', neighbors: [] }] });
    // Should not throw when deps omitted; returns 0 for a clean pack.
    expect(() => {
      const code = runValidate([file]);
      expect(code).toBe(0);
    }).not.toThrow();
  });

  // F-5c018d2c — `--manifest` must accept equals-form the way sidecar `readFlag`
  // and `parseRunArgs` already do. `indexOf('--manifest')` dropped `--manifest=…`
  // with no VALIDATE_MANIFEST_* error, left ctx.manifest unset, and a pack
  // stamped engine 2.x still printed ✓ Content valid and exited 0.
  it('--manifest=<file> with engineVersion 2.0.0 exits 1 with the gate report, not a green valid line', () => {
    const file = writePack('stale-pack.json', {
      entities: [{ id: 'player', type: 'player', name: 'Wanderer' }],
      zones: [{ id: 'cave', name: 'Cave', neighbors: [] }],
    });
    const man = writePack('stale-manifest.json', { engineVersion: '2.0.0' });
    const out = capture();
    const code = runValidate([file, `--manifest=${man}`], { log: out.log, error: out.log });
    expect(code).toBe(1);
    const text = out.text();
    expect(text).toContain('REFUSED');
    expect(text).toContain('engine-version');
    expect(text).toContain('2.0.0');
    expect(text).not.toMatch(/✓ Content valid/);
  });

  it('--manifest <file> space form still fires the engine-version gate', () => {
    const file = writePack('stale-pack-space.json', {
      entities: [{ id: 'player', type: 'player', name: 'Wanderer' }],
      zones: [{ id: 'cave', name: 'Cave', neighbors: [] }],
    });
    const man = writePack('stale-manifest-space.json', { engineVersion: '2.0.0' });
    const out = capture();
    const code = runValidate([file, '--manifest', man], { log: out.log, error: out.log });
    expect(code).toBe(1);
    expect(out.text()).toContain('engine-version');
    expect(out.text()).not.toMatch(/✓ Content valid/);
  });

  it('--json of a pack with an unknown key is parseable JSON with ok:false and a path in errors (F-e393db3c)', () => {
    const file = writePack('unknown-key.json', {
      entities: [{ id: 'player', type: 'player', name: 'Wanderer' }],
      zones: [{ id: 'cave', name: 'Cave', neighbors: [] }],
      totallyUnknownKey: true,
    });
    const out = capture();
    const code = runValidate([file, '--json'], { log: out.log, error: out.log });
    expect(code).toBe(1);
    const parsed = JSON.parse(out.text()) as { ok: boolean; errors: { path: string; message: string }[] };
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.some((e) => typeof e.path === 'string' && e.path.length > 0)).toBe(true);
    expect(out.text()).not.toMatch(/[─┌┐└┘│╔╗╚╝]/);
  });

  it('empty --manifest= is VALIDATE_MANIFEST_MISSING', () => {
    const file = writePack('needs-manifest.json', {
      zones: [{ id: 'z', name: 'Z', neighbors: [] }],
    });
    const out = capture();
    const code = runValidate([file, '--manifest='], { log: out.log, error: out.log });
    expect(code).toBe(1);
    expect(out.text()).toContain('VALIDATE_MANIFEST_MISSING');
    expect(out.text()).not.toMatch(/✓ Content valid/);
  });

  it('exits 1 on unresolved aiProfile or entityAi and exits 0 for built-in profiles', () => {
    const okFile = writePack('builtin-profile.json', {
      entities: [{ id: 'guard', type: 'npc', name: 'Guard', aiProfile: 'cautious' }],
      zones: [{ id: 'cave', name: 'Cave', neighbors: [] }],
    });
    const okOut = capture();
    expect(runValidate([okFile], { log: okOut.log, error: okOut.log })).toBe(0);

    const badFile = writePack('unresolved-profile.json', {
      entities: [{ id: 'grunt', type: 'npc', name: 'Grunt', aiProfile: 'ghost-brain' }],
      entityAi: { extra: { profileId: 'shadow-mind' } },
      zones: [{ id: 'cave', name: 'Cave', neighbors: [] }],
    });
    const errOut = capture();
    expect(runValidate([badFile], { log: errOut.log, error: errOut.log })).toBe(1);
    expect(errOut.text()).toContain('grunt');
    expect(errOut.text()).toContain('ghost-brain');
    expect(errOut.text()).toContain('shadow-mind');

    const jsonOut = capture();
    expect(runValidate([badFile, '--json'], { log: jsonOut.log, error: jsonOut.log })).toBe(1);
    const parsed = JSON.parse(jsonOut.text()) as {
      ok: boolean;
      errors: Array<{ code?: string; entityId?: string; profileId?: string }>;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'UNRESOLVED_AI_PROFILE', entityId: 'grunt', profileId: 'ghost-brain' }),
        expect.objectContaining({ code: 'UNRESOLVED_AI_PROFILE', entityId: 'extra', profileId: 'shadow-mind' }),
      ]),
    );
  });

  it('refuses the committed forge fixture consistently with sidecar --content', () => {
    const out = capture();
    const code = runValidate([FIXTURE_PACK_PATH, '--manifest', FORGE_MANIFEST_PATH], {
      log: out.log,
      error: out.log,
    });
    expect(code).toBe(1);
    expect(out.text()).toContain('npc-gantry-runner');
    expect(out.text()).toContain('skirmisher');
  });

  it('escapes control/ANSI characters in human error output while keeping raw ids in --json errors', () => {
    const rawId = `\x1b[31mevil\n_${'x'.repeat(80)}`;
    const rawProfile = `bad\x07profile_${'p'.repeat(80)}`;
    const file = writePack('ansi-profile.json', {
      entities: [{ id: rawId, type: 'npc', name: 'Evil', aiProfile: rawProfile }],
      zones: [{ id: 'cave', name: 'Cave', neighbors: [] }],
    });
    const out = capture();
    const code = runValidate([file], { log: out.log, error: out.log });
    expect(code).toBe(1);
    for (const line of out.lines) {
      expect(line).not.toMatch(/[\x00-\x1f\x7f-\x9f]/);
    }
    expect(out.text()).toContain('\\x1b[31m');
    expect(out.text()).toContain('...');

    const jsonOut = capture();
    expect(runValidate([file, '--json'], { log: jsonOut.log, error: jsonOut.log })).toBe(1);
    const parsed = JSON.parse(jsonOut.text()) as {
      ok: boolean;
      errors: Array<{ code?: string; entityId?: string; profileId?: string }>;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.errors).toContainEqual(
      expect.objectContaining({
        code: 'UNRESOLVED_AI_PROFILE',
        entityId: rawId,
        profileId: rawProfile,
      }),
    );
  });

  it('prints valid --json with "must be a string" error when aiProfile is null or an array', () => {
    for (const badAiProfile of [null, ['x']] as const) {
      const file = writePack(`nonstring-${badAiProfile === null ? 'null' : 'array'}.json`, {
        entities: [{ id: 'bad', type: 'npc', name: 'Bad', aiProfile: badAiProfile }],
        zones: [{ id: 'cave', name: 'Cave', neighbors: [] }],
      });
      const out = capture();
      const code = runValidate([file, '--json'], { log: out.log, error: out.log });
      expect(code).toBe(1);
      const parsed = JSON.parse(out.text()) as {
        ok: boolean;
        errors: Array<{ path: string; message: string }>;
      };
      expect(parsed.ok).toBe(false);
      expect(parsed.errors).toContainEqual(
        expect.objectContaining({
          path: 'entities[0](bad).aiProfile',
          message: expect.stringMatching(/must be a string/),
        }),
      );
    }
  });

  it('supports --unresolved-ai-profile warn (exit 0 + sanitized stderr warnings) vs default fail (exit 1)', () => {
    const rawId = `\x1b[31mbad\n_${'x'.repeat(80)}`;
    const rawProfile = `bad\x07_${'p'.repeat(80)}`;
    const file = writePack('warn-profile.json', {
      entities: [
        { id: 'lookout', type: 'npc', name: 'Lookout', aiProfile: 'skirmisher' },
        { id: rawId, type: 'npc', name: 'Bad', aiProfile: rawProfile },
      ],
      zones: [{ id: 'cave', name: 'Cave', neighbors: [] }],
    });

    // Default (no flag) and explicit fail exit 1
    expect(runValidate([file], { log: () => {}, error: () => {} })).toBe(1);
    expect(runValidate([file, '--unresolved-ai-profile', 'fail'], { log: () => {}, error: () => {} })).toBe(1);

    // Space and equals warn forms exit 0 and emit one sanitized stderr line per warning
    for (const runArgs of [
      [file, '--unresolved-ai-profile', 'warn'],
      [file, '--unresolved-ai-profile=warn'],
      ['--unresolved-ai-profile', 'warn', file],
    ]) {
      const out = capture();
      const errOut = capture();
      const code = runValidate(runArgs, { log: out.log, error: errOut.log });
      expect(code).toBe(0);
      expect(out.text()).toContain('Content valid');
      for (const line of errOut.lines) {
        expect(line).not.toMatch(/[\x00-\x1f\x7f-\x9f]/);
      }
      expect(errOut.lines).toHaveLength(2);
      expect(errOut.lines[0]).toContain('lookout');
      expect(errOut.lines[0]).toContain('skirmisher');
      expect(errOut.lines[1]).toContain('\\x1b[31m');
      expect(errOut.lines[1]).toContain('bad\\x07_');
    }

    // --json --unresolved-ai-profile warn returns ok: true with warnings AND stderr warning lines
    const jsonOut = capture();
    const jsonErr = capture();
    expect(runValidate([file, '--json', '--unresolved-ai-profile', 'warn'], {
      log: jsonOut.log,
      error: jsonErr.log,
    })).toBe(0);
    const parsed = JSON.parse(jsonOut.text()) as {
      ok: boolean;
      errors: unknown[];
      warnings?: Array<{ code: string; entityId?: string; profileId?: string }>;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.errors).toEqual([]);
    expect(parsed.warnings).toHaveLength(2);
    expect(jsonErr.lines).toHaveLength(2);
  });

  it('exits 1 with usage error on invalid --unresolved-ai-profile values', () => {
    const file = writePack('good-valid.json', {
      zones: [{ id: 'cave', name: 'Cave', neighbors: [] }],
    });
    for (const badArgs of [
      ['--unresolved-ai-profile', 'loud'],
      ['--unresolved-ai-profile=ignore'],
      ['--unresolved-ai-profile='],
      ['--unresolved-ai-profile'],
    ]) {
      const errOut = capture();
      const code = runValidate([file, ...badArgs], { log: () => {}, error: errOut.log });
      expect(code).toBe(1);
      expect(errOut.text()).toContain('VALIDATE_INVALID_UNRESOLVED_AI_PROFILE');

      const jsonOut = capture();
      const jsonCode = runValidate([file, '--json', ...badArgs], { log: jsonOut.log, error: () => {} });
      expect(jsonCode).toBe(1);
      const parsed = JSON.parse(jsonOut.text()) as { ok: boolean; errors: Array<{ message: string }> };
      expect(parsed.ok).toBe(false);
      expect(parsed.errors[0].message).toContain('VALIDATE_INVALID_UNRESOLVED_AI_PROFILE');
    }

    const helpOut = capture();
    expect(runValidate(['--help'], { log: helpOut.log, error: () => {} })).toBe(0);
    expect(helpOut.text()).toContain('--unresolved-ai-profile fail|warn');
  });
});
