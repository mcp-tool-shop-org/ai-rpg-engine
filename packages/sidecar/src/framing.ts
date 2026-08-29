// framing.ts — Content-Length framed JSON-RPC over any duplex byte stream.
//
// LSP's framing, chosen because it is unambiguous over a byte stream (a JSON
// document can contain newlines; a length prefix cannot be confused by content)
// and because every client ecosystem already has a reader for it.
//
// ⚠ TRANSPORT-AGNOSTIC ON PURPOSE. This module knows about `Readable`/`Writable`
// and nothing else — not stdio, not sockets. DAP makes launch (spawn over stdio)
// and attach (connect to a running process) both first-class, and C1 was asked
// to design attach INTO the framing even where v1 only ships launch. That design
// is this: a socket implementation supplies a different pair of streams to the
// same constructor. There is nothing here to rewrite for it, which is the test
// of whether "designed in" meant anything.

/** The minimum surface this module needs from a readable byte stream. */
export interface ByteReadable {
  on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
  /** Present on Node streams; used to stop stdin after an orderly shutdown. */
  pause?(): unknown;
}

/** The minimum surface this module needs from a writable byte stream. */
export interface ByteWritable {
  write(chunk: string): unknown;
}

/** A framed JSON-RPC message — request, response, or notification. */
export type RpcMessage = Record<string, unknown>;

export type FramingErrorKind = 'malformed-header' | 'bad-length' | 'parse-error' | 'oversize';

export type FramingError = { kind: FramingErrorKind; detail: string };

/**
 * Hard ceiling on one message, so a hostile or broken peer cannot make the
 * process buffer without bound. 16 MiB is far above any real snapshot and far
 * below anything that threatens the process.
 */
export const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;

/** Encode one message with its Content-Length header. */
export function encodeMessage(message: RpcMessage): string {
  const body = JSON.stringify(message);
  // Byte length, not character length — a multi-byte character would otherwise
  // under-declare the frame and desynchronise the reader permanently.
  const length = Buffer.byteLength(body, 'utf-8');
  return `Content-Length: ${length}\r\n\r\n${body}`;
}

/**
 * Incremental reader. Feed it bytes; it emits whole messages.
 *
 * Deliberately a class with an explicit buffer rather than a stream transform:
 * the conformance harness drives it directly with byte slices to prove that a
 * message split across arbitrary chunk boundaries still arrives intact, which is
 * the one property a framing bug hides behind.
 */
export class MessageReader {
  private buffer: Buffer = Buffer.alloc(0);

  constructor(
    private readonly onMessage: (msg: RpcMessage) => void,
    private readonly onError: (err: FramingError) => void,
  ) {}

  /** Feed bytes. Any number of whole messages may come out; possibly none. */
  push(chunk: Buffer | string): void {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf-8') : chunk;
    this.buffer = this.buffer.length === 0 ? bytes : Buffer.concat([this.buffer, bytes]);
    this.drain();
  }

  private drain(): void {
    // Loop rather than recurse: a batch of 10k messages in one chunk must not
    // grow the stack.
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) {
        // No complete header yet. Guard the unbounded case: a peer that never
        // sends the terminator would otherwise buffer for ever.
        if (this.buffer.length > MAX_MESSAGE_BYTES) {
          this.onError({ kind: 'oversize', detail: `header exceeded ${MAX_MESSAGE_BYTES} bytes without a terminator` });
          this.buffer = Buffer.alloc(0);
        }
        return;
      }

      const header = this.buffer.subarray(0, headerEnd).toString('utf-8');
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.onError({ kind: 'malformed-header', detail: `no Content-Length in header: ${JSON.stringify(header)}` });
        // Drop through the bad header and resynchronise rather than stalling.
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }

      const length = Number(match[1]);
      if (!Number.isSafeInteger(length) || length < 0 || length > MAX_MESSAGE_BYTES) {
        this.onError({ kind: 'bad-length', detail: `Content-Length ${match[1]} is out of range` });
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }

      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + length) return; // wait for more bytes

      const body = this.buffer.subarray(bodyStart, bodyStart + length).toString('utf-8');
      this.buffer = this.buffer.subarray(bodyStart + length);

      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch (err) {
        this.onError({ kind: 'parse-error', detail: err instanceof Error ? err.message : String(err) });
        continue;
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        this.onError({ kind: 'parse-error', detail: 'message body must be a JSON object' });
        continue;
      }
      this.onMessage(parsed as RpcMessage);
    }
  }
}

/**
 * Bind a reader/writer pair to a duplex stream. The one place a transport is
 * named — and it takes the streams as arguments, so stdio and a socket differ
 * only in what is passed here.
 */
export function attachFraming(
  input: ByteReadable,
  output: ByteWritable,
  onMessage: (msg: RpcMessage) => void,
  onError: (err: FramingError) => void,
): { send: (msg: RpcMessage) => void } {
  const reader = new MessageReader(onMessage, onError);
  input.on('data', (chunk) => reader.push(chunk));
  return { send: (msg) => output.write(encodeMessage(msg)) };
}
