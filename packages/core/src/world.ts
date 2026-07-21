// World store — state container, entity operations, tick progression

import type {
  WorldState,
  EntityState,
  ZoneState,
  ResolvedEvent,
  PendingEffect,
  GameManifest,
  RulesetDefinition,
  StatDefinition,
  ResourceDefinition,
  ScalarValue,
} from './types.js';
import { SeededRNG } from './rng.js';
import { EventBus, type EventBusListenerErrorHook } from './events.js';
import { validateGameManifest } from './manifest.js';

export type WorldStoreOptions = {
  manifest: GameManifest;
  seed?: number;
  /**
   * Optional ruleset whose stat/resource min/max declarations the store
   * honors in getStat/modifyResource (v2.5 C7). Code, not state — never
   * serialized; supply it again on deserialize (the Engine threads its own
   * `ruleset` option through both paths).
   */
  ruleset?: RulesetDefinition;
  /** Optional hook to observe consumer-listener failures (see EventBus). */
  onListenerError?: EventBusListenerErrorHook;
};

/**
 * Current save-file format version. Stamped onto every new world's
 * `meta.saveVersion`. `WorldStore.deserialize` checks loaded saves against this
 * and runs the migration chain (see SAVE_MIGRATIONS) up to this version.
 */
export const SAVE_VERSION = '1.0.0';

/**
 * Ordered migration chain keyed by the save version the migration upgrades
 * FROM. Each entry mutates/returns a state authored at that version so it is
 * valid at the next version. Applied in sequence until the state reaches
 * SAVE_VERSION. Add an entry here whenever SAVE_VERSION is bumped.
 */
export const SAVE_MIGRATIONS: Record<string, (state: WorldState) => WorldState> = {
  // '0.1.0': (state) => { ...; state.meta.saveVersion = '0.2.0'; return state; },
};

/** Compare two dotted version strings. Returns -1 | 0 | 1 (a vs b). */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

/** Structured error thrown when a save cannot be loaded. */
export type SaveLoadErrorShape = {
  code: 'SAVE_VERSION_UNSUPPORTED' | 'SAVE_MALFORMED';
  message: string;
  hint: string;
};

export class SaveLoadError extends Error {
  readonly code: SaveLoadErrorShape['code'];
  readonly hint: string;
  constructor(shape: SaveLoadErrorShape) {
    super(shape.message);
    this.name = 'SaveLoadError';
    this.code = shape.code;
    this.hint = shape.hint;
  }
}

/** One-word description of a JSON value for error messages. */
function describeJsonValue(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined (missing)';
  if (Array.isArray(v)) return 'an array';
  if (typeof v === 'number' && !Number.isFinite(v)) return 'a non-finite number';
  return `${typeof v}`;
}

/**
 * Validate the meta fields a loaded save feeds back into world construction
 * (gameId/activeRuleset/activeModules → the reconstructed manifest, plus
 * seed/tick → RNG construction and tick progression). Without this, a crafted
 * save with e.g. `activeModules` missing raw-threw the same `[...undefined]`
 * TypeError the manifest validator now guards at the front door (v2.5 C5) —
 * but on the LOAD path it must surface as a SaveLoadError, not a
 * ManifestError, because the bad input is the save file.
 *
 * Runs AFTER the migration chain on both public load paths (WorldStore and
 * Engine deserialize — v2.5 PC-2), so a future SAVE_MIGRATIONS entry may
 * backfill any of these fields for legacy saves before the assert fires.
 */
export function assertSaveMetaShape(meta: unknown): void {
  const m = (meta ?? {}) as Partial<
    Record<'gameId' | 'activeRuleset' | 'activeModules' | 'seed' | 'tick', unknown>
  >;
  const fail = (field: string, expected: string, got: unknown, hint?: string): never => {
    throw new SaveLoadError({
      code: 'SAVE_MALFORMED',
      message: `Save meta.${field} must be ${expected}, got ${describeJsonValue(got)}.`,
      hint: hint ?? 'The save file is corrupt or was not produced by this engine. Restore from a backup.',
    });
  };
  if (typeof m.gameId !== 'string') fail('gameId', 'a string', m.gameId);
  if (typeof m.activeRuleset !== 'string') fail('activeRuleset', 'a string', m.activeRuleset);
  if (!Array.isArray(m.activeModules)) fail('activeModules', 'an array', m.activeModules);
  // seed/tick complete the save-meta validation matrix (v2.5 PC-3), mirroring
  // the rngState guard (C3): engine-produced saves always carry finite numbers
  // here, so a mismatch means a corrupt or foreign save. Unvalidated, a
  // non-numeric tick loads clean and then advanceTick()'s `tick++` produces
  // NaN — which is sticky, so every subsequent event silently carries
  // `tick: NaN`, breaking tick-ordered logic and replay with no signal.
  if (typeof m.seed !== 'number' || !Number.isFinite(m.seed)) {
    fail('seed', 'a finite number', m.seed,
      'Without a numeric seed the RNG cannot be reconstructed deterministically. The save is corrupt or was produced by an incompatible tool. Restore from a backup.');
  }
  if (typeof m.tick !== 'number' || !Number.isFinite(m.tick)) {
    fail('tick', 'a finite number', m.tick,
      'Without a numeric tick, tick progression would silently become NaN for every subsequent event, breaking replay. The save is corrupt or was produced by an incompatible tool. Restore from a backup.');
  }
}

