// RumorEngine — rumor lifecycle management with mutation mechanics

import type {
  Rumor,
  RumorEngineConfig,
  RumorQuery,
  MutationContext,
  MutationRule,
  RumorSubjectKey,
  CorroborateOptions,
  ContradictOptions,
  RumorStance,
} from './types.js';
import { VALID_STANCES } from './types.js';
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
  maxDeadRumors: 64,
};

/** Options for {@link RumorEngine.serialize}. */
export type SerializeOptions = {
  /** Include status==='dead' rumors. Default: omit them (F-97a47e88). */
  includeDead?: boolean;
};

/** Persisted per-entity stance (F-959f6ee9). `'unknown'` is omitted. */
export type StanceRecord = {
  entityId: string;
  rumorId: string;
  stance: Exclude<RumorStance, 'unknown'>;
  tick: number;
};

/** Snapshot returned by {@link RumorEngine.serialize}. */
export type EngineSnapshot = {
  rumors: Rumor[];
  stances: StanceRecord[];
};

type StanceEntry = { stance: Exclude<RumorStance, 'unknown'>; tick: number };

function cloneRumor(r: Rumor): Rumor {
  return structuredClone(r);
}

export class RumorEngine {
  private rumors: Map<string, Rumor> = new Map();
  /** entityId → rumorId → stance. Not a field on Rumor so two hearers can disagree. */
  private stances: Map<string, Map<string, StanceEntry>> = new Map();
  private mutations: MutationRule[];
  private maxHops: number;
  private confidenceDecayPerHop: number;
  private fadingThreshold: number;
  private deathThreshold: number;
  private maxDeadRumors: number;
  /** Undefined: stances never decay (F-16e227f2). */
  private stanceFadeTicks: number | undefined;
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
    this.maxDeadRumors = Math.max(0, config?.maxDeadRumors ?? DEFAULT_CONFIG.maxDeadRumors);
    // No DEFAULT_CONFIG entry: omitted stays undefined so stances never
    // decay unless a caller opts in (F-16e227f2).
    this.stanceFadeTicks = config?.stanceFadeTicks;
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

    // F-8c128e3d: a dead rumor must not hop. aboutSubject/activeCount ignore
    // dead records, so writing a path onto one announced the rumor without
    // persisting it as living. Refuse rather than resurrect.
    if (original.status === 'dead') return original;

    if (original.spreadPath.includes(ctx.receiverId)) return original;

    if (!Number.isFinite(ctx.currentTick)) {
      throw new Error('MutationContext.currentTick must be a finite number');
    }

    let spreading: Rumor = { ...original, spreadPath: [...original.spreadPath] };

    // Apply confidence decay
    spreading.confidence = Math.max(
      0,
      spreading.confidence - this.confidenceDecayPerHop,
    );

    // Add receiver to spread path. Hop count is the number of edges walked
    // (path length minus the origin), not the caller-supplied ctx.hopCount —
    // a lying hopCount used to stamp lastSpreadTick = originTick + hopCount
    // and kill a late-heard rumor on the same tick it announced (F-8c128e3d).
    spreading.spreadPath.push(ctx.receiverId);
    const hopCount = spreading.spreadPath.length - 1;
    spreading.lastSpreadTick = ctx.currentTick;
    const hopCtx: MutationContext = { ...ctx, hopCount, currentTick: ctx.currentTick };

