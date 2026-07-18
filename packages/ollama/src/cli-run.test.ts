// End-to-end runCli flows — v2.5 audit PA-2 + PA-4.
//
// PA-2: a corrupt .ai-session.json used to be silently swallowed to null and
// clobbered by the next save, while a valid-JSON-wrong-shape file escaped as a
// raw TypeError out of runCli (no top-level catch). The invariants: the CLI
// reports a structured SESSION_CORRUPT error (code/message/hint), never a raw
// stack, and never touches the corrupt file.
//
// PA-4: create-* commands ran no generation-time schema validation and --write
// persisted invalid content. The invariants: --validate refuses to emit/write
// invalid content (structured INVALID_CONTENT, exit code 1, nothing on disk);
// valid content writes; without --validate the honest default (emit + warn,
// validate at load) is preserved.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCli } from './cli.js';

const realFetch = globalThis.fetch;
const realCwd = process.cwd();

let tmpDir: string;
let errSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-run-'));
  process.chdir(tmpDir);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  process.chdir(realCwd);
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  process.exitCode = 0;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function stderrText(): string {
  return errSpy.mock.calls.flat().join('\n');
}

function stdoutText(): string {
  return logSpy.mock.calls.flat().join('\n');
}

/** Mock the Ollama HTTP endpoint to return a fixed model response. */
function mockOllama(responseText: string): void {
  globalThis.fetch = vi.fn(async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ response: responseText }),
      text: async () => '',
      headers: new Headers(),
    }) as unknown as Response,
  ) as unknown as typeof fetch;
}

const sessionFile = () => path.join(tmpDir, '.ai-session.json');

describe('runCli — corrupt session handling (PA-2)', () => {
  it('halts "session start" on a corrupt session with a structured error and does NOT clobber the file', async () => {
    const corrupt = '{ "name": "precious-context", "themes": ["gothic"';
    await fs.writeFile(sessionFile(), corrupt, 'utf-8');

    await runCli(['session', 'start', 'fresh']);

    expect(process.exitCode).toBe(1);
    const stderr = stderrText();
    expect(stderr).toContain('Error [SESSION_CORRUPT]');
    expect(stderr).toContain(sessionFile());
    expect(stderr).toContain('Hint:');
    // The salvageable file is untouched — the old behavior silently replaced it.
    expect(await fs.readFile(sessionFile(), 'utf-8')).toBe(corrupt);
  });

  it('reports a wrong-shape session file as a structured error, not a raw TypeError', async () => {
    await fs.writeFile(sessionFile(), '{}', 'utf-8');

    await runCli(['session', 'status']);

    expect(process.exitCode).toBe(1);
    const stderr = stderrText();
    expect(stderr).toContain('Error [SESSION_CORRUPT]');
    expect(stderr).not.toContain('TypeError');
    expect(stderr).not.toMatch(/^\s+at /m); // no stack frames escape
  });

  it('still treats a missing session file as "no session" (null path unchanged)', async () => {
    await runCli(['session', 'status']);

    expect(process.exitCode ?? 0).toBe(0);
    expect(stdoutText()).toContain('No active session.');
  });
});

