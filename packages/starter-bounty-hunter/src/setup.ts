// Game setup — wire Hue and Cry content into the engine.

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
  clerkHesper,
  motherSlack,
  sergeantPike,
  theScrivener,
  rookeryRunner,
  bludger,
  nightman,
  jonathanQuill,
  jonathanQuillBoss,
  zones,
  districts,
  swearingInDialogue,
  flashHouseDialogue,
  thiefTakersNameTree,
  bountyHunterAbilities,
  bountyHunterStatusDefinitions,
  progressionRewards,
  encounterSpawnContent,
  itemCatalog,
  bountyHunterQuests,
  cordialFlaskEffect,
} from './content.js';
import { bountyHunterMinimalRuleset } from './ruleset.js';
import { seedWorldFactionsFromMembership } from '@ai-rpg-engine/content-schema';
import { createPursuitCore } from './pursuit-core.js';

// The Rookery reads a sworn man the way the Ward reads a thief: as somebody
// who is here for a reason, and whose reason is probably you.
const swornOnSight: PresentationRule = {
  id: 'sworn-on-sight',
  eventPatterns: ['world.zone.entered'],
  priority: 5,
  condition: (_event, ctx) => ctx.observer.tags.includes('unbonded'),
  transform: (event, _ctx) => ({
    ...event,
    payload: {
      ...event.payload,
      _subjectiveDescription: 'a sworn man comes down the stair, and does not look lost',
      _actorDescription: 'somebody the office sends when it will not come itself',
      _swornPerception: true,
    },
  }),
};

// Combat resource profile — STAMINA is what a pursuit costs you.
//
// The inversion here is smaller than merchant's and pointed at a different
// thing: violence is not forbidden, it is LOUD. Fighting spends stamina, and
// stamina is what `lay-low` restores and what `run-him-down` needs — so a
// thief-taker who solves everything with the staff arrives at every collar
// too winded to make it. The AI modifiers push a tired hunter toward
// disengaging, which is the same lesson from the other side.
const bountyHunterCombatProfile: CombatResourceProfile = {
  packId: 'bounty-hunter',
  gains: [],
  spends: [
    { action: 'attack', resourceId: 'stamina', amount: 4, effects: { damageBonus: 2 } },
    { action: 'guard', resourceId: 'stamina', amount: 2, effects: { guardBonus: 0.15 } },
  ],
  drains: [
    { trigger: 'take-damage', resourceId: 'stamina', amount: 2 },
  ],
  aiModifiers: [
    {
      resourceId: 'stamina',
      highThreshold: 30,
      highModifiers: { attack: 5 },
      lowThreshold: 10,
      lowModifiers: { disengage: 20, guard: 10 },
    },
  ],
};

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
 * Intent profiles wired into this pack's cognition config. Every hostile in
 * content.ts declares an `ai.profileId` and every declared id must resolve —
 * with an empty profileMap no enemy ever picks an intent, so no enemy acts.
 *   rookery-runner / bludger → aggressive
 *   nightman                 → territorial (the Flash House is his ground)
 *   jonathan-quill           → calculating (he talks first, and means it)
 */
export const bountyHunterIntentProfiles: IntentProfile[] = [
  aggressiveProfile,
  resolveBuiltinProfile('territorial', aggressiveProfile.evaluate),
  resolveBuiltinProfile('calculating', aggressiveProfile.evaluate),
];

