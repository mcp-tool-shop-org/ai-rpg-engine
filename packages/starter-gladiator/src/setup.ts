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
} from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatFormulas } from '@ai-rpg-engine/modules';
import {
  manifest,
  player,
  lanistaBrutus,
  dominaValeria,
  nerva,
  arenaChampion,
  warBeast,
  zones,
  districts,
  patronDialogue,
  patronTokenEffect,
  arenaGloryTree,
} from './content.js';
import { gladiatorMinimalRuleset } from './ruleset.js';

// Gladiator-specific presentation rule: patrons see gladiators as investments
const patronPerception: PresentationRule = {
  id: 'patron-investment-framing',
  eventPatterns: ['world.zone.entered'],
  priority: 5,
  condition: (_event, ctx) => ctx.observer.tags.includes('patron'),
  transform: (event, _ctx) => ({
    ...event,
    payload: {
      ...event.payload,
      _subjectiveDescription: 'another asset enters the arena, value yet to be determined',
      _actorDescription: 'an investment in blood and spectacle',
      _patronPerception: true,
    },
  }),
};

// Gladiator combat formulas — might for damage, agility for hit/dodge, showmanship for guard
const gladiatorFormulas: CombatFormulas = {
  hitChance: (attacker, target) => {
    const atkAgility = attacker.stats.agility ?? 5;
    const tgtAgility = target.stats.agility ?? 5;
    return Math.min(95, Math.max(5, 50 + atkAgility * 5 - tgtAgility * 3));
  },
  damage: (attacker) => Math.max(1, attacker.stats.might ?? 3),
  guardReduction: (defender) => {
    const showmanship = defender.stats.showmanship ?? 3;
    const bonus = Math.max(0, (showmanship - 3) * 0.03);
    return Math.min(0.75, 0.5 + bonus);
  },
  disengageChance: (actor) => {
    const agility = actor.stats.agility ?? 5;
    const showmanship = actor.stats.showmanship ?? 3;
    return Math.min(90, Math.max(15, 40 + agility * 5 + showmanship * 2));
  },
};

export function createGame(seed?: number): Engine {
  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: gladiatorMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      createCombatCore(gladiatorFormulas),
      createInventoryCore([patronTokenEffect]),
      createDialogueCore([patronDialogue]),
      createCognitionCore({ decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 } }),
      createPerceptionFilter(),
      createProgressionCore({
        trees: [arenaGloryTree],
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
            id: 'scorching-sand',
            triggerOn: 'world.zone.entered',
            condition: (zone) => zone.hazards?.includes('scorching-sand') ?? false,
            effect: (_zone, entity, _world, _tick) => {
              entity.resources.fatigue = Math.min(50, (entity.resources.fatigue ?? 0) + 3);
              return [];
            },
          },
          {
            id: 'trap-pit',
            triggerOn: 'world.zone.entered',
            condition: (zone) => zone.hazards?.includes('trap-pit') ?? false,
            effect: (_zone, entity, _world, _tick) => {
              entity.resources.hp = Math.max(0, (entity.resources.hp ?? 0) - 4);
              return [];
            },
          },
        ],
      }),
      createFactionCognition({
        factions: [
          {
            factionId: 'arena-stable',
            entityIds: ['lanista-brutus', 'nerva', 'arena-champion'],
            cohesion: 0.5,
          },
          {
            factionId: 'patron-circle',
            entityIds: ['domina-valeria'],
            cohesion: 0.4,
          },
        ],
      }),
      createRumorPropagation({ propagationDelay: 2 }),
      createDistrictCore({ districts }),
      createBeliefProvenance(),
      createObserverPresentation({
        rules: [patronPerception],
      }),
      createDefeatFallout({
        factions: [
          { factionId: 'arena-stable', entityIds: ['lanista-brutus', 'nerva', 'arena-champion'] },
          { factionId: 'patron-circle', entityIds: ['domina-valeria'] },
        ],
        playerId: 'player',
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
  engine.store.addEntity({ ...lanistaBrutus });
  engine.store.addEntity({ ...dominaValeria });
  engine.store.addEntity({ ...nerva });
  engine.store.addEntity({ ...arenaChampion });
  engine.store.addEntity({ ...warBeast });

  // Set player
  engine.store.state.playerId = 'player';
  engine.store.state.locationId = 'holding-cells';

  // Listen for patron gift — give patron token after dialogue
  engine.store.events.on('dialogue.ended', (event) => {
    if (event.payload.dialogueId === 'patron-audience') {
      const world = engine.store.state;
      if (world.globals['patron-accepted']) {
        const playerEntity = world.entities['player'];
        if (playerEntity && !(playerEntity.inventory ?? []).includes('patron-token')) {
          const giveEvent = giveItem(playerEntity, 'patron-token', engine.tick);
          engine.store.recordEvent(giveEvent);
        }
      }
    }
  });

  // Audio cue on entering arena floor
  engine.store.events.on('world.zone.entered', (event) => {
    if (event.payload.zoneId === 'arena-floor') {
      engine.store.emitEvent('audio.cue.requested', {
        cueId: 'scene.arena-roar',
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

  // --- Crowd Favor combat hooks ---
  engine.store.events.on('combat.contact.hit', (event) => {
    if (event.payload.attackerId === 'player') {
      const p = engine.store.state.entities['player'];
      if (p) p.resources['crowd-favor'] = Math.min(100, (p.resources['crowd-favor'] ?? 0) + 2);
    }
  });
  engine.store.events.on('combat.contact.miss', (event) => {
    if (event.payload.attackerId === 'player') {
      const p = engine.store.state.entities['player'];
      if (p) p.resources['crowd-favor'] = Math.max(0, (p.resources['crowd-favor'] ?? 0) - 1);
    }
  });
  engine.store.events.on('combat.entity.defeated', (event) => {
    if (event.payload.defeatedBy === 'player') {
      const p = engine.store.state.entities['player'];
      if (p) p.resources['crowd-favor'] = Math.min(100, (p.resources['crowd-favor'] ?? 0) + 5);
    }
  });
  engine.store.events.on('combat.guard.absorbed', (event) => {
    if (event.payload.entityId === 'player') {
      const p = engine.store.state.entities['player'];
      if (p) p.resources['crowd-favor'] = Math.min(100, (p.resources['crowd-favor'] ?? 0) + 1);
    }
  });
  engine.store.events.on('combat.disengage.success', (event) => {
    if (event.payload.entityId === 'player') {
      const p = engine.store.state.entities['player'];
      if (p) p.resources['crowd-favor'] = Math.max(0, (p.resources['crowd-favor'] ?? 0) - 3);
    }
  });

  return engine;
}
