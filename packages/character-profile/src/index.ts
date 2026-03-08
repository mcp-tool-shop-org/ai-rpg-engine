// @ai-rpg-engine/character-profile — persistent character identity

export type {
  ProgressionState,
  TraitEvolution,
  Injury,
  Milestone,
  ReputationEntry,
  CharacterProfile,
} from './types.js';

// Re-export item chronicle types from equipment (canonical home)
export type { ItemChronicleEvent, ItemChronicleEntry } from '@ai-rpg-engine/equipment';

export {
  PROFILE_VERSION,
  XP_THRESHOLDS,
  MAX_ARCHETYPE_RANK,
  MAX_DISCIPLINE_RANK,
} from './types.js';

export { createProfile, touch, incrementTurns, setCustom, getProfileSummary } from './profile.js';

export {
  computeLevel,
  xpToNextLevel,
  grantXp,
  advanceArchetypeRank,
  advanceDisciplineRank,
  evolveTrait,
} from './progression.js';

export {
  addInjury,
  healInjury,
  getActiveInjuries,
  computeInjuryPenalties,
} from './injuries.js';

export {
  recordMilestone,
  getMilestonesByTag,
  adjustReputation,
  getReputation,
} from './milestones.js';

export { serializeProfile, deserializeProfile, validateSerializedProfile } from './serialize.js';
