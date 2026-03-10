// simulation-inspector — observability layer for the simulation
// Registers debug inspectors that expose entity cognition, faction beliefs,
// perception events, rumor traces, environmental state, and district memory.

import type {
  EngineModule,
  WorldState,
} from '@ai-rpg-engine/core';
import { getCognition } from './cognition-core.js';
import type { Belief, Memory } from './cognition-core.js';
import { getPerceptionLog } from './perception-filter.js';
import type { PerceivedEvent } from './perception-filter.js';
import { getFactionCognition, getEntityFaction, getFactionMembers } from './faction-cognition.js';
import type { FactionCognitionState, FactionBelief } from './faction-cognition.js';
import { getRumorLog, getRumorsToFaction } from './rumor-propagation.js';
import type { RumorRecord } from './rumor-propagation.js';
import { getZoneProperty } from './environment-core.js';
import { getDistrictState, getDistrictDefinition, getAllDistrictIds, getDistrictThreatLevel } from './district-core.js';
import type { DistrictMetrics } from './district-core.js';
import { hasStatus } from './status-core.js';
import { COMBAT_STATES } from './combat-core.js';
import { ENGAGEMENT_STATES } from './engagement-core.js';
import { WOUND_STATUSES, MORALE_AFTERMATH_STATUSES } from './combat-recovery.js';
import { getEntityRole, BUILTIN_COMBAT_ROLES } from './combat-roles.js';
import type { CombatRole } from './combat-roles.js';

// --- Types ---

