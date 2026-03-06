// Module test harness — create a minimal engine for focused module testing

import type {
  EngineModule,
  EntityState,
  ZoneState,
  GameManifest,
  ResolvedEvent,
} from './types.js';
import { Engine } from './engine.js';

export type HarnessOptions = {
  modules: EngineModule[];
  entities?: EntityState[];
  zones?: ZoneState[];
  playerId?: string;
  startZone?: string;
  seed?: number;
  globals?: Record<string, string | number | boolean>;
};

export type TestEngine = Engine & {
  /** Get all events emitted since the last call (or since creation) */
  drainEvents(): ResolvedEvent[];
  /** Get the player entity */
  player(): EntityState;
  /** Get an entity by id */
  entity(id: string): EntityState;
  /** Get the current zone */
  currentZone(): ZoneState;
};

const defaultManifest: GameManifest = {
  id: 'test-harness',
  title: 'Test Harness',
  version: '0.0.0',
  engineVersion: '0.1.0',
  ruleset: 'test',
  modules: [],
  contentPacks: [],
};

export function createTestEngine(options: HarnessOptions): TestEngine {
  const engine = new Engine({
    manifest: { ...defaultManifest, modules: options.modules.map((m) => m.id) },
    seed: options.seed ?? 1,
    modules: options.modules,
  });

  // Add zones
  for (const zone of options.zones ?? []) {
    engine.store.addZone(zone);
  }

  // Add entities
  for (const entity of options.entities ?? []) {
    engine.store.addEntity({ ...entity });
  }

  // Set player
  const playerId = options.playerId ?? (options.entities?.[0]?.id ?? 'player');
  engine.store.state.playerId = playerId;
  engine.store.state.locationId = options.startZone ?? (options.zones?.[0]?.id ?? 'default');

  // Set globals
  if (options.globals) {
    for (const [k, v] of Object.entries(options.globals)) {
      engine.store.state.globals[k] = v;
    }
  }

  // Event drain
  const collectedEvents: ResolvedEvent[] = [];
  engine.store.events.onAny((event) => {
    collectedEvents.push(event);
  });

  const testEngine = engine as TestEngine;

  testEngine.drainEvents = () => {
    const events = [...collectedEvents];
    collectedEvents.length = 0;
    return events;
  };

  testEngine.player = () => {
    const p = engine.store.state.entities[playerId];
    if (!p) throw new Error(`Player "${playerId}" not found`);
    return p;
  };

  testEngine.entity = (id: string) => {
    const e = engine.store.state.entities[id];
    if (!e) throw new Error(`Entity "${id}" not found`);
    return e;
  };

  testEngine.currentZone = () => {
    const z = engine.store.state.zones[engine.store.state.locationId];
    if (!z) throw new Error(`Zone "${engine.store.state.locationId}" not found`);
    return z;
  };

  return testEngine;
}
