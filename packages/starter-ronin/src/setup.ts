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
  lordTakeda,
  ladyHimiko,
  magistrateSato,
  shadowAssassin,
  corruptSamurai,
  zones,
  districts,
  magistrateDialogue,
  incenseKitEffect,
  wayOfTheBladeTree,
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

export function createGame(seed?: number): Engine {
  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: roninMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      combatCore,
      createInventoryCore([incenseKitEffect]),
      createDialogueCore([magistrateDialogue]),
      createCognitionCore({ decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 } }),
      createPerceptionFilter(),
      createProgressionCore({
        trees: [wayOfTheBladeTree],
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
      }),
      createFactionCognition({
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
      }),
      createRumorPropagation({ propagationDelay: 2 }),
      createDistrictCore({ districts }),
      createBeliefProvenance(),
      createObserverPresentation({
        rules: [assassinPerception],
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
  engine.store.addEntity({ ...lordTakeda });
  engine.store.addEntity({ ...ladyHimiko });
  engine.store.addEntity({ ...magistrateSato });
  engine.store.addEntity({ ...shadowAssassin });
  engine.store.addEntity({ ...corruptSamurai });

  // Set player
  engine.store.state.playerId = 'player';
  engine.store.state.locationId = 'castle-gate';

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

  return engine;
}
