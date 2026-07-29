// c1-conformance.test.ts — C1's exit gate: determinism SURVIVES the wire.
//
// Charter §6.1, non-negotiable: "Byte-identical replay through the wire
// contract; idempotent effect playback; cosmetic RNG fully separated from sim
// streams. The conformance harness is C1's exit gate, proven both directions
// like every instrument since v3.6."
//
// The claim under test is precise and it is the only one that matters for C4:
// running a scripted session through a PROCESS BOUNDARY produces the same
// simulation as running it in-process. Not "similar". Not "equivalent modulo
// serialization". The same event stream, and the same end-state hash.
//
// Everything here spawns a real child process. An in-memory pair of streams
// would test the protocol and skip the boundary, and the boundary is the part
// that has never existed before this cycle.

import { describe, it, expect, afterAll } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as path from 'node:path';
import {
  MessageReader,
  encodeMessage,
  applyPatches,
  stateHash,
  METHODS,
  NOTIFICATIONS,
  type RpcMessage,
  type SnapshotResult,
  type SubmitActionResult,
  type ReplayResult,
  type TickNotification,
  type WireEvent,
} from '@ai-rpg-engine/sidecar';
import type { WorldState } from '@ai-rpg-engine/core';
import { allPacks } from './packs.js';

const BIN = path.resolve(import.meta.dirname, '../dist/bin.js');
const PACK_ID = 'chapel-threshold';
const SEED = 71;

/**
 * The script both runs execute, verbatim.
 *
 * Fixed and shared on purpose: if the two sides could drift in what they did,
 * "the streams match" would be a statement about the script rather than about
 * the wire.
 */
const SCRIPT: readonly { verb: string; targetIds?: string[] }[] = [
  { verb: 'look' },
  { verb: 'move' },
  { verb: 'look' },
  { verb: 'move' },
  { verb: 'wait' },
  { verb: 'look' },
];

// --- Side A: in-process, the way every prior cycle ran ---------------------

type InProcessRun = { events: WireEvent[]; endHash: string; tick: number };

function runInProcess(): InProcessRun {
  const pack = allPacks.find((p) => p.meta.id === PACK_ID)!;
  const engine = pack.createGame(SEED);
  const before = new Set((engine.world.eventLog ?? []).map((e) => e.id));

  for (const step of SCRIPT) {
    engine.submitAction(step.verb, step.targetIds ? { targetIds: step.targetIds } : {});
  }

  const events = (engine.world.eventLog ?? [])
    .filter((e) => !before.has(e.id))
    .map((e) => toComparable(e));

  return { events, endHash: stateHash(engine.world as WorldState), tick: engine.store.tick };
}

/**
 * Normalise an event to the fields the wire carries, so the comparison is
 * between the same things on both sides. Uses the sidecar's OWN wire mapping
 * rather than a hand-rolled copy — a second mapping would be a second thing to
 * keep in sync, and comparing a stream against a hand-copy of its own serializer
 * proves nothing about the serializer.
 */
function toComparable(event: unknown): WireEvent {
  // toWireEvent is exported from the sidecar; imported lazily through the same
  // module the server uses so there is exactly one definition of "on the wire".
  return wireOf(event);
}

let wireOf: (e: unknown) => WireEvent;

// --- Side B: over the wire, against a spawned process ----------------------

class WireRun {
  private readonly child: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  readonly ticks: TickNotification[] = [];
  readonly stderr: string[] = [];

  constructor() {
    this.child = spawn(process.execPath, [BIN, 'sidecar', PACK_ID, '--seed', String(SEED)], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const reader = new MessageReader(
      (msg) => this.onMessage(msg),
      (err) => this.stderr.push(`framing:${err.kind}`),
    );
    this.child.stdout.on('data', (c: Buffer) => reader.push(c));
    this.child.stderr.on('data', (c: Buffer) => this.stderr.push(c.toString('utf-8')));
  }

  private onMessage(msg: RpcMessage): void {
    if (msg.method === NOTIFICATIONS.TICK) {
      this.ticks.push(msg.params as unknown as TickNotification);
      return;
    }
    if (typeof msg.method === 'string') return;
    const p = this.pending.get(msg.id as number);
    if (!p) return;
    this.pending.delete(msg.id as number);
    if (msg.error) {
      p.reject(new Error((msg.error as { message: string }).message));
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
      this.child.stdin.write(encodeMessage({ jsonrpc: '2.0', id, method, params }));
    });
  }

  kill(): void {
    this.child.kill();
  }
}

const wire = new WireRun();
afterAll(() => wire.kill());

let inProcess: InProcessRun;
const wireEvents: WireEvent[] = [];
let wireEndHash = '';
let wireSnapshotState: unknown;

