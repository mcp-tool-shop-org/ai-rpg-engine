// Tests — chat engine: message processing, memory, confirmation flow

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OllamaTextClient, PromptInput, PromptResult } from './client.js';
import {
  createChatEngine, createChatMemory, addMessage, getRecentContext,
  capturePlanFromOutput,
  type BatchStepProgress,
} from './chat-engine.js';
import { createBuildState, type BuildPlan, type BuildStep } from './chat-build-planner.js';
import { createTuningState, type TuningPlan, type TuningStep } from './chat-balance-analyzer.js';

function mockClient(response: string): OllamaTextClient {
  return {
    async generate(_input: PromptInput): Promise<PromptResult> {
      return { ok: true, text: response };
    },
  };
}

function failingClient(): OllamaTextClient {
  return {
    async generate(_input: PromptInput): Promise<PromptResult> {
      return { ok: false, error: 'connection refused' };
    },
  };
}

// --- Chat memory ---

describe('createChatMemory', () => {
  it('creates empty memory with max limit', () => {
    const mem = createChatMemory(10, null);
    expect(mem.messages.length).toBe(0);
    expect(mem.maxMessages).toBe(10);
    expect(mem.sessionName).toBeNull();
  });

  it('creates memory with session name', () => {
    const mem = createChatMemory(10, 'test-session');
    expect(mem.sessionName).toBe('test-session');
  });
});

describe('addMessage', () => {
  it('adds messages to memory', () => {
    const mem = createChatMemory(10, null);
    addMessage(mem, { role: 'user', content: 'hello', timestamp: '' });
    expect(mem.messages.length).toBe(1);
    addMessage(mem, { role: 'assistant', content: 'hi', timestamp: '' });
    expect(mem.messages.length).toBe(2);
  });

  it('trims oldest messages when exceeding max', () => {
    const mem = createChatMemory(3, null);
    addMessage(mem, { role: 'user', content: 'msg1', timestamp: '' });
    addMessage(mem, { role: 'user', content: 'msg2', timestamp: '' });
    addMessage(mem, { role: 'user', content: 'msg3', timestamp: '' });
    addMessage(mem, { role: 'user', content: 'msg4', timestamp: '' });
    expect(mem.messages.length).toBe(3);
    expect(mem.messages[0].content).toBe('msg2');
    expect(mem.messages[2].content).toBe('msg4');
  });

  it('preserves system message when trimming', () => {
    const mem = createChatMemory(3, null);
    addMessage(mem, { role: 'system', content: 'sys', timestamp: '' });
    addMessage(mem, { role: 'user', content: 'msg1', timestamp: '' });
    addMessage(mem, { role: 'user', content: 'msg2', timestamp: '' });
    addMessage(mem, { role: 'user', content: 'msg3', timestamp: '' });
    expect(mem.messages.length).toBe(3);
    expect(mem.messages[0].role).toBe('system');
    expect(mem.messages[0].content).toBe('sys');
    expect(mem.messages[1].content).toBe('msg2');
    expect(mem.messages[2].content).toBe('msg3');
  });
});

describe('getRecentContext', () => {
  it('returns last N messages formatted', () => {
    const mem = createChatMemory(10, null);
    addMessage(mem, { role: 'user', content: 'hello', timestamp: '' });
    addMessage(mem, { role: 'assistant', content: 'hi there', timestamp: '' });
    const ctx = getRecentContext(mem, 2);
    expect(ctx).toContain('user: hello');
    expect(ctx).toContain('assistant: hi there');
  });

  it('returns empty string for empty memory', () => {
    const mem = createChatMemory(10, null);
    const ctx = getRecentContext(mem);
    expect(ctx).toBe('');
  });
});

// --- Plan capture (ollama-chat-silent-plan-parse-failure) ---
// When a tool's structured output can't be parsed back into a plan/summary,
// the engine used to swallow the error silently (empty catch). It must instead
// surface a one-line, actionable notice so the user knows the plan was dropped.
describe('capturePlanFromOutput', () => {
  it('parses valid JSON and returns no notice', () => {
    const { value, notice } = capturePlanFromOutput<{ goal: string }>(
      '{"goal":"build a market"}',
      'build plan',
    );
    expect(value).toEqual({ goal: 'build a market' });
    expect(notice).toBeNull();
  });

  it('returns a null value and an actionable notice on unparseable output', () => {
    const { value, notice } = capturePlanFromOutput(
      '{"goal": "truncated', // missing closing brace/quote
      'build plan',
    );
    expect(value).toBeNull();
    expect(notice).not.toBeNull();
    // Names what was dropped (so the user understands the gap)…
    expect(notice).toMatch(/build plan/i);
    // …and is a single line (no embedded newlines).
    expect(notice).not.toContain('\n');
  });
});

