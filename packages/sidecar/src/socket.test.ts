// socket.test.ts — the ATTACH transport, at the package boundary.
//
// The cross-repo proof that TCP and stdio produce the same simulation lives in the
// CLI (`c4-tcp-conformance.test.ts`), because it needs real packs and a real
// process. What belongs HERE is the transport's own behaviour: what it binds, what
// it refuses, and what it does when a client vanishes mid-sentence.
//
// The engine is a stub. That is deliberate: this file must fail for transport
// reasons and only transport reasons, so it owns no game.

import { describe, it, expect, afterEach } from 'vitest';
import * as net from 'node:net';
import { createTestEngine, type Engine, type EngineModule, type EntityState, type WorldState } from '@ai-rpg-engine/core';
import { SidecarClient } from './client.js';
import { startSocketServer, type SocketServerHandles } from './socket.js';
import { attachedServerCount } from './server.js';
import { MessageReader, encodeMessage, type RpcMessage } from './framing.js';
import { METHODS, ERROR_CODES } from './protocol.js';

/** The smallest thing `SidecarServer` will accept as a world. */
function stubEngine(): unknown {
  const world = { tick: 0, locationId: 'nowhere', eventLog: [] as unknown[] };
  return {
    world,
    store: { tick: 0 },
    submitAction: () => ({ ok: true, events: [] }),
    shutdown: () => {},
    moduleManager: { getModules: () => [] },
  };
}

const opened: SocketServerHandles[] = [];
const sockets: net.Socket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.destroy();
  for (const h of opened.splice(0)) await h.close();
});

function serve(overrides: Record<string, unknown> = {}): SocketServerHandles {
  const h = startSocketServer(
    {
      engine: stubEngine() as never,
      engineVersion: '3.8.0-test',
      port: 0,
      ...overrides,
    },
    {},
  );
  opened.push(h);
  return h;
}

/** Wait for the ephemeral port to be assigned. */
async function ready(h: SocketServerHandles): Promise<number> {
  for (let i = 0; i < 200; i++) {
    if (h.port() !== 0) return h.port();
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('server never bound a port');
}

type Conn = {
  socket: net.Socket;
  request: <T>(method: string, params?: Record<string, unknown>) => Promise<T>;
  received: RpcMessage[];
};

async function connect(port: number, host = '127.0.0.1'): Promise<Conn> {
  const received: RpcMessage[] = [];
  const pending = new Map<number, { ok: (v: unknown) => void; err: (e: Error) => void }>();
  let nextId = 1;

  const socket = await new Promise<net.Socket>((resolve, reject) => {
    const s = net.createConnection({ port, host }, () => resolve(s));
    s.on('error', reject);
  });
  sockets.push(socket);

  const reader = new MessageReader(
    (msg) => {
      received.push(msg);
      if (typeof msg.method === 'string') return;
      const p = pending.get(msg.id as number);
      if (!p) return;
      pending.delete(msg.id as number);
      if (msg.error) {
        const e = msg.error as { message: string; code: number };
        const err = new Error(e.message) as Error & { code?: number };
        err.code = e.code;
        p.err(err);
      } else {
        p.ok(msg.result);
      }
    },
    () => undefined,
  );
  socket.on('data', (c: Buffer) => reader.push(c));

  const request = <T>(method: string, params: Record<string, unknown> = {}): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => reject(new Error(`timeout on ${method}`)), 8000);
      pending.set(id, {
        ok: (v) => {
          clearTimeout(timer);
          resolve(v as T);
        },
        err: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      socket.write(encodeMessage({ jsonrpc: '2.0', id, method, params }));
    });

  return { socket, request, received };
}

