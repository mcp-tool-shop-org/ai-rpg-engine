// RumorEngine — rumor lifecycle management with mutation mechanics

import type {
  Rumor,
  RumorStatus,
  RumorEngineConfig,
  RumorQuery,
  MutationContext,
  MutationRule,
} from './types.js';
import { DEFAULT_MUTATIONS } from './mutations.js';
import { validateRumor } from './validate.js';

/** A structured warning surfaced by {@link RumorEngine.deserializeSafe}. */
export type DeserializeWarning = {
  /** Offending location, e.g. `rumors[3].lastSpreadTick`. */
  field: string;
  /** What was wrong with the skipped entry (includes its id when it has one). */
  message: string;
};

/** Result of {@link RumorEngine.deserializeSafe}. */
export type DeserializeResult = {
  /** The restored engine, containing only the rumors that passed validation. */
  engine: RumorEngine;
  /** Number of rumors actually restored into the engine. */
  restored: number;
  /**
   * Structured warnings for malformed entries that were skipped. Empty on a
   * clean load. Mirrors soundpack-core's SoundRegistry.load warning
   * convention so a save/load layer can surface these instead of discovering
   * the corruption later as a frozen rumor or a raw TypeError.
   */
  warnings: DeserializeWarning[];
};

const DEFAULT_CONFIG = {
  maxHops: 5,
  confidenceDecayPerHop: 0.1,
  fadingThreshold: 10,
  deathThreshold: 30,
};

export class RumorEngine {
  private rumors: Map<string, Rumor> = new Map();
  private mutations: MutationRule[];
  private maxHops: number;
  private confidenceDecayPerHop: number;
  private fadingThreshold: number;
  private deathThreshold: number;
  /**
   * Per-instance ID counter. Rumor IDs depend only on (this engine's history),
   * never on cross-instance order — see CP-02. Two engines number independently.
   */
  private nextRumorId = 1;

  private generateId(): string {
    return `rum_${this.nextRumorId++}`;
  }

  constructor(config?: RumorEngineConfig) {
    this.maxHops = config?.maxHops ?? DEFAULT_CONFIG.maxHops;
    this.confidenceDecayPerHop = config?.confidenceDecayPerHop ?? DEFAULT_CONFIG.confidenceDecayPerHop;
    this.fadingThreshold = config?.fadingThreshold ?? DEFAULT_CONFIG.fadingThreshold;
    this.deathThreshold = config?.deathThreshold ?? DEFAULT_CONFIG.deathThreshold;
    this.mutations = config?.mutations ?? DEFAULT_MUTATIONS;
  }

  /** Create a new rumor from a witnessed event */
  create(params: {
    claim: string;
    subject: string;
    key: string;
    value: unknown;
    sourceId: string;
    originTick: number;
    confidence: number;
    emotionalCharge?: number;
  }): Rumor {
    const rumor: Rumor = {
      id: this.generateId(),
      claim: params.claim,
      subject: params.subject,
      key: params.key,
      value: params.value,
      originalValue: params.value,
      sourceId: params.sourceId,
      originTick: params.originTick,
      confidence: Math.max(0, Math.min(1, params.confidence)),
      emotionalCharge: Math.max(-1, Math.min(1, params.emotionalCharge ?? 0)),
      spreadPath: [params.sourceId],
      mutationCount: 0,
      factionUptake: [],
      status: 'spreading',
      lastSpreadTick: params.originTick,
    };

    this.rumors.set(rumor.id, rumor);
    return rumor;
  }

  /** Spread a rumor to a new entity. Applies mutations and confidence decay. */
  spread(rumorId: string, ctx: MutationContext): Rumor {
    const original = this.rumors.get(rumorId);
    if (!original) {
      throw new Error(`Rumor not found: ${rumorId}`);
    }

    if (original.spreadPath.includes(ctx.receiverId)) return original;

    let spreading: Rumor = { ...original, spreadPath: [...original.spreadPath] };

    // Apply confidence decay
    spreading.confidence = Math.max(
      0,
      spreading.confidence - this.confidenceDecayPerHop,
    );

    // Add receiver to spread path
    spreading.spreadPath.push(ctx.receiverId);
    spreading.lastSpreadTick = spreading.originTick + ctx.hopCount;

    // Apply mutations — each rule rolls independently
    for (const rule of this.mutations) {
      const effectiveProbability = rule.probability * (1 + ctx.environmentInstability);
      const roll = seededRandom(rumorId, ctx.hopCount, rule.id);

      if (roll < effectiveProbability) {
        spreading = rule.apply(spreading, ctx);
      }
    }

    // Check if rumor should transition to 'established' (many hops, stable)
    if (spreading.spreadPath.length >= this.maxHops && spreading.status === 'spreading') {
      spreading.status = 'established';
    }

    // Update the stored rumor
    this.rumors.set(rumorId, spreading);
    return spreading;
  }

  /** Record that a faction absorbed this rumor */
  recordFactionUptake(rumorId: string, factionId: string): void {
    const rumor = this.rumors.get(rumorId);
    if (!rumor) return;
    if (!rumor.factionUptake.includes(factionId)) {
      rumor.factionUptake.push(factionId);
    }
  }