    // Apply mutations — each rule rolls independently
    for (const rule of this.mutations) {
      const effectiveProbability = rule.probability * (1 + hopCtx.environmentInstability);
      const roll = seededRandom(rumorId, hopCount, rule.id);

      if (roll < effectiveProbability) {
        spreading = rule.apply(spreading, hopCtx);
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
    this.decayStances(currentTick);
    this.capDead();
  }

  /**
   * Clear stance entries whose age (relative to `currentTick`) has reached
   * {@link stanceFadeTicks}. No-ops when `stanceFadeTicks` is unset
   * (F-16e227f2). Mirrors {@link setStance}'s own unknown-clears-entry
   * behavior — an entry is deleted outright, never rewritten in place, and
   * never inverted between `believe`/`doubt`.
   */
  private decayStances(currentTick: number): void {
    if (this.stanceFadeTicks === undefined) return;
    for (const [entityId, byRumor] of this.stances) {
      for (const [rumorId, entry] of [...byRumor]) {
        if (currentTick - entry.tick >= this.stanceFadeTicks) {
          byRumor.delete(rumorId);
        }
      }
      if (byRumor.size === 0) this.stances.delete(entityId);
    }
  }

  /**
   * Drop every rumor whose status is `dead`. Returns how many were removed.
   * Persistence and `get()` after this return undefined for those ids
   * (F-97a47e88).
   */
  pruneDead(): number {
    const dropped: string[] = [];
    for (const [id, rumor] of this.rumors) {
      if (rumor.status === 'dead') {
        this.rumors.delete(id);
        dropped.push(id);
      }
    }
    this.dropStancesFor(dropped);
    return dropped.length;
  }

  /** Drop oldest dead rumors until the live Map is within maxDeadRumors. */
  private capDead(): void {
    const dead = [...this.rumors.values()]
      .filter((r) => r.status === 'dead')
      .sort((a, b) => a.lastSpreadTick - b.lastSpreadTick || a.originTick - b.originTick || a.id.localeCompare(b.id));
    const overflow = dead.length - this.maxDeadRumors;
    if (overflow <= 0) return;
    const dropped: string[] = [];
    for (let i = 0; i < overflow; i++) {
      dropped.push(dead[i].id);
      this.rumors.delete(dead[i].id);
    }
    this.dropStancesFor(dropped);
  }

  private dropStancesFor(ids: Iterable<string>): void {
    const gone = ids instanceof Set ? ids : new Set(ids);
    if (gone.size === 0) return;
    for (const [entityId, byRumor] of this.stances) {
      for (const rumorId of [...byRumor.keys()]) {
        if (gone.has(rumorId)) byRumor.delete(rumorId);
      }
      if (byRumor.size === 0) this.stances.delete(entityId);
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
    if (q.hearerId !== undefined) {
      results = results.filter((r) => r.spreadPath.includes(q.hearerId!));
    }
    if (q.believerId !== undefined) {
      results = results.filter((r) => this.stanceOf(q.believerId!, r.id) === 'believe');
    }

    return results.sort((a, b) => b.confidence - a.confidence).map(cloneRumor);
  }

  /** Get a specific rumor by ID. Returned object is a clone (F-4d5522db). */
  get(id: string): Rumor | undefined {
    const rumor = this.rumors.get(id);
    return rumor ? cloneRumor(rumor) : undefined;
  }

  /**
   * Live (non-dead) rumor for this (subject, key), highest confidence first.
   * Two `create()` calls for the same fact stay two records — hosts look up
   * here and call {@link corroborate} instead of minting a sibling (F-d81fd1b9).
   */
  findBySubjectKey(subject: string, key: string): Rumor | undefined {
    const hit = this.lookupLive(subject, key);
    return hit ? cloneRumor(hit) : undefined;
  }

  /**
   * Second witness for an existing fact: union `witnessId` onto `spreadPath`
   * and raise confidence (clamped). Target is a rumor id or `{subject, key}`.
   */
  corroborate(target: string | RumorSubjectKey, opts: CorroborateOptions): Rumor | undefined {
    if (!Number.isFinite(opts.currentTick)) {
      throw new Error('corroborate() currentTick must be a finite number');
    }
    const stored = this.resolveTarget(target);
    if (!stored || stored.status === 'dead') return stored ? cloneRumor(stored) : undefined;

    const spreading: Rumor = { ...stored, spreadPath: [...stored.spreadPath] };
    if (!spreading.spreadPath.includes(opts.witnessId)) {
      spreading.spreadPath.push(opts.witnessId);
    }
    const delta = Number.isFinite(opts.confidenceDelta) ? opts.confidenceDelta! : 0.1;
    spreading.confidence = Math.max(0, Math.min(1, spreading.confidence + delta));
    spreading.lastSpreadTick = opts.currentTick;
    if (spreading.status === 'fading') spreading.status = 'spreading';
    this.rumors.set(spreading.id, spreading);
    return cloneRumor(spreading);
  }

  /**
   * Denial from a named source. Inverts boolean/number `value` (formatter
   * interpolates the mutated value) or, with `{kill: true}` / a non-invertible
   * value, marks the rumor dead. Does not rewrite `originalValue`.
   */
  contradict(target: string | RumorSubjectKey, opts: ContradictOptions): Rumor | undefined {
    if (!Number.isFinite(opts.currentTick)) {
      throw new Error('contradict() currentTick must be a finite number');
    }
    const stored = this.resolveTarget(target);
    if (!stored || stored.status === 'dead') return stored ? cloneRumor(stored) : undefined;

    const spreading: Rumor = { ...stored, spreadPath: [...stored.spreadPath] };
    if (!spreading.spreadPath.includes(opts.sourceId)) {
      spreading.spreadPath.push(opts.sourceId);
    }
    const delta = Number.isFinite(opts.confidenceDelta) ? opts.confidenceDelta! : -0.2;
    spreading.confidence = Math.max(0, Math.min(1, spreading.confidence + delta));
    spreading.lastSpreadTick = opts.currentTick;

    const invertible = typeof spreading.value === 'boolean' || typeof spreading.value === 'number';
    if (opts.kill || !invertible) {
      spreading.status = 'dead';
    } else {
      spreading.value = invertClaimValue(spreading.value);
      spreading.mutationCount++;
      if (typeof spreading.value === 'boolean') {
        spreading.emotionalCharge = Math.max(-1, Math.min(1, spreading.emotionalCharge * -1));
      }
    }
    this.rumors.set(spreading.id, spreading);
    if (spreading.status === 'dead') this.capDead();
    return cloneRumor(spreading);
  }

  private lookupLive(subject: string, key: string): Rumor | undefined {
    const hits = [...this.rumors.values()]
      .filter((r) => r.subject === subject && r.key === key && r.status !== 'dead');
    hits.sort((a, b) => b.confidence - a.confidence || a.originTick - b.originTick || a.id.localeCompare(b.id));
    return hits[0];
  }

  private resolveTarget(target: string | RumorSubjectKey): Rumor | undefined {
    if (typeof target === 'string') return this.rumors.get(target);
    return this.lookupLive(target.subject, target.key);
  }

  /** Get all active rumors about a subject */
  aboutSubject(subject: string): Rumor[] {
    return Array.from(this.rumors.values())
      .filter((r) => r.subject === subject && r.status !== 'dead')
      .sort((a, b) => b.confidence - a.confidence)
      .map(cloneRumor);
  }

  /**
   * Rumors this entity has heard (`spreadPath` includes `entityId`), excluding
   * dead, sorted by confidence. Same clone-on-read contract as {@link query}.
   */
  heardBy(entityId: string): Rumor[] {
    return Array.from(this.rumors.values())
      .filter((r) => r.status !== 'dead' && r.spreadPath.includes(entityId))
      .sort((a, b) => b.confidence - a.confidence)
      .map(cloneRumor);
  }

  /**
   * Record whether `entityId` believes / doubts a rumor (F-959f6ee9).
   * Not a field on {@link Rumor} — two hearers can disagree. `'unknown'`
   * clears the entry. `heardBy` is still heard, not believed.
   */
  setStance(
    entityId: string,
    target: string | RumorSubjectKey,
    stance: RumorStance,
    currentTick: number,
  ): RumorStance {
    if (!Number.isFinite(currentTick)) {
      throw new Error('setStance() currentTick must be a finite number');
    }
    if (!(VALID_STANCES as readonly string[]).includes(stance)) {
      throw new Error(`setStance() stance must be believe|doubt|unknown (got ${String(stance)})`);
    }
    const rumorId = this.resolveStanceTarget(target);
    if (!rumorId) return 'unknown';
    if (stance === 'unknown') {
      const byRumor = this.stances.get(entityId);
      byRumor?.delete(rumorId);
      if (byRumor && byRumor.size === 0) this.stances.delete(entityId);
      return 'unknown';
    }
    let byRumor = this.stances.get(entityId);
    if (!byRumor) {
      byRumor = new Map();
      this.stances.set(entityId, byRumor);
    }
    byRumor.set(rumorId, { stance, tick: currentTick });
    return stance;
  }

  /**
   * Stance of `entityId` toward a rumor id or `{subject, key}`.
   * Missing entries are `'unknown'`.
   */
  stanceOf(entityId: string, target?: string | RumorSubjectKey): RumorStance {
    if (target === undefined) return 'unknown';
    const rumorId = typeof target === 'string' ? target : this.resolveStanceTarget(target);
    if (!rumorId) return 'unknown';
    return this.stances.get(entityId)?.get(rumorId)?.stance ?? 'unknown';
  }

  private resolveStanceTarget(target: string | RumorSubjectKey): string | undefined {
    if (typeof target === 'string') {
      return this.rumors.has(target) ? target : undefined;
    }
    return this.resolveTarget(target)?.id;
  }

  /** Count of non-dead rumors */
  activeCount(): number {
    let count = 0;
    for (const r of this.rumors.values()) {
      if (r.status !== 'dead') count++;
    }
    return count;
  }

  /**
   * Serializable snapshot `{ rumors, stances }`. Cloned so mutating the
   * returned arrays cannot write the live Map (F-072c671e). Dead rumors are
   * omitted unless `{ includeDead: true }` — they are a lifecycle end, not
   * retained history (F-97a47e88). Stances ride along (F-959f6ee9).
   */
  serialize(opts?: SerializeOptions): EngineSnapshot {
    const values = opts?.includeDead
      ? Array.from(this.rumors.values())
      : Array.from(this.rumors.values()).filter((r) => r.status !== 'dead');
    const rumorIds = new Set(values.map((r) => r.id));
    const stances: StanceRecord[] = [];
    for (const [entityId, byRumor] of this.stances) {
      for (const [rumorId, rec] of byRumor) {
        if (!rumorIds.has(rumorId)) continue;
        stances.push({ entityId, rumorId, stance: rec.stance, tick: rec.tick });
      }
    }
    stances.sort(
      (a, b) => a.entityId.localeCompare(b.entityId) || a.rumorId.localeCompare(b.rumorId),
    );
    return {
      rumors: structuredClone(values),
      stances: structuredClone(stances),
    };
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
  static deserializeSafe(
    input: Rumor[] | EngineSnapshot,
    config?: RumorEngineConfig,
  ): DeserializeResult {
    const { rumors, stances } = unwrapSnapshot(input);

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

      // F-072c671e: clone at ingestion so the restored Map does not alias
      // the caller's array (or another engine loaded from the same snapshot).
      engine.rumors.set(rumor.id, structuredClone(rumor));
      restored++;

      // Advance THIS instance's counter past the highest RESTORED id (CP-02).
      // Skipped entries don't count — they never entered the registry.
      const match = rumor.id.match(/^rum_(\d+)$/);
      if (match) {
        maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
    }

    engine.nextRumorId = maxNum + 1;
    engine.capDead();
    restoreStances(engine, stances, warnings);
    return { engine, restored, warnings };
  }

  /**
   * Restore from serialized state. Malformed entries are skipped — use
   * {@link RumorEngine.deserializeSafe} to also receive the structured
   * per-entry warnings for your save/load UX.
   */
  static deserialize(input: Rumor[] | EngineSnapshot, config?: RumorEngineConfig): RumorEngine {
    return RumorEngine.deserializeSafe(input, config).engine;
  }
}

/** Human-readable type description for boundary error messages. */
function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}

function unwrapSnapshot(input: unknown): { rumors: Rumor[]; stances: StanceRecord[] } {
  if (Array.isArray(input)) return { rumors: input, stances: [] };
  if (input !== null && typeof input === 'object' && Array.isArray((input as EngineSnapshot).rumors)) {
    const stances = Array.isArray((input as EngineSnapshot).stances)
      ? (input as EngineSnapshot).stances
      : [];
    return { rumors: (input as EngineSnapshot).rumors, stances };
  }
  throw new Error(
    '[rumor-system] deserialize() requires an array of rumors; received ' +
      describeType(input) + '. Pass the array produced by serialize().',
  );
}

function restoreStances(
  engine: RumorEngine,
  stances: StanceRecord[],
  warnings: DeserializeWarning[],
): void {
  for (let i = 0; i < stances.length; i++) {
    const entry = stances[i];
    if (!isStanceRecordShape(entry)) {
      warnings.push({
        field: `stances[${i}]`,
        message: `skipped malformed stance at stances[${i}]`,
      });
      continue;
    }
    if (!engine.get(entry.rumorId)) continue;
    engine.setStance(entry.entityId, entry.rumorId, entry.stance, entry.tick);
  }
}

function isStanceRecordShape(v: unknown): v is StanceRecord {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.entityId === 'string' &&
    m.entityId.length > 0 &&
    typeof m.rumorId === 'string' &&
    m.rumorId.length > 0 &&
    (m.stance === 'believe' || m.stance === 'doubt') &&
    typeof m.tick === 'number' &&
    Number.isFinite(m.tick)
  );
}

function invertClaimValue(value: unknown): unknown {
  if (typeof value === 'boolean') return !value;
  if (typeof value === 'number') return -value;
  return value;
}

// Deterministic pseudo-random based on rumor ID, hop count, and rule ID
function seededRandom(rumorId: string, hop: number, ruleId: string): number {
  let hash = hop * 2654435761;
  for (const char of rumorId + ruleId + 'spread') {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
}
