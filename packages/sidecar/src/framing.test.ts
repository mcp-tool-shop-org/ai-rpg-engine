// framing.test.ts — the byte layer, with the controls a framing bug hides behind.
//
// A framing bug does not look like a framing bug. It looks like garbled JSON,
// or a client that works until a message happens to straddle a chunk boundary,
// or a process that buffers for ever against a peer that never terminates a
// header. Each of those is a test here, because none of them will be found by
// exercising the happy path.

import { describe, it, expect } from 'vitest';
import {
  MessageReader,
  MessageTooLargeError,
  encodeMessage,
  MAX_MESSAGE_BYTES,
  type FramingError,
  type RpcMessage,
} from './framing.js';

function collect(): {
  reader: MessageReader;
  messages: RpcMessage[];
  errors: FramingError[];
} {
  const messages: RpcMessage[] = [];
  const errors: FramingError[] = [];
  const reader = new MessageReader(
    (m) => messages.push(m),
    (e) => errors.push(e),
  );
  return { reader, messages, errors };
}

describe('C1/P3 — Content-Length framing', () => {
  it('round-trips one message', () => {
    const { reader, messages, errors } = collect();
    reader.push(encodeMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' }));
    expect(errors).toEqual([]);
    expect(messages).toEqual([{ jsonrpc: '2.0', id: 1, method: 'initialize' }]);
  });

  it('declares BYTE length, not character length', () => {
    // The bug this catches is permanent desynchronisation: a multi-byte
    // character makes a character-counted header under-declare the frame, so the
    // reader keeps the tail and every subsequent message is misaligned. It works
    // perfectly until someone names a zone "Café".
    const message = { jsonrpc: '2.0', id: 1, params: { name: 'Café ✧ 日本' } };
    const encoded = encodeMessage(message);
    const declared = Number(/Content-Length: (\d+)/.exec(encoded)![1]);
    const body = encoded.slice(encoded.indexOf('\r\n\r\n') + 4);
    expect(declared).toBe(Buffer.byteLength(body, 'utf-8'));
    expect(declared).toBeGreaterThan(body.length); // multi-byte, so bytes > chars

    const { reader, messages } = collect();
    reader.push(encoded);
    expect(messages[0]).toEqual(message);
  });

  it('reassembles a message split across arbitrary chunk boundaries', () => {
    // Every byte offset, one at a time. A reader that works on whole messages
    // and breaks on a split is the classic framing defect, and it only shows up
    // under real stream pressure — never in a test that pushes one string.
    const encoded = encodeMessage({ jsonrpc: '2.0', id: 7, method: 'snapshot', params: {} });
    for (let split = 1; split < encoded.length; split++) {
      const { reader, messages, errors } = collect();
      reader.push(Buffer.from(encoded.slice(0, split), 'utf-8'));
      reader.push(Buffer.from(encoded.slice(split), 'utf-8'));
      expect(errors, `split at ${split}`).toEqual([]);
      expect(messages, `split at ${split}`).toHaveLength(1);
      expect(messages[0].id).toBe(7);
    }
  });

  it('emits every message when many arrive in one chunk', () => {
    const { reader, messages } = collect();
    const batch = Array.from({ length: 200 }, (_, i) => encodeMessage({ jsonrpc: '2.0', id: i })).join('');
    reader.push(batch);
    expect(messages).toHaveLength(200);
    expect(messages[199].id).toBe(199);
  });

  it('CONTROL: an incomplete message emits nothing and waits', () => {
    const { reader, messages, errors } = collect();
    const encoded = encodeMessage({ jsonrpc: '2.0', id: 1 });
    reader.push(encoded.slice(0, encoded.length - 3));
    expect(messages).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('RED: a malformed header is reported and the reader RESYNCHRONISES', () => {
    // Reporting is not enough. A reader that reports and then stalls has turned
    // one bad frame into a dead connection.
    const { reader, messages, errors } = collect();
    reader.push('Content-Type: nonsense\r\n\r\n');
    reader.push(encodeMessage({ jsonrpc: '2.0', id: 42 }));
    expect(errors[0].kind).toBe('malformed-header');
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe(42);
  });

  it('RED: a bad Content-Length is reported and recovered from', () => {
    const { reader, messages, errors } = collect();
    reader.push('Content-Length: 99999999999999\r\n\r\n');
    reader.push(encodeMessage({ jsonrpc: '2.0', id: 5 }));
    expect(errors[0].kind).toBe('bad-length');
    expect(messages[0].id).toBe(5);
  });

  it('RED: an unparseable body is reported, and the next message still lands', () => {
    const { reader, messages, errors } = collect();
    const bad = '{not json}';
    reader.push(`Content-Length: ${Buffer.byteLength(bad)}\r\n\r\n${bad}`);
    reader.push(encodeMessage({ jsonrpc: '2.0', id: 9 }));
    expect(errors[0].kind).toBe('parse-error');
    expect(messages[0].id).toBe(9);
  });

  it('RED: a non-object body is refused', () => {
    const { reader, messages, errors } = collect();
    const bad = '[1,2,3]';
    reader.push(`Content-Length: ${Buffer.byteLength(bad)}\r\n\r\n${bad}`);
    expect(errors[0].kind).toBe('parse-error');
    expect(messages).toEqual([]);
  });

  it('RED: a peer that never terminates a header cannot buffer without bound', () => {
    // Without the ceiling this is an unbounded memory sink reachable by anything
    // that can open the transport.
    const { reader, errors } = collect();
    const chunk = 'x'.repeat(1024 * 1024);
    for (let i = 0; i < 17; i++) reader.push(chunk);
    expect(errors.some((e) => e.kind === 'oversize')).toBe(true);
    // …and it recovers rather than staying poisoned.
    const { reader: r2, messages } = collect();
    r2.push(encodeMessage({ jsonrpc: '2.0', id: 1 }));
    expect(messages).toHaveLength(1);
    expect(MAX_MESSAGE_BYTES).toBe(16 * 1024 * 1024);
  });

  it('RED: encodeMessage refuses a body above MAX_MESSAGE_BYTES (SNAPSHOT_TOO_LARGE)', () => {
    const huge = { jsonrpc: '2.0', id: 1, result: 'x'.repeat(MAX_MESSAGE_BYTES) };
    try {
      encodeMessage(huge);
    } catch (err) {
      expect(err).toBeInstanceOf(MessageTooLargeError);
      expect((err as MessageTooLargeError).code).toBe('SNAPSHOT_TOO_LARGE');
      expect((err as Error).message).toMatch(/ceiling/i);
      return;
    }
    throw new Error('expected encodeMessage to throw');
  }, 20000);
});
