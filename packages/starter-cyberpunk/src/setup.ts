// Game setup — wire cyberpunk content into engine

import { Engine } from '@signalfire/core';
import {
  traversalCore,
  statusCore,
  combatCore,
  createInventoryCore,
  createDialogueCore,
  createCognitionCore,
  createPerceptionFilter,
  createProgressionCore,
  createEnvironmentCore,
  createFactionCognition,
  createRumorPropagation,
  createSimulationInspector,
  giveItem,
} from '@signalfire/modules';
import {
  manifest,
  player,
  fixer,
  iceAgent,
  zones,
  fixerDialogue,
  iceBreaker,
  netrunningTree,
} from './content.js';
import { cyberpunkMinimalRuleset } from './ruleset.js';

export function createGame(seed?: number): Engine {
  const engine = new Engine({
    manifest,
    seed: seed ?? 77,
    ruleset: cyberpunkMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      combatCore,
      createInventoryCore([iceBreaker]),
      createDialogueCore([fixerDialogue]),
      createCognitionCore({ decay: { baseRate: 0.03, pruneThreshold: 0.05, instabilityFactor: 0.8 } }),
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
        hazards: [{
          id: 'exposed-wiring',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('exposed wiring') ?? false,
          effect: (zone, entity, _world, tick) => {
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
  engine.store.addEntity({ ...iceAgent });

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

  return engine;
}