describe('C1/P5 — determinism survives the wire', () => {
  it('runs the same script both ways', async () => {
    const sidecar = await import('@ai-rpg-engine/sidecar');
    wireOf = (e) => sidecar.toWireEvent(e as never);
    inProcess = runInProcess();

    await wire.request(METHODS.INITIALIZE, {
      clientName: 'c1-conformance',
      clientVersion: '1.0.0',
      capabilities: { notifications: true, hashes: true },
    });
    const snap = await wire.request<SnapshotResult>(METHODS.SNAPSHOT);
    wireSnapshotState = applyPatches({}, snap.delta);

    for (const step of SCRIPT) {
      const result = await wire.request<SubmitActionResult>(METHODS.SUBMIT_ACTION, {
        verb: step.verb,
        ...(step.targetIds ? { targetIds: step.targetIds } : {}),
      });
      wireEvents.push(...result.events);
      wireEndHash = result.hash;
    }

    expect(inProcess.events.length).toBeGreaterThan(0);
    expect(wireEvents.length).toBeGreaterThan(0);
  });

  it('PROPERTY 1: the event stream is BYTE-IDENTICAL', () => {
    // Not "same length", not "same types". The serialized streams compared as
    // bytes — anything less would pass for a wire that reorders, drops a field,
    // or rounds a number.
    expect(JSON.stringify(wireEvents)).toBe(JSON.stringify(inProcess.events));
  });

  it('PROPERTY 2: the end-state hash matches the in-process run', () => {
    expect(wireEndHash).toBe(inProcess.endHash);
  });

  it('RED CONTROL: the comparison CAN fail — a doctored stream is caught', () => {
    // Without this, properties 1 and 2 might be comparing two empty arrays, or
    // two hashes of nothing. A gate that has only ever passed proves nothing.
    const doctored = wireEvents.map((e, i) => (i === 0 ? { ...e, type: `${e.type}-tampered` } : e));
    expect(JSON.stringify(doctored)).not.toBe(JSON.stringify(inProcess.events));
    expect(stateHash({ ...(wireSnapshotState as WorldState), tampered: true } as WorldState)).not.toBe(
      inProcess.endHash,
    );
  });

  it('PROPERTY 3: re-emission is IDEMPOTENT — replaying a window twice is stable', async () => {
    // GGPO's property: effects keyed to (tick, event id) are re-emittable, which
    // is what makes replay scrubbing and rejoin free on a byte-identical core.
    const first = await wire.request<ReplayResult>(METHODS.REPLAY, { fromTick: 0, toTick: 2 });
    const second = await wire.request<ReplayResult>(METHODS.REPLAY, { fromTick: 0, toTick: 2 });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.events.length).toBeGreaterThan(0);
  });

  it('RED CONTROL: replay of a DIFFERENT window differs', () => {
    // Otherwise "idempotent" could just mean "returns the same thing always",
    // which a broken replay returning [] would also satisfy.
    return Promise.all([
      wire.request<ReplayResult>(METHODS.REPLAY, { fromTick: 0, toTick: 1 }),
      wire.request<ReplayResult>(METHODS.REPLAY, { fromTick: 0, toTick: 5 }),
    ]).then(([narrow, widE]) => {
      expect(JSON.stringify(narrow)).not.toBe(JSON.stringify(widE));
    });
  });

  it('PROPERTY 4: a client rebuilds the world from patches ALONE and agrees', async () => {
    // The snapshot-as-delta-from-empty claim, end to end. The client starts from
    // {} and applies only what the wire sent — no shared memory, no second
    // serializer. If its reconstruction hashes to what the server reported, then
    // one code path really is producing both.
    const fresh = new WireRun();
    try {
      await fresh.request(METHODS.INITIALIZE, { clientName: 'c', clientVersion: '1', capabilities: {} });
      const snap = await fresh.request<SnapshotResult>(METHODS.SNAPSHOT);
      const rebuilt = applyPatches({}, snap.delta) as WorldState;
      expect(stateHash(rebuilt)).toBe(snap.hash);
    } finally {
      fresh.kill();
    }
  });

  it('PROPERTY 5: staleness detection fires on a doctored hash', async () => {
    // Clients DETECT staleness; they never correct the sim (charter §3.3). The
    // detector is only worth having if it can fire, so this doctors the client's
    // own mirrored state and requires the mismatch to be noticed.
    const fresh = new WireRun();
    try {
      await fresh.request(METHODS.INITIALIZE, { clientName: 'c', clientVersion: '1', capabilities: {} });
      const snap = await fresh.request<SnapshotResult>(METHODS.SNAPSHOT);

      const honest = applyPatches({}, snap.delta) as WorldState;
      expect(stateHash(honest), 'an honest mirror agrees').toBe(snap.hash);

      const doctored = applyPatches({}, snap.delta) as WorldState;
      (doctored as unknown as Record<string, unknown>).locationId = 'somewhere-else';
      expect(stateHash(doctored), 'a doctored mirror is CAUGHT').not.toBe(snap.hash);
    } finally {
      fresh.kill();
    }
  });

  it('PROPERTY 6: values crossing the boundary are quantized', async () => {
    // Overwatch's rule (charter §3.2): the process boundary must not be able to
    // introduce float drift. Verified structurally — every number that crossed
    // survives a round-trip through the wire's own precision unchanged.
    const seen: number[] = [];
    const collect = (v: unknown): void => {
      if (typeof v === 'number') seen.push(v);
      else if (Array.isArray(v)) v.forEach(collect);
      else if (v !== null && typeof v === 'object') Object.values(v).forEach(collect);
    };
    collect(wireEvents);
    collect(wire.ticks);
    expect(seen.length).toBeGreaterThan(0);
    for (const n of seen) {
      expect(Number.isFinite(n), 'no NaN or Infinity crosses the wire').toBe(true);
      expect(Math.round(n * 1e6) / 1e6, `${n} should be quantized`).toBe(n);
    }
  });

  it('CONTROL: stdout stayed clean across the whole conformance run', () => {
    expect(wire.stderr.filter((s) => s.startsWith('framing:'))).toEqual([]);
  });
});