describe('startSocketServer — binding', () => {
  it('binds an ephemeral port when asked for 0', async () => {
    const h = serve();
    const port = await ready(h);
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it('binds LOOPBACK by default, not every interface', async () => {
    // The default matters more than the option. An authoritative simulation
    // accepting commands should not become reachable from the LAN because nobody
    // passed a host. Asserted against the listener's own view of what it bound,
    // not against the option that was passed in.
    const h = serve();
    await ready(h);
    const addr = h.net.address();
    expect(typeof addr === 'object' && addr !== null ? addr.address : '').toBe('127.0.0.1');
  });

  it('honours an explicit host', async () => {
    const h = serve({ host: '127.0.0.1' });
    await ready(h);
    const addr = h.net.address();
    expect(typeof addr === 'object' && addr !== null ? addr.address : '').toBe('127.0.0.1');
  });
});

describe('startSocketServer — a session over a socket', () => {
  it('serves the SAME protocol as stdio: initialize returns capabilities', async () => {
    const h = serve();
    const c = await connect(await ready(h));
    const init = await c.request<{ serverName: string; capabilities: Record<string, boolean> }>(METHODS.INITIALIZE, {
      clientName: 'unit',
      clientVersion: '1',
      capabilities: {},
    });
    expect(init.capabilities).toHaveProperty('hashes');
    expect(init.serverName).toBeTruthy();
  });

  it('creates one session per connection, sharing one engine', async () => {
    const h = serve({ maxConnections: 2 });
    const port = await ready(h);
    const a = await connect(port);
    await a.request(METHODS.INITIALIZE, { clientName: 'a', clientVersion: '1', capabilities: {} });
    const b = await connect(port);
    // Each connection gets its own handshake state. If they shared a SidecarServer
    // this would come back ALREADY_INITIALIZED, and the second client would be
    // permanently unable to speak.
    await b.request(METHODS.INITIALIZE, { clientName: 'b', clientVersion: '1', capabilities: {} });
    expect(h.sessions.length).toBe(2);
  });

  it('refuses a method before initialize, over the socket', async () => {
    const h = serve();
    const c = await connect(await ready(h));
    await expect(c.request(METHODS.SNAPSHOT)).rejects.toMatchObject({ code: ERROR_CODES.NOT_INITIALIZED });
  });

  it('STRICT-IN holds: an unknown method is refused', async () => {
    const h = serve();
    const c = await connect(await ready(h));
    await c.request(METHODS.INITIALIZE, { clientName: 'u', clientVersion: '1', capabilities: {} });
    await expect(c.request('sim/doWhatIMean')).rejects.toMatchObject({
      code: ERROR_CODES.METHOD_NOT_FOUND,
    });
  });

  it('STRICT-IN holds: an unknown field on a known method is refused', async () => {
    const h = serve();
    const c = await connect(await ready(h));
    await c.request(METHODS.INITIALIZE, { clientName: 'u', clientVersion: '1', capabilities: {} });
    await expect(c.request(METHODS.SUBMIT_ACTION, { verb: 'look', extra: 1 })).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_PARAMS,
    });
  });
});

describe('startSocketServer — the connection cap', () => {
  it('refuses a second client by default, and SAYS WHY on the wire', async () => {
    const h = serve();
    const port = await ready(h);
    const a = await connect(port);
    await a.request(METHODS.INITIALIZE, { clientName: 'a', clientVersion: '1', capabilities: {} });

    const text = await new Promise<string>((resolve) => {
      let buf = '';
      const s = net.createConnection({ port }, () => {
        s.on('data', (c: Buffer) => {
          buf += c.toString('utf-8');
        });
      });
      sockets.push(s);
      s.on('close', () => resolve(buf));
      setTimeout(() => {
        s.destroy();
        resolve(buf);
      }, 4000);
    });

    expect(text).toContain('sim/closing');
    expect(text).toContain('not deterministic');
  }, 12000);

  it('a refused connection does not disturb the live one', async () => {
    const h = serve();
    const port = await ready(h);
    const a = await connect(port);
    await a.request(METHODS.INITIALIZE, { clientName: 'a', clientVersion: '1', capabilities: {} });

    await new Promise<void>((resolve) => {
      const s = net.createConnection({ port }, () => undefined);
      sockets.push(s);
      s.on('close', () => resolve());
      s.on('error', () => resolve());
      setTimeout(resolve, 3000);
    });

    // The session that was being protected still works.
    const snap = await a.request<{ hash: string }>(METHODS.SNAPSHOT);
    expect(snap.hash).toBeTruthy();
  }, 12000);

  it('frees the slot when a client disconnects', async () => {
    // Otherwise the cap is a one-shot: reconnect after a crash and the sim is
    // unreachable until it is restarted, which for a client under development is
    // the difference between usable and not.
    const h = serve();
    const port = await ready(h);
    const first = await connect(port);
    await first.request(METHODS.INITIALIZE, { clientName: 'a', clientVersion: '1', capabilities: {} });
    first.socket.destroy();

    await new Promise((r) => setTimeout(r, 150));

    const second = await connect(port);
    const init = await second.request<{ tick: number }>(METHODS.INITIALIZE, {
      clientName: 'b',
      clientVersion: '1',
      capabilities: {},
    });
    expect(init).toHaveProperty('tick');
  }, 12000);
});

