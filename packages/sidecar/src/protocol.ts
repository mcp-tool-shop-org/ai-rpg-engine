// protocol.ts — the wire contract between the authoritative sim and any client.
//
// Charter §3 (RG-A, binding) is the shape: commands in, events out; a hard
// boundary; per-tick state hashes; idempotent presentation keyed to tick ids;
// the sim is NEVER ported. RG-C1 Lane 4 supplies the transport decisions:
//
//   - LSP (Microsoft, 2016→): one authoritative server per N clients, JSON-RPC,
//     an `initialize` handshake exchanging CAPABILITIES so partial
//     implementations interoperate.
//   - DAP (2017→): capabilities INSTEAD of protocol version numbers; launch
//     (spawn over stdio) and attach (connect to a running process) both
//     first-class.
//   - matklad (rust-analyzer lead, 2023): LSP's core defect is serving DERIVED
//     state as request/response with ambiguous causality. The fix is tick-stamped
//     server PUSH — which is exactly the shape the engine's event stream already
//     has.
//   - Screeps: clients never gate tick advancement. Events are notifications.
//   - Quake 3 (Sanglard, 2012): a snapshot is a delta from an EMPTY baseline over
//     the same serializer as incremental updates. One code path.
//   - protobuf practice: additive-only evolution, with a reserved graveyard so a
//     removed field's name can never be recycled with a new meaning.
//   - RFC 9413 (IETF, 2023), applied ASYMMETRICALLY: strict commands IN, tolerant
//     additive events OUT. A silently dropped command field is a divergent
//     simulation — the one failure a deterministic core cannot absorb. A client
//     that ignores an event field it does not know loses nothing.

// --- Methods (client → server, request/response) --------------------------

/**
 * Every method this protocol accepts. The list is CLOSED — an unknown method is
 * refused with `METHOD_NOT_FOUND`, never ignored.
 */
export const METHODS = {
  /** Capability handshake. Must be first; every other method fails before it. */
  INITIALIZE: 'initialize',
  /** Full world state, as a delta from empty. */
  SNAPSHOT: 'snapshot',
  /** Submit a player intent. The sim validates; the client never decides. */
  SUBMIT_ACTION: 'submitAction',
  /** Advance the world one round without a player action. */
  ADVANCE: 'advance',
  /** Side-effect-free: run on a state copy, return the events, discard. */
  PREVIEW: 'preview',
  /** Re-emit a closed tick window. Idempotent by (tick, event id). */
  REPLAY: 'replay',
  /** Orderly stop. */
  SHUTDOWN: 'shutdown',
} as const;

export type MethodName = (typeof METHODS)[keyof typeof METHODS];

export const ALL_METHODS: readonly MethodName[] = Object.values(METHODS);

/**
 * The parameter fields each method accepts, exactly.
 *
 * Strict-in is enforced against THIS table: a field not listed here is refused
 * with `INVALID_PARAMS` naming the offending field. Tolerating an unknown
 * command field would mean accepting an intent whose meaning the server does not
 * share with the client — a divergence the sim cannot detect and cannot undo.
 */
export const METHOD_PARAMS: Record<MethodName, readonly string[]> = {
  [METHODS.INITIALIZE]: ['clientName', 'clientVersion', 'capabilities'],
  [METHODS.SNAPSHOT]: ['omitEventLog', 'collections'],
  [METHODS.SUBMIT_ACTION]: ['verb', 'targetIds', 'toolId', 'parameters'],
  [METHODS.ADVANCE]: ['rounds'],
  [METHODS.PREVIEW]: ['verb', 'targetIds', 'toolId', 'parameters'],
  [METHODS.REPLAY]: ['fromTick', 'toTick'],
  [METHODS.SHUTDOWN]: [],
};

/** Optional SNAPSHOT window. Same serializer, possibly projected baseline. */
export type SnapshotParams = {
  /**
   * Drop `eventLog` from the delta. Clients already have `replay` for
   * presentation; omitting the log is how a long session stays under the
   * 16 MiB frame ceiling.
   */
  omitEventLog?: boolean;
  /**
   * Restrict the snapshot (and this session's subsequent incremental diffs)
   * to these top-level WorldState keys, e.g. `['entities', 'zones']`.
   */
  collections?: string[];
};

/** How a session projects the world onto the wire after SNAPSHOT. */
export type SnapshotView = {
  omitEventLog?: boolean;
  collections?: readonly string[];
};

/** Session mutation role. Observers receive ticks; they do not command. */
export type SessionRole = 'writer' | 'observer';

// --- Notifications (server → client, push) --------------------------------

export const NOTIFICATIONS = {
  /**
   * One advanced tick: what happened, and the state hash after it.
   *
   * A NOTIFICATION, never a response, and never solicited by a request for
   * derived state (matklad). The client cannot gate tick advancement (Screeps).
   */
  TICK: 'sim/tick',
  /** The server is going away. */
  CLOSING: 'sim/closing',
} as const;

export type NotificationName = (typeof NOTIFICATIONS)[keyof typeof NOTIFICATIONS];

// --- Capabilities ---------------------------------------------------------

/**
 * What each side can do. DAP's lesson: capabilities, not a protocol version
 * number. A partial client and a fuller server interoperate without either
 * bumping a number, and adding a capability never invalidates an old client.
 */
export type ServerCapabilities = {
  /** `preview` is available (side-effect-free command evaluation). */
  preview: boolean;
  /** Tick notifications carry a state hash. */
  hashes: boolean;
  /** `replay` is available (idempotent re-emission of a closed tick window). */
  replay: boolean;
  /** `snapshot` is available. */
  snapshot: boolean;
  /**
   * Echoed when the client requested `canonicalHashes`. The JS `hash` is
   * unchanged; `canonicalHash` is additive.
   */
  canonicalHashes?: boolean;
  /**
   * Echoed when the client negotiated `writes` or `role`. `false` means this
   * session is an observer: snapshot/replay/preview/ticks only.
   */
  writes?: boolean;
};

