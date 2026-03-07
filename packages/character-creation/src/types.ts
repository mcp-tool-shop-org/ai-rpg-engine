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

export type CharacterBuild = {
  name: string;
  archetypeId: string;
  backgroundId: string;
  traitIds: string[];
  disciplineId?: string;
  statAllocations?: Record<string, number>;
  portraitRef?: string;
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
};
