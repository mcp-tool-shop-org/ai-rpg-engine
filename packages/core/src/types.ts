// Canonical runtime types — AI RPG Engine Engine Constitution v0.1
// Rulesets may extend these, not break them.

export type ScalarValue = string | number | boolean;

// --- Game Manifest ---

export type GameManifest = {
  id: string;
  title: string;
  version: string;
  engineVersion: string;
  ruleset: string;
  modules: string[];
  contentPacks: string[];
  theme?: string;
  audioProfile?: string;
  settings?: Record<string, unknown>;
};

// --- World State ---

export type WorldMeta = {
  worldId: string;
  gameId: string;
  saveVersion: string;
  tick: number;
  seed: number;
  activeRuleset: string;
  activeModules: string[];
};

export type WorldState = {
  meta: WorldMeta;
  playerId: string;
  locationId: string;
  entities: Record<string, EntityState>;
  zones: Record<string, ZoneState>;
  quests: Record<string, QuestState>;
  factions: Record<string, FactionState>;
  globals: Record<string, ScalarValue>;
  modules: Record<string, unknown>;
  eventLog: ResolvedEvent[];
  pending: PendingEffect[];
  narrator?: NarratorState;
};

// --- Entity ---

export type VisibilityState = {
  hidden: boolean;
  detectableBy?: string[];
};

export type AIState = {
  profileId: string;
  goals: string[];
  fears: string[];
  alertLevel: number;
  knowledge: Record<string, ScalarValue>;
};

export type EntityState = {
  id: string;
  blueprintId: string;
  type: string;
  name: string;
  tags: string[];
  stats: Record<string, number>;
  resources: Record<string, number>;
  statuses: AppliedStatus[];
  inventory?: string[];
  equipment?: Record<string, string | null>;
  relations?: Record<string, ScalarValue>;
  zoneId?: string;
  visibility?: VisibilityState;
  ai?: AIState;
  custom?: Record<string, ScalarValue>;
};

// --- Zone ---

export type ZoneState = {
  id: string;
  roomId: string;
  name: string;
  tags: string[];
  neighbors: string[];
  light?: number;
  noise?: number;
  stability?: number;
  authority?: Record<string, number>;
  hazards?: string[];
  interactables?: string[];
};

// --- Action ---

export type ActionSource = 'player' | 'ai' | 'system' | 'script' | 'environment';

export type ActionIntent = {
  id: string;
  actorId: string;
  verb: string;
  targetIds?: string[];
  toolId?: string;
  parameters?: Record<string, ScalarValue>;
  source: ActionSource;
  issuedAtTick: number;
};

// --- Events ---

export type EventChannel = 'objective' | 'narrator' | 'dialogue' | 'system' | 'glitch';
export type EventPriority = 'low' | 'normal' | 'high' | 'critical';
export type EventVisibility = 'public' | 'private' | 'hidden';

export type EventPresentation = {
  channels?: EventChannel[];
  priority?: EventPriority;
  concealment?: number;
  distortionTags?: string[];
  soundCues?: string[];
};

export type ResolvedEvent = {
  id: string;
  tick: number;
  type: string;
  actorId?: string;
  targetIds?: string[];
  payload: Record<string, unknown>;
  tags?: string[];
  visibility?: EventVisibility;
  presentation?: EventPresentation;
  causedBy?: string;
};

// --- Status ---

export type AppliedStatus = {
  id: string;
  statusId: string;
  stacks?: number;
  sourceId?: string;
  appliedAtTick: number;
  expiresAtTick?: number;
  data?: Record<string, ScalarValue>;
};

// --- Pending Effects ---

export type PendingEffect = {
  id: string;
  type: string;
  executeAtTick: number;
  payload: Record<string, unknown>;
  sourceEventId?: string;
};

// --- Quest ---

export type QuestStageStatus = 'locked' | 'active' | 'completed' | 'failed';