/**
 * Validate the bulk game-state containers a loaded save adopts wholesale
 * (F-71a4c9de). meta, rngState, and saveVersion were each individually guarded
 * with a structured SaveLoadError — but the actual payload (entities, zones,
 * quests, factions, globals, modules, eventLog, pending, playerId, locationId)
 * was adopted via a blind Object.assign with ZERO shape validation, making it
 * the one unguarded boundary in an otherwise consistently-hardened domain.
 *
 * Failure classes this eliminates:
 * - `playerId: 99` (number): JS object keys are strings, so `entities[99]`
 *   silently reads `entities["99"]` — a wrong-player-identity corruption with
 *   no signal if an unrelated entity happens to carry that id.
 * - `entities: null` / `eventLog: "..."`: loads clean, then getEntity() /
 *   recordEvent() raw-throw a bare TypeError far from the actual root cause.
 *
 * Runs AFTER the migration chain (like assertSaveMetaShape — v2.5 PC-2), so a
 * future SAVE_MIGRATIONS entry may backfill containers for legacy saves.
 * Element-level contents are intentionally NOT deep-validated here — this
 * guards the container shapes the engine dereferences unconditionally.
 */
export function assertSaveStateShape(state: WorldState): void {
  const s = state as unknown as Record<string, unknown>;
  const fail = (field: string, expected: string, got: unknown, hint?: string): never => {
    throw new SaveLoadError({
      code: 'SAVE_MALFORMED',
      message: `Save ${field} must be ${expected}, got ${describeJsonValue(got)}.`,
      hint: hint ?? 'The save file is corrupt or was not produced by this engine. Restore from a backup.',
    });
  };
  for (const field of ['entities', 'zones', 'quests', 'factions', 'globals', 'modules'] as const) {
    const v = s[field];
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      fail(field, 'a plain object', v);
    }
  }
  for (const field of ['eventLog', 'pending'] as const) {
    if (!Array.isArray(s[field])) fail(field, 'an array', s[field]);
  }
  if (typeof s.playerId !== 'string') {
    fail('playerId', 'a string', s.playerId,
      'A non-string playerId can silently resolve to a DIFFERENT entity after load (object keys are strings in JS), corrupting player identity with no signal. The save is corrupt or was produced by an incompatible tool.');
  }
  if (typeof s.locationId !== 'string') fail('locationId', 'a string', s.locationId);
  // A non-empty playerId must resolve to an entity present in this save —
  // otherwise every player lookup silently returns undefined downstream.
  // '' is the pre-player constructor default and stays valid (a fresh store
  // serialized before a player entity exists is a legitimate save).
  if (s.playerId !== '' && !((s.playerId as string) in (s.entities as Record<string, unknown>))) {
    throw new SaveLoadError({
      code: 'SAVE_MALFORMED',
      message: `Save playerId "${s.playerId as string}" does not match any entity in the save.`,
      hint: 'The player entity is missing or renamed — the save is corrupt or was edited by hand. Restore from a backup.',
    });
  }
}

/**
 * Run the migration chain to bring a loaded state up to SAVE_VERSION.
 * Throws a structured SaveLoadError if the save is newer than this engine
 * supports, or sits at a version with no migration path forward.
 */
