// faction-cognition — faction-level shared belief graphs
// Factions aggregate beliefs from members, producing collective awareness.
// Entity beliefs propagate to factions via rumor events with delay and distortion.

import type {
  EngineModule,
  WorldState,
  ResolvedEvent,
  ScalarValue,
} from '@signalfire/core';

// --- Types ---

export type FactionBelief = {
  subject: string;
  key: string;
  value: ScalarValue;
  confidence: number;
  sourceEntities: string[];
  lastUpdateTick: number;
  distortion: number;
};

export type FactionCognitionState = {
  beliefs: FactionBelief[];
  alertLevel: number;   // 0-100
  cohesion: number;     // 0-1, affects rumor confidence scaling
};

export type FactionMembership = {
  factionId: string;
  entityIds: string[];
  cohesion?: number;
};

export type FactionCognitionConfig = {
  factions: FactionMembership[];
};

type ModuleState = {
  factionCognition: Record<string, FactionCognitionState>;
  membership: Record<string, string>;         // entityId → factionId
  factionMembers: Record<string, string[]>;   // factionId → entityIds
};

// --- Module ---

export function createFactionCognition(config: FactionCognitionConfig): EngineModule {
  const membershipMap: Record<string, string> = {};
  const factionMembersMap: Record<string, string[]> = {};
  const initialCognition: Record<string, FactionCognitionState> = {};

  for (const faction of config.factions) {
    factionMembersMap[faction.factionId] = [...faction.entityIds];
    initialCognition[faction.factionId] = {
      beliefs: [],
      alertLevel: 0,
      cohesion: faction.cohesion ?? 0.8,
    };
    for (const entityId of faction.entityIds) {
      membershipMap[entityId] = faction.factionId;
    }
  }

  return {
    id: 'faction-cognition',
    version: '0.1.0',
    dependsOn: ['cognition-core'],

    register(ctx) {
      ctx.persistence.registerNamespace('faction-cognition', {
        factionCognition: initialCognition,
        membership: membershipMap,
        factionMembers: factionMembersMap,
      } as ModuleState);

      // Handle rumor propagation events → update faction beliefs
      ctx.events.on('rumor.belief.propagated', (event, world) => {
        handleRumorArrival(event, world);
      });

      // Register faction-tick verb for alert level decay
      ctx.actions.registerVerb('faction-tick', (_action, world) => {
        processFactionTick(world);
        return [];
      });
    },
  };
}

// --- State Access ---

function getModuleState(world: WorldState): ModuleState {
  return (world.modules['faction-cognition'] ?? {
    factionCognition: {},
    membership: {},
    factionMembers: {},
  }) as ModuleState;
}

/** Get cognition state for a faction */
export function getFactionCognition(world: WorldState, factionId: string): FactionCognitionState {
  const state = getModuleState(world);
  if (!state.factionCognition[factionId]) {
    state.factionCognition[factionId] = {
      beliefs: [],
      alertLevel: 0,
      cohesion: 0.8,
    };
  }
  return state.factionCognition[factionId];
}

/** Get the faction an entity belongs to */
export function getEntityFaction(world: WorldState, entityId: string): string | undefined {
  return getModuleState(world).membership[entityId];
}

/** Get all entity IDs in a faction */
export function getFactionMembers(world: WorldState, factionId: string): string[] {
  return getModuleState(world).factionMembers[factionId] ?? [];
}

// --- Faction Belief Operations ---

/** Set or update a faction belief */
export function setFactionBelief(
  factionState: FactionCognitionState,
  subject: string,
  key: string,
  value: ScalarValue,
  confidence: number,
  sourceEntityId: string,
  tick: number,
  distortion: number = 0,
): void {
  const existing = factionState.beliefs.find(
    (b) => b.subject === subject && b.key === key,
  );

  if (existing) {
    // Update if higher confidence or significantly newer
    if (confidence >= existing.confidence || tick > existing.lastUpdateTick + 5) {
      existing.value = value;
      existing.confidence = Math.min(1, confidence);
      existing.lastUpdateTick = tick;
      existing.distortion = Math.min(existing.distortion, distortion);
    }
    // Track corroborating sources
    if (!existing.sourceEntities.includes(sourceEntityId)) {
      existing.sourceEntities.push(sourceEntityId);
      // Multiple corroborating sources boost confidence
      existing.confidence = Math.min(1, existing.confidence + 0.05);
    }
  } else {
    factionState.beliefs.push({
      subject,
      key,
      value,
      confidence,
      sourceEntities: [sourceEntityId],
      lastUpdateTick: tick,
      distortion,
    });
  }
}

/** Get a specific faction belief */
export function getFactionBelief(
  factionState: FactionCognitionState,
  subject: string,
  key: string,
): FactionBelief | undefined {
  return factionState.beliefs.find((b) => b.subject === subject && b.key === key);
}

/** Check if a faction believes something */
export function factionBelieves(
  factionState: FactionCognitionState,
  subject: string,
  key: string,
  value?: ScalarValue,
): boolean {
  const belief = getFactionBelief(factionState, subject, key);
  if (!belief) return false;
  if (value !== undefined) return belief.value === value;
  return true;
}

/** Get all beliefs about a subject */
export function getFactionBeliefsAbout(
  factionState: FactionCognitionState,
  subject: string,
): FactionBelief[] {
  return factionState.beliefs.filter((b) => b.subject === subject);
}

// --- Internal ---

function handleRumorArrival(event: ResolvedEvent, world: WorldState): void {
  const {
    factionId,
    subject,
    key,
    value,
    confidence,
    sourceEntityId,
    distortion,
  } = event.payload as {
    factionId: string;
    subject: string;
    key: string;
    value: ScalarValue;
    confidence: number;
    sourceEntityId: string;
    distortion: number;
  };

  const factionCog = getFactionCognition(world, factionId);

  // Scale confidence by faction cohesion
  const effectiveConfidence = confidence * factionCog.cohesion;

  setFactionBelief(
    factionCog,
    subject,
    key,
    value,
    effectiveConfidence,
    sourceEntityId,
    event.tick,
    distortion,
  );

  // Hostile beliefs raise faction alert level
  if (key === 'hostile' && value === true) {
    factionCog.alertLevel = Math.min(
      100,
      factionCog.alertLevel + Math.round(20 * effectiveConfidence),
    );
  }
}

function processFactionTick(world: WorldState): void {
  const state = getModuleState(world);
  for (const factionCog of Object.values(state.factionCognition)) {
    // Alert level decays slowly
    if (factionCog.alertLevel > 0) {
      factionCog.alertLevel = Math.max(0, factionCog.alertLevel - 2);
    }
  }
}