// --- Chat engine ---

describe('createChatEngine', () => {
  it('creates engine with memory and null pending write', () => {
    const engine = createChatEngine({
      client: mockClient('test'),
      projectRoot: '/tmp/test',
      rawMode: true,
    });
    expect(engine.memory.messages.length).toBe(0);
    expect(engine.pendingWrite).toBeNull();
  });
});

describe('engine.process — help', () => {
  it('responds to "help" via keyword path', async () => {
    const engine = createChatEngine({
      client: mockClient('test'),
      projectRoot: '/tmp/test',
      rawMode: true,
    });
    const response = await engine.process('help');
    expect(response).toContain('Design:');
    expect(response).toContain('Iterate:');
    expect(engine.memory.messages.length).toBe(2); // user + assistant
    expect(engine.memory.messages[0].role).toBe('user');
    expect(engine.memory.messages[1].role).toBe('assistant');
  });
});

describe('engine.process — unknown intent', () => {
  it('asks for clarification when the LLM RAN but could not classify', async () => {
    const engine = createChatEngine({
      client: mockClient('I have no idea what this means'), // LLM works, output unclassifiable
      projectRoot: '/tmp/test',
      rawMode: true,
    });
    const response = await engine.process('asdfjkl;');
    expect(response).toContain('not sure');
    expect(engine.memory.messages.length).toBe(2);
  });

  // v2.6 Stage C F-c1a55f01 — when the classifier client FAILS (daemon not
  // running, model not pulled: the #1 failure case), the user used to be told
  // their PHRASING was the problem ("Could you rephrase...?") while the
  // client's curated offline hint was discarded. The engine must surface the
  // client error verbatim instead of the rephrase prompt.
  it('surfaces the client offline hint (not a rephrase prompt) when the LLM is unreachable', async () => {
    const offlineError =
      'Ollama request failed: fetch failed. Could not reach the Ollama server at http://localhost:11434. '
      + 'Is it running? Start it with "ollama serve", or point at a different host via AI_RPG_ENGINE_OLLAMA_URL.';
    const client: OllamaTextClient = {
      async generate(): Promise<PromptResult> {
        return { ok: false, error: offlineError };
      },
    };
    const engine = createChatEngine({ client, projectRoot: '/tmp/test', rawMode: true });

    const response = await engine.process('hello there');

    // The curated hint arrives verbatim...
    expect(response).toContain('ollama serve');
    expect(response).toContain('http://localhost:11434');
    // ...and the user's phrasing is NOT blamed.
    expect(response).not.toMatch(/rephrase/i);
    expect(response).not.toContain('not sure');
  });

  it('surfaces the model-not-pulled error the same way', async () => {
    const pullError = 'Model "qwen2.5-coder" is not installed on the Ollama server '
      + '(model "qwen2.5-coder" not found, try pulling it first). '
      + 'Pull it first with "ollama pull qwen2.5-coder", '
      + 'or pick an installed model via AI_RPG_ENGINE_OLLAMA_MODEL or --model.';
    const client: OllamaTextClient = {
      async generate(): Promise<PromptResult> {
        return { ok: false, error: pullError };
      },
    };
    const engine = createChatEngine({ client, projectRoot: '/tmp/test', rawMode: true });

    const response = await engine.process('hello');
    expect(response).toContain('ollama pull qwen2.5-coder');
    expect(response).not.toMatch(/rephrase/i);
  });
});

describe('engine.process — scaffold', () => {
  it('scaffolds a room and sets pending write', async () => {
    const yaml = 'id: dark-chapel\ntype: room\nname: Dark Chapel\ntags: [horror]';
    const engine = createChatEngine({
      client: mockClient(yaml),
      projectRoot: '/tmp/test',
      rawMode: true,
    });
    const response = await engine.process('create a room about a dark chapel');
    expect(response).toContain('dark-chapel');
    expect(engine.pendingWrite).not.toBeNull();
    expect(engine.pendingWrite!.content).toContain('dark-chapel');
    expect(engine.pendingWrite!.suggestedPath).toContain('dark-chapel');
  });
});

describe('engine.process — session info without session', () => {
  it('reports no active session', async () => {
    const engine = createChatEngine({
      client: mockClient('test'),
      projectRoot: '/tmp/nonexistent-path-' + Date.now(),
      rawMode: true,
    });
    const response = await engine.process('show me the session');
    expect(response).toContain('No active session');
  });
});

