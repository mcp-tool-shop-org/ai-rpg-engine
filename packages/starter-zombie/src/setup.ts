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
} from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatFormulas } from '@ai-rpg-engine/modules';
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

// Zombie combat formulas — fitness for damage, wits for hit/dodge, nerve for guard
const zombieFormulas: CombatFormulas = {
  hitChance: (attacker, target) => {
    const atkWits = attacker.stats.wits ?? 5;
    const tgtWits = target.stats.wits ?? 5;
    return Math.min(95, Math.max(5, 50 + atkWits * 5 - tgtWits * 3));
  },
  damage: (attacker) => Math.max(1, attacker.stats.fitness ?? 3),
  guardReduction: (defender) => {
    const nerve = defender.stats.nerve ?? 3;
    const bonus = Math.max(0, (nerve - 3) * 0.03);
    return Math.min(0.75, 0.5 + bonus);
  },
  disengageChance: (actor) => {
    const wits = actor.stats.wits ?? 5;
    const nerve = actor.stats.nerve ?? 3;
    return Math.min(90, Math.max(15, 40 + wits * 5 + nerve * 2));
  },
};

export function createGame(seed?: number): Engine {
  const review = createCombatReview({ baseFormulas: zombieFormulas });
  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: zombieMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      createEngagementCore({ playerId: 'survivor' }),
      review.module,
      createCombatCore(review.explain(withEngagement(zombieFormulas))),
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
      createDefeatFallout({
        factions: [{ factionId: 'survivors', entityIds: ['medic_chen', 'scavenger_rook', 'leader_marsh'] }],
        playerId: 'survivor',
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

  // --- Infection combat hooks ---
  engine.store.events.on('combat.damage.applied', (event) => {
    if (event.payload.targetId === 'survivor') {
      const attackerId = event.payload.attackerId as string;
      const attacker = engine.store.state.entities[attackerId];
      if (attacker?.tags.includes('zombie')) {
        const p = engine.store.state.entities['survivor'];
        if (p) {
          const dmg = (event.payload.damage as number) ?? 0;
          const amount = dmg >= 5 ? 2 : 1;
          p.resources.infection = Math.min(100, (p.resources.infection ?? 0) + amount);
        }
      }
    }
  });

  return engine;
}
