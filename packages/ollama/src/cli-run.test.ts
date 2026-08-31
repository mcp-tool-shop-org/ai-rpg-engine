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
import { runCli, formatCliHelp, formatSessionCommandList } from './cli.js';
import { MAX_REPLAY_JSON_BYTES } from './chat-balance-analyzer.js';

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

function streamedOllamaResponse(init: {
  ok: boolean;
  status: number;
  payload?: unknown;
  bodyText?: string;
}): Response {
  const bodyText = init.bodyText ?? JSON.stringify(init.payload ?? {});
  const bytes = new TextEncoder().encode(bodyText);
  return {
    ok: init.ok,
    status: init.status,
    headers: new Headers({ 'content-length': String(bytes.byteLength) }),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    json: async () => JSON.parse(bodyText),
    text: async () => bodyText,
  } as unknown as Response;
}

/** Mock the Ollama HTTP endpoint to return a fixed model response. */
function mockOllama(responseText: string): void {
  globalThis.fetch = vi.fn(async () =>
    streamedOllamaResponse({ ok: true, status: 200, payload: { response: responseText } }),
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

describe('runCli — named session slots', () => {
  it('lists, switches, and archives instead of unlinking on end', async () => {
    await runCli(['session', 'start', 'harbor']);
    await runCli(['session', 'end']);
    await runCli(['session', 'start', 'underdark']);

    logSpy.mockClear();
    await runCli(['session', 'list']);
    const listed = stdoutText();
    expect(listed).toContain('harbor');
    expect(listed).toContain('underdark');
    expect(listed).toMatch(/\* underdark/);

    logSpy.mockClear();
    await runCli(['session', 'switch', 'harbor']);
    expect(stdoutText()).toContain('Switched to session "harbor"');

    logSpy.mockClear();
    await runCli(['session', 'status']);
    expect(stdoutText()).toContain('Session: harbor');

    logSpy.mockClear();
    await runCli(['session', 'end']);
    expect(stdoutText()).toMatch(/Session archived:/);
    const activeGone = await fs.access(sessionFile()).then(() => false).catch(() => true);
    expect(activeGone).toBe(true);
    const archiveDir = path.join(tmpDir, '.ai-sessions', 'archive');
    const archived = await fs.readdir(archiveDir);
    expect(archived.some((f) => f.startsWith('harbor-'))).toBe(true);
    // named slot remains
    await expect(fs.access(path.join(tmpDir, '.ai-sessions', 'harbor.json'))).resolves.toBeUndefined();
  });

  it('exports the active session as JSON', async () => {
    await runCli(['session', 'start', 'harbor']);
    logSpy.mockClear();
    await runCli(['session', 'export']);
    const raw = stdoutText();
    expect(JSON.parse(raw).name).toBe('harbor');
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

// v2.6 Stage C F-8d5c2ea9 — the default help banner hardcoded 'v1.0.0'
// against a 2.x package.json: a trust-eroding mismatch that recurs on every
// release. The banner must report the version package.json actually declares.
describe('runCli — help banner version (F-8d5c2ea9)', () => {
  it('prints the package.json version, not a stale hardcoded one', async () => {
    const pkgRaw = await fs.readFile(
      new URL('../package.json', import.meta.url),
      'utf-8',
    );
    const pkg = JSON.parse(pkgRaw) as { version: string };

    await runCli([]);

    const stdout = stdoutText();
    expect(stdout).toContain(`@ai-rpg-engine/ollama v${pkg.version}`);
    // Guard against the literal regression (package is past 1.0.0).
    expect(stdout).not.toContain('v1.0.0');
  });
});

// F-77398344 — a blocked apply-preview --confirm used to console.log the
// "Error: ..." string, record content_applied, and leave exitCode 0.
describe('runCli — apply-preview --confirm blocked write (F-77398344)', () => {
  it('treats a sandbox-blocked confirm as WRITE_BLOCKED (exit 1, nothing written)', async () => {
    await runCli(['session', 'start', 'blocked-write']);
    process.exitCode = 0;

    const { Readable } = await import('node:stream');
    const escapePath = path.join(path.dirname(tmpDir), `escape-apply-${path.basename(tmpDir)}.yaml`);
    const fakeStdin = Readable.from([Buffer.from('blocked-body')]);
    const originalStdin = process.stdin;
    Object.defineProperty(process, 'stdin', { value: fakeStdin, configurable: true });
    try {
      await runCli(['apply-preview', '--stdin', '--write', escapePath, '--confirm']);
    } finally {
      Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
    }

    expect(process.exitCode).toBe(1);
    expect(stderrText()).toContain('WRITE_BLOCKED');
    expect(stderrText()).toMatch(/escapes/i);
    expect(stdoutText()).not.toMatch(/Written:/);
    await expect(fs.access(escapePath)).rejects.toThrow();
    const sessionRaw = await fs.readFile(sessionFile(), 'utf-8');
    expect(sessionRaw).not.toContain('content_applied');
  });
});

// F-999d9ed1 — readStdin concatenated every chunk with no byte budget, then
// analyze-replay stuffed the whole dump into generate(). Cap before JSON.parse.
describe('runCli — stdin byte budget (F-999d9ed1)', () => {
  it('refuses >8 MiB stdin before JSON.parse or generate()', async () => {
    const parseSpy = vi.spyOn(JSON, 'parse');
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const huge = Buffer.alloc(MAX_REPLAY_JSON_BYTES + 1, 0x78);
    const { Readable } = await import('node:stream');
    const fakeStdin = Readable.from([huge]);
    const originalStdin = process.stdin;
    Object.defineProperty(process, 'stdin', { value: fakeStdin, configurable: true });
    try {
      await runCli(['analyze-replay', '--stdin']);
    } finally {
      Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
    }

    expect(process.exitCode).toBe(1);
    expect(stderrText()).toContain('BUDGET_EXCEEDED');
    expect(stderrText()).toMatch(/byte budget/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    const oversizedParses = parseSpy.mock.calls.filter(
      ([arg]) => typeof arg === 'string' && arg.length > MAX_REPLAY_JSON_BYTES,
    );
    expect(oversizedParses).toHaveLength(0);
    parseSpy.mockRestore();
  });
});

// F-420e99d8 — a failed repair generate (daemon down / model not pulled)
// used to return the original invalid draft as a quiet first-pass success.
describe('runCli — --repair generate failure (F-420e99d8)', () => {
  function mockOllamaThenHttpError(firstText: string, status: number, body: string): void {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return streamedOllamaResponse({
          ok: true,
          status: 200,
          payload: { response: firstText },
        });
      }
      return streamedOllamaResponse({
        ok: false,
        status,
        bodyText: body,
      });
    }) as unknown as typeof fetch;
  }

  it('prints Repair failed (not "Generated on first pass") and keeps the original draft', async () => {
    mockOllamaThenHttpError(
      'id: broken_room',
      404,
      '{"error":"model \\"qwen2.5-coder\\" not found, try pulling it first"}',
    );

    await runCli(['create-room', '--theme', 'crypt', '--repair']);

    expect(process.exitCode ?? 0).toBe(0);
    const stderr = stderrText();
    expect(stderr).toMatch(/Repair failed/i);
    expect(stderr).toMatch(/ollama pull/i);
    expect(stderr).not.toContain('Generated on first pass');
    expect(stdoutText()).toContain('broken_room');
  });

  it('--validate refuses to emit after a failed repair pass', async () => {
    mockOllamaThenHttpError(
      'id: broken_room',
      404,
      '{"error":"model \\"qwen2.5-coder\\" not found, try pulling it first"}',
    );
    const target = path.join(tmpDir, 'room.yaml');

    await runCli(['create-room', '--theme', 'crypt', '--repair', '--validate', '--write', target]);

    expect(process.exitCode).toBe(1);
    expect(stderrText()).toMatch(/Repair failed/i);
    expect(stderrText()).toContain('INVALID_CONTENT');
    await expect(fs.access(target)).rejects.toThrow();
  });
});

// F-ef949bc5 — help banner --write must match chat behavior; Usage line;
// session listing generated from the same table; flags grouped.
describe('runCli — help banner chat --write + session listing (F-ef949bc5)', () => {
  it('prints Usage, chat [--write], and the real transcript destination', async () => {
    await runCli([]);
    const stdout = stdoutText();
    expect(stdout).toContain('Usage: ai <command> [flags]');
    expect(stdout).toContain('chat [--write]');
    expect(stdout).toContain('.ai-transcripts/<session>-<date>.jsonl');
    expect(stdout).toContain('Flags (chat):');
    expect(stdout).toContain('Flags (apply-preview):');
    expect(stdout).toContain('Flags (create-* / scaffold):');
    expect(stdout).not.toMatch(/chat\s+Interactive conversational design assistant/);
  });

  it('generates `ai session` from the same table as the main Session: block', async () => {
    await runCli([]);
    const main = stdoutText();
    logSpy.mockClear();
    await runCli(['session']);
    const sessionHelp = stdoutText();

    const rowRe = /^ {2}session .+$/gm;
    const mainRows = main.match(rowRe);
    const sessionRows = sessionHelp.match(rowRe);
    expect(mainRows).not.toBeNull();
    expect(sessionRows).toEqual(mainRows);
    expect(main).toContain('session add-theme <text>');
    expect(main).toContain('Add a theme to the active session');
    expect(sessionHelp).toContain('session add-theme <text>');
    expect(sessionHelp).toContain('Add a theme to the active session');
    expect(sessionHelp).not.toContain('add-theme <t>');
    expect(sessionHelp).not.toContain('Add theme(s) to session');

    for (const row of mainRows!) {
      // Description column is index 30: two-space indent + padEnd(28).
      expect(row.slice(30).trim().length).toBeGreaterThan(0);
      expect(row[30]).not.toBe(' ');
      expect(row.slice(2, 30).trim().length).toBeGreaterThan(0);
    }
  });

  it('formatSessionCommandList pads descriptions to column 30', () => {
    const listing = formatSessionCommandList('Session:');
    const rows = listing.split('\n').slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.startsWith('  ')).toBe(true);
      expect(row[30]).not.toBe(' ');
    }
  });

  it('formatCliHelp groups --write under chat vs create-* vs apply-preview', () => {
    const help = formatCliHelp('9.9.9');
    expect(help).toContain('Usage: ai <command> [flags]');
    const chatFlagsAt = help.indexOf('Flags (chat):');
    const applyFlagsAt = help.indexOf('Flags (apply-preview):');
    const createFlagsAt = help.indexOf('Flags (create-* / scaffold):');
    expect(chatFlagsAt).toBeGreaterThan(0);
    expect(applyFlagsAt).toBeGreaterThan(0);
    expect(createFlagsAt).toBeGreaterThan(0);
    expect(help.slice(chatFlagsAt)).toContain('.ai-transcripts/<session>-<date>.jsonl');
    expect(help.slice(applyFlagsAt)).toContain('Confirm apply-preview');
    expect(help.slice(applyFlagsAt)).toContain('--undo');
    expect(help.slice(createFlagsAt, chatFlagsAt)).toContain('Write generated output to file');
    expect(help).toContain('create-item');
    expect(help).toContain('create-hazard');
    expect(help).toContain('create-archetype');
    expect(help).toContain('create-background');
    expect(help).toContain('create-build-catalog');
    expect(help).toContain('create-entity-ai');
    expect(help).toContain('create-placement');
    expect(help).toContain('create-encounter-anchor');
    expect(help).toContain('create-progression-tree');
    expect(help).toContain('create-ruleset');
    expect(help).toContain('create-rule-profile');
    expect(help).toContain('create-item-placement');
    expect(help).toContain('emit-pack');
    expect(help).toContain('session import');
    expect(help).toContain('models');
  });
});

// F-35cc73ce: scaffoldAndCritique ran scaffold -> critique -> suggest-next
// with no assembleContentPack/emit-pack call — `ai scaffold-and-critique`
// generated content but never produced a loadable content/pack.json.
describe('runCli — scaffold-and-critique emits content/pack.json (F-35cc73ce)', () => {
  function mockOllamaSequence(...texts: string[]): void {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      const text = texts[calls] ?? texts[texts.length - 1];
      calls += 1;
      return streamedOllamaResponse({ ok: true, status: 200, payload: { response: text } });
    }) as unknown as typeof fetch;
  }

  it('writes content/pack.json containing BOTH pre-existing and just-scaffolded content when --write is given', async () => {
    // RECONCILED at the wave-2 stitch: this test used to pin the old
    // contract — assembly before the scaffold's --write landed (a pack one
    // artifact behind) and a pack.json written even when the caller asked
    // for nothing to be persisted. The macro now lands the scaffolded YAML
    // BEFORE the emit-pack step assembles, and only persists when --write
    // states the intent. Pre-seed a file to stand in for content already
    // authored/imported in the project.
    await fs.writeFile(path.join(tmpDir, 'guard.yaml'), 'id: chapel_guard\ntype: npc\nname: Chapel Guard\n');
    mockOllamaSequence(
      'id: chapel\nname: Ruined Chapel\nzones:\n  - id: nave\n    name: Nave',
      'Solid room. No structural issues.',
    );
    await runCli(['scaffold-and-critique', '--kind', 'room', '--theme', 'ruined chapel', '--write', 'chapel.yaml']);
    expect(process.exitCode).not.toBe(1);
    const written = JSON.parse(await fs.readFile(path.join(tmpDir, 'content', 'pack.json'), 'utf-8'));
    expect(written.entities).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'chapel_guard' })]),
    );
    // The off-by-one proof: the artifact scaffolded IN THIS RUN is in the pack.
    expect(JSON.stringify(written)).toContain('nave');
    await fs.readFile(path.join(tmpDir, 'chapel.yaml'), 'utf-8');
  });

  it('writes nothing without --write (consent pin)', async () => {
    mockOllamaSequence(
      'id: chapel\nname: Ruined Chapel\nzones:\n  - id: nave\n    name: Nave',
      'Solid room. No structural issues.',
    );
    await runCli(['scaffold-and-critique', '--kind', 'room', '--theme', 'ruined chapel']);
    expect(process.exitCode).not.toBe(1);
    await expect(fs.readFile(path.join(tmpDir, 'content', 'pack.json'), 'utf-8')).rejects.toThrow();
  });
});

