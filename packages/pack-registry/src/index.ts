// @ai-rpg-engine/pack-registry — starter pack catalog and quality rubric

export type {
  PackGenre,
  PackDifficulty,
  PackTone,
  PackMetadata,
  PackDistrictInfo,
  PackBuildCatalog,
  PackItemCatalog,
  PackProgressionTree,
  PackStatusDefinition,
  PackEntry,
  PackSummary,
  PackFilter,
  DiscoverFrom,
  DiscoverInstalledPacksOptions,
  RubricDimension,
  RubricCheck,
  RubricResult,
} from './types.js';

export {
  VALID_GENRES,
  PACK_GENRE_LABELS,
  genreLabel,
  VALID_DIFFICULTIES,
  VALID_TONES,
  RUBRIC_DIMENSIONS,
} from './types.js';

export {
  registerPack,
  getPack,
  getAllPacks,
  filterPacks,
  getPackIds,
  getPackSummaries,
  clearRegistry,
} from './registry.js';

export { validatePackRubric } from './rubric.js';

export {
  packEntryFromModule,
  registerFromModule,
  discoverInstalledPacks,
} from './discover.js';
