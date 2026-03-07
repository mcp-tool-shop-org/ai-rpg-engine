// environment-core — zones as active simulation participants
// Light, noise, stability, hazards react to events and affect mechanics.
// Environment is not decorative — it participates.

import type {
  EngineModule,
  WorldState,
  ZoneState,
  EntityState,
  ResolvedEvent,
  ScalarValue,
} from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';

// --- Types ---

/** A rule that modifies zone properties in response to events */
export type EnvironmentRule = {
  id: string;
  /** Event pattern to react to */
  eventPattern: string;
  /** Which zone property to modify */
  property: string;
  /** How much to change by (or function of event) */
  delta: number | ((event: ResolvedEvent, zone: ZoneState, world: WorldState) => number);
  /** Optional: decay back toward a baseline over time */
  decay?: { rate: number; baseline: number };
};

/** A hazard that triggers effects on entities */
export type HazardDefinition = {
  id: string;
  /** Event pattern that triggers the hazard check */
  triggerOn: string;
  /** Condition: does this hazard activate? */
  condition: (zone: ZoneState, entity: EntityState, world: WorldState) => boolean;
  /** What happens when the hazard activates */
  effect: (zone: ZoneState, entity: EntityState, world: WorldState, tick: number) => ResolvedEvent[];
};

/** Passive zone tick effect (runs every tick for affected zones) */
export type ZoneTickEffect = {
  id: string;
  /** Condition: which zones get this effect? */
  condition: (zone: ZoneState, world: WorldState) => boolean;
  /** Apply the effect */
  apply: (zone: ZoneState, world: WorldState, tick: number) => ResolvedEvent[];
};

export type EnvironmentCoreConfig = {
  /** Rules that modify zone properties in response to events */
  rules?: EnvironmentRule[];
  /** Hazard definitions */
  hazards?: HazardDefinition[];
  /** Passive zone tick effects */
  tickEffects?: ZoneTickEffect[];
};

export type EnvironmentState = {
  /** Zone property overrides/dynamic values: zoneId → property → value */
  dynamics: Record<string, Record<string, number>>;
  /** Active decay timers */
  decays: DecayTimer[];
  /** Hazard activation log */
  hazardLog: HazardEvent[];
};

export type DecayTimer = {
  zoneId: string;
  property: string;
  rate: number;
  baseline: number;
};

export type HazardEvent = {
  hazardId: string;
  zoneId: string;
  entityId: string;
  tick: number;
};

// --- Module ---

export function createEnvironmentCore(config?: EnvironmentCoreConfig): EngineModule {
  const rules = config?.rules ?? [];
  const hazards = config?.hazards ?? [];
  const tickEffects = config?.tickEffects ?? [];

  // Add built-in rules
  const allRules: EnvironmentRule[] = [
    ...getBuiltinRules(),
    ...rules,
  ];

  return {
    id: 'environment-core',
    version: '0.1.0',

    register(ctx) {
      ctx.persistence.registerNamespace('environment-core', {
        dynamics: {},
        decays: [],
        hazardLog: [],
      } as EnvironmentState);

      // Register environment rules
      for (const rule of allRules) {
        ctx.events.on(rule.eventPattern, (event, world) => {
          applyEnvironmentRule(rule, event, world);
        });
      }

      // Register hazard checks
      for (const hazard of hazards) {
        ctx.events.on(hazard.triggerOn, (event, world) => {
          checkHazard(hazard, event, world);
        });
      }

      // Register 'environment-tick' verb for tick processing (decays + tick effects)
      ctx.actions.registerVerb('environment-tick', (action, world) => {
        processDecays(world);
        return processEnvironmentTick(world, tickEffects, action.issuedAtTick);
      });
    },
  };
}

// --- State Access ---

function getEnvironmentState(world: WorldState): EnvironmentState {
  return (world.modules['environment-core'] ?? {
    dynamics: {},
    decays: [],
    hazardLog: [],
  }) as EnvironmentState;
}

// --- Zone Property Access ---

/** Get effective zone property value (base + dynamic override) */
export function getZoneProperty(world: WorldState, zoneId: string, property: string): number {
  const zone = world.zones[zoneId];
  if (!zone) return 0;

  // Check dynamic override first
  const state = getEnvironmentState(world);
  const dynamic = state.dynamics[zoneId]?.[property];

  // Base value from zone definition
  const base = (zone as Record<string, unknown>)[property] as number | undefined;

  if (dynamic !== undefined) return dynamic;
  return base ?? 0;
}

/** Set a dynamic zone property (overrides base) */
export function setZoneProperty(
  world: WorldState,
  zoneId: string,
  property: string,
  value: number,
): void {
  const state = getEnvironmentState(world);
  if (!state.dynamics[zoneId]) {
    state.dynamics[zoneId] = {};
  }
  state.dynamics[zoneId][property] = value;
}

/** Modify a zone property by delta */
export function modifyZoneProperty(
  world: WorldState,
  zoneId: string,
  property: string,
  delta: number,
): number {
  const current = getZoneProperty(world, zoneId, property);
  const newValue = current + delta;
  setZoneProperty(world, zoneId, property, newValue);
  return newValue;
}

