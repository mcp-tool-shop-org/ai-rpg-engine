// Game setup — wire cyberpunk content into engine

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
  aggressiveProfile,
  cautiousProfile,
} from '@ai-rpg-engine/modules';
import { createEquipmentCore } from '@ai-rpg-engine/equipment';
import * as engineModules from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatResourceProfile, IntentProfile } from '@ai-rpg-engine/modules';
import {
  manifest,
  player,
  fixer,
  rez,
  iceAgent,
  streetRunner,
  vaultOverseer,
  vaultOverseerBoss,
  zones,
  districts,
  fixerDialogue,
  iceBreaker,
  netrunningTree,
  cyberpunkAbilities,
  cyberpunkStatusDefinitions,
  progressionRewards,
  encounterSpawnContent,
  cyberpunkQuests,
  itemCatalog,
} from './content.js';
import { cyberpunkMinimalRuleset } from './ruleset.js';

// Cyberpunk presentation rule: ICE agents flag all non-ICE as intrusion
const iceSecurityFraming: PresentationRule = {
  id: 'ice-security-framing',
  eventPatterns: ['world.zone.entered'],
  priority: 5,
  condition: (_event, ctx) => ctx.observer.tags.includes('ice-agent'),
  transform: (event, _ctx) => ({
    ...event,
    payload: {
      ...event.payload,
      _subjectiveDescription: 'unauthorized network entity detected in secure zone',
      _actorDescription: 'intrusion signature',
      _securityFraming: true,
    },
  }),
};

// Cyberpunk combat resource profile — network-driven tactical augmentation
const cyberpunkCombatProfile: CombatResourceProfile = {
  packId: 'cyberpunk',
  gains: [
    { trigger: 'brace', resourceId: 'bandwidth', amount: 2 },
  ],
  spends: [
    { action: 'reposition', resourceId: 'bandwidth', amount: 4, effects: { repositionBonus: 15 } },
    { action: 'attack', resourceId: 'bandwidth', amount: 3, effects: { hitBonus: 10 } },
  ],
  drains: [
    { trigger: 'take-damage', resourceId: 'bandwidth', amount: 2 },
  ],
  aiModifiers: [
    {
      resourceId: 'bandwidth',
      highThreshold: 50,
      highModifiers: { pressure: 10, reposition: 10 },
      lowThreshold: 10,
      lowModifiers: { guard: 10, brace: 10 },
    },
  ],
};

// ─── Intent profiles (F1-cs-a) ──────────────────────────────────────────────
// Every hostile entity in content.ts declares an ai.profileId. The cognition
// config must supply an IntentProfile for each declared id — with an empty
// profileMap no enemy ever resolves an intent, so enemies never act.
// `calculating` is a newer built-in; resolve it from the installed modules
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
 * - ice-sentry / street-runner → aggressive (attack-on-sight vault defense
 *   and turf-first gang muscle)
 * - vault-overseer → calculating (AI construct that optimizes its strike)
 */
export const cyberpunkIntentProfiles: IntentProfile[] = [
  aggressiveProfile,
  resolveBuiltinProfile('calculating', cautiousProfile.evaluate),
];

