// Rumor system types — enhanced rumor model with mutation and lifecycle

export type RumorStatus = 'spreading' | 'established' | 'fading' | 'dead';

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
  /** How many hops this rumor has traveled */
  hopCount: number;
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
  /** Custom mutation rules (replaces defaults if provided) */
  mutations?: MutationRule[];
};

/** Query for filtering rumors */
export type RumorQuery = {
  subject?: string;
  sourceId?: string;
  status?: RumorStatus;
  minConfidence?: number;
  factionId?: string;
  afterTick?: number;
};

export const VALID_STATUSES: readonly RumorStatus[] = [
  'spreading', 'established', 'fading', 'dead',
] as const;

export const VALID_MUTATION_TYPES: readonly MutationType[] = [
  'exaggerate', 'minimize', 'invert', 'attribute-shift', 'embellish',
] as const;
