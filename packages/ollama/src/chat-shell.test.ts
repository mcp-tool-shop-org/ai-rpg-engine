// Tests — chat shell slash-command handling.
// runChatShell() itself is a readline REPL loop (not directly unit-testable);
// handleSlashCommand() is exported for tests so individual /commands can be
// exercised without wiring up stdin/stdout.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleSlashCommand } from './chat-shell.js';
import { createChatEngine } from './chat-engine.js';
import { createTranscript } from './chat-transcript.js';
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
