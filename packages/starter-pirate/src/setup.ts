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
  createCombatTactics,
  withCombatResources,
  buildTacticalHooks,
  createCombatResources,
  COMBAT_STATES,
} from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatFormulas, CombatResourceProfile } from '@ai-rpg-engine/modules';
import {
  manifest,
  player,
  quartermaster,
  cartographer,
  governor,
  navySailor,
  seaBeast,
  boardingMarine,
  drownedGuardianBoss,
  zones,
  districts,
  cartographerDialogue,
  rumBarrelEffect,
  seamanshipTree,
  pirateAbilities,
  pirateStatusDefinitions,
} from './content.js';
import { pirateMinimalRuleset } from './ruleset.js';

// Pirate-specific: cursed creatures perceive all visitors as trespassers
const cursedGuardianPerception: PresentationRule = {
  id: 'cursed-guardian-hostility',
  eventPatterns: ['world.zone.entered'],
  priority: 5,
  condition: (_event, ctx) => ctx.observer.tags.includes('cursed'),
  transform: (event, _ctx) => ({
    ...event,
    payload: {
      ...event.payload,
      _subjectiveDescription: 'a thief dares desecrate the drowned shrine',
      _actorDescription: 'a trespasser from the surface',
      _cursedPerception: true,
    },
  }),
};

// Pirate combat formulas — brawn for damage, cunning for hit/dodge, sea-legs for guard
const pirateFormulas: CombatFormulas = {
  statMapping: { attack: 'brawn', precision: 'cunning', resolve: 'sea-legs' },
  hitChance: (attacker, target) => {
    const atkCunning = attacker.stats.cunning ?? 5;
    const tgtCunning = target.stats.cunning ?? 5;
    return Math.min(95, Math.max(5, 50 + atkCunning * 5 - tgtCunning * 3));
  },
  damage: (attacker) => Math.max(1, attacker.stats.brawn ?? 3),
  guardReduction: (defender) => {
    const seaLegs = defender.stats['sea-legs'] ?? 3;
    const bonus = Math.max(0, (seaLegs - 3) * 0.03);
    return Math.min(0.75, 0.5 + bonus);
  },
  disengageChance: (actor) => {
    const cunning = actor.stats.cunning ?? 5;
    const seaLegs = actor.stats['sea-legs'] ?? 3;
    return Math.min(90, Math.max(15, 40 + cunning * 5 + seaLegs * 2));
  },
};

// Pirate combat resource profile — crew morale drives everything
const pirateCombatProfile: CombatResourceProfile = {
  packId: 'pirate',
  gains: [
    { trigger: 'defeat-enemy', resourceId: 'morale', amount: 3 },
    { trigger: 'attack-hit', resourceId: 'morale', amount: 2 },
  ],
  spends: [
    { action: 'attack', resourceId: 'morale', amount: 5, effects: { damageBonus: 2 } },
    { action: 'reposition', resourceId: 'morale', amount: 4, effects: { resistState: COMBAT_STATES.EXPOSED, resistChance: 50 } },
  ],
  drains: [
    { trigger: 'take-damage', resourceId: 'morale', amount: 3 },
    { trigger: 'disengage-fail', resourceId: 'morale', amount: 4 },
  ],
  aiModifiers: [
    {
      resourceId: 'morale',
      highThreshold: 60,
      highModifiers: { attack: 10, pressure: 10 },
      lowThreshold: 20,
      lowModifiers: { disengage: 15 },
    },
  ],
};

export function createGame(seed?: number): Engine {
  registerStatusDefinitions(pirateStatusDefinitions);
  const review = createCombatReview({ baseFormulas: pirateFormulas });
  const wrappedFormulas = withCombatResources(pirateCombatProfile, withEngagement(pirateFormulas));
  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: pirateMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      createEngagementCore({ playerId: 'captain' }),
      review.module,
      createCombatCore(review.explain(wrappedFormulas)),
      createInventoryCore([rumBarrelEffect]),
      createDialogueCore([cartographerDialogue]),
      createCognitionCore({ decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 } }),
      createPerceptionFilter(),
      createProgressionCore({
        trees: [seamanshipTree],
        rewards: [{
          eventPattern: 'combat.entity.defeated',
          currencyId: 'xp',
          amount: 12,
          recipient: 'actor',
        }],
      }),
      createEnvironmentCore({
        hazards: [{
          id: 'storm-surge',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('storm-surge') ?? false,
          effect: (zone, entity, _world, tick) => {
            entity.resources.morale = Math.max(0, (entity.resources.morale ?? 0) - 2);
            return [];
          },
        },
        {
          id: 'drowning-pressure',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('drowning-pressure') ?? false,
          effect: (zone, entity, _world, tick) => {
            entity.resources.hp = Math.max(0, (entity.resources.hp ?? 0) - 1);
            return [];
          },
        }],
      }),
      createFactionCognition({
        factions: [{
          factionId: 'colonial-navy',
          entityIds: ['navy_sailor', 'governor_vane'],
          cohesion: 0.8,
        }],
      }),
      createRumorPropagation({ propagationDelay: 3 }),
      createDistrictCore({ districts }),
      createBeliefProvenance(),
      createObserverPresentation({
        rules: [cursedGuardianPerception],
      }),
      createDefeatFallout({
        factions: [{ factionId: 'colonial-navy', entityIds: ['navy_sailor', 'governor_vane'] }],
        playerId: 'captain',
      }),
      createCombatTactics({ hooks: buildTacticalHooks(pirateCombatProfile) }),
      createCombatResources(pirateCombatProfile),
      createCombatIntent({ packBiases: BUILTIN_PACK_BIASES.filter(b => ['pirate', 'colonial', 'beast'].includes(b.tag)), resourceProfile: pirateCombatProfile }),
      createCombatRecovery({ safeZoneTags: ['safe', 'ship', 'home-base', 'tavern'] }),
      createBossPhaseListener(drownedGuardianBoss),
      createAbilityCore({ abilities: pirateAbilities, statMapping: { power: 'brawn', precision: 'cunning', focus: 'sea-legs' } }),
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
  engine.store.addEntity({ ...quartermaster });
  engine.store.addEntity({ ...cartographer });
  engine.store.addEntity({ ...governor });
  engine.store.addEntity({ ...navySailor });
  engine.store.addEntity({ ...seaBeast });
  engine.store.addEntity({ ...boardingMarine });

  // Set player
  engine.store.state.playerId = 'captain';
  engine.store.state.locationId = 'ship-deck';

  // Give rum barrel after cartographer deal
  engine.store.events.on('dialogue.ended', (event) => {
    if (event.payload.dialogueId === 'cartographer-maps') {
      const world = engine.store.state;
      if (world.globals['shrine-deal']) {
        const playerEntity = world.entities['captain'];
        if (playerEntity && !(playerEntity.inventory ?? []).includes('rum-barrel')) {
          const giveEvent = giveItem(playerEntity, 'rum-barrel', engine.tick);
          engine.store.recordEvent(giveEvent);
        }
      }
    }
  });

  // Audio cue on entering sunken shrine
  engine.store.events.on('world.zone.entered', (event) => {
    if (event.payload.zoneId === 'sunken-shrine') {
      engine.store.emitEvent('audio.cue.requested', {
        cueId: 'scene.sunken-shrine-reveal',
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
