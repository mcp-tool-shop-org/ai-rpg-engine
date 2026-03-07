// @ai-rpg-engine/campaign-memory — persistent NPC memory and relationship model

export type {
  RelationshipAxes,
  RecordCategory,
  CampaignRecord,
  Consolidation,
  MemoryFragment,
  NpcMemoryEntry,
  NpcMemoryState,
  MemoryQuery,
  CampaignMemoryConfig,
} from './types.js';

export {
  VALID_CATEGORIES,
  VALID_CONSOLIDATIONS,
  createDefaultRelationship,
} from './types.js';

export { CampaignJournal } from './journal.js';
export type { JournalQueryFilters } from './journal.js';

export { NpcMemoryBank } from './memory-bank.js';

export {
  DEFAULT_RELATIONSHIP_EFFECTS,
  applyRelationshipEffect,
} from './relationship-effects.js';

export type { ValidationError } from './validate.js';
export {
  validateCampaignRecord,
  validateRelationshipAxes,
  validateMemoryFragment,
  isValidCampaignRecord,
  isValidRelationshipAxes,
} from './validate.js';
