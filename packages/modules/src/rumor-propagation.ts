// rumor-propagation — belief transport between entities and factions
// When an entity perceives something significant and belongs to a faction,
// that knowledge propagates to the faction after a delay, with distortion.
// Rumors are imperfect. Clarity, environment, cohesion all affect accuracy.

import type {
  EngineModule,
  WorldState,
  ResolvedEvent,
  ScalarValue,
} from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import { getCognition, getBelief } from './cognition-core.js';
import type { Belief } from './cognition-core.js';
import { getEntityFaction } from './faction-cognition.js';
import { getZoneProperty } from './environment-core.js';

// --- Types ---

export type RumorRecord = {
  id: string;
  sourceEntityId: string;
  targetFactionId: string;
  subject: string;
  key: string;
  value: ScalarValue;
  confidence: number;
  distortion: number;
  originTick: number;
  hops: number;
};

export type RumorPropagationConfig = {
  /** Ticks delay before a belief propagates to faction (default: 2) */
  propagationDelay?: number;
  /** Base distortion per propagation hop (default: 0.05) */
  distortionPerHop?: number;
  /** Minimum confidence to propagate (default: 0.3) */
  confidenceThreshold?: number;
  /** Environmental instability multiplier for distortion (default: 0.1) */
  instabilityDistortionFactor?: number;
};

type ModuleState = {
  rumorLog: RumorRecord[];
  /** Dedup: "entityId:subject:key" → last propagated tick */
  lastPropagated: Record<string, number>;
};

// --- Module ---

const DEFAULT_DELAY = 2;
const DEFAULT_DISTORTION = 0.05;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.3;
const DEFAULT_INSTABILITY_FACTOR = 0.1;

export function createRumorPropagation(config?: RumorPropagationConfig): EngineModule {
  const delay = config?.propagationDelay ?? DEFAULT_DELAY;
  const distortionPerHop = config?.distortionPerHop ?? DEFAULT_DISTORTION;
  const confidenceThreshold = config?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const instabilityFactor = config?.instabilityDistortionFactor ?? DEFAULT_INSTABILITY_FACTOR;

  return {
    id: 'rumor-propagation',
    version: '0.1.0',
    dependsOn: ['cognition-core', 'faction-cognition'],

    register(ctx) {
      ctx.persistence.registerNamespace('rumor-propagation', {
        rumorLog: [],
        lastPropagated: {},
      } as ModuleState);

      const triggers = [
        'combat.contact.hit',
        'combat.contact.miss',
        'combat.entity.defeated',
        'world.zone.entered',
      ];

      for (const trigger of triggers) {
        ctx.events.on(trigger, (event, world) => {
          scheduleRumors(event, world, delay, distortionPerHop, confidenceThreshold, instabilityFactor);
        });
      }
    },
  };
}

// --- Core Logic ---

function scheduleRumors(
  event: ResolvedEvent,
  world: WorldState,
  delay: number,
  distortionPerHop: number,
  confidenceThreshold: number,
  instabilityFactor: number,
): void {
  const state = getRumorState(world);

  for (const entity of Object.values(world.entities)) {
    if (!entity.ai) continue;

    const factionId = getEntityFaction(world, entity.id);
    if (!factionId) continue;

    // Check if this entity is involved in or aware of the event
    if (!isRelevantToEntity(event, entity.id, world)) continue;

    const cognition = getCognition(world, entity.id);
    const beliefsToPropagate = extractRelevantBeliefs(event, entity.id, cognition);

    for (const belief of beliefsToPropagate) {
      if (belief.confidence < confidenceThreshold) continue;

      // Dedup: don't re-propagate same belief too frequently
      const dedupKey = `${entity.id}:${belief.subject}:${belief.key}`;
      const lastTick = state.lastPropagated[dedupKey];
      if (lastTick !== undefined && event.tick - lastTick < delay * 2) continue;

      // Environmental instability adds distortion
      const envInstability = getEnvironmentInstability(world, entity.zoneId);
      const distortion = distortionPerHop + envInstability * instabilityFactor;
      const propagatedConfidence = belief.confidence * (1 - distortion);

      // Schedule delayed propagation via PendingEffect
      world.pending.push({
        id: nextId('pend'),
        type: 'rumor.belief.propagated',
        executeAtTick: event.tick + delay,
        payload: {
          factionId,
          subject: belief.subject,
          key: belief.key,
          value: belief.value,
          confidence: propagatedConfidence,
          sourceEntityId: entity.id,
          distortion,
          originTick: event.tick,
          hops: 1,
        },
        sourceEventId: event.id,
      });

      // Record in rumor log
      state.rumorLog.push({
        id: nextId('rumor'),
        sourceEntityId: entity.id,
        targetFactionId: factionId,
        subject: belief.subject,
        key: belief.key,
        value: belief.value,
        confidence: propagatedConfidence,
        distortion,
        originTick: event.tick,
        hops: 1,
      });

      state.lastPropagated[dedupKey] = event.tick;
    }
  }
}

