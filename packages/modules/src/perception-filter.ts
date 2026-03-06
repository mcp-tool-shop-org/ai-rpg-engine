// perception-filter — entity-level truth layers
// Each entity perceives events through their own cognitive filters.
// When loaded alongside cognition-core, replaces naive "all entities in zone know"
// with perception-checked awareness. Direct participants always know what happened.

import type {
  EngineModule,
  EntityState,
  WorldState,
  ResolvedEvent,
  ScalarValue,
} from '@signalfire/core';
import {
  getCognition,
  setBelief,
  addMemory,
} from './cognition-core.js';

// --- Types ---

export type SenseType = 'sight' | 'hearing' | 'smell' | 'tremorsense' | 'thermal' | 'network';

export type PerceivedEvent = {
  eventId: string;
  entityId: string;
  tick: number;
  detected: boolean;
  /** 0-1: how clearly they perceived it */
  clarity: number;
  sense: SenseType;
  interpretation: 'full' | 'partial' | 'none';
  data?: Record<string, unknown>;
};

export type PerceptionLayer = {
  id: string;
  /** What event types this layer handles (exact match or domain wildcard like 'combat.*') */
  eventPatterns: string[];
  /** What sense is required */
  sense: SenseType;
  /** Base detection difficulty */
  baseDifficulty: number;
  /** Can be detected from adjacent zones? */
  crossZone?: boolean;
  /** How to process a successfully perceived event */
  onPerceived: (event: ResolvedEvent, entity: EntityState, clarity: number, world: WorldState) => void;
  /** What partial info leaks on failed perception (clarity > 0.15) */
  onPartial?: (event: ResolvedEvent, entity: EntityState, clarity: number, world: WorldState) => void;
};

export type PerceptionFilterConfig = {
  /** Custom perception layers (added to built-ins) */
  layers?: PerceptionLayer[];
  /** Default perception stat name (default: 'instinct') */
  perceptionStat?: string;
  /** Per-sense stat overrides */
  senseStats?: Partial<Record<SenseType, string>>;
};

// --- Module ---

const DEFAULT_PERCEPTION_STAT = 'instinct';

export function createPerceptionFilter(config?: PerceptionFilterConfig): EngineModule {
  const perceptionStat = config?.perceptionStat ?? DEFAULT_PERCEPTION_STAT;
  const senseStats = config?.senseStats ?? {};
  const customLayers = config?.layers ?? [];

  // Combine built-in layers with custom ones
  const allLayers: PerceptionLayer[] = [
    ...getBuiltinLayers(),
    ...customLayers,
  ];

  return {
    id: 'perception-filter',
    version: '0.1.0',
    dependsOn: ['cognition-core'],

    register(ctx) {
      ctx.persistence.registerNamespace('perception-filter', {
        perceptionLog: {} as Record<string, PerceivedEvent[]>,
      });

      // Catch-all listener that routes events through perception layers
      ctx.events.on('*', (event, world) => {
        processEvent(event, world, allLayers, perceptionStat, senseStats);
      });
    },
  };
}

// --- Core Processing ---

function processEvent(
  event: ResolvedEvent,
  world: WorldState,
  layers: PerceptionLayer[],
  defaultStat: string,
  senseStats: Partial<Record<SenseType, string>>,
): void {
  // Find matching layers for this event type
  const matchingLayers = layers.filter((layer) =>
    layer.eventPatterns.some((pattern) => matchEventPattern(event.type, pattern)),
  );

  if (matchingLayers.length === 0) return;

  // Determine where this event occurred
  const eventZone = getEventZone(event, world);
  if (!eventZone) return;

  const actorId = event.actorId;

  for (const entity of Object.values(world.entities)) {
    // Skip the actor (they know what they did)
    if (entity.id === actorId) continue;
    // Skip direct targets (cognition-core handles direct experience)
    if (event.targetIds?.includes(entity.id)) continue;
    // Skip non-AI entities
    if (!entity.ai) continue;

    for (const layer of matchingLayers) {
      const isInZone = entity.zoneId === eventZone;
      const isAdjacent = layer.crossZone === true && isAdjacentZone(entity.zoneId, eventZone, world);

      if (!isInZone && !isAdjacent) continue;

      // Determine the stat for this sense
      const stat = senseStats[layer.sense] ?? defaultStat;

      // Run perception check
      const difficulty = layer.baseDifficulty + (isAdjacent ? 15 : 0);
      const targetEntity = actorId ? world.entities[actorId] : undefined;

      const result = runPerceptionCheck(entity, targetEntity, world, stat, difficulty, layer.sense);

      // Calculate clarity
      let clarity: number;
      if (result.detected) {
        const margin = result.roll - result.threshold;
        clarity = Math.min(1, 0.5 + margin / 30);
      } else {
        const deficit = result.threshold - result.roll;
        clarity = Math.max(0, 0.4 - deficit / 20);
      }

      // Record perception
      const perceived: PerceivedEvent = {
        eventId: event.id,
        entityId: entity.id,
        tick: event.tick,
        detected: result.detected,
        clarity,
        sense: layer.sense,
        interpretation: result.detected
          ? (clarity > 0.7 ? 'full' : 'partial')
          : (clarity > 0.15 ? 'partial' : 'none'),
      };

      logPerception(world, perceived);

      // Apply perception results
      if (result.detected) {
        layer.onPerceived(event, entity, clarity, world);
      } else if (clarity > 0.15 && layer.onPartial) {
        layer.onPartial(event, entity, clarity, world);
      }
    }
  }
}

