// Game setup — wire content into engine

import { Engine } from '@ai-rpg-engine/core';
import {
  traversalCore,
  statusCore,
  createInventoryCore,
  createDialogueCore,
  createPerceptionFilter,
  createProgressionCore,
  createEnvironmentCore,
  createFactionCognition,
  createRumorPropagation,
  createSimulationInspector,
  createDistrictCore,
  createBeliefProvenance,
  createObserverPresentation,
  giveItem,
  createDefeatFallout,
  createBossPhaseListener,
  createAbilityCore,
  createAbilityEffects,
  createAbilityReview,
  registerStatusDefinitions,
  applyStatus,
  removeStatus,
  buildCombatStack,
  aggressiveProfile,
} from '@ai-rpg-engine/modules';
import { createEquipmentCore } from '@ai-rpg-engine/equipment';
import * as engineModules from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatResourceProfile, IntentProfile } from '@ai-rpg-engine/modules';
import {
  manifest,
  player,
  lanistaBrutus,
  dominaValeria,
  nerva,
  arenaChampion,
  warBeast,
  arenaOverlord,
  arenaOverlordBoss,
  zones,
  districts,
  patronDialogue,
  patronTokenEffect,
  arenaGloryTree,
  gladiatorAbilities,
  gladiatorStatusDefinitions,
  progressionRewards,
  itemCatalog,
} from './content.js';
import { gladiatorMinimalRuleset } from './ruleset.js';

// Gladiator-specific presentation rule: patrons see gladiators as investments
const patronPerception: PresentationRule = {
  id: 'patron-investment-framing',
  eventPatterns: ['world.zone.entered'],
  priority: 5,
  condition: (_event, ctx) => ctx.observer.tags.includes('patron'),
  transform: (event, _ctx) => ({
    ...event,
    payload: {
      ...event.payload,
      _subjectiveDescription: 'another asset enters the arena, value yet to be determined',
      _actorDescription: 'an investment in blood and spectacle',
      _patronPerception: true,
    },
  }),
};

