// belief-provenance — end-to-end belief trace reconstruction
// Answers "why does X believe Y?" by correlating data from perception,
// cognition, rumor, and faction modules. No new state — reads existing logs.

import type {
  EngineModule,
  WorldState,
  ResolvedEvent,
  ScalarValue,
} from '@ai-rpg-engine/core';
import { getCognition, getBelief } from './cognition-core.js';
import type { Belief, CognitionState } from './cognition-core.js';
import { getPerceptionLog } from './perception-filter.js';
import type { PerceivedEvent } from './perception-filter.js';
import { getFactionCognition, getEntityFaction, getFactionBelief } from './faction-cognition.js';
import type { FactionBelief } from './faction-cognition.js';
import { getRumorLog, getRumorsToFaction } from './rumor-propagation.js';
import type { RumorRecord } from './rumor-propagation.js';

// --- Types ---

export type TraceStep = {
  tick: number;
  type: 'source-event' | 'perceived' | 'missed' | 'belief-formed'
    | 'rumor-scheduled' | 'rumor-delivered' | 'faction-belief-updated'
    | 'decayed' | 'reinforced' | 'pruned';
  description: string;
  data: Record<string, unknown>;
};

export type BeliefTrace = {
  subject: string;
  key: string;
  holder: { type: 'entity'; id: string } | { type: 'faction'; id: string };
  currentValue: ScalarValue | undefined;
  currentConfidence: number;
  chain: TraceStep[];
};

// --- Module ---

export function createBeliefProvenance(): EngineModule {
  return {
    id: 'belief-provenance',
    version: '0.1.0',
    dependsOn: ['cognition-core'],

    register(_ctx) {
      // Pure query module — no state, no event listeners
      // All trace reconstruction happens via exported functions
    },
  };
}

// --- Trace API ---

/**
 * Trace the provenance of an entity's belief.
 * Reconstructs the chain: source event → perception → belief formation → rumor → faction.
 */
export function traceEntityBelief(
  world: WorldState,
  entityId: string,
  subject: string,
  key: string,
): BeliefTrace {
  const cognition = getCognition(world, entityId);
  const belief = getBelief(cognition, subject, key);
  const chain: TraceStep[] = [];

  // Step 1: Find source events involving the subject
  const relevantEvents = findRelevantEvents(world, subject, key);

  for (const event of relevantEvents) {
    chain.push({
      tick: event.tick,
      type: 'source-event',
      description: `${event.type} involving ${subject}`,
      data: {
        eventId: event.id,
        eventType: event.type,
        actorId: event.actorId,
        targetIds: event.targetIds,
      },
    });

    // Step 2: Check if this entity perceived the event
    if (world.modules['perception-filter']) {
      const perceptionLog = getPerceptionLog(world, entityId);
      const perception = perceptionLog.find((p) => p.eventId === event.id);

      if (perception) {
        chain.push({
          tick: perception.tick,
          type: perception.detected ? 'perceived' : 'missed',
          description: perception.detected
            ? `${entityId} detected via ${perception.sense} (clarity: ${perception.clarity.toFixed(2)})`
            : `${entityId} missed via ${perception.sense} (clarity: ${perception.clarity.toFixed(2)})`,
          data: {
            eventId: event.id,
            entityId,
            sense: perception.sense,
            clarity: perception.clarity,
            interpretation: perception.interpretation,
          },
        });
      }
    }
  }

  // Step 3: Record belief formation
  if (belief) {
    chain.push({
      tick: belief.tick,
      type: 'belief-formed',
      description: `${entityId} believes ${subject}.${key} = ${belief.value} (confidence: ${belief.confidence.toFixed(2)}, source: ${belief.source})`,
      data: {
        entityId,
        subject: belief.subject,
        key: belief.key,
        value: belief.value,
        confidence: belief.confidence,
        source: belief.source,
      },
    });
  }

  // Step 4: Check for rumor propagation from this entity
  if (world.modules['rumor-propagation']) {
    const rumors = getRumorLog(world).filter(
      (r) => r.sourceEntityId === entityId && r.subject === subject && r.key === key,
    );
    for (const rumor of rumors) {
      chain.push({
        tick: rumor.originTick,
        type: 'rumor-scheduled',
        description: `${entityId} rumored ${subject}.${key} to faction ${rumor.targetFactionId} (distortion: ${rumor.distortion.toFixed(3)})`,
        data: {
          rumorId: rumor.id,
          sourceEntityId: rumor.sourceEntityId,
          targetFactionId: rumor.targetFactionId,
          confidence: rumor.confidence,
          distortion: rumor.distortion,
          hops: rumor.hops,
        },
      });
    }
  }

  // Sort chain chronologically
  chain.sort((a, b) => a.tick - b.tick);

  return {
    subject,
    key,
    holder: { type: 'entity', id: entityId },
    currentValue: belief?.value,
    currentConfidence: belief?.confidence ?? 0,
    chain,
  };
}

/**
 * Trace the provenance of a faction's belief.
 * Reconstructs: source events → entity perceptions → rumors → faction belief.
 */
