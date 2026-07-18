// Tests — chat transcript: create, save, load, round-trip

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createTranscript, addToTranscript, saveTranscript, loadTranscript,
  defaultTranscriptPath,
} from './chat-transcript.js';

let tempDir: string;

afterEach(async () => {
  if (tempDir) {
    try { await rm(tempDir, { recursive: true }); } catch { /* ignore */ }
  }
});

describe('createTranscript', () => {
  it('creates a transcript with session name', () => {
    const t = createTranscript('test-session');
    expect(t.sessionName).toBe('test-session');
    expect(t.startedAt).toBeTruthy();
    expect(t.messages.length).toBe(0);
  });

  it('creates a transcript with null session', () => {
    const t = createTranscript(null);
    expect(t.sessionName).toBe('unnamed');
  });
});

describe('addToTranscript', () => {
  it('adds messages', () => {
    const t = createTranscript('test');
    addToTranscript(t, { role: 'user', content: 'hello', timestamp: '2025-01-01T00:00:00Z' });
    addToTranscript(t, { role: 'assistant', content: 'hi', timestamp: '2025-01-01T00:00:01Z' });
    expect(t.messages.length).toBe(2);
    expect(t.messages[0].content).toBe('hello');
    expect(t.messages[1].content).toBe('hi');
  });
});

describe('defaultTranscriptPath', () => {
  it('returns path under .ai-transcripts', () => {
    const path = defaultTranscriptPath('/project', 'my-session');
    expect(path).toContain('.ai-transcripts');
    expect(path).toContain('my-session');
    expect(path).toMatch(/\.jsonl$/);
  });

  it('sanitizes session name', () => {
    const path = defaultTranscriptPath('/project', 'My Complex Session!');
    expect(path).toContain('my-complex-session-');
    expect(path).not.toContain('!');
  });

  it('uses "chat" for null session', () => {
    const path = defaultTranscriptPath('/project', null);
    expect(path).toContain('chat');
  });
});

describe('saveTranscript + loadTranscript', () => {
  it('round-trips a transcript through JSONL', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'chat-transcript-test-'));
    const path = join(tempDir, 'test.jsonl');

    const t = createTranscript('test-session');
    addToTranscript(t, { role: 'user', content: 'hello', timestamp: '2025-01-01T00:00:00Z' });
    addToTranscript(t, { role: 'assistant', content: 'hi there', timestamp: '2025-01-01T00:00:01Z' });

    await saveTranscript(path, t, tempDir);

    // Verify JSONL format
    const raw = await readFile(path, 'utf-8');
    const lines = raw.trim().split('\n');
    expect(lines.length).toBe(3); // 1 header + 2 messages

    // Load and verify
    const loaded = await loadTranscript(path, tempDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.sessionName).toBe('test-session');
    expect(loaded!.messages.length).toBe(2);
    expect(loaded!.messages[0].role).toBe('user');
    expect(loaded!.messages[0].content).toBe('hello');
    expect(loaded!.messages[1].role).toBe('assistant');
    expect(loaded!.messages[1].content).toBe('hi there');
  });

  it('creates parent directory if needed', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'chat-transcript-test-'));
    const path = join(tempDir, 'sub', 'dir', 'test.jsonl');

    const t = createTranscript('test');
    await saveTranscript(path, t, tempDir);

    const loaded = await loadTranscript(path, tempDir);
    expect(loaded).not.toBeNull();
  });

  it('returns null for nonexistent file', async () => {
    const loaded = await loadTranscript('/nonexistent/path/test.jsonl');
    expect(loaded).toBeNull();
  });

  // ollama-04 — a corrupt JSONL line must not throw (contract: ChatTranscript | null)
  it('does not throw on a malformed line and skips it', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'chat-transcript-test-'));
    const path = join(tempDir, 'corrupt.jsonl');

    const header = JSON.stringify({ _type: 'transcript', sessionName: 'corrupt-test', startedAt: '2025-01-01T00:00:00Z', messageCount: 2 });
    const goodLine = JSON.stringify({ role: 'user', content: 'hello', timestamp: '2025-01-01T00:00:00Z' });
    const badLine = '{this is not valid json';
    await writeFile(path, [header, goodLine, badLine].join('\n') + '\n', 'utf-8');

    // Must not throw (rejects) and must honor the ChatTranscript | null contract.
    const loaded = await loadTranscript(path, tempDir);

    // Valid messages are preserved, malformed line skipped.
    expect(loaded).not.toBeNull();
    expect(loaded!.sessionName).toBe('corrupt-test');
    expect(loaded!.messages.length).toBe(1);
    expect(loaded!.messages[0].content).toBe('hello');
  });

  it('does not throw when the header line is malformed', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'chat-transcript-test-'));
    const path = join(tempDir, 'bad-header.jsonl');
    await writeFile(path, '{not valid header\n' + JSON.stringify({ role: 'user', content: 'hi', timestamp: '' }) + '\n', 'utf-8');

    // Should not throw a SyntaxError — returns a value per the documented contract.
    const loaded = await loadTranscript(path, tempDir);
    expect(loaded === null || typeof loaded === 'object').toBe(true);
  });

  it('preserves action metadata', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'chat-transcript-test-'));
    const path = join(tempDir, 'actions.jsonl');

    const t = createTranscript('test');
    addToTranscript(t, {
      role: 'assistant',
      content: 'Generated room',
      timestamp: '2025-01-01T00:00:00Z',
      actions: [{
        command: 'create-room',
        description: 'Generate a room',
        requiresConfirmation: false,
        status: 'executed',
      }],
    });

    await saveTranscript(path, t, tempDir);
    const loaded = await loadTranscript(path, tempDir);
    expect(loaded!.messages[0].actions).toBeDefined();
    expect(loaded!.messages[0].actions![0].command).toBe('create-room');
    expect(loaded!.messages[0].actions![0].status).toBe('executed');
  });
});

