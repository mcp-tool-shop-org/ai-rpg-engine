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
import { CAMPAIGN_MEMORY_VERSION, createDefaultRelationship } from './types.js';
import { validateMemoryFragment, validateRelationshipAxes } from './validate.js';

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
        mem.tick = currentTick;

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
    const entry = this.state.subjects[subjectId];
    if (!entry) return undefined;
    return {
      ...entry,
      relationship: { ...entry.relationship },
      memories: entry.memories.map((m) => ({ ...m })),
    };
  }

  /** Serializable state, stamped with the current schema version (CM-02). */
  serialize(): NpcMemoryState {
    return {
      version: CAMPAIGN_MEMORY_VERSION,
      ...JSON.parse(JSON.stringify(this.state)),
    };
  }

  /**
   * Restore from serialized state.
   *
   * CA-06: guards malformed state with a clear, actionable error instead of building a
   * half-formed bank that throws a raw TypeError on the next call. The thrown Error names
   * the offending field and how to fix it.
   *
   * CM-02 extends the guard below the top level:
   * - schema version check — a save stamped with a NEWER version than this
   *   package supports is rejected (upgrade the package); a save with no
   *   version is legacy v1 and loads normally.
   * - per-subject validation — relationship axes, memory fragments, and
   *   interaction counters are checked, so a corrupt subject entry fails HERE
   *   (naming the subject and field) rather than as a raw TypeError deep in
   *   recall()/consolidate().
   */
  static deserialize(state: NpcMemoryState, config?: CampaignMemoryConfig): NpcMemoryBank {
    if (typeof state !== 'object' || state === null || Array.isArray(state)) {
      throw new Error(
        `NpcMemoryBank.deserialize: expected a state object (got ${state === null ? 'null' : Array.isArray(state) ? 'array' : typeof state}) — pass the value returned by serialize()`,
      );
    }
    const version = (state as { version?: unknown }).version;
    if (version !== undefined) {
      if (typeof version !== 'number' || !Number.isFinite(version)) {
        throw new Error(
          `NpcMemoryBank.deserialize: state.version must be a number (got ${typeof version}) — legacy saves omit it entirely`,
        );
      }
      if (version > CAMPAIGN_MEMORY_VERSION) {
        throw new Error(
          `NpcMemoryBank.deserialize: state version ${version} is newer than supported version ${CAMPAIGN_MEMORY_VERSION} — upgrade @ai-rpg-engine/campaign-memory to load this save`,
        );
      }
    }
    if (typeof (state as { entityId?: unknown }).entityId !== 'string') {
      throw new Error(
        'NpcMemoryBank.deserialize: state is missing a string "entityId" — this is the NPC the bank belongs to',
      );
    }
    const subjects = (state as { subjects?: unknown }).subjects;
    if (typeof subjects !== 'object' || subjects === null || Array.isArray(subjects)) {
      throw new Error(
        `NpcMemoryBank.deserialize: state.subjects must be an object mapping subjectId → entry (got ${
          subjects === undefined ? 'undefined' : subjects === null ? 'null' : Array.isArray(subjects) ? 'array' : typeof subjects
        })`,
      );
    }
    for (const [subjectId, entry] of Object.entries(subjects as Record<string, unknown>)) {
      validateSubjectEntry(subjectId, entry);
    }
    const bank = new NpcMemoryBank(state.entityId, config);
    // Store WITHOUT the version stamp — the runtime state has no use for it,
    // and serialize() re-stamps the current version (which also upgrades
    // legacy saves on their next write).
    bank.state = {
      entityId: state.entityId,
      subjects: JSON.parse(JSON.stringify(subjects)),
    };
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

/**
 * CM-02 per-subject guard. Throws an Error naming the offending subject and
 * field. Reuses the validate.js helpers so the boundary check and the public
 * validators cannot drift apart.
 */
function validateSubjectEntry(subjectId: string, entry: unknown): void {
  const at = `subjects["${subjectId}"]`;
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new Error(
      `NpcMemoryBank.deserialize: ${at} must be an entry object (got ${entry === null ? 'null' : Array.isArray(entry) ? 'array' : typeof entry})`,
    );
  }
  const e = entry as Record<string, unknown>;

  const relErrors = validateRelationshipAxes(e.relationship);
  if (relErrors.length > 0) {
    const first = relErrors[0];
    throw new Error(
      `NpcMemoryBank.deserialize: ${at}.relationship${first.field === 'root' ? '' : '.' + first.field} ${first.message}`,
    );
  }

  if (!Array.isArray(e.memories)) {
    throw new Error(
      `NpcMemoryBank.deserialize: ${at}.memories must be an array of memory fragments (got ${e.memories === null ? 'null' : typeof e.memories})`,
    );
  }
  for (let i = 0; i < e.memories.length; i++) {
    const fragErrors = validateMemoryFragment(e.memories[i]);
    if (fragErrors.length > 0) {
      const first = fragErrors[0];
      throw new Error(
        `NpcMemoryBank.deserialize: ${at}.memories[${i}]${first.field === 'root' ? '' : '.' + first.field} ${first.message}`,
      );
    }
  }

  if (typeof e.lastInteractionTick !== 'number' || Number.isNaN(e.lastInteractionTick)) {
    throw new Error(
      `NpcMemoryBank.deserialize: ${at}.lastInteractionTick must be a number (got ${typeof e.lastInteractionTick})`,
    );
  }
  if (typeof e.interactionCount !== 'number' || Number.isNaN(e.interactionCount)) {
    throw new Error(
      `NpcMemoryBank.deserialize: ${at}.interactionCount must be a number (got ${typeof e.interactionCount})`,
    );
  }
}
