// c4-tcp-conformance.test.ts — the same session, a THIRD way, byte-identical.
//
// C1 proved determinism survives a process boundary over stdio. C4's client cannot
// use stdio: GDScript's subprocess pipes are documented-buggy upstream
// (godot#102340) while JSON-RPC over a localhost socket is Godot's own editor wire.
// So a transport got added — and a transport is exactly the kind of thing that
// "obviously cannot change behaviour" right up until it does.
//
// The claim: in-process, over stdio, and over TCP produce the SAME event stream and
// the SAME end-state hash. Three transports, one simulation, compared as bytes.
//
// Everything here binds a real socket and spawns a real process. An in-memory
// duplex pair would exercise the protocol and skip the transport, and the transport
// is the only thing this file is about.

import { describe, it, expect, afterAll } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as net from 'node:net';
import * as path from 'node:path';
import {
  MessageReader,
  encodeMessage,
  applyPatches,
  stateHash,
  METHODS,
  NOTIFICATIONS,
  ERROR_CODES,
  type RpcMessage,
  type SnapshotResult,
  type SubmitActionResult,
  type TickNotification,
  type WireEvent,
} from '@ai-rpg-engine/sidecar';
import type { WorldState } from '@ai-rpg-engine/core';
import { allPacks } from './packs.js';

const BIN = path.resolve(import.meta.dirname, '../dist/bin.js');
const PACK_ID = 'chapel-threshold';
const SEED = 71;

/**
 * The same script C1's stdio conformance runs, verbatim.
 *
 * Copied rather than imported because the two files must be able to disagree: if
 * this list were shared and someone edited it, both suites would move together and
 * "the transports agree" would stop being evidence about the transports. Kept in
 * step by a test below that asserts the two scripts are identical — so a drift is a
 * failure with a name, not a silent divergence.
 */
const SCRIPT: readonly { verb: string; targetIds?: string[] }[] = [
  { verb: 'look' },
  { verb: 'move' },
  { verb: 'look' },
  { verb: 'move' },
  { verb: 'wait' },
  { verb: 'look' },
];

// --- A JSON-RPC client over a real socket ---------------------------------

class TcpRun {
  private socket!: net.Socket;
  private child!: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  readonly ticks: TickNotification[] = [];
  readonly notifications: RpcMessage[] = [];
  readonly stderr: string[] = [];
  port = 0;

  /** Spawn the sidecar with an ephemeral port and connect once it reports one. */
  async start(): Promise<void> {
    this.child = spawn(process.execPath, [BIN, 'sidecar', PACK_ID, '--seed', String(SEED), '--listen', '0'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // stdout must stay EMPTY on this transport. Asserted at the end of the run.
    this.child.stdout.on('data', (c: Buffer) => this.stderr.push(`STDOUT_LEAK:${c.toString('utf-8')}`));

    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('sidecar never reported a port')), 30000);
      this.child.stderr.on('data', (c: Buffer) => {
        const text = c.toString('utf-8');
        this.stderr.push(text);
        // The machine-readable line the command prints for exactly this purpose.
        const m = /\[sidecar\] listening \S+?:(\d+)/.exec(text);
        if (m) {
          clearTimeout(timer);
          resolve(Number(m[1]));
        }
      });
      this.child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`sidecar exited ${code} before listening: ${this.stderr.join('')}`));
      });
    });

    this.port = port;
    await new Promise<void>((resolve, reject) => {
      const s = net.createConnection({ port, host: '127.0.0.1' }, () => resolve());
      s.setNoDelay(true);
      s.on('error', reject);
      this.socket = s;
    });

    const reader = new MessageReader(
      (msg) => this.onMessage(msg),
      (err) => this.stderr.push(`framing:${err.kind}`),
    );
    this.socket.on('data', (c: Buffer) => reader.push(c));
  }

  private onMessage(msg: RpcMessage): void {
    if (msg.method === NOTIFICATIONS.TICK) {
      this.ticks.push(msg.params as unknown as TickNotification);
      return;
    }
    if (typeof msg.method === 'string') {
      this.notifications.push(msg);
      return;
    }
    const p = this.pending.get(msg.id as number);
    if (!p) return;
    this.pending.delete(msg.id as number);
    if (msg.error) {
      const e = msg.error as { message: string; code: number };
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
      const timer = setTimeout(() => reject(new Error(`timeout on ${method}`)), 20000);
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
      this.socket.write(encodeMessage({ jsonrpc: '2.0', id, method, params }));
    });
  }

  stop(): void {
    this.socket?.destroy();
    this.child?.kill();
  }
}

// --- Side A: in-process ----------------------------------------------------

type InProcessRun = { events: WireEvent[]; endHash: string };