// v2.6 audit F-2992b0cf — saveTranscript()/loadTranscript() are exported from
// the package's public index.ts (external API surface, not private helpers),
// but previously wrote/read at whatever `path` string the caller supplied,
// with none of the withinRoot() project-root sandboxing that apply-preview.ts's
// generatePreview/applyConfirmed and the CLI's --write flag apply to every
// other AI-output-to-disk path in this package. Today's only production call
// sites always pass a defaultTranscriptPath()-derived path, so there was no
// currently-reachable exploit — but that safety was entirely caller
// discipline, not a property of these two functions. Mirrors
// apply-preview.test.ts's "sandbox confinement" suite exactly.
describe('saveTranscript + loadTranscript — project-root sandbox (F-2992b0cf)', () => {
  let root: string;
  let outside: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'chat-transcript-sandbox-'));
    root = join(tempDir, 'project');
    outside = join(tempDir, 'outside');
    await mkdir(root, { recursive: true });
    await mkdir(outside, { recursive: true });
  });

  it('saveTranscript refuses to write outside projectRoot (path-traversal attempt)', async () => {
    const escapee = join(root, '..', 'outside', 'escaped.jsonl');
    const t = createTranscript('escape-attempt');

    const result = await saveTranscript(escapee, t, root);
    expect(result).toContain('escapes project root');
    await expect(readFile(join(outside, 'escaped.jsonl'), 'utf-8')).rejects.toThrow(); // nothing written
  });

  it('saveTranscript still writes normally to a path inside projectRoot', async () => {
    const inside = join(root, 'chat.jsonl');
    const t = createTranscript('inside-session');

    const result = await saveTranscript(inside, t, root);
    expect(result).not.toContain('escapes project root');
    expect(await readFile(inside, 'utf-8')).toContain('inside-session');
  });

  it('loadTranscript refuses to read a file outside projectRoot even if it exists and is well-formed', async () => {
    // A real, valid transcript that just happens to live outside `root` —
    // loadTranscript must not become a file-existence/content oracle for
    // arbitrary on-disk paths outside the project. Written directly (not via
    // saveTranscript) so setup isn't itself subject to the sandbox under test.
    const secretPath = join(outside, 'secret.jsonl');
    const header = JSON.stringify({ _type: 'transcript', sessionName: 'SECRET-SESSION', startedAt: '2025-01-01T00:00:00Z', messageCount: 1 });
    const line = JSON.stringify({ role: 'user', content: 'do not leak this', timestamp: '2025-01-01T00:00:00Z' });
    await writeFile(secretPath, [header, line].join('\n') + '\n', 'utf-8');

    const loaded = await loadTranscript(join(root, '..', 'outside', 'secret.jsonl'), root);
    expect(loaded).toBeNull();
  });

  it('loadTranscript still reads a path inside projectRoot', async () => {
    const inside = join(root, 'chat.jsonl');
    const t = createTranscript('inside-session');
    await saveTranscript(inside, t, root);

    const loaded = await loadTranscript(inside, root);
    expect(loaded).not.toBeNull();
    expect(loaded!.sessionName).toBe('inside-session');
  });
});
