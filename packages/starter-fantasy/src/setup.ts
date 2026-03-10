// Game setup — wire content into engine

import { Engine } from '@ai-rpg-engine/core';
import {
  traversalCore,
  statusCore,
  createCombatCore,
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
  createDefeatFallout,
  createEngagementCore,
  withEngagement,
  createCombatReview,
  createCombatIntent,
  BUILTIN_PACK_BIASES,
} from '@ai-rpg-engine/modules';
import type { PresentationRule } from '@ai-rpg-engine/modules';
import {
  manifest,
  player,
  pilgrim,
  brotherAldric,
  sisterMaren,
  ashGhoul,
  zones,
  districts,
  pilgrimDialogue,
  healingDraughtEffect,
  combatMasteryTree,
} from './content.js';
import { fantasyMinimalRuleset } from './ruleset.js';

// Fantasy-specific presentation rule: undead perceive all living as threats
const undeadHostilePerception: PresentationRule = {
  id: 'undead-threat-framing',
  eventPatterns: ['world.zone.entered'],
  priority: 5,
  condition: (_event, ctx) => ctx.observer.tags.includes('undead'),
  transform: (event, _ctx) => ({
    ...event,
    payload: {
      ...event.payload,
      _subjectiveDescription: 'warm blood encroaches upon the sacred dead',
      _actorDescription: 'a living trespasser',
      _undeadPerception: true,
    },
  }),
};

export function createGame(seed?: number): Engine {
  const review = createCombatReview({ baseFormulas: {} });
  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: fantasyMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      createEngagementCore({ playerId: 'player' }),
      review.module,
      createCombatCore(review.explain(withEngagement({}))),
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
      createDistrictCore({ districts }),
      createBeliefProvenance(),
      createObserverPresentation({
        rules: [undeadHostilePerception],
      }),
      createDefeatFallout({
        factions: [{ factionId: 'chapel-undead', entityIds: ['ash-ghoul'] }],
        playerId: 'player',
      }),
      createCombatIntent({ packBiases: BUILTIN_PACK_BIASES.filter(b => ['undead'].includes(b.tag)) }),
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
  engine.store.addEntity({ ...brotherAldric });
  engine.store.addEntity({ ...sisterMaren });
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
