// Game setup — wire content into engine

import { Engine } from '@ai-rpg-engine/core';
import {
  traversalCore,
  statusCore,
  buildCombatStack,
  buildWorldStack,
  createInventoryCore,
  createDialogueCore,
  createPerceptionFilter,
  createProgressionCore,
  createSimulationInspector,
  giveItem,
  createBossPhaseListener,
  createAbilityCore,
  createAbilityEffects,
  createAbilityReview,
  registerStatusDefinitions,
  applyStatus,
  removeStatus,
  COMBAT_STATES,
  aggressiveProfile,
  cautiousProfile,
} from '@ai-rpg-engine/modules';
import { createEquipmentCore } from '@ai-rpg-engine/equipment';
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
  progressionRewards,
  encounterSpawnContent,
  itemCatalog,
  detectiveQuests,
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

  // Strategic tier in one call (F-ENG005-build-world-stack): the same eight
  // modules this setup used to hand-list, same wiring order, same configs.
  // ONE faction roster feeds both faction-cognition and defeat-fallout.
  const worldStack = buildWorldStack({
    playerId: 'inspector',
    factions: [{
      factionId: 'dockworkers',
      entityIds: ['dock_thug'],
      cohesion: 0.5,
    }],
    environment: {
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
    },
    rumors: { propagationDelay: 2 },
    districts,
    presentationRules: [suspectParanoia],
    // F-ENG005-encounter-spawn-wiring: the authored encounters + per-zone
    // tables drive zone-entry spawns via the world tick.
    encounterSpawn: { gameId: manifest.id, ...encounterSpawnContent },
    // F-c07d6024-quest-loop-min: the authored quests give the investigation
    // its explicit reason to keep moving. quest-core validates at
    // construction (fail loud) and drives offer → track → complete → reward
    // off the live event stream.
    quests: { gameId: manifest.id, quests: detectiveQuests },
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
        // T0-progression-ceiling: kills + dialogue + first-visit + boss bonus
        // (defined next to the tree in content.ts so the arithmetic is testable).
        rewards: progressionRewards,
      }),
      ...worldStack.modules,
      createBossPhaseListener(crimeBossDef),
      // F-86b9145d: the equip loop — `equip`/`unequip` verbs over the pack's
      // item catalog, mirroring starter-gladiator's F-ENG008 wiring exactly.
      createEquipmentCore({
        catalog: itemCatalog,
        statuses: {
          registerDefinitions: registerStatusDefinitions,
          apply: applyStatus,
          remove: removeStatus,
        },
      }),
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
  engine.store.addEntity(player);
  engine.store.addEntity(widow);
  engine.store.addEntity(constable);
  engine.store.addEntity(servant);
  engine.store.addEntity(thug);
  engine.store.addEntity(hiredMuscle);
  engine.store.addEntity(crimeBoss);

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
