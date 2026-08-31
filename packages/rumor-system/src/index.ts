// @ai-rpg-engine/rumor-system — rumor lifecycle with mutation mechanics

export type {
  RumorStatus,
  RumorStance,
  Rumor,
  MutationType,
  MutationContext,
  MutationRule,
  RumorEngineConfig,
  RumorQuery,
  RumorSubjectKey,
  CorroborateOptions,
  ContradictOptions,
} from './types.js';

export {
  VALID_STATUSES,
  VALID_MUTATION_TYPES,
  VALID_STANCES,
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
export type {
  DeserializeWarning,
  DeserializeResult,
  SerializeOptions,
  EngineSnapshot,
  StanceRecord,
} from './engine.js';

export type { ValidationError } from './validate.js';
export { validateRumor, isValidRumor } from './validate.js';

export { formatRumorForPlayer, formatRumorBoard } from './format.js';
export type {
  FormatRumorOptions,
  FormatRumorBoardOptions,
  PlayerRumorView,
  RumorBoardLine,
} from './format.js';
