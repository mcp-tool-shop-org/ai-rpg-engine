// district-core — spatial memory layer
// Districts aggregate zone-level signals into persistent informational state.
// Alert pressure, rumor density, intruder likelihood, and surveillance
// rise from events and decay over time, giving the world spatial memory.

import type {
  EngineModule,
  WorldState,
  ResolvedEvent,
  ScalarValue,
} from '@ai-rpg-engine/core';
import { getZoneProperty } from './environment-core.js';
import { getEntityFaction, getFactionCognition } from './faction-cognition.js';

// --- Types ---

export type DistrictMetrics = {
  /** Rises from combat and hostile events, decays over time */
  alertPressure: number;
  /** Rises from rumor propagation events */
  rumorDensity: number;
  /** Rises from non-faction entity sightings in the district */
  intruderLikelihood: number;
  /** Faction presence strength — higher means more watchful */
  surveillance: number;
  /** Aggregated environmental stability from constituent zones */
  stability: number;
};

export type DistrictDefinition = {
  id: string;
  name: string;
  zoneIds: string[];
  tags: string[];
  controllingFaction?: string;
  baseMetrics?: Partial<DistrictMetrics>;
};

export type DistrictState = DistrictMetrics & {
  lastUpdateTick: number;
  eventCount: number;
};

export type DistrictDecayConfig = {
  /** Base decay rate per tick (default: 1) */
  decayRate: number;
  /** Minimum metric value (default: 0) */
  floor: number;
};

export type DistrictCoreConfig = {
  districts: DistrictDefinition[];
  decay?: Partial<DistrictDecayConfig>;
};

type ModuleState = {
  districts: Record<string, DistrictState>;
  zoneToDistrict: Record<string, string>;
  definitions: Record<string, DistrictDefinition>;
};

const DEFAULT_METRICS: DistrictMetrics = {
  alertPressure: 0,
  rumorDensity: 0,
  intruderLikelihood: 0,
  surveillance: 0,
  stability: 5,
};

const DEFAULT_DECAY: DistrictDecayConfig = {
  decayRate: 1,
  floor: 0,
};

// --- Module ---

export function createDistrictCore(config: DistrictCoreConfig): EngineModule {
  const decayConfig: DistrictDecayConfig = { ...DEFAULT_DECAY, ...config.decay };

  const initialState: ModuleState = {
    districts: {},
    zoneToDistrict: {},
    definitions: {},
  };

  for (const def of config.districts) {
    initialState.definitions[def.id] = def;
    initialState.districts[def.id] = {
      ...DEFAULT_METRICS,
      ...def.baseMetrics,
      lastUpdateTick: 0,
      eventCount: 0,
    };
    for (const zoneId of def.zoneIds) {
      initialState.zoneToDistrict[zoneId] = def.id;
    }
  }

  return {
    id: 'district-core',
    version: '0.1.0',
    dependsOn: ['environment-core'],

    register(ctx) {
      ctx.persistence.registerNamespace('district-core', initialState);

      // Combat raises alert pressure in the district
      ctx.events.on('combat.*', (event, world) => {
        const districtId = getEventDistrictId(event, world);
        if (!districtId) return;
        const state = getModuleState(world);
        const district = state.districts[districtId];
        if (!district) return;

        const delta = event.type === 'combat.entity.defeated' ? 8 : 4;
        district.alertPressure = Math.min(100, district.alertPressure + delta);
        district.eventCount++;
        district.lastUpdateTick = event.tick;
      });

      // Zone entry raises intruder likelihood if entity is not from controlling faction
      ctx.events.on('world.zone.entered', (event, world) => {
        const zoneId = event.payload.zoneId as string;
        const districtId = getDistrictForZone(world, zoneId);
        if (!districtId) return;

        const state = getModuleState(world);
        const district = state.districts[districtId];
        const def = state.definitions[districtId];
        if (!district || !def) return;

        const actorId = event.actorId;
        if (!actorId) return;

        // Non-faction members raise intruder likelihood
        if (def.controllingFaction) {
          const actorFaction = getEntityFaction(world, actorId);
          if (actorFaction !== def.controllingFaction) {
            district.intruderLikelihood = Math.min(100, district.intruderLikelihood + 10);
          }
        }

        district.eventCount++;
        district.lastUpdateTick = event.tick;
      });

      // Rumor events raise rumor density
      ctx.events.on('rumor.belief.propagated', (event, world) => {
        const factionId = event.payload.factionId as string;
        // Find districts controlled by this faction
        const state = getModuleState(world);
        for (const [dId, def] of Object.entries(state.definitions)) {
          if (def.controllingFaction === factionId) {
            const district = state.districts[dId];
            if (district) {
              district.rumorDensity = Math.min(100, district.rumorDensity + 5);
              district.lastUpdateTick = event.tick;
            }
          }
        }
      });

      // District tick: decay metrics, update surveillance, sync stability
      ctx.actions.registerVerb('district-tick', (_action, world) => {
        processDistrictTick(world, decayConfig);
        return [];
      });
    },
  };
}

