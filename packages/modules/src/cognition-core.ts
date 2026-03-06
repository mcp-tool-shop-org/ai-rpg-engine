// cognition-core — AI knowledge, perception, intent, and memory

import type {
  EngineModule,
  EntityState,
  WorldState,
  ResolvedEvent,
  ScalarValue,
  ActionIntent,
  ZoneState,
} from '@signalfire/core';
import { nextId } from '@signalfire/core';

// --- Knowledge Model ---

export type Belief = {
  subject: string;     // what this belief is about (entityId, zoneId, fact key)
  key: string;         // the property (e.g. "location", "hostile", "alive")
  value: ScalarValue;  // what the entity believes
  confidence: number;  // 0-1, how sure they are
  source: string;      // how they learned it: 'observed' | 'told' | 'assumed' | 'inferred'
  tick: number;        // when they learned/updated it
};

export type Memory = {
  id: string;
  type: string;        // e.g. 'saw-entity', 'heard-combat', 'was-attacked'
  tick: number;
  entityId?: string;
  zoneId?: string;
  data: Record<string, ScalarValue>;
};

export type CognitionState = {
  beliefs: Belief[];
  memories: Memory[];
  currentIntent: string | null;
  morale: number;      // 0-100, affects fight/flee decisions
  suspicion: number;   // 0-100, affects alert behavior
};

// --- Perception ---

export type PerceptionCheck = {
  /** Can the observer detect the target? */
  observerId: string;
  targetId: string;
  /** Detection difficulty (higher = harder to detect) */
  difficulty: number;
  /** What stat governs perception for this check */
  stat: string;
  /** Environment modifiers */
  modifiers: { source: string; value: number }[];
};

export type PerceptionResult = {
  detected: boolean;
  roll: number;
  threshold: number;
  observerId: string;
  targetId: string;
};

// --- Intent Selection ---

export type IntentOption = {
  verb: string;
  targetIds?: string[];
  priority: number;    // higher = more likely
  reason: string;      // why AI chose this
};

export type IntentProfile = {
  id: string;
  /** Generate possible intents given entity state and cognition */
  evaluate: (entity: EntityState, cognition: CognitionState, world: WorldState) => IntentOption[];
};

// --- Module ---

const DEFAULT_MORALE = 70;
const DEFAULT_SUSPICION = 0;

export function createCognitionCore(profiles?: IntentProfile[]): EngineModule {
  const profileMap = new Map<string, IntentProfile>();
  for (const p of profiles ?? []) {
    profileMap.set(p.id, p);
  }

  return {
    id: 'cognition-core',
    version: '0.1.0',

    register(ctx) {
      ctx.persistence.registerNamespace('cognition-core', {
        entityCognition: {} as Record<string, CognitionState>,
      });

      // Listen to events to update entity knowledge
      ctx.events.on('world.zone.entered', (event, world) => {
        updatePerceptions(event, world, getModuleState(world));
      });

      ctx.events.on('combat.contact.hit', (event, world) => {
        recordCombatMemory(event, world, getModuleState(world));
      });

      ctx.events.on('combat.contact.miss', (event, world) => {
        recordCombatMemory(event, world, getModuleState(world));
      });

      ctx.events.on('combat.entity.defeated', (event, world) => {
        // If perception-filter is loaded, it handles who sees/hears the defeat
        if (world.modules['perception-filter']) return;
        const cogState = getModuleState(world);
        broadcastBelief(world, cogState, event.payload.entityId as string, 'alive', false, event.tick);
      });
    },
  };
}

// --- Cognition State Helpers ---

function getModuleState(world: WorldState): Record<string, CognitionState> {
  const mod = world.modules['cognition-core'] as { entityCognition: Record<string, CognitionState> } | undefined;
  return mod?.entityCognition ?? {};
}

export function getCognition(world: WorldState, entityId: string): CognitionState {
  const cogStates = getModuleState(world);
  if (!cogStates[entityId]) {
    cogStates[entityId] = {
      beliefs: [],
      memories: [],
      currentIntent: null,
      morale: DEFAULT_MORALE,
      suspicion: DEFAULT_SUSPICION,
    };
  }
  return cogStates[entityId];
}

// --- Belief Operations ---

export function setBelief(
  cognition: CognitionState,
  subject: string,
  key: string,
  value: ScalarValue,
  confidence: number,
  source: string,
  tick: number,
): void {
  const existing = cognition.beliefs.find(
    (b) => b.subject === subject && b.key === key,
  );
  if (existing) {
    // Update if new info is more confident or more recent
    if (confidence >= existing.confidence || tick > existing.tick) {
      existing.value = value;
      existing.confidence = Math.min(1, confidence);
      existing.source = source;
      existing.tick = tick;
    }
  } else {
    cognition.beliefs.push({ subject, key, value, confidence, source, tick });
  }
}

