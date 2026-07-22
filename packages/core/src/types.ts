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
  /**
   * Module save-format versions: `EngineModule.version` per registered module,
   * stamped by the Engine at registration so every serialize carries them
   * (the module-level save-migration seam, ENG-009). On restore the Engine
   * compares each entry against the registered module's version and invokes
   * {@link EngineModule.migrateState} on that module's namespace slice when
   * they differ.
   *
   * Optional because saves written before this seam existed lack the field —
   * an absent map (or an absent per-module entry) marks a PRE-VERSIONING save:
   * that module's persisted namespace is treated as authored at the '0.0.0'
   * sentinel (see MODULE_PRE_VERSIONING_SENTINEL in world.ts). New worlds
   * always start with `{}` and the Engine fills entries for its modules.
   */
  moduleVersions?: Record<string, string>;
  /**
   * Monotonic counter for deterministic id generation, scoped to this world
   * instance. Lives in serialized state so save/load preserves the id sequence
   * and a reloaded game never re-mints ids that collide with the eventLog.
   * @see WorldStore.genId
   */
  idCounter: number;
};

/**
 * Per-archetype mechanical config, referenced by id from
 * {@link EntityState.ruleProfileId} and stored in {@link WorldState.ruleProfiles}.
 *
 * DATA, not closures: a profile is a plain record that serializes with world
 * state byte-identically (never a function/subclass), following the same
 * "component referenced by id" idiom as {@link EntityState.faction}. This is what
 * lets a `might` fighter and a `will` mystic resolve combat in one fight, each
 * reading its own stat mapping.
 *
 * `statMapping` is defined structurally here (generic role → stat name) rather
 * than importing modules' `CombatStatMapping`, because `core` has no dependency
 * on `modules`; the two shapes are byte-identical and freely assignable under
 * structural typing.
 *
 * @see resolveEntityMapping in @ai-rpg-engine/modules
 */
export type RuleProfile = {
  /** Generic combat roles → this archetype's stat names. */
  statMapping: { attack: string; precision: string; resolve: string };
  // formulaOverrides?: RESERVED — combat formulas are closures and cannot round-
  // trip through serialized data, so v1 ships statMapping only.
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
  /**
   * Per-entity mechanical profiles, keyed by profile id. Optional + additive: a
   * world without mixed playstyles never sets this and behaves exactly as before.
   * Pure data — serialized with state, byte-identical, no closures.
   * @see EntityState.ruleProfileId
   */
  ruleProfiles?: Record<string, RuleProfile>;
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
  resistances?: Record<string, ResistanceLevel>;
  /**
   * Optional team/side tag for friend-or-foe resolution. When set on both the
   * source and a candidate, ability targeting compares factions directly (same
   * faction = ally); when unset on either, it falls back to the `type` heuristic
   * (same type = ally). Lets a party JRPG put PCs and recruited NPCs on one side
   * even when their `type` differs. Pure data — serialized with state, no closures.
   * @see affiliationOf in @ai-rpg-engine/modules
   */
  faction?: string;
  /**
   * Id into {@link WorldState.ruleProfiles}. When set, this entity resolves its
   * combat stat mapping from that profile (its OWN `attack`/`precision`/`resolve`
   * stat names); when unset it uses the world/fallback mapping exactly as before,
   * so an entity with no `ruleProfileId` is byte-identical to today. Pure data —
   * serialized with state, no closures.
   * @see resolveEntityMapping in @ai-rpg-engine/modules
   */
  ruleProfileId?: string;
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

export type ResistanceLevel = 'immune' | 'resistant' | 'vulnerable';

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
  /**
   * Module-level save migration (ENG-009). Invoked by Engine.deserialize for
   * THIS module when the save's persisted version for it
   * (meta.moduleVersions[id]) differs from the registered `version` — string
   * inequality, both older AND newer persisted versions fire the hook; the
   * module owns its own drift tolerance (the engine-level SAVE_VERSION gate
   * only protects the world format).
   *
   * Contract:
   * - Receives ONLY this module's namespace slice (`state.modules[id]`), never
   *   the whole world, plus the version the slice was persisted at.
   *   `fromVersion` is the '0.0.0' pre-versioning sentinel when the save
   *   predates module versioning (no meta.moduleVersions entry).
   * - Fires only when a persisted slice EXISTS. An absent namespace is not
   *   migrated — it is initialized to the module's registered defaults after
   *   the restored world swaps in.
   * - The return value REPLACES the slice. Returning `undefined` discards the
   *   persisted slice; the namespace is then re-initialized to the module's
   *   registered defaults (deliberate escape hatch for unsalvageable state).
   * - A throw is wrapped in a structured SaveLoadError with code
   *   SAVE_MODULE_MIGRATION_FAILED naming the module and both versions — the
   *   load fails loud; a mismatched slice is never silently misread as the
   *   current shape.
   * - NOT declaring the hook means version drift loads the slice as-is (for
   *   modules whose state shape is stable across versions).
   */
  migrateState?(state: unknown, fromVersion: string): unknown;
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

/**
 * Factory form of a module's namespace defaults. Receives the world the
 * namespace is being initialized INTO, at initialization time — engine
 * construction for fresh worlds, restore for loaded saves whose namespace is
 * absent. Exists for state whose correct defaults depend on the world they
 * join: eventLog-cursor state (world-tick, encounter-spawn) must baseline to
 * the CURRENT log length on a restored legacy save (a static `cursor: 0`
 * planted over an old session's full log makes the first tick re-consume the
 * entire history — the P8-WL-006 spawn-burst class), while on a fresh world
 * the same expression yields 0 because the log is empty at construction.
 */
export type NamespaceDefaultsFactory = (world: Readonly<WorldState>) => unknown;

export interface PersistenceRegistry {
  /**
   * Register the default state for this module's `world.modules[moduleId]`
   * namespace. `defaults` is either plain data (structured-cloned into any
   * world whose namespace is absent) or a {@link NamespaceDefaultsFactory}
   * — a function is ALWAYS treated as a factory and invoked with the target
   * world at initialization time (its result is cloned; never store a bare
   * function as literal default data — functions don't serialize anyway).
   */
  registerNamespace(moduleId: string, defaults: unknown | NamespaceDefaultsFactory): void;
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
