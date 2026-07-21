// Game setup — wire content into engine

import { Engine } from '@ai-rpg-engine/core';
import {
  traversalCore,
  statusCore,
  buildCombatStack,
  createInventoryCore,
  createDialogueCore,
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
  createBossPhaseListener,
  createAbilityCore,
  createAbilityEffects,
  createAbilityReview,
  registerStatusDefinitions,
  aggressiveProfile,
} from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatResourceProfile, IntentProfile } from '@ai-rpg-engine/modules';
import {
  manifest,
  player,
  medic,
  scavenger,
  leader,
  shambler,
  runner,
  bloaterAlpha,
  bloaterAlphaBoss,
  zones,
  districts,
  medicDialogue,
  antibioticsEffect,
  survivalTree,
  zombieAbilities,
  zombieStatusDefinitions,
  progressionRewards,
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

// Zombie combat resource profile — infection is consequence, not currency
const zombieCombatProfile: CombatResourceProfile = {
  packId: 'zombie',
  gains: [
    { trigger: 'take-damage', resourceId: 'infection', amount: 5 },
  ],
  spends: [],
  drains: [],
  aiModifiers: [
    {
      resourceId: 'infection',
      highThreshold: 70,
      highModifiers: { attack: 15 },
      lowThreshold: 40,
      lowModifiers: { disengage: 10 },
    },
  ],
};

// ─── Intent profiles (F1-cs-a) ──────────────────────────────────────────────
// Every hostile entity in content.ts declares an ai.profileId. The cognition
// config must supply an IntentProfile for each declared id — with an empty
// profileMap no enemy ever resolves an intent, so enemies never act.
/**
 * Intent profiles wired into this pack's cognition config:
 * - shambler / runner / bloater-alpha → aggressive (mindless hunger; the dead
 *   do not stalk or scheme — they swarm whatever lives)
 */
export const zombieIntentProfiles: IntentProfile[] = [aggressiveProfile];

export function createGame(seed?: number): Engine {
  registerStatusDefinitions(zombieStatusDefinitions);
  const combat = buildCombatStack({
    statMapping: { attack: 'fitness', precision: 'wits', resolve: 'nerve' },
    playerId: 'survivor',
    resourceProfile: zombieCombatProfile,
    biasTags: ['zombie', 'undead'],
    recovery: { safeZoneTags: ['safe', 'home-base'] },
    cognition: {
      profiles: zombieIntentProfiles,
      decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 },
    },
  });

  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: zombieMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      ...combat.modules,
      createInventoryCore([antibioticsEffect]),
      createDialogueCore([medicDialogue]),
      createPerceptionFilter({ perceptionStat: 'wits' }),
      createProgressionCore({
        trees: [survivalTree],
        // T0-progression-ceiling: kills + dialogue + first-visit + boss bonus
        // (defined next to the tree in content.ts so the arithmetic is testable).
        rewards: progressionRewards,
      }),
      createEnvironmentCore({
        // Hazards mutate entity.resources directly (deterministic, clamped);
        // environment-core does not record the returned events. Return [].
        hazards: [{
          id: 'roaming-dead',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('roaming-dead') ?? false,
          effect: (_zone, entity, _world, _tick) => {
            entity.resources.stamina = Math.max(0, (entity.resources.stamina ?? 0) - 2);
            return [];
          },
        },
        {
          id: 'infection-risk',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('infection-risk') ?? false,
          effect: (_zone, entity, _world, _tick) => {
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
      createBossPhaseListener(bloaterAlphaBoss),
      createAbilityCore({ abilities: zombieAbilities, statMapping: { power: 'fitness', precision: 'wits', focus: 'nerve' } }),
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
  engine.store.addEntity(player);
  engine.store.addEntity(medic);
  engine.store.addEntity(scavenger);
  engine.store.addEntity(leader);
  engine.store.addEntity(shambler);
  engine.store.addEntity(runner);
  engine.store.addEntity(bloaterAlpha);

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

  return engine;
}
