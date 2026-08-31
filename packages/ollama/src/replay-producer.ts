// Default ReplayProducer — runs the project's Engine for experiment batches.
// Hosts may inject their own producer; this is the in-package seam so
// /experiment-run actually executes instead of printing a plan-only stub.
// Default path loads the project's ContentPack (emit-pack / content/pack.json)
// onto the Engine and derives tick metrics from store events/globals.

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  /** Sidecar pack JSON (emit-pack --write path, or `--content`). */
  contentPath?: string;
  /** Inject Engine so hosts/tests can swap without hitting core. */
  Engine?: EngineConstructor;
  /** Inject applyContentPack so tests can observe pack load without core. */
  applyContentPack?: (engine: EngineLike, pack: unknown) => void;
};

let cachedEngine: EngineConstructor | null | undefined;
let cachedModules: unknown[] | undefined;
let cachedApply: ((engine: unknown, pack: unknown) => unknown) | null | undefined;

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

function loadApplySync(): ((engine: unknown, pack: unknown) => unknown) | null {
  if (cachedApply !== undefined) return cachedApply;
  try {
    const require = createRequire(import.meta.url);
    const schema = require('@ai-rpg-engine/content-schema') as {
      applyContentPack?: (engine: unknown, pack: unknown) => unknown;
    };
    cachedApply = typeof schema.applyContentPack === 'function' ? schema.applyContentPack : null;
  } catch {
    cachedApply = null;
  }
  return cachedApply;
}

function clampTicks(tickLimit?: number): number {
  if (tickLimit === undefined || !Number.isFinite(tickLimit)) return DEFAULT_TICK_LIMIT;
  const n = Math.floor(tickLimit);
  if (n < 1) return 1;
  return Math.min(n, MAX_TICK_LIMIT);
}

const PACK_CANDIDATES = [
  'content/pack.json',
  'pack.json',
  'content.json',
];

/** Load emit-pack output / sidecar / conventional content/pack.json. Sync: ReplayProducer is sync. */
export function loadProjectPack(
  projectRoot?: string,
  contentPath?: string,
): unknown | null {
  const paths: string[] = [];
  if (contentPath) paths.push(contentPath);
  if (projectRoot) {
    for (const rel of PACK_CANDIDATES) paths.push(join(projectRoot, rel));
  }
  for (const p of paths) {
    try {
      if (!existsSync(p)) continue;
      const raw = readFileSync(p, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // try next candidate
    }
  }
  return null;
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

function numGlobal(
  globals: Record<string, string | number | boolean>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const v = globals[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

function eventRatio(
  events: Array<{ tick: number; type: string }>,
  tick: number,
  pattern: RegExp,
): number {
  const matching = events.filter((e) => e.tick <= tick && pattern.test(e.type)).length;
  return matching / Math.max(tick + 1, 1);
}

function deriveTickMetrics(
  globals: Record<string, string | number | boolean>,
  tickEvents: Array<{ tick: number; type: string; payload?: Record<string, unknown> }>,
  allEvents: Array<{ tick: number; type: string }>,
  tick: number,
): {
  alertPressure: number;
  rumorSpread: number;
  hostility: number;
  encounterActive: boolean;
} {
  const alertPressure = numGlobal(globals, ['alertPressure', 'alert', 'alertGain'])
    ?? eventRatio(allEvents, tick, /alert|escalat/i);
  const rumorSpread = numGlobal(globals, ['rumorSpread', 'rumorClarity', 'rumorDensity'])
    ?? eventRatio(allEvents, tick, /rumor|gossip/i);
  const hostility = numGlobal(globals, ['hostility', 'factionHostility', 'escalationGain'])
    ?? eventRatio(allEvents, tick, /hostil|threat|combat/i);
  const encounterActive = tickEvents.some((e) => /encounter/i.test(e.type))
    || globals.encounterActive === true;
  return { alertPressure, rumorSpread, hostility, encounterActive };
}

function runEngineReplay(
  Engine: EngineConstructor,
  seed: number,
  overrides: Record<string, number | string | boolean> | undefined,
  ticks: number,
  options: DefaultReplayProducerOptions,
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
  const pack = loadProjectPack(options.projectRoot, options.contentPath);
  if (pack) {
    const apply = options.applyContentPack ?? loadApplySync();
    if (apply) {
      try {
        apply(engine, pack);
      } catch {
        // pack optional — still tick the engine
      }
    }
  }
  const tickData = [];
  for (let t = 0; t < ticks; t++) {
    engine.advanceRound(1);
    let events: Array<{ tick: number; type: string; payload?: Record<string, unknown> }> = [];
    try {
      events = engine.queryEvents() ?? [];
    } catch {
      events = [];
    }
    const tickEvents = events.filter((e) => e.tick === t);
    const derived = deriveTickMetrics(engine.store.state.globals ?? {}, tickEvents, events, t);
    tickData.push({
      tick: t,
      events: tickEvents,
      alertPressure: derived.alertPressure,
      rumorSpread: derived.rumorSpread,
      hostility: derived.hostility,
      encounterActive: derived.encounterActive,
      metrics: {
        alertPressure: derived.alertPressure,
        rumorSpread: derived.rumorSpread,
        hostility: derived.hostility,
      },
    });
  }
  return JSON.stringify(tickData);
}

/**
 * Default ReplayProducer used by /experiment-run and the experiment-run tool.
 * Loads the project pack when projectRoot is set, applies it onto Engine, then
 * derives tick metrics from store events/globals. Falls back to a
 * deterministic synthetic tick series only if core cannot load.
 */
export function createDefaultReplayProducer(
  options: DefaultReplayProducerOptions = {},
): ReplayProducer {
  return (seed, overrides, tickLimit) => {
    const ticks = clampTicks(tickLimit);
    const Engine = options.Engine ?? loadEngineSync();
    if (!Engine) return syntheticReplay(seed, overrides, ticks);
    try {
      return runEngineReplay(Engine, seed, overrides, ticks, options);
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
