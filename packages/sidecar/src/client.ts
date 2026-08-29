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
  METHODS,
  NOTIFICATIONS,
  type ClientCapabilities,
  type InitializeResult,
  type StatePatch,
  type SubmitActionResult,
  type TickNotification,
  type WireEvent,
} from './protocol.js';
import { applyPatches, stateHash } from './serializer.js';

function defaultHashState(state: unknown): string {
  return stateHash(state as WorldState);
}

export type PendingResolver = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

export type StalenessReport = {
  tick: number;
  expected: string;
  actual: string;
};

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

  constructor(
    private readonly send: (msg: RpcMessage) => void,
    /**
     * Recompute the hash of the client's mirrored state. Defaults to the
     * package `stateHash` so `capabilities.hashes=true` is honest. Inject a
     * DOCTORED function to prove staleness detection actually fires.
     */
    private readonly hashState: ((state: unknown) => string) | undefined = defaultHashState,
  ) {}

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
    this.state = applyPatches(this.state, tick.delta ?? []);
    this.noteHash(tick.tick, tick.hash);
  }

  request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value: unknown) => {
          this.ingestResult(method, value);
          resolve(value as T);
        },
        reject,
      });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  async initialize(capabilities: ClientCapabilities = { notifications: true, hashes: true }): Promise<InitializeResult> {
    this.hashesEnabled = capabilities.hashes !== false;
    this.notificationsEnabled = capabilities.notifications !== false;
    const result = await this.request<InitializeResult>(METHODS.INITIALIZE, {
      clientName: '@ai-rpg-engine/sidecar client',
      clientVersion: '1.0.0',
      capabilities,
    });
    this.serverInfo = result;
    return result;
  }

  /** Load the full world, as a delta from empty — the same path as a tick. */
  async snapshot(): Promise<{ tick: number; hash: string; delta: StatePatch[] }> {
    const result = await this.request<{ tick: number; hash: string; delta: StatePatch[] }>(METHODS.SNAPSHOT);
    this.state = applyPatches({}, result.delta);
    this.noteHash(result.tick, result.hash);
    return result;
  }

  private ingestResult(method: string, value: unknown): void {
    if (this.notificationsEnabled) return;
    if (method !== METHODS.SUBMIT_ACTION && method !== METHODS.ADVANCE) return;
    const result = value as SubmitActionResult;
    if (!result || typeof result !== 'object' || !Array.isArray(result.delta)) return;
    this.state = applyPatches(this.state, result.delta);
    this.noteHash(result.tick, result.hash);
  }

  private noteHash(tick: number, expected: string): void {
    if (!this.hashesEnabled || !this.hashState) return;
    const actual = this.hashState(this.state);
    if (actual !== expected) {
      this.staleness.push({ tick, expected, actual });
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
