// Game setup — wire content into engine

import { Engine } from '@signalfire/core';
import {
  traversalCore,
  statusCore,
  combatCore,
  createInventoryCore,
  createDialogueCore,
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
} from './content.js';

export function createGame(seed?: number): Engine {
  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    modules: [
      traversalCore,
      statusCore,
      combatCore,
      createInventoryCore([healingDraughtEffect]),
      createDialogueCore([pilgrimDialogue]),
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
