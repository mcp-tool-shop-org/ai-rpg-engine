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
  createCombatRecovery,
} from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatFormulas } from '@ai-rpg-engine/modules';
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

// Vampire combat formulas — vitality for damage, cunning for hit/dodge, presence for guard
const vampireFormulas: CombatFormulas = {
  hitChance: (attacker, target) => {
    const atkCunning = attacker.stats.cunning ?? 5;
    const tgtCunning = target.stats.cunning ?? 5;
    return Math.min(95, Math.max(5, 50 + atkCunning * 5 - tgtCunning * 3));
  },
  damage: (attacker) => Math.max(1, attacker.stats.vitality ?? 3),
  guardReduction: (defender) => {
    const presence = defender.stats.presence ?? 3;
    const bonus = Math.max(0, (presence - 3) * 0.03);
    return Math.min(0.75, 0.5 + bonus);
  },
  disengageChance: (actor) => {
    const cunning = actor.stats.cunning ?? 5;
    const presence = actor.stats.presence ?? 3;
    return Math.min(90, Math.max(15, 40 + cunning * 5 + presence * 2));
  },
};

export function createGame(seed?: number): Engine {
  const review = createCombatReview({ baseFormulas: vampireFormulas });
  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: vampireMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      createEngagementCore({ playerId: 'player', backlineTags: ['ranged', 'caster', 'thrall'] }),
      review.module,
      createCombatCore(review.explain(withEngagement(vampireFormulas))),
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
      createDefeatFallout({
        factions: [
          { factionId: 'house-morvaine', entityIds: ['duchess-morvaine', 'cassius', 'feral-thrall'] },
          { factionId: 'witch-hunters', entityIds: ['witch-hunter'] },
        ],
        playerId: 'player',
      }),
      createCombatIntent({ packBiases: BUILTIN_PACK_BIASES.filter(b => ['vampire', 'feral', 'hunter'].includes(b.tag)) }),
      createCombatRecovery({ safeZoneTags: ['safe', 'opulent'] }),
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

  // --- Bloodlust + Humanity combat hooks ---
  engine.store.events.on('combat.damage.applied', (event) => {
    const p = engine.store.state.entities['player'];
    if (!p) return;
    if (event.payload.attackerId === 'player') {
      p.resources.bloodlust = Math.min(100, (p.resources.bloodlust ?? 0) + 2);
    }
    if (event.payload.targetId === 'player') {
      p.resources.bloodlust = Math.min(100, (p.resources.bloodlust ?? 0) + 3);
    }
  });
  engine.store.events.on('combat.entity.defeated', (event) => {
    if (event.payload.defeatedBy === 'player') {
      const p = engine.store.state.entities['player'];
      if (p) {
        p.resources.bloodlust = Math.min(100, (p.resources.bloodlust ?? 0) + 5);
        p.resources.humanity = Math.max(0, (p.resources.humanity ?? 0) - 3);
      }
    }
  });
  engine.store.events.on('combat.guard.absorbed', (event) => {
    if (event.payload.entityId === 'player') {
      const p = engine.store.state.entities['player'];
      if (p) p.resources.humanity = Math.min(100, (p.resources.humanity ?? 0) + 1);
    }
  });

  // --- Defeat Fallout: violence erodes humanity ---
  engine.store.events.on('defeat.fallout.triggered', (event) => {
    if (event.payload.actorId === 'player') {
      const p = engine.store.state.entities['player'];
      if (p) p.resources.humanity = Math.max(0, (p.resources.humanity ?? 0) - 1);
    }
  });

  return engine;
}
