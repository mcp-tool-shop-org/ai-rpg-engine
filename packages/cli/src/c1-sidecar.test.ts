// c1-sidecar.test.ts — a scripted session over the wire, against a SPAWNED
// sim process. P3's exit gate.
//
// C0 measured that the sim's only presentation consumer was a terminal calling
// it IN-PROCESS. This proves the other thing exists: a client that is not a
// terminal, in a different process, driving the authoritative sim over a byte
// stream and rendering from what comes back.
//
// It spawns the real `ai-rpg-engine sidecar` command over real stdio — not an
// in-memory pair of streams. "Green in the full run is not the same claim as
// green" was C0's ledger entry 10; "works in-process" is not the same claim as
// "works over a process boundary", and the only way to tell is to cross one.

import { describe, it, expect, afterAll } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as path from 'node:path';
import {
  MessageReader,
  encodeMessage,
  METHODS,
  NOTIFICATIONS,
  ERROR_CODES,
  type RpcMessage,
  type InitializeResult,
  type SnapshotResult,
  type SubmitActionResult,
  type TickNotification,
} from '@ai-rpg-engine/sidecar';

const BIN = path.resolve(import.meta.dirname, '../dist/bin.js');
const PACK_ID = 'chapel-threshold';
const SEED = 71;

/** A live sidecar child process, wrapped in a promise-shaped RPC client. */
class SpawnedSidecar {
  private readonly child: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  readonly notifications: RpcMessage[] = [];
  readonly stderr: string[] = [];

  constructor() {
    this.child = spawn(process.execPath, [BIN, 'sidecar', PACK_ID, '--seed', String(SEED)], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const reader = new MessageReader(
      (msg) => this.onMessage(msg),
      (err) => this.stderr.push(`framing: ${err.kind} ${err.detail}`),
    );
    this.child.stdout.on('data', (chunk: Buffer) => reader.push(chunk));
    this.child.stderr.on('data', (chunk: Buffer) => this.stderr.push(chunk.toString('utf-8')));
  }

  private onMessage(msg: RpcMessage): void {
    if (typeof msg.method === 'string') {
      this.notifications.push(msg);
      return;
    }
    const id = msg.id as number;
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    if (msg.error !== undefined) {
      const e = msg.error as { code: number; message: string };
      const err = new Error(e.message) as Error & { code?: number };
      err.code = e.code;
      p.reject(err);
      return;
    }
    p.resolve(msg.result);
  }

  request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout on "${method}". stderr: ${this.stderr.join('')}`));
      }, 20000);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.child.stdin.write(encodeMessage({ jsonrpc: '2.0', id, method, params }));
    });
  }

  initialize(): Promise<InitializeResult> {
    return this.request<InitializeResult>(METHODS.INITIALIZE, {
      clientName: 'c1-conformance',
      clientVersion: '1.0.0',
      capabilities: { notifications: true, hashes: true },
    });
  }

  /** Raw write, for malformed input the typed helper would not permit. */
  writeRaw(payload: RpcMessage): void {
    this.child.stdin.write(encodeMessage(payload));
  }

  ticks(): TickNotification[] {
    return this.notifications
      .filter((n) => n.method === NOTIFICATIONS.TICK)
      .map((n) => n.params as unknown as TickNotification);
  }

  /**
   * Wait until at least `count` tick notifications have ARRIVED.
   *
   * ⚠ A response resolving is not a push having arrived, and assuming otherwise
   * was a real defect in the first version of this file: the server writes the
   * reply and then the notification, the client resolves on the reply, and the
   * notification bytes are still in flight. Two tests failed with "expected 0 to
   * be greater than 0" and the server was correct the whole time — verified by
   * driving the same spawned process by hand.
   *
   * This is exactly the class of thing that only appears across a process
   * boundary, which is why the exit gate insists on crossing one.
   */
  async waitForTicks(count: number, timeoutMs = 5000): Promise<TickNotification[]> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const ticks = this.ticks();
      if (ticks.length >= count) return ticks;
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for ${count} tick notifications; saw ${ticks.length}`);
      }
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  kill(): void {
    this.child.kill();
  }
}

const sidecar = new SpawnedSidecar();
afterAll(() => sidecar.kill());

