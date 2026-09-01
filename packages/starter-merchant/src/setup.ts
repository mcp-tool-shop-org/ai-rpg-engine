// Game setup — wire Salt Road Ledger content into the engine.

import { Engine } from '@ai-rpg-engine/core';
import {
  traversalCore,
  statusCore,
  createInventoryCore,
  createDialogueCore,
  createPerceptionFilter,
  createProgressionCore,
  createSimulationInspector,
  createBossPhaseListener,
  createAbilityCore,
  createAbilityEffects,
  createAbilityReview,
  registerStatusDefinitions,
  applyStatus,
  removeStatus,
  buildCombatStack,
  buildWorldStack,
  aggressiveProfile,
  evaluateItemRecognition,
} from '@ai-rpg-engine/modules';
import { createEquipmentCore, createItemChronicleCore } from '@ai-rpg-engine/equipment';
import * as engineModules from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatResourceProfile, IntentProfile } from '@ai-rpg-engine/modules';
import {
  manifest,
  player,
  assayMasterCorvane,
  harbourmasterDrell,
  brokerInaya,
  tallyClerkVessa,
  exchequerNull,
  apothecaryTinctureEffect,
  collectionsEnforcer,
  warrenCutpurse,
  bondedClerkThrall,
  theStandingAccount,
  theStandingAccountBoss,
  zones,
  districts,
  guildRegistrationDialogue,
  warrensTermsDialogue,
  factorsCreditTree,
  merchantAbilities,
  merchantStatusDefinitions,
  progressionRewards,
  encounterSpawnContent,
  itemCatalog,
  merchantQuests,
} from './content.js';
import { merchantMinimalRuleset } from './ruleset.js';
import { seedWorldFactionsFromMembership } from '@ai-rpg-engine/content-schema';
import { createContractCore, consignedLotsAreNotTransferable } from './contract-core.js';

// Merchant-specific: an unbonded broker sees a bonded factor as a mark, not a
// peer. The Warrens reads your seal as something to be relieved of.
const unbondedAppraisal: PresentationRule = {
  id: 'unbonded-appraisal',
  eventPatterns: ['world.zone.entered'],
  priority: 5,
  condition: (_event, ctx) => ctx.observer.tags.includes('unbonded'),
  transform: (event, _ctx) => ({
    ...event,
    payload: {
      ...event.payload,
      _subjectiveDescription: 'someone with a seal walks in, carrying more than they can defend',
      _actorDescription: 'a bonded factor a long way from the Floor',
      _unbondedPerception: true,
    },
  }),
};

// Merchant combat resource profile — LIQUIDITY is what a fight costs you.
//
// Deliberately inverted against every other pack: there is no gain row that
// rewards violence. Winning drains liquidity (property damage, quiet
// settlements, a surgeon who does not ask questions) and the AI modifiers push
// a low-liquidity factor toward disengaging rather than pressing. A factor who
// fights has already made a bad trade; the resource economy has to agree.
const merchantCombatProfile: CombatResourceProfile = {
  packId: 'merchant',
  gains: [],
  spends: [
    { action: 'attack', resourceId: 'liquidity', amount: 6, effects: { damageBonus: 2 } },
    { action: 'guard', resourceId: 'liquidity', amount: 4, effects: { guardBonus: 0.15 } },
  ],
  drains: [
    { trigger: 'take-damage', resourceId: 'liquidity', amount: 3 },
    { trigger: 'defeat-enemy', resourceId: 'liquidity', amount: 5 },
  ],
  aiModifiers: [
    {
      resourceId: 'liquidity',
      highThreshold: 60,
      highModifiers: { attack: 5 },
      lowThreshold: 25,
      lowModifiers: { disengage: 20, guard: 10 },
    },
  ],
};

