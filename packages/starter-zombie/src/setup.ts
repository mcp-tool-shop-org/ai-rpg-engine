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
  medic,
  scavenger,
  leader,
  shambler,
  runner,
  zones,
  districts,
  medicDialogue,
  antibioticsEffect,
  survivalTree,
} from './content.js';
import { zombieMinimalRuleset } from './ruleset.js';

// Zombie-specific: undead hunt by noise — perceive all living as prey
const undeadHunger: PresentationRule = {
  id: 'undead-hunger',
  eventPatterns: ['world.zone.entered'],
  priority: 5,
  condition: (_event, ctx) => ctx.observer.tags.includes('zombie'),
  transform: (event, _ctx) => ({
    ...event,
    payload: {
      ...event.payload,
      _subjectiveDescription: 'warm meat stumbles into the feeding ground',
      _actorDescription: 'fresh prey',
      _zombiePerception: true,
    },
  }),
};

export function createGame(seed?: number): Engine {
  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: zombieMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      combatCore,
      createInventoryCore([antibioticsEffect]),
      createDialogueCore([medicDialogue]),
      createCognitionCore({ decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 } }),
      createPerceptionFilter(),
      createProgressionCore({
        trees: [survivalTree],
        rewards: [{
          eventPattern: 'combat.entity.defeated',
          currencyId: 'xp',
          amount: 8,
          recipient: 'actor',
        }],
      }),
      createEnvironmentCore({
        hazards: [{
          id: 'roaming-dead',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('roaming-dead') ?? false,
          effect: (zone, entity, _world, tick) => {
            entity.resources.stamina = Math.max(0, (entity.resources.stamina ?? 0) - 2);
            return [];
          },
        },
        {
          id: 'infection-risk',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('infection-risk') ?? false,
          effect: (zone, entity, _world, tick) => {
            if (entity.tags.includes('human')) {
              entity.resources.infection = Math.min(100, (entity.resources.infection ?? 0) + 5);
            }
            return [];
          },
        }],
      }),
      createFactionCognition({
        factions: [{
          factionId: 'survivors',
          entityIds: ['medic_chen', 'scavenger_rook', 'leader_marsh'],
          cohesion: 0.6,
        }],
      }),
      createRumorPropagation({ propagationDelay: 2 }),
      createDistrictCore({ districts }),
      createBeliefProvenance(),
      createObserverPresentation({
        rules: [undeadHunger],
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
  engine.store.addEntity({ ...medic });
  engine.store.addEntity({ ...scavenger });
  engine.store.addEntity({ ...leader });
  engine.store.addEntity({ ...shambler });
  engine.store.addEntity({ ...runner });

  // Set player
  engine.store.state.playerId = 'survivor';
  engine.store.state.locationId = 'safehouse-lobby';

  // Give antibiotics after accepting hospital mission
  engine.store.events.on('dialogue.ended', (event) => {
    if (event.payload.dialogueId === 'medic-triage') {
      const world = engine.store.state;
      if (world.globals['hospital-mission']) {
        const playerEntity = world.entities['survivor'];
        if (playerEntity && !(playerEntity.inventory ?? []).includes('antibiotics')) {
          const giveEvent = giveItem(playerEntity, 'antibiotics', engine.tick);
          engine.store.recordEvent(giveEvent);
        }
      }
    }
  });

  // Audio cue on entering hospital
  engine.store.events.on('world.zone.entered', (event) => {
    if (event.payload.zoneId === 'hospital-wing') {
      engine.store.emitEvent('audio.cue.requested', {
        cueId: 'scene.hospital-reveal',
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
