// Game setup — wire content into engine

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
  pilgrim,
  ashGhoul,
  zones,
  pilgrimDialogue,
  healingDraughtEffect,
  combatMasteryTree,
} from './content.js';
import { fantasyMinimalRuleset } from './ruleset.js';

export function createGame(seed?: number): Engine {
  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: fantasyMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      combatCore,
      createInventoryCore([healingDraughtEffect]),
      createDialogueCore([pilgrimDialogue]),
      createCognitionCore({ decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 } }),
      createPerceptionFilter(),
      createProgressionCore({
        trees: [combatMasteryTree],
        rewards: [{
          eventPattern: 'combat.entity.defeated',
          currencyId: 'xp',
          amount: 15,
          recipient: 'actor',
        }],
      }),
      createEnvironmentCore({
        hazards: [{
          id: 'unstable-floor',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('unstable floor') ?? false,
          effect: (zone, entity, _world, tick) => {
            entity.resources.stamina = Math.max(0, (entity.resources.stamina ?? 0) - 1);
            return [];
          },
        }],
      }),
      createFactionCognition({
        factions: [{
          factionId: 'chapel-undead',
          entityIds: ['ash-ghoul'],
          cohesion: 0.7,
        }],
      }),
      createRumorPropagation({ propagationDelay: 2 }),
      createSimulationInspector(),
    ],
  });

  // Add zones
  for (const zone of zones) {
    engine.store.addZone(zone);
  }

  // Add entities
  engine.store.addEntity({ ...player });
  engine.store.addEntity({ ...pilgrim });
  engine.store.addEntity({ ...ashGhoul });

  // Set player
  engine.store.state.playerId = 'player';
  engine.store.state.locationId = 'chapel-entrance';

  // Listen for pilgrim gift — give healing draught after dialogue
  engine.store.events.on('dialogue.ended', (event) => {
    if (event.payload.dialogueId === 'pilgrim-talk') {
      const world = engine.store.state;
      if (world.globals['pilgrim-warned']) {
        const playerEntity = world.entities['player'];
        if (playerEntity && !(playerEntity.inventory ?? []).includes('healing-draught')) {
          const giveEvent = giveItem(playerEntity, 'healing-draught', engine.tick);
          engine.store.recordEvent(giveEvent);
        }
      }
    }
  });

  // Audio cue on entering crypt
  engine.store.events.on('world.zone.entered', (event) => {
    if (event.payload.zoneId === 'crypt-chamber') {
      engine.store.emitEvent('audio.cue.requested', {
        cueId: 'scene.crypt-reveal',
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
