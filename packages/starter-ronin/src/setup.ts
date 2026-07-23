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
  cautiousProfile,
} from '@ai-rpg-engine/modules';
import { createEquipmentCore } from '@ai-rpg-engine/equipment';
import * as engineModules from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatResourceProfile, IntentProfile } from '@ai-rpg-engine/modules';
import {
  manifest,
  player,
  lordTakeda,
  ladyHimiko,
  magistrateSato,
  shadowAssassin,
  corruptSamurai,
  castleGuard,
  corruptSamuraiBoss,
  zones,
  districts,
  magistrateDialogue,
  incenseKitEffect,
  wayOfTheBladeTree,
  roninAbilities,
  roninStatusDefinitions,
  progressionRewards,
  encounterSpawnContent,
  roninQuests,
  itemCatalog,
} from './content.js';
import { roninMinimalRuleset } from './ruleset.js';

// Ronin-specific presentation rule: assassins perceive ronin as unpredictable
const assassinPerception: PresentationRule = {
  id: 'assassin-threat-framing',
  eventPatterns: ['world.zone.entered'],
  priority: 5,
  condition: (_event, ctx) => ctx.observer.tags.includes('assassin'),
  transform: (event, _ctx) => ({
    ...event,
    payload: {
      ...event.payload,
      _subjectiveDescription: 'a blade without a lord — unpredictable and dangerous',
      _actorDescription: 'a masterless threat',
      _assassinPerception: true,
    },
  }),
};

// Ronin combat resource profile — discipline and patience
const roninCombatProfile: CombatResourceProfile = {
  packId: 'ronin',
  gains: [
    { trigger: 'brace', resourceId: 'ki', amount: 2 },
    { trigger: 'guard-absorb', resourceId: 'ki', amount: 1 },
  ],
  spends: [
    { action: 'reposition', resourceId: 'ki', amount: 4, effects: { repositionBonus: 20 } },
    { action: 'guard', resourceId: 'ki', amount: 3, effects: { resistState: COMBAT_STATES.OFF_BALANCE, resistChance: 80 } },
    { action: 'attack', resourceId: 'ki', amount: 5, effects: { damageBonus: 2 } },
  ],
  drains: [
    { trigger: 'disengage-fail', resourceId: 'honor', amount: 2 },
  ],
  aiModifiers: [
    {
      resourceId: 'ki',
      highThreshold: 30,
      highModifiers: { reposition: 10, attack: 5 },
      lowThreshold: 5,
      lowModifiers: { brace: 15, guard: 10 },
    },
  ],
};

// ─── Intent profiles (F1-cs-a) ──────────────────────────────────────────────
// Every hostile entity in content.ts declares an ai.profileId. The cognition
// config must supply an IntentProfile for each declared id — with an empty
// profileMap no enemy ever resolves an intent, so enemies never act.
// `territorial` and `calculating` are newer built-ins; resolve them from the
// installed modules build when present, otherwise back the same id with the
// closest established behavior so every declared id still resolves.
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
 * - shadow-assassin → calculating (strikes from concealment, only when sure)
 * - corrupt-samurai → cautious (wary boss guarding both the gate and his guilt)
 * - castle-guard → territorial (holds the castle gate against intruders)
 */
export const roninIntentProfiles: IntentProfile[] = [
  cautiousProfile,
  resolveBuiltinProfile('territorial', aggressiveProfile.evaluate),
  resolveBuiltinProfile('calculating', cautiousProfile.evaluate),
];