export function getBelief(
  cognition: CognitionState,
  subject: string,
  key: string,
): Belief | undefined {
  return cognition.beliefs.find((b) => b.subject === subject && b.key === key);
}

export function getBeliefValue(
  cognition: CognitionState,
  subject: string,
  key: string,
): ScalarValue | undefined {
  return getBelief(cognition, subject, key)?.value;
}

/** Does this entity believe something to be true? */
export function believes(
  cognition: CognitionState,
  subject: string,
  key: string,
  value?: ScalarValue,
): boolean {
  const belief = getBelief(cognition, subject, key);
  if (!belief) return false;
  if (value !== undefined) return belief.value === value;
  return true;
}

// --- Memory Operations ---

export function addMemory(
  cognition: CognitionState,
  type: string,
  tick: number,
  data: Record<string, ScalarValue>,
  entityId?: string,
  zoneId?: string,
): void {
  cognition.memories.push({
    id: nextId('mem'),
    type,
    tick,
    entityId,
    zoneId,
    data,
  });
}

export function getMemories(
  cognition: CognitionState,
  type?: string,
): Memory[] {
  if (!type) return cognition.memories;
  return cognition.memories.filter((m) => m.type === type);
}

export function getRecentMemories(
  cognition: CognitionState,
  withinTicks: number,
  currentTick: number,
): Memory[] {
  return cognition.memories.filter((m) => currentTick - m.tick <= withinTicks);
}

// --- Perception ---

export function checkPerception(
  observer: EntityState,
  target: EntityState,
  world: WorldState,
  perceptionStat: string,
  baseDifficulty: number,
): PerceptionResult {
  const modifiers: { source: string; value: number }[] = [];

  // Zone light affects detection
  const zone = world.zones[observer.zoneId ?? ''];
  if (zone) {
    const light = zone.light ?? 5;
    // Low light makes detection harder
    modifiers.push({ source: 'light', value: (light - 5) * 2 });
  }

  // Target visibility
  if (target.visibility?.hidden) {
    modifiers.push({ source: 'hidden', value: -20 });
  }

  // Observer stat
  const statValue = observer.stats[perceptionStat] ?? 5;
  const totalModifier = modifiers.reduce((sum, m) => sum + m.value, 0);
  const threshold = baseDifficulty - totalModifier;

  // Deterministic roll based on tick + IDs
  const roll = deterministicRoll(world.meta.tick, observer.id, target.id);
  const perceptionScore = statValue * 7 + roll;

  return {
    detected: perceptionScore >= threshold,
    roll: perceptionScore,
    threshold,
    observerId: observer.id,
    targetId: target.id,
  };
}

// --- Intent Selection ---

export function selectIntent(
  entity: EntityState,
  cognition: CognitionState,
  world: WorldState,
  profile: IntentProfile,
): IntentOption | null {
  const options = profile.evaluate(entity, cognition, world);
  if (options.length === 0) return null;

  // Pick highest priority
  options.sort((a, b) => b.priority - a.priority);
  return options[0];
}

/** Built-in aggressive profile: attack visible hostiles, flee when low morale */
export const aggressiveProfile: IntentProfile = {
  id: 'aggressive',
  evaluate(entity, cognition, world) {
    const options: IntentOption[] = [];
    const zone = entity.zoneId;

    // Find entities in same zone
    const nearby = Object.values(world.entities).filter(
      (e) => e.id !== entity.id && e.zoneId === zone && (e.resources.hp ?? 0) > 0,
    );

    // Check for known hostiles
    for (const target of nearby) {
      const isHostile = believes(cognition, target.id, 'hostile', true)
        || target.tags.includes('player')
        || target.tags.includes('enemy');

      if (isHostile) {
        if (cognition.morale > 30) {
          options.push({
            verb: 'attack',
            targetIds: [target.id],
            priority: 80 + cognition.suspicion * 0.2,
            reason: `attack hostile: ${target.name}`,
          });
        } else {
          // Low morale — flee if possible
          const zoneState = world.zones[zone ?? ''];
          if (zoneState?.neighbors.length) {
            options.push({
              verb: 'move',
              targetIds: [zoneState.neighbors[0]],
              priority: 90,
              reason: 'flee: low morale',
            });
          }
        }
      }
    }

    // Default: idle/inspect
    if (options.length === 0) {
      options.push({
        verb: 'inspect',
        priority: 10,
        reason: 'idle: nothing to do',
      });
    }

    return options;
  },
};

