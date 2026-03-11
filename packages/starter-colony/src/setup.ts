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
} from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatFormulas, CombatResourceProfile } from '@ai-rpg-engine/modules';
import {
  manifest,
  player,
  scientist,
  security,
  drone,
  resonance,
  swarmLarva,
  resonanceBoss,
  zones,
  districts,
  scientistDialogue,
  emergencyCellEffect,
  commanderTree,
  colonyAbilities,
  colonyStatusDefinitions,
} from './content.js';
import { colonyMinimalRuleset } from './ruleset.js';

// Alien presence perceives colonists as disruptive resonance patterns
const alienPerception: PresentationRule = {
  id: 'alien-resonance-view',
  eventPatterns: ['world.zone.entered'],
  priority: 5,
  condition: (_event, ctx) => ctx.observer.tags.includes('alien'),
  transform: (event, _ctx) => ({
    ...event,
    payload: {
      ...event.payload,
      _subjectiveDescription: 'a disruptive resonance pattern intrudes upon the harmonic field',
      _actorDescription: 'a source of electromagnetic noise',
      _alienPerception: true,
    },
  }),
};

// Colony combat formulas — engineering for damage, awareness for hit/dodge, command for guard
const colonyFormulas: CombatFormulas = {
  statMapping: { attack: 'engineering', precision: 'awareness', resolve: 'command' },
  hitChance: (attacker, target) => {
    const atkAwareness = attacker.stats.awareness ?? 5;
    const tgtAwareness = target.stats.awareness ?? 5;
    return Math.min(95, Math.max(5, 50 + atkAwareness * 5 - tgtAwareness * 3));
  },
  damage: (attacker) => Math.max(1, attacker.stats.engineering ?? 3),
  guardReduction: (defender) => {
    const command = defender.stats.command ?? 3;
    const bonus = Math.max(0, (command - 3) * 0.03);
    return Math.min(0.75, 0.5 + bonus);
  },
  disengageChance: (actor) => {
    const awareness = actor.stats.awareness ?? 5;
    const command = actor.stats.command ?? 3;
    return Math.min(90, Math.max(15, 40 + awareness * 5 + command * 2));
  },
};

// Colony combat resource profile — scarcity and crew cohesion
const colonyCombatProfile: CombatResourceProfile = {
  packId: 'colony',
  gains: [
    { trigger: 'brace', resourceId: 'power', amount: 3 },
  ],
  spends: [
    { action: 'attack', resourceId: 'power', amount: 5, effects: { damageBonus: 2 } },
    { action: 'reposition', resourceId: 'power', amount: 4, effects: { repositionBonus: 10 } },
  ],
  drains: [
    { trigger: 'take-damage', resourceId: 'morale', amount: 2 },
    { trigger: 'disengage-fail', resourceId: 'morale', amount: 3 },
  ],
  aiModifiers: [
    {
      resourceId: 'power',
      lowThreshold: 15,
      lowModifiers: { brace: 15 },
    },
    {
      resourceId: 'morale',
      lowThreshold: 20,
      lowModifiers: { disengage: 15 },
    },
  ],
};

export function createGame(seed?: number): Engine {
  registerStatusDefinitions(colonyStatusDefinitions);
  const review = createCombatReview({ baseFormulas: colonyFormulas });
  const wrappedFormulas = withCombatResources(colonyCombatProfile, withEngagement(colonyFormulas));
  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: colonyMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      createEngagementCore({ playerId: 'commander', backlineTags: ['ranged'], protectorTags: ['bodyguard'] }),
      review.module,
      createCombatCore(review.explain(wrappedFormulas)),
      createInventoryCore([emergencyCellEffect]),
      createDialogueCore([scientistDialogue]),
      createCognitionCore({ decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 } }),
      createPerceptionFilter(),
      createProgressionCore({
        trees: [commanderTree],
        rewards: [{
          eventPattern: 'combat.entity.defeated',
          currencyId: 'xp',
          amount: 10,
          recipient: 'actor',
        }],
      }),
      createEnvironmentCore({
        hazards: [{
          id: 'power-drain',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('power-drain') ?? false,
          effect: (zone, entity, _world, tick) => {
            entity.resources.power = Math.max(0, (entity.resources.power ?? 0) - 5);
            return [];
          },
        },
        {
          id: 'resonance-field',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('resonance-field') ?? false,
          effect: (zone, entity, _world, tick) => {
            entity.resources.morale = Math.max(0, (entity.resources.morale ?? 0) - 3);
            entity.resources.power = Math.max(0, (entity.resources.power ?? 0) - 8);
            return [];
          },
        }],
      }),
      createFactionCognition({
        factions: [{
          factionId: 'colony-council',
          entityIds: ['dr_vasquez', 'chief_okafor'],
          cohesion: 0.5,
        }],
      }),
      createRumorPropagation({ propagationDelay: 2 }),
      createDistrictCore({ districts }),
      createBeliefProvenance(),
      createObserverPresentation({
        rules: [alienPerception],
      }),
      createDefeatFallout({
        factions: [{ factionId: 'colony-council', entityIds: ['dr_vasquez', 'chief_okafor'] }],
        playerId: 'commander',
      }),
      createCombatTactics({ hooks: buildTacticalHooks(colonyCombatProfile) }),
      createCombatResources(colonyCombatProfile),
      createCombatIntent({ packBiases: BUILTIN_PACK_BIASES.filter(b => ['drone', 'alien'].includes(b.tag)), resourceProfile: colonyCombatProfile }),
      createCombatRecovery({ safeZoneTags: ['safe', 'colony-core'] }),
      createBossPhaseListener(resonanceBoss),
      createAbilityCore({ abilities: colonyAbilities, statMapping: { power: 'engineering', precision: 'awareness', focus: 'command' } }),
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
  engine.store.addEntity({ ...scientist });
  engine.store.addEntity({ ...security });
  engine.store.addEntity({ ...drone });
  engine.store.addEntity({ ...resonance });
  engine.store.addEntity({ ...swarmLarva });

  // Set player
  engine.store.state.playerId = 'commander';
  engine.store.state.locationId = 'command-module';

  // Give emergency cell after accepting cavern mission
  engine.store.events.on('dialogue.ended', (event) => {
    if (event.payload.dialogueId === 'vasquez-briefing') {
      const world = engine.store.state;
      if (world.globals['cavern-mission']) {
        const playerEntity = world.entities['commander'];
        if (playerEntity && !(playerEntity.inventory ?? []).includes('emergency-cell')) {
          const giveEvent = giveItem(playerEntity, 'emergency-cell', engine.tick);
          engine.store.recordEvent(giveEvent);
        }
      }
    }
  });

  // Audio cue on entering alien cavern
  engine.store.events.on('world.zone.entered', (event) => {
    if (event.payload.zoneId === 'alien-cavern') {
      engine.store.emitEvent('audio.cue.requested', {
        cueId: 'scene.alien-cavern-reveal',
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

  // --- Colony-specific: ally defeated morale penalty (not covered by profile) ---
  engine.store.events.on('combat.entity.defeated', (event) => {
    const defeatedId = event.payload.entityId as string;
    const defeated = engine.store.state.entities[defeatedId];
    if (defeated?.tags.includes('ally') && event.payload.defeatedBy !== 'commander') {
      const p = engine.store.state.entities['commander'];
      if (p) p.resources.morale = Math.max(0, (p.resources.morale ?? 0) - 5);
    }
  });

  return engine;
}
