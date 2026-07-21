// Game setup — wire content into engine

import { Engine } from '@ai-rpg-engine/core';
import {
  traversalCore,
  statusCore,
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
  createEncounterSpawn,
  createBossPhaseListener,
  createAbilityCore,
  createAbilityEffects,
  createAbilityReview,
  registerStatusDefinitions,
  buildCombatStack,
  aggressiveProfile,
  cautiousProfile,
} from '@ai-rpg-engine/modules';
import * as engineModules from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatResourceProfile, IntentProfile } from '@ai-rpg-engine/modules';
import {
  manifest,
  player,
  duchessMorvaine,
  cassius,
  servantElara,
  witchHunter,
  feralThrall,
  elderVampire,
  elderVampireBoss,
  zones,
  districts,
  duchessDialogue,
  bloodVialEffect,
  bloodMasteryTree,
  progressionRewards,
  vampireAbilities,
  vampireStatusDefinitions,
  encounterSpawnContent,
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

// Vampire combat resource profile — hunger-driven aggression
const vampireCombatProfile: CombatResourceProfile = {
  packId: 'vampire',
  gains: [
    { trigger: 'attack-hit', resourceId: 'bloodlust', amount: 5 },
    { trigger: 'defeat-enemy', resourceId: 'bloodlust', amount: 15 },
  ],
  spends: [
    { action: 'attack', resourceId: 'bloodlust', amount: 20, effects: { damageBonus: 4 } },
    { action: 'reposition', resourceId: 'bloodlust', amount: 10, effects: { repositionBonus: 15 } },
  ],
  drains: [
    { trigger: 'defeat-enemy', resourceId: 'humanity', amount: 1 },
  ],
  aiModifiers: [
    {
      resourceId: 'bloodlust',
      highThreshold: 60,
      highModifiers: { attack: 15, finish: 10 },
    },
    {
      resourceId: 'humanity',
      lowThreshold: 10,
      lowModifiers: { guard: -10, disengage: -10 },
    },
  ],
};

// ─── Intent profiles (F1-cs-a) ──────────────────────────────────────────────
// Every hostile entity in content.ts declares an ai.profileId. The cognition
// config must supply an IntentProfile for each declared id — with an empty
// profileMap no enemy ever resolves an intent, so enemies never act.
// `calculating` is a newer built-in; resolve it from the installed modules
// build when present, otherwise back the same id with the closest established
// behavior so every declared id still resolves.
function resolveBuiltinProfile(
  id: 'territorial' | 'calculating',
  fallbackEvaluate: IntentProfile['evaluate'],
): IntentProfile {
  const candidate = (engineModules as unknown as Record<string, unknown>)[`${id}Profile`] as
    | IntentProfile
    | undefined;
  if (candidate && candidate.id === id && typeof candidate.evaluate === 'function') {
    return candidate;
  }
  return { id, evaluate: fallbackEvaluate };
}

/**
 * Intent profiles wired into this pack's cognition config:
 * - feral-thrall → aggressive (bloodlust-driven feeder)
 * - witch-hunter → calculating (methodical hunter who picks his moment)
 * - elder-vampire → calculating (court schemer who feeds selectively)
 */
export const vampireIntentProfiles: IntentProfile[] = [
  aggressiveProfile,
  resolveBuiltinProfile('calculating', cautiousProfile.evaluate),
];

export function createGame(seed?: number): Engine {
  registerStatusDefinitions(vampireStatusDefinitions);

  // Combat stack: vitality for damage, cunning for hit/dodge, presence for guard
  const combat = buildCombatStack({
    statMapping: { attack: 'vitality', precision: 'cunning', resolve: 'presence' },
    playerId: 'player',
    resourceProfile: vampireCombatProfile,
    biasTags: ['vampire', 'feral', 'hunter'],
    engagement: { backlineTags: ['ranged', 'caster', 'thrall'] },
    recovery: { safeZoneTags: ['safe', 'opulent'] },
    cognition: {
      profiles: vampireIntentProfiles,
      decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 },
    },
  });

  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: vampireMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      ...combat.modules,
      createInventoryCore([bloodVialEffect]),
      createDialogueCore([duchessDialogue]),
      createPerceptionFilter({ perceptionStat: 'cunning' }),
      createProgressionCore({
        trees: [bloodMasteryTree],
        // T0-progression-ceiling: kills + dialogue + first-visit + boss bonus
        // (defined next to the tree in content.ts so the arithmetic is testable).
        rewards: progressionRewards,
      }),
      createEnvironmentCore({
        // Hazards mutate entity.resources directly (deterministic, clamped);
        // environment-core does not record the returned events. Return [].
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
      // F-ENG005-encounter-spawn-wiring: the authored encounters + per-zone
      // tables drive zone-entry spawns via the world tick.
      createEncounterSpawn({ gameId: manifest.id, ...encounterSpawnContent }),
      createBossPhaseListener(elderVampireBoss),
      createAbilityCore({ abilities: vampireAbilities, statMapping: { power: 'vitality', precision: 'cunning', focus: 'presence' } }),
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
  engine.store.addEntity(duchessMorvaine);
  engine.store.addEntity(cassius);
  engine.store.addEntity(servantElara);
  engine.store.addEntity(witchHunter);
  engine.store.addEntity(feralThrall);
  engine.store.addEntity(elderVampire);

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

  // Combat resource gains/drains/spends handled by vampireCombatProfile

  // --- Defeat Fallout: violence erodes humanity ---
  engine.store.events.on('defeat.fallout.triggered', (event) => {
    if (event.payload.actorId === 'player') {
      const p = engine.store.state.entities['player'];
      if (p) p.resources.humanity = Math.max(0, (p.resources.humanity ?? 0) - 1);
    }
  });

  return engine;
}
