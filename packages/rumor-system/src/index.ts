// @ai-rpg-engine/rumor-system — rumor lifecycle with mutation mechanics

export type {
  RumorStatus,
  Rumor,
  MutationType,
  MutationContext,
  MutationRule,
  RumorEngineConfig,
  RumorQuery,
} from './types.js';

export {
  VALID_STATUSES,
  VALID_MUTATION_TYPES,
} from './types.js';

export {
  exaggerateMutation,
  minimizeMutation,
  invertMutation,
  attributeShiftMutation,
  embellishMutation,
  DEFAULT_MUTATIONS,
} from './mutations.js';

export { RumorEngine } from './engine.js';

export type { ValidationError } from './validate.js';
export { validateRumor, isValidRumor } from './validate.js';
