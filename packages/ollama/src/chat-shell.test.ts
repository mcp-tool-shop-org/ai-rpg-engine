// Tests — chat shell slash-command handling.
// runChatShell() itself is a readline REPL loop (not directly unit-testable);
// handleSlashCommand() is exported for tests so individual /commands can be
// exercised without wiring up stdin/stdout.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  handleSlashCommand, runChatShell, persistTranscriptAtExit,
  formatChatTurn, formatTranscriptPretty, beginThinking,
} from './chat-shell.js';
import { setDisplayMode, formatHeading } from './chat-studio.js';
import { MAX_EXPERIMENT_RUNS } from './chat-experiments.js';
import { createChatEngine } from './chat-engine.js';
import { createTranscript, addToTranscript, defaultTranscriptPath } from './chat-transcript.js';
import { createBuildState, type BuildPlan, type BuildStep } from './chat-build-planner.js';
import { createTuningState, type TuningPlan, type TuningStep } from './chat-balance-analyzer.js';
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
    const engine = makeEngine();
    const result = await handleSlashCommand(
      '/experiment-run 5 my-label',
      engine, createTranscript(null), '/fake/project-root', false,
    );
    expect(result).toBe('handled');
    const logged = logSpy.mock.calls.flat().join('\n');
    expect(logged).toContain('Experiment plan: 5 runs as "my-label"');
    expect(logged).not.toContain('Usage: /experiment-run');
    expect(logged).not.toContain('Use the experiment runner API');
    expect(engine.lastExperiment).not.toBeNull();
    expect(engine.lastExperiment?.completedRuns).toBe(5);
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

  it('/experiment-sweep with a tiny step is capped, never millions of points', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await handleSlashCommand(
      '/experiment-sweep rumorClarity 0 1 1e-8',
      makeEngine(), createTranscript(null), '/fake/project-root', false,
    );
    expect(result).toBe('handled');
    const logged = logSpy.mock.calls.flat().join('\n');
    expect(logged).toContain(`(${MAX_EXPERIMENT_RUNS} points)`);
    expect(logged).not.toMatch(/\(\d{6,} points\)/);
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

// F-591fae03 (tuning parity, inverting the wave-4 F-03875ef5 pin above):
// /tune-step and /tune-execute now surface the BATCH consent surface
// ("N file(s) staged -- write all?") instead of the old singular
// "Content staged for X" line — tuning steps accumulate into
// activeTuning.stagedWrites rather than the old shared pendingWrite slot,
// and executeTuningStep's completion promotion surfaces the batch once the
// plan has nothing left to run (there is no emit-pack-equivalent tail to
// gate on, so "plan complete with content still staged" is the trigger).
// A single-step /tune-step plan is simultaneously its own last step, so it
// exercises the SAME completion-promotion path as a full /tune-execute
// batch — intentional: rather than reinventing a per-step singular message
// for a value that no longer lives in a per-step slot, both commands share
// one consent surface, firing only once there is something to actually
// confirm.
describe('handleSlashCommand — /tune-step and /tune-execute surface staged writes (F-591fae03)', () => {
  function tuningStep(id: number, description: string): TuningStep {
    return {
      id, description,
      command: 'create-room', intent: 'scaffold',
      params: { kind: 'room', theme: `tune-${id}` },
      dependencies: [], expectedEffect: 'none', status: 'pending',
    };
  }

  it('/tune-step tells the user a write is staged and confirmable', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const yaml = 'id: shell-tuned-room\ntype: room\nname: Shell Tuned Room';
    const engine = createChatEngine({
      client: mockClient(yaml),
      projectRoot: '/tmp/nonexistent-' + Date.now(),
    });
    engine.activeTuning = createTuningState({
      goal: 'shell tune test',
      steps: [tuningStep(1, 'first')],
      warnings: [],
    } satisfies TuningPlan);

    const result = await handleSlashCommand(
      '/tune-step', engine, createTranscript(null), '/fake/project-root', false,
    );

    expect(result).toBe('handled');
    const logged = logSpy.mock.calls.flat().join('\n');
    expect(logged).toContain('file(s) staged -- write all?');
    expect(logged).toContain('shell-tuned-room.yaml');
    expect(logged).toContain('Say "yes" to write all');
  });

  it('/tune-execute tells the user a write is staged after the batch completes', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const yaml = 'id: shell-tuned-room\ntype: room\nname: Shell Tuned Room';
    const engine = createChatEngine({
      client: mockClient(yaml),
      projectRoot: '/tmp/nonexistent-' + Date.now(),
    });
    engine.activeTuning = createTuningState({
      goal: 'shell tune batch test',
      steps: [tuningStep(1, 'first'), tuningStep(2, 'second')],
      warnings: [],
    } satisfies TuningPlan);

    const result = await handleSlashCommand(
      '/tune-execute', engine, createTranscript(null), '/fake/project-root', false,
    );

    expect(result).toBe('handled');
    const logged = logSpy.mock.calls.flat().join('\n');
    expect(logged).toContain('file(s) staged -- write all?');
    expect(logged).toContain('shell-tuned-room.yaml');
    expect(logged).toContain('Say "yes" to write all');
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
describe('handleSlashCommand — /session list and switch', () => {
  it('lists named slots and switches the active copy', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'chat-session-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const { createSession, saveSession } = await import('./session.js');
      const harbor = createSession('harbor');
      await saveSession(projectRoot, harbor);
      const underdark = createSession('underdark');
      await saveSession(projectRoot, underdark);

      await handleSlashCommand(
        '/session list', makeEngine(projectRoot), createTranscript(null), projectRoot, false,
      );
      const listed = logSpy.mock.calls.flat().join('\n');
      expect(listed).toContain('harbor');
      expect(listed).toContain('underdark');

      logSpy.mockClear();
      await handleSlashCommand(
        '/session switch harbor', makeEngine(projectRoot), createTranscript(null), projectRoot, false,
      );
      expect(logSpy.mock.calls.flat().join('\n')).toContain('Switched to session "harbor"');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

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

  it('honors transcriptPath instead of the default .ai-transcripts dest (F-ef949bc5)', async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'persist-exit-path-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const custom = join(projectRoot, 'notes.txt');
    const transcript = createTranscript('path-test');
    addToTranscript(transcript, { role: 'user', content: 'keep me', timestamp: 't' });

    const saved = await persistTranscriptAtExit(transcript, projectRoot, true, custom);

    expect(saved).toBeTruthy();
    const onDisk = await readFile(saved!, 'utf-8');
    expect(onDisk).toContain('keep me');
    expect(await readFile(custom, 'utf-8')).toContain('keep me');
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Transcript saved to');
    await expect(access(defaultTranscriptPath(projectRoot, 'path-test'))).rejects.toThrow();
  });
});

describe('formatChatTurn + formatTranscriptPretty (F-8819f045)', () => {
  afterEach(() => setDisplayMode('compact'));

  it('labels user/assistant turns You/Assistant in compact mode', () => {
    setDisplayMode('compact');
    expect(formatChatTurn({ role: 'user', content: 'hello', timestamp: '2026-01-01T00:00:00.000Z' }))
      .toBe('You: hello');
    expect(formatChatTurn({ role: 'assistant', content: 'hi', timestamp: '2026-01-01T00:00:01.000Z' }))
      .toBe('Assistant: hi');
    expect(formatChatTurn({ role: 'user', content: 'hello', timestamp: '2026-01-01T00:00:00.000Z' }))
      .not.toContain('2026-01-01');
  });

  it('includes the stored timestamp in verbose mode', () => {
    setDisplayMode('verbose');
    expect(formatChatTurn({ role: 'user', content: 'hello', timestamp: '2026-01-01T00:00:00.000Z' }))
      .toBe('You [2026-01-01T00:00:00.000Z]: hello');
    expect(formatChatTurn({ role: 'assistant', content: 'hi', timestamp: '2026-01-01T00:00:01.000Z' }))
      .toBe('Assistant [2026-01-01T00:00:01.000Z]: hi');
  });

  it('pretty-prints the in-memory transcript with the same labels as the REPL', () => {
    setDisplayMode('compact');
    const t = createTranscript('pretty');
    addToTranscript(t, { role: 'user', content: 'hello', timestamp: '2026-01-01T00:00:00.000Z' });
    addToTranscript(t, { role: 'assistant', content: 'hi there', timestamp: '2026-01-01T00:00:01.000Z' });
    const pretty = formatTranscriptPretty(t);
    expect(pretty).toContain('You: hello');
    expect(pretty).toContain('Assistant: hi there');
    expect(pretty).not.toContain('(thinking...)');
  });
});

describe('beginThinking (F-8819f045)', () => {
  it('writes then erases (thinking...) on a TTY', () => {
    const chunks: string[] = [];
    const stream = new PassThrough();
    (stream as unknown as { isTTY: boolean }).isTTY = true;
    stream.on('data', (c: Buffer | string) => chunks.push(String(c)));
    const end = beginThinking(stream);
    end();
    const written = chunks.join('');
    expect(written).toContain('(thinking...)');
    expect(written).toContain('\r\x1b[K');
  });

  it('is a no-op when the stream is not a TTY', () => {
    const chunks: string[] = [];
    const stream = new PassThrough();
    stream.on('data', (c: Buffer | string) => chunks.push(String(c)));
    const end = beginThinking(stream);
    end();
    expect(chunks.join('')).toBe('');
  });
});

describe('runChatShell — labeled turns, no leftover thinking (F-8819f045)', () => {
  let projectRoot: string;

  afterEach(async () => {
    setDisplayMode('compact');
    if (projectRoot) {
      try { await rm(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  function logged(spy: { mock: { calls: unknown[][] } }): string {
    return spy.mock.calls.flat().join('\n');
  }

  it('prints You:/Assistant: labels and never leaves (thinking...) on stdout', async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'chat-shell-labels-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();
    void runChatShell({
      client: mockClient('MOCK_REPLY'),
      projectRoot,
      saveTranscripts: false,
      input,
      output,
    });

    input.write('hello there\n');
    await vi.waitFor(() => expect(logged(logSpy)).toMatch(/Assistant:/));

    const out = logged(logSpy);
    expect(out).toContain('You: hello there');
    expect(out).toMatch(/Assistant:/);
    expect(out).not.toContain('(thinking...)');
    input.end();
  });

  it('includes timestamps in verbose display mode', async () => {
    setDisplayMode('verbose');
    projectRoot = await mkdtemp(join(tmpdir(), 'chat-shell-verbose-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();
    void runChatShell({
      client: mockClient('MOCK_REPLY'),
      projectRoot,
      saveTranscripts: false,
      input,
      output,
    });

    input.write('hello there\n');
    await vi.waitFor(() => expect(logged(logSpy)).toMatch(/Assistant \[/));

    const out = logged(logSpy);
    expect(out).toMatch(/You \[[0-9T:.Z-]+\]: hello there/);
    expect(out).toMatch(/Assistant \[[0-9T:.Z-]+\]:/);
    expect(out).not.toContain('(thinking...)');
    input.end();
  });

  it('erases (thinking...) on a TTY before the assistant reply', async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'chat-shell-tty-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const input = new PassThrough();
    const output = new PassThrough();
    (output as unknown as { isTTY: boolean }).isTTY = true;
    const chunks: string[] = [];
    output.on('data', (c: Buffer | string) => chunks.push(String(c)));
    void runChatShell({
      client: mockClient('MOCK_REPLY'),
      projectRoot,
      saveTranscripts: false,
      input,
      output,
    });

    input.write('hello there\n');
    await vi.waitFor(() => expect(logged(logSpy)).toMatch(/Assistant:/));

    const written = chunks.join('');
    expect(written).toContain('(thinking...)');
    expect(written).toContain('\r\x1b[K');
    expect(logged(logSpy)).not.toContain('(thinking...)');
    input.end();
  });

  it('saves to --write <path> on exit, not the default .ai-transcripts file (F-ef949bc5)', async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'chat-shell-write-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const custom = join(projectRoot, 'notes.txt');
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();
    void runChatShell({
      client: mockClient('MOCK_REPLY'),
      projectRoot,
      saveTranscripts: true,
      transcriptPath: custom,
      input,
      output,
    });

    input.write('hello there\n');
    await vi.waitFor(() => expect(logged(logSpy)).toMatch(/Assistant:/));
    input.end();

    await vi.waitFor(async () => { await access(custom); });
    const onDisk = await readFile(custom, 'utf-8');
    expect(onDisk).toContain('hello there');
    await expect(access(defaultTranscriptPath(projectRoot, 'unnamed'))).rejects.toThrow();
  });
});

describe('handleSlashCommand — /transcript pretty-print (F-8819f045)', () => {
  afterEach(() => setDisplayMode('compact'));

  it('prints the labeled transcript via formatHeading', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const transcript = createTranscript(null);
    addToTranscript(transcript, { role: 'user', content: 'hello', timestamp: 't0' });
    addToTranscript(transcript, { role: 'assistant', content: 'hi', timestamp: 't1' });

    const result = await handleSlashCommand(
      '/transcript', makeEngine(), transcript, '/fake/project-root', false,
    );

    expect(result).toBe('handled');
    const logged = logSpy.mock.calls.flat().join('\n');
    expect(logged).toContain(formatHeading('Transcript'));
    expect(logged).toContain('You: hello');
    expect(logged).toContain('Assistant: hi');
    expect(logged).not.toContain('(thinking...)');
  });

  it('/save writes to a custom transcriptPath (F-ef949bc5)', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'chat-save-path-'));
    try {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const custom = join(projectRoot, 'notes.txt');
      const transcript = createTranscript('save-path');
      addToTranscript(transcript, { role: 'user', content: 'keep me', timestamp: 't' });

      const result = await handleSlashCommand(
        '/save', makeEngine(projectRoot), transcript, projectRoot, true, custom,
      );

      expect(result).toBe('handled');
      expect(logSpy.mock.calls.flat().join('\n')).toContain('Transcript saved to');
      const onDisk = await readFile(custom, 'utf-8');
      expect(onDisk).toContain('keep me');
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

describe('handleSlashCommand — /undo and /models', () => {
  it('/undo reports nothing to restore when no content_applied event exists', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const engine = makeEngine();
    engine.pendingWrite = { content: 'x', suggestedPath: 'x.yaml', label: 'x' };
    const result = await handleSlashCommand(
      '/undo', engine, createTranscript(null), '/fake/project-root', false,
    );
    expect(result).toBe('handled');
    expect(logSpy.mock.calls.flat().join('\n')).toMatch(/nothing to undo|backup not found|Error:/i);
    expect(engine.pendingWrite).not.toBeNull();
  });

  it('/models prints the configured model even when listModels is missing', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await handleSlashCommand(
      '/models', makeEngine(), createTranscript(null), '/fake/project-root', false,
    );
    expect(result).toBe('handled');
    const logged = logSpy.mock.calls.flat().join('\n');
    expect(logged).toContain('Configured model:');
  });
});
