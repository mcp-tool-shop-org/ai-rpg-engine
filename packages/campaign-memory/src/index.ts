// @ai-rpg-engine/campaign-memory — persistent NPC memory and relationship model

export type {
  RelationshipAxes,
  RecordCategory,
  CampaignRecord,
  Consolidation,
  MemoryFragment,
  NpcMemoryEntry,
  NpcMemoryState,
  SerializedJournal,
  MemoryQuery,
  CampaignMemoryConfig,
} from './types.js';

export {
  CAMPAIGN_MEMORY_VERSION,
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

// Live write side (F-6594b19b / F-34f5622c / F-0df0c914): opt-in EngineModule
// that journals kills / gifts / rescues / betrayals plus live item/companion/
// opportunity/death/zone-enter/node-unlock events with zone witnesses, copies
// attitude onto EntityState, and persists NPC banks via registerNamespace.
// Does not call consolidate (F-c1949ae0).
export {
  createCampaignMemoryCore,
  getCampaignJournal,
  getNpcMemory,
  formatNpcAttitudes,
  CAMPAIGN_MEMORY_STATE_KEY,
} from './memory-core.js';
export type {
  CampaignMemoryCoreConfig,
  CampaignMemoryModuleState,
} from './memory-core.js';

export type { ValidationError } from './validate.js';
export {
  describeNumeric,
  validateCampaignRecord,
  validateRelationshipAxes,
  validateMemoryFragment,
  isValidCampaignRecord,
  isValidRelationshipAxes,
} from './validate.js';
