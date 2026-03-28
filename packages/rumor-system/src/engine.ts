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

const DEFAULT_CONFIG = {
  maxHops: 5,
  confidenceDecayPerHop: 0.1,
  fadingThreshold: 10,
  deathThreshold: 30,
};

let nextRumorId = 1;

function generateId(): string {
  return `rum_${nextRumorId++}`;
}

export class RumorEngine {
  private rumors: Map<string, Rumor> = new Map();
  private mutations: MutationRule[];
  private maxHops: number;
  private confidenceDecayPerHop: number;
  private fadingThreshold: number;
  private deathThreshold: number;

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
      id: generateId(),
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

      if (ticksSinceSpread >= this.deathThreshold) {
        rumor.status = 'dead';
      } else if (ticksSinceSpread >= this.fadingThreshold && rumor.status !== 'established') {
        rumor.status = 'fading';
      }

      // Established rumors can also fade if inactive long enough
      if (rumor.status === 'established' && ticksSinceSpread >= this.deathThreshold) {
        rumor.status = 'dead';
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

  /** Restore from serialized state */
  static deserialize(rumors: Rumor[], config?: RumorEngineConfig): RumorEngine {
    const engine = new RumorEngine(config);
    for (const rumor of rumors) {
      engine.rumors.set(rumor.id, rumor);
    }
    // Ensure ID counter is ahead
    let maxNum = 0;
    for (const r of rumors) {
      const match = r.id.match(/^rum_(\d+)$/);
      if (match) {
        maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
    }
    nextRumorId = maxNum + 1;
    return engine;
  }
}

// Deterministic pseudo-random based on rumor ID, hop count, and rule ID
function seededRandom(rumorId: string, hop: number, ruleId: string): number {
  let hash = hop * 2654435761;
  for (const char of rumorId + ruleId + 'spread') {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
}
