// Game setup — wire cyberpunk content into engine

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
} from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatFormulas } from '@ai-rpg-engine/modules';
import {
  manifest,
  player,
  fixer,
  rez,
  iceAgent,
  zones,
  districts,
  fixerDialogue,
  iceBreaker,
  netrunningTree,
} from './content.js';
import { cyberpunkMinimalRuleset } from './ruleset.js';

// Cyberpunk presentation rule: ICE agents flag all non-ICE as intrusion
const iceSecurityFraming: PresentationRule = {
  id: 'ice-security-framing',
  eventPatterns: ['world.zone.entered'],
  priority: 5,
  condition: (_event, ctx) => ctx.observer.tags.includes('ice-agent'),
  transform: (event, _ctx) => ({
    ...event,
    payload: {
      ...event.payload,
      _subjectiveDescription: 'unauthorized network entity detected in secure zone',
      _actorDescription: 'intrusion signature',
      _securityFraming: true,
    },
  }),
};

// Cyberpunk combat formulas — chrome for damage, reflex for hit/dodge, netrunning for guard
const cyberpunkFormulas: CombatFormulas = {
  hitChance: (attacker, target) => {
    const atkReflex = attacker.stats.reflex ?? 5;
    const tgtReflex = target.stats.reflex ?? 5;
    return Math.min(95, Math.max(5, 50 + atkReflex * 5 - tgtReflex * 3));
  },
  damage: (attacker) => Math.max(1, attacker.stats.chrome ?? 3),
  guardReduction: (defender) => {
    const netrunning = defender.stats.netrunning ?? 3;
    const bonus = Math.max(0, (netrunning - 3) * 0.03);
    return Math.min(0.75, 0.5 + bonus);
  },
  disengageChance: (actor) => {
    const reflex = actor.stats.reflex ?? 5;
    const netrunning = actor.stats.netrunning ?? 3;
    return Math.min(90, Math.max(15, 40 + reflex * 5 + netrunning * 2));
  },
};

export function createGame(seed?: number): Engine {
  const engine = new Engine({
    manifest,
    seed: seed ?? 77,
    ruleset: cyberpunkMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      createCombatCore(cyberpunkFormulas),
      createInventoryCore([iceBreaker]),
      createDialogueCore([fixerDialogue]),
      createCognitionCore({ decay: { baseRate: 0.03, pruneThreshold: 0.05, instabilityFactor: 0.8 } }),
      createPerceptionFilter({
        perceptionStat: 'reflex',
        senseStats: { network: 'netrunning' },
      }),
      createProgressionCore({
        trees: [netrunningTree],
        rewards: [{
          eventPattern: 'combat.entity.defeated',
          currencyId: 'xp',
          amount: 20,
          recipient: 'actor',
        }],
      }),
      createEnvironmentCore({
        hazards: [{
          id: 'exposed-wiring',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('exposed wiring') ?? false,
          effect: (zone, entity, _world, tick) => {
            entity.resources.hp = Math.max(0, (entity.resources.hp ?? 0) - 2);
            return [];
          },
        }],
      }),
      createFactionCognition({
        factions: [{
          factionId: 'vault-ice',
          entityIds: ['ice-sentry'],
          cohesion: 0.95,
        }],
      }),
      createRumorPropagation({ propagationDelay: 1, distortionPerHop: 0.03 }),
      createDistrictCore({ districts }),
      createBeliefProvenance(),
      createObserverPresentation({
        rules: [iceSecurityFraming],
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
  engine.store.addEntity({ ...fixer });
  engine.store.addEntity({ ...rez });
  engine.store.addEntity({ ...iceAgent });

  // Set player
  engine.store.state.playerId = 'runner';
  engine.store.state.locationId = 'street-level';

  // Give ice-breaker after fixer briefing
  engine.store.events.on('dialogue.ended', (event) => {
    if (event.payload.dialogueId === 'fixer-briefing') {
      const world = engine.store.state;
      if (world.globals['briefed']) {
        const playerEntity = world.entities['runner'];
        if (playerEntity && !(playerEntity.inventory ?? []).includes('ice-breaker')) {
          const giveEvent = giveItem(playerEntity, 'ice-breaker', engine.tick);
          engine.store.recordEvent(giveEvent);
        }
      }
    }
  });

  // Audio cue on entering data vault
  engine.store.events.on('world.zone.entered', (event) => {
    if (event.payload.zoneId === 'data-vault') {
      engine.store.emitEvent('audio.cue.requested', {
        cueId: 'scene.vault-reveal',
        channel: 'stinger',
        priority: 'high',
      });
    }
  });

  // --- ICE + Bandwidth combat hooks ---
  engine.store.events.on('combat.contact.hit', (event) => {
    if (event.payload.attackerId === 'runner') {
      const p = engine.store.state.entities['runner'];
      if (p) p.resources.ice = Math.max(0, (p.resources.ice ?? 0) - 1);
    }
  });
  engine.store.events.on('combat.damage.applied', (event) => {
    if (event.payload.targetId === 'runner') {
      const p = engine.store.state.entities['runner'];
      if (p) p.resources.bandwidth = Math.max(0, (p.resources.bandwidth ?? 0) - 1);
    }
  });
  engine.store.events.on('combat.guard.absorbed', (event) => {
    if (event.payload.entityId === 'runner') {
      const p = engine.store.state.entities['runner'];
      if (p) p.resources.ice = Math.min(100, (p.resources.ice ?? 0) + 1);
    }
  });

  return engine;
}