export function traceFactionBelief(
  world: WorldState,
  factionId: string,
  subject: string,
  key: string,
): BeliefTrace {
  const factionCog = getFactionCognition(world, factionId);
  const factionBelief = getFactionBelief(factionCog, subject, key);
  const chain: TraceStep[] = [];

  // Find rumors that contributed to this faction belief
  const rumors = getRumorsToFaction(world, factionId).filter(
    (r) => r.subject === subject && r.key === key,
  );

  for (const rumor of rumors) {
    // Trace back to the entity's belief and perception
    const entityTrace = traceEntityBelief(world, rumor.sourceEntityId, subject, key);
    // Include entity chain steps (avoiding duplicates)
    for (const step of entityTrace.chain) {
      if (!chain.find((s) => s.tick === step.tick && s.type === step.type && s.data.entityId === step.data.entityId)) {
        chain.push(step);
      }
    }

    // Add rumor delivery
    chain.push({
      tick: rumor.originTick + 1, // approximate delivery tick
      type: 'rumor-delivered',
      description: `Rumor from ${rumor.sourceEntityId} delivered to faction ${factionId} (confidence: ${rumor.confidence.toFixed(2)}, distortion: ${rumor.distortion.toFixed(3)})`,
      data: {
        rumorId: rumor.id,
        sourceEntityId: rumor.sourceEntityId,
        factionId,
        confidence: rumor.confidence,
        distortion: rumor.distortion,
      },
    });
  }

  // Add faction belief state
  if (factionBelief) {
    chain.push({
      tick: factionBelief.lastUpdateTick,
      type: 'faction-belief-updated',
      description: `Faction ${factionId} believes ${subject}.${key} = ${factionBelief.value} (confidence: ${factionBelief.confidence.toFixed(2)}, ${factionBelief.sourceEntities.length} sources)`,
      data: {
        factionId,
        subject: factionBelief.subject,
        key: factionBelief.key,
        value: factionBelief.value,
        confidence: factionBelief.confidence,
        sourceEntities: factionBelief.sourceEntities,
        distortion: factionBelief.distortion,
      },
    });
  }

  // Sort chronologically
  chain.sort((a, b) => a.tick - b.tick);

  return {
    subject,
    key,
    holder: { type: 'faction', id: factionId },
    currentValue: factionBelief?.value,
    currentConfidence: factionBelief?.confidence ?? 0,
    chain,
  };
}

/**
 * Trace all beliefs held about a subject across all entities and factions.
 */
export function traceSubject(
  world: WorldState,
  subject: string,
): BeliefTrace[] {
  const traces: BeliefTrace[] = [];

  // Check all entity cognitions
  const cogStates = (world.modules['cognition-core'] as {
    entityCognition: Record<string, CognitionState>;
  })?.entityCognition ?? {};

  for (const [entityId, cog] of Object.entries(cogStates)) {
    const beliefs = cog.beliefs.filter((b) => b.subject === subject);
    for (const belief of beliefs) {
      traces.push(traceEntityBelief(world, entityId, subject, belief.key));
    }
  }

  // Check all faction beliefs
  if (world.modules['faction-cognition']) {
    const factionState = world.modules['faction-cognition'] as {
      factionCognition: Record<string, { beliefs: FactionBelief[] }>;
    };
    for (const [factionId, fCog] of Object.entries(factionState.factionCognition)) {
      const beliefs = fCog.beliefs.filter((b) => b.subject === subject);
      for (const belief of beliefs) {
        traces.push(traceFactionBelief(world, factionId, subject, belief.key));
      }
    }
  }

  return traces;
}

// --- Formatting (B3) ---

/**
 * Format a belief trace as a human-readable forensic narrative.
 */
export function formatBeliefTrace(trace: BeliefTrace): string {
  const lines: string[] = [];
  const holderLabel = trace.holder.type === 'entity'
    ? `Entity ${trace.holder.id}`
    : `Faction ${trace.holder.id}`;

  lines.push(`Belief Trace: ${holderLabel}`);
  lines.push(`  Subject: ${trace.subject}`);
  lines.push(`  Key: ${trace.key}`);
  lines.push(`  Current: ${trace.currentValue ?? 'none'} (confidence: ${trace.currentConfidence.toFixed(2)})`);
  lines.push('');
  lines.push('  Chain:');

  for (const step of trace.chain) {
    const icon = getStepIcon(step.type);
    lines.push(`    [tick ${step.tick}] ${icon} ${step.description}`);
  }

  if (trace.chain.length === 0) {
    lines.push('    (no trace data available)');
  }

  return lines.join('\n');
}

function getStepIcon(type: TraceStep['type']): string {
  switch (type) {
    case 'source-event': return 'EVENT';
    case 'perceived': return 'SEEN';
    case 'missed': return 'MISSED';
    case 'belief-formed': return 'BELIEF';
    case 'rumor-scheduled': return 'RUMOR>';
    case 'rumor-delivered': return 'RUMOR<';
    case 'faction-belief-updated': return 'FACTION';
    case 'decayed': return 'DECAY';
    case 'reinforced': return 'REINF';
    case 'pruned': return 'PRUNED';
    default: return '???';
  }
}

// --- Internal ---

function findRelevantEvents(
  world: WorldState,
  subject: string,
  key: string,
): ResolvedEvent[] {
  return world.eventLog.filter((event) => {
    // Events where the subject is involved
    if (event.actorId === subject) return true;
    if (event.targetIds?.includes(subject)) return true;
    // Events with matching payload fields
    if (event.payload.entityId === subject) return true;
    if (event.payload.attackerId === subject) return true;
    if (event.payload.targetId === subject) return true;
    return false;
  });
}