// ─── Intent profiles ────────────────────────────────────────────────────────
// Every hostile in content.ts declares an ai.profileId. The cognition config
// must supply an IntentProfile for each declared id — with an empty profileMap
// no enemy ever resolves an intent, so enemies never act. `territorial` and
// `calculating` are newer built-ins; resolve them from the installed modules
// build when present, otherwise back the same id with the closest established
// behavior so every declared id still resolves.
function resolveBuiltinProfile(
  id: 'territorial' | 'calculating',
  fallbackEvaluate: IntentProfile['evaluate'],
): IntentProfile {
  const candidate = (engineModules as unknown as Record<string, unknown>)[`${id}Profile`] as
    | IntentProfile
    | undefined;
  if (candidate && candidate.id === id && typeof candidate.evaluate === 'function') {
    return candidate;
  }
  return { id, evaluate: fallbackEvaluate };
}

/**
 * Intent profiles wired into this pack's cognition config:
 * - collections-enforcer / warren-cutpurse → aggressive
 * - bonded-clerk-thrall → territorial (the warehouse seals are his ground)
 * - the-standing-account → calculating (it does arithmetic, not violence)
 */
export const merchantIntentProfiles: IntentProfile[] = [
  aggressiveProfile,
  resolveBuiltinProfile('territorial', aggressiveProfile.evaluate),
  resolveBuiltinProfile('calculating', aggressiveProfile.evaluate),
];