async function runInProcess(): Promise<InProcessRun> {
  const sidecar = await import('@ai-rpg-engine/sidecar');
  const pack = allPacks.find((p) => p.meta.id === PACK_ID)!;
  const engine = pack.createGame(SEED);
  const before = new Set((engine.world.eventLog ?? []).map((e) => e.id));

  for (const step of SCRIPT) {
    engine.submitAction(step.verb, step.targetIds ? { targetIds: step.targetIds } : {});
  }

  const events = (engine.world.eventLog ?? [])
    .filter((e) => !before.has(e.id))
    // The sidecar's OWN mapping, not a hand-copy. Comparing a stream against a
    // re-implementation of its serializer proves nothing about the serializer.
    .map((e) => sidecar.toWireEvent(e as never));

  return { events, endHash: stateHash(engine.world as WorldState) };
}

// --- Side B: over stdio (C1's transport, re-run here as the middle term) ----

async function runOverStdio(): Promise<{ events: WireEvent[]; endHash: string; stdoutClean: boolean }> {
  const child = spawn(process.execPath, [BIN, 'sidecar', PACK_ID, '--seed', String(SEED)], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map<number, (v: unknown) => void>();
  const framingErrors: string[] = [];
  let nextId = 1;

  const reader = new MessageReader(
    (msg) => {
      if (typeof msg.method === 'string') return;
      const r = pending.get(msg.id as number);
      if (r) {
        pending.delete(msg.id as number);
        r(msg.result);
      }
    },
    (err) => framingErrors.push(err.kind),
  );
  child.stdout.on('data', (c: Buffer) => reader.push(c));

  const request = <T>(method: string, params: Record<string, unknown> = {}): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => reject(new Error(`stdio timeout on ${method}`)), 20000);
      pending.set(id, (v) => {
        clearTimeout(timer);
        resolve(v as T);
      });
      child.stdin.write(encodeMessage({ jsonrpc: '2.0', id, method, params }));
    });

  try {
    await request(METHODS.INITIALIZE, {
      clientName: 'c4-tcp-conformance/stdio-arm',
      clientVersion: '1.0.0',
      capabilities: { notifications: true, hashes: true },
    });
    const events: WireEvent[] = [];
    let endHash = '';
    for (const step of SCRIPT) {
      const r = await request<SubmitActionResult>(METHODS.SUBMIT_ACTION, {
        verb: step.verb,
        ...(step.targetIds ? { targetIds: step.targetIds } : {}),
      });
      events.push(...r.events);
      endHash = r.hash;
    }
    return { events, endHash, stdoutClean: framingErrors.length === 0 };
  } finally {
    child.kill();
  }
}

// --- The run ---------------------------------------------------------------

const tcp = new TcpRun();
afterAll(() => tcp.stop());

let inProcess: InProcessRun;
let stdio: { events: WireEvent[]; endHash: string; stdoutClean: boolean };
const tcpEvents: WireEvent[] = [];
let tcpEndHash = '';
let tcpSnapshot: SnapshotResult;

