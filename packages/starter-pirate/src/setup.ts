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
  quartermaster,
  cartographer,
  governor,
  navySailor,
  seaBeast,
  zones,
  districts,
  cartographerDialogue,
  rumBarrelEffect,
  seamanshipTree,
} from './content.js';
import { pirateMinimalRuleset } from './ruleset.js';

// Pirate-specific: cursed creatures perceive all visitors as trespassers
const cursedGuardianPerception: PresentationRule = {
  id: 'cursed-guardian-hostility',
  eventPatterns: ['world.zone.entered'],
  priority: 5,
  condition: (_event, ctx) => ctx.observer.tags.includes('cursed'),
  transform: (event, _ctx) => ({
    ...event,
    payload: {
      ...event.payload,
      _subjectiveDescription: 'a thief dares desecrate the drowned shrine',
      _actorDescription: 'a trespasser from the surface',
      _cursedPerception: true,
    },
  }),
};

export function createGame(seed?: number): Engine {
  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: pirateMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      combatCore,
      createInventoryCore([rumBarrelEffect]),
      createDialogueCore([cartographerDialogue]),
      createCognitionCore({ decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 } }),
      createPerceptionFilter(),
      createProgressionCore({
        trees: [seamanshipTree],
        rewards: [{
          eventPattern: 'combat.entity.defeated',
          currencyId: 'xp',
          amount: 12,
          recipient: 'actor',
        }],
      }),
      createEnvironmentCore({
        hazards: [{
          id: 'storm-surge',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('storm-surge') ?? false,
          effect: (zone, entity, _world, tick) => {
            entity.resources.morale = Math.max(0, (entity.resources.morale ?? 0) - 2);
            return [];
          },
        },
        {
          id: 'drowning-pressure',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('drowning-pressure') ?? false,
          effect: (zone, entity, _world, tick) => {
            entity.resources.hp = Math.max(0, (entity.resources.hp ?? 0) - 1);
            return [];
          },
        }],
      }),
      createFactionCognition({
        factions: [{
          factionId: 'colonial-navy',
          entityIds: ['navy_sailor', 'governor_vane'],
          cohesion: 0.8,
        }],
      }),
      createRumorPropagation({ propagationDelay: 3 }),
      createDistrictCore({ districts }),
      createBeliefProvenance(),
      createObserverPresentation({
        rules: [cursedGuardianPerception],
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
  engine.store.addEntity({ ...quartermaster });
  engine.store.addEntity({ ...cartographer });
  engine.store.addEntity({ ...governor });
  engine.store.addEntity({ ...navySailor });
  engine.store.addEntity({ ...seaBeast });

  // Set player
  engine.store.state.playerId = 'captain';
  engine.store.state.locationId = 'ship-deck';

  // Give rum barrel after cartographer deal
  engine.store.events.on('dialogue.ended', (event) => {
    if (event.payload.dialogueId === 'cartographer-maps') {
      const world = engine.store.state;
      if (world.globals['shrine-deal']) {
        const playerEntity = world.entities['captain'];
        if (playerEntity && !(playerEntity.inventory ?? []).includes('rum-barrel')) {
          const giveEvent = giveItem(playerEntity, 'rum-barrel', engine.tick);
          engine.store.recordEvent(giveEvent);
        }
      }
    }
  });

  // Audio cue on entering sunken shrine
  engine.store.events.on('world.zone.entered', (event) => {
    if (event.payload.zoneId === 'sunken-shrine') {
      engine.store.emitEvent('audio.cue.requested', {
        cueId: 'scene.sunken-shrine-reveal',
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
