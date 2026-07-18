// Tests — chat shell slash-command handling.
// runChatShell() itself is a readline REPL loop (not directly unit-testable);
// handleSlashCommand() is exported for tests so individual /commands can be
// exercised without wiring up stdin/stdout.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleSlashCommand, runChatShell, persistTranscriptAtExit } from './chat-shell.js';
import { createChatEngine } from './chat-engine.js';
import { createTranscript, addToTranscript, defaultTranscriptPath } from './chat-transcript.js';
import { createBuildState, type BuildPlan, type BuildStep } from './chat-build-planner.js';
import type { OllamaTextClient, PromptInput, PromptResult } from './client.js';

function mockClient(response = 'ok'): OllamaTextClient {
  return {
    async generate(_input: PromptInput): Promise<PromptResult> {
      return { ok: true, text: response };
    },
  };
}

function makeEngine(projectRoot = '/fake/project-root') {
  return createChatEngine({ client: mockClient(), projectRoot });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// v2.6 audit F-ed21662f — `parseInt(parts[1] ?? '0', 10)` on a non-numeric
// tick argument (e.g. "abc") produces NaN for startTick. Since ANY
// comparison against NaN is false, `endTick <= startTick` never trips, so
// the usage guard was bypassed and execution proceeded into
// analyzeWindow(replay, NaN, endTick). Because `tick >= NaN` is always
// false, the window filter matched zero ticks, and the command silently
// reported "0 ticks analyzed, 0 findings" — indistinguishable from a
// legitimately empty (but validly specified) window. The user got no signal
// that their input was malformed.
describe('handleSlashCommand — /analyze-window (F-ed21662f)', () => {
  const validReplay = '{"ticks":[{"tick":10,"alertLevel":0.3},{"tick":20,"alertLevel":0.5}]}';

  it('shows the usage message for a non-numeric startTick instead of silently analyzing 0 ticks', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const engine = makeEngine();
    const transcript = createTranscript(null);

    const result = await handleSlashCommand(
      `/analyze-window abc 50 ${validReplay}`,
      engine, transcript, '/fake/project-root', false,
    );

    expect(result).toBe('handled');
    const logged = logSpy.mock.calls.flat().join('\n');
    expect(logged).toContain('Usage: /analyze-window');
    // Must NOT have silently proceeded into analyzeWindow's own summary line.
    expect(logged).not.toMatch(/ticks analyzed/);
  });

  it('shows the usage message for a non-numeric endTick instead of silently analyzing 0 ticks', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const engine = makeEngine();
    const transcript = createTranscript(null);

    const result = await handleSlashCommand(
      `/analyze-window 10 xyz ${validReplay}`,
      engine, transcript, '/fake/project-root', false,
    );

    expect(result).toBe('handled');
    const logged = logSpy.mock.calls.flat().join('\n');
    expect(logged).toContain('Usage: /analyze-window');
    expect(logged).not.toMatch(/ticks analyzed/);
  });

  it('still shows the usage message for a genuinely empty numeric range (regression)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const engine = makeEngine();
    const transcript = createTranscript(null);

    const result = await handleSlashCommand(
      `/analyze-window 50 10 ${validReplay}`, // endTick <= startTick
      engine, transcript, '/fake/project-root', false,
    );

    expect(result).toBe('handled');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Usage: /analyze-window');
  });

  it('still analyzes a valid numeric tick range and reports the real summary', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const engine = makeEngine();
    const transcript = createTranscript(null);

    const result = await handleSlashCommand(
      `/analyze-window 0 30 ${validReplay}`,
      engine, transcript, '/fake/project-root', false,
    );

    expect(result).toBe('handled');
    const logged = logSpy.mock.calls.flat().join('\n');
    expect(logged).not.toContain('Usage: /analyze-window');
    expect(logged).toMatch(/ticks analyzed/);
  });
});

