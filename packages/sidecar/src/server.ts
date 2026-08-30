// server.ts — the authoritative sim, behind a JSON-RPC wire.
//
// One sim process, N rendering clients (LSP's topology). The client submits
// INTENTS; the sim validates and decides; events come back tick-stamped as
// NOTIFICATIONS, not as responses to a request for derived state (matklad).
// Clients never gate tick advancement (Screeps) and never correct the sim — they
// detect staleness by hash and say so (charter §3.3).
//
// The asymmetry is deliberate and is the single most important rule in this file
// (RFC 9413): STRICT IN, TOLERANT OUT. An unknown command or an unknown field on
// a known command is REFUSED, because accepting an intent whose meaning the two
// sides do not share is a divergence the sim cannot detect and cannot undo.
// Events, by contrast, only ever GAIN fields, and a client that ignores one it
// does not know loses nothing.

import { WorldStore, type Engine, type ResolvedEvent, type WorldState } from '@ai-rpg-engine/core';
import {
  ALL_METHODS,
  ERROR_CODES,
  METHODS,
  METHOD_PARAMS,
  NOTIFICATIONS,
  type ClientCapabilities,
  type InitializeResult,
  type MethodName,
  type PreviewResult,
  type ReplayResult,
  type ServerCapabilities,
  type SnapshotResult,
  type SubmitActionResult,
  type TickNotification,
  type WireEvent,
} from './protocol.js';
import { diffState, snapshotDelta, stateHash, toWireEvent } from './serializer.js';
import type { RpcMessage } from './framing.js';

export type SidecarServerOptions = {
  /** The booted sim. Built by pack CODE — this server never constructs one. */
  engine: Engine;
  /** Informational; compatibility is negotiated by capability, not version. */
  engineVersion: string;
  serverName?: string;
  /**
   * Advance the world one round. Supplied by the host because the round loop
   * lives above the engine (`runWorldTick` is a per-round function the CLI
   * drives, not a verb — a correction the v3.6 cycle earned the hard way).
   * Omit and `advance` reports the capability unavailable rather than pretending.
   */
  advanceRound?: (engine: Engine) => void;
  /**
   * Fired after this session commits a world mutation and has pushed its own
   * `sim/tick`. The socket server uses this to catch every other live session
   * up so 1:N clients share one tick stream. Must not recurse into the origin.
   */
  onWorldCommitted?: () => void;
};

type Outbound = (msg: RpcMessage) => void;

type ActionOptions = Partial<{
  targetIds: string[];
  toolId: string;
  parameters: Record<string, string | number | boolean>;
}>;

/**
 * Live SidecarServers sharing one Engine. Closed is sim-local, not
 * process-wide: two independent SidecarServers wrapping two Engines must
 * not close each other. Session-local `closed` was F-009da546; the remaining
 * hole (F-aca8c299) is a sibling session whose instance flag stayed false.
 */
type SimGate = {
  closed: boolean;
  servers: Set<SidecarServer>;
};

const simGates = new WeakMap<Engine, SimGate>();