describe('engine.process — confirmation flow', () => {
  it('rejects write with "no"', async () => {
    const yaml = 'id: test-room\ntype: room\nname: Test';
    const engine = createChatEngine({
      client: mockClient(yaml),
      projectRoot: '/tmp/test',
      rawMode: true,
    });

    // First scaffold to get pending write
    await engine.process('create a room');
    expect(engine.pendingWrite).not.toBeNull();

    // Then reject
    const response = await engine.process('no');
    expect(response).toContain('cancelled');
    expect(engine.pendingWrite).toBeNull();
  });
});

// ollama-02 — confirmed writes must confine against the configured projectRoot,
// not process.cwd(). A path inside projectRoot but outside cwd must be allowed.
describe('engine.process — confirmed write confines against projectRoot', () => {
  let projectRoot: string;

  afterEach(async () => {
    if (projectRoot) {
      try { await rm(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it('allows a write to an absolute path inside projectRoot (outside cwd)', async () => {
    // A temp dir is outside the test runner's cwd (the repo root).
    projectRoot = await mkdtemp(join(tmpdir(), 'ollama-engine-root-'));
    const target = join(projectRoot, 'artifact.yaml');

    const engine = createChatEngine({
      client: mockClient('ack'),
      projectRoot,
      rawMode: true,
    });

    // Seed a pending write pointing inside projectRoot but outside cwd.
    engine.pendingWrite = {
      content: 'id: confined\nname: Confined Artifact',
      suggestedPath: target,
      label: 'confined artifact',
    };

    const response = await engine.process('yes');

    // With the bug (confine vs cwd) this returns "escapes project root".
    expect(response).not.toMatch(/escapes project root/i);
    expect(response).toContain('Written');

    // File actually exists on disk under projectRoot.
    await expect(access(target)).resolves.toBeUndefined();
    const onDisk = await readFile(target, 'utf-8');
    expect(onDisk).toBe('id: confined\nname: Confined Artifact');
  });

  it('still rejects a confirmed write that escapes projectRoot', async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'ollama-engine-root-'));
    // Sibling temp dir — outside projectRoot.
    const outside = await mkdtemp(join(tmpdir(), 'ollama-engine-out-'));
    const escapeTarget = join(outside, 'escape.yaml');

    const engine = createChatEngine({
      client: mockClient('ack'),
      projectRoot,
      rawMode: true,
    });
    engine.pendingWrite = {
      content: 'id: escape',
      suggestedPath: escapeTarget,
      label: 'escape',
    };

    const response = await engine.process('yes');
    expect(response).toMatch(/escapes project root/i);
    // No file written outside the sandbox.
    await expect(access(escapeTarget)).rejects.toBeTruthy();
    try { await rm(outside, { recursive: true, force: true }); } catch { /* ignore */ }
  });
});

// --- Batch execution: per-step progress + early abort (F-4be7a3c2) ---
// /execute used to print one line and then give N model generations of total
// silence; and with the daemon down, every remaining step still burned its
// full retry cycle just to fail identically. The invariants: onStep fires as
// each step completes, and two consecutive identical failures stop the batch.

function scaffoldStep(id: number, description: string): BuildStep {
  return {
    id,
    description,
    command: 'create-room',
    intent: 'scaffold',
    params: { kind: 'room', theme: `theme-${id}` },
    dependencies: [],
    artifactOutputs: ['rooms'],
    usePriorContent: false,
    status: 'pending',
  };
}

function buildPlanOf(steps: BuildStep[]): BuildPlan {
  return { goal: 'test build', steps, estimatedSteps: steps.length, warnings: [] };
}

function tuningStepOf(id: number, description: string): TuningStep {
  return {
    id,
    description,
    command: 'create-room',
    intent: 'scaffold',
    params: { kind: 'room', theme: `tune-${id}` },
    dependencies: [],
    expectedEffect: 'none',
    status: 'pending',
  };
}

describe('executeAllBuildSteps — per-step progress callback (F-4be7a3c2)', () => {
  it('fires onStep once per step with index/total/ok as steps complete', async () => {
    const yaml = 'id: progress-room\ntype: room\nname: Progress Room';
    const engine = createChatEngine({
      client: mockClient(yaml),
      projectRoot: '/tmp/nonexistent-' + Date.now(),
      rawMode: true,
    });
    engine.activeBuild = createBuildState(buildPlanOf([
      scaffoldStep(1, 'first room'),
      scaffoldStep(2, 'second room'),
      scaffoldStep(3, 'third room'),
    ]));

    const events: BatchStepProgress[] = [];
    const result = await engine.executeAllBuildSteps((p) => events.push(p));

    expect(events).toHaveLength(3);
    expect(events.map(e => e.index)).toEqual([1, 2, 3]);
    expect(events.every(e => e.total === 3)).toBe(true);
    expect(events.every(e => e.ok)).toBe(true);
    expect(events[0].description).toBe('first room');
    expect(events[0].result).toContain('Step 1');
    // The final summary still contains every step's result.
    expect(result).toContain('Step 1');
    expect(result).toContain('Step 3');
    expect(result).not.toContain('Stopped early');
  });

  it('works with no callback (backward compatible)', async () => {
    const yaml = 'id: quiet-room\ntype: room\nname: Quiet Room';
    const engine = createChatEngine({
      client: mockClient(yaml),
      projectRoot: '/tmp/nonexistent-' + Date.now(),
      rawMode: true,
    });
    engine.activeBuild = createBuildState(buildPlanOf([scaffoldStep(1, 'only room')]));
    const result = await engine.executeAllBuildSteps();
    expect(result).toContain('Step 1');
  });

  it('stops the batch after two consecutive identical failures instead of burning every step', async () => {
    const engine = createChatEngine({
      client: failingClient(), // every step fails the same way
      projectRoot: '/tmp/nonexistent-' + Date.now(),
      rawMode: true,
    });
    engine.activeBuild = createBuildState(buildPlanOf([
      scaffoldStep(1, 'one'),
      scaffoldStep(2, 'two'),
      scaffoldStep(3, 'three'),
      scaffoldStep(4, 'four'),
    ]));

    const events: BatchStepProgress[] = [];
    const result = await engine.executeAllBuildSteps((p) => events.push(p));

    // Only the first two identical failures execute; steps 3-4 are skipped.
    expect(events).toHaveLength(2);
    expect(events.every(e => !e.ok)).toBe(true);
    expect(result).toContain('Stopped early');
    expect(result).toContain('2 step(s)');
    // The remaining steps are still pending, so the build can be resumed.
    const pending = engine.activeBuild!.plan.steps.filter(s => s.status === 'pending');
    expect(pending.map(s => s.id)).toEqual([3, 4]);
  });
});

describe('executeAllTuningSteps — per-step progress + early abort (F-4be7a3c2)', () => {
  it('fires onStep per tuning step', async () => {
    const yaml = 'id: tuned-room\ntype: room\nname: Tuned Room';
    const engine = createChatEngine({
      client: mockClient(yaml),
      projectRoot: '/tmp/nonexistent-' + Date.now(),
      rawMode: true,
    });
    engine.activeTuning = createTuningState({
      goal: 'test tuning',
      steps: [tuningStepOf(1, 'tune one'), tuningStepOf(2, 'tune two')],
      warnings: [],
    } satisfies TuningPlan);

    const events: BatchStepProgress[] = [];
    await engine.executeAllTuningSteps((p) => events.push(p));

    expect(events).toHaveLength(2);
    expect(events.map(e => e.index)).toEqual([1, 2]);
    expect(events.every(e => e.total === 2 && e.ok)).toBe(true);
  });

  it('stops tuning after two consecutive identical failures', async () => {
    const engine = createChatEngine({
      client: failingClient(),
      projectRoot: '/tmp/nonexistent-' + Date.now(),
      rawMode: true,
    });
    engine.activeTuning = createTuningState({
      goal: 'doomed tuning',
      steps: [tuningStepOf(1, 'a'), tuningStepOf(2, 'b'), tuningStepOf(3, 'c')],
      warnings: [],
    } satisfies TuningPlan);

    const events: BatchStepProgress[] = [];
    const result = await engine.executeAllTuningSteps((p) => events.push(p));

    expect(events).toHaveLength(2);
    expect(result).toContain('Stopped early');
    const pending = engine.activeTuning!.plan.steps.filter(s => s.status === 'pending');
    expect(pending.map(s => s.id)).toEqual([3]);
  });
});

describe('engine memory tracking', () => {
  it('records all messages in memory', async () => {
    const engine = createChatEngine({
      client: mockClient('test response'),
      projectRoot: '/tmp/test',
      rawMode: true,
    });

    await engine.process('help');
    await engine.process('what can you do');

    // Each process call adds 2 messages (user + assistant)
    expect(engine.memory.messages.length).toBe(4);
    expect(engine.memory.messages.map(m => m.role)).toEqual([
      'user', 'assistant', 'user', 'assistant',
    ]);
  });

  it('respects max memory limit', async () => {
    const engine = createChatEngine({
      client: mockClient('test'),
      projectRoot: '/tmp/test',
      maxMemory: 4,
      rawMode: true,
    });

    await engine.process('msg1');
    await engine.process('msg2');
    await engine.process('msg3');

    // 3 exchanges = 6 messages, but max is 4
    expect(engine.memory.messages.length).toBeLessThanOrEqual(4);
  });
});
