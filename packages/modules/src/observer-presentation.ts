// observer-presentation — subjective event presentation per observer
// The same event can be described differently depending on who observes it.
// Perception clarity, faction allegiance, and cognitive bias shape how
// events are presented to each observer. One truth, many experiences.

import type {
  EngineModule,
  WorldState,
  EntityState,
  ResolvedEvent,
  ScalarValue,
} from '@signalfire/core';
import { getCognition, getBelief } from './cognition-core.js';
import { getEntityFaction, getFactionCognition } from './faction-cognition.js';
import type { FactionCognitionState } from './faction-cognition.js';
import { getPerceptionLog } from './perception-filter.js';
import type { PerceivedEvent } from './perception-filter.js';
import { getZoneProperty } from './environment-core.js';

// --- Types ---

/** Context available to presentation rules */
export type ObserverContext = {
  /** Observer entity */
  observer: EntityState;
  /** Perception clarity for this event (0-1, or undefined if not perceived) */
  clarity: number | undefined;
  /** Observer's faction ID */
  factionId: string | undefined;
  /** Faction cognition state (if any) */
  factionState: FactionCognitionState | undefined;
  /** Is the observer's faction hostile to the event actor? */
  isActorHostile: boolean;
  /** Environmental stability of the observer's zone */
  zoneStability: number;
  /** Observer's current suspicion level */
  suspicion: number;
};

/** A rule that transforms event presentation based on observer context */
export type PresentationRule = {
  id: string;
  /** Event type patterns this rule applies to */
  eventPatterns: string[];
  /** Priority: higher priority rules apply first (default: 0) */
  priority?: number;
  /** Condition: should this rule apply? */
  condition: (event: ResolvedEvent, ctx: ObserverContext) => boolean;
  /** Transform: modify the event's presentation for this observer */
  transform: (event: ResolvedEvent, ctx: ObserverContext) => ResolvedEvent;
};

/** Result of observer-scoped presentation */
export type ObserverPresentedEvent = ResolvedEvent & {
  /** Which observer this version is for */
  _observerId: string;
  /** Observer's perception clarity */
  _clarity: number | undefined;
  /** Which rules were applied */
  _appliedRules: string[];
};

export type ObserverPresentationConfig = {
  /** Custom presentation rules (added to built-ins) */
  rules?: PresentationRule[];
};

type ModuleState = {
  /** Log of subjective presentations: eventId → observerId → presented payload */
  divergences: DivergenceRecord[];
  /** Registry key for rule lookup (serializable — avoids structuredClone on functions) */
  _registryId?: string;
};

export type DivergenceRecord = {
  eventId: string;
  tick: number;
  observerId: string;
  objectiveType: string;
  subjectiveDescription: string;
  appliedRules: string[];
  clarity: number | undefined;
};

// --- Rule Registry ---
// Rules contain functions (condition, transform) which can't survive structuredClone.
// We store them in a module-level registry keyed by a serializable ID,
// and persist only the ID in the world state.

const ruleRegistry = new Map<string, PresentationRule[]>();

/** Deterministic registry key from rule IDs — same rules always produce the same key */
function makeRegistryId(customRules: PresentationRule[]): string {
  if (customRules.length === 0) return 'op:builtin';
  return `op:${customRules.map((r) => r.id).join(',')}`;
}

// --- Module ---

export function createObserverPresentation(config?: ObserverPresentationConfig): EngineModule {
  const customRules = config?.rules ?? [];
  const allRules: PresentationRule[] = [
    ...getBuiltinRules(),
    ...customRules,
  ].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const registryId = makeRegistryId(customRules);
  ruleRegistry.set(registryId, allRules);

  return {
    id: 'observer-presentation',
    version: '0.1.0',
    dependsOn: ['cognition-core', 'perception-filter'],

    register(ctx) {
      ctx.persistence.registerNamespace('observer-presentation', {
        divergences: [],
        _registryId: registryId,
      } as ModuleState);

      ctx.debug.registerInspector({
        id: 'presentation-divergences',
        label: 'Presentation Divergences',
        inspect: (world) => getModuleState(world).divergences,
      });
    },
  };
}