// --- State Access ---

function getModuleState(world: WorldState): ModuleState {
  return (world.modules['district-core'] ?? {
    districts: {},
    zoneToDistrict: {},
    definitions: {},
  }) as ModuleState;
}

/** Get the district a zone belongs to */
export function getDistrictForZone(world: WorldState, zoneId: string): string | undefined {
  return getModuleState(world).zoneToDistrict[zoneId];
}

/** Get district state */
export function getDistrictState(world: WorldState, districtId: string): DistrictState | undefined {
  return getModuleState(world).districts[districtId];
}

/** Get district definition */
export function getDistrictDefinition(world: WorldState, districtId: string): DistrictDefinition | undefined {
  return getModuleState(world).definitions[districtId];
}

/** Get all district IDs */
export function getAllDistrictIds(world: WorldState): string[] {
  return Object.keys(getModuleState(world).districts);
}

/** Get a specific district metric */
export function getDistrictMetric(
  world: WorldState,
  districtId: string,
  metric: keyof DistrictMetrics,
): number {
  const state = getModuleState(world).districts[districtId];
  return state?.[metric] ?? 0;
}

/** Manually modify a district metric */
export function modifyDistrictMetric(
  world: WorldState,
  districtId: string,
  metric: keyof DistrictMetrics,
  delta: number,
): void {
  const state = getModuleState(world).districts[districtId];
  if (!state) return;
  state[metric] = Math.max(0, Math.min(100, state[metric] + delta));
}

// --- District-Aware Hooks (A4) ---

/**
 * Check if a district is on high alert.
 * Useful for AI intent selection — patrol tendency increases in alert districts.
 */
export function isDistrictOnAlert(world: WorldState, districtId: string): boolean {
  const state = getModuleState(world).districts[districtId];
  return (state?.alertPressure ?? 0) > 30;
}

/**
 * Get the combined threat level of a district.
 * Factors: alert pressure, intruder likelihood, rumor density.
 */
export function getDistrictThreatLevel(world: WorldState, districtId: string): number {
  const state = getModuleState(world).districts[districtId];
  if (!state) return 0;
  return Math.min(100, Math.round(
    state.alertPressure * 0.4 +
    state.intruderLikelihood * 0.35 +
    state.rumorDensity * 0.25,
  ));
}

// --- Tick Processing ---

function processDistrictTick(world: WorldState, decayConfig: DistrictDecayConfig): void {
  const state = getModuleState(world);

  for (const [districtId, district] of Object.entries(state.districts)) {
    const def = state.definitions[districtId];
    if (!def) continue;

    // Decay metrics toward floor
    district.alertPressure = Math.max(
      decayConfig.floor,
      district.alertPressure - decayConfig.decayRate,
    );
    district.rumorDensity = Math.max(
      decayConfig.floor,
      district.rumorDensity - decayConfig.decayRate * 0.5,
    );
    district.intruderLikelihood = Math.max(
      decayConfig.floor,
      district.intruderLikelihood - decayConfig.decayRate * 0.8,
    );

    // Surveillance: count faction members present in district zones
    if (def.controllingFaction) {
      let factionPresence = 0;
      for (const zoneId of def.zoneIds) {
        for (const entity of Object.values(world.entities)) {
          if (entity.zoneId === zoneId && entity.ai) {
            const faction = getEntityFaction(world, entity.id);
            if (faction === def.controllingFaction) {
              factionPresence++;
            }
          }
        }
      }
      district.surveillance = factionPresence * 15;
    }

    // Stability: average stability of constituent zones
    let totalStability = 0;
    let zoneCount = 0;
    for (const zoneId of def.zoneIds) {
      if (world.zones[zoneId]) {
        totalStability += getZoneProperty(world, zoneId, 'stability') || 5;
        zoneCount++;
      }
    }
    if (zoneCount > 0) {
      district.stability = totalStability / zoneCount;
    }

    // District-aware faction hook: high intruder likelihood boosts faction alert
    if (def.controllingFaction && district.intruderLikelihood > 20) {
      const factionCog = getFactionCognition(world, def.controllingFaction);
      const boost = Math.round(district.intruderLikelihood * 0.1);
      factionCog.alertLevel = Math.min(100, factionCog.alertLevel + boost);
    }
  }
}

// --- Internal Helpers ---

function getEventDistrictId(event: ResolvedEvent, world: WorldState): string | undefined {
  const zoneId = getEventZoneId(event, world);
  if (!zoneId) return undefined;
  return getDistrictForZone(world, zoneId);
}

function getEventZoneId(event: ResolvedEvent, world: WorldState): string | undefined {
  if (event.payload.zoneId) return event.payload.zoneId as string;
  if (event.actorId) return world.entities[event.actorId]?.zoneId;
  if (event.targetIds?.[0]) return world.entities[event.targetIds[0]]?.zoneId;
  return undefined;
}