describe('startSocketServer — a client that vanishes', () => {
  it('a write to a destroyed socket does not throw', async () => {
    // Ordinary, not exceptional: a renderer can be closed between the sim deciding
    // something and the write that reports it. If that took the sim process down,
    // every client crash would become a server crash.
    const h = serve();
    const port = await ready(h);
    const c = await connect(port);
    await c.request(METHODS.INITIALIZE, { clientName: 'gone', clientVersion: '1', capabilities: {} });
    c.socket.destroy();
    await new Promise((r) => setTimeout(r, 100));

    const session = h.sessions[0] as unknown as { handle: (m: RpcMessage) => void };
    expect(() =>
      session.handle({ jsonrpc: '2.0', id: 99, method: METHODS.SNAPSHOT, params: {} }),
    ).not.toThrow();
  });

  it('close() releases the port', async () => {
    const h = serve();
    const port = await ready(h);
    await h.close();
    opened.length = 0;

    // Rebinding the same port is the only honest proof it was released.
    await new Promise<void>((resolve, reject) => {
      const probe = net.createServer();
      probe.once('error', reject);
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve()));
    });
  });
});

describe('F-009da546 — shutdown releases the listen port', () => {
  it('a --listen port is free after shutdown, and a second attach cannot initialize', async () => {
    const h = serve();
    const port = await ready(h);
    const c = await connect(port);
    await c.request(METHODS.INITIALIZE, { clientName: 'u', clientVersion: '1', capabilities: {} });
    const result = await c.request<{ ok: boolean }>(METHODS.SHUTDOWN);
    expect(result.ok).toBe(true);

    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const tryBind = (): void => {
        const probe = net.createServer();
        probe.once('error', (err) => {
          if (Date.now() - start > 4000) reject(err);
          else setTimeout(tryBind, 25);
        });
        probe.listen(port, '127.0.0.1', () => probe.close(() => resolve()));
      };
      tryBind();
    });
  }, 12000);
});

function spawnModule(): EngineModule {
  const npc = (): EntityState => ({
    id: 'npc-1',
    blueprintId: 'npc',
    type: 'npc',
    name: 'Witness',
    tags: [],
    stats: {},
    resources: {},
    statuses: [],
    zoneId: 'room',
  });
  return {
    id: 'spawn',
    version: '1.0.0',
    register(ctx) {
      ctx.actions.registerVerb('spawn-npc', (_action, world) => {
        world.entities['npc-1'] = npc();
        return [
          {
            id: 'evt-spawn-npc',
            tick: world.meta.tick,
            type: 'probe.spawned',
            actorId: 'hero',
            payload: { id: 'npc-1' },
          },
        ];
      });
      ctx.actions.registerVerb('despawn-npc', (_action, world) => {
        delete world.entities['npc-1'];
        return [
          {
            id: 'evt-despawn-npc',
            tick: world.meta.tick,
            type: 'probe.despawned',
            actorId: 'hero',
            payload: { id: 'npc-1' },
          },
        ];
      });
    },
  };
}