export function createGame(seed?: number): Engine {
  registerStatusDefinitions(cyberpunkStatusDefinitions);

  // Combat stack: chrome for damage, reflex for hit/dodge, netrunning for guard
  const combat = buildCombatStack({
    statMapping: { attack: 'chrome', precision: 'reflex', resolve: 'netrunning' },
    playerId: 'runner',
    resourceProfile: cyberpunkCombatProfile,
    biasTags: ['ice-agent'],
    engagement: { backlineTags: ['ranged', 'caster', 'netrunner'], protectorTags: ['bodyguard'] },
    cognition: {
      profiles: cyberpunkIntentProfiles,
      decay: { baseRate: 0.03, pruneThreshold: 0.05, instabilityFactor: 0.8 },
    },
  });

  // Strategic tier in one call (F-ENG005-build-world-stack): the same eight
  // modules this setup used to hand-list, same wiring order, same configs.
  // ONE faction roster feeds both faction-cognition and defeat-fallout.
  const worldStack = buildWorldStack({
    playerId: 'runner',
    factions: [{
      factionId: 'vault-ice',
      entityIds: ['ice-sentry'],
      cohesion: 0.95,
    }],
    environment: {
      // Hazards mutate entity.resources directly (deterministic, clamped);
      // environment-core does not record the returned events. Return [].
      hazards: [{
        id: 'exposed-wiring',
        triggerOn: 'world.zone.entered',
        condition: (zone) => zone.hazards?.includes('exposed wiring') ?? false,
        effect: (_zone, entity, _world, _tick) => {
          entity.resources.hp = Math.max(0, (entity.resources.hp ?? 0) - 2);
          return [];
        },
      }],
    },
    rumors: { propagationDelay: 1, distortionPerHop: 0.03 },
    districts,
    presentationRules: [iceSecurityFraming],
    // F-ENG005-encounter-spawn-wiring: the authored encounters + per-zone
    // tables drive zone-entry spawns via the world tick.
    encounterSpawn: { gameId: manifest.id, ...encounterSpawnContent },
    // F-ENG005-quest-loop-min: the authored quests give the run its explicit
    // reason. quest-core validates at construction (fail loud) and drives
    // offer -> track -> complete -> reward off the live event stream.
    quests: { gameId: manifest.id, quests: cyberpunkQuests },
  });

  const engine = new Engine({
    manifest,
    seed: seed ?? 77,
    ruleset: cyberpunkMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      ...combat.modules,
      createInventoryCore([iceBreaker]),
      createDialogueCore([fixerDialogue]),
      createPerceptionFilter({
        perceptionStat: 'reflex',
        senseStats: { network: 'netrunning' },
      }),
      createProgressionCore({
        trees: [netrunningTree],
        // T0-progression-ceiling: kills + dialogue + first-visit + boss bonus
        // (defined next to the tree in content.ts so the arithmetic is testable).
        rewards: progressionRewards,
      }),
      ...worldStack.modules,
      createBossPhaseListener(vaultOverseerBoss),
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
      createAbilityCore({ abilities: cyberpunkAbilities, statMapping: { power: 'chrome', precision: 'reflex', focus: 'netrunning' } }),
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
  engine.store.addEntity(fixer);
  engine.store.addEntity(rez);
  engine.store.addEntity(iceAgent);
  engine.store.addEntity(streetRunner);
  engine.store.addEntity(vaultOverseer);

  // Set player
  engine.store.state.playerId = 'runner';
  engine.store.state.locationId = 'street-level';

  // F-92c78519: seed a small starting coin balance. trade-core's buy verb
  // (always registered via buildWorldStack) reads actor.resources.coin, and
  // an unseeded resource silently reads as 0 (buyHandler's own `?? 0` guard)
  // — without this a fresh run could never afford a single purchase.
  engine.store.state.entities[engine.store.state.playerId].resources.coin = 25;

  // Give ice-breaker after fixer briefing
  engine.store.events.on('dialogue.ended', (event) => {
    if (event.payload.dialogueId === 'fixer-briefing') {
      const world = engine.store.state;
      if (world.globals['briefed']) {
        const playerEntity = world.entities['runner'];
        if (playerEntity && !(playerEntity.inventory ?? []).includes('ice-breaker')) {
          const giveEvent = giveItem(playerEntity, 'ice-breaker', engine.tick);
          engine.store.recordEvent(giveEvent);
        }
      }
    }
  });

  // Audio cue on entering data vault
  engine.store.events.on('world.zone.entered', (event) => {
    if (event.payload.zoneId === 'data-vault') {
      engine.store.emitEvent('audio.cue.requested', {
        cueId: 'scene.vault-reveal',
        channel: 'stinger',
        priority: 'high',
      });
    }
  });

  // Combat resource gains/drains/spends handled by cyberpunkCombatProfile

  return engine;
}
