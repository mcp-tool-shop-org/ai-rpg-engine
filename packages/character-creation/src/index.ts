// @ai-rpg-engine/character-creation — headless character creation system

export type {
  TraitEffect,
  ArchetypeDefinition,
  BackgroundDefinition,
  TraitCategory,
  TraitDefinition,
  DisciplineDefinition,
  CrossDisciplineTitle,
  ClassEntanglement,
  CharacterBuild,
  BuildCatalog,
  BuildValidationResult,
} from './types.js';

export { validateBuild } from './validate.js';
export { resolveEntity } from './resolve.js';
export {
  getAvailableArchetypes,
  getAvailableBackgrounds,
  getAvailableTraits,
  getAvailableDisciplines,
  getStatBudgetRemaining,
} from './options.js';
export { resolveTitle, resolveEntanglements } from './titles.js';
export { serializeBuild, deserializeBuild, validateSerializedBuild } from './serialize.js';
