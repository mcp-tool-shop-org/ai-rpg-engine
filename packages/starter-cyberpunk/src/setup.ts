// Game setup — wire cyberpunk content into engine

import { Engine } from '@ai-rpg-engine/core';
import {
  traversalCore,
  statusCore,
  buildCombatStack,
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
} from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatResourceProfile } from '@ai-rpg-engine/modules';
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

export function createGame(seed?: number): Engine {
  registerStatusDefinitions(cyberpunkStatusDefinitions);

  // Combat stack: chrome for damage, reflex for hit/dodge, netrunning for guard
  const combat = buildCombatStack({
    statMapping: { attack: 'chrome', precision: 'reflex', resolve: 'netrunning' },
    playerId: 'runner',
    resourceProfile: cyberpunkCombatProfile,
    biasTags: ['ice-agent'],
    engagement: { backlineTags: ['ranged', 'caster', 'netrunner'], protectorTags: ['bodyguard'] },
    cognition: { decay: { baseRate: 0.03, pruneThreshold: 0.05, instabilityFactor: 0.8 } },
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
        rewards: [{
          eventPattern: 'combat.entity.defeated',
          currencyId: 'xp',
          amount: 20,
          recipient: 'actor',
        }],
      }),
      createEnvironmentCore({
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
      }),
      createFactionCognition({
        factions: [{
          factionId: 'vault-ice',
          entityIds: ['ice-sentry'],
          cohesion: 0.95,
        }],
      }),
      createRumorPropagation({ propagationDelay: 1, distortionPerHop: 0.03 }),
      createDistrictCore({ districts }),
      createBeliefProvenance(),
      createObserverPresentation({
        rules: [iceSecurityFraming],
      }),
      createDefeatFallout({
        factions: [{ factionId: 'vault-ice', entityIds: ['ice-sentry'] }],
        playerId: 'runner',
      }),
      createBossPhaseListener(vaultOverseerBoss),
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
  engine.store.addEntity({ ...player });
  engine.store.addEntity({ ...fixer });
  engine.store.addEntity({ ...rez });
  engine.store.addEntity({ ...iceAgent });
  engine.store.addEntity({ ...streetRunner });
  engine.store.addEntity({ ...vaultOverseer });

  // Set player
  engine.store.state.playerId = 'runner';
  engine.store.state.locationId = 'street-level';

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