export function createGame(seed?: number): Engine {
  registerStatusDefinitions(roninStatusDefinitions);

  // Combat stack: discipline for damage, perception for hit/dodge, composure for guard
  const combat = buildCombatStack({
    statMapping: { attack: 'discipline', precision: 'perception', resolve: 'composure' },
    playerId: 'player',
    resourceProfile: roninCombatProfile,
    biasTags: ['assassin', 'samurai'],
    engagement: { backlineTags: ['ranged'], protectorTags: ['bodyguard', 'samurai'] },
    recovery: { safeZoneTags: ['safe', 'tranquil'] },
    cognition: {
      profiles: roninIntentProfiles,
      decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 },
    },
  });

  // Strategic tier in one call (F-ENG005-build-world-stack): the same eight
  // modules this setup used to hand-list, same wiring order, same configs.
  // ONE faction roster feeds both faction-cognition and defeat-fallout.
  const worldStack = buildWorldStack({
    playerId: 'player',
    factions: [
      {
        factionId: 'takeda-clan',
        entityIds: ['lord-takeda', 'lady-himiko', 'corrupt-samurai'],
        cohesion: 0.6,
      },
      {
        factionId: 'shadow-network',
        entityIds: ['shadow-assassin'],
        cohesion: 0.9,
      },
    ],
    environment: {
      // Hazards mutate entity.resources directly (deterministic, clamped);
      // environment-core does not record the returned events. Return [].
      hazards: [
        {
          id: 'poison-residue',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('poison-residue') ?? false,
          effect: (_zone, entity, _world, _tick) => {
            entity.resources.hp = Math.max(0, (entity.resources.hp ?? 0) - 2);
            return [];
          },
        },
        {
          id: 'shadow-watch',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('shadow-watch') ?? false,
          effect: (_zone, entity, _world, _tick) => {
            entity.resources.ki = Math.max(0, (entity.resources.ki ?? 0) - 3);
            return [];
          },
        },
      ],
    },
    rumors: { propagationDelay: 2 },
    districts,
    presentationRules: [assassinPerception],
    // F-ENG005-encounter-spawn-wiring: the authored encounters + per-zone
    // tables drive zone-entry spawns via the world tick.
    encounterSpawn: { gameId: manifest.id, ...encounterSpawnContent },
    // F-ENG005-quest-loop-min: the authored quests give the investigation its
    // explicit reason. quest-core validates at construction (fail loud) and
    // drives offer -> track -> complete -> reward off the live event stream.
    quests: { gameId: manifest.id, quests: roninQuests },
    // V3-GEN-1/2 (genre-mechanical fix, wave 2): this starter's own bare
    // genre key ('ronin-minimal' minus its '-minimal' suffix). 'ronin' has no
    // GENRE_BUYABLE_STOCK/GENRE_RECIPES entry (today's fixed key set is
    // fantasy/cyberpunk/pirate/zombie/detective/colony/weird-west), so buy/
    // craft/repair/modify correctly keep resolving the universal/default
    // tables — an honest fallback, not a bug to force with an invented remap
    // (this pack is NOT rewired to 'fantasy' or any other table key).
    tradeGenre: 'ronin',
    craftingGenre: 'ronin',
    economyGenre: 'ronin',
  });

  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: roninMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      ...combat.modules,
      createInventoryCore([incenseKitEffect]),
      createDialogueCore([magistrateDialogue]),
      createPerceptionFilter({ perceptionStat: 'perception' }),
      createProgressionCore({
        trees: [wayOfTheBladeTree],
        // T0-progression-ceiling: kills + dialogue + first-visit + boss bonus
        // (defined next to the tree in content.ts so the arithmetic is testable).
        rewards: progressionRewards,
      }),
      ...worldStack.modules,
      createBossPhaseListener(corruptSamuraiBoss),
      // F-86b9145d: the equipment loop — `equip`/`unequip` verbs over the
      // pack's item catalog (same wiring gladiator's setup.ts pioneered under
      // F-ENG008). The module (homed in @ai-rpg-engine/equipment) publishes
      // the catalog under EQUIPMENT_CATALOG_FORMULA and mirrors equipped
      // items' statModifiers into `equipped-<itemId>` statuses; this pack
      // injects the status machinery of its own engine build.
      createEquipmentCore({
        catalog: itemCatalog,
        statuses: {
          registerDefinitions: registerStatusDefinitions,
          apply: applyStatus,
          remove: removeStatus,
        },
      }),
      createAbilityCore({ abilities: roninAbilities, statMapping: { power: 'discipline', precision: 'perception', focus: 'composure' } }),
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
  engine.store.addEntity(lordTakeda);
  engine.store.addEntity(ladyHimiko);
  engine.store.addEntity(magistrateSato);
  engine.store.addEntity(shadowAssassin);
  engine.store.addEntity(corruptSamurai);
  engine.store.addEntity(castleGuard);

  // Set player
  engine.store.state.playerId = 'player';
  engine.store.state.locationId = 'castle-gate';

  // F-92c78519: seed a small starting coin balance. trade-core's buy verb
  // (always registered via buildWorldStack) reads actor.resources.coin, and
  // an unseeded resource silently reads as 0 (buyHandler's own `?? 0` guard)
  // — without this a fresh run could never afford a single purchase.
  engine.store.state.entities[engine.store.state.playerId].resources.coin = 30;

  // Listen for magistrate gift — give incense kit after dialogue
  engine.store.events.on('dialogue.ended', (event) => {
    if (event.payload.dialogueId === 'magistrate-briefing') {
      const world = engine.store.state;
      if (world.globals['magistrate-briefed']) {
        const playerEntity = world.entities['player'];
        if (playerEntity && !(playerEntity.inventory ?? []).includes('incense-kit')) {
          const giveEvent = giveItem(playerEntity, 'incense-kit', engine.tick);
          engine.store.recordEvent(giveEvent);
        }
      }
    }
  });

  // Audio cue on entering hidden passage
  engine.store.events.on('world.zone.entered', (event) => {
    if (event.payload.zoneId === 'hidden-passage') {
      engine.store.emitEvent('audio.cue.requested', {
        cueId: 'scene.hidden-passage-reveal',
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

  // Combat resource gains/drains/spends handled by roninCombatProfile

  // --- Defeat Fallout: bonus honor on boss kill ---
  engine.store.events.on('defeat.fallout.triggered', (event) => {
    if (event.payload.isBoss && event.payload.actorId === 'player') {
      const p = engine.store.state.entities['player'];
      if (p) p.resources.honor = Math.min(100, (p.resources.honor ?? 0) + 5);
    }
  });

  return engine;
}
