// socket.ts — ATTACH transport: the sim as a listening TCP server.
//
// C1 shipped launch (stdio) and DESIGNED attach in, and `stdio.ts` says exactly
// what that was supposed to mean: "`SidecarServer` and `attachFraming` take their
// streams as arguments, so a socket server is the same two calls with a different
// pair of streams — no protocol change, no serializer change, no server change."
// This file is that claim being cashed. It contains no protocol, no serializer and
// no game logic; it is a `net.Server`, a per-connection `SidecarServer`, and the
// decisions listed below.
//
// WHY ATTACH AT ALL, when launch already works. Godot's client-side reality
// decides it, not preference. GDScript's subprocess pipes are documented-buggy
// upstream (godot#102340: `FileAccess` pipe wrappers mis-report eof/length and
// crash; `execute_with_pipe` only became non-blocking in 4.4), while JSON-RPC over
// a localhost socket is Godot's OWN editor wire — the GDScript language server is
// JSON-RPC over TCP and the engine ships a `JSONRPC` helper class. Driving the sim
// over a socket is the supported path on that side; piping stdio is the one with
// open engine bugs under it.
//
// THREE DECISIONS, each a refusal with a reason:
//
//   1. LOOPBACK BY DEFAULT. Binds `127.0.0.1`. An authoritative game simulation
//      accepting commands is not a thing to expose to a LAN because a default was
//      convenient. A non-loopback bind must be asked for by name.
//
//   2. ONE CONNECTION AT A TIME, by default. The protocol's topology is one server
//      to N clients, and this transport could trivially accept N — but two clients
//      submitting actions interleave in SOCKET ARRIVAL ORDER, and arrival order is
//      not deterministic. That would put a nondeterminism hole under the one
//      property C1 exists to guarantee, silently. So a second connection is
//      REFUSED with a message that says why, and lifting the cap is a decision
//      about write arbitration rather than a config change nobody reviewed.
//
//   3. DIAGNOSTICS STILL GO TO STDERR. Under this transport stdout is not the
//      protocol, so writing to it would be harmless — which is precisely the
//      reasoning that produces a codebase where the rule holds in one file and not
//      its neighbour. The rule is unconditional (`stdio.ts:11-14`).

import * as net from 'node:net';
import type { ByteReadable, ByteWritable, RpcMessage } from './framing.js';
import { MessageReader, encodeMessage } from './framing.js';
import { SidecarServer, type SidecarServerOptions } from './server.js';

export type SocketServerOptions = {
  /** TCP port. `0` binds an ephemeral port; read the real one from `address()`. */
  port: number;
  /**
   * Interface to bind. Defaults to loopback and should stay there. Anything else
   * accepts simulation commands from another machine.
   */
  host?: string;
  /**
   * How many clients may be connected at once. Defaults to 1 — see decision 2.
   * Raising this above 1 without deciding how concurrent writes are ordered
   * reintroduces the nondeterminism the cap exists to prevent.
   */
  maxConnections?: number;
};

export type SocketServerHooks = {
  /** Called once the port is bound, with the port actually assigned. */
  onListening?: (port: number, host: string) => void;
  /** Called per accepted connection, with a 1-based index. */
  onConnection?: (index: number) => void;
  /** A connection was refused by the cap, with the reason already formatted. */
  onRefused?: (reason: string) => void;
  /** Per-connection framing fault. Never fatal to the server. */
  onFramingError?: (detail: string) => void;
  /** Transport-level error (bind failure, socket error). */
  onError?: (err: Error) => void;
  /** A connection ended. */
  onDisconnect?: (index: number) => void;
};

export type SocketServerHandles = {
  /** The underlying listener, for tests and for orderly shutdown. */
  net: net.Server;
  /** The bound port. `0` until the `onListening` hook has fired. */
  port: () => number;
  /** Sessions created so far, newest last. One per accepted connection. */
  sessions: readonly SidecarServer[];
  /** Stop listening and drop live connections. */
  close: () => Promise<void>;
};

/**
 * Bind a listening socket and serve a {@link SidecarServer} per connection.
 *
 * Every session shares the ONE `options.engine`. That is the point of the
 * topology — there is a single authoritative world — and it is also why the
 * connection cap matters: sharing a world between two writers whose commands
 * arrive in network order is not the same world twice.
 */
export function startSocketServer(
  options: SidecarServerOptions & SocketServerOptions,
  hooks: SocketServerHooks = {},
): SocketServerHandles {
  const host = options.host ?? '127.0.0.1';
  const maxConnections = options.maxConnections ?? 1;
  const sessions: SidecarServer[] = [];
  const live = new Set<net.Socket>();
  let accepted = 0;

  const server = net.createServer((socket) => {
    if (live.size >= maxConnections) {
      // Refused, with the reason on the wire rather than a silent hangup. A client
      // that cannot tell "refused" from "crashed" will retry forever.
      const reason =
        `refused: this sidecar serves ${maxConnections} client${maxConnections === 1 ? '' : 's'} at a time. ` +
        'Concurrent writers would interleave in socket arrival order, which is not deterministic — ' +
        'the one property this wire exists to preserve. Disconnect the other client, or start a second sidecar.';
      hooks.onRefused?.(reason);
      socket.end(
        encodeMessage({
          jsonrpc: '2.0',
          method: 'sim/closing',
          params: { reason },
        }),
      );
      return;
    }

    // Small frames, sent immediately. Nagle would coalesce a command with whatever
    // came next and add latency no interactive client wants.
    socket.setNoDelay(true);
    socket.setEncoding('utf-8');

    live.add(socket);
    accepted += 1;
    const index = accepted;

    const send = (msg: RpcMessage): void => {
      // A client can vanish between the sim deciding something and the write. That
      // is ordinary, not an error, and must not take the sim down.
      if (socket.destroyed || socket.writableEnded) return;
      socket.write(encodeMessage(msg));
    };

    // The two calls `stdio.ts` promised, with a different pair of streams.
    const session = new SidecarServer(options, send);
    const reader = new MessageReader(
      (msg) => session.handle(msg),
      (err) => hooks.onFramingError?.(`${err.kind}: ${err.detail}`),
    );

    (socket as unknown as ByteReadable).on('data', (chunk) => reader.push(chunk));
    sessions.push(session);
    hooks.onConnection?.(index);

    socket.on('error', (err) => hooks.onError?.(err));
    socket.on('close', () => {
      live.delete(socket);
      hooks.onDisconnect?.(index);
    });
  });

  server.on('error', (err) => hooks.onError?.(err));
  server.listen(options.port, host, () => {
    const addr = server.address();
    const bound = typeof addr === 'object' && addr !== null ? addr.port : options.port;
    hooks.onListening?.(bound, host);
  });

  return {
    net: server,
    port: () => {
      const addr = server.address();
      return typeof addr === 'object' && addr !== null ? addr.port : 0;
    },
    sessions,
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of live) s.destroy();
        live.clear();
        server.close(() => resolve());
      }),
  };
}

/**
 * The `ByteWritable` a socket satisfies, named so the structural compatibility is
 * asserted by the compiler rather than assumed by a comment.
 */
export type SocketAsWritable = ByteWritable;