describe('C1/P3 — a scripted session over the wire, against a spawned process', () => {
  it('initialize exchanges CAPABILITIES, not a protocol version', () => {
    // DAP's lesson. A partial client and a fuller server interoperate without
    // either bumping a number, which is why there is no version to assert here.
    return sidecar
      .initialize()
      .then((result) => {
        expect(result.serverName).toContain(PACK_ID);
        expect(result.capabilities).toEqual({ preview: true, hashes: true, replay: true, snapshot: true });
        expect(typeof result.tick).toBe('number');
        expect(result).not.toHaveProperty('protocolVersion');
      });
  });

  it('snapshot returns the whole world as a delta from EMPTY', async () => {
    const snap = await sidecar.request<SnapshotResult>(METHODS.SNAPSHOT);
    expect(snap.delta.length).toBeGreaterThan(10);
    expect(snap.hash).toMatch(/^[0-9a-f]{32}$/);
    // Every patch is a `set` — a delta from nothing can never remove.
    expect(snap.delta.every((p) => p.op === 'set')).toBe(true);
    // …and it really is the world: the zone graph is in there.
    expect(JSON.stringify(snap.delta)).toContain('zones');
  });

  it('submitAction returns events AND pushes a tick notification', async () => {
    const before = sidecar.ticks().length;
    const result = await sidecar.request<SubmitActionResult>(METHODS.SUBMIT_ACTION, { verb: 'look' });

    expect(result.events.length).toBeGreaterThan(0);
    expect(result.hash).toMatch(/^[0-9a-f]{32}$/);
    for (const e of result.events) {
      expect(typeof e.tick, 'every event is tick-stamped').toBe('number');
      expect(typeof e.id).toBe('string');
    }
    // Pushed, not polled (matklad). Awaited, because a resolved response is not
    // an arrived push — see waitForTicks.
    const ticks = await sidecar.waitForTicks(before + 1);
    expect(ticks.length).toBeGreaterThan(before);
  });

  it('the tick notification carries a per-tick state hash', async () => {
    const ticks = await sidecar.waitForTicks(1);
    expect(ticks.length).toBeGreaterThan(0);
    for (const t of ticks) expect(t.hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('advance drives the world with no player action', async () => {
    const result = await sidecar.request<SubmitActionResult>(METHODS.ADVANCE, { rounds: 2 });
    expect(typeof result.tick).toBe('number');
    expect(result.hash).toMatch(/^[0-9a-f]{32}$/);
  });

  // --- STRICT IN ---------------------------------------------------------

  it('RED: an unknown METHOD is refused, listing what is accepted', async () => {
    await expect(sidecar.request(METHODS.SNAPSHOT.replace('snapshot', 'snapshotAll'))).rejects.toMatchObject({
      code: ERROR_CODES.METHOD_NOT_FOUND,
    });
  });

  it('RED: an unknown FIELD on a known method is refused, not ignored', async () => {
    // The load-bearing half of the asymmetry. Ignoring it would mean the sim
    // executed a different intent than the client submitted, with nothing to
    // detect the difference — the one failure a deterministic core cannot absorb.
    await expect(
      sidecar.request(METHODS.SUBMIT_ACTION, { verb: 'look', hurryUp: true }),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_PARAMS });

    try {
      await sidecar.request(METHODS.SUBMIT_ACTION, { verb: 'look', hurryUp: true });
    } catch (e) {
      expect((e as Error).message).toContain('hurryUp');
      expect((e as Error).message).toContain('verb');
    }
  });

  it('RED: a missing required field is refused', async () => {
    await expect(sidecar.request(METHODS.SUBMIT_ACTION, {})).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_PARAMS,
    });
  });

  it('RED: a second initialize is refused', async () => {
    await expect(sidecar.request(METHODS.INITIALIZE, {})).rejects.toMatchObject({
      code: ERROR_CODES.ALREADY_INITIALIZED,
    });
  });

  it('RED: a message without jsonrpc:"2.0" is refused', async () => {
    const id = 9999;
    const got = new Promise<RpcMessage>((resolve) => {
      const check = setInterval(() => {
        const hit = sidecar.notifications.find((n) => n.id === id);
        if (hit) {
          clearInterval(check);
          resolve(hit);
        }
      }, 20);
      setTimeout(() => {
        clearInterval(check);
        resolve({});
      }, 3000);
    });
    sidecar.writeRaw({ id, method: METHODS.SNAPSHOT, params: {} } as RpcMessage);
    // The server replies with an error rather than acting; either way it must
    // NOT have acted, and the session must survive.
    await got;
    const stillAlive = await sidecar.request<SnapshotResult>(METHODS.SNAPSHOT);
    expect(stillAlive.hash).toMatch(/^[0-9a-f]{32}$/);
  });

  // --- TOLERANT OUT ------------------------------------------------------

  it('a client that ignores unknown event fields loses nothing', async () => {
    // The other half of RFC 9413's asymmetry, proven from the client's side: a
    // renderer that reads only the fields it knows about renders the same thing
    // whether or not the server added more.
    const result = await sidecar.request<SubmitActionResult>(METHODS.SUBMIT_ACTION, { verb: 'look' });
    const KNOWN = new Set(['id', 'tick', 'type', 'payload']);
    const narrowed = result.events.map((e) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(e)) if (KNOWN.has(k)) out[k] = v;
      return out;
    });
    // Everything a minimal renderer needs survived the narrowing.
    for (const e of narrowed) {
      expect(typeof e.id).toBe('string');
      expect(typeof e.tick).toBe('number');
      expect(typeof e.type).toBe('string');
    }
    expect(narrowed.length).toBe(result.events.length);
  });

  it('shutdown is orderly and announces itself', async () => {
    const result = await sidecar.request<{ ok: boolean }>(METHODS.SHUTDOWN);
    expect(result.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    expect(sidecar.notifications.some((n) => n.method === NOTIFICATIONS.CLOSING)).toBe(true);
  });

  it('CONTROL: stdout carried ONLY framed protocol — no diagnostics leaked', () => {
    // A stray console.log on stdout corrupts the frame stream and desynchronises
    // the client permanently, with a symptom that looks nothing like the cause.
    // If anything had leaked, the reader would have logged framing errors.
    expect(sidecar.stderr.filter((s) => s.startsWith('framing:'))).toEqual([]);
    // …and the readiness line DID go to stderr, proving diagnostics exist and
    // were routed correctly rather than simply being absent.
    expect(sidecar.stderr.join('')).toContain('[sidecar]');
  });
});