export function migrateSaveState(state: WorldState): WorldState {
  const from = state.meta?.saveVersion ?? '0.0.0';
  // A crafted/corrupt save can carry a non-string saveVersion (number, object,
  // array). compareVersions does `from.split('.')`, which would throw a raw
  // TypeError; surface the documented structured error instead.
  if (typeof from !== 'string') {
    throw new SaveLoadError({
      code: 'SAVE_MALFORMED',
      message: `Save meta.saveVersion must be a string, got ${Array.isArray(from) ? 'array' : typeof from}.`,
      hint: 'The save file is corrupt or was not produced by this engine.',
    });
  }
  const cmp = compareVersions(from, SAVE_VERSION);

  if (cmp === 0) return state;

  if (cmp > 0) {
    throw new SaveLoadError({
      code: 'SAVE_VERSION_UNSUPPORTED',
      message: `Save version ${from} is newer than this engine supports (${SAVE_VERSION}).`,
      hint: `Upgrade @ai-rpg-engine to a build that supports save version ${from} or newer.`,
    });
  }

  // Older save: walk the migration chain forward.
  let current = state;
  let guard = 0;
  while (compareVersions(current.meta.saveVersion ?? '0.0.0', SAVE_VERSION) < 0) {
    const at = current.meta.saveVersion ?? '0.0.0';
    const migrate = SAVE_MIGRATIONS[at];
    if (!migrate) {
      throw new SaveLoadError({
        code: 'SAVE_VERSION_UNSUPPORTED',
        message: `No migration path from save version ${at} to ${SAVE_VERSION}.`,
        hint: `This save predates the current format and cannot be auto-migrated. Start a new game or restore from a compatible build.`,
      });
    }
    current = migrate(current);
    if (++guard > 100) {
      throw new SaveLoadError({
        code: 'SAVE_VERSION_UNSUPPORTED',
        message: `Migration chain for save version ${at} did not converge on ${SAVE_VERSION}.`,
        hint: `A SAVE_MIGRATIONS entry is not advancing meta.saveVersion. This is an engine bug.`,
      });
    }
  }
  return current;
}

export class WorldStore {
  readonly state: WorldState;
  readonly rng: SeededRNG;
  readonly events: EventBus;
  /** Ruleset-declared bounds honored by getStat/modifyResource (C7). Derived
   *  from code (the ruleset option), so never serialized — like modules, the
   *  caller supplies the ruleset again on deserialize. */
  private readonly statBounds: ReadonlyMap<string, StatDefinition>;
  private readonly resourceBounds: ReadonlyMap<string, ResourceDefinition>;

  constructor(options: WorldStoreOptions) {
    // Fail loud + structured on a malformed manifest before any field is
    // consumed (v2.5 C5) — previously `[...options.manifest.modules]` below
    // raw-threw a bare TypeError for a manifest missing `modules`.
    validateGameManifest(options.manifest);

    const seed = options.seed ?? 0;
    this.rng = new SeededRNG(seed);
    this.events = new EventBus({ onListenerError: options.onListenerError });
    this.statBounds = new Map((options.ruleset?.stats ?? []).map((s) => [s.id, s]));
    this.resourceBounds = new Map((options.ruleset?.resources ?? []).map((r) => [r.id, r]));

    this.state = {
      meta: {
        // Deterministic per-instance id generation. idCounter is set first so
        // genId() can mint worldId from the same per-instance sequence.
        worldId: '',
        gameId: options.manifest.id,
        saveVersion: SAVE_VERSION,
        tick: 0,
        seed,
        activeRuleset: options.manifest.ruleset,
        activeModules: [...options.manifest.modules],
        idCounter: 0,
      },
      playerId: '',
      locationId: '',
      entities: {},
      zones: {},
      quests: {},
      factions: {},
      globals: {},
      modules: {},
      eventLog: [],
      pending: [],
    };

    this.state.meta.worldId = this.genId('world');
  }

  /**
   * Mint a deterministic id from this world's per-instance counter.
   * The counter lives in serialized state, so two engines with the same seed
   * and action sequence produce byte-identical ids, and a save/load resumes the
   * sequence without colliding with ids already in the eventLog.
   */
  genId(prefix: string): string {
    return `${prefix}_${(++this.state.meta.idCounter).toString(36)}`;
  }

  // --- Entity operations ---

  /**
   * Ingest an entity. The store owns its state: the argument is detached
   * (structuredClone) at ingestion, so mutating the argument after the call
   * never reaches the store, and store mutations never reach the caller's
   * object. Root-cause fix for the F-71ec5dcd cross-instance bleed class —
   * content constants fed to multiple stores no longer alias nested state.
   * Re-adding an id still replaces (last definition wins).
   */
  addEntity(entity: EntityState): void {
    this.state.entities[entity.id] = structuredClone(entity);
  }

