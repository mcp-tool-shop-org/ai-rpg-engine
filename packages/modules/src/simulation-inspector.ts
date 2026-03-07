// simulation-inspector — observability layer for the simulation
// Registers debug inspectors that expose entity cognition, faction beliefs,
// perception events, rumor traces, and environmental state.

import type {
  EngineModule,
  WorldState,
  DebugInspector,
  ScalarValue,
} from '@signalfire/core';
import { getCognition } from './cognition-core.js';
import type { CognitionState, Belief, Memory } from './cognition-core.js';
import { getPerceptionLog } from './perception-filter.js';
import type { PerceivedEvent } from './perception-filter.js';
import { getFactionCognition, getEntityFaction, getFactionMembers } from './faction-cognition.js';
import type { FactionCognitionState, FactionBelief } from './faction-cognition.js';
import { getRumorLog, getRumorsToFaction } from './rumor-propagation.js';
import type { RumorRecord } from './rumor-propagation.js';
import { getZoneProperty } from './environment-core.js';

// --- Types ---

export type EntityInspection = {
  id: string;
  name: string;
  zone: string | undefined;
  faction: string | undefined;
  cognition: {
    beliefs: Belief[];
    recentMemories: Memory[];
    morale: number;
    suspicion: number;
    currentIntent: string | null;
  };
  perceptions: PerceivedEvent[];
};

export type FactionInspection = {
  id: string;
  members: string[];
  beliefs: FactionBelief[];
  alertLevel: number;
  cohesion: number;
  recentRumors: RumorRecord[];
};

export type ZoneInspection = {
  id: string;
  name: string;
  dynamicProperties: Record<string, number>;
  entities: string[];
};

export type SimulationSnapshot = {
  tick: number;
  entities: Record<string, EntityInspection>;
  factions: Record<string, FactionInspection>;
  zones: Record<string, ZoneInspection>;
  rumorCount: number;
  eventLogSize: number;
};

// --- Module ---

export function createSimulationInspector(): EngineModule {
  return {
    id: 'simulation-inspector',
    version: '0.1.0',

    register(ctx) {
      ctx.debug.registerInspector({
        id: 'entity-cognition',
        label: 'Entity Cognition',
        inspect: (world) => inspectAllEntities(world),
      });

      ctx.debug.registerInspector({
        id: 'faction-state',
        label: 'Faction State',
        inspect: (world) => inspectAllFactions(world),
      });

      ctx.debug.registerInspector({
        id: 'environment-state',
        label: 'Environment State',
        inspect: (world) => inspectAllZones(world),
      });

      ctx.debug.registerInspector({
        id: 'rumor-trace',
        label: 'Rumor Trace',
        inspect: (world) => getRumorLog(world),
      });

      ctx.debug.registerInspector({
        id: 'simulation-snapshot',
        label: 'Full Simulation Snapshot',
        inspect: (world) => createSnapshot(world),
      });
    },
  };
}

// --- Entity Inspection ---

/** Inspect a single entity's cognitive state */
export function inspectEntity(world: WorldState, entityId: string): EntityInspection | null {
  const entity = world.entities[entityId];
  if (!entity) return null;

  const cog = getCognition(world, entityId);
  const perceptions = world.modules['perception-filter']
    ? getPerceptionLog(world, entityId)
    : [];

  return {
    id: entity.id,
    name: entity.name,
    zone: entity.zoneId,
    faction: getEntityFaction(world, entityId),
    cognition: {
      beliefs: cog.beliefs,
      recentMemories: cog.memories.slice(-10),
      morale: cog.morale,
      suspicion: cog.suspicion,
      currentIntent: cog.currentIntent,
    },
    perceptions: perceptions.slice(-20),
  };
}

/** Inspect all AI entities */
export function inspectAllEntities(world: WorldState): Record<string, EntityInspection> {
  const result: Record<string, EntityInspection> = {};
  for (const entity of Object.values(world.entities)) {
    if (!entity.ai) continue;
    const inspection = inspectEntity(world, entity.id);
    if (inspection) result[entity.id] = inspection;
  }
  return result;
}

// --- Faction Inspection ---

/** Inspect a single faction */
export function inspectFaction(world: WorldState, factionId: string): FactionInspection | null {
  if (!world.modules['faction-cognition']) return null;

  const factionCog = getFactionCognition(world, factionId);
  const members = getFactionMembers(world, factionId);
  const rumors = getRumorsToFaction(world, factionId);

  return {
    id: factionId,
    members,
    beliefs: factionCog.beliefs,
    alertLevel: factionCog.alertLevel,
    cohesion: factionCog.cohesion,
    recentRumors: rumors.slice(-10),
  };
}

