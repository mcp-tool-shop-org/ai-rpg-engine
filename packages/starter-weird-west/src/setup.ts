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
} from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatFormulas } from '@ai-rpg-engine/modules';
import {
  manifest,
  player,
  bartender,
  sheriff,
  revenant,
  crawler,
  banditRider,
  mesaCrawlerBoss,
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

// Weird West combat formulas — grit for damage + guard, draw-speed for hit/dodge
const weirdWestFormulas: CombatFormulas = {
  statMapping: { attack: 'grit', precision: 'draw-speed', resolve: 'grit' },
  hitChance: (attacker, target) => {
    const atkSpeed = attacker.stats['draw-speed'] ?? 5;
    const tgtSpeed = target.stats['draw-speed'] ?? 5;
    return Math.min(95, Math.max(5, 50 + atkSpeed * 5 - tgtSpeed * 3));
  },
  damage: (attacker) => Math.max(1, attacker.stats.grit ?? 3),
  guardReduction: (defender) => {
    const grit = defender.stats.grit ?? 3;
    const bonus = Math.max(0, (grit - 3) * 0.03);
    return Math.min(0.75, 0.5 + bonus);
  },
  disengageChance: (actor) => {
    const speed = actor.stats['draw-speed'] ?? 5;
    const grit = actor.stats.grit ?? 3;
    return Math.min(90, Math.max(15, 40 + speed * 5 + grit * 2));
  },
};

export function createGame(seed?: number): Engine {
  const review = createCombatReview({ baseFormulas: weirdWestFormulas });
  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: weirdWestMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      createEngagementCore({ playerId: 'drifter' }),
      review.module,
      createCombatCore(review.explain(withEngagement(weirdWestFormulas))),
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
      createDefeatFallout({
        factions: [
          { factionId: 'townsfolk', entityIds: ['bartender_silas', 'sheriff_hale'] },
          { factionId: 'red-congregation', entityIds: ['dust_revenant'] },
        ],
        playerId: 'drifter',
      }),
      createCombatIntent({ packBiases: BUILTIN_PACK_BIASES.filter(b => ['undead', 'spirit', 'beast'].includes(b.tag)) }),
      createCombatRecovery(),
      createBossPhaseListener(mesaCrawlerBoss),
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
  engine.store.addEntity({ ...banditRider });

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

  // --- Resolve + Dust combat hooks ---
  engine.store.events.on('combat.damage.applied', (event) => {
    if (event.payload.targetId === 'drifter') {
      const p = engine.store.state.entities['drifter'];
      if (p) {
        p.resources.resolve = Math.max(0, (p.resources.resolve ?? 0) - 1);
        p.resources.dust = Math.min(100, (p.resources.dust ?? 0) + 1);
      }
    }
  });
  engine.store.events.on('combat.entity.defeated', (event) => {
    if (event.payload.defeatedBy === 'drifter') {
      const p = engine.store.state.entities['drifter'];
      if (p) p.resources.resolve = Math.min(100, (p.resources.resolve ?? 0) + 3);
    }
  });
  engine.store.events.on('combat.guard.absorbed', (event) => {
    if (event.payload.entityId === 'drifter') {
      const p = engine.store.state.entities['drifter'];
      if (p) p.resources.resolve = Math.min(100, (p.resources.resolve ?? 0) + 1);
    }
  });

  // --- Defeat Fallout: violence attracts the supernatural ---
  engine.store.events.on('defeat.fallout.triggered', (event) => {
    if (event.payload.actorId === 'drifter') {
      const p = engine.store.state.entities['drifter'];
      if (p) p.resources.dust = Math.min(100, (p.resources.dust ?? 0) + 2);
    }
  });

  return engine;
}
