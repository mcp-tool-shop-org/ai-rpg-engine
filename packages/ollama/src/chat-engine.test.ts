// Tests — chat engine: message processing, memory, confirmation flow

import { describe, it, expect } from 'vitest';
import type { OllamaTextClient, PromptInput, PromptResult } from './client.js';
import {
  createChatEngine, createChatMemory, addMessage, getRecentContext,
} from './chat-engine.js';

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
  it('asks for clarification on unrecognized input', async () => {
    const engine = createChatEngine({
      client: failingClient(), // LLM also fails — fully unknown
      projectRoot: '/tmp/test',
      rawMode: true,
    });
    const response = await engine.process('asdfjkl;');
    expect(response).toContain('not sure');
    expect(engine.memory.messages.length).toBe(2);
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