// --- Built-in Layers ---

function getBuiltinLayers(): PerceptionLayer[] {
  return [
    // Visual: zone entry
    {
      id: 'visual-movement',
      eventPatterns: ['world.zone.entered'],
      sense: 'sight',
      baseDifficulty: 30,
      crossZone: false,
      onPerceived(event, entity, clarity, world) {
        const cog = getCognition(world, entity.id);
        const actorId = event.actorId!;
        const zoneId = event.payload.zoneId as string;

        setBelief(cog, actorId, 'present', true, clarity, 'observed', event.tick);
        setBelief(cog, actorId, 'location', zoneId, clarity, 'observed', event.tick);
        addMemory(cog, 'saw-entity', event.tick,
          { entityId: actorId as ScalarValue, zoneId: zoneId as ScalarValue },
          actorId, zoneId);
      },
      onPartial(event, entity, clarity, world) {
        const cog = getCognition(world, entity.id);
        // Sensed something but didn't see who
        addMemory(cog, 'sensed-presence', event.tick, {
          zoneId: event.payload.zoneId as ScalarValue,
          certainty: clarity,
        });
        cog.suspicion = Math.min(100, cog.suspicion + Math.round(20 * clarity));
      },
    },

    // Visual: combat events (same zone)
    {
      id: 'visual-combat',
      eventPatterns: ['combat.contact.hit', 'combat.contact.miss'],
      sense: 'sight',
      baseDifficulty: 20, // Combat is loud and visible
      crossZone: false,
      onPerceived(event, entity, clarity, world) {
        const cog = getCognition(world, entity.id);
        const attackerId = event.payload.attackerId as string;
        const targetId = event.payload.targetId as string;

        if (clarity > 0.5) {
          // High clarity: know exactly who is hostile
          setBelief(cog, attackerId, 'hostile', true, clarity * 0.8, 'observed', event.tick);
          addMemory(cog, 'saw-combat', event.tick,
            { attackerId: attackerId as ScalarValue, targetId: targetId as ScalarValue },
            undefined, entity.zoneId);
        } else {
          // Low clarity: know there's danger but not who
          addMemory(cog, 'sensed-danger', event.tick,
            { certainty: clarity }, undefined, entity.zoneId);
        }
        cog.suspicion = Math.min(100, cog.suspicion + Math.round(25 * clarity));
      },
    },

    // Auditory: combat sounds carry to adjacent zones
    {
      id: 'auditory-combat',
      eventPatterns: ['combat.contact.hit', 'combat.contact.miss'],
      sense: 'hearing',
      baseDifficulty: 25,
      crossZone: true,
      onPerceived(event, entity, clarity, world) {
        const cog = getCognition(world, entity.id);
        const sourceZone = getEventZone(event, world);

        addMemory(cog, 'heard-combat', event.tick, {
          direction: (sourceZone ?? 'unknown') as ScalarValue,
          certainty: clarity,
        }, undefined, entity.zoneId);

        cog.suspicion = Math.min(100, cog.suspicion + Math.round(15 * clarity));
      },
      onPartial(event, entity, clarity, world) {
        const cog = getCognition(world, entity.id);
        addMemory(cog, 'heard-noise', event.tick, { certainty: clarity });
        cog.suspicion = Math.min(100, cog.suspicion + 5);
      },
    },

    // Visual: entity defeat
    {
      id: 'visual-defeat',
      eventPatterns: ['combat.entity.defeated'],
      sense: 'sight',
      baseDifficulty: 15, // Very noticeable
      crossZone: false,
      onPerceived(event, entity, clarity, world) {
        const cog = getCognition(world, entity.id);
        const defeatedId = event.payload.entityId as string;

        setBelief(cog, defeatedId, 'alive', false, clarity, 'observed', event.tick);
        addMemory(cog, 'saw-defeat', event.tick,
          { entityId: defeatedId as ScalarValue }, defeatedId, entity.zoneId);

        // Seeing an ally fall tanks morale
        cog.morale = Math.max(0, cog.morale - Math.round(15 * clarity));
      },
    },
  ];
}