describe('C4/P1 — the wire reaches a socket', () => {
  it('runs the same script three ways', async () => {
    inProcess = await runInProcess();
    stdio = await runOverStdio();

    await tcp.start();
    const init = await tcp.request<{ capabilities: Record<string, boolean>; tick: number }>(METHODS.INITIALIZE, {
      clientName: 'c4-tcp-conformance',
      clientVersion: '1.0.0',
      capabilities: { notifications: true, hashes: true },
    });
    // Capabilities, not a version number (DAP's lesson). A transport that dropped
    // the handshake's contents would still connect.
    expect(init.capabilities).toMatchObject({ preview: true, hashes: true, snapshot: true, replay: true });

    tcpSnapshot = await tcp.request<SnapshotResult>(METHODS.SNAPSHOT);

    for (const step of SCRIPT) {
      const r = await tcp.request<SubmitActionResult>(METHODS.SUBMIT_ACTION, {
        verb: step.verb,
        ...(step.targetIds ? { targetIds: step.targetIds } : {}),
      });
      tcpEvents.push(...r.events);
      tcpEndHash = r.hash;
    }

    expect(inProcess.events.length).toBeGreaterThan(0);
    expect(stdio.events.length).toBeGreaterThan(0);
    expect(tcpEvents.length).toBeGreaterThan(0);
  }, 60000);

  it('PROPERTY 1: TCP is BYTE-IDENTICAL to in-process', () => {
    expect(JSON.stringify(tcpEvents)).toBe(JSON.stringify(inProcess.events));
  });

  it('PROPERTY 2: TCP is BYTE-IDENTICAL to stdio', () => {
    // The middle term. Transitivity would give this for free, and asserting it
    // anyway is what turns a two-way claim into a three-transport one: if this ever
    // fails while property 1 passes, the stdio arm is what moved.
    expect(JSON.stringify(tcpEvents)).toBe(JSON.stringify(stdio.events));
  });

  it('PROPERTY 3: all three end-state hashes agree', () => {
    expect(tcpEndHash).toBe(inProcess.endHash);
    expect(tcpEndHash).toBe(stdio.endHash);
  });

  it('RED CONTROL: the comparison CAN fail', () => {
    // Otherwise properties 1-3 might be comparing empty arrays and hashes of
    // nothing. A gate that has only ever passed proves nothing.
    const doctored = tcpEvents.map((e, i) => (i === 0 ? { ...e, type: `${e.type}-tampered` } : e));
    expect(JSON.stringify(doctored)).not.toBe(JSON.stringify(inProcess.events));
    expect(tcpEvents.length).toBeGreaterThan(1);
  });

  it('PROPERTY 4: a client rebuilds the world from socket patches ALONE and agrees', () => {
    const rebuilt = applyPatches({}, tcpSnapshot.delta) as WorldState;
    expect(stateHash(rebuilt)).toBe(tcpSnapshot.hash);
  });

  it('PROPERTY 5: staleness detection fires on a doctored mirror over TCP', () => {
    const doctored = applyPatches({}, tcpSnapshot.delta) as WorldState;
    (doctored as unknown as Record<string, unknown>).locationId = 'somewhere-else';
    expect(stateHash(doctored)).not.toBe(tcpSnapshot.hash);
  });

  it('STRICT-IN survives the new transport: an unknown FIELD is refused', async () => {
    // RFC 9413 applied asymmetrically, and the single most important rule to
    // re-prove on a new transport — a wire that silently dropped a command field
    // would look completely healthy on every property above.
    await expect(
      tcp.request(METHODS.SUBMIT_ACTION, { verb: 'look', speculativeHint: 'render-fast' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_PARAMS });
  });

  it('STRICT-IN survives the new transport: an unknown METHOD is refused', async () => {
    await expect(tcp.request('sim/pleaseDecideForMe')).rejects.toMatchObject({
      code: ERROR_CODES.METHOD_NOT_FOUND,
    });
  });

  it('CONTROL: stdout carried NOTHING on the socket transport', () => {
    // Under --listen stdout is not the protocol, so a leak here is invisible — which
    // is exactly why it is asserted. The rule is unconditional (stdio.ts:11-14).
    expect(tcp.stderr.filter((s) => s.startsWith('STDOUT_LEAK:'))).toEqual([]);
  });

  it('CONTROL: no framing faults on either transport', () => {
    expect(tcp.stderr.filter((s) => s.startsWith('framing:'))).toEqual([]);
    expect(stdio.stdoutClean).toBe(true);
  });

  it('a SECOND concurrent client is refused, with the reason on the wire', async () => {
    // Not a limitation quietly accepted: two writers interleave in socket arrival
    // order, which is not deterministic, and determinism through the wire is the
    // property this whole cycle rests on. The refusal is the feature.
    //
    // The precondition is asserted rather than assumed. This test needs the live
    // session the first test opened, so `-t "SECOND concurrent"` alone connects to
    // port 0 and fails for a reason that has nothing to do with the cap — which
    // briefly contaminated this control's own injection proof until the full file
    // was run instead. A named failure beats a five-second mystery.
    expect(tcp.port, 'needs the session from "runs the same script three ways" — run the whole file').toBeGreaterThan(0);

    const second = await new Promise<{ text: string; closed: boolean }>((resolve, reject) => {
      let text = '';
      const s = net.createConnection({ port: tcp.port, host: '127.0.0.1' }, () => {
        s.on('data', (c: Buffer) => {
          text += c.toString('utf-8');
        });
      });
      s.on('close', () => resolve({ text, closed: true }));
      s.on('error', reject);
      setTimeout(() => {
        s.destroy();
        resolve({ text, closed: false });
      }, 5000);
    });

    expect(second.text).toContain('sim/closing');
    expect(second.text).toContain('not deterministic');
    expect(second.closed).toBe(true);
  }, 15000);

  it('the FIRST client is unharmed by the refused second', async () => {
    // A cap that breaks the session it was protecting is worse than no cap.
    expect(tcp.port, 'needs the session from "runs the same script three ways" — run the whole file').toBeGreaterThan(0);
    const after = await tcp.request<SubmitActionResult>(METHODS.SUBMIT_ACTION, { verb: 'look' });
    expect(after.hash).toBeTruthy();
  });

  it('the two conformance suites still run the SAME script', async () => {
    // The scripts are deliberately duplicated so the suites can disagree. This is
    // what keeps the duplication honest: an edit to one is a named failure here,
    // rather than both arms moving together and the agreement meaning nothing.
    const fs = await import('node:fs');
    const c1 = fs.readFileSync(path.resolve(import.meta.dirname, 'c1-conformance.test.ts'), 'utf-8');
    const extract = (src: string): string => {
      const m = /const SCRIPT: readonly \{[^}]*\}\[\] = \[([\s\S]*?)\];/.exec(src);
      if (!m) throw new Error('could not locate SCRIPT in the source under test');
      return m[1].replace(/\s+/g, '');
    };
    const mine = fs.readFileSync(path.resolve(import.meta.dirname, 'c4-tcp-conformance.test.ts'), 'utf-8');
    expect(extract(mine)).toBe(extract(c1));
  });
});
