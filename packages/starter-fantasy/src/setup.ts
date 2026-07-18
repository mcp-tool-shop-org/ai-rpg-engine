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
  cautiousProfile,
} from '@ai-rpg-engine/modules';
import * as engineModules from '@ai-rpg-engine/modules';
import type { PresentationRule, IntentProfile } from '@ai-rpg-engine/modules';
import {
  manifest,
  player,
  pilgrim,
  brotherAldric,
  sisterMaren,
  ashGhoul,
  cryptWarden,
  cryptStalker,
  cryptWardenBoss,
  zones,
  districts,
  pilgrimDialogue,
  healingDraughtEffect,
  combatMasteryTree,
  fantasyAbilities,
  fantasyStatusDefinitions,
} from './content.js';
import { fantasyMinimalRuleset } from './ruleset.js';

// Fantasy-specific presentation rule: undead perceive all living as threats
const undeadHostilePerception: PresentationRule = {
  id: 'undead-threat-framing',
  eventPatterns: ['world.zone.entered'],
  priority: 5,
  condition: (_event, ctx) => ctx.observer.tags.includes('undead'),
  transform: (event, _ctx) => ({
    ...event,
    payload: {
      ...event.payload,
      _subjectiveDescription: 'warm blood encroaches upon the sacred dead',
      _actorDescription: 'a living trespasser',
      _undeadPerception: true,
    },
  }),
};

// ─── Intent profiles (F1-cs-a) ──────────────────────────────────────────────
// Every hostile entity in content.ts declares an ai.profileId. The cognition
// config must supply an IntentProfile for each declared id: cognition-core
// builds its profileMap from `cognition.profiles`, and with an empty map no
// enemy ever resolves an intent — enemies simply never act. `territorial` and
// `calculating` are newer built-ins; resolve them from the installed modules
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
 * - ash-ghoul → aggressive (brute that hurls itself at the living)
 * - crypt-warden → territorial (boss bound to defend the crypt)
 * - crypt-stalker → cautious (ambusher that observes before striking)
 */
export const fantasyIntentProfiles: IntentProfile[] = [
  aggressiveProfile,
  cautiousProfile,
  resolveBuiltinProfile('territorial', aggressiveProfile.evaluate),
];

export function createGame(seed?: number): Engine {
  registerStatusDefinitions(fantasyStatusDefinitions);

  // Combat stack: vigor for damage, instinct for hit/dodge, will for guard
  // Fantasy is the simplest starter — no resource profile, no engagement roles
  const combat = buildCombatStack({
    statMapping: { attack: 'vigor', precision: 'instinct', resolve: 'will' },
    playerId: 'player',
    biasTags: ['undead'],
    recovery: { safeZoneTags: ['safe', 'sacred'] },
    cognition: {
      profiles: fantasyIntentProfiles,
      decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 },
    },
  });

  const engine = new Engine({
    manifest,
    seed: seed ?? 42,
    ruleset: fantasyMinimalRuleset,
    modules: [
      traversalCore,
      statusCore,
      ...combat.modules,
      createInventoryCore([healingDraughtEffect]),
      createDialogueCore([pilgrimDialogue]),
      createPerceptionFilter(),
      createProgressionCore({
        trees: [combatMasteryTree],
        rewards: [{
          eventPattern: 'combat.entity.defeated',
          currencyId: 'xp',
          amount: 15,
          recipient: 'actor',
        }],
      }),
      createEnvironmentCore({
        // Hazard effects apply their consequence by mutating entity.resources
        // directly: environment-core invokes effect() for its side-effects and
        // does not record the returned events. Mutation is deterministic (pure
        // arithmetic, always clamped) so it stays replayable. Return [].
        hazards: [{
          id: 'unstable-floor',
          triggerOn: 'world.zone.entered',
          condition: (zone) => zone.hazards?.includes('unstable floor') ?? false,
          effect: (_zone, entity, _world, _tick) => {
            entity.resources.stamina = Math.max(0, (entity.resources.stamina ?? 0) - 1);
            return [];
          },
        }],
      }),
      createFactionCognition({
        factions: [{
          factionId: 'chapel-undead',
          entityIds: ['ash-ghoul', 'crypt-warden'],
          cohesion: 0.7,
        }],
      }),
      createRumorPropagation({ propagationDelay: 2 }),
      createDistrictCore({ districts }),
      createBeliefProvenance(),
      createObserverPresentation({
        rules: [undeadHostilePerception],
      }),
      createDefeatFallout({
        factions: [{ factionId: 'chapel-undead', entityIds: ['ash-ghoul', 'crypt-warden'] }],
        playerId: 'player',
      }),
      createBossPhaseListener(cryptWardenBoss),
      createAbilityCore({ abilities: fantasyAbilities, statMapping: { power: 'vigor', precision: 'instinct', focus: 'will' } }),
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
  engine.store.addEntity(structuredClone(pilgrim));
  engine.store.addEntity(structuredClone(brotherAldric));
  engine.store.addEntity(structuredClone(sisterMaren));
  engine.store.addEntity(structuredClone(ashGhoul));
  engine.store.addEntity(structuredClone(cryptStalker));
  engine.store.addEntity(structuredClone(cryptWarden));

  // Set player
  engine.store.state.playerId = 'player';
  engine.store.state.locationId = 'chapel-entrance';

  // Listen for pilgrim gift — give healing draught after dialogue
  engine.store.events.on('dialogue.ended', (event) => {
    if (event.payload.dialogueId === 'pilgrim-talk') {
      const world = engine.store.state;
      if (world.globals['pilgrim-warned']) {
        const playerEntity = world.entities['player'];
        if (playerEntity && !(playerEntity.inventory ?? []).includes('healing-draught')) {
          const giveEvent = giveItem(playerEntity, 'healing-draught', engine.tick);
          engine.store.recordEvent(giveEvent);
        }
      }
    }
  });

  // Audio cue on entering crypt
  engine.store.events.on('world.zone.entered', (event) => {
    if (event.payload.zoneId === 'crypt-chamber') {
      engine.store.emitEvent('audio.cue.requested', {
        cueId: 'scene.crypt-reveal',
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