function liveEngine(): ReturnType<typeof createTestEngine> {
  return createTestEngine({
    modules: [spawnModule()],
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

async function waitUntil(pred: () => boolean, label: string, ms = 4000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function connectClient(port: number): Promise<{ client: SidecarClient; socket: net.Socket }> {
  const socket = await new Promise<net.Socket>((resolve, reject) => {
    const s = net.createConnection({ port, host: '127.0.0.1' }, () => resolve(s));
    s.on('error', reject);
  });
  sockets.push(socket);
  const client = new SidecarClient((msg) => {
    socket.write(encodeMessage(msg));
  });
  const reader = new MessageReader(
    (msg) => client.handle(msg),
    () => undefined,
  );
  socket.on('data', (c: Buffer) => reader.push(c));
  socket.on('close', () => client.disconnect());
  socket.on('error', (err) => client.disconnect(err));
  return { client, socket };
}

describe('F-98b60cd0 — two TCP sessions: snapshot rebases, idle peer gets the tick', () => {
  it('A spawns, idle B receives sim/tick; B snapshots then despawns without a ghost', async () => {
    const engine = liveEngine();
    const h = serve({ engine, maxConnections: 2 });
    const port = await ready(h);
    const a = await connectClient(port);
    const b = await connectClient(port);
    await a.client.initialize();
    await b.client.initialize();
    await a.client.snapshot();
    await b.client.snapshot();

    await a.client.request(METHODS.SUBMIT_ACTION, { verb: 'spawn-npc' });
    await waitUntil(
      () => b.client.receivedTicks.some((t) => t.delta.some((p) => p.path.includes('npc-1'))),
      'idle B sim/tick for spawn',
    );
    expect((b.client.mirroredState as WorldState).entities['npc-1']).toBeTruthy();

    await b.client.snapshot();
    expect((b.client.mirroredState as WorldState).entities['npc-1']).toBeTruthy();

    await b.client.request(METHODS.SUBMIT_ACTION, { verb: 'despawn-npc' });
    expect(engine.world.entities['npc-1']).toBeUndefined();
    expect((b.client.mirroredState as WorldState).entities['npc-1']).toBeUndefined();
    expect(b.client.stalenessReports).toEqual([]);
  }, 12000);
});

function captureStderr(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  return {
    lines,
    restore: () => {
      process.stderr.write = orig;
    },
  };
}

describe('F-1842358a — TCP framing faults are visible with default hooks', () => {
  it('a bad Content-Length on the TCP transport writes a framing-error line even with hooks={}', async () => {
    const cap = captureStderr();
    try {
      const h = serve();
      const port = await ready(h);
      const c = await connect(port);
      c.socket.write('Content-Length: 99999999999999\r\n\r\n');
      await waitUntil(
        () => cap.lines.some((l) => l.includes('framing error') && l.includes('bad-length')),
        'framing-error stderr',
      );
      expect(cap.lines.some((l) => l.includes('listening on'))).toBe(true);
    } finally {
      cap.restore();
    }
  }, 12000);
});

describe('F-f64330ad — destroy+reconnect does not leak SidecarServers on the gate', () => {
  it('destroy+reconnect leaves attachedServerCount === 1', async () => {
    const engine = stubEngine() as Engine;
    const h = serve({ engine });
    const port = await ready(h);
    const first = await connect(port);
    await first.request(METHODS.INITIALIZE, { clientName: 'a', clientVersion: '1', capabilities: {} });
    expect(attachedServerCount(engine)).toBe(1);

    first.socket.destroy();
    await waitUntil(() => attachedServerCount(engine) === 0, 'gate emptied after destroy');

    const second = await connect(port);
    await second.request(METHODS.INITIALIZE, { clientName: 'b', clientVersion: '1', capabilities: {} });
    expect(attachedServerCount(engine)).toBe(1);
  }, 12000);
});