  getEntity(id: string): EntityState | undefined {
    return this.state.entities[id];
  }

  removeEntity(id: string): void {
    delete this.state.entities[id];
  }

  /** Get all entities in a zone */
  entitiesInZone(zoneId: string): EntityState[] {
    return Object.values(this.state.entities).filter(e => e.zoneId === zoneId);
  }

  /** Get all entities matching a tag */
  entitiesByTag(tag: string): EntityState[] {
    return Object.values(this.state.entities).filter(e => e.tags.includes(tag));
  }

  // --- Zone operations ---

  /**
   * Ingest a zone. Same ownership contract as addEntity: the argument is
   * detached (structuredClone) at ingestion — neither side sees the other's
   * later mutations (F-71ec5dcd). Re-adding an id still replaces.
   */
  addZone(zone: ZoneState): void {
    this.state.zones[zone.id] = structuredClone(zone);
  }

  getZone(id: string): ZoneState | undefined {
    return this.state.zones[id];
  }

  // --- Resource operations ---

  getResource(entityId: string, resourceId: string): number {
    return this.state.entities[entityId]?.resources[resourceId] ?? 0;
  }

  modifyResource(entityId: string, resourceId: string, delta: number): number {
    const entity = this.state.entities[entityId];
    if (!entity) return 0;
    const current = entity.resources[resourceId] ?? 0;
    // Clamp into the ruleset-declared range when this store was built with a
    // ruleset that bounds the resource (v2.5 C7 — there was no upper clamp).
    // Without a ruleset, or for a resource the ruleset does not declare, the
    // legacy contract is preserved exactly: floor at 0, open ceiling.
    const def = this.resourceBounds.get(resourceId);
    const min = def?.min ?? 0;
    const max = def?.max ?? Number.POSITIVE_INFINITY;
    const newValue = Math.min(max, Math.max(min, current + delta));
    entity.resources[resourceId] = newValue;
    return newValue;
  }

  // --- Stat operations ---

  getStat(entityId: string, statId: string): number {
    const entity = this.state.entities[entityId];
    if (!entity) return 0;
    const value = entity.stats[statId] ?? 0;
    // Honor ruleset stat bounds when declared (v2.5 C7 — bounds were ignored
    // and `value` was a dead intermediate). Undeclared stats, declared stats
    // without min/max, and stores built without a ruleset return the raw
    // value unchanged.
    const def = this.statBounds.get(statId);
    if (!def) return value;
    const min = def.min ?? Number.NEGATIVE_INFINITY;
    const max = def.max ?? Number.POSITIVE_INFINITY;
    return Math.min(max, Math.max(min, value));
  }

  // --- Global state ---

  getGlobal(key: string): ScalarValue | undefined {
    return this.state.globals[key];
  }

  setGlobal(key: string, value: ScalarValue): void {
    this.state.globals[key] = value;
  }

  // --- Module state ---

  getModuleState<T = unknown>(moduleId: string): T | undefined {
    return this.state.modules[moduleId] as T | undefined;
  }

  setModuleState(moduleId: string, state: unknown): void {
    this.state.modules[moduleId] = state;
  }

  // --- Event operations ---

  recordEvent(event: ResolvedEvent): void {
    // Single choke point for event-id assignment. Events arriving without an id
    // (the makeEvent path stamps id: '') get a deterministic id from this
    // world's per-instance counter. This is what keeps event ids byte-identical
    // across two engines with the same seed + action sequence.
    if (!event.id) event.id = this.genId('evt');
    this.state.eventLog.push(event);
    this.events.emit(event, this.state);
  }

  /** Create and record an event */
  emitEvent(
    type: string,
    payload: Record<string, unknown>,
    options?: Partial<Pick<ResolvedEvent, 'actorId' | 'targetIds' | 'tags' | 'visibility' | 'presentation' | 'causedBy'>>
  ): ResolvedEvent {
    const event: ResolvedEvent = {
      id: this.genId('evt'),
      tick: this.state.meta.tick,
      type,
      payload,
      ...options,
    };
    this.recordEvent(event);
    return event;
  }

  // --- Pending effects ---

  addPending(effect: Omit<PendingEffect, 'id'>): PendingEffect {
    const pending: PendingEffect = { id: this.genId('pend'), ...effect };
    this.state.pending.push(pending);
    return pending;
  }

  /** Process all pending effects due at or before current tick */
  processPending(): PendingEffect[] {
    const tick = this.state.meta.tick;
    const due = this.state.pending.filter(p => p.executeAtTick <= tick);
    this.state.pending = this.state.pending.filter(p => p.executeAtTick > tick);
    return due;
  }

