// Game setup — wire content into engine

import { Engine } from '@ai-rpg-engine/core';
import {
  traversalCore,
  statusCore,
  createInventoryCore,
  createDialogueCore,
  createPerceptionFilter,
  createProgressionCore,
  createSimulationInspector,
  giveItem,
  buildWorldStack,
  createBossPhaseListener,
  createAbilityCore,
  createAbilityEffects,
  createAbilityReview,
  registerStatusDefinitions,
  applyStatus,
  removeStatus,
  buildCombatStack,
  COMBAT_STATES,
  aggressiveProfile,
} from '@ai-rpg-engine/modules';
import { createEquipmentCore } from '@ai-rpg-engine/equipment';
import * as engineModules from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatResourceProfile, IntentProfile } from '@ai-rpg-engine/modules';
import {
  manifest,
  player,
  bartender,
  sheriff,
  revenant,
  crawler,
  banditRider,
  mesaCrawlerBoss,
  zones,
  districts,
  bartenderDialogue,
  sageBundleEffect,
  gunslingerTree,
  weirdWestAbilities,
  weirdWestStatusDefinitions,
  progressionRewards,
  encounterSpawnContent,
  itemCatalog,
  weirdWestQuests,
} from './content.js';
import { weirdWestMinimalRuleset } from './ruleset.js';

// Spirits perceive the living as echoes of the future
const spiritPerception: PresentationRule = {
  id: 'spirit-future-echo',
  eventPatterns: ['world.zone.entered'],
  priority: 5,
  condition: (_event, ctx) => ctx.observer.tags.includes('spirit'),
  transform: (event, _ctx) => ({
    ...event,
    payload: {
      ...event.payload,
      _subjectiveDescription: 'an echo of the future stumbles through the veil',
      _actorDescription: 'a flickering presence not yet dead',
      _spiritPerception: true,
    },
  }),
};