/** Process environmental decay (call between actions or on tick) */
export function processEnvironmentDecays(world: WorldState): void {
  processDecays(world);
}

/** Get all active hazard events for a zone */
export function getHazardLog(world: WorldState, zoneId?: string): HazardEvent[] {
  const state = getEnvironmentState(world);
  if (zoneId) return state.hazardLog.filter((h) => h.zoneId === zoneId);
  return state.hazardLog;
}

/** Check if a zone has a specific tag */
export function zoneHasTag(world: WorldState, zoneId: string, tag: string): boolean {
  return world.zones[zoneId]?.tags.includes(tag) ?? false;
}

/** Get all entities in a zone */
export function entitiesInZone(world: WorldState, zoneId: string): EntityState[] {
  return Object.values(world.entities).filter((e) => e.zoneId === zoneId);
}

// --- Built-in Rules ---

function getBuiltinRules(): EnvironmentRule[] {
  return [
    // Combat raises noise in the zone
    {
      id: 'combat-noise',
      eventPattern: 'combat.contact.hit',
      property: 'noise',
      delta: 3,
      decay: { rate: 1, baseline: 0 },
    },
    // Missed attacks still make noise
    {
      id: 'combat-miss-noise',
      eventPattern: 'combat.contact.miss',
      property: 'noise',
      delta: 2,
      decay: { rate: 1, baseline: 0 },
    },
    // Entity defeat is very noticeable
    {
      id: 'defeat-noise',
      eventPattern: 'combat.entity.defeated',
      property: 'noise',
      delta: 5,
      decay: { rate: 2, baseline: 0 },
    },
    // Zone entry adds minor noise
    {
      id: 'entry-noise',
      eventPattern: 'world.zone.entered',
      property: 'noise',
      delta: 1,
      decay: { rate: 1, baseline: 0 },
    },
  ];
}

// --- Internal ---

function applyEnvironmentRule(
  rule: EnvironmentRule,
  event: ResolvedEvent,
  world: WorldState,
): void {
  const zoneId = getEventZoneId(event, world);
  if (!zoneId) return;

  const zone = world.zones[zoneId];
  if (!zone) return;

  const delta = typeof rule.delta === 'function'
    ? rule.delta(event, zone, world)
    : rule.delta;

  modifyZoneProperty(world, zoneId, rule.property, delta);

  // Register decay if configured
  if (rule.decay) {
    const state = getEnvironmentState(world);
    // Only add decay if one doesn't already exist for this zone+property
    const existing = state.decays.find(
      (d) => d.zoneId === zoneId && d.property === rule.property,
    );
    if (!existing) {
      state.decays.push({
        zoneId,
        property: rule.property,
        rate: rule.decay.rate,
        baseline: rule.decay.baseline,
      });
    }
  }
}

function checkHazard(
  hazard: HazardDefinition,
  event: ResolvedEvent,
  world: WorldState,
): void {
  const zoneId = getEventZoneId(event, world);
  if (!zoneId) return;

  const zone = world.zones[zoneId];
  if (!zone) return;

  // Check all entities in the zone
  for (const entity of Object.values(world.entities)) {
    if (entity.zoneId !== zoneId) continue;
    if (hazard.condition(zone, entity, world)) {
      hazard.effect(zone, entity, world, event.tick);
      const state = getEnvironmentState(world);
      state.hazardLog.push({
        hazardId: hazard.id,
        zoneId,
        entityId: entity.id,
        tick: event.tick,
      });
    }
  }
}

function processDecays(world: WorldState): void {
  const state = getEnvironmentState(world);
  const toRemove: number[] = [];

  for (let i = 0; i < state.decays.length; i++) {
    const decay = state.decays[i];
    const current = getZoneProperty(world, decay.zoneId, decay.property);

    if (Math.abs(current - decay.baseline) < 0.01) {
      // Close enough to baseline, remove the decay timer
      setZoneProperty(world, decay.zoneId, decay.property, decay.baseline);
      toRemove.push(i);
      continue;
    }

    // Move toward baseline
    const direction = current > decay.baseline ? -1 : 1;
    const step = Math.min(decay.rate, Math.abs(current - decay.baseline));
    modifyZoneProperty(world, decay.zoneId, decay.property, direction * step);
  }

  // Remove completed decays (reverse to maintain indices)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    state.decays.splice(toRemove[i], 1);
  }
}

function processEnvironmentTick(
  world: WorldState,
  tickEffects: ZoneTickEffect[],
  tick: number,
): ResolvedEvent[] {
  const events: ResolvedEvent[] = [];

  for (const zone of Object.values(world.zones)) {
    for (const effect of tickEffects) {
      if (effect.condition(zone, world)) {
        events.push(...effect.apply(zone, world, tick));
      }
    }
  }

  return events;
}

function getEventZoneId(event: ResolvedEvent, world: WorldState): string | undefined {
  if (event.payload.zoneId) return event.payload.zoneId as string;
  if (event.actorId) return world.entities[event.actorId]?.zoneId;
  if (event.targetIds?.[0]) return world.entities[event.targetIds[0]]?.zoneId;
  return undefined;
}
