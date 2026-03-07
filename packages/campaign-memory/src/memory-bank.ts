// NpcMemoryBank — per-NPC memory with relationship tracking and consolidation

import type {
  CampaignRecord,
  CampaignMemoryConfig,
  MemoryFragment,
  MemoryQuery,
  NpcMemoryEntry,
  NpcMemoryState,
  RelationshipAxes,
} from './types.js';
import { createDefaultRelationship } from './types.js';

const DEFAULT_CONFIG: Required<CampaignMemoryConfig> = {
  fadeThreshold: 0.3,
  dimThreshold: 0.1,
  decayRate: 0.005,
  maxMemoriesPerSubject: 20,
};

export class NpcMemoryBank {
  private state: NpcMemoryState;
  private config: Required<CampaignMemoryConfig>;

  constructor(entityId: string, config?: CampaignMemoryConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = { entityId, subjects: {} };
  }

  /** Get the entity ID this memory bank belongs to */
  get entityId(): string {
    return this.state.entityId;
  }

  /** Record that this NPC witnessed/experienced a campaign event */
  remember(record: CampaignRecord, salience: number, emotionalCharge: number): void {
    // Determine the subject — the "other" entity from this NPC's perspective
    const subjectId = record.actorId === this.state.entityId
      ? record.targetId
      : record.actorId;

    if (!subjectId) return;

    const entry = this.getOrCreateEntry(subjectId);
    entry.lastInteractionTick = record.tick;
    entry.interactionCount++;

    // Add the memory fragment
    const fragment: MemoryFragment = {
      recordId: record.id,
      salience: Math.max(0, Math.min(1, salience)),
      emotionalCharge: Math.max(-1, Math.min(1, emotionalCharge)),
      consolidation: 'vivid',
      tick: record.tick,
    };

    entry.memories.push(fragment);

    // Enforce max memories — drop lowest salience dim memories first
    if (entry.memories.length > this.config.maxMemoriesPerSubject) {
      entry.memories.sort((a, b) => b.salience - a.salience);
      entry.memories.length = this.config.maxMemoriesPerSubject;
    }
  }

  /** Get relationship with a specific entity */
  getRelationship(subjectId: string): RelationshipAxes {
    const entry = this.state.subjects[subjectId];
    if (!entry) return createDefaultRelationship();
    return { ...entry.relationship };
  }

  /** Adjust relationship axes. Values are clamped to valid ranges. */
  adjustRelationship(subjectId: string, deltas: Partial<RelationshipAxes>): void {
    const entry = this.getOrCreateEntry(subjectId);
    const r = entry.relationship;

    if (deltas.trust !== undefined) {
      r.trust = clamp(r.trust + deltas.trust, -1, 1);
    }
    if (deltas.fear !== undefined) {
      r.fear = clamp(r.fear + deltas.fear, 0, 1);
    }
    if (deltas.admiration !== undefined) {
      r.admiration = clamp(r.admiration + deltas.admiration, -1, 1);
    }
    if (deltas.familiarity !== undefined) {
      r.familiarity = clamp(r.familiarity + deltas.familiarity, 0, 1);
    }
  }

  /** Query memories across all subjects, filtered */
  recall(query: MemoryQuery): MemoryFragment[] {
    let results: MemoryFragment[] = [];

    if (query.aboutEntity) {
      const entry = this.state.subjects[query.aboutEntity];
      if (!entry) return [];
      results = [...entry.memories];
    } else {
      for (const entry of Object.values(this.state.subjects)) {
        results.push(...entry.memories);
      }
    }

    if (query.minSalience !== undefined) {
      results = results.filter((m) => m.salience >= query.minSalience!);
    }
    if (query.consolidation !== undefined) {
      results = results.filter((m) => m.consolidation === query.consolidation);
    }
    if (query.withinTicks !== undefined && query.currentTick !== undefined) {
      const cutoff = query.currentTick - query.withinTicks;
      results = results.filter((m) => m.tick >= cutoff);
    }

    return results.sort((a, b) => b.salience - a.salience);
  }

  /** Get the most salient memory about someone */
  strongestMemory(subjectId: string): MemoryFragment | undefined {
    const entry = this.state.subjects[subjectId];
    if (!entry || entry.memories.length === 0) return undefined;

    let strongest = entry.memories[0];
    for (let i = 1; i < entry.memories.length; i++) {
      if (entry.memories[i].salience > strongest.salience) {
        strongest = entry.memories[i];
      }
    }
    return strongest;
  }

  /** Process memory decay — salience decreases over time, consolidation shifts */
  consolidate(currentTick: number): void {
    for (const entry of Object.values(this.state.subjects)) {
      for (const mem of entry.memories) {
        const elapsed = currentTick - mem.tick;
        if (elapsed <= 0) continue;

        // Decay salience
        mem.salience = Math.max(0, mem.salience - this.config.decayRate * elapsed);

        // Update consolidation state
        if (mem.salience < this.config.dimThreshold) {
          mem.consolidation = 'dim';
        } else if (mem.salience < this.config.fadeThreshold) {
          mem.consolidation = 'faded';
        }
      }

      // Remove completely forgotten memories (salience 0 and dim)
      entry.memories = entry.memories.filter(
        (m) => m.salience > 0 || m.consolidation !== 'dim',
      );
    }
  }

  /** Does this NPC remember a specific event? */
  remembers(recordId: string): boolean {
    for (const entry of Object.values(this.state.subjects)) {
      if (entry.memories.some((m) => m.recordId === recordId)) {
        return true;
      }
    }
    return false;
  }

  /** Get all entity IDs this NPC has memories about */
  knownSubjects(): string[] {
    return Object.keys(this.state.subjects);
  }

  /** Get the full memory entry for a subject */
  getEntry(subjectId: string): NpcMemoryEntry | undefined {
    return this.state.subjects[subjectId];
  }

  /** Serializable state */
  serialize(): NpcMemoryState {
    return JSON.parse(JSON.stringify(this.state));
  }

  /** Restore from serialized state */
  static deserialize(state: NpcMemoryState, config?: CampaignMemoryConfig): NpcMemoryBank {
    const bank = new NpcMemoryBank(state.entityId, config);
    bank.state = JSON.parse(JSON.stringify(state));
    return bank;
  }

  // --- Internal ---

  private getOrCreateEntry(subjectId: string): NpcMemoryEntry {
    if (!this.state.subjects[subjectId]) {
      this.state.subjects[subjectId] = {
        subjectId,
        relationship: createDefaultRelationship(),
        memories: [],
        lastInteractionTick: 0,
        interactionCount: 0,
      };
    }
    return this.state.subjects[subjectId];
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
