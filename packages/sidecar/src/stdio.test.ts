// stdio.test.ts — launch-transport teardown. Protocol lives in server.test.ts.

import { describe, it, expect } from 'vitest';
import { startStdioServer } from './stdio.js';
import { encodeMessage, type ByteReadable, type ByteWritable } from './framing.js';
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
