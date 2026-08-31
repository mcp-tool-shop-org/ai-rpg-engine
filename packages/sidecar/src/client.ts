// client.ts — the rendering side of the wire.
//
// Small on purpose. Clients RENDER; they never decide (charter §3). This one
// submits intents, accumulates pushed state, verifies per-tick hashes, and
// reports staleness — it never corrects the sim, because a client that "fixes"
// authoritative state is how two processes quietly stop being one simulation.
//
// It is also the tolerant half of RFC 9413's asymmetry, and the conformance
// harness uses it to prove that: an event carrying a field this client has never
// heard of must be harmless, which is what makes additive-only evolution real
// rather than aspirational.

import type { WorldState } from '@ai-rpg-engine/core';
import type { RpcMessage } from './framing.js';
import {
  ERROR_CODES,
  METHODS,
  NOTIFICATIONS,
  type ClientCapabilities,
  type InitializeResult,
  type SnapshotParams,
  type SnapshotResult,
  type SubmitActionResult,
  type TickNotification,
  type WireEvent,
} from './protocol.js';
import { applyPatches, canonicalStateHash, stateHash } from './serializer.js';

function defaultHashState(state: unknown): string {
  return stateHash(state as WorldState);
}

function defaultCanonicalHashState(state: unknown): string {
  return canonicalStateHash(state);
}

function sessionClosedError(): Error & { code: number } {
  const e = new Error('session is closed; further methods are refused.') as Error & { code: number };
  e.code = ERROR_CODES.SESSION_CLOSED;
  return e;
}

function timeoutError(method: string, timeoutMs: number): Error & { code: number } {
  const e = new Error(`request "${method}" timed out after ${timeoutMs}ms`) as Error & { code: number };
  e.code = ERROR_CODES.INTERNAL_ERROR;
  e.name = 'TimeoutError';
  return e;
}

export type PendingResolver = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
};

export type StalenessReport = {
  tick: number;
  expected: string;
  actual: string;
};