// F-8ec253bf / F-0bf295ac / F-bd8034ea: create-ruleset, create-rule-profile,
// and create-item-placement had no CLI wiring at all.
describe('runCli — create-ruleset / create-rule-profile / create-item-placement', () => {
  it('create-ruleset generates and prints a ruleset', async () => {
    mockOllama([
      'id: fantasy-minimal',
      'name: Fantasy Minimal',
      'version: 0.1.0',
      'stats:',
      '  - id: vigor',
      '    name: Vigor',
      '    default: 5',
      'resources:',
      '  - id: hp',
      '    name: HP',
      '    default: 20',
      'verbs:',
      '  - id: move',
      '    name: Move',
      'formulas:',
      '  - id: hit-chance',
      '    name: Hit Chance',
      '    inputs:',
      '      - attacker.vigor',
      '    output: number',
      'defaultModules:',
      '  - combat-core',
      'progressionModels:',
      '  - linear',
    ].join('\n'));
    await runCli(['create-ruleset', '--theme', 'gritty fantasy']);
    expect(process.exitCode).not.toBe(1);
    expect(stdoutText()).toContain('fantasy-minimal');
  });

  it('create-rule-profile --id overlays the registry key and records the session artifact', async () => {
    await runCli(['session', 'start', 'chapel']);
    mockOllama('statMapping:\n  attack: strength\n  precision: dexterity\n  resolve: willpower');
    await runCli(['create-rule-profile', '--theme', 'veteran soldier', '--id', 'veteran_soldier']);
    expect(process.exitCode).not.toBe(1);
    expect(stdoutText()).toContain('id: veteran_soldier');
    const session = JSON.parse(await fs.readFile(sessionFile(), 'utf-8'));
    expect(session.artifacts.ruleProfiles).toContain('veteran_soldier');
  });

  it('create-item-placement short-circuits (no generate call) when --item and --entity-id are known, and records the compound-key session artifact', async () => {
    await runCli(['session', 'start', 'chapel']);
    logSpy.mockClear();
    // No mockOllama — a fetch here would fail/hang, proving generate() is
    // never called on the short-circuit path (mirrors create-placement).
    await runCli(['create-item-placement', '--item', 'rusty_key', '--entity-id', 'chapel_guard']);
    expect(process.exitCode).not.toBe(1);
    expect(stdoutText()).toBe('itemId: rusty_key\nentityId: chapel_guard\n');
    const session = JSON.parse(await fs.readFile(sessionFile(), 'utf-8'));
    expect(session.artifacts.itemPlacements).toContain('rusty_key@chapel_guard');
  });
});

