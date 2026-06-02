// World store — state container, entity operations, tick progression

import type {
  WorldState,
  EntityState,
  ZoneState,
  ResolvedEvent,
  PendingEffect,
  GameManifest,
  ScalarValue,
} from './types.js';
import { SeededRNG } from './rng.js';
import { EventBus, type EventBusListenerErrorHook } from './events.js';

export type WorldStoreOptions = {
  manifest: GameManifest;
  seed?: number;
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

  constructor(options: WorldStoreOptions) {
    const seed = options.seed ?? 0;
    this.rng = new SeededRNG(seed);
    this.events = new EventBus({ onListenerError: options.onListenerError });

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

  addEntity(entity: EntityState): void {
    this.state.entities[entity.id] = entity;
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

  addZone(zone: ZoneState): void {
    this.state.zones[zone.id] = zone;
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
    const newValue = Math.max(0, current + delta);
    entity.resources[resourceId] = newValue;
    return newValue;
  }

  // --- Stat operations ---

  getStat(entityId: string, statId: string): number {
    const entity = this.state.entities[entityId];
    if (!entity) return 0;
    const base = entity.stats[statId] ?? 0;

    return base;
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

  static deserialize(json: string, eventBus?: EventBus): WorldStore {
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

    // Honor the save-version contract: check + migrate before adopting state.
    const migratedState = migrateSaveState(data.state);

    const manifest: GameManifest = {
      id: migratedState.meta.gameId,
      title: '',
      version: '',
      engineVersion: '0.1.0',
      ruleset: migratedState.meta.activeRuleset,
      modules: migratedState.meta.activeModules,
      contentPacks: [],
    };
    const store = new WorldStore({ manifest, seed: migratedState.meta.seed });
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