function isRelevantToEntity(event: ResolvedEvent, entityId: string, world: WorldState): boolean {
  // Direct participant
  if (event.actorId === entityId) return true;
  if (event.targetIds?.includes(entityId)) return true;

  // Same zone as the event
  const entity = world.entities[entityId];
  if (!entity?.zoneId) return false;
  const eventZone = getEventZone(event, world);
  return entity.zoneId === eventZone;
}

function extractRelevantBeliefs(
  event: ResolvedEvent,
  entityId: string,
  cognition: { beliefs: Belief[] },
): Array<{ subject: string; key: string; value: ScalarValue; confidence: number }> {
  const results: Array<{ subject: string; key: string; value: ScalarValue; confidence: number }> = [];
  const type = event.type;

  if (type === 'combat.contact.hit' || type === 'combat.contact.miss') {
    const attackerId = event.payload.attackerId as string;

    // Propagate hostile belief about the attacker
    const hostile = getBelief(cognition as any, attackerId, 'hostile');
    if (hostile) {
      results.push({ subject: hostile.subject, key: hostile.key, value: hostile.value, confidence: hostile.confidence });
    }
  }

  if (type === 'combat.entity.defeated') {
    const defeatedId = event.payload.entityId as string;
    const alive = getBelief(cognition as any, defeatedId, 'alive');
    if (alive) {
      results.push({ subject: alive.subject, key: alive.key, value: alive.value, confidence: alive.confidence });
    }
  }

  if (type === 'world.zone.entered') {
    const actorId = event.actorId;
    if (actorId && actorId !== entityId) {
      const present = getBelief(cognition as any, actorId, 'present');
      if (present) {
        results.push({ subject: present.subject, key: present.key, value: present.value, confidence: present.confidence });
      }
    }
  }

  return results;
}

function getEnvironmentInstability(world: WorldState, zoneId: string | undefined): number {
  if (!zoneId || !world.modules['environment-core']) return 0;
  const noise = getZoneProperty(world, zoneId, 'noise');
  const stability = getZoneProperty(world, zoneId, 'stability');
  return Math.min(1, noise * 0.1 + Math.max(0, (5 - stability) * 0.1));
}

function getEventZone(event: ResolvedEvent, world: WorldState): string | undefined {
  if (event.payload.zoneId) return event.payload.zoneId as string;
  if (event.actorId) return world.entities[event.actorId]?.zoneId;
  if (event.targetIds?.[0]) return world.entities[event.targetIds[0]]?.zoneId;
  return undefined;
}

// --- Query API ---

function getRumorState(world: WorldState): ModuleState {
  return (world.modules['rumor-propagation'] ?? {
    rumorLog: [],
    lastPropagated: {},
  }) as ModuleState;
}

/** Get all rumors from a specific entity */
export function getRumorsFrom(world: WorldState, entityId: string): RumorRecord[] {
  return getRumorState(world).rumorLog.filter((r) => r.sourceEntityId === entityId);
}

/** Get all rumors targeting a faction */
export function getRumorsToFaction(world: WorldState, factionId: string): RumorRecord[] {
  return getRumorState(world).rumorLog.filter((r) => r.targetFactionId === factionId);
}

/** Get the full rumor log */
export function getRumorLog(world: WorldState): RumorRecord[] {
  return getRumorState(world).rumorLog;
}
