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
  aggressiveProfile,
} from '@ai-rpg-engine/modules';
import { createEquipmentCore } from '@ai-rpg-engine/equipment';
import * as engineModules from '@ai-rpg-engine/modules';
import type { PresentationRule, CombatResourceProfile, IntentProfile } from '@ai-rpg-engine/modules';
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
  progressionRewards,
  encounterSpawnContent,
  itemCatalog,
  colonyQuests,
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

// ─── Intent profiles (F1-cs-a) ──────────────────────────────────────────────
// Every hostile entity in content.ts declares an ai.profileId. The cognition
// config must supply an IntentProfile for each declared id — with an empty
// profileMap no enemy ever resolves an intent, so enemies never act.
// `territorial` is a newer built-in; resolve it from the installed modules
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
 * - breached-drone / swarm-larva → aggressive (malfunctioning security and
 *   swarming larvae attack whatever crosses them)
 * - resonance-entity → territorial (guards the signal in its cavern)
 */
export const colonyIntentProfiles: IntentProfile[] = [
  aggressiveProfile,
  resolveBuiltinProfile('territorial', aggressiveProfile.evaluate),
];

export function createGame(seed?: number): Engine {
  registerStatusDefinitions(colonyStatusDefinitions);
  const combat = buildCombatStack({
    statMapping: { attack: 'engineering', precision: 'awareness', resolve: 'command' },
    playerId: 'commander',
    resourceProfile: colonyCombatProfile,
    biasTags: ['drone', 'alien'],
    engagement: { backlineTags: ['ranged'], protectorTags: ['bodyguard'] },
    recovery: { safeZoneTags: ['safe', 'colony-core'] },
    cognition: {
      profiles: colonyIntentProfiles,
      decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 },
    },
  });

  // Strategic tier in one call (F-ENG005-build-world-stack): the same eight
  // modules this setup used to hand-list, same wiring order, same configs.
  // ONE faction roster feeds both faction-cognition and defeat-fallout.
  const worldStack = buildWorldStack({
    playerId: 'commander',
    factions: [{
      factionId: 'colony-council',
      entityIds: ['dr_vasquez', 'chief_okafor'],
      cohesion: 0.5,
    }],
    environment: {
      // Hazards mutate entity.resources directly (deterministic, clamped);
      // environment-core does not record the returned events. Return [].
      hazards: [{
        id: 'power-drain',
        triggerOn: 'world.zone.entered',
        condition: (zone) => zone.hazards?.includes('power-drain') ?? false,
        effect: (_zone, entity, _world, _tick) => {
          entity.resources.power = Math.max(0, (entity.resources.power ?? 0) - 5);
          return [];
        },
      },
      {
        id: 'resonance-field',
        triggerOn: 'world.zone.entered',
        condition: (zone) => zone.hazards?.includes('resonance-field') ?? false,
        effect: (_zone, entity, _world, _tick) => {
          entity.resources.morale = Math.max(0, (entity.resources.morale ?? 0) - 3);
          entity.resources.power = Math.max(0, (entity.resources.power ?? 0) - 8);
          return [];
        },
      }],
    },
    rumors: { propagationDelay: 2 },
    districts,
    presentationRules: [alienPerception],
    // F-ENG005-encounter-spawn-wiring: the authored encounters + per-zone
    // tables drive zone-entry spawns via the world tick.
    encounterSpawn: { gameId: manifest.id, ...encounterSpawnContent },
    // F-c07d6024-quest-loop-min: the authored quests give the push past the
    // command module its explicit reason. quest-core validates at
    // construction (fail loud) and drives offer → track → complete → reward
    // off the live event stream.
    quests: { gameId: manifest.id, quests: colonyQuests },
    // V3-GEN-1/2 (genre-mechanical fix, wave 2): this starter's own bare
    // genre key ('colony-minimal' minus its '-minimal' suffix) — NOT
    // manifest.genres, a different free-text vocabulary (see world-stack.ts's
    // file-header contract). 'colony' matches a GENRE_BUYABLE_STOCK/
    // GENRE_RECIPES entry, so buy/craft/repair/modify now resolve
    // colony-flavored stock/recipes instead of the universal fallback.
    tradeGenre: 'colony',
    craftingGenre: 'colony',
    economyGenre: 'colony',
  });

  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: colonyMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      ...combat.modules,
      createInventoryCore([emergencyCellEffect]),
      createDialogueCore([scientistDialogue]),
      createPerceptionFilter({ perceptionStat: 'awareness' }),
      createProgressionCore({
        trees: [commanderTree],
        // T0-progression-ceiling: kills + dialogue + first-visit + boss bonus
        // (defined next to the tree in content.ts so the arithmetic is testable).
        rewards: progressionRewards,
      }),
      ...worldStack.modules,
      createBossPhaseListener(resonanceBoss),
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
  engine.store.addEntity(player);
  engine.store.addEntity(scientist);
  engine.store.addEntity(security);
  engine.store.addEntity(drone);
  engine.store.addEntity(resonance);
  engine.store.addEntity(swarmLarva);

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
  // Allied colonists carry the 'colonist' tag (there is no 'ally' tag in this
  // pack). Losing one of the crew — anyone but the commander, and not by the
  // commander's own hand — costs the commander morale.
  engine.store.events.on('combat.entity.defeated', (event) => {
    const defeatedId = event.payload.entityId as string;
    if (defeatedId === 'commander') return;
    const defeated = engine.store.state.entities[defeatedId];
    if (defeated?.tags.includes('colonist') && event.payload.defeatedBy !== 'commander') {
      const p = engine.store.state.entities['commander'];
      if (p) p.resources.morale = Math.max(0, (p.resources.morale ?? 0) - 5);
    }
  });

  return engine;
}
