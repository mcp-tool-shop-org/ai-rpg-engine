// @ai-rpg-engine/starter-merchant — Salt Road Ledger
//
// P4 (contract-core). createGame lands in P5.

export { createGame, merchantIntentProfiles } from './setup.js';
export { merchantMinimalRuleset } from './ruleset.js';
export {
  createContractCore,
  getContractState,
  getOpenObligations,
  getOverdueObligations,
  honourObligation,
  defaultObligation,
  tickObligations,
  CONTRACT_STATE_KEY,
  SEIZURE_THRESHOLD,
  REVOCATION_THRESHOLD,
  DEFAULT_TERM_TICKS,
} from './contract-core.js';
export type {
  Obligation,
  ObligationStatus,
  UnderwritingPolicy,
  ContractModuleState,
  ContractCoreConfig,
} from './contract-core.js';
export {
  manifest,
  packMeta,
  buildCatalog,
  itemCatalog,
  districts,
  zones,
  factorsCreditTree,
  xpAwards,
  progressionRewards,
  merchantAbilities,
  merchantStatusDefinitions,
  merchantQuests,
  encounterSpawnContent,
  tallyClerkVessa,
  apothecaryTinctureEffect,
  theStandingAccountBoss,
  guildRegistrationDialogue,
  warrensTermsDialogue,
} from './content.js';
