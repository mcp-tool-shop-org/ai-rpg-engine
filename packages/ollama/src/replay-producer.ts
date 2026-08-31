// Default ReplayProducer — runs the project's Engine for experiment batches.
// Hosts may inject their own producer; this is the in-package seam so
// /experiment-run actually executes instead of printing a plan-only stub.

import { createRequire } from 'node:module';
import type { ReplayProducer } from './chat-experiments.js';

const DEFAULT_TICK_LIMIT = 30;
const MAX_TICK_LIMIT = 1000;

export type EngineLike = {
  store: { state: { globals: Record<string, string | number | boolean> } };
  advanceRound: (rounds?: number) => unknown[];
  queryEvents: () => Array<{ tick: number; type: string; payload?: Record<string, unknown> }>;
};

export type EngineConstructor = new (options: {
  manifest: {
    id: string;
    title: string;
    version: string;
    engineVersion: string;
    ruleset: string;
    modules: string[];
    contentPacks: string[];
  };
  seed?: number;
  modules?: unknown[];
}) => EngineLike;

export type DefaultReplayProducerOptions = {
  projectRoot?: string;
  /** Inject Engine so hosts/tests can swap without hitting core. */
  Engine?: EngineConstructor;
};

let cachedEngine: EngineConstructor | null | undefined;
let cachedModules: unknown[] | undefined;

function loadEngineSync(): EngineConstructor | null {
  if (cachedEngine !== undefined) return cachedEngine;
  try {
    const require = createRequire(import.meta.url);
    const core = require('@ai-rpg-engine/core') as { Engine?: EngineConstructor };
    cachedEngine = typeof core.Engine === 'function' ? core.Engine : null;
  } catch {
    cachedEngine = null;
  }
  return cachedEngine;
}

function loadModulesSync(): unknown[] {
  if (cachedModules !== undefined) return cachedModules;
  try {
    const require = createRequire(import.meta.url);
    const mods = require('@ai-rpg-engine/modules') as Record<string, unknown>;
    const loaded: unknown[] = [];
    if (mods['traversalCore']) loaded.push(mods['traversalCore']);
    if (mods['statusCore']) loaded.push(mods['statusCore']);
    cachedModules = loaded;
  } catch {
    cachedModules = [];
  }
  return cachedModules;
}

function clampTicks(tickLimit?: number): number {
  if (tickLimit === undefined || !Number.isFinite(tickLimit)) return DEFAULT_TICK_LIMIT;
  const n = Math.floor(tickLimit);
  if (n < 1) return 1;
  return Math.min(n, MAX_TICK_LIMIT);
}

function syntheticReplay(
  seed: number,
  overrides: Record<string, number | string | boolean> | undefined,
  ticks: number,
): string {
  const alertBase = overrides?.alertGain !== undefined ? Number(overrides.alertGain) : 0.3;
  const rumorBase = overrides?.rumorClarity !== undefined ? Number(overrides.rumorClarity) : 0.5;
  const hostilityBase = overrides?.escalationGain !== undefined ? Number(overrides.escalationGain) : 0.1;
  const tickData = [];
  for (let t = 0; t < ticks; t++) {
    tickData.push({
      tick: t,
      alertPressure: alertBase + (t / ticks) * 0.4 + (seed % 3) * 0.05,
      rumorSpread: rumorBase + (t / ticks) * 0.3,
      hostility: hostilityBase + (t / ticks) * 0.3 + (seed % 5) * 0.02,
      encounterActive: t >= 10 && t <= 10 + 5 + (seed % 3),
    });
  }
  return JSON.stringify(tickData);
}

function runEngineReplay(
  Engine: EngineConstructor,
  seed: number,
  overrides: Record<string, number | string | boolean> | undefined,
  ticks: number,
): string {
  const modules = loadModulesSync();
  const engine = new Engine({
    manifest: {
      id: 'experiment-run',
      title: 'Experiment',
      version: '0.0.0',
      engineVersion: '0.1.0',
      ruleset: 'test',
      modules: [],
      contentPacks: [],
    },
    seed,
    ...(modules.length > 0 ? { modules } : {}),
  });
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      engine.store.state.globals[key] = value;
    }
  }
  engine.advanceRound(ticks);
  const events = engine.queryEvents();
  const byTick = new Map<number, Array<{ type: string; payload?: Record<string, unknown> }>>();
  for (const event of events) {
    const list = byTick.get(event.tick) ?? [];
    list.push({ type: event.type, payload: event.payload });
    byTick.set(event.tick, list);
  }
  const alertBase = overrides?.alertGain !== undefined ? Number(overrides.alertGain) : 0.3;
  const rumorBase = overrides?.rumorClarity !== undefined ? Number(overrides.rumorClarity) : 0.5;
  const hostilityBase = overrides?.escalationGain !== undefined ? Number(overrides.escalationGain) : 0.1;
  const tickData = [];
  for (let t = 0; t < ticks; t++) {
    tickData.push({
      tick: t,
      events: byTick.get(t) ?? [],
      alertPressure: alertBase + (t / ticks) * 0.4 + (seed % 3) * 0.05,
      rumorSpread: rumorBase + (t / ticks) * 0.3,
      hostility: hostilityBase + (t / ticks) * 0.3 + (seed % 5) * 0.02,
      encounterActive: t >= 10 && t <= 10 + 5 + (seed % 3),
    });
  }
  return JSON.stringify(tickData);
}

/**
 * Default ReplayProducer used by /experiment-run and the experiment-run tool.
 * Runs `@ai-rpg-engine/core` Engine for (seed, overrides, tickLimit) and
 * returns replay JSON parseable by extractScenarioMetrics. Falls back to a
 * deterministic synthetic tick series if core cannot load.
 */
export function createDefaultReplayProducer(
  options: DefaultReplayProducerOptions = {},
): ReplayProducer {
  return (seed, overrides, tickLimit) => {
    const ticks = clampTicks(tickLimit);
    const Engine = options.Engine ?? loadEngineSync();
    if (!Engine) return syntheticReplay(seed, overrides, ticks);
    try {
      return runEngineReplay(Engine, seed, overrides, ticks);
    } catch {
      return syntheticReplay(seed, overrides, ticks);
    }
  };
}

/**
 * Prefetch `@ai-rpg-engine/core` via dynamic import so the first experiment
 * run does not pay a sync require. Optional — createDefaultReplayProducer
 * still works without it.
 */
export async function preloadDefaultReplayProducer(
  options: DefaultReplayProducerOptions = {},
): Promise<ReplayProducer> {
  if (!options.Engine && cachedEngine === undefined) {
    try {
      const core = await import('@ai-rpg-engine/core');
      if (typeof core.Engine === 'function') {
        cachedEngine = core.Engine as unknown as EngineConstructor;
      }
    } catch {
      // loadEngineSync will try createRequire; failing both yields synthetic
    }
    try {
      const mods = await import('@ai-rpg-engine/modules');
      const loaded: unknown[] = [];
      if ('traversalCore' in mods) loaded.push(mods.traversalCore);
      if ('statusCore' in mods) loaded.push(mods.statusCore);
      cachedModules = loaded;
    } catch {
      // optional
    }
  }
  return createDefaultReplayProducer(options);
}