// --- State Access ---

function getModuleState(world: WorldState): ModuleState {
  return (world.modules['observer-presentation'] ?? {
    divergences: [],
  }) as ModuleState;
}

// --- Presentation API ---

/**
 * Present an event from a specific observer's perspective.
 * Returns the event as the observer would experience it,
 * shaped by their perception clarity, faction allegiance, and cognitive bias.
 */
export function presentForObserver(
  event: ResolvedEvent,
  observerId: string,
  world: WorldState,
  rules?: PresentationRule[],
): ObserverPresentedEvent {
  const observer = world.entities[observerId];
  if (!observer) {
    return { ...event, _observerId: observerId, _clarity: undefined, _appliedRules: [] };
  }

  const ctx = buildObserverContext(observer, event, world);
  const activeRules = rules ?? getAllRules(world);

  let transformed = { ...event };
  const appliedRules: string[] = [];

  for (const rule of activeRules) {
    if (!matchesEventPattern(event.type, rule.eventPatterns)) continue;
    if (!rule.condition(event, ctx)) continue;

    transformed = rule.transform(transformed, ctx);
    appliedRules.push(rule.id);
  }

  // Record divergence if any rules were applied
  if (appliedRules.length > 0) {
    const state = getModuleState(world);
    const description = (transformed.payload._subjectiveDescription as string)
      ?? transformed.type;
    state.divergences.push({
      eventId: event.id,
      tick: event.tick,
      observerId,
      objectiveType: event.type,
      subjectiveDescription: description,
      appliedRules,
      clarity: ctx.clarity,
    });
  }

  return {
    ...transformed,
    _observerId: observerId,
    _clarity: ctx.clarity,
    _appliedRules: appliedRules,
  };
}

/**
 * Present an event from all observers' perspectives.
 * Returns one version per observer that perceived or was affected by the event.
 */
export function presentForAllObservers(
  event: ResolvedEvent,
  world: WorldState,
): ObserverPresentedEvent[] {
  const results: ObserverPresentedEvent[] = [];

  for (const entity of Object.values(world.entities)) {
    if (!entity.ai) continue;
    if (entity.id === event.actorId) continue; // actors know what they did

    const presented = presentForObserver(event, entity.id, world);
    results.push(presented);
  }

  return results;
}

/**
 * Get all recorded divergences — events where observers saw different versions.
 */
export function getDivergences(world: WorldState): DivergenceRecord[] {
  return getModuleState(world).divergences;
}

/**
 * Get divergences for a specific event — shows how each observer saw it.
 */
export function getEventDivergences(world: WorldState, eventId: string): DivergenceRecord[] {
  return getModuleState(world).divergences.filter((d) => d.eventId === eventId);
}

// --- Built-in Rules ---

