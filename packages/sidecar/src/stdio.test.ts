// stdio.test.ts — launch-transport teardown. Protocol lives in server.test.ts.

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import { startStdioServer } from './stdio.js';
import {
  MessageReader,
  encodeMessage,
  type ByteReadable,
  type ByteWritable,
  type RpcMessage,
} from './framing.js';
import { METHODS, NOTIFICATIONS } from './protocol.js';

function stubEngine(): unknown {
  return {
    world: { tick: 0, locationId: 'nowhere', eventLog: [] as unknown[] },
    store: { tick: 0 },
    submitAction: () => [],
    shutdown: () => {},
    moduleManager: { getModules: () => [] },
  };
}

function livingEngine() {
  return createTestEngine({
    modules: [],
    playerId: 'hero',
    startZone: 'room',
    entities: [
      {
        id: 'hero',
        blueprintId: 'hero',
        type: 'player',
        name: 'Hero',
        tags: ['player'],
        stats: {},
        resources: { hp: 10 },
        statuses: [],
        zoneId: 'room',
      },
    ],
    zones: [{ id: 'room', roomId: 'room', name: 'Room', tags: [], neighbors: [] }],
  });
}

function stdioPipe(): {
  input: ByteReadable;
  output: ByteWritable;
  push: (msg: RpcMessage) => void;
  replies: () => RpcMessage[];
} {
  let onData: ((chunk: Buffer | string) => void) | undefined;
  const chunks: string[] = [];
  const input: ByteReadable = {
    on(event, listener) {
      if (event === 'data') onData = listener;
      return input;
    },
  };
  const output: ByteWritable = { write: (c) => chunks.push(c) };
  return {
    input,
    output,
    push(msg) {
      onData?.(encodeMessage(msg));
    },
    replies() {
      const messages: RpcMessage[] = [];
      const reader = new MessageReader(
        (m) => messages.push(m),
        () => undefined,
      );
      reader.push(chunks.join(''));
      return messages;
    },
  };
}

describe('F-009da546 — shutdown pauses stdin', () => {
  it('pauses the input stream after a successful shutdown', () => {
    let paused = 0;
    let onData: ((chunk: Buffer | string) => void) | undefined;
    const input: ByteReadable = {
      on(event, listener) {
        if (event === 'data') onData = listener;
        return input;
      },
      pause() {
        paused += 1;
      },
    };
    const chunks: string[] = [];
    const output: ByteWritable = { write: (c) => chunks.push(c) };

    startStdioServer({ engine: stubEngine() as never, engineVersion: '3.8.0-test' }, input, output);
    onData?.(encodeMessage({ jsonrpc: '2.0', id: 1, method: METHODS.INITIALIZE, params: {} }));
    onData?.(encodeMessage({ jsonrpc: '2.0', id: 2, method: METHODS.SHUTDOWN, params: {} }));

    expect(paused).toBeGreaterThan(0);
    expect(chunks.join('')).toContain(NOTIFICATIONS.CLOSING);
  });
});

describe('F-5a967dc1 — omitted advanceRound defaults to Engine.advanceRound(1)', () => {
  it('startStdioServer({ engine, engineVersion }) ADVANCE 1 runs and tick moves', () => {
    const engine = livingEngine();
    const tickBefore = engine.store.tick;
    const pipe = stdioPipe();
    startStdioServer({ engine, engineVersion: '3.8.0-test' }, pipe.input, pipe.output);
    pipe.push({ jsonrpc: '2.0', id: 1, method: METHODS.INITIALIZE, params: {} });
    pipe.push({ jsonrpc: '2.0', id: 2, method: METHODS.ADVANCE, params: { rounds: 1 } });

    const reply = pipe.replies().find((m) => m.id === 2);
    expect(reply?.error).toBeUndefined();
    expect((reply?.result as { tick?: number } | undefined)?.tick).toBe(tickBefore + 1);
    expect(engine.store.tick).toBe(tickBefore + 1);
  });

  it('a host-supplied advanceRound callback still wins over the default', () => {
    const engine = livingEngine();
    const tickBefore = engine.store.tick;
    let hostCalls = 0;
    const pipe = stdioPipe();
    startStdioServer(
      {
        engine,
        engineVersion: '3.8.0-test',
        advanceRound: () => {
          hostCalls += 1;
        },
      },
      pipe.input,
      pipe.output,
    );
    pipe.push({ jsonrpc: '2.0', id: 1, method: METHODS.INITIALIZE, params: {} });
    pipe.push({ jsonrpc: '2.0', id: 2, method: METHODS.ADVANCE, params: { rounds: 1 } });

    const reply = pipe.replies().find((m) => m.id === 2);
    expect(reply?.error).toBeUndefined();
    expect(hostCalls).toBe(1);
    expect(engine.store.tick).toBe(tickBefore);
  });
});