  /** Update lifecycle statuses based on current tick */
  tick(currentTick: number): void {
    for (const rumor of this.rumors.values()) {
      if (rumor.status === 'dead') continue;

      const ticksSinceSpread = currentTick - rumor.lastSpreadTick;

      // F-06c431da: 'established' gets its own branch rather than sharing the
      // spreading/fading branch below and relying on a second check to catch
      // it. Established rumors skip the 'fading' stage entirely — they go
      // straight from established to dead once inactive past deathThreshold,
      // and otherwise stay established. This used to be expressed as a
      // status-agnostic death check plus a trailing "established can also
      // die" block that could never actually run (the first check already
      // caught every status, including 'established'); that made the
      // established path look conditional on the second block while
      // depending entirely on the first, so an edit to the first branch
      // alone (e.g. excluding 'established' from it) would have silently
      // made established rumors immortal. Splitting the branch makes the
      // established death path self-contained and independent of how the
      // spreading/fading branch is written.
      if (rumor.status === 'established') {
        if (ticksSinceSpread >= this.deathThreshold) {
          rumor.status = 'dead';
        }
      } else if (ticksSinceSpread >= this.deathThreshold) {
        rumor.status = 'dead';
      } else if (ticksSinceSpread >= this.fadingThreshold) {
        rumor.status = 'fading';
      }
    }
  }

  /** Query rumors with filters. All filters are ANDed. */
  query(q: RumorQuery): Rumor[] {
    let results = Array.from(this.rumors.values());

    if (q.subject !== undefined) {
      results = results.filter((r) => r.subject === q.subject);
    }
    if (q.sourceId !== undefined) {
      results = results.filter((r) => r.sourceId === q.sourceId);
    }
    if (q.status !== undefined) {
      results = results.filter((r) => r.status === q.status);
    }
    if (q.minConfidence !== undefined) {
      results = results.filter((r) => r.confidence >= q.minConfidence!);
    }
    if (q.factionId !== undefined) {
      results = results.filter((r) => r.factionUptake.includes(q.factionId!));
    }
    if (q.afterTick !== undefined) {
      results = results.filter((r) => r.originTick > q.afterTick!);
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /** Get a specific rumor by ID */
  get(id: string): Rumor | undefined {
    return this.rumors.get(id);
  }

  /** Get all active rumors about a subject */
  aboutSubject(subject: string): Rumor[] {
    return Array.from(this.rumors.values())
      .filter((r) => r.subject === subject && r.status !== 'dead')
      .sort((a, b) => b.confidence - a.confidence);
  }

  /** Count of non-dead rumors */
  activeCount(): number {
    let count = 0;
    for (const r of this.rumors.values()) {
      if (r.status !== 'dead') count++;
    }
    return count;
  }

  /** Serializable state */
  serialize(): Rumor[] {
    return Array.from(this.rumors.values());
  }

  /**
   * Restore from serialized state, validating every rumor at the boundary.
   *
   * F-1f8c5a94: this used to write each incoming entry straight into the
   * registry unvalidated, even though the package ships {@link validateRumor}
   * for exactly this boundary. A persisted rumor missing `lastSpreadTick`
   * then froze forever — `tick()`'s `currentTick - lastSpreadTick` is NaN and
   * NaN fails both threshold compares, so the rumor never fades or dies — and
   * one missing `spreadPath` raw-threw a TypeError inside the next `spread()`.
   *
   * Contract (mirrors soundpack-core's `SoundRegistry.load` warn-and-skip):
   * malformed entries are skipped and reported as structured warnings naming
   * the entry index, its id when present, and the offending field; valid
   * entries load normally. Non-array input is the one case that throws —
   * there is nothing to restore and iterating would crash anyway.
   */
  static deserializeSafe(rumors: Rumor[], config?: RumorEngineConfig): DeserializeResult {
    if (!Array.isArray(rumors)) {
      throw new Error(
        '[rumor-system] deserialize() requires an array of rumors; received ' +
          describeType(rumors) + '. Pass the array produced by serialize().',
      );
    }

    const engine = new RumorEngine(config);
    const warnings: DeserializeWarning[] = [];
    let restored = 0;
    let maxNum = 0;

    for (let i = 0; i < rumors.length; i++) {
      const rumor = rumors[i];
      const errors = validateRumor(rumor);
      if (errors.length > 0) {
        const id =
          rumor !== null && typeof rumor === 'object' && typeof (rumor as { id?: unknown }).id === 'string'
            ? ` (id "${(rumor as { id: string }).id}")`
            : '';
        for (const e of errors) {
          warnings.push({
            field: `rumors[${i}].${e.field}`,
            message: `skipped malformed rumor${id}: ${e.field} ${e.message}`,
          });
        }
        continue;
      }

      engine.rumors.set(rumor.id, rumor);
      restored++;

      // Advance THIS instance's counter past the highest RESTORED id (CP-02).
      // Skipped entries don't count — they never entered the registry.
      const match = rumor.id.match(/^rum_(\d+)$/);
      if (match) {
        maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
    }

    engine.nextRumorId = maxNum + 1;
    return { engine, restored, warnings };
  }

  /**
   * Restore from serialized state. Malformed entries are skipped — use
   * {@link RumorEngine.deserializeSafe} to also receive the structured
   * per-entry warnings for your save/load UX.
   */
  static deserialize(rumors: Rumor[], config?: RumorEngineConfig): RumorEngine {
    return RumorEngine.deserializeSafe(rumors, config).engine;
  }
}

/** Human-readable type description for boundary error messages. */
function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}

// Deterministic pseudo-random based on rumor ID, hop count, and rule ID
function seededRandom(rumorId: string, hop: number, ruleId: string): number {
  let hash = hop * 2654435761;
  for (const char of rumorId + ruleId + 'spread') {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
}