// v2.6 Stage C F-3f6b0d95 — the same NaN family as F-ed21662f, applied to the
// two experiment commands: NaN slides through range guards because every
// comparison against NaN is false, so '/experiment-run abc' printed
// 'Experiment plan: NaN runs' and '/experiment-sweep rumorClarity a b c'
// printed 'from NaN to NaN step NaN (0 points)'.
describe('handleSlashCommand — /experiment-run + /experiment-sweep NaN guards (F-3f6b0d95)', () => {
  it('/experiment-run with a non-numeric count shows usage, never "NaN runs"', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await handleSlashCommand(
      '/experiment-run abc',
      makeEngine(), createTranscript(null), '/fake/project-root', false,
    );
    expect(result).toBe('handled');
    const logged = logSpy.mock.calls.flat().join('\n');
    expect(logged).toContain('Usage: /experiment-run');
    expect(logged).not.toContain('NaN');
  });

  it('/experiment-run with a valid count still works', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await handleSlashCommand(
      '/experiment-run 5 my-label',
      makeEngine(), createTranscript(null), '/fake/project-root', false,
    );
    expect(result).toBe('handled');
    const logged = logSpy.mock.calls.flat().join('\n');
    expect(logged).toContain('Experiment plan: 5 runs as "my-label"');
    expect(logged).not.toContain('Usage: /experiment-run');
  });

  it('/experiment-sweep with non-numeric range args shows usage, never NaN', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await handleSlashCommand(
      '/experiment-sweep rumorClarity a b c',
      makeEngine(), createTranscript(null), '/fake/project-root', false,
    );
    expect(result).toBe('handled');
    const logged = logSpy.mock.calls.flat().join('\n');
    expect(logged).toContain('Usage: /experiment-sweep');
    expect(logged).not.toContain('NaN');
  });

  it('/experiment-sweep with a valid range still sweeps', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await handleSlashCommand(
      '/experiment-sweep rumorClarity 0.4 0.8 0.2',
      makeEngine(), createTranscript(null), '/fake/project-root', false,
    );
    expect(result).toBe('handled');
    const logged = logSpy.mock.calls.flat().join('\n');
    expect(logged).toContain('Sweep: rumorClarity from 0.4 to 0.8 step 0.2');
    expect(logged).not.toContain('Usage: /experiment-sweep');
  });
});

// v2.6 Stage C F-4be7a3c2 — /execute used to print 'Executing all remaining
// steps...' and then nothing until the whole batch finished. Each step must
// now emit a [n/N] liveness line as it completes.
describe('handleSlashCommand — /execute per-step progress (F-4be7a3c2)', () => {
  function scaffoldStep(id: number, description: string): BuildStep {
    return {
      id, description,
      command: 'create-room', intent: 'scaffold',
      params: { kind: 'room', theme: `theme-${id}` },
      dependencies: [], artifactOutputs: ['rooms'],
      usePriorContent: false, status: 'pending',
    };
  }

  it('prints a [n/N] line per step as the batch runs', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const yaml = 'id: shell-room\ntype: room\nname: Shell Room';
    const engine = createChatEngine({
      client: mockClient(yaml),
      projectRoot: '/tmp/nonexistent-' + Date.now(),
    });
    const plan: BuildPlan = {
      goal: 'shell test',
      steps: [scaffoldStep(1, 'first'), scaffoldStep(2, 'second')],
      estimatedSteps: 2,
      warnings: [],
    };
    engine.activeBuild = createBuildState(plan);

    const result = await handleSlashCommand(
      '/execute', engine, createTranscript(null), '/fake/project-root', false,
    );

    expect(result).toBe('handled');
    const logged = logSpy.mock.calls.flat().join('\n');
    expect(logged).toContain('[1/2]');
    expect(logged).toContain('[2/2]');
  });
});