export type SidecarClientOptions = {
  /**
   * Called when a tick or snapshot hash does not match the mirrored state.
   * Hosts must `snapshot()` and re-render from that delta — never "fix" the
   * mirror locally (charter §3.3: detect, never correct).
   */
  onStale?: (report: StalenessReport) => void;
  /**
   * Reject a request that gets no reply within this many milliseconds.
   * Default 30_000 so a quiet socket cannot stall the renderer forever.
   * Pass 0 to wait indefinitely.
   */
  requestTimeoutMs?: number;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class SidecarClient {
  private nextId = 1;
  private readonly pending = new Map<number, PendingResolver>();
  /** The client's mirror of world state, rebuilt purely from patches. */
  private state: unknown = {};
  private readonly ticks: TickNotification[] = [];
  private readonly staleness: StalenessReport[] = [];
  private serverInfo?: InitializeResult;
  private closed = false;
  private hashesEnabled = true;
  private notificationsEnabled = true;
  private canonicalHashesEnabled = false;
  /** Applied SNAPSHOT generation. Ticks with a lower seq are dropped. */
  private appliedSnapshotSeq = 0;
  /** False until a SNAPSHOT result has rebuilt the mirror from empty. */
  private hasBaseline = false;
  private snapshotInFlight = 0;
  private readonly queuedTicks: TickNotification[] = [];
  private readonly send: (msg: RpcMessage) => void;
  private readonly hashState: ((state: unknown) => string) | undefined;
  private readonly hashCanonical: ((state: unknown) => string) | undefined;
  private readonly onStale?: (report: StalenessReport) => void;
  private readonly requestTimeoutMs: number;

  constructor(
    send: (msg: RpcMessage) => void,
    hashStateOrOptions?: ((state: unknown) => string) | SidecarClientOptions,
    options?: SidecarClientOptions,
  ) {
    this.send = send;
    if (typeof hashStateOrOptions === 'function') {
      this.hashState = hashStateOrOptions;
      this.hashCanonical = defaultCanonicalHashState;
      this.onStale = options?.onStale;
      this.requestTimeoutMs = options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    } else {
      this.hashState = defaultHashState;
      this.hashCanonical = defaultCanonicalHashState;
      const opts = hashStateOrOptions ?? options ?? {};
      this.onStale = opts.onStale;
      this.requestTimeoutMs = opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    }
  }

  /** Feed one inbound message (response or notification). */
  handle(message: RpcMessage): void {
    if (typeof message.method === 'string') {
      this.handleNotification(message.method, (message.params ?? {}) as Record<string, unknown>);
      return;
    }
    const id = message.id;
    if (typeof id !== 'number') return;
    const resolver = this.pending.get(id);
    if (!resolver) return;
    this.pending.delete(id);
    if (resolver.timer) clearTimeout(resolver.timer);
    if (message.error !== undefined) {
      const err = message.error as { code: number; message: string };
      const e = new Error(err.message) as Error & { code?: number };
      e.code = err.code;
      resolver.reject(e);
      return;
    }
    resolver.resolve(message.result);
  }

  private handleNotification(method: string, params: Record<string, unknown>): void {
    if (method === NOTIFICATIONS.CLOSING) {
      this.closed = true;
      this.failPending(sessionClosedError());
      return;
    }
    if (method !== NOTIFICATIONS.TICK) {
      // TOLERANT OUT: an unknown notification is ignored, not an error. The
      // server may add channels this client predates.
      return;
    }
    if (!this.notificationsEnabled) return;
    const tick = params as unknown as TickNotification;
    this.ticks.push(tick);
    if (this.snapshotInFlight > 0) {
      this.queuedTicks.push(tick);
      return;
    }
    this.applyTick(tick);
  }

  private applyTick(tick: TickNotification): void {
    // Never patch an empty mirror with an incremental delta. A late joiner
    // that has not snapshotted stays {} until SNAPSHOT rebuilds from empty.
    if (!this.hasBaseline) return;
    if (tick.snapshotSeq !== undefined && tick.snapshotSeq < this.appliedSnapshotSeq) return;
    this.state = applyPatches(this.state, tick.delta ?? []);
    this.noteHash(tick.tick, tick.hash, tick.canonicalHash);
  }

  /**
   * Transport-close (TCP `close`/`error` without a `sim/closing` frame).
   * Rejects every in-flight request so the renderer cannot hang on a dead peer.
   */
  disconnect(err?: Error): void {
    this.closed = true;
    if (err && (err as Error & { code?: number }).code === undefined) {
      (err as Error & { code?: number }).code = ERROR_CODES.SESSION_CLOSED;
    }
    this.failPending(err ?? sessionClosedError());
  }

  private failPending(err: Error): void {
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const resolver of waiting) {
      if (resolver.timer) clearTimeout(resolver.timer);
      resolver.reject(err);
    }
  }

  request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.closed) {
      return Promise.reject(sessionClosedError());
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timeoutMs = this.requestTimeoutMs;
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              if (!this.pending.delete(id)) return;
              reject(timeoutError(method, timeoutMs));
            }, timeoutMs)
          : undefined;
      this.pending.set(id, {
        resolve: (value: unknown) => {
          if (timer) clearTimeout(timer);
          this.ingestResult(method, value);
          resolve(value as T);
        },
        reject: (reason: Error) => {
          if (timer) clearTimeout(timer);
          reject(reason);
        },
        timer,
      });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  async initialize(capabilities: ClientCapabilities = { notifications: true, hashes: true }): Promise<InitializeResult> {
    this.hashesEnabled = capabilities.hashes !== false;
    this.notificationsEnabled = capabilities.notifications !== false;
    this.canonicalHashesEnabled = capabilities.canonicalHashes === true;
    const result = await this.request<InitializeResult>(METHODS.INITIALIZE, {
      clientName: '@ai-rpg-engine/sidecar client',
      clientVersion: '1.0.0',
      capabilities,
    });
    this.serverInfo = result;
    return result;
  }

  /** Load the world as a delta from empty — the same path as a tick. */
  async snapshot(params: SnapshotParams = {}): Promise<SnapshotResult> {
    this.snapshotInFlight += 1;
    this.queuedTicks.length = 0;
    try {
      const result = await this.request<SnapshotResult>(METHODS.SNAPSHOT, params as Record<string, unknown>);
      this.state = applyPatches({}, result.delta);
      this.hasBaseline = true;
      this.appliedSnapshotSeq = result.snapshotSeq ?? this.appliedSnapshotSeq + 1;
      this.noteHash(result.tick, result.hash, result.canonicalHash);
      return result;
    } finally {
      const queued = this.queuedTicks.splice(0);
      this.snapshotInFlight -= 1;
      for (const tick of queued) this.applyTick(tick);
    }
  }

  private ingestResult(method: string, value: unknown): void {
    if (this.notificationsEnabled) return;
    if (method !== METHODS.SUBMIT_ACTION && method !== METHODS.ADVANCE) return;
    const result = value as SubmitActionResult;
    if (!result || typeof result !== 'object' || !Array.isArray(result.delta)) return;
    this.state = applyPatches(this.state, result.delta);
    this.noteHash(result.tick, result.hash, result.canonicalHash);
  }

  private noteHash(tick: number, expected: string, canonical?: string): void {
    if (this.canonicalHashesEnabled && canonical !== undefined && this.hashCanonical) {
      const actual = this.hashCanonical(this.state);
      if (actual !== canonical) this.reportStale(tick, canonical, actual);
    }
    if (!this.hashesEnabled || !this.hashState) return;
    const actual = this.hashState(this.state);
    if (actual !== expected) this.reportStale(tick, expected, actual);
  }

  private reportStale(tick: number, expected: string, actual: string): void {
    const report: StalenessReport = { tick, expected, actual };
    this.staleness.push(report);
    if (this.onStale) {
      this.onStale(report);
    } else {
      process.stderr.write(
        `[sidecar] stale mirror at tick ${tick}: expected ${expected}, got ${actual}. ` +
          'Call snapshot() to resync; do not correct the mirror locally.\n',
      );
    }
  }

  get mirroredState(): unknown {
    return this.state;
  }

  get receivedTicks(): readonly TickNotification[] {
    return this.ticks;
  }

  /** Every event the client saw, in arrival order. */
  get receivedEvents(): WireEvent[] {
    return this.ticks.flatMap((t) => t.events);
  }

  get stalenessReports(): readonly StalenessReport[] {
    return this.staleness;
  }

  get server(): InitializeResult | undefined {
    return this.serverInfo;
  }

  get isClosed(): boolean {
    return this.closed;
  }
}