// --- Perception Check ---

function runPerceptionCheck(
  observer: EntityState,
  target: EntityState | undefined,
  world: WorldState,
  stat: string,
  baseDifficulty: number,
  sense: SenseType,
): { detected: boolean; roll: number; threshold: number } {
  const zone = world.zones[observer.zoneId ?? ''];
  let threshold = baseDifficulty;

  // Light affects visual perception
  if (sense === 'sight') {
    const light = zone?.light ?? 5;
    threshold -= (light - 5) * 2;
  }

  // Ambient noise affects hearing (high noise = harder to pick out sounds)
  if (sense === 'hearing') {
    const noise = zone?.noise ?? 0;
    threshold += noise * 2;
  }

  // Target visibility
  if (target?.visibility?.hidden) {
    threshold += 20;
  }

  const statValue = observer.stats[stat] ?? 5;
  const targetId = target?.id ?? 'env';
  const roll = perceptionRoll(world.meta.tick, observer.id, targetId, sense);
  const score = statValue * 7 + roll;

  return { detected: score >= threshold, roll: score, threshold };
}

function perceptionRoll(tick: number, observerId: string, targetId: string, sense: SenseType): number {
  let hash = tick * 2654435761;
  for (const char of observerId + targetId + sense) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return (Math.abs(hash) % 50) + 1; // 1-50
}

// --- Helpers ---

function getEventZone(event: ResolvedEvent, world: WorldState): string | undefined {
  if (event.payload.zoneId) return event.payload.zoneId as string;
  if (event.actorId) return world.entities[event.actorId]?.zoneId;
  if (event.targetIds?.[0]) return world.entities[event.targetIds[0]]?.zoneId;
  return undefined;
}

function isAdjacentZone(entityZoneId: string | undefined, eventZoneId: string, world: WorldState): boolean {
  if (!entityZoneId) return false;
  const zone = world.zones[entityZoneId];
  return zone?.neighbors.includes(eventZoneId) ?? false;
}

function matchEventPattern(eventType: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) {
    return eventType.startsWith(pattern.slice(0, -2) + '.');
  }
  return eventType === pattern;
}

function logPerception(world: WorldState, perceived: PerceivedEvent): void {
  const mod = world.modules['perception-filter'] as
    { perceptionLog: Record<string, PerceivedEvent[]> } | undefined;
  if (!mod) return;
  if (!mod.perceptionLog[perceived.entityId]) {
    mod.perceptionLog[perceived.entityId] = [];
  }
  mod.perceptionLog[perceived.entityId].push(perceived);
}

// --- Query API ---

/** Get all perception log entries for an entity */
export function getPerceptionLog(world: WorldState, entityId: string): PerceivedEvent[] {
  const mod = world.modules['perception-filter'] as
    { perceptionLog: Record<string, PerceivedEvent[]> } | undefined;
  return mod?.perceptionLog[entityId] ?? [];
}

/** Get recent perceptions within a tick window */
export function getRecentPerceptions(
  world: WorldState,
  entityId: string,
  withinTicks: number,
): PerceivedEvent[] {
  const log = getPerceptionLog(world, entityId);
  const currentTick = world.meta.tick;
  return log.filter((p) => currentTick - p.tick <= withinTicks);
}

/** Check if an entity perceived a specific event */
export function didPerceive(
  world: WorldState,
  entityId: string,
  eventId: string,
): PerceivedEvent | undefined {
  return getPerceptionLog(world, entityId).find((p) => p.eventId === eventId);
}

/** Get all entities that perceived a specific event */
export function whoPerceived(
  world: WorldState,
  eventId: string,
): PerceivedEvent[] {
  const mod = world.modules['perception-filter'] as
    { perceptionLog: Record<string, PerceivedEvent[]> } | undefined;
  if (!mod) return [];
  const results: PerceivedEvent[] = [];
  for (const entries of Object.values(mod.perceptionLog)) {
    const match = entries.find((p) => p.eventId === eventId);
    if (match) results.push(match);
  }
  return results;
}
