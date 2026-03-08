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

// --- Finale (v2.0) ---
export {
  buildFinaleOutline,
  formatFinaleForDirector,
  formatFinaleForTerminal,
} from './finale.js';
export type {
  NpcFate,
  FactionFate,
  DistrictFate,
  LegacyEntry,
  FinaleNpcInput,
  FinaleFactionInput,
  FinaleDistrictInput,
  FinaleOutline,
} from './finale.js';

export type { ValidationError } from './validate.js';
export {
  validateCampaignRecord,
  validateRelationshipAxes,
  validateMemoryFragment,
  isValidCampaignRecord,
  isValidRelationshipAxes,
} from './validate.js';