// v2.6 Stage C F-77c30d19 + F-2ef8b590 — the REPL end-to-end: transcript must
// survive Ctrl+D (stream EOF), save failures must be reported as failures
// (never a false 'Transcript saved'), and a throwing slash command must not
// crash the shell.
describe('runChatShell — exit save + crash safety (F-77c30d19, F-2ef8b590)', () => {
  let projectRoot: string;

  afterEach(async () => {
    if (projectRoot) {
      try { await rm(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  function startShell(root: string, opts: { saveTranscripts: boolean }) {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume(); // drain prompt writes
    void runChatShell({
      client: mockClient('MOCK_REPLY'),
      projectRoot: root,
      saveTranscripts: opts.saveTranscripts,
      input,
      output,
    });
    return { input, output };
  }

  function logged(spy: { mock: { calls: unknown[][] } }): string {
    return spy.mock.calls.flat().join('\n');
  }

  it('saves the transcript when input ends (Ctrl+D) with saveTranscripts: true', async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'chat-shell-exit-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { input } = startShell(projectRoot, { saveTranscripts: true });

    input.write('hello there\n');
    // Wait for the turn to complete (unknown-intent reply printed).
    await vi.waitFor(() => expect(logged(logSpy)).toContain('not sure'));

    input.end(); // Ctrl+D

    const path = defaultTranscriptPath(projectRoot, 'unnamed');
    await vi.waitFor(async () => { await access(path); });
    const onDisk = await readFile(path, 'utf-8');
    expect(onDisk).toContain('hello there');
    expect(logged(logSpy)).toContain('Transcript saved to');
  });

  it('reports a failed exit-save as NOT saved (no false success) and does not crash', async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'chat-shell-exit-fail-'));
    // A FILE where the transcript DIRECTORY must go → mkdir throws.
    await writeFile(join(projectRoot, '.ai-transcripts'), 'not a directory', 'utf-8');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { input } = startShell(projectRoot, { saveTranscripts: true });
    input.write('hello there\n');
    await vi.waitFor(() => expect(logged(logSpy)).toContain('not sure'));

    input.end();

    await vi.waitFor(() => expect(logged(errSpy)).toContain('Transcript NOT saved'));
    expect(logged(logSpy)).not.toContain('Transcript saved to');
  });

  it('a throwing slash command prints Error and the REPL keeps running (F-2ef8b590)', async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'chat-shell-crash-'));
    await writeFile(join(projectRoot, '.ai-transcripts'), 'not a directory', 'utf-8');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { input } = startShell(projectRoot, { saveTranscripts: true });

    // Get one message into the transcript so /save actually attempts a write.
    input.write('hello there\n');
    await vi.waitFor(() => expect(logged(logSpy)).toContain('not sure'));

    // /save → saveTranscript's mkdir throws → outer catch must absorb it.
    input.write('/save\n');
    await vi.waitFor(() => expect(logged(errSpy)).toContain('Error:'));
    expect(logged(logSpy)).not.toContain('Transcript saved to');

    // The REPL survived: another command still works.
    input.write('/memory\n');
    await vi.waitFor(() => expect(logged(logSpy)).toContain('Messages:'));

    input.end();
  });
});

// v2.6 Stage C F-a4c8e217 — the unknown-command message used to name the
// alias TARGET, not what the user typed: '/next' printed "Unknown command:
// /suggest-next".
describe('handleSlashCommand — unknown command names the typed command (F-a4c8e217)', () => {
  it('reports the original typed alias, not its resolved target', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await handleSlashCommand(
      '/next', makeEngine(), createTranscript(null), '/fake/project-root', false,
    );
    expect(result).toBe('handled');
    const logged = logSpy.mock.calls.flat().join('\n');
    expect(logged).toContain('Unknown command: /next');
    expect(logged).not.toContain('Unknown command: /suggest-next');
  });

  it('reports a plain unknown command unchanged', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleSlashCommand(
      '/tunestatus', makeEngine(), createTranscript(null), '/fake/project-root', false,
    );
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Unknown command: /tunestatus');
  });
});

// persistTranscriptAtExit — the single exit-save path (F-77c30d19).
describe('persistTranscriptAtExit', () => {
  let projectRoot: string;

  afterEach(async () => {
    if (projectRoot) {
      try { await rm(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('writes the transcript and returns the path', async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'persist-exit-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const transcript = createTranscript('exit-test');
    addToTranscript(transcript, { role: 'user', content: 'keep me', timestamp: 't' });

    const saved = await persistTranscriptAtExit(transcript, projectRoot, true);

    expect(saved).not.toBeNull();
    const onDisk = await readFile(saved!, 'utf-8');
    expect(onDisk).toContain('keep me');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Transcript saved to');
  });

  it('is a no-op when saveTranscripts is false or the transcript is empty', async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'persist-exit-noop-'));
    const transcript = createTranscript('noop');
    expect(await persistTranscriptAtExit(transcript, projectRoot, true)).toBeNull();
    addToTranscript(transcript, { role: 'user', content: 'x', timestamp: 't' });
    expect(await persistTranscriptAtExit(transcript, projectRoot, false)).toBeNull();
  });

  it('never throws on a disk failure — reports NOT saved instead', async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'persist-exit-fail-'));
    await writeFile(join(projectRoot, '.ai-transcripts'), 'blocking file', 'utf-8');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transcript = createTranscript('doomed');
    addToTranscript(transcript, { role: 'user', content: 'x', timestamp: 't' });

    const saved = await persistTranscriptAtExit(transcript, projectRoot, true);

    expect(saved).toBeNull();
    expect(errSpy.mock.calls.flat().join('\n')).toContain('Transcript NOT saved');
  });
});