/** Built-in cautious profile: observe first, attack only when confident */
export const cautiousProfile: IntentProfile = {
  id: 'cautious',
  evaluate(entity, cognition, world) {
    const options: IntentOption[] = [];
    const zone = entity.zoneId;

    const nearby = Object.values(world.entities).filter(
      (e) => e.id !== entity.id && e.zoneId === zone && (e.resources.hp ?? 0) > 0,
    );

    for (const target of nearby) {
      const hostileBelief = getBelief(cognition, target.id, 'hostile');
      const isKnownHostile = hostileBelief && hostileBelief.value === true && hostileBelief.confidence > 0.6;

      if (isKnownHostile && cognition.morale > 50) {
        options.push({
          verb: 'attack',
          targetIds: [target.id],
          priority: 60,
          reason: `attack confirmed hostile: ${target.name}`,
        });
      } else if (cognition.suspicion > 50) {
        // Suspicious but not sure — watch
        options.push({
          verb: 'inspect',
          targetIds: [target.id],
          priority: 40,
          reason: `suspicious of: ${target.name}`,
        });
      }
    }

    if (options.length === 0) {
      options.push({
        verb: 'inspect',
        priority: 10,
        reason: 'idle: scanning',
      });
    }

    return options;
  },
};

// --- Internal Helpers ---

function updatePerceptions(event: ResolvedEvent, world: WorldState, cogStates: Record<string, CognitionState>): void {
  // If perception-filter is loaded, it handles filtered awareness
  if (world.modules['perception-filter']) return;

  const zoneId = event.payload.zoneId as string;
  const actorId = event.actorId;
  if (!actorId || !zoneId) return;

  // All AI entities in the zone become aware of the new arrival
  for (const entity of Object.values(world.entities)) {
    if (entity.id === actorId) continue;
    if (entity.zoneId !== zoneId) continue;
    if (!entity.ai) continue;

    const cog = getCognition(world, entity.id);
    setBelief(cog, actorId, 'location', zoneId, 0.9, 'observed', event.tick);
    setBelief(cog, actorId, 'present', true, 1.0, 'observed', event.tick);
    addMemory(cog, 'saw-entity', event.tick, { entityId: actorId, zoneId }, actorId, zoneId);
  }
}

function recordCombatMemory(event: ResolvedEvent, world: WorldState, cogStates: Record<string, CognitionState>): void {
  const attackerId = event.payload.attackerId as string;
  const targetId = event.payload.targetId as string;
  if (!attackerId || !targetId) return;

  // Target ALWAYS knows attacker is hostile (direct experience, no perception needed)
  const target = world.entities[targetId];
  if (target?.ai) {
    const cog = getCognition(world, targetId);
    setBelief(cog, attackerId, 'hostile', true, 1.0, 'observed', event.tick);
    addMemory(cog, 'was-attacked', event.tick, { attackerId }, attackerId, target.zoneId);

    // Lower morale on being hit
    cog.morale = Math.max(0, cog.morale - 10);
    cog.suspicion = Math.min(100, cog.suspicion + 20);
  }

  // Bystander awareness — only if perception-filter is NOT handling it
  if (world.modules['perception-filter']) return;

  const zone = world.entities[attackerId]?.zoneId;
  if (!zone) return;

  for (const entity of Object.values(world.entities)) {
    if (entity.id === attackerId || entity.id === targetId) continue;
    if (entity.zoneId !== zone || !entity.ai) continue;

    const cog = getCognition(world, entity.id);
    setBelief(cog, attackerId, 'hostile', true, 0.7, 'observed', event.tick);
    addMemory(cog, 'heard-combat', event.tick, { attackerId, targetId }, undefined, zone);
    cog.suspicion = Math.min(100, cog.suspicion + 15);
  }
}

function broadcastBelief(
  world: WorldState,
  cogStates: Record<string, CognitionState>,
  subject: string,
  key: string,
  value: ScalarValue,
  tick: number,
): void {
  const subjectEntity = world.entities[subject];
  const zone = subjectEntity?.zoneId;
  if (!zone) return;

  for (const entity of Object.values(world.entities)) {
    if (entity.zoneId !== zone || !entity.ai) continue;
    const cog = getCognition(world, entity.id);
    setBelief(cog, subject, key, value, 0.9, 'observed', tick);
  }
}

function deterministicRoll(tick: number, id1: string, id2: string): number {
  let hash = tick * 2654435761;
  for (const char of id1 + id2 + 'perception') {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return (Math.abs(hash) % 50) + 1; // 1-50
}