export type QuestState = {
  id: string;
  questId: string;
  status: 'active' | 'completed' | 'failed';
  currentStage: string;
  stageStatuses: Record<string, QuestStageStatus>;
  data?: Record<string, ScalarValue>;
};

// --- Faction ---

export type FactionState = {
  id: string;
  name: string;
  reputation: number;
  disposition: string;
  data?: Record<string, ScalarValue>;
};

// --- Narrator ---

export type NarratorState = {
  mode: string;
  voice?: string;
  distortionLevel?: number;
  data?: Record<string, unknown>;
};

// --- Audio ---

export type AudioChannel = 'ambient' | 'stinger' | 'voice' | 'ui';
export type AudioPriority = 'low' | 'normal' | 'high';

export type AudioCueRequest = {
  cueId: string;
  priority?: AudioPriority;
  channel?: AudioChannel;
  actorId?: string;
  textId?: string;
  tags?: string[];
};

// --- Module API ---

export type EngineModule = {
  id: string;
  version: string;
  dependsOn?: string[];
  register(ctx: ModuleRegistrationContext): void;
  /** Called after all modules are registered, before first tick */
  init?(ctx: ModuleRegistrationContext): void;
  /** Called on engine shutdown */
  teardown?(): void;
};

export type ModuleRegistrationContext = {
  actions: ActionRegistry;
  rules: RuleRegistry;
  events: EventRegistry;
  content: ContentRegistry;
  persistence: PersistenceRegistry;
  ui: UIRegistry;
  debug: DebugRegistry;
  formulas: FormulaRegistryAccess;
};

// Registry interfaces — will be fleshed out in Step 5
export interface ActionRegistry {
  registerVerb(verb: string, handler: VerbHandler): void;
}

export interface RuleRegistry {
  registerCheck(check: RuleCheck): void;
  registerEffect(effect: RuleEffect): void;
}

export interface EventRegistry {
  on(eventType: string, handler: EventHandler): void;
  emit(event: ResolvedEvent): void;
}

export interface ContentRegistry {
  extendSchema(moduleId: string, schema: Record<string, unknown>): void;
}

export interface PersistenceRegistry {
  registerNamespace(moduleId: string, defaults: unknown): void;
}

export interface UIRegistry {
  registerPanel(panel: PanelDefinition): void;
}

export interface DebugRegistry {
  registerInspector(inspector: DebugInspector): void;
}

export interface FormulaRegistryAccess {
  register(id: string, fn: (...args: unknown[]) => unknown): void;
  get(id: string): (...args: unknown[]) => unknown;
  has(id: string): boolean;
}

// Handler types
export type VerbHandler = (action: ActionIntent, world: WorldState) => ResolvedEvent[];
export type EventHandler = (event: ResolvedEvent, world: WorldState) => void;
export type RuleCheck = {
  id: string;
  check: (action: ActionIntent, world: WorldState) => boolean;
};
export type RuleEffect = {
  id: string;
  apply: (event: ResolvedEvent, world: WorldState) => ResolvedEvent[];
};
export type PanelDefinition = {
  id: string;
  label: string;
  render: (world: WorldState) => string;
};
export type DebugInspector = {
  id: string;
  label: string;
  inspect: (world: WorldState) => unknown;
};

// --- Ruleset ---

export type StatDefinition = {
  id: string;
  name: string;
  min?: number;
  max?: number;
  default: number;
};

export type ResourceDefinition = {
  id: string;
  name: string;
  min?: number;
  max?: number;
  default: number;
  regenRate?: number;
};

export type VerbDefinition = {
  id: string;
  name: string;
  tags?: string[];
  description?: string;
};

export type FormulaDeclaration = {
  id: string;
  name: string;
  description?: string;
  inputs: string[];
  output: string;
};

export type RulesetDefinition = {
  id: string;
  name: string;
  version: string;
  stats: StatDefinition[];
  resources: ResourceDefinition[];
  verbs: VerbDefinition[];
  formulas: FormulaDeclaration[];
  defaultModules: string[];
  progressionModels: string[];
  contentConventions?: Record<string, unknown>;
};