  // --- Tick ---

  advanceTick(): number {
    this.state.meta.tick++;
    return this.state.meta.tick;
  }

  get tick(): number {
    return this.state.meta.tick;
  }

  // --- Player location ---

  get playerLocation(): string {
    return this.state.locationId;
  }

  setPlayerLocation(zoneId: string): void {
    this.state.locationId = zoneId;
    const entity = this.state.entities[this.state.playerId];
    if (entity) {
      entity.zoneId = zoneId;
    }
  }

  // --- Serialization ---

  serialize(): string {
    return JSON.stringify({
      state: this.state,
      rngState: this.rng.getState(),
    });
  }

  static deserialize(json: string, eventBus?: EventBus, ruleset?: RulesetDefinition): WorldStore {
    let data: { state: WorldState; rngState: number };
    try {
      data = JSON.parse(json) as { state: WorldState; rngState: number };
    } catch {
      throw new SaveLoadError({
        code: 'SAVE_MALFORMED',
        message: 'Save file is not valid JSON.',
        hint: 'The save may be truncated or corrupted. Restore from a backup.',
      });
    }
    if (!data || typeof data !== 'object' || !data.state || !data.state.meta) {
      throw new SaveLoadError({
        code: 'SAVE_MALFORMED',
        message: 'Save file is missing required world state.',
        hint: 'Expected an object with { state: { meta, ... }, rngState }.',
      });
    }

    // A malformed/foreign save with a missing or non-numeric rngState would
    // otherwise slip through setState() and silently coerce the RNG stream to
    // the seed-0 position on the first draw (`undefined | 0 === 0`) — a
    // determinism corruption with no signal (v2.5 C3). Engine-produced saves
    // always carry a finite number here.
    if (typeof data.rngState !== 'number' || !Number.isFinite(data.rngState)) {
      throw new SaveLoadError({
        code: 'SAVE_MALFORMED',
        message: `Save rngState must be a finite number, got ${describeJsonValue(data.rngState)}.`,
        hint: 'Without a valid rngState the RNG would silently restart from the seed position, breaking replay determinism. The save is corrupt or was produced by an incompatible tool.',
      });
    }

    // Honor the save-version contract: check + migrate before adopting state.
    const migratedState = migrateSaveState(data.state);

    // Guard the meta fields fed back into construction AFTER migration, so a
    // future migration may backfill them for legacy saves (v2.5 C5 family).
    assertSaveMetaShape(migratedState.meta);

    // Guard the bulk state containers adopted below via Object.assign
    // (F-71a4c9de) — same post-migration placement, same structured
    // SaveLoadError contract as the meta guard above.
    assertSaveStateShape(migratedState);

    const manifest: GameManifest = {
      id: migratedState.meta.gameId,
      title: '',
      version: '',
      engineVersion: '0.1.0',
      ruleset: migratedState.meta.activeRuleset,
      modules: migratedState.meta.activeModules,
      contentPacks: [],
    };
    const store = new WorldStore({ manifest, seed: migratedState.meta.seed, ruleset });
    Object.assign(store.state, migratedState);

    // idCounter rides along in meta via the Object.assign above. Back-compat:
    // a legacy save predating the field would resume at 0 and collide with ids
    // already in the eventLog — backfill from the highest counter seen.
    if (typeof store.state.meta.idCounter !== 'number') {
      store.state.meta.idCounter = highestIdCounter(store.state);
    }

    store.rng.setState(data.rngState);
    if (eventBus) {
      (store as { events: EventBus }).events = eventBus;
    }
    return store;
  }
}

/**
 * Recover the highest counter value embedded in existing ids (format
 * `${prefix}_${base36}`). Used only to backfill meta.idCounter for legacy saves
 * that predate the field, so a reloaded game never re-mints a colliding id.
 */
function highestIdCounter(state: WorldState): number {
  let max = 0;
  const consider = (id: string | undefined): void => {
    if (!id) return;
    const underscore = id.lastIndexOf('_');
    if (underscore === -1) return;
    const n = parseInt(id.slice(underscore + 1), 36);
    if (Number.isFinite(n) && n > max) max = n;
  };
  consider(state.meta.worldId);
  for (const e of state.eventLog) consider(e.id);
  for (const p of state.pending) consider(p.id);
  for (const id of Object.keys(state.entities)) consider(id);
  return max;
}
