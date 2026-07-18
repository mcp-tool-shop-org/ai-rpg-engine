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
  COMBAT_STATES,
  aggressiveProfile,
  cautiousProfile,
} from '@ai-rpg-engine/modules';
import * as engineModules from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatResourceProfile, IntentProfile } from '@ai-rpg-engine/modules';
import {
  manifest,
  player,
  widow,
  constable,
  servant,
  thug,
  hiredMuscle,
  crimeBoss,
  crimeBossDef,
  zones,
  districts,
  widowDialogue,
  smellingSaltsEffect,
  deductionTree,
  detectiveAbilities,
  detectiveStatusDefinitions,
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

// Detective combat resource profile — calm under pressure
const detectiveCombatProfile: CombatResourceProfile = {
  packId: 'detective',
  gains: [
    { trigger: 'guard-absorb', resourceId: 'composure', amount: 2 },
    { trigger: 'brace', resourceId: 'composure', amount: 1 },
  ],
  spends: [
    { action: 'reposition', resourceId: 'composure', amount: 3, effects: { resistState: COMBAT_STATES.EXPOSED, resistChance: 60 } },
    { action: 'guard', resourceId: 'composure', amount: 4, effects: { resistState: COMBAT_STATES.OFF_BALANCE, resistChance: 70 } },
  ],
  drains: [
    { trigger: 'take-damage', resourceId: 'composure', amount: 3 },
    { trigger: 'off-balance-applied', resourceId: 'composure', amount: 2 },
  ],
  aiModifiers: [
    {
      resourceId: 'composure',
      lowThreshold: 10,
      lowModifiers: { disengage: 15 },
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
 * - dock-thug / hired-muscle → aggressive (enforcers who lead with fists)
 * - Mr. Hargreaves → calculating (mastermind who strikes only when certain)
 */
export const detectiveIntentProfiles: IntentProfile[] = [
  aggressiveProfile,
  resolveBuiltinProfile('calculating', cautiousProfile.evaluate),
];

export function createGame(seed?: number): Engine {
  registerStatusDefinitions(detectiveStatusDefinitions);
  const combat = buildCombatStack({
    statMapping: { attack: 'grit', precision: 'perception', resolve: 'eloquence' },
    playerId: 'inspector',
    resourceProfile: detectiveCombatProfile,
    biasTags: ['criminal'],
    cognition: {
      profiles: detectiveIntentProfiles,
      decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 },
    },
  });

  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: detectiveMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      ...combat.modules,
      createInventoryCore([smellingSaltsEffect]),
      createDialogueCore([widowDialogue]),
      createPerceptionFilter({ perceptionStat: 'perception' }),
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
        // Hazards mutate entity.resources directly (deterministic, clamped);
        // environment-core does not record the returned events. Return [].
        hazards: [{
          id: 'dark-alley',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('ambush-risk') ?? false,
          effect: (_zone, entity, _world, _tick) => {
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
      createBossPhaseListener(crimeBossDef),
      createAbilityCore({ abilities: detectiveAbilities, statMapping: { power: 'grit', precision: 'perception', focus: 'eloquence' } }),
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
  engine.store.addEntity(structuredClone(player));
  engine.store.addEntity(structuredClone(widow));
  engine.store.addEntity(structuredClone(constable));
  engine.store.addEntity(structuredClone(servant));
  engine.store.addEntity(structuredClone(thug));
  engine.store.addEntity(structuredClone(hiredMuscle));
  engine.store.addEntity(structuredClone(crimeBoss));

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

  // Combat resource gains/drains/spends handled by detectiveCombatProfile

  return engine;
}
