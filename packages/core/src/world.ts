// World store — state container, entity operations, tick progression

import type {
  WorldState,
  EntityState,
  ZoneState,
  ResolvedEvent,
  PendingEffect,
  AppliedStatus,
  GameManifest,
  ScalarValue,
} from './types.js';
import { SeededRNG } from './rng.js';
import { EventBus } from './events.js';
import { nextId } from './id.js';

export type WorldStoreOptions = {
  manifest: GameManifest;
  seed?: number;
};

export class WorldStore {
  readonly state: WorldState;
  readonly rng: SeededRNG;
  readonly events: EventBus;

  constructor(options: WorldStoreOptions) {
    const seed = options.seed ?? Date.now();
    this.rng = new SeededRNG(seed);
    this.events = new EventBus();

    this.state = {
      meta: {
        worldId: nextId('world'),
        gameId: options.manifest.id,
        saveVersion: '0.1.0',
        tick: 0,
        seed,
        activeRuleset: options.manifest.ruleset,
        activeModules: [...options.manifest.modules],
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

    // Apply status modifiers
    for (const status of entity.statuses) {
      // Status modifiers will be resolved by status-core module
      // Core just provides the base value
      void status;
    }

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
      id: nextId('evt'),
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
    const pending: PendingEffect = { id: nextId('pend'), ...effect };
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
    const data = JSON.parse(json) as { state: WorldState; rngState: number };
    const manifest: GameManifest = {
      id: data.state.meta.gameId,
      title: '',
      version: '',
      engineVersion: '0.1.0',
      ruleset: data.state.meta.activeRuleset,
      modules: data.state.meta.activeModules,
      contentPacks: [],
    };
    const store = new WorldStore({ manifest, seed: data.state.meta.seed });
    Object.assign(store.state, data.state);
    store.rng.setState(data.rngState);
    if (eventBus) {
      (store as { events: EventBus }).events = eventBus;
    }
    return store;
  }
}
