// Tests — chat transcript: create, save, load, round-trip

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
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

    await saveTranscript(path, t);

    // Verify JSONL format
    const raw = await readFile(path, 'utf-8');
    const lines = raw.trim().split('\n');
    expect(lines.length).toBe(3); // 1 header + 2 messages

    // Load and verify
    const loaded = await loadTranscript(path);
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
    await saveTranscript(path, t);

    const loaded = await loadTranscript(path);
    expect(loaded).not.toBeNull();
  });

  it('returns null for nonexistent file', async () => {
    const loaded = await loadTranscript('/nonexistent/path/test.jsonl');
    expect(loaded).toBeNull();
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

    await saveTranscript(path, t);
    const loaded = await loadTranscript(path);
    expect(loaded!.messages[0].actions).toBeDefined();
    expect(loaded!.messages[0].actions![0].command).toBe('create-room');
    expect(loaded!.messages[0].actions![0].status).toBe('executed');
  });
});
