// Character creation type system
// Defines archetypes, backgrounds, traits, disciplines, and build catalogs

// --- Trait Effects ---

export type TraitEffect =
  | { type: 'stat-modifier'; stat: string; amount: number }
  | { type: 'resource-modifier'; resource: string; amount: number }
  | { type: 'grant-tag'; tag: string }
  | { type: 'verb-access'; verb: string }
  | { type: 'faction-modifier'; faction: string; amount: number };

// --- Archetype (Primary Class) ---

export type ArchetypeDefinition = {
  id: string;
  name: string;
  description: string;
  statPriorities: Record<string, number>;
  resourceOverrides?: Record<string, number>;
  startingTags: string[];
  startingInventory?: string[];
  progressionTreeId: string;
  grantedVerbs?: string[];
};

// --- Background (Origin) ---

export type BackgroundDefinition = {
  id: string;
  name: string;
  description: string;
  statModifiers: Record<string, number>;
  startingTags: string[];
  startingInventory?: string[];
  factionModifiers?: Record<string, number>;
};

// --- Trait ---

export type TraitCategory = 'perk' | 'flaw';

export type TraitDefinition = {
  id: string;
  name: string;
  description: string;
  category: TraitCategory;
  effects: TraitEffect[];
  incompatibleWith?: string[];
};

// --- Discipline (Secondary Class) ---

export type DisciplineDefinition = {
  id: string;
  name: string;
  description: string;
  grantedVerb: string;
  passive: TraitEffect;
  drawback: TraitEffect;
  requiredTags?: string[];
};

// --- Cross-Discipline Titles ---

export type CrossDisciplineTitle = {
  archetypeId: string;
  disciplineId: string;
  title: string;
  tags: string[];
};

// --- Class Entanglement ---

export type ClassEntanglement = {
  id: string;
  archetypeId: string;
  disciplineId: string;
  description: string;
  effects: TraitEffect[];
};

// --- Character Build (Player's Choices) ---

/** Current CharacterBuild schema version (mirrors CharacterProfile's PROFILE_VERSION). */
export const BUILD_VERSION = 1;

export type CharacterBuild = {
  /**
   * Schema version for migration. Stamped by serializeBuild/deserializeBuild;
   * optional so hand-constructed in-memory builds and legacy JSON (which
   * predates versioning) remain valid. Legacy builds are treated as v1.
   */
  version?: number;
  name: string;
  archetypeId: string;
  backgroundId: string;
  traitIds: string[];
  disciplineId?: string;
  statAllocations?: Record<string, number>;
  portraitRef?: string;
};

/**
 * Optional portrait provider injected into resolveEntity / createProfile
 * (F-963fcb3a). Same inject pattern equipment uses for EquipmentStatusOps —
 * this package stays free of an image-gen dependency. Hosts pass
 * image-gen's ensurePortrait (or a sync stub).
 *
 * When `ensure` returns a string it is stamped onto the build/entity before
 * return. A Promise is ignored here (resolveEntity is sync); async hosts
 * await ensurePortrait themselves and set `build.portraitRef`.
 */
export type PortraitOps = {
  ensure(build: CharacterBuild): Promise<string> | string;
};

/** Optional injects for resolveEntity. */
export type ResolveEntityOptions = {
  portraits?: PortraitOps;
};

/** Optional knobs for suggestBuild. */
export type SuggestBuildOptions = {
  name?: string;
  archetypeId?: string;
  backgroundId?: string;
  /** When set, used if the discipline is legal; when `null`, omit a discipline. */
  disciplineId?: string | null;
};

/** Caller-supplied RNG. The only entropy source — no Math.random. */
export type BuildRng = {
  /** Float in [0, 1). */
  next(): number;
  pick?<T>(arr: readonly T[]): T;
};

// --- Build Catalog (Pack-Specific) ---

export type BuildCatalog = {
  packId: string;
  statBudget: number;
  maxTraits: number;
  requiredFlaws: number;
  archetypes: ArchetypeDefinition[];
  backgrounds: BackgroundDefinition[];
  traits: TraitDefinition[];
  disciplines: DisciplineDefinition[];
  crossTitles: CrossDisciplineTitle[];
  entanglements: ClassEntanglement[];
};

// --- Validation Result ---

export type BuildValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  resolvedTitle?: string;
  resolvedTags: string[];
  finalStats: Record<string, number>;
  finalResources: Record<string, number>;
  /** Faction standings folded from faction-modifier effects and background.factionModifiers. */
  resolvedRelations: Record<string, number>;
};
