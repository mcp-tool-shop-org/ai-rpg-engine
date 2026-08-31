// Game setup — wire content into engine

import { Engine } from '@ai-rpg-engine/core';
import {
  traversalCore,
  statusCore,
  buildCombatStack,
  buildWorldStack,
  createInventoryCore,
  createDialogueCore,
  createPerceptionFilter,
  createProgressionCore,
  createSimulationInspector,
  giveItem,
  createBossPhaseListener,
  createAbilityCore,
  createAbilityEffects,
  createAbilityReview,
  registerStatusDefinitions,
  applyStatus,
  removeStatus,
  COMBAT_STATES,
  aggressiveProfile,
} from '@ai-rpg-engine/modules';
import { createEquipmentCore } from '@ai-rpg-engine/equipment';
import * as engineModules from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatResourceProfile, IntentProfile } from '@ai-rpg-engine/modules';
import {
  manifest,
  player,
  quartermaster,
  cartographer,
  governor,
  navySailor,
  navyBosun,
  seaBeast,
  boardingMarine,
  drownedGuardianBoss,
  zones,
  districts,
  cartographerDialogue,
  rumBarrelEffect,
  seamanshipTree,
  pirateAbilities,
  pirateStatusDefinitions,
  progressionRewards,
  encounterSpawnContent,
  itemCatalog,
  pirateQuests,
} from './content.js';
import { pirateMinimalRuleset } from './ruleset.js';

// Pirate-specific: cursed creatures perceive all visitors as trespassers
const cursedGuardianPerception: PresentationRule = {
  id: 'cursed-guardian-hostility',
  eventPatterns: ['world.zone.entered'],
  priority: 5,
  condition: (_event, ctx) => ctx.observer.tags.includes('cursed'),
  transform: (event, _ctx) => ({
    ...event,
    payload: {
      ...event.payload,
      _subjectiveDescription: 'a thief dares desecrate the drowned shrine',
      _actorDescription: 'a trespasser from the surface',
      _cursedPerception: true,
    },
  }),
};

// Pirate combat resource profile — crew morale drives everything
const pirateCombatProfile: CombatResourceProfile = {
  packId: 'pirate',
  gains: [
    { trigger: 'defeat-enemy', resourceId: 'morale', amount: 3 },
    { trigger: 'attack-hit', resourceId: 'morale', amount: 2 },
  ],
  spends: [
    { action: 'attack', resourceId: 'morale', amount: 5, effects: { damageBonus: 2 } },
    { action: 'reposition', resourceId: 'morale', amount: 4, effects: { resistState: COMBAT_STATES.EXPOSED, resistChance: 50 } },
  ],
  drains: [
    { trigger: 'take-damage', resourceId: 'morale', amount: 3 },
    { trigger: 'disengage-fail', resourceId: 'morale', amount: 4 },
  ],
  aiModifiers: [
    {
      resourceId: 'morale',
      highThreshold: 60,
      highModifiers: { attack: 10, pressure: 10 },
      lowThreshold: 20,
      lowModifiers: { disengage: 15 },
    },
  ],
};

// ─── Intent profiles (F1-cs-a) ──────────────────────────────────────────────
// Every hostile entity in content.ts declares an ai.profileId. The cognition
// config must supply an IntentProfile for each declared id — with an empty
// profileMap no enemy ever resolves an intent, so enemies never act.
// `territorial` is a newer built-in; resolve it from the installed modules
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
 * - navy-sailor / boarding-marine → aggressive (colonial enforcers who press
 *   the attack on sight)
 * - drowned-guardian → territorial (shrine-bound boss that punishes trespass)
 */
export const pirateIntentProfiles: IntentProfile[] = [
  aggressiveProfile,
  resolveBuiltinProfile('territorial', aggressiveProfile.evaluate),
];

