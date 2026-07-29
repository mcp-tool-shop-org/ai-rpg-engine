// stdio.ts — LAUNCH transport: the sim as a spawned child process.
//
// DAP makes launch and attach both first-class. C1 ships launch and DESIGNS
// attach in, and this file is the evidence that the design is real rather than a
// promise: it is the only module in the package that names stdio, it is ~40
// lines, and every one of them is stream plumbing. `SidecarServer` and
// `attachFraming` take their streams as arguments, so a socket server is the
// same two calls with a different pair of streams — no protocol change, no
// serializer change, no server change.
//
// One rule that is easy to get wrong and fatal when you do: NOTHING may write to
// stdout except framed protocol messages. A stray console.log corrupts the frame
// stream and the client desynchronises permanently, with a symptom (garbled JSON)
// that looks nothing like the cause. Diagnostics go to stderr.

import type { ByteReadable, ByteWritable, RpcMessage } from './framing.js';
import { MessageReader, encodeMessage } from './framing.js';
import { SidecarServer, type SidecarServerOptions } from './server.js';

export type StdioServerHandles = {
  server: SidecarServer;
  /** Push a message out of band (tests; a real host rarely needs this). */
  send: (msg: RpcMessage) => void;
};

/**
 * Bind a {@link SidecarServer} to a duplex byte pair.
 *
 * Defaults to `process.stdin`/`process.stdout`, but takes them as arguments so
 * tests can drive a real server over in-memory streams — and so a socket
 * transport is a call site, not a rewrite.
 */
export function startStdioServer(
  options: SidecarServerOptions,
  input: ByteReadable = process.stdin,
  output: ByteWritable = process.stdout,
  onFramingError: (detail: string) => void = (d) => process.stderr.write(`[sidecar] framing error: ${d}\n`),
): StdioServerHandles {
  // Built in dependency order rather than with a forward reference: the writer
  // needs nothing, the server needs the writer, the reader needs the server.
  // `attachFraming` would invert that and force a `let server!` the linter is
  // right to dislike.
  const send = (msg: RpcMessage): void => {
    output.write(encodeMessage(msg));
  };
  const server = new SidecarServer(options, send);
  const reader = new MessageReader(
    (msg) => server.handle(msg),
    (err) => onFramingError(`${err.kind}: ${err.detail}`),
  );
  input.on('data', (chunk) => reader.push(chunk));
  return { server, send };
}