// F-2d9f6b18 (wave-4) — the same CREATE-undo bug apply-preview.ts/
// chat-engine.ts fixed, reachable through the CLI's own apply-preview
// --confirm/--undo commands: applyConfirmed never writes a .bak for a
// CREATE, so --undo used to always fail "backup not found" for a freshly
// written file, and a second consecutive --undo targeted the first undo's
// own bespoke "undo restored X" event string (unparseable, no ' (backup: '
// substring) instead of a real path.
describe('runCli — apply-preview --undo on a CREATE (F-2d9f6b18)', () => {
  async function runWithStdin(args: string[], body: string): Promise<void> {
    const { Readable } = await import('node:stream');
    const fakeStdin = Readable.from([Buffer.from(body)]);
    const originalStdin = process.stdin;
    Object.defineProperty(process, 'stdin', { value: fakeStdin, configurable: true });
    try {
      await runCli(args);
    } finally {
      Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
    }
  }

  it('--undo deletes a freshly-created file instead of failing "backup not found"', async () => {
    await runCli(['session', 'start', 'undo-create']);
    process.exitCode = 0;

    const target = path.join(tmpDir, 'fresh.yaml');
    await runWithStdin(['apply-preview', '--stdin', '--write', target, '--confirm'], 'id: fresh\n');
    expect(process.exitCode).not.toBe(1);
    expect(stdoutText()).toContain('Written:');
    await fs.access(target);

    logSpy.mockClear();
    errSpy.mockClear();
    await runCli(['apply-preview', '--write', target, '--undo']);
    expect(stderrText()).not.toMatch(/backup not found/i);
    expect(process.exitCode).not.toBe(1);
    await expect(fs.access(target)).rejects.toThrow();
  });

  it('a second consecutive --undo refuses cleanly instead of erroring on a garbled path', async () => {
    await runCli(['session', 'start', 'undo-create-twice']);
    process.exitCode = 0;

    const target = path.join(tmpDir, 'fresh.yaml');
    await runWithStdin(['apply-preview', '--stdin', '--write', target, '--confirm'], 'id: fresh\n');
    await runCli(['apply-preview', '--write', target, '--undo']);
    expect(process.exitCode).not.toBe(1);

    logSpy.mockClear();
    errSpy.mockClear();
    process.exitCode = 0;
    await runCli(['apply-preview', '--write', target, '--undo']);
    expect(process.exitCode).toBe(1);
    expect(stderrText()).toMatch(/nothing to undo/i);
    expect(stderrText()).not.toMatch(/backup not found/i);
  });
});