export function createGame(seed?: number): Engine {
  registerStatusDefinitions(pirateStatusDefinitions);

  // Combat stack: brawn for damage, cunning for hit/dodge, sea-legs for guard
  const combat = buildCombatStack({
    statMapping: { attack: 'brawn', precision: 'cunning', resolve: 'sea-legs' },
    playerId: 'captain',
    resourceProfile: pirateCombatProfile,
    biasTags: ['pirate', 'colonial', 'beast'],
    recovery: { safeZoneTags: ['safe', 'ship', 'home-base', 'tavern'] },
    cognition: {
      profiles: pirateIntentProfiles,
      decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 },
    },
  });

  // Strategic tier in one call (F-ENG005-build-world-stack): the same eight
  // modules this setup used to hand-list, same wiring order, same configs.
  // ONE faction roster feeds both faction-cognition and defeat-fallout.
  const worldStack = buildWorldStack({
    playerId: 'captain',
    factions: [
      {
        factionId: 'colonial-navy',
        // `boarding_marine` was missing here, and it is the ONLY navy hostile
        // the player meets without assaulting the fort — it is tagged
        // 'colonial' and 'navy' in content.ts and answered for no faction at
        // all, so cutting marines down accrued heat but neither reputation nor
        // alert. That is most of why the Navy never got angry enough to put a
        // price on the captain's head: `bounty-issued` is gated on rep <= -50
        // AND alert >= 60, defeat fallout pays -10/+15 a kill, and only one of
        // the three navy bodies in the world was counting.
        entityIds: ['navy_sailor', 'navy_bosun', 'boarding_marine', 'governor_vane'],
        cohesion: 0.8,
      },
      {
        // The other half of a bounty. The pressure makes the Navy WANT the
        // captain dead; the opportunity needs someone ELSE — a faction the
        // player stands well with — to actually offer the work
        // (evaluatePressureLinkedOpportunities looks for a rival at rep >= 10).
        // Six of eleven packs ship exactly one faction and therefore have
        // nobody to do the hiring.
        //
        // The Brethren are not new fiction: Bly and Mara are already the
        // captain's own people, already recruitable, already the crew this
        // pack is about. They just had no name as a body.
        factionId: 'brethren-of-the-coast',
        entityIds: ['quartermaster_bly', 'cartographer_mara'],
        cohesion: 0.65,
      },
    ],
    environment: {
      // Hazards mutate entity.resources directly (deterministic, clamped);
      // environment-core does not record the returned events. Return [].
      hazards: [{
        id: 'storm-surge',
        triggerOn: 'world.zone.entered',
        condition: (zone) => zone.hazards?.includes('storm-surge') ?? false,
        effect: (_zone, entity, _world, _tick) => {
          entity.resources.morale = Math.max(0, (entity.resources.morale ?? 0) - 2);
          return [];
        },
      },
      {
        id: 'drowning-pressure',
        triggerOn: 'world.zone.entered',
        condition: (zone) => zone.hazards?.includes('drowning-pressure') ?? false,
        effect: (_zone, entity, _world, _tick) => {
          entity.resources.hp = Math.max(0, (entity.resources.hp ?? 0) - 1);
          return [];
        },
      }],
    },
    rumors: { propagationDelay: 3 },
    districts,
    presentationRules: [cursedGuardianPerception],
    // F-ENG005-encounter-spawn-wiring: the authored encounters + per-zone
    // tables drive zone-entry spawns via the world tick.
    encounterSpawn: { gameId: manifest.id, ...encounterSpawnContent },
    // F-ENG005-quest-loop-min / F-c07d6024: the authored quests give the
    // voyage its explicit reason. quest-core validates at construction
    // (fail loud) and drives the loop off the live event stream.
    quests: { gameId: manifest.id, quests: pirateQuests },
    // V3-GEN-1/2 (genre-mechanical fix, wave 2): this starter's own bare
    // genre key ('pirate-minimal' minus its '-minimal' suffix) — NOT
    // manifest.genres, a different free-text vocabulary (see world-stack.ts's
    // file-header contract). 'pirate' matches a GENRE_BUYABLE_STOCK/
    // GENRE_RECIPES entry, so buy/craft/repair/modify now resolve
    // pirate-flavored stock/recipes instead of the universal fallback.
    tradeGenre: 'pirate',
    craftingGenre: 'pirate',
    economyGenre: 'pirate',
  });

  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: pirateMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      ...combat.modules,
      createInventoryCore([rumBarrelEffect]),
      createDialogueCore([cartographerDialogue]),
      createPerceptionFilter({ perceptionStat: 'cunning' }),
      createProgressionCore({
        trees: [seamanshipTree],
        // T0-progression-ceiling: kills + dialogue + first-visit + boss bonus
        // (defined next to the tree in content.ts so the arithmetic is testable).
        rewards: progressionRewards,
      }),
      ...worldStack.modules,
      createBossPhaseListener(drownedGuardianBoss),
      // F-86b9145d/F-ENG008: the equipment loop — `equip`/`unequip` verbs
      // over the pack's item catalog. Mirrors starter-gladiator's wiring
      // exactly: the module (homed in @ai-rpg-engine/equipment) publishes
      // the catalog under EQUIPMENT_CATALOG_FORMULA and mirrors equipped
      // items' statModifiers into `equipped-<itemId>` statuses; this pack
      // injects the status machinery of its engine build (modules' ops).
      createEquipmentCore({
        catalog: itemCatalog,
        statuses: {
          registerDefinitions: registerStatusDefinitions,
          apply: applyStatus,
          remove: removeStatus,
        },
      }),
      createAbilityCore({ abilities: pirateAbilities, statMapping: { power: 'brawn', precision: 'cunning', focus: 'sea-legs' } }),
      createAbilityEffects(),
      createAbilityReview(),
      createSimulationInspector(),
    ],
  });

  // Add zones
  for (const zone of zones) {
    engine.store.addZone(zone);
  }

  // Add entities
  engine.store.addEntity(player);
  engine.store.addEntity(quartermaster);
  engine.store.addEntity(cartographer);
  engine.store.addEntity(governor);
  engine.store.addEntity(navySailor);
  engine.store.addEntity(navyBosun);
  engine.store.addEntity(seaBeast);
  engine.store.addEntity(boardingMarine);

  // Set player
  engine.store.state.playerId = 'captain';
  engine.store.state.locationId = 'ship-deck';

  // Standing the captain already has when the game opens.
  //
  // `world.factions[id].reputation` is the AUTHORED BASELINE the engine
  // explicitly merges with the accrued `reputation_<id>` delta
  // (buildPressureInputs), and not one pack in the catalog had ever set it —
  // so every world began at a flat, characterless zero with every faction, and
  // reputation could only ever go DOWN from there, because defeat fallout is
  // its only mover short of an opportunity reward.
  //
  // That is a strange place for THIS pack to start. Black Flag Requiem opens
  // on an outlaw captain: the Navy's grudge is the premise, not something the
  // player earns in the first hour. -35 with a watchful-but-not-mobilised
  // alert of 30 says exactly that, and it is what puts `bounty-issued` — gated
  // on rep <= -50 AND alert >= 60, at -10/+15 a kill — within reach of a
  // couple of dead marines rather than an implausible five.
  //
  // The Brethren start at 15 — known, and trusted enough to be offered work,
  // but short of the ally tier (30) that standing has to be earned into. It
  // matters mechanically as well as in the fiction: a bounty is issued by the
  // faction that wants you dead and OFFERED by a rival who stands well enough
  // with you to do the hiring (rep >= 10). At a flat zero the captain had no
  // one to be hired by, and the pack's own central arc — the Navy wants you,
  // your own people pay you to work the coast anyway — could not occur.
  engine.store.state.factions['colonial-navy'] = {
    id: 'colonial-navy',
    name: 'The Colonial Navy',
    reputation: -35,
    disposition: 'hostile',
  };
  engine.store.state.factions['brethren-of-the-coast'] = {
    id: 'brethren-of-the-coast',
    name: 'The Brethren of the Coast',
    reputation: 15,
    disposition: 'wary',
  };
  engine.store.state.globals['faction_alert_colonial-navy'] = 30;

  // Give rum barrel after cartographer deal
  engine.store.events.on('dialogue.ended', (event) => {
    if (event.payload.dialogueId === 'cartographer-maps') {
      const world = engine.store.state;
      if (world.globals['shrine-deal']) {
        const playerEntity = world.entities['captain'];
        if (playerEntity && !(playerEntity.inventory ?? []).includes('rum-barrel')) {
          const giveEvent = giveItem(playerEntity, 'rum-barrel', engine.tick);
          engine.store.recordEvent(giveEvent);
        }
      }
    }
  });

  // Audio cue on entering sunken shrine
  engine.store.events.on('world.zone.entered', (event) => {
    if (event.payload.zoneId === 'sunken-shrine') {
      engine.store.emitEvent('audio.cue.requested', {
        cueId: 'scene.sunken-shrine-reveal',
        channel: 'stinger',
        priority: 'high',
      });
    }
  });

  return engine;
}
