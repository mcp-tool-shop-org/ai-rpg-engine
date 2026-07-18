import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runGuardedAction, replayGame } from './bin.js';

// CLI-010 — the interactive loop must never crash an unsaved session when a
// buggy custom module throws inside submitAction/submitActionAs. The guarded
// wrapper swallows the throw, prints a bounded structured message, and reports
// failure so the caller can keep prompting.
describe('runGuardedAction (CLI-010)', () => {
  it('returns true and does not log when the action succeeds', () => {
    const log = vi.fn();
    const ok = runGuardedAction(() => [{ type: 'noop' }], log);
    expect(ok).toBe(true);
    expect(log).not.toHaveBeenCalled();
  });

  it('swallows a thrown Error, returns false, and prints a bounded reason', () => {
    const log = vi.fn();
    const ok = runGuardedAction(() => {
      throw new Error('module blew up');
    }, log);
    expect(ok).toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
    const msg = log.mock.calls[0][0] as string;
    expect(msg).toContain('That action could not be completed');
    expect(msg).toContain('module blew up');
  });

  it('includes a structured error code when the thrown value carries one', () => {
    const log = vi.fn();
    const err = Object.assign(new Error('bad status'), { code: 'STATUS_UNKNOWN' });
    runGuardedAction(() => {
      throw err;
    }, log);
    const msg = log.mock.calls[0][0] as string;
    expect(msg).toContain('STATUS_UNKNOWN');
    expect(msg).toContain('bad status');
  });

  it('bounds the message length so a huge error cannot flood the terminal', () => {
    const log = vi.fn();
    runGuardedAction(() => {
      throw new Error('x'.repeat(5000));
    }, log);
    const msg = log.mock.calls[0][0] as string;
    // The whole line stays well under the 5000-char payload.
    expect(msg.length).toBeLessThanOrEqual(300);
  });

  it('collapses multi-line error messages onto a single line', () => {
    const log = vi.fn();
    runGuardedAction(() => {
      throw new Error('line one\nline two\nline three');
    }, log);
    const msg = log.mock.calls[0][0] as string;
    // No interior newlines — a stack-ish multi-line message becomes one line.
    expect(msg.split('\n')).toHaveLength(1);
  });

  it('handles a thrown non-Error value without crashing', () => {
    const log = vi.fn();
    const ok = runGuardedAction(() => {
      throw 'plain string failure';
    }, log);
    expect(ok).toBe(false);
    const msg = log.mock.calls[0][0] as string;
    expect(msg).toContain('plain string failure');
  });
});

// F-7650e39d — the `--replay` re-simulation branch read `data.actionLog ?? []`
// straight from a hand-crafted/corrupted save with no shape validation, then
// did `for (const action of actionLog)`. The `??` only substitutes for
// null/undefined; a corrupted save with actionLog set to any other
// non-iterable JSON value (number/boolean/plain object) raw-throws an
// unstructured TypeError out of the for..of loop, unlike the immediately
// adjacent default-load branch in the same function, which wraps
// WorldStore.deserialize in try/catch and prints a friendly
// `[code] message` + hint on SaveLoadError.
class ProcessExitSignal extends Error {
  constructor(public code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

describe('replayGame --replay (F-7650e39d: actionLog must be validated before iterating)', () => {
  let tmpDir: string;
  let originalCwd: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-replay-test-'));
    fs.mkdirSync(path.join(tmpDir, '.ai-rpg-engine'), { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ProcessExitSignal(code);
    }) as never);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function writeSave(actionLogValue: unknown, includeActionLog = true) {
    const save: Record<string, unknown> = {
      world: { state: { meta: { gameId: 'chapel-threshold', seed: 1 } } },
    };
    if (includeActionLog) save.actionLog = actionLogValue;
    fs.writeFileSync(path.join(tmpDir, '.ai-rpg-engine', 'save.json'), JSON.stringify(save), 'utf-8');
  }

  it('a non-array actionLog (number) is rejected with a structured message, not a raw TypeError', () => {
    writeSave(42);
    expect(() => replayGame(['--replay'])).toThrow(ProcessExitSignal);
    expect(exitSpy).toHaveBeenCalledWith(1);
    const allErrorText = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allErrorText.toLowerCase()).toContain('actionlog');
  });

  it('a non-array actionLog (plain object) is rejected the same way', () => {
    writeSave({ not: 'an array' });
    expect(() => replayGame(['--replay'])).toThrow(ProcessExitSignal);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('a non-array actionLog (boolean) is rejected the same way', () => {
    writeSave(true);
    expect(() => replayGame(['--replay'])).toThrow(ProcessExitSignal);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('a missing actionLog defaults to empty and replays cleanly (pre-existing behavior)', () => {
    writeSave(undefined, false);
    expect(() => replayGame(['--replay'])).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('a valid empty-array actionLog replays cleanly (control)', () => {
    writeSave([]);
    expect(() => replayGame(['--replay'])).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