function getBuiltinRules(): PresentationRule[] {
  return [
    // Low clarity: obscure actor identity
    {
      id: 'low-clarity-identity',
      eventPatterns: ['world.zone.entered', 'combat.*'],
      priority: 10,
      condition: (_event, ctx) => (ctx.clarity ?? 1) < 0.4,
      transform: (event, ctx) => ({
        ...event,
        payload: {
          ...event.payload,
          _subjectiveDescription: 'a shadowed figure moves nearby',
          _actorDescription: 'an indistinct shape',
          _clarityLevel: 'obscured',
        },
      }),
    },

    // Medium clarity: partial information
    {
      id: 'medium-clarity-partial',
      eventPatterns: ['world.zone.entered', 'combat.*'],
      priority: 5,
      condition: (_event, ctx) => {
        const clarity = ctx.clarity ?? 1;
        return clarity >= 0.4 && clarity < 0.7;
      },
      transform: (event, ctx) => ({
        ...event,
        payload: {
          ...event.payload,
          _subjectiveDescription: 'someone moves in the dim light',
          _actorDescription: 'a partially visible figure',
          _clarityLevel: 'partial',
        },
      }),
    },

    // Hostile faction: biased framing
    {
      id: 'hostile-faction-bias',
      eventPatterns: ['world.zone.entered'],
      priority: 3,
      condition: (_event, ctx) => ctx.isActorHostile,
      transform: (event, _ctx) => ({
        ...event,
        payload: {
          ...event.payload,
          _subjectiveDescription: 'a hostile intruder advances',
          _actorDescription: 'an enemy combatant',
          _hostileBias: true,
        },
      }),
    },

    // High suspicion: paranoid interpretation
    {
      id: 'high-suspicion-paranoia',
      eventPatterns: ['world.zone.entered'],
      priority: 2,
      condition: (_event, ctx) => ctx.suspicion > 60,
      transform: (event, _ctx) => ({
        ...event,
        payload: {
          ...event.payload,
          _subjectiveDescription: 'a suspicious figure lurks at the threshold',
          _paranoidInterpretation: true,
        },
      }),
    },

    // Unstable environment: glitched perception
    {
      id: 'unstable-environment-glitch',
      eventPatterns: ['*'],
      priority: 1,
      condition: (_event, ctx) => ctx.zoneStability < 2,
      transform: (event, _ctx) => ({
        ...event,
        payload: {
          ...event.payload,
          _environmentalDistortion: true,
          _clarityLevel: 'glitched',
        },
      }),
    },
  ];
}

// --- Internal ---

function getAllRules(world: WorldState): PresentationRule[] {
  // Look up rules from registry using the ID stored in module state
  const state = getModuleState(world);
  if (state._registryId && ruleRegistry.has(state._registryId)) {
    return ruleRegistry.get(state._registryId)!;
  }
  // Fallback: built-in only (when module not registered)
  return getBuiltinRules().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

function buildObserverContext(
  observer: EntityState,
  event: ResolvedEvent,
  world: WorldState,
): ObserverContext {
  // Find perception clarity for this event
  let clarity: number | undefined;
  if (world.modules['perception-filter']) {
    const perceptionLog = getPerceptionLog(world, observer.id);
    const perception = perceptionLog.find((p) => p.eventId === event.id);
    clarity = perception?.clarity;
  }

  // Faction info
  const factionId = world.modules['faction-cognition']
    ? getEntityFaction(world, observer.id)
    : undefined;
  const factionState = factionId
    ? getFactionCognition(world, factionId)
    : undefined;

  // Is the event actor hostile to the observer's faction?
  let isActorHostile = false;
  if (factionId && event.actorId) {
    const actorFaction = getEntityFaction(world, event.actorId);
    // Different faction = potentially hostile
    if (actorFaction && actorFaction !== factionId) {
      isActorHostile = true;
    }
    // Or check if the observer believes the actor is hostile
    const cognition = getCognition(world, observer.id);
    const hostileBelief = getBelief(cognition, event.actorId, 'hostile');
    if (hostileBelief?.value === true && hostileBelief.confidence > 0.5) {
      isActorHostile = true;
    }
  }

  // Zone stability
  const zoneStability = observer.zoneId
    ? getZoneProperty(world, observer.zoneId, 'stability') || 5
    : 5;

  // Suspicion
  const cognition = getCognition(world, observer.id);

  return {
    observer,
    clarity,
    factionId,
    factionState,
    isActorHostile,
    zoneStability,
    suspicion: cognition.suspicion,
  };
}

function matchesEventPattern(eventType: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern === '*') return true;
    if (pattern.endsWith('.*')) {
      return eventType.startsWith(pattern.slice(0, -2) + '.');
    }
    return eventType === pattern;
  });
}
