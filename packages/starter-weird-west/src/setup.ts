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
  bartender,
  sheriff,
  revenant,
  crawler,
  zones,
  districts,
  bartenderDialogue,
  sageBundleEffect,
  gunslingerTree,
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

export function createGame(seed?: number): Engine {
  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: weirdWestMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      combatCore,
      createInventoryCore([sageBundleEffect]),
      createDialogueCore([bartenderDialogue]),
      createCognitionCore({ decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 } }),
      createPerceptionFilter(),
      createProgressionCore({
        trees: [gunslingerTree],
        rewards: [{
          eventPattern: 'combat.entity.defeated',
          currencyId: 'xp',
          amount: 12,
          recipient: 'actor',
        }],
      }),
      createEnvironmentCore({
        hazards: [{
          id: 'dust-storm',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('dust-storm') ?? false,
          effect: (zone, entity, _world, tick) => {
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
          effect: (zone, entity, _world, tick) => {
            entity.resources.resolve = Math.max(0, (entity.resources.resolve ?? 0) - 3);
            return [];
          },
        }],
      }),
      createFactionCognition({
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
      }),
      createRumorPropagation({ propagationDelay: 2 }),
      createDistrictCore({ districts }),
      createBeliefProvenance(),
      createObserverPresentation({
        rules: [spiritPerception],
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
  engine.store.addEntity({ ...bartender });
  engine.store.addEntity({ ...sheriff });
  engine.store.addEntity({ ...revenant });
  engine.store.addEntity({ ...crawler });

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

  return engine;
}
