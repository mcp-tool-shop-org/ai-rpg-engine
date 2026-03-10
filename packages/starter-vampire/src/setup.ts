// Game setup — wire content into engine

import { Engine } from '@ai-rpg-engine/core';
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
  createDistrictCore,
  createBeliefProvenance,
  createObserverPresentation,
  giveItem,
} from '@ai-rpg-engine/modules';
import type { PresentationRule } from '@ai-rpg-engine/modules';
import {
  manifest,
  player,
  duchessMorvaine,
  cassius,
  servantElara,
  witchHunter,
  feralThrall,
  zones,
  districts,
  duchessDialogue,
  bloodVialEffect,
  bloodMasteryTree,
} from './content.js';
import { vampireMinimalRuleset } from './ruleset.js';

// Vampire-specific presentation rule: vampires perceive humans as vessels
const vampireHungerPerception: PresentationRule = {
  id: 'vampire-hunger-framing',
  eventPatterns: ['world.zone.entered'],
  priority: 5,
  condition: (_event, ctx) => ctx.observer.tags.includes('vampire'),
  transform: (event, _ctx) => ({
    ...event,
    payload: {
      ...event.payload,
      _subjectiveDescription: 'warm blood pulses nearby, tempting and fragile',
      _actorDescription: 'a vessel of warmth',
      _vampirePerception: true,
    },
  }),
};

export function createGame(seed?: number): Engine {
  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: vampireMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      combatCore,
      createInventoryCore([bloodVialEffect]),
      createDialogueCore([duchessDialogue]),
      createCognitionCore({ decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 } }),
      createPerceptionFilter(),
      createProgressionCore({
        trees: [bloodMasteryTree],
        rewards: [{
          eventPattern: 'combat.entity.defeated',
          currencyId: 'xp',
          amount: 15,
          recipient: 'actor',
        }],
      }),
      createEnvironmentCore({
        hazards: [
          {
            id: 'blood-scent',
            triggerOn: 'world.zone.entered',
            condition: (zone) => zone.hazards?.includes('blood-scent') ?? false,
            effect: (_zone, entity, _world, _tick) => {
              entity.resources.bloodlust = Math.min(100, (entity.resources.bloodlust ?? 0) + 5);
              return [];
            },
          },
          {
            id: 'consecrated-ground',
            triggerOn: 'world.zone.entered',
            condition: (zone) => zone.hazards?.includes('consecrated-ground') ?? false,
            effect: (_zone, entity, _world, _tick) => {
              if (entity.tags.includes('vampire')) {
                entity.resources.hp = Math.max(0, (entity.resources.hp ?? 0) - 3);
              }
              return [];
            },
          },
        ],
      }),
      createFactionCognition({
        factions: [
          {
            factionId: 'house-morvaine',
            entityIds: ['duchess-morvaine', 'cassius', 'feral-thrall'],
            cohesion: 0.6,
          },
          {
            factionId: 'witch-hunters',
            entityIds: ['witch-hunter'],
            cohesion: 0.8,
          },
        ],
      }),
      createRumorPropagation({ propagationDelay: 2 }),
      createDistrictCore({ districts }),
      createBeliefProvenance(),
      createObserverPresentation({
        rules: [vampireHungerPerception],
      }),
      createSimulationInspector(),
    ],
  });

  // Add zones
  for (const zone of zones) {
    engine.store.addZone(zone);
  }

  // Add entities
  engine.store.addEntity({ ...player });
  engine.store.addEntity({ ...duchessMorvaine });
  engine.store.addEntity({ ...cassius });
  engine.store.addEntity({ ...servantElara });
  engine.store.addEntity({ ...witchHunter });
  engine.store.addEntity({ ...feralThrall });

  // Set player
  engine.store.state.playerId = 'player';
  engine.store.state.locationId = 'grand-ballroom';

  // Listen for duchess gift — give blood vial after dialogue
  engine.store.events.on('dialogue.ended', (event) => {
    if (event.payload.dialogueId === 'duchess-audience') {
      const world = engine.store.state;
      if (world.globals['duchess-guidance']) {
        const playerEntity = world.entities['player'];
        if (playerEntity && !(playerEntity.inventory ?? []).includes('blood-vial')) {
          const giveEvent = giveItem(playerEntity, 'blood-vial', engine.tick);
          engine.store.recordEvent(giveEvent);
        }
      }
    }
  });

  // Audio cue on entering wine cellar
  engine.store.events.on('world.zone.entered', (event) => {
    if (event.payload.zoneId === 'wine-cellar') {
      engine.store.emitEvent('audio.cue.requested', {
        cueId: 'scene.cellar-descent',
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

  return engine;
}