function attachSession(engine: Engine, server: SidecarServer): SimGate {
  let gate = simGates.get(engine);
  if (!gate) {
    gate = { closed: false, servers: new Set() };
    simGates.set(engine, gate);
  }
  gate.servers.add(server);
  return gate;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The sim-side protocol handler.
 *
 * Transport-free by construction: it takes messages in and hands messages out
 * through a callback. `startStdioServer` binds it to stdio; a socket server
 * would bind the same object to a socket. That is what "attach designed into the
 * framing" means in practice.
 */
export class SidecarServer {
  private initialized = false;
  private closed = false;
  private readonly engine: Engine;
  private readonly engineVersion: string;
  private readonly serverName: string;
  private readonly advanceRound?: (engine: Engine) => void;
  private readonly onWorldCommitted?: () => void;
  /** Events already pushed, keyed by id — the basis of idempotent re-emission. */
  private readonly emitted = new Set<string>();
  private lastState: WorldState;
  private clientCapabilities: ClientCapabilities = {};
  private readonly gate: SimGate;

  constructor(
    options: SidecarServerOptions,
    private readonly send: Outbound,
  ) {
    this.engine = options.engine;
    this.engineVersion = options.engineVersion;
    this.serverName = options.serverName ?? '@ai-rpg-engine/sidecar';
    this.advanceRound = options.advanceRound;
    this.onWorldCommitted = options.onWorldCommitted;
    this.lastState = structuredClone(this.engine.world) as WorldState;
    for (const e of this.engine.world.eventLog ?? []) this.emitted.add(e.id);
    this.gate = attachSession(this.engine, this);
    if (this.gate.closed) this.closed = true;
  }

  get capabilities(): ServerCapabilities {
    return {
      preview: true,
      hashes: true,
      replay: true,
      snapshot: true,
    };
  }

  /** Feed one inbound message. Responses and notifications go out via `send`. */
  handle(message: RpcMessage): void {
    const id = message.id;
    const hasId = id !== undefined && id !== null;

    if (message.jsonrpc !== '2.0') {
      if (hasId) this.fail(id, ERROR_CODES.INVALID_REQUEST, 'every message must carry jsonrpc: "2.0".');
      return;
    }
    const method = message.method;
    if (typeof method !== 'string') {
      if (hasId) this.fail(id, ERROR_CODES.INVALID_REQUEST, '"method" must be a string.');
      return;
    }

    // STRICT IN, part 1: the method table is CLOSED.
    if (!(ALL_METHODS as readonly string[]).includes(method)) {
      if (hasId) {
        this.fail(
          id,
          ERROR_CODES.METHOD_NOT_FOUND,
          `unknown method "${method}". This protocol accepts exactly: ${ALL_METHODS.join(', ')}.`,
        );
      }
      return;
    }
    const name = method as MethodName;

    const params = (message.params ?? {}) as Record<string, unknown>;
    if (params === null || typeof params !== 'object' || Array.isArray(params)) {
      if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, '"params" must be an object when present.');
      return;
    }

    // STRICT IN, part 2: unknown FIELDS are refused too, and present fields of
    // the wrong type are refused the same way. A silently dropped or coerced
    // command field is a divergent simulation — the client believes it asked for
    // something the server never heard.
    const allowed = METHOD_PARAMS[name];
    const unknownFields = Object.keys(params).filter((k) => !allowed.includes(k));
    if (unknownFields.length > 0) {
      if (hasId) {
        this.fail(
          id,
          ERROR_CODES.INVALID_PARAMS,
          `"${method}" does not accept ${unknownFields.map((f) => `"${f}"`).join(', ')}. ` +
            `Accepted: ${allowed.length > 0 ? allowed.join(', ') : '(none)'}. ` +
            'Unknown command fields are refused rather than ignored: silently dropping one means the sim ' +
            'executed a different intent than the client submitted.',
        );
      }
      return;
    }

    if (this.closed || this.gate.closed) {
      if (hasId) {
        this.fail(id, ERROR_CODES.SESSION_CLOSED, 'session is closed; further methods are refused.');
      }
      return;
    }

    if (name !== METHODS.INITIALIZE && !this.initialized) {
      if (hasId) this.fail(id, ERROR_CODES.NOT_INITIALIZED, 'call "initialize" before any other method.');
      return;
    }

    try {
      this.dispatch(name, params, id, hasId);
    } catch (err) {
      if (hasId) {
        this.fail(id, ERROR_CODES.INTERNAL_ERROR, err instanceof Error ? err.message : String(err));
      }
    }
  }

  private dispatch(name: MethodName, params: Record<string, unknown>, id: unknown, hasId: boolean): void {
    switch (name) {
      case METHODS.INITIALIZE: {
        if (this.initialized) {
          if (hasId) this.fail(id, ERROR_CODES.ALREADY_INITIALIZED, '"initialize" has already been called.');
          return;
        }
        this.initialized = true;
        this.clientCapabilities = (params.capabilities ?? {}) as ClientCapabilities;
        const result: InitializeResult = {
          serverName: this.serverName,
          engineVersion: this.engineVersion,
          capabilities: this.capabilities,
          tick: this.engine.store.tick,
        };
        if (hasId) this.reply(id, result);
        return;
      }

      case METHODS.SNAPSHOT: {
        const state = this.engine.world as WorldState;
        // SNAPSHOT is a resync: the next incremental diff must start from this
        // world, not construct-time lastState (F-98b60cd0).
        this.lastState = structuredClone(state) as WorldState;
        for (const e of state.eventLog ?? []) this.emitted.add(e.id);
        const result: SnapshotResult = {
          tick: this.engine.store.tick,
          hash: stateHash(state),
          delta: snapshotDelta(state), // the SAME serializer, from an empty baseline
        };
        if (hasId) this.reply(id, result);
        return;
      }

      case METHODS.SUBMIT_ACTION: {
        const parsed = this.parseActionParams(params);
        if (!parsed.ok) {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, parsed.message);
          return;
        }
        const events = this.engine.submitAction(parsed.verb, parsed.options);
        const result = this.commit(events);
        if (hasId) this.reply(id, result satisfies SubmitActionResult);
        this.pushTick(result);
        this.onWorldCommitted?.();
        return;
      }

      case METHODS.ADVANCE: {
        if (Object.hasOwn(params, 'rounds') && !isSafeInteger(params.rounds)) {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, '"rounds" must be a safe integer when present.');
          return;
        }
        if (!this.advanceRound) {
          if (hasId) {
            this.fail(
              id,
              ERROR_CODES.CAPABILITY_UNAVAILABLE,
              'this server was started without a round driver, so "advance" cannot run. ' +
                'The round loop lives above the engine; the host must supply it.',
            );
          }
          return;
        }
        const rounds = typeof params.rounds === 'number' ? params.rounds : 1;
        if (rounds < 1 || rounds > 1000) {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, '"rounds" must be an integer in [1, 1000].');
          return;
        }
        for (let i = 0; i < rounds; i++) this.advanceRound(this.engine);
        const result = this.commit([]);
        if (hasId) this.reply(id, result);
        this.pushTick(result);
        this.onWorldCommitted?.();
        return;
      }

      case METHODS.PREVIEW: {
        const parsed = this.parseActionParams(params);
        if (!parsed.ok) {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, parsed.message);
          return;
        }
        if (hasId) this.reply(id, this.preview(parsed.verb, params));
        return;
      }

      case METHODS.REPLAY: {
        if (Object.hasOwn(params, 'fromTick') && !isSafeInteger(params.fromTick)) {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, '"fromTick" must be a safe integer when present.');
          return;
        }
        if (Object.hasOwn(params, 'toTick') && !isSafeInteger(params.toTick)) {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, '"toTick" must be a safe integer when present.');
          return;
        }
        const fromTick = typeof params.fromTick === 'number' ? params.fromTick : 0;
        const toTick = typeof params.toTick === 'number' ? params.toTick : this.engine.store.tick;
        if (fromTick > toTick) {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, '"fromTick" and "toTick" must be integers, from <= to.');
          return;
        }
        const events = (this.engine.world.eventLog ?? [])
          .filter((e) => e.tick >= fromTick && e.tick <= toTick)
          .map(toWireEvent);
        const result: ReplayResult = { fromTick, toTick, events };
        if (hasId) this.reply(id, result);
        return;
      }

      case METHODS.SHUTDOWN: {
        // Flip the sim-local gate BEFORE engine.shutdown so a sibling
        // handle() cannot submitAction after this session has decided to stop.
        // Engine.shutdown() only teardowns modules; it does not refuse
        // submitAction; the gate is the refusal (F-aca8c299).
        this.closeSharedSim();
        if (hasId) this.reply(id, { ok: true });
        this.fanoutClosing();
        return;
      }
    }
  }

  /**
   * Side-effect-free command evaluation (Into the Breach, charter §3.5).
   *
   * Dispatches against a WorldStore.deserialize snapshot (state + rngState) and
   * throws the copy away. The live Engine is never the dispatch target: its
   * actionLog, rng, EventBus, and nested entity/zone identities stay untouched.
   * Module-cached nested refs therefore remain valid across preview — they were
   * never replaced. The conformance harness still proves this by hashing before
   * and after rather than trusting this comment.
   */
  preview(verb: string, params: Record<string, unknown>): PreviewResult {
    const parsed = this.parseActionParams({ ...params, verb });
    if (!parsed.ok) throw new Error(parsed.message);

    const before = stateHash(this.engine.world as WorldState);
    const tick = this.engine.store.tick;
    const liveStore = this.engine.store;
    const clone = WorldStore.deserialize(liveStore.serialize(), undefined, this.engine.ruleset);
    // ctx.events.emit records into moduleManager.activeStore. Point it at the
    // copy for the duration of the preview so a handler cannot write the live log.
    this.engine.moduleManager.rebindStore(clone);
    try {
      const events = this.runOnStore(clone, parsed.verb, parsed.options);
      return { tick, hash: before, events: events.map(toWireEvent) };
    } finally {
      this.engine.moduleManager.rebindStore(liveStore);
    }
  }

  /**
   * Run one player intent against `store` — the Engine.submitAction pipeline,
   * minus the live actionLog. Used by preview so the copy is the only thing
   * that moves.
   */
  private runOnStore(
    store: WorldStore,
    verb: string,
    options: ActionOptions,
  ): ResolvedEvent[] {
    const playerId = store.state.playerId;
    const logBefore = (store.state.eventLog ?? []).length;
    const returned: ResolvedEvent[] = [];

    if (!store.state.entities[playerId]) {
      store.emitEvent(
        'action.rejected',
        {
          verb,
          actorId: playerId,
          reason:
            playerId === ''
              ? 'unknown actor: state.playerId is not set. Set world.playerId to the player entity\'s id (and add that entity) before submitting player actions.'
              : `unknown actor: no entity "${playerId}" in world state for state.playerId. Add the player entity before acting, or check the id for a typo.`,
        },
        { actorId: playerId },
      );
      store.advanceTick();
    } else {
      const action = this.engine.dispatcher.createAction(
        verb,
        playerId,
        store.tick,
        { source: 'player', ...options },
        store.genId('act'),
      );
      returned.push(...this.engine.dispatcher.dispatch(action, store));
      for (const pending of store.processPending()) {
        store.emitEvent(pending.type, pending.payload, { causedBy: pending.sourceEventId });
      }
      store.advanceTick();
    }

    const log = (store.state.eventLog ?? []) as ResolvedEvent[];
    const events: ResolvedEvent[] = [];
    const seen = new Set<string>();
    for (const e of [...log.slice(logBefore), ...returned]) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      events.push(e);
    }
    return events;
  }

  private parseActionParams(params: Record<string, unknown>):
    | { ok: true; verb: string; options: ActionOptions }
    | { ok: false; message: string } {
    const verb = params.verb;
    if (typeof verb !== 'string' || verb.length === 0) {
      return { ok: false, message: '"verb" must be a non-empty string.' };
    }
    if (Object.hasOwn(params, 'targetIds') && !isStringArray(params.targetIds)) {
      return { ok: false, message: '"targetIds" must be string[] when present.' };
    }
    if (Object.hasOwn(params, 'toolId') && typeof params.toolId !== 'string') {
      return { ok: false, message: '"toolId" must be a string when present.' };
    }
    if (Object.hasOwn(params, 'parameters') && !isPlainObject(params.parameters)) {
      return { ok: false, message: '"parameters" must be an object when present.' };
    }
    return {
      ok: true,
      verb,
      options: {
        ...(isStringArray(params.targetIds) ? { targetIds: params.targetIds } : {}),
        ...(typeof params.toolId === 'string' ? { toolId: params.toolId } : {}),
        ...(isPlainObject(params.parameters)
          ? { parameters: params.parameters as Record<string, string | number | boolean> }
          : {}),
      },
    };
  }

  /** Fold newly emitted events into a tick result, deduplicated by event id. */
  private commit(direct: readonly ResolvedEvent[]): SubmitActionResult {
    const log = (this.engine.world.eventLog ?? []) as ResolvedEvent[];
    const fresh: WireEvent[] = [];
    for (const e of log) {
      if (this.emitted.has(e.id)) continue;
      this.emitted.add(e.id);
      fresh.push(toWireEvent(e));
    }
    // `direct` is what submitAction returned. Anything it produced is already in
    // the log, so it is only used as a tie-break when a pack emits outside the
    // log — the dedup by id is what makes re-emission idempotent (GGPO).
    for (const e of direct) {
      if (this.emitted.has(e.id)) continue;
      this.emitted.add(e.id);
      fresh.push(toWireEvent(e));
    }

    const state = this.engine.world as WorldState;
    const delta = diffState(this.lastState, state);
    this.lastState = structuredClone(state) as WorldState;

    return { tick: this.engine.store.tick, hash: stateHash(state), events: fresh, delta };
  }

  /** Mark every session sharing this Engine closed, then tear the sim down. */
  private closeSharedSim(): void {
    this.gate.closed = true;
    for (const peer of this.gate.servers) peer.closed = true;
    this.engine.shutdown();
  }

  /** `sim/closing` on every session's send, not only the requester. */
  private fanoutClosing(): void {
    for (const peer of this.gate.servers) {
      peer.send({ jsonrpc: '2.0', method: NOTIFICATIONS.CLOSING, params: {} });
    }
  }

  private pushTick(result: SubmitActionResult): void {
    if (this.closed || this.gate.closed) return;
    const notification: TickNotification = {
      tick: result.tick,
      hash: result.hash,
      events: result.events,
      delta: result.delta,
    };
    this.send({ jsonrpc: '2.0', method: NOTIFICATIONS.TICK, params: notification });
  }

  /**
   * Catch this session up after another session committed against the shared
   * Engine. Diffs vs this session's lastState so each client gets the delta
   * that matches its own mirror — not the origin's.
   */
  replicatePeerCommit(): void {
    if (this.closed || this.gate.closed || !this.initialized) return;
    this.pushTick(this.commit([]));
  }

  private reply(id: unknown, result: unknown): void {
    this.send({ jsonrpc: '2.0', id: id as string | number, result });
  }

  private fail(id: unknown, code: number, message: string): void {
    this.send({ jsonrpc: '2.0', id: id as string | number, error: { code, message } });
  }

  get isClosed(): boolean {
    return this.closed || this.gate.closed;
  }

  /** Exposed for the conformance harness; not part of the wire. */
  get negotiatedClientCapabilities(): ClientCapabilities {
    return this.clientCapabilities;
  }
}