describe('runCli — --validate write gate (PA-4)', () => {
  const validFactionYaml = [
    'id: dock_rats',
    'name: The Dock Rats',
    'members:',
    '  - rat_boss',
    '  - rat_lookout',
    'cohesion: 0.7',
  ].join('\n');

  const validLocationPackYaml = [
    'district:',
    '  id: harbor_quarter',
    '  name: Harbor Quarter',
    '  zoneIds:',
    '    - dockside',
    '  tags:',
    '    - commerce',
    'rooms:',
    '  - id: waterfront_tavern',
    '    name: Waterfront Tavern',
    '    zones:',
    '      - id: dockside',
    '        name: Dockside',
  ].join('\n');

  it('--validate refuses to write an invalid faction: structured error, exit 1, nothing on disk', async () => {
    mockOllama('id: broken_faction'); // missing name + members
    const target = path.join(tmpDir, 'out', 'faction.yaml');

    await runCli(['create-faction', '--theme', 'smugglers', '--validate', '--write', target]);

    expect(process.exitCode).toBe(1);
    const stderr = stderrText();
    expect(stderr).toContain('Error [INVALID_CONTENT]');
    expect(stderr).toContain('faction');
    expect(stderr).toContain('members');
    expect(stderr).toContain('Hint:');
    await expect(fs.access(target)).rejects.toThrow(); // nothing written
  });

  it('--validate lets a valid faction through to --write', async () => {
    mockOllama(validFactionYaml);
    const target = path.join(tmpDir, 'out', 'faction.yaml');

    await runCli(['create-faction', '--theme', 'smugglers', '--validate', '--write', target]);

    expect(process.exitCode ?? 0).toBe(0);
    expect(await fs.readFile(target, 'utf-8')).toContain('id: dock_rats');
    expect(stderrText()).not.toContain('INVALID_CONTENT');
  });

  it('--validate refuses an invalid district (missing zoneIds)', async () => {
    mockOllama('id: bare_district\nname: Bare District');
    const target = path.join(tmpDir, 'district.yaml');

    await runCli(['create-district', '--theme', 'docks', '--validate', '--write', target]);

    expect(process.exitCode).toBe(1);
    expect(stderrText()).toContain('Error [INVALID_CONTENT]');
    expect(stderrText()).toContain('zoneIds');
    await expect(fs.access(target)).rejects.toThrow();
  });

  it('--validate refuses an encounter pack missing its quest section', async () => {
    mockOllama([
      'room:',
      '  id: clearing',
      '  name: Clearing',
      '  zones:',
      '    - id: treeline',
      '      name: Treeline',
      'entities:',
      '  - id: bandit',
      '    type: enemy',
      '    name: Bandit',
    ].join('\n'));
    const target = path.join(tmpDir, 'pack.yaml');

    await runCli(['create-encounter-pack', '--theme', 'ambush', '--validate', '--write', target]);

    expect(process.exitCode).toBe(1);
    expect(stderrText()).toContain('Error [INVALID_CONTENT]');
    expect(stderrText()).toContain('quest');
    await expect(fs.access(target)).rejects.toThrow();
  });

  it('--validate lets a valid location pack through to --write', async () => {
    mockOllama(validLocationPackYaml);
    const target = path.join(tmpDir, 'pack.yaml');

    await runCli(['create-location-pack', '--theme', 'harbor', '--validate', '--write', target]);

    expect(process.exitCode ?? 0).toBe(0);
    expect(await fs.readFile(target, 'utf-8')).toContain('harbor_quarter');
  });

  it('without --validate, invalid content still writes (validated-at-load default) but warns on stderr', async () => {
    mockOllama('id: broken_faction');
    const target = path.join(tmpDir, 'faction.yaml');

    await runCli(['create-faction', '--theme', 'smugglers', '--write', target]);

    expect(process.exitCode ?? 0).toBe(0);
    expect(await fs.readFile(target, 'utf-8')).toContain('broken_faction');
    const stderr = stderrText();
    expect(stderr).toContain('Validation warnings');
    expect(stderr).toContain('--validate');
  });
});

// v2.6 audit F-a19d7360 — `parseInt(next ?? '1', 10)` on a non-numeric
// --auto-execute value (e.g. "abc") produces NaN, which flows unchecked
// through macros.ts's `Math.min(Math.max(input.autoExecute ?? 1, 0), 3)`
// (NaN ?? 1 stays NaN; Math.max/min both propagate NaN) into a for-loop
// bound and an Array.slice() end-argument that both silently treat NaN as
// 0. The result: plan-and-generate quietly ran in plan-only mode with ZERO
// auto-executed steps and no indication the flag value was rejected rather
// than intentionally 0 — materially different from both the documented
// default (1, when the flag is omitted) and any sane "reject bad input"
// behavior.
describe('runCli — --auto-execute validation (F-a19d7360)', () => {
  it('rejects a non-numeric --auto-execute value with a structured error instead of silently running 0 steps', async () => {
    mockOllama('irrelevant'); // must not even be reached — parsing fails first
    await runCli(['plan-and-generate', '--theme', 'docks', '--auto-execute', 'abc']);

    expect(process.exitCode).toBe(1);
    const stderr = stderrText();
    expect(stderr).toMatch(/auto-execute/i);
    expect(stderr).toContain('Hint:');
    expect(globalThis.fetch).not.toHaveBeenCalled(); // rejected before any client call
  });

  it('still accepts a valid numeric --auto-execute value', async () => {
    mockOllama([
      'Plan.',
      '',
      '```yaml',
      'steps:',
      '  - order: 1',
      '    command: "create-room --theme docks"',
      '    produces: "room definition"',
      '    description: "test"',
      'rationale: "ok"',
      '```',
    ].join('\n'));

    await runCli(['plan-and-generate', '--theme', 'docks', '--auto-execute', '2']);

    expect(process.exitCode ?? 0).toBe(0);
    expect(stderrText()).not.toMatch(/auto-execute expects/i);
  });
});