export function createGame(seed?: number): Engine {
  registerStatusDefinitions(bountyHunterStatusDefinitions);

  // `grip` swings, `nose` finds the opening, `authority` is what keeps you
  // standing when three of them decide at once. Unlike merchant's deliberately
  // wrong-footed mapping, this one is straight: a thief-taker in a fight is
  // doing something they are actually trained for. It is still the expensive
  // way to end an evening.
  const combat = buildCombatStack({
    statMapping: { attack: 'grip', precision: 'nose', resolve: 'authority' },
    playerId: 'thief-taker',
    resourceProfile: bountyHunterCombatProfile,
    biasTags: ['thieves-company', 'thief'],
    recovery: { safeZoneTags: ['safe', 'home-base'] },
    cognition: {
      profiles: bountyHunterIntentProfiles,
      decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 },
    },
  });

  const factions = [
    {
      factionId: 'bounty-office',
      entityIds: ['clerk-hesper'],
      cohesion: 0.8,
    },
    {
      factionId: 'parish-watch',
      entityIds: ['sergeant-pike', 'the-scrivener'],
      cohesion: 0.5,
    },
    {
      factionId: 'thieves-company',
      entityIds: ['mother-slack', 'bludger', 'nightman', 'jonathan-quill'],
      cohesion: 0.9,
    },
  ];
  const worldStack = buildWorldStack({
    playerId: 'thief-taker',
    factions,
    environment: {
      hazards: [
        {
          id: 'no-recourse',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('no-recourse') ?? false,
          effect: (_zone, entity, _world, _tick) => {
            // Down here nobody will testify for you, and the walk costs.
            entity.resources.stamina = Math.max(0, (entity.resources.stamina ?? 0) - 2);
            return [];
          },
        },
      ],
    },
    rumors: { propagationDelay: 3 },
    districts,
    presentationRules: [swornOnSight],
    encounterSpawn: { gameId: manifest.id, ...encounterSpawnContent },
    quests: { gameId: manifest.id, quests: bountyHunterQuests },
    // This starter's own bare genre key ('bounty-hunter-minimal' minus its
    // '-minimal' suffix). No GENRE_* table entry exists for 'bounty-hunter',
    // so these fall back to the universal tables — which is the RIGHT answer
    // here and was the wrong one for merchant: this pack's economy is names
    // and warrants, not stock. Its distinctive trade is `fence`, which is a
    // pack verb with its own handler, not a genre table.
    tradeGenre: 'bounty-hunter',
    craftingGenre: 'bounty-hunter',
    economyGenre: 'bounty-hunter',
  });

  const engine = new Engine({
    manifest,
    seed: seed ?? 71,
    ruleset: bountyHunterMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      ...combat.modules,
      createInventoryCore([cordialFlaskEffect]),
      createDialogueCore([swearingInDialogue, flashHouseDialogue]),
      createPerceptionFilter({ perceptionStat: 'nose' }),
      createProgressionCore({
        trees: [thiefTakersNameTree],
        rewards: progressionRewards,
      }),
      ...worldStack.modules,
      createBossPhaseListener(jonathanQuillBoss),
      createEquipmentCore({
        catalog: itemCatalog,
        statuses: {
          registerDefinitions: registerStatusDefinitions,
          apply: applyStatus,
          remove: removeStatus,
        },
      }),
      // Darbies earn names. A pair that has closed on enough men becomes
      // something a mark recognises before you speak — which is most of what a
      // thief-taker's reputation IS.
      createItemChronicleCore({
        catalog: itemCatalog,
        recognition: { evaluate: evaluateItemRecognition },
      }),
      // The six pursuit verbs. Registers no namespace default, so a run in
      // which nothing is collared, posted, bought or fenced is indistinguishable
      // from one where this module was never included.
      createPursuitCore(),
      createAbilityCore({
        abilities: bountyHunterAbilities,
        statMapping: { power: 'grip', precision: 'nose', focus: 'authority' },
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
  engine.store.addEntity(clerkHesper);
  engine.store.addEntity(motherSlack);
  engine.store.addEntity(sergeantPike);
  engine.store.addEntity(theScrivener);
  engine.store.addEntity(rookeryRunner);
  engine.store.addEntity(bludger);
  engine.store.addEntity(nightman);
  engine.store.addEntity(jonathanQuill);

  engine.store.state.playerId = 'thief-taker';
  engine.store.state.locationId = 'bounty-office';
  seedWorldFactionsFromMembership(engine.store.state, factions);

  // Signing for a ticket is the pack's checkpoint 0: the moment the office
  // owns what you do next, and the moment a bill in your hand means something.
  engine.store.events.on('dialogue.ended', (event) => {
    if (event.payload.dialogueId !== swearingInDialogue.id) return;
    const world = engine.store.state;
    if (!world.globals['sworn-in']) return;

    const taker = world.entities['thief-taker'];
    if (!taker) return;
    if (!(taker.inventory ?? []).includes('bill-of-hue')) {
      taker.inventory = [...(taker.inventory ?? []), 'bill-of-hue'];
    }
    if (!world.globals['sworn-in-announced']) {
      world.globals['sworn-in-announced'] = true;
      engine.store.emitEvent('pursuit.sworn.in', {
        officeId: manifest.id,
        takerId: 'thief-taker',
      });
    }
  });

  // A conviction is worth hearing — it is the only moment in this pack where
  // the city agrees with you out loud.
  engine.store.events.on('pursuit.mark.convicted', () => {
    engine.store.emitEvent('audio.cue.requested', {
      cueId: 'scene.conviction',
      channel: 'stinger',
      priority: 'high',
    });
  });

  return engine;
}
