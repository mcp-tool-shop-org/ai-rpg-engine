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
  createBossPhaseListener,
  createAbilityCore,
  createAbilityEffects,
  createAbilityReview,
  registerStatusDefinitions,
} from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatFormulas } from '@ai-rpg-engine/modules';
import {
  manifest,
  player,
  lordTakeda,
  ladyHimiko,
  magistrateSato,
  shadowAssassin,
  corruptSamurai,
  castleGuard,
  corruptSamuraiBoss,
  zones,
  districts,
  magistrateDialogue,
  incenseKitEffect,
  wayOfTheBladeTree,
  roninAbilities,
  roninStatusDefinitions,
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

// Ronin combat formulas — discipline for damage, perception for hit/dodge, composure for guard
const roninFormulas: CombatFormulas = {
  statMapping: { attack: 'discipline', precision: 'perception', resolve: 'composure' },
  hitChance: (attacker, target) => {
    const atkPerception = attacker.stats.perception ?? 5;
    const tgtPerception = target.stats.perception ?? 5;
    return Math.min(95, Math.max(5, 50 + atkPerception * 5 - tgtPerception * 3));
  },
  damage: (attacker) => Math.max(1, attacker.stats.discipline ?? 3),
  guardReduction: (defender) => {
    const composure = defender.stats.composure ?? 3;
    const bonus = Math.max(0, (composure - 3) * 0.03);
    return Math.min(0.75, 0.5 + bonus);
  },
  disengageChance: (actor) => {
    const perception = actor.stats.perception ?? 5;
    const composure = actor.stats.composure ?? 3;
    return Math.min(90, Math.max(15, 40 + perception * 5 + composure * 2));
  },
};

export function createGame(seed?: number): Engine {
  registerStatusDefinitions(roninStatusDefinitions);
  const review = createCombatReview({ baseFormulas: roninFormulas });
  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: roninMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      createEngagementCore({ playerId: 'player', protectorTags: ['bodyguard', 'samurai'] }),
      review.module,
      createCombatCore(review.explain(withEngagement(roninFormulas))),
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
      createDefeatFallout({
        factions: [
          { factionId: 'takeda-clan', entityIds: ['lord-takeda', 'lady-himiko', 'corrupt-samurai'] },
          { factionId: 'shadow-network', entityIds: ['shadow-assassin'] },
        ],
        playerId: 'player',
      }),
      createCombatIntent({ packBiases: BUILTIN_PACK_BIASES.filter(b => ['assassin', 'samurai'].includes(b.tag)) }),
      createCombatRecovery({ safeZoneTags: ['safe', 'tranquil'] }),
      createBossPhaseListener(corruptSamuraiBoss),
      createAbilityCore({ abilities: roninAbilities, statMapping: { power: 'discipline', precision: 'perception', focus: 'composure' } }),
      createAbilityEffects(),
      createAbilityReview(),
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
  engine.store.addEntity({ ...castleGuard });

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

  // --- Ki + Honor combat hooks ---
  engine.store.events.on('combat.damage.applied', (event) => {
    if (event.payload.attackerId === 'player') {
      const p = engine.store.state.entities['player'];
      if (p) p.resources.ki = Math.max(0, (p.resources.ki ?? 0) - 1);
    }
  });
  engine.store.events.on('combat.guard.absorbed', (event) => {
    if (event.payload.entityId === 'player') {
      const p = engine.store.state.entities['player'];
      if (p) p.resources.ki = Math.min(50, (p.resources.ki ?? 0) + 2);
    }
  });
  engine.store.events.on('combat.entity.defeated', (event) => {
    if (event.payload.defeatedBy === 'player') {
      const p = engine.store.state.entities['player'];
      if (p) {
        p.resources.honor = Math.min(100, (p.resources.honor ?? 0) + 3);
        p.resources.ki = Math.min(50, (p.resources.ki ?? 0) + 5);
      }
    }
  });
  engine.store.events.on('combat.disengage.success', (event) => {
    if (event.payload.entityId === 'player') {
      const p = engine.store.state.entities['player'];
      if (p) p.resources.honor = Math.max(0, (p.resources.honor ?? 0) - 5);
    }
  });
  engine.store.events.on('combat.contact.miss', (event) => {
    if (event.payload.attackerId === 'player') {
      const p = engine.store.state.entities['player'];
      if (p) p.resources.ki = Math.max(0, (p.resources.ki ?? 0) - 1);
    }
  });

  // --- Defeat Fallout: bonus honor on boss kill ---
  engine.store.events.on('defeat.fallout.triggered', (event) => {
    if (event.payload.isBoss && event.payload.actorId === 'player') {
      const p = engine.store.state.entities['player'];
      if (p) p.resources.honor = Math.min(100, (p.resources.honor ?? 0) + 5);
    }
  });

  return engine;
}
