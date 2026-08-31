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

import {
  Engine,
  SaveLoadError,
  WorldStore,
  type ActionIntent,
  type ResolvedEvent,
  type WorldState,
} from '@ai-rpg-engine/core';
import {
  ALL_METHODS,
  ERROR_CODES,
  METHODS,
  METHOD_PARAMS,
  NOTIFICATIONS,
  type AvailableActionWire,
  type ClientCapabilities,
  type InitializeResult,
  type ListActionsResult,
  type LoadResult,
  type MethodName,
  type PackIntakeSummary,
  type PreviewResult,
  type ReplayResult,
  type SaveResult,
  type ServerCapabilities,
  type SessionRole,
  type SnapshotResult,
  type SnapshotView,
  type SubmitActionResult,
  type TickNotification,
  type WireEvent,
} from './protocol.js';
import { canonicalStateHash, diffState, projectState, snapshotDelta, stateHash, toWireEvent } from './serializer.js';
import { MessageTooLargeError, type RpcMessage } from './framing.js';

export type SidecarServerOptions = {
  /** The booted sim. Built by pack CODE — this server never constructs one. */
  engine: Engine;
  /** Informational; compatibility is negotiated by capability, not version. */
  engineVersion: string;
  serverName?: string;
  /**
   * Advance the world one round. Omitted: `engine.advanceRound(1)` (Wave 27
   * living-world half of a turn). Hosts that wrap extra NPC/companion work
   * around the round still pass their own callback.
   */
  advanceRound?: (engine: Engine) => void;
  /**
   * Fired after this session commits a world mutation and has pushed its own
   * `sim/tick`. The socket server uses this to catch every other live session
   * up so 1:N clients share one tick stream. Must not recurse into the origin.
   */
  onWorldCommitted?: () => void;
  /**
   * What the content-pack gate dropped or noted while this world was built.
   * Mapped from content-schema's DroppedField/ValidationError by the CLI's
   * sidecar-command.ts — content-schema types never enter this package.
   * Stamped onto `initialize`'s result only when there is something to
   * report (F-9b3f6d21).
   */
  packIntake?: PackIntakeSummary;
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
type QueuedWrite = {
  sessionOrder: number;
  seq: number;
  run: () => void;
};

type SimGate = {
  closed: boolean;
  servers: Set<SidecarServer>;
  nextSessionOrder: number;
  writePending: QueuedWrite[];
  writeScheduled: boolean;
};

const simGates = new WeakMap<Engine, SimGate>();

function attachSession(engine: Engine, server: SidecarServer): SimGate {
  let gate = simGates.get(engine);
  if (!gate) {
    gate = { closed: false, servers: new Set(), nextSessionOrder: 1, writePending: [], writeScheduled: false };
    simGates.set(engine, gate);
  }
  gate.servers.add(server);
  return gate;
}

function detachSession(engine: Engine, server: SidecarServer): void {
  simGates.get(engine)?.servers.delete(server);
}

/**
 * How many SidecarServers currently share this Engine's sim-local gate.
 * Used by reconnect tests so a leak is a count, not a GC race.
 */
export function attachedServerCount(engine: Engine): number {
  return simGates.get(engine)?.servers.size ?? 0;
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
  private readonly advanceRound: (engine: Engine) => void;
  private readonly onWorldCommitted?: () => void;
  /** What the content-pack gate reported, if the host passed one. Additive on initialize. */
  private readonly packIntake?: PackIntakeSummary;
  /** Events already pushed, keyed by id — the basis of idempotent re-emission. */
  private readonly emitted = new Set<string>();
  private lastState: WorldState;
  private clientCapabilities: ClientCapabilities = {};
  private clientName = '';
  private clientVersion = '';
  /**
   * Snapshot generation. Starts at 0; SNAPSHOT increments. Ticks carry the
   * current seq so a client can drop pre-baseline patches (F-071522b2).
   */
  private snapshotSeq = 0;
  /** Withhold `sim/tick` until this session has served SNAPSHOT. */
  private hasSnapshotted = false;
  /** Projection SNAPSHOT and later diffs share, so omitted keys stay omitted. */
  private snapshotView: SnapshotView = {};
  /** Observer sessions cannot SUBMIT_ACTION / ADVANCE / SHUTDOWN / SAVE / LOAD. */
  private sessionWrites = true;
  /** Stable order among sessions sharing this Engine (1-based, connect order). */
  readonly sessionOrder: number;
  private readonly gate: SimGate;

  constructor(
    options: SidecarServerOptions,
    private readonly send: Outbound,
  ) {
    this.engine = options.engine;
    this.engineVersion = options.engineVersion;
    this.serverName = options.serverName ?? '@ai-rpg-engine/sidecar';
    this.advanceRound = options.advanceRound ?? ((engine) => engine.advanceRound(1));
    this.onWorldCommitted = options.onWorldCommitted;
    this.packIntake = options.packIntake;
    this.lastState = structuredClone(this.engine.world) as WorldState;
    for (const e of this.engine.world.eventLog ?? []) this.emitted.add(e.id);
    this.gate = attachSession(this.engine, this);
    this.sessionOrder = this.gate.nextSessionOrder++;
    if (this.gate.closed) this.closed = true;
  }

  get capabilities(): ServerCapabilities {
    // Keep the four v1 flags as the unconditional body so a client that
    // exact-matches initialize.capabilities (c1-sidecar) is not broken by
    // additive negotiation. Extra flags are echoed only when requested.
    const caps: ServerCapabilities = {
      preview: true,
      hashes: true,
      replay: true,
      snapshot: true,
    };
    if (this.clientCapabilities.canonicalHashes) caps.canonicalHashes = true;
    if (this.clientCapabilities.writes !== undefined || this.clientCapabilities.role !== undefined) {
      caps.writes = this.sessionWrites;
    }
    if (this.clientCapabilities.listActions) caps.listActions = true;
    if (this.clientCapabilities.presentation) caps.presentation = true;
    return caps;
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

    // Known methods are request/response. A notification-shaped command (no id)
    // cannot be answered, so it must not mutate. Shutdown is the one
    // fire-and-forget exception — an orderly stop should still run if the id
    // was dropped on a truncated frame.
    if (!hasId && name !== METHODS.SHUTDOWN) {
      process.stderr.write(
        `[sidecar] refusing "${method}" without a request id; methods are request/response.\n`,
      );
      return;
    }

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
        const handshake = this.parseInitializeParams(params);
        if (!handshake.ok) {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, handshake.message);
          return;
        }
        this.initialized = true;
        this.clientName = handshake.clientName;
        this.clientVersion = handshake.clientVersion;
        this.clientCapabilities = handshake.capabilities;
        this.sessionWrites = handshake.capabilities.writes !== false;
        const world = this.engine.world;
        const result: InitializeResult = {
          serverName: this.serverName,
          engineVersion: this.engineVersion,
          capabilities: this.capabilities,
          tick: this.engine.store.tick,
        };
        if (typeof world.meta?.gameId === 'string' && world.meta.gameId.length > 0) {
          result.packId = world.meta.gameId;
        }
        if (typeof world.playerId === 'string' && world.playerId.length > 0) {
          result.playerId = world.playerId;
        }
        if (typeof world.locationId === 'string' && world.locationId.length > 0) {
          result.locationId = world.locationId;
        }
        if (this.packIntake && (this.packIntake.dropped.length > 0 || this.packIntake.advisories.length > 0)) {
          result.packIntake = this.packIntake;
        }
        if (hasId) this.reply(id, result);
        return;
      }

      case METHODS.SNAPSHOT: {
        const view = this.parseSnapshotParams(params);
        if (!view.ok) {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, view.message);
          return;
        }
        this.snapshotView = view.view;
        const state = this.engine.world as WorldState;
        const projected = projectState(state, this.snapshotView);
        // SNAPSHOT is a resync: the next incremental diff must start from this
        // projection, not construct-time lastState (F-98b60cd0) and not from
        // keys the client omitted (F-decfe897).
        this.lastState = structuredClone(projected) as WorldState;
        for (const e of state.eventLog ?? []) this.emitted.add(e.id);
        this.snapshotSeq += 1;
        this.hasSnapshotted = true;
        const result: SnapshotResult = {
          tick: this.engine.store.tick,
          hash: stateHash(projected),
          snapshotSeq: this.snapshotSeq,
          delta: snapshotDelta(projected),
        };
        if (this.clientCapabilities.canonicalHashes) {
          result.canonicalHash = canonicalStateHash(projected);
        }
        if (hasId) this.reply(id, result);
        return;
      }

      case METHODS.SUBMIT_ACTION: {
        if (this.refuseWrites(id, hasId, METHODS.SUBMIT_ACTION)) return;
        const parsed = this.parseActionParams(params);
        if (!parsed.ok) {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, parsed.message);
          return;
        }
        const events =
          parsed.actorId && typeof this.engine.submitActionAs === 'function'
            ? this.engine.submitActionAs(parsed.actorId, parsed.verb, parsed.options)
            : this.engine.submitAction(parsed.verb, parsed.options);
        const result = this.commit(events);
        if (hasId) this.reply(id, result satisfies SubmitActionResult);
        this.pushTick(result);
        this.onWorldCommitted?.();
        return;
      }

      case METHODS.ADVANCE: {
        if (this.refuseWrites(id, hasId, METHODS.ADVANCE)) return;
        if (Object.hasOwn(params, 'rounds') && !isSafeInteger(params.rounds)) {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, '"rounds" must be a safe integer when present.');
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
        if (Object.hasOwn(params, 'limit') && !isSafeInteger(params.limit)) {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, '"limit" must be a safe integer when present.');
          return;
        }
        if (Object.hasOwn(params, 'typePrefix') && typeof params.typePrefix !== 'string') {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, '"typePrefix" must be a string when present.');
          return;
        }
        if (Object.hasOwn(params, 'type') && typeof params.type !== 'string') {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, '"type" must be a string when present.');
          return;
        }
        if (Object.hasOwn(params, 'actorId') && typeof params.actorId !== 'string') {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, '"actorId" must be a string when present.');
          return;
        }
        const fromTick = typeof params.fromTick === 'number' ? params.fromTick : 0;
        const toTick = typeof params.toTick === 'number' ? params.toTick : this.engine.store.tick;
        if (fromTick > toTick) {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, '"fromTick" and "toTick" must be integers, from <= to.');
          return;
        }
        if (typeof params.limit === 'number' && params.limit < 0) {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, '"limit" must be a non-negative integer when present.');
          return;
        }
        const queried = this.queryLog({
          fromTick,
          toTick,
          ...(typeof params.type === 'string' ? { type: params.type } : {}),
          ...(typeof params.typePrefix === 'string' ? { typePrefix: params.typePrefix } : {}),
          ...(typeof params.actorId === 'string' ? { actorId: params.actorId } : {}),
          ...(typeof params.limit === 'number' ? { limit: params.limit } : {}),
        });
        const result: ReplayResult = { fromTick, toTick, events: this.presentWire(queried) };
        if (hasId) this.reply(id, result);
        return;
      }

      case METHODS.LIST_ACTIONS: {
        if (Object.hasOwn(params, 'actorId') && (typeof params.actorId !== 'string' || params.actorId.length === 0)) {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, '"actorId" must be a non-empty string when present.');
          return;
        }
        const actorId =
          typeof params.actorId === 'string' && params.actorId.length > 0
            ? params.actorId
            : (this.engine.world.playerId ?? '');
        const listed =
          typeof this.engine.getAvailableActionsFor === 'function'
            ? this.engine.getAvailableActionsFor(actorId)
            : [];
        const actions: AvailableActionWire[] = listed.map((entry) => {
          const row: AvailableActionWire = { verb: entry.verb, available: entry.available };
          if (entry.reason !== undefined) row.reason = entry.reason;
          if (entry.expansions && entry.expansions.length > 0) {
            row.expansions = entry.expansions.map((exp) => ({
              ...(exp.targetIds ? { targetIds: [...exp.targetIds] } : {}),
              ...(exp.toolId !== undefined ? { toolId: exp.toolId } : {}),
              ...(exp.parameters ? { parameters: { ...exp.parameters } } : {}),
              ...(exp.label !== undefined ? { label: exp.label } : {}),
            }));
          }
          return row;
        });
        const result: ListActionsResult = { actorId, actions };
        if (hasId) this.reply(id, result);
        return;
      }

      case METHODS.SAVE: {
        if (this.refuseWrites(id, hasId, METHODS.SAVE)) return;
        const result: SaveResult = {
          serialized: this.engine.serialize(),
          tick: this.engine.store.tick,
        };
        if (hasId) this.reply(id, result);
        return;
      }

      case METHODS.LOAD: {
        if (this.refuseWrites(id, hasId, METHODS.LOAD)) return;
        if (typeof params.serialized !== 'string' || params.serialized.length === 0) {
          if (hasId) this.fail(id, ERROR_CODES.INVALID_PARAMS, '"serialized" must be a non-empty string.');
          return;
        }
        try {
          this.restoreFromSerialized(params.serialized);
        } catch (err) {
          if (hasId) {
            const message =
              err instanceof SaveLoadError || err instanceof Error ? err.message : String(err);
            this.fail(id, ERROR_CODES.INVALID_PARAMS, `load refused: ${message}`);
          }
          return;
        }
        this.rebaseAllSessions();
        const projected = projectState(this.engine.world, this.snapshotView);
        const result: LoadResult = {
          tick: this.engine.store.tick,
          hash: stateHash(projected as WorldState),
          snapshotSeq: this.snapshotSeq,
        };
        if (this.clientCapabilities.canonicalHashes) {
          result.canonicalHash = canonicalStateHash(projected);
        }
        if (hasId) this.reply(id, result);
        return;
      }

      case METHODS.SHUTDOWN: {
        if (this.refuseWrites(id, hasId, METHODS.SHUTDOWN)) return;
        // Flip the sim-local gate BEFORE engine.shutdown so a sibling
        // handle() cannot submitAction after this session has decided to stop.
        // Engine.shutdown() only teardowns modules; it does not refuse
        // submitAction; the gate is the refusal (F-aca8c299).
        this.closeSharedSim();
        if (hasId) this.reply(id, { ok: true });
        this.fanoutClosing();
        // Unregister every session so a reconnect loop cannot retain lastState
        // clones via the gate (F-f64330ad). Fan-out first, while the set is live.
        this.detachAll();
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
    | { ok: true; verb: string; options: ActionOptions; actorId?: string }
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
    if (Object.hasOwn(params, 'actorId') && (typeof params.actorId !== 'string' || params.actorId.length === 0)) {
      return { ok: false, message: '"actorId" must be a non-empty string when present.' };
    }
    if (Object.hasOwn(params, 'parameters')) {
      if (!isPlainObject(params.parameters)) {
        return { ok: false, message: '"parameters" must be an object when present.' };
      }
      for (const [key, value] of Object.entries(params.parameters)) {
        const t = typeof value;
        if (t !== 'string' && t !== 'number' && t !== 'boolean') {
          return {
            ok: false,
            message: `"parameters.${key}" must be a string, number, or boolean.`,
          };
        }
      }
    }
    return {
      ok: true,
      verb,
      ...(typeof params.actorId === 'string' ? { actorId: params.actorId } : {}),
      options: {
        ...(isStringArray(params.targetIds) ? { targetIds: params.targetIds } : {}),
        ...(typeof params.toolId === 'string' ? { toolId: params.toolId } : {}),
        ...(isPlainObject(params.parameters)
          ? { parameters: params.parameters as Record<string, string | number | boolean> }
          : {}),
      },
    };
  }

  private parseInitializeParams(params: Record<string, unknown>):
    | { ok: true; clientName: string; clientVersion: string; capabilities: ClientCapabilities }
    | { ok: false; message: string } {
    if (Object.hasOwn(params, 'clientName') && (typeof params.clientName !== 'string' || params.clientName.length === 0)) {
      return { ok: false, message: '"clientName" must be a non-empty string when present.' };
    }
    if (
      Object.hasOwn(params, 'clientVersion') &&
      (typeof params.clientVersion !== 'string' || params.clientVersion.length === 0)
    ) {
      return { ok: false, message: '"clientVersion" must be a non-empty string when present.' };
    }
    let capabilities: ClientCapabilities = {};
    if (Object.hasOwn(params, 'capabilities')) {
      if (!isPlainObject(params.capabilities)) {
        return { ok: false, message: '"capabilities" must be an object when present.' };
      }
      for (const key of ['notifications', 'hashes', 'canonicalHashes', 'writes', 'listActions', 'presentation'] as const) {
        if (Object.hasOwn(params.capabilities, key) && typeof params.capabilities[key] !== 'boolean') {
          return { ok: false, message: `"capabilities.${key}" must be a boolean when present.` };
        }
      }
      if (Object.hasOwn(params.capabilities, 'role')) {
        const role = params.capabilities.role;
        if (role !== 'writer' && role !== 'observer') {
          return { ok: false, message: '"capabilities.role" must be "writer" or "observer" when present.' };
        }
      }
      const role = params.capabilities.role as SessionRole | undefined;
      let writes: boolean | undefined =
        typeof params.capabilities.writes === 'boolean' ? params.capabilities.writes : undefined;
      if (role === 'observer') {
        if (writes === true) {
          return { ok: false, message: '"capabilities.role": "observer" conflicts with "capabilities.writes": true.' };
        }
        writes = false;
      } else if (role === 'writer') {
        if (writes === false) {
          return { ok: false, message: '"capabilities.role": "writer" conflicts with "capabilities.writes": false.' };
        }
        writes = true;
      }
      capabilities = {
        ...(typeof params.capabilities.notifications === 'boolean'
          ? { notifications: params.capabilities.notifications }
          : {}),
        ...(typeof params.capabilities.hashes === 'boolean' ? { hashes: params.capabilities.hashes } : {}),
        ...(typeof params.capabilities.canonicalHashes === 'boolean'
          ? { canonicalHashes: params.capabilities.canonicalHashes }
          : {}),
        ...(writes !== undefined ? { writes } : {}),
        ...(role === 'writer' || role === 'observer' ? { role } : {}),
        ...(typeof params.capabilities.listActions === 'boolean'
          ? { listActions: params.capabilities.listActions }
          : {}),
        ...(typeof params.capabilities.presentation === 'boolean'
          ? { presentation: params.capabilities.presentation }
          : {}),
      };
    }
    return {
      ok: true,
      clientName: typeof params.clientName === 'string' ? params.clientName : '',
      clientVersion: typeof params.clientVersion === 'string' ? params.clientVersion : '',
      capabilities,
    };
  }

  private parseSnapshotParams(
    params: Record<string, unknown>,
  ): { ok: true; view: SnapshotView } | { ok: false; message: string } {
    if (Object.hasOwn(params, 'omitEventLog') && typeof params.omitEventLog !== 'boolean') {
      return { ok: false, message: '"omitEventLog" must be a boolean when present.' };
    }
    if (Object.hasOwn(params, 'collections')) {
      if (!isStringArray(params.collections) || params.collections.length === 0) {
        return { ok: false, message: '"collections" must be a non-empty string[] when present.' };
      }
    }
    const view: SnapshotView = {
      ...(typeof params.omitEventLog === 'boolean' ? { omitEventLog: params.omitEventLog } : {}),
      ...(isStringArray(params.collections) ? { collections: params.collections } : {}),
    };
    return { ok: true, view };
  }

  private refuseWrites(id: unknown, hasId: boolean, method: string): boolean {
    if (this.sessionWrites) return false;
    if (hasId) {
      this.fail(
        id,
        ERROR_CODES.CAPABILITY_UNAVAILABLE,
        `"${method}" requires a writer session; this client negotiated capabilities.writes: false (observer).`,
      );
    }
    return true;
  }

  /** Fold newly emitted events into a tick result, deduplicated by event id. */
  private commit(direct: readonly ResolvedEvent[]): SubmitActionResult {
    const log = (this.engine.world.eventLog ?? []) as ResolvedEvent[];
    const freshRaw: ResolvedEvent[] = [];
    for (const e of log) {
      if (this.emitted.has(e.id)) continue;
      this.emitted.add(e.id);
      freshRaw.push(e);
    }
    // `direct` is what submitAction returned. Anything it produced is already in
    // the log, so it is only used as a tie-break when a pack emits outside the
    // log — the dedup by id is what makes re-emission idempotent (GGPO).
    for (const e of direct) {
      if (this.emitted.has(e.id)) continue;
      this.emitted.add(e.id);
      freshRaw.push(e);
    }

    const projected = projectState(this.engine.world, this.snapshotView);
    const delta = diffState(this.lastState, projected);
    this.lastState = structuredClone(projected) as WorldState;

    const result: SubmitActionResult = {
      tick: this.engine.store.tick,
      hash: stateHash(projected),
      events: this.presentWire(freshRaw),
      delta,
      snapshotSeq: this.snapshotSeq,
    };
    if (this.clientCapabilities.canonicalHashes) {
      result.canonicalHash = canonicalStateHash(projected);
    }
    return result;
  }

  private queryLog(query: {
    fromTick: number;
    toTick: number;
    type?: string;
    typePrefix?: string;
    actorId?: string;
    limit?: number;
  }): ResolvedEvent[] {
    if (typeof this.engine.queryEvents === 'function') {
      return this.engine.queryEvents(query);
    }
    const log = (this.engine.world.eventLog ?? []) as ResolvedEvent[];
    const out: ResolvedEvent[] = [];
    for (const event of log) {
      if (event.tick < query.fromTick || event.tick > query.toTick) continue;
      if (query.type !== undefined && event.type !== query.type) continue;
      if (query.typePrefix !== undefined && !event.type.startsWith(query.typePrefix)) continue;
      if (query.actorId !== undefined && event.actorId !== query.actorId) continue;
      out.push(event);
      if (query.limit !== undefined && out.length >= query.limit) break;
    }
    return out;
  }

  /**
   * Raw WireEvent by default (exact-match ticks). Presentation sessions get
   * `engine.presentAll` output; `visibility: 'hidden'` is dropped.
   */
  private presentWire(events: readonly ResolvedEvent[]): WireEvent[] {
    if (!this.clientCapabilities.presentation) {
      return events.map(toWireEvent);
    }
    const visible = events.filter((e) => e.visibility !== 'hidden');
    if (typeof this.engine.presentAll === 'function') {
      return this.engine.presentAll(visible).map(toWireEvent);
    }
    return visible.map(toWireEvent);
  }

  private restoreFromSerialized(serialized: string): void {
    const modules =
      typeof this.engine.moduleManager?.getModules === 'function'
        ? [...this.engine.moduleManager.getModules()]
        : [];
    const loaded = Engine.deserialize(serialized, {
      modules,
      ruleset: this.engine.ruleset,
    });
    const restored = loaded.store;
    (restored as { events: (typeof restored)['events'] }).events = this.engine.store.events;
    (this.engine as { store: typeof restored }).store = restored;
    this.engine.moduleManager.rebindStore(restored);
    (this.engine as unknown as { actionLog: ActionIntent[] }).actionLog = [...loaded.getActionLog()];
  }

  private rebaseAllSessions(): void {
    for (const peer of this.gate.servers) peer.rebaseAfterLoad();
  }

  /**
   * After LOAD: rebuild emitted, lastState, bump snapshotSeq, and push a
   * snapshot-shaped baseline so every live mirror rebases (including omitEventLog).
   */
  rebaseAfterLoad(): void {
    this.emitted.clear();
    for (const e of this.engine.world.eventLog ?? []) this.emitted.add(e.id);
    const projected = projectState(this.engine.world, this.snapshotView);
    this.lastState = structuredClone(projected) as WorldState;
    this.snapshotSeq += 1;
    if (this.closed || this.gate.closed || !this.hasSnapshotted) return;
    const result: SubmitActionResult = {
      tick: this.engine.store.tick,
      hash: stateHash(projected as WorldState),
      events: [],
      delta: snapshotDelta(projected),
      snapshotSeq: this.snapshotSeq,
    };
    if (this.clientCapabilities.canonicalHashes) {
      result.canonicalHash = canonicalStateHash(projected);
    }
    this.pushTick(result);
  }

  /**
   * Socket transport: when two writers share this Engine, batch write methods
   * onto setImmediate and run them in sessionOrder-then-seq, not TCP arrival.
   * In-process `handle()` stays synchronous so existing dualLoopback tests pin
   * call order. One writer (plus any observers) still runs immediately.
   */
  queueWrite(requestId: unknown, run: () => void): void {
    const writers = [...this.gate.servers].filter((s) => s.sessionRole === 'writer' && !s.isClosed).length;
    if (writers <= 1) {
      run();
      return;
    }
    const seq = typeof requestId === 'number' ? requestId : Number.MAX_SAFE_INTEGER;
    this.gate.writePending.push({ sessionOrder: this.sessionOrder, seq, run });
    if (this.gate.writeScheduled) return;
    this.gate.writeScheduled = true;
    setImmediate(() => {
      this.gate.writeScheduled = false;
      const batch = this.gate.writePending.splice(0).sort(
        (a, b) => a.sessionOrder - b.sessionOrder || a.seq - b.seq,
      );
      for (const item of batch) item.run();
    });
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
      peer.outbound({ jsonrpc: '2.0', method: NOTIFICATIONS.CLOSING, params: {} });
    }
  }

  private detachAll(): void {
    for (const peer of [...this.gate.servers]) peer.detach();
  }

  /**
   * Drop this session from the sim-local gate. Socket close and SHUTDOWN
   * fan-out call this so a reconnect loop cannot retain lastState clones.
   */
  detach(): void {
    detachSession(this.engine, this);
  }

  private pushTick(result: SubmitActionResult): void {
    // Fence: never push an incremental tick onto a session that has not
    // applied a SNAPSHOT. The delta would be lastState-at-connect → now,
    // which applied to {} is a partial world (F-071522b2).
    if (this.closed || this.gate.closed || !this.hasSnapshotted) return;
    const notification: TickNotification = {
      tick: result.tick,
      hash: result.hash,
      events: result.events,
      delta: result.delta,
      snapshotSeq: this.snapshotSeq,
    };
    if (result.canonicalHash !== undefined) notification.canonicalHash = result.canonicalHash;
    this.outbound({ jsonrpc: '2.0', method: NOTIFICATIONS.TICK, params: notification });
  }

  /**
   * Catch this session up after another session committed against the shared
   * Engine. Diffs vs this session's lastState so each client gets the delta
   * that matches its own mirror — not the origin's. Withheld until SNAPSHOT.
   */
  replicatePeerCommit(): void {
    if (this.closed || this.gate.closed || !this.initialized || !this.hasSnapshotted) return;
    this.pushTick(this.commit([]));
  }

  private reply(id: unknown, result: unknown): void {
    this.outbound({ jsonrpc: '2.0', id: id as string | number, result }, id);
  }

  private fail(id: unknown, code: number, message: string, data?: unknown): void {
    const error: Record<string, unknown> = { code, message };
    if (data !== undefined) error.data = data;
    this.outbound({ jsonrpc: '2.0', id: id as string | number, error });
  }

  /**
   * Write one outbound frame. If encodeMessage (in the transport) refuses a
   * body above MAX_MESSAGE_BYTES, fail the originating RPC with
   * SNAPSHOT_TOO_LARGE instead of emitting a frame the peer cannot parse.
   */
  private outbound(msg: RpcMessage, requestId?: unknown): void {
    try {
      this.send(msg);
    } catch (err) {
      if (err instanceof MessageTooLargeError) {
        process.stderr.write(`[sidecar] ${err.message}\n`);
        if (requestId !== undefined && requestId !== null && msg.error === undefined) {
          this.send({
            jsonrpc: '2.0',
            id: requestId as string | number,
            error: {
              code: ERROR_CODES.SNAPSHOT_TOO_LARGE,
              message: err.message,
              data: {
                byteLength: err.byteLength,
                retry: { omitEventLog: true },
              },
            },
          });
        }
        return;
      }
      throw err;
    }
  }

  get isClosed(): boolean {
    return this.closed || this.gate.closed;
  }

  /** Exposed for the conformance harness; not part of the wire. */
  get negotiatedClientCapabilities(): ClientCapabilities {
    return this.clientCapabilities;
  }

  /** Present on initialize; used to attribute 1:N attach sessions in logs. */
  get sessionClientName(): string {
    return this.clientName;
  }

  get sessionClientVersion(): string {
    return this.clientVersion;
  }

  /** Writer vs observer, after initialize. Default writer. */
  get sessionRole(): SessionRole {
    return this.sessionWrites ? 'writer' : 'observer';
  }
}