export function createGame(seed?: number): Engine {
  registerStatusDefinitions(merchantStatusDefinitions);

  // Combat stack. A factor who ends up swinging does it by browbeating and
  // backing, never by out-muscling anyone: `tongue` drives damage, `ledger`
  // spots the opening, `standing` is what lets you hold your nerve. Thematically
  // wrong-footed on purpose — this pack does not want you here.
  const combat = buildCombatStack({
    statMapping: { attack: 'tongue', precision: 'ledger', resolve: 'standing' },
    playerId: 'factor',
    resourceProfile: merchantCombatProfile,
    biasTags: ['collections', 'thief'],
    recovery: { safeZoneTags: ['safe', 'home-base'] },
    cognition: {
      profiles: merchantIntentProfiles,
      decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 },
    },
  });

  const factions = [
    {
      factionId: 'assay-guild',
      entityIds: ['assay-master-corvane', 'bonded-clerk-thrall', 'collections-enforcer'],
      cohesion: 0.85,
    },
    {
      factionId: 'harbour-authority',
      entityIds: ['harbourmaster-drell'],
      cohesion: 0.6,
    },
    {
      factionId: 'crown-exchequer',
      entityIds: ['exchequer-null', 'the-standing-account'],
      cohesion: 0.9,
    },
  ];
  const worldStack = buildWorldStack({
    playerId: 'factor',
    factions,
    environment: {
      // Hazards mutate entity.resources directly (deterministic, clamped);
      // environment-core does not record the returned events. Return [].
      hazards: [
        {
          id: 'tide-slick',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('tide-slick') ?? false,
          effect: (_zone, entity, _world, _tick) => {
            // A soaked consignment is a smaller consignment.
            entity.resources.liquidity = Math.max(0, (entity.resources.liquidity ?? 0) - 3);
            return [];
          },
        },
        {
          id: 'no-recourse',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('no-recourse') ?? false,
          effect: (_zone, entity, _world, _tick) => {
            // Nothing down here is insured, and everyone knows it.
            entity.resources.lien = Math.min(100, (entity.resources.lien ?? 0) + 2);
            return [];
          },
        },
      ],
    },
    rumors: { propagationDelay: 3 },
    districts,
    presentationRules: [unbondedAppraisal],
    encounterSpawn: { gameId: manifest.id, ...encounterSpawnContent },
    quests: { gameId: manifest.id, quests: merchantQuests },
    // This starter's own bare genre key ('merchant-minimal' minus its
    // '-minimal' suffix) — NOT manifest.genres, which is a different free-text
    // vocabulary. 'merchant' now HAS entries in GENRE_BUYABLE_STOCK,
    // GENRE_SUPPLY_DEFAULTS and GENRE_RECIPES, added alongside this pack: a
    // trade-first starter falling back to the universal tables would have been
    // the one place that fallback is indefensible.
    tradeGenre: 'merchant',
    craftingGenre: 'merchant',
    economyGenre: 'merchant',
  });

  const engine = new Engine({
    manifest,
    seed: seed ?? 71,
    ruleset: merchantMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      ...combat.modules,
      createInventoryCore([apothecaryTinctureEffect], { transferGuard: consignedLotsAreNotTransferable }),
      createDialogueCore([guildRegistrationDialogue, warrensTermsDialogue]),
      createPerceptionFilter({ perceptionStat: 'ledger' }),
      createProgressionCore({
        trees: [factorsCreditTree],
        rewards: progressionRewards,
      }),
      ...worldStack.modules,
      createBossPhaseListener(theStandingAccountBoss),
      createEquipmentCore({
        catalog: itemCatalog,
        statuses: {
          registerDefinitions: registerStatusDefinitions,
          apply: applyStatus,
          remove: removeStatus,
        },
      }),
      // Instruments earn names. A Guild Seal pressed over enough honoured
      // contracts becomes something a counterparty recognises before you speak —
      // which is the whole of a factor's capital. Wired for the same reason
      // iron-colosseum wires it: this is the pack the mechanic is about.
      createItemChronicleCore({
        catalog: itemCatalog,
        recognition: { evaluate: evaluateItemRecognition },
      }),
      // The five commerce verbs and the obligation clock. Registers no namespace
      // default, so a run in which nothing is ever consigned is indistinguishable
      // from one where this module was never included.
      createContractCore({
        catalog: itemCatalog,
        // Injected so the obligation clock can mark an over-leveraged factor
        // `encumbered`. Without these the status is defined and never applied —
        // which is exactly how it shipped until the P8 audit.
        statuses: { apply: applyStatus, remove: removeStatus },
      }),
      createAbilityCore({
        abilities: merchantAbilities,
        statMapping: { power: 'tongue', precision: 'ledger', focus: 'standing' },
      }),
      createAbilityEffects(),
      createAbilityReview(),
      createSimulationInspector(),
    ],
  });

  for (const zone of zones) {
    engine.store.addZone(zone);
  }

  engine.store.addEntity(player);
  engine.store.addEntity(assayMasterCorvane);
  engine.store.addEntity(harbourmasterDrell);
  engine.store.addEntity(brokerInaya);
  engine.store.addEntity(tallyClerkVessa);
  engine.store.addEntity(exchequerNull);
  engine.store.addEntity(collectionsEnforcer);
  engine.store.addEntity(warrenCutpurse);
  engine.store.addEntity(bondedClerkThrall);
  engine.store.addEntity(theStandingAccount);

  engine.store.state.playerId = 'factor';
  engine.store.state.locationId = 'counting-house';
  seedWorldFactionsFromMembership(engine.store.state, factions);

  // Registration issues the seal. This is the pack's checkpoint 0: the moment a
  // factor can consign at all, and the moment a ledger driver listening for
  // `merchant.books.opened` would call enable().
  engine.store.events.on('dialogue.ended', (event) => {
    if (event.payload.dialogueId !== guildRegistrationDialogue.id) return;
    const world = engine.store.state;
    if (!world.globals['books-opened']) return;

    const factor = world.entities['factor'];
    if (!factor) return;
    if (!(factor.inventory ?? []).includes('guild-seal')) {
      factor.inventory = [...(factor.inventory ?? []), 'guild-seal'];
    }
    if (!world.globals['books-opened-announced']) {
      world.globals['books-opened-announced'] = true;
      engine.store.emitEvent('merchant.books.opened', {
        houseId: manifest.id,
        factorId: 'factor',
      });
    }
  });

  // A seizure is worth hearing.
  engine.store.events.on('merchant.instrument.seized', () => {
    engine.store.emitEvent('audio.cue.requested', {
      cueId: 'scene.seizure',
      channel: 'stinger',
      priority: 'high',
    });
  });

  return engine;
}