// Gladiator combat resource profile — spectacle-driven economy
const gladiatorCombatProfile: CombatResourceProfile = {
  packId: 'gladiator',
  gains: [
    { trigger: 'attack-hit', resourceId: 'crowd-favor', amount: 3 },
    { trigger: 'defeat-enemy', resourceId: 'crowd-favor', amount: 8 },
    { trigger: 'reposition-outflank', resourceId: 'crowd-favor', amount: 2 },
  ],
  spends: [
    { action: 'attack', resourceId: 'crowd-favor', amount: 10, effects: { damageBonus: 3 } },
    { action: 'guard', resourceId: 'crowd-favor', amount: 15, effects: { guardBonus: 0.15 } },
  ],
  drains: [
    { trigger: 'take-damage', resourceId: 'fatigue', amount: 3 },
    { trigger: 'reposition-fail', resourceId: 'fatigue', amount: 5 },
  ],
  aiModifiers: [
    {
      resourceId: 'crowd-favor',
      highThreshold: 60,
      highModifiers: { attack: 10, reposition: 10 },
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
 * - arena-champion / war-beast → aggressive (title defender, feral beast)
 * - arena-overlord → territorial (the arena is his ground and he keeps it)
 */
export const gladiatorIntentProfiles: IntentProfile[] = [
  aggressiveProfile,
  resolveBuiltinProfile('territorial', aggressiveProfile.evaluate),
];

export function createGame(seed?: number): Engine {
  registerStatusDefinitions(gladiatorStatusDefinitions);

  // Combat stack: might for damage, agility for hit/dodge, showmanship for guard
  const combat = buildCombatStack({
    statMapping: { attack: 'might', precision: 'agility', resolve: 'showmanship' },
    playerId: 'player',
    resourceProfile: gladiatorCombatProfile,
    biasTags: ['feral', 'beast'],
    cognition: {
      profiles: gladiatorIntentProfiles,
      decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 },
    },
  });

  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: gladiatorMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      ...combat.modules,
      createInventoryCore([patronTokenEffect]),
      createDialogueCore([patronDialogue]),
      createPerceptionFilter({ perceptionStat: 'agility' }),
      createProgressionCore({
        trees: [arenaGloryTree],
        // T0-progression-ceiling: kills + dialogue + first-visit + boss bonus
        // (defined next to the tree in content.ts so the arithmetic is testable).
        rewards: progressionRewards,
      }),
      createEnvironmentCore({
        // Hazards mutate entity.resources directly (deterministic, clamped);
        // environment-core does not record the returned events. Return [].
        hazards: [
          {
            id: 'scorching-sand',
            triggerOn: 'world.zone.entered',
            condition: (zone) => zone.hazards?.includes('scorching-sand') ?? false,
            effect: (_zone, entity, _world, _tick) => {
              entity.resources.fatigue = Math.min(50, (entity.resources.fatigue ?? 0) + 3);
              return [];
            },
          },
          {
            id: 'trap-pit',
            triggerOn: 'world.zone.entered',
            condition: (zone) => zone.hazards?.includes('trap-pit') ?? false,
            effect: (_zone, entity, _world, _tick) => {
              entity.resources.hp = Math.max(0, (entity.resources.hp ?? 0) - 4);
              return [];
            },
          },
        ],
      }),
      createFactionCognition({
        factions: [
          {
            factionId: 'arena-stable',
            entityIds: ['lanista-brutus', 'nerva', 'arena-champion', 'arena-overlord'],
            cohesion: 0.5,
          },
          {
            factionId: 'patron-circle',
            entityIds: ['domina-valeria'],
            cohesion: 0.4,
          },
        ],
      }),
      createRumorPropagation({ propagationDelay: 2 }),
      createDistrictCore({ districts }),
      createBeliefProvenance(),
      createObserverPresentation({
        rules: [patronPerception],
      }),
      createDefeatFallout({
        factions: [
          { factionId: 'arena-stable', entityIds: ['lanista-brutus', 'nerva', 'arena-champion', 'arena-overlord'] },
          { factionId: 'patron-circle', entityIds: ['domina-valeria'] },
        ],
        playerId: 'player',
      }),
      createBossPhaseListener(arenaOverlordBoss),
      // ── W7 MERGE SEAM (t1-encounters × t1-equip) ─────────────────────────
      // Zone-entry encounter spawning. The encounter-spawn module shipped in
      // the sibling t1-encounters branch; THIS branch forked before
      // packages/modules/src/encounter-spawn.ts existed, so the registration
      // cannot compile here. The content is live (content.ts
      // encounterSpawnContent — validity pinned by content.test.ts). At merge,
      // (1) add `createEncounterSpawn` to the '@ai-rpg-engine/modules' import
      // list, (2) add `encounterSpawnContent` to the './content.js' import
      // list, and (3) uncomment:
      // createEncounterSpawn({ gameId: manifest.id, ...encounterSpawnContent }),
      // ─────────────────────────────────────────────────────────────────────
      // F-ENG008: the equipment loop — `equip`/`unequip` verbs over the pack's
      // item catalog. The module (homed in @ai-rpg-engine/equipment) publishes
      // the catalog under EQUIPMENT_CATALOG_FORMULA and mirrors equipped items'
      // statModifiers into `equipped-<itemId>` statuses; this pack injects the
      // status machinery of its engine build (the modules package's ops).
      createEquipmentCore({
        catalog: itemCatalog,
        statuses: {
          registerDefinitions: registerStatusDefinitions,
          apply: applyStatus,
          remove: removeStatus,
        },
      }),
      createAbilityCore({ abilities: gladiatorAbilities, statMapping: { power: 'might', precision: 'agility', focus: 'showmanship' } }),
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
  engine.store.addEntity(lanistaBrutus);
  engine.store.addEntity(dominaValeria);
  engine.store.addEntity(nerva);
  engine.store.addEntity(arenaChampion);
  engine.store.addEntity(warBeast);
  engine.store.addEntity(arenaOverlord);

  // Set player
  engine.store.state.playerId = 'player';
  engine.store.state.locationId = 'holding-cells';

  // Listen for patron gift — give patron token after dialogue
  engine.store.events.on('dialogue.ended', (event) => {
    if (event.payload.dialogueId === 'patron-audience') {
      const world = engine.store.state;
      if (world.globals['patron-accepted']) {
        const playerEntity = world.entities['player'];
        if (playerEntity && !(playerEntity.inventory ?? []).includes('patron-token')) {
          const giveEvent = giveItem(playerEntity, 'patron-token', engine.tick);
          engine.store.recordEvent(giveEvent);
        }
      }
    }
  });

  // Audio cue on entering arena floor
  engine.store.events.on('world.zone.entered', (event) => {
    if (event.payload.zoneId === 'arena-floor') {
      engine.store.emitEvent('audio.cue.requested', {
        cueId: 'scene.arena-roar',
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

  // Combat resource gains/drains/spends handled by gladiatorCombatProfile

  return engine;
}
