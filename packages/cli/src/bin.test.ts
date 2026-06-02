import { describe, it, expect, vi } from 'vitest';
import { runGuardedAction } from './bin.js';

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