// Weird West combat resource profile — corruption and iron will
const weirdWestCombatProfile: CombatResourceProfile = {
  packId: 'weird-west',
  gains: [
    { trigger: 'take-damage', resourceId: 'dust', amount: 3 },
  ],
  spends: [
    { action: 'brace', resourceId: 'resolve', amount: 3, effects: { guardBonus: 0.10, resistState: COMBAT_STATES.OFF_BALANCE, resistChance: 60 } },
    { action: 'attack', resourceId: 'resolve', amount: 2, effects: { damageBonus: 1 } },
  ],
  drains: [
    { trigger: 'take-damage', resourceId: 'resolve', amount: 1 },
  ],
  aiModifiers: [
    {
      resourceId: 'dust',
      highThreshold: 60,
      highModifiers: { disengage: 15 },
    },
    {
      resourceId: 'resolve',
      lowThreshold: 20,
      lowModifiers: { guard: 10, brace: 10 },
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
 * - dust-revenant / bandit-rider → aggressive (duel-hungry dead, road robbers)
 * - mesa-crawler → territorial (spirit bound to guard its hollow)
 */
export const weirdWestIntentProfiles: IntentProfile[] = [
  aggressiveProfile,
  resolveBuiltinProfile('territorial', aggressiveProfile.evaluate),
];

export function createGame(seed?: number): Engine {
  registerStatusDefinitions(weirdWestStatusDefinitions);

  // Combat stack: grit for damage, draw-speed for hit/dodge, lore for resolve
  const combat = buildCombatStack({
    statMapping: { attack: 'grit', precision: 'draw-speed', resolve: 'lore' },
    playerId: 'drifter',
    resourceProfile: weirdWestCombatProfile,
    biasTags: ['undead', 'spirit', 'beast'],
    cognition: {
      profiles: weirdWestIntentProfiles,
      decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 },
    },
  });

  // Strategic tier in one call (F-ENG005-build-world-stack): the same eight
  // modules this setup used to hand-list, same wiring order, same configs.
  // ONE faction roster feeds both faction-cognition and defeat-fallout.
  const worldStack = buildWorldStack({
    playerId: 'drifter',
    factions: [
      {
        factionId: 'townsfolk',
        entityIds: ['bartender_silas', 'sheriff_hale'],
        cohesion: 0.4,
      },
      {
        factionId: 'red-congregation',
        entityIds: ['dust_revenant'],
        cohesion: 0.9,
      },
    ],
    environment: {
      // Hazards mutate entity.resources directly (deterministic, clamped);
      // environment-core does not record the returned events. Return [].
      hazards: [{
        id: 'dust-storm',
        triggerOn: 'world.zone.entered',
        condition: (zone) => zone.hazards?.includes('dust-storm') ?? false,
        effect: (_zone, entity, _world, _tick) => {
          if (entity.tags.includes('human')) {
            entity.resources.dust = Math.min(100, (entity.resources.dust ?? 0) + 8);
          }
          return [];
        },
      },
      {
        id: 'spirit-drain',
        triggerOn: 'world.zone.entered',
        condition: (zone) => zone.hazards?.includes('spirit-drain') ?? false,
        effect: (_zone, entity, _world, _tick) => {
          entity.resources.resolve = Math.max(0, (entity.resources.resolve ?? 0) - 3);
          return [];
        },
      }],
    },
    rumors: { propagationDelay: 2 },
    districts,
    presentationRules: [spiritPerception],
    // F-ENG005-encounter-spawn-wiring: the authored encounters + per-zone
    // tables drive zone-entry spawns via the world tick.
    encounterSpawn: { gameId: manifest.id, ...encounterSpawnContent },
    // F-ENG005-quest-loop-min / F-c07d6024: the authored quests give the
    // ride its explicit reason. quest-core validates at construction
    // (fail loud) and drives the loop off the live event stream.
    quests: { gameId: manifest.id, quests: weirdWestQuests },
    // V3-GEN-1/2 (genre-mechanical fix, wave 2): this starter's own bare
    // genre key ('weird-west-minimal' minus its '-minimal' suffix) — NOT
    // manifest.genres (this pack's genres are ['western'], a DIFFERENT
    // vocabulary; see world-stack.ts's file-header contract). 'weird-west'
    // matches a GENRE_BUYABLE_STOCK/GENRE_RECIPES entry, so buy/craft/repair/
    // modify now resolve weird-west-flavored stock/recipes instead of the
    // universal fallback.
    tradeGenre: 'weird-west',
    craftingGenre: 'weird-west',
    economyGenre: 'weird-west',
  });

  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: weirdWestMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      ...combat.modules,
      createInventoryCore([sageBundleEffect]),
      createDialogueCore([bartenderDialogue]),
      createPerceptionFilter({ perceptionStat: 'draw-speed' }),
      createProgressionCore({
        trees: [gunslingerTree],
        // T0-progression-ceiling: kills + dialogue + first-visit + boss bonus
        // (defined next to the tree in content.ts so the arithmetic is testable).
        rewards: progressionRewards,
      }),
      ...worldStack.modules,
      createBossPhaseListener(mesaCrawlerBoss),
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
      createAbilityCore({ abilities: weirdWestAbilities, statMapping: { power: 'grit', precision: 'draw-speed', focus: 'lore' } }),
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
  engine.store.addEntity(bartender);
  engine.store.addEntity(sheriff);
  engine.store.addEntity(revenant);
  engine.store.addEntity(crawler);
  engine.store.addEntity(banditRider);

  // Set player
  engine.store.state.playerId = 'drifter';
  engine.store.state.locationId = 'crossroads';

  // Give sage bundle after bartender warns about mesa
  engine.store.events.on('dialogue.ended', (event) => {
    if (event.payload.dialogueId === 'bartender-intel') {
      const world = engine.store.state;
      if (world.globals['mesa-mission']) {
        const playerEntity = world.entities['drifter'];
        if (playerEntity && !(playerEntity.inventory ?? []).includes('sage-bundle')) {
          const giveEvent = giveItem(playerEntity, 'sage-bundle', engine.tick);
          engine.store.recordEvent(giveEvent);
        }
      }
    }
  });

  // Audio cue on entering spirit hollow
  engine.store.events.on('world.zone.entered', (event) => {
    if (event.payload.zoneId === 'spirit-hollow') {
      engine.store.emitEvent('audio.cue.requested', {
        cueId: 'scene.spirit-hollow-reveal',
        channel: 'stinger',
        priority: 'high',
      });
    }
  });

  // Audio cue on combat defeat
  engine.store.events.on('combat.entity.defeated', () => {
    engine.store.emitEvent('audio.cue.requested', {
      cueId: 'combat.victory',
      channel: 'stinger',
      priority: 'high',
    });
  });

  // --- Defeat Fallout: violence attracts the supernatural ---
  engine.store.events.on('defeat.fallout.triggered', (event) => {
    if (event.payload.actorId === 'drifter') {
      const p = engine.store.state.entities['drifter'];
      if (p) p.resources.dust = Math.min(100, (p.resources.dust ?? 0) + 2);
    }
  });

  return engine;
}
