// Campaign memory types — persistent NPC memory and relationship model

/** Multi-axis relationship model beyond boolean hostile */
export type RelationshipAxes = {
  /** -1 (distrust) to 1 (trust) */
  trust: number;
  /** 0 (unafraid) to 1 (terrified) */
  fear: number;
  /** -1 (contempt) to 1 (admiration) */
  admiration: number;
  /** 0 (stranger) to 1 (intimate) */
  familiarity: number;
};

export type RecordCategory =
  | 'action'
  | 'combat'
  | 'kill'
  | 'betrayal'
  | 'gift'
  | 'theft'
  | 'debt'
  | 'discovery'
  | 'alliance'
  | 'insult'
  | 'rescue'
  | 'death'
  | 'companion-joined'
  | 'companion-departed'
  | 'companion-betrayed'
  | 'companion-saved-player'
  | 'companion-died'
  | 'item-acquired'
  | 'item-lost'
  | 'item-recognized'
  | 'item-transformed'
  | 'opportunity-accepted'
  | 'opportunity-completed'
  | 'opportunity-failed'
  | 'opportunity-abandoned'
  | 'endgame-detected'
  | 'campaign-concluded';

/** Persistent record of a significant action/event */
export type CampaignRecord = {
  id: string;
  tick: number;
  category: RecordCategory;
  actorId: string;
  targetId?: string;
  zoneId?: string;
  description: string;
  /** 0-1, how important this event is */
  significance: number;
  witnesses: string[];
  data: Record<string, unknown>;
};

export type Consolidation = 'vivid' | 'faded' | 'dim';

/** Individual memory fragment held by an NPC */
export type MemoryFragment = {
  recordId: string;
  /** 0-1, how vivid/important to this NPC */
  salience: number;
  /** -1 (negative) to 1 (positive) */
  emotionalCharge: number;
  consolidation: Consolidation;
  tick: number;
};

/** Per-NPC memory about a specific entity */
export type NpcMemoryEntry = {
  subjectId: string;
  relationship: RelationshipAxes;
  memories: MemoryFragment[];
  lastInteractionTick: number;
  interactionCount: number;
};

/** Full NPC memory state */
export type NpcMemoryState = {
  entityId: string;
  subjects: Record<string, NpcMemoryEntry>;
};

/** Query filters for NPC memories */
export type MemoryQuery = {
  aboutEntity?: string;
  category?: RecordCategory;
  minSalience?: number;
  consolidation?: Consolidation;
  withinTicks?: number;
  currentTick?: number;
};

/** Campaign memory configuration */
export type CampaignMemoryConfig = {
  /** Salience threshold below which memories consolidate to faded (default: 0.3) */
  fadeThreshold?: number;
  /** Salience threshold below which faded memories become dim (default: 0.1) */
  dimThreshold?: number;
  /** Salience decay rate per tick (default: 0.005) */
  decayRate?: number;
  /** Maximum memories per NPC per subject (default: 20) */
  maxMemoriesPerSubject?: number;
};

export const VALID_CATEGORIES: readonly RecordCategory[] = [
  'action', 'combat', 'kill', 'betrayal', 'gift', 'theft',
  'debt', 'discovery', 'alliance', 'insult', 'rescue', 'death',
  'companion-joined', 'companion-departed', 'companion-betrayed',
  'companion-saved-player', 'companion-died',
  'item-acquired', 'item-lost', 'item-recognized', 'item-transformed',
  'opportunity-accepted', 'opportunity-completed', 'opportunity-failed', 'opportunity-abandoned',
  'endgame-detected', 'campaign-concluded',
] as const;

export const VALID_CONSOLIDATIONS: readonly Consolidation[] = [
  'vivid', 'faded', 'dim',
] as const;

export function createDefaultRelationship(): RelationshipAxes {
  return { trust: 0, fear: 0, admiration: 0, familiarity: 0 };
}