export type EntityInspection = {
  id: string;
  name: string;
  zone: string | undefined;
  faction: string | undefined;
  combatRole: CombatRole | undefined;
  cognition: {
    beliefs: Belief[];
    recentMemories: Memory[];
    morale: number;
    suspicion: number;
    currentIntent: string | null;
  };
  perceptions: PerceivedEvent[];
  combatState: {
    hp: number;
    maxHp: number;
    hpRatio: number;
    stamina: number;
    maxStamina: number;
    engagementStatuses: string[];
    combatStatuses: string[];
    woundStatus: string | null;
    moraleStatus: string | null;
  };
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

export type DistrictInspection = {
  id: string;
  name: string;
  zoneIds: string[];
  controllingFaction: string | undefined;
  metrics: DistrictMetrics;
  threatLevel: number;
  eventCount: number;
};

export type SimulationSnapshot = {
  tick: number;
  entities: Record<string, EntityInspection>;
  factions: Record<string, FactionInspection>;
  zones: Record<string, ZoneInspection>;
  districts: Record<string, DistrictInspection>;
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
        id: 'district-state',
        label: 'District State',
        inspect: (world) => inspectAllDistricts(world),
      });

      ctx.debug.registerInspector({
        id: 'combat-roles',
        label: 'Combat Role Analysis',
        inspect: (world) => {
          const results: Record<string, { role: CombatRole | undefined; biasName: string | undefined }> = {};
          for (const entity of Object.values(world.entities)) {
            if (entity.type !== 'enemy') continue;
            const role = getEntityRole(entity);
            results[entity.id] = {
              role,
              biasName: role ? BUILTIN_COMBAT_ROLES[role]?.bias.name : undefined,
            };
          }
          return results;
        },
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

  // Combat state
  const hp = entity.resources.hp ?? 0;
  const maxHp = entity.resources.maxHp ?? hp;
  const stamina = entity.resources.stamina ?? 0;
  const maxStamina = entity.resources.maxStamina ?? stamina;

  const engagementStatuses: string[] = [];
  if (hasStatus(entity, ENGAGEMENT_STATES.ENGAGED)) engagementStatuses.push('ENGAGED');
  if (hasStatus(entity, ENGAGEMENT_STATES.PROTECTED)) engagementStatuses.push('PROTECTED');
  if (hasStatus(entity, ENGAGEMENT_STATES.BACKLINE)) engagementStatuses.push('BACKLINE');
  if (hasStatus(entity, ENGAGEMENT_STATES.ISOLATED)) engagementStatuses.push('ISOLATED');

  const combatStatuses: string[] = [];
  if (hasStatus(entity, COMBAT_STATES.GUARDED)) combatStatuses.push('GUARDED');
  if (hasStatus(entity, COMBAT_STATES.EXPOSED)) combatStatuses.push('EXPOSED');
  if (hasStatus(entity, COMBAT_STATES.FLEEING)) combatStatuses.push('FLEEING');

  const woundStatus = hasStatus(entity, WOUND_STATUSES.CRITICAL) ? WOUND_STATUSES.CRITICAL
    : hasStatus(entity, WOUND_STATUSES.SERIOUS) ? WOUND_STATUSES.SERIOUS
    : hasStatus(entity, WOUND_STATUSES.LIGHT) ? WOUND_STATUSES.LIGHT
    : null;

  const moraleStatus = hasStatus(entity, MORALE_AFTERMATH_STATUSES.SHAKEN) ? MORALE_AFTERMATH_STATUSES.SHAKEN
    : hasStatus(entity, MORALE_AFTERMATH_STATUSES.EMBOLDENED) ? MORALE_AFTERMATH_STATUSES.EMBOLDENED
    : null;

  return {
    id: entity.id,
    name: entity.name,
    zone: entity.zoneId,
    faction: getEntityFaction(world, entityId),
    combatRole: getEntityRole(entity),
    cognition: {
      beliefs: cog.beliefs,
      recentMemories: cog.memories.slice(-10),
      morale: cog.morale,
      suspicion: cog.suspicion,
      currentIntent: cog.currentIntent,
    },
    perceptions: perceptions.slice(-20),
    combatState: {
      hp,
      maxHp,
      hpRatio: maxHp > 0 ? hp / maxHp : 0,
      stamina,
      maxStamina,
      engagementStatuses,
      combatStatuses,
      woundStatus,
      moraleStatus,
    },
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

// --- District Inspection ---

/** Inspect a single district */
export function inspectDistrict(world: WorldState, districtId: string): DistrictInspection | null {
  if (!world.modules['district-core']) return null;

  const state = getDistrictState(world, districtId);
  const def = getDistrictDefinition(world, districtId);
  if (!state || !def) return null;

  return {
    id: districtId,
    name: def.name,
    zoneIds: def.zoneIds,
    controllingFaction: def.controllingFaction,
    metrics: {
      alertPressure: state.alertPressure,
      rumorDensity: state.rumorDensity,
      intruderLikelihood: state.intruderLikelihood,
      surveillance: state.surveillance,
      stability: state.stability,
      commerce: state.commerce,
      morale: state.morale,
    },
    threatLevel: getDistrictThreatLevel(world, districtId),
    eventCount: state.eventCount,
  };
}

/** Inspect all districts */
export function inspectAllDistricts(world: WorldState): Record<string, DistrictInspection> {
  if (!world.modules['district-core']) return {};

  const result: Record<string, DistrictInspection> = {};
  for (const districtId of getAllDistrictIds(world)) {
    const inspection = inspectDistrict(world, districtId);
    if (inspection) result[districtId] = inspection;
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
    districts: inspectAllDistricts(world),
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
  if (inspection.combatRole) lines.push(`  Role: ${inspection.combatRole}`);
  const cs = inspection.combatState;
  lines.push(`  HP: ${cs.hp}/${cs.maxHp} (${(cs.hpRatio * 100).toFixed(0)}%)  Stamina: ${cs.stamina}/${cs.maxStamina}`);
  if (cs.engagementStatuses.length > 0) lines.push(`  Engagement: ${cs.engagementStatuses.join(', ')}`);
  if (cs.combatStatuses.length > 0) lines.push(`  Combat: ${cs.combatStatuses.join(', ')}`);
  if (cs.woundStatus) lines.push(`  Wound: ${cs.woundStatus}`);
  if (cs.moraleStatus) lines.push(`  Morale Effect: ${cs.moraleStatus}`);
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

/** Format district inspection as readable text */
export function formatDistrictInspection(inspection: DistrictInspection): string {
  const lines: string[] = [];
  lines.push(`District: ${inspection.name} (${inspection.id})`);
  lines.push(`  Zones: ${inspection.zoneIds.join(', ')}`);
  lines.push(`  Controlling Faction: ${inspection.controllingFaction ?? 'none'}`);
  lines.push(`  Threat Level: ${inspection.threatLevel}`);
  lines.push(`  Metrics:`);
  lines.push(`    Alert Pressure: ${inspection.metrics.alertPressure.toFixed(1)}`);
  lines.push(`    Rumor Density: ${inspection.metrics.rumorDensity.toFixed(1)}`);
  lines.push(`    Intruder Likelihood: ${inspection.metrics.intruderLikelihood.toFixed(1)}`);
  lines.push(`    Surveillance: ${inspection.metrics.surveillance.toFixed(1)}`);
  lines.push(`    Stability: ${inspection.metrics.stability.toFixed(1)}`);
  lines.push(`  Events Recorded: ${inspection.eventCount}`);
  return lines.join('\n');
}