/** Inspect all factions */
export function inspectAllFactions(world: WorldState): Record<string, FactionInspection> {
  if (!world.modules['faction-cognition']) return {};

  const modState = world.modules['faction-cognition'] as {
    factionCognition: Record<string, FactionCognitionState>;
  };

  const result: Record<string, FactionInspection> = {};
  for (const factionId of Object.keys(modState.factionCognition)) {
    const inspection = inspectFaction(world, factionId);
    if (inspection) result[factionId] = inspection;
  }
  return result;
}

// --- Zone Inspection ---

/** Inspect a single zone's dynamic state */
export function inspectZone(world: WorldState, zoneId: string): ZoneInspection | null {
  const zone = world.zones[zoneId];
  if (!zone) return null;

  const dynamicProperties: Record<string, number> = {};
  const envState = world.modules['environment-core'] as {
    dynamics: Record<string, Record<string, number>>;
  } | undefined;

  if (envState?.dynamics?.[zoneId]) {
    Object.assign(dynamicProperties, envState.dynamics[zoneId]);
  }

  // Add base properties
  if (zone.noise !== undefined) dynamicProperties.noise = getZoneProperty(world, zoneId, 'noise');
  if (zone.light !== undefined) dynamicProperties.light = getZoneProperty(world, zoneId, 'light');
  if (zone.stability !== undefined) dynamicProperties.stability = getZoneProperty(world, zoneId, 'stability');

  const entities = Object.values(world.entities)
    .filter((e) => e.zoneId === zoneId)
    .map((e) => e.id);

  return {
    id: zoneId,
    name: zone.name,
    dynamicProperties,
    entities,
  };
}

/** Inspect all zones */
export function inspectAllZones(world: WorldState): Record<string, ZoneInspection> {
  const result: Record<string, ZoneInspection> = {};
  for (const zoneId of Object.keys(world.zones)) {
    const inspection = inspectZone(world, zoneId);
    if (inspection) result[zoneId] = inspection;
  }
  return result;
}

// --- Full Snapshot ---

/** Create a complete simulation snapshot */
export function createSnapshot(world: WorldState): SimulationSnapshot {
  return {
    tick: world.meta.tick,
    entities: inspectAllEntities(world),
    factions: inspectAllFactions(world),
    zones: inspectAllZones(world),
    rumorCount: getRumorLog(world).length,
    eventLogSize: world.eventLog.length,
  };
}

// --- Text Formatters (for CLI output) ---

/** Format entity inspection as readable text */
export function formatEntityInspection(inspection: EntityInspection): string {
  const lines: string[] = [];
  lines.push(`Entity: ${inspection.name} (${inspection.id})`);
  lines.push(`  Zone: ${inspection.zone ?? 'none'}`);
  lines.push(`  Faction: ${inspection.faction ?? 'none'}`);
  lines.push(`  Morale: ${inspection.cognition.morale}  Suspicion: ${inspection.cognition.suspicion}`);
  lines.push(`  Intent: ${inspection.cognition.currentIntent ?? 'none'}`);

  if (inspection.cognition.beliefs.length > 0) {
    lines.push(`  Beliefs (${inspection.cognition.beliefs.length}):`);
    for (const b of inspection.cognition.beliefs) {
      lines.push(`    ${b.subject}.${b.key} = ${b.value} (confidence: ${b.confidence.toFixed(2)}, source: ${b.source})`);
    }
  }

  if (inspection.perceptions.length > 0) {
    lines.push(`  Recent Perceptions (${inspection.perceptions.length}):`);
    for (const p of inspection.perceptions.slice(-5)) {
      lines.push(`    [tick ${p.tick}] ${p.detected ? 'detected' : 'missed'} via ${p.sense} (clarity: ${p.clarity.toFixed(2)})`);
    }
  }

  return lines.join('\n');
}

/** Format faction inspection as readable text */
export function formatFactionInspection(inspection: FactionInspection): string {
  const lines: string[] = [];
  lines.push(`Faction: ${inspection.id}`);
  lines.push(`  Members: ${inspection.members.join(', ')}`);
  lines.push(`  Alert Level: ${inspection.alertLevel}  Cohesion: ${inspection.cohesion.toFixed(2)}`);

  if (inspection.beliefs.length > 0) {
    lines.push(`  Beliefs (${inspection.beliefs.length}):`);
    for (const b of inspection.beliefs) {
      lines.push(`    ${b.subject}.${b.key} = ${b.value} (confidence: ${b.confidence.toFixed(2)}, sources: ${b.sourceEntities.join(', ')})`);
    }
  }

  if (inspection.recentRumors.length > 0) {
    lines.push(`  Recent Rumors (${inspection.recentRumors.length}):`);
    for (const r of inspection.recentRumors.slice(-5)) {
      lines.push(`    [tick ${r.originTick}] ${r.sourceEntityId} → ${r.subject}.${r.key} (distortion: ${r.distortion.toFixed(3)})`);
    }
  }

  return lines.join('\n');
}
