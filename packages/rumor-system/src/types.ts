// Rumor system types — enhanced rumor model with mutation and lifecycle

export type RumorStatus = 'spreading' | 'established' | 'fading' | 'dead';

/**
 * Per-entity belief in a rumor (F-959f6ee9). Stored on the engine, not on
 * {@link Rumor}, so two hearers can disagree. `heardBy` stays heard, not believed.
 */
export type RumorStance = 'believe' | 'doubt' | 'unknown';

/** Enhanced rumor with full lifecycle tracking */
export type Rumor = {
  id: string;
  /** Human-readable claim, e.g. "player killed merchant_1" */
  claim: string;
  /** Entity/topic the rumor is about */
  subject: string;
  /** Belief key */
  key: string;
  /** Current claimed value (may have mutated during spread) */
  value: unknown;
  /** What was originally claimed */
  originalValue: unknown;
  /** Original witness entity ID */
  sourceId: string;
  /** Tick when the rumor was created */
  originTick: number;
  /** 0-1, how confident spreaders are in this claim */
  confidence: number;
  /** -1 (outrage) to 1 (admiration) */
  emotionalCharge: number;
  /** Entity IDs the rumor passed through, in order */
  spreadPath: string[];
  /** How many times the value changed during spread */
  mutationCount: number;
  /** Which factions absorbed this rumor */
  factionUptake: string[];
  /** Current lifecycle status */
  status: RumorStatus;
  /** Last tick this rumor was spread to someone new */
  lastSpreadTick: number;
};

export type MutationType =
  | 'exaggerate'
  | 'minimize'
  | 'invert'
  | 'attribute-shift'
  | 'embellish';

/** Context available when evaluating mutations */
export type MutationContext = {
  spreaderId: string;
  spreaderFactionId?: string;
  receiverId: string;
  receiverFactionId?: string;
  /** 0-1, environmental chaos multiplier */
  environmentInstability: number;
  /**
   * How many hops this rumor has traveled. `RumorEngine.spread` derives the
   * hop count from `spreadPath.length` and passes that derived value into
   * mutation rules — callers may still supply this field, but the engine does
   * not trust it for `lastSpreadTick` or mutation rolls.
   */
  hopCount: number;
  /**
   * Sim tick at which this hop occurs. Written to `lastSpreadTick` so a
   * rumor first heard long after `originTick` does not die on the same frame
   * it announced (F-8c128e3d).
   */
  currentTick: number;
};

/** Rule defining how a rumor mutates during spread */
export type MutationRule = {
  id: string;
  type: MutationType;
  /** Base probability of this mutation per hop (0-1) */
  probability: number;
  /** Apply the mutation — returns a new rumor with modified value/charge */
  apply: (rumor: Rumor, ctx: MutationContext) => Rumor;
};

/** Configuration for the rumor engine */
export type RumorEngineConfig = {
  /** Max hops before rumor status becomes 'fading' (default: 5) */
  maxHops?: number;
  /** Confidence decay per hop (default: 0.1) */
  confidenceDecayPerHop?: number;
  /** Ticks of inactivity before status becomes 'fading' (default: 10) */
  fadingThreshold?: number;
  /** Ticks of inactivity before status becomes 'dead' (default: 30) */
  deathThreshold?: number;
  /**
   * Max dead rumors retained in the live Map (default: 64). Oldest dead
   * (by lastSpreadTick, then originTick) drop first so a missing pruneDead()
   * cannot unbounded-grow a campaign (F-97a47e88).
   */
  maxDeadRumors?: number;
  /** Custom mutation rules (replaces defaults if provided) */
  mutations?: MutationRule[];
};

/** Subject + belief key that identify one board line (F-d81fd1b9). */
export type RumorSubjectKey = {
  subject: string;
  key: string;
};

/** Options for {@link RumorEngine.corroborate}. */
export type CorroborateOptions = {
  /** Second witness — unioned onto `spreadPath`. */
  witnessId: string;
  /** Sim tick of the corroboration (written to `lastSpreadTick`). */
  currentTick: number;
  /** Added to confidence and clamped to [0, 1]. Default 0.1. */
  confidenceDelta?: number;
};

/** Options for {@link RumorEngine.contradict}. */
export type ContradictOptions = {
  /** Named source of the denial / retraction. */
  sourceId: string;
  currentTick: number;
  /**
   * When true, mark the rumor `dead` (trusted retraction).
   * When omitted, invert a boolean/number value; non-invertible values are
   * marked dead instead.
   */
  kill?: boolean;
  /** Added to confidence and clamped to [0, 1]. Default -0.2. */
  confidenceDelta?: number;
};

/** Query for filtering rumors */
export type RumorQuery = {
  subject?: string;
  sourceId?: string;
  status?: RumorStatus;
  minConfidence?: number;
  factionId?: string;
  afterTick?: number;
  /** Entity id that appears on `spreadPath` (who has heard the rumor). */
  hearerId?: string;
  /** Entity whose {@link RumorStance} is `'believe'` for this rumor (F-959f6ee9). */
  believerId?: string;
};

export const VALID_STATUSES: readonly RumorStatus[] = [
  'spreading', 'established', 'fading', 'dead',
] as const;

export const VALID_MUTATION_TYPES: readonly MutationType[] = [
  'exaggerate', 'minimize', 'invert', 'attribute-shift', 'embellish',
] as const;

export const VALID_STANCES: readonly RumorStance[] = [
  'believe', 'doubt', 'unknown',
] as const;
