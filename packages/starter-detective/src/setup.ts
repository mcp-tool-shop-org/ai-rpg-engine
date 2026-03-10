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
  widow,
  constable,
  servant,
  thug,
  zones,
  districts,
  widowDialogue,
  smellingSaltsEffect,
  deductionTree,
} from './content.js';
import { detectiveMinimalRuleset } from './ruleset.js';

// Detective-specific: suspects perceive investigation as threatening
const suspectParanoia: PresentationRule = {
  id: 'suspect-paranoia',
  eventPatterns: ['world.zone.entered'],
  priority: 5,
  condition: (_event, ctx) => ctx.observer.tags.includes('suspect'),
  transform: (event, _ctx) => ({
    ...event,
    payload: {
      ...event.payload,
      _subjectiveDescription: 'the inspector is closing in — they know something',
      _actorDescription: 'a relentless investigator',
      _suspectPerception: true,
    },
  }),
};

// Detective combat formulas — grit for damage + guard, perception for hit/dodge
const detectiveFormulas: CombatFormulas = {
  statMapping: { attack: 'grit', precision: 'perception', resolve: 'grit' },
  hitChance: (attacker, target) => {
    const atkPerception = attacker.stats.perception ?? 5;
    const tgtPerception = target.stats.perception ?? 5;
    return Math.min(95, Math.max(5, 50 + atkPerception * 5 - tgtPerception * 3));
  },
  damage: (attacker) => Math.max(1, attacker.stats.grit ?? 3),
  guardReduction: (defender) => {
    const grit = defender.stats.grit ?? 3;
    const bonus = Math.max(0, (grit - 3) * 0.03);
    return Math.min(0.75, 0.5 + bonus);
  },
  disengageChance: (actor) => {
    const perception = actor.stats.perception ?? 5;
    const grit = actor.stats.grit ?? 3;
    return Math.min(90, Math.max(15, 40 + perception * 5 + grit * 2));
  },
};

export function createGame(seed?: number): Engine {
  const review = createCombatReview({ baseFormulas: detectiveFormulas });
  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: detectiveMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      createEngagementCore({ playerId: 'inspector' }),
      review.module,
      createCombatCore(review.explain(withEngagement(detectiveFormulas))),
      createInventoryCore([smellingSaltsEffect]),
      createDialogueCore([widowDialogue]),
      createCognitionCore({ decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 } }),
      createPerceptionFilter(),
      createProgressionCore({
        trees: [deductionTree],
        rewards: [{
          eventPattern: 'combat.entity.defeated',
          currencyId: 'xp',
          amount: 10,
          recipient: 'actor',
        }],
      }),
      createEnvironmentCore({
        hazards: [{
          id: 'dark-alley',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('ambush-risk') ?? false,
          effect: (zone, entity, _world, tick) => {
            entity.resources.composure = Math.max(0, (entity.resources.composure ?? 0) - 2);
            return [];
          },
        }],
      }),
      createFactionCognition({
        factions: [{
          factionId: 'dockworkers',
          entityIds: ['dock_thug'],
          cohesion: 0.5,
        }],
      }),
      createRumorPropagation({ propagationDelay: 2 }),
      createDistrictCore({ districts }),
      createBeliefProvenance(),
      createObserverPresentation({
        rules: [suspectParanoia],
      }),
      createDefeatFallout({
        factions: [{ factionId: 'dockworkers', entityIds: ['dock_thug'] }],
        playerId: 'inspector',
      }),
      createCombatIntent({ packBiases: BUILTIN_PACK_BIASES.filter(b => ['criminal'].includes(b.tag)) }),
      createCombatRecovery(),
      createSimulationInspector(),
    ],
  });

  // Add zones
  for (const zone of zones) {
    engine.store.addZone(zone);
  }

  // Add entities
  engine.store.addEntity({ ...player });
  engine.store.addEntity({ ...widow });
  engine.store.addEntity({ ...constable });
  engine.store.addEntity({ ...servant });
  engine.store.addEntity({ ...thug });

  // Set player
  engine.store.state.playerId = 'inspector';
  engine.store.state.locationId = 'crime-scene';

  // Give smelling salts after interrogating the widow
  engine.store.events.on('dialogue.ended', (event) => {
    if (event.payload.dialogueId === 'widow-interrogation') {
      const world = engine.store.state;
      if (world.globals['pressed-widow']) {
        const playerEntity = world.entities['inspector'];
        if (playerEntity && !(playerEntity.inventory ?? []).includes('smelling-salts')) {
          const giveEvent = giveItem(playerEntity, 'smelling-salts', engine.tick);
          engine.store.recordEvent(giveEvent);
        }
      }
    }
  });

  // Audio cue on entering crime scene
  engine.store.events.on('world.zone.entered', (event) => {
    if (event.payload.zoneId === 'crime-scene') {
      engine.store.emitEvent('audio.cue.requested', {
        cueId: 'scene.crime-scene-reveal',
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

  // --- Composure combat hooks ---
  engine.store.events.on('combat.damage.applied', (event) => {
    if (event.payload.targetId === 'inspector') {
      const p = engine.store.state.entities['inspector'];
      if (p) p.resources.composure = Math.max(0, (p.resources.composure ?? 0) - 2);
    }
  });
  engine.store.events.on('combat.guard.absorbed', (event) => {
    if (event.payload.entityId === 'inspector') {
      const p = engine.store.state.entities['inspector'];
      if (p) p.resources.composure = Math.min(50, (p.resources.composure ?? 0) + 1);
    }
  });
  engine.store.events.on('combat.contact.miss', (event) => {
    if (event.payload.attackerId === 'inspector') {
      const p = engine.store.state.entities['inspector'];
      if (p) p.resources.composure = Math.max(0, (p.resources.composure ?? 0) - 1);
    }
  });

  return engine;
}