export type ClientCapabilities = {
  /** The client can accept `sim/tick` notifications. */
  notifications?: boolean;
  /** The client verifies per-tick hashes and reports staleness. */
  hashes?: boolean;
  /**
   * Request the capability-negotiated canonical hash (sorted keys, integers
   * stay integers). Never a replacement for `hashes` / `hash`.
   */
  canonicalHashes?: boolean;
  /**
   * `false` = observer. Omitted defaults to writer so existing clients keep
   * commanding. `role: 'observer'` is the same switch.
   */
  writes?: boolean;
  /** Explicit session role; `observer` forces `writes: false`. */
  role?: SessionRole;
};

export type InitializeResult = {
  serverName: string;
  /** The engine's version — informational. Compatibility is by capability. */
  engineVersion: string;
  capabilities: ServerCapabilities;
  /** The tick the world is at right now. */
  tick: number;
};

// --- Errors ---------------------------------------------------------------

/** JSON-RPC 2.0 reserved codes, plus this protocol's own above -32000. */
export const ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  /** A method arrived before `initialize`. */
  NOT_INITIALIZED: -32000,
  /** `initialize` arrived twice. */
  ALREADY_INITIALIZED: -32001,
  /** The method exists but this server does not advertise the capability. */
  CAPABILITY_UNAVAILABLE: -32002,
  /** The sim refused the intent (an ordinary game outcome, not a wire fault). */
  ACTION_REJECTED: -32003,
  /** The session has shut down; further methods are refused. */
  SESSION_CLOSED: -32004,
  /**
   * An outbound snapshot or tick exceeded `MAX_MESSAGE_BYTES`. The frame is
   * not written — a peer that received it could not parse it.
   */
  SNAPSHOT_TOO_LARGE: -32005,
} as const;

// --- The reserved graveyard ----------------------------------------------

/**
 * Field names that have been REMOVED from this protocol and must never be
 * reused with a different meaning (protobuf's reserved practice).
 *
 * Empty at v1 — that is the point. It is started on day one, because a graveyard
 * added after the first removal is a graveyard missing its first occupant, and
 * the whole value of the thing is that it is never incomplete.
 *
 * Recycling a name is uniquely nasty across a process boundary: an old client
 * and a new server both accept the field and disagree about what it means, with
 * no version mismatch to catch it.
 */
export const RESERVED_FIELD_NAMES: readonly string[] = [];

/** Re-export the framed JSON-RPC envelope so tests/clients import one module. */
export type { RpcMessage } from './framing.js';

/**
 * Assert a field name is not a recycled tombstone. Called by the server when
 * building outbound payloads, so a mistake fails in this repo's tests rather
 * than in a client's rendering.
 */
export function assertNotReserved(name: string): void {
  if (RESERVED_FIELD_NAMES.includes(name)) {
    throw new Error(
      `Protocol field "${name}" is reserved: it was removed from a previous version and must not be reused. ` +
        'Pick a new name. Recycling a field name means an old client and a new server can both accept it and ' +
        'disagree about what it means, with no version mismatch to catch it.',
    );
  }
}

// --- Payload shapes -------------------------------------------------------

/**
 * One advanced tick, pushed to every client.
 *
 * `hash` is the per-tick state hash (charter §3.3, AoE/SupCom): clients DETECT
 * staleness and never correct the sim.
 */
export type TickNotification = {
  tick: number;
  hash: string;
  /**
   * Canonical cross-language hash. Present only when this session requested
   * `capabilities.canonicalHashes`.
   */
  canonicalHash?: string;
  /**
   * Snapshot generation. Ticks with `snapshotSeq` less than the last applied
   * snapshot are pre-baseline and must be dropped.
   */
  snapshotSeq?: number;
  /** Events resolved during this tick, in emission order. */
  events: WireEvent[];
  /** State changes since the previous tick, same serializer as `snapshot`. */
  delta: StatePatch[];
};

/**
 * A `ResolvedEvent` as it crosses the boundary.
 *
 * Numbers are QUANTIZED on the way out (charter §3.2, Overwatch) so a process
 * boundary cannot introduce float drift between the sim's value and the client's.
 */
export type WireEvent = {
  id: string;
  tick: number;
  type: string;
  actorId?: string;
  targetIds?: string[];
  payload: Record<string, unknown>;
  tags?: string[];
  visibility?: string;
  presentation?: Record<string, unknown>;
  causedBy?: string;
};

/** One state change. `remove` carries no value; `set` carries the new one. */
export type StatePatch =
  | { op: 'set'; path: readonly (string | number)[]; value: unknown }
  | { op: 'remove'; path: readonly (string | number)[] };

export type SnapshotResult = {
  tick: number;
  hash: string;
  /** Canonical hash; present only when `capabilities.canonicalHashes`. */
  canonicalHash?: string;
  /** Snapshot generation; ticks with a lower seq are pre-baseline. */
  snapshotSeq: number;
  /** The whole world (or a projection), as a delta from an EMPTY baseline. */
  delta: StatePatch[];
};

export type SubmitActionResult = {
  tick: number;
  hash: string;
  canonicalHash?: string;
  snapshotSeq?: number;
  events: WireEvent[];
  delta: StatePatch[];
};

export type PreviewResult = {
  /** The tick the preview ran FROM. The world is unchanged at this tick. */
  tick: number;
  /** The hash BEFORE, which must equal the hash after — proven, not asserted. */
  hash: string;
  events: WireEvent[];
};

export type ReplayResult = {
  fromTick: number;
  toTick: number;
  events: WireEvent[];
};
