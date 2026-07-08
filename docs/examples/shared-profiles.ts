/**
 * Shared Profiles Example — many playstyles, one world, one controller
 *
 * The "shared profiles in a shared world" case: several archetype Profiles
 * authored independently, linted as a SET with validateProfileSet, then
 * installed side by side in ONE WorldState where each entity resolves combat
 * through its own mapping.
 *
 * Two layers cooperate here:
 *   - `Profile` (authoring): the full per-archetype bundle — stat mapping,
 *     ability pack, tags — validated by buildProfile / validateProfileSet.
 *   - `RuleProfile` (runtime): the serialized slice of that bundle the
 *     engine resolves combat through. A Profile's `statMapping` IS the
 *     RuleProfile's — authoring feeds runtime directly.
 *
 * validateProfileSet catches what per-profile validation cannot: mistakes
 * that only exist BETWEEN profiles (duplicate ability ids, conflicting
 * resource caps, stat-name drift). This file shows a coherent set passing
 * and a colliding profile being caught.
 *
 * Note: this is the single-controller case — one process drives every
 * entity. Two human players sharing a world is a netcode problem, not a
 * profile problem, and is out of scope here.
 *
 * Inspired by: mixed-party.ts (per-entity resolution), Colony (multi-role crews)
 */

import { Engine } from '@ai-rpg-engine/core';
import type { GameManifest, EntityState, ZoneState } from '@ai-rpg-engine/core';
import {
  traversalCore, statusCore, buildCombatStack,
  createSimulationInspector,
  buildProfile, validateProfileSet,
} from '@ai-rpg-engine/modules';
import type { Profile } from '@ai-rpg-engine/modules';

// --- The party's profiles, authored independently ---

/**
 * Build the party's archetypes. Each `buildProfile` call validates one
 * bundle in isolation (unknown stats/resources, suspicious abilities) and
 * returns warn-and-degrade `warnings` instead of throwing.
 */
export function buildPartyProfiles(): { bulwark: Profile; hexweaver: Profile; warnings: string[] } {
  const bulwarkResult = buildProfile({
    id: 'bulwark',
    name: 'Bulwark',
    // damage from might, accuracy from poise, defense from grit
    statMapping: { attack: 'might', precision: 'poise', resolve: 'grit' },
    abilities: [{
      id: 'shield-rush', name: 'Shield Rush', verb: 'use-ability',
      tags: ['combat', 'damage'],
      target: { type: 'single' },
      costs: [{ resourceId: 'stamina', amount: 2 }],
      cooldown: 1,
      effects: [{ type: 'damage', params: { amount: 6 } }],
    }],
  });

  const hexweaverResult = buildProfile({
    id: 'hexweaver',
    name: 'Hexweaver',
    // damage from will, accuracy from focus — a different playstyle entirely.
    // Both profiles map resolve → grit: same name, same combat dimension, so
    // the set linter has nothing to flag.
    statMapping: { attack: 'will', precision: 'focus', resolve: 'grit' },
    abilities: [{
      id: 'soul-lash', name: 'Soul Lash', verb: 'use-ability',
      tags: ['combat', 'damage'],
      target: { type: 'single' },
      costs: [{ resourceId: 'stamina', amount: 2 }],
      cooldown: 1,
      effects: [{ type: 'damage', params: { amount: 5 } }],
    }],
  });

  return {
    bulwark: bulwarkResult.profile,
    hexweaver: hexweaverResult.profile,
    warnings: [...bulwarkResult.warnings, ...hexweaverResult.warnings],
  };
}

/**
 * A profile that is fine ON ITS OWN but breaks the set: it re-declares the
 * ability id 'shield-rush', which the bulwark already owns. buildProfile
 * cannot see that; validateProfileSet([bulwark, ironclad]) reports it as a
 * hard error (an ability id must resolve to exactly one definition).
 */
export function buildIroncladRival(): Profile {
  return buildProfile({
    id: 'ironclad',
    name: 'Ironclad',
    statMapping: { attack: 'might', precision: 'poise', resolve: 'grit' },
    abilities: [{
      id: 'shield-rush', name: 'Shield Rush (rival)', verb: 'use-ability',
      tags: ['combat', 'damage'],
      target: { type: 'single' },
      costs: [{ resourceId: 'stamina', amount: 3 }],
      cooldown: 2,
      effects: [{ type: 'damage', params: { amount: 7 } }],
    }],
  }).profile;
}

// --- One world, both profiles installed ---

export function createSharedProfilesWorld(seed = 42): Engine {
  const manifest: GameManifest = {
    id: 'shared-profiles',
    title: 'Shared Profiles',
    version: '1.0.0',
    engineVersion: '1.0.0',
    ruleset: 'shared-profiles',
    modules: ['traversal-core', 'status-core', 'combat-core'],
    contentPacks: ['shared-profiles'],
  };

  // The world mapping is the golem's native statline — the fallback for any
  // entity without a ruleProfileId.
  const combat = buildCombatStack({
    statMapping: { attack: 'mass', precision: 'instinct', resolve: 'shell' },
    playerId: 'warden',
  });

  const engine = new Engine({
    manifest,
    seed,
    modules: [traversalCore, statusCore, ...combat.modules, createSimulationInspector()],
  });

  // Authoring feeds runtime: each Profile's statMapping becomes the
  // RuleProfile entry the engine resolves combat through.
  const { bulwark, hexweaver } = buildPartyProfiles();
  engine.store.state.ruleProfiles = {
    bulwark: { statMapping: bulwark.statMapping },
    hexweaver: { statMapping: hexweaver.statMapping },
  };

  // The warden reads bulwark: attack → might (8).
  const warden: EntityState = {
    id: 'warden',
    blueprintId: 'warden',
    type: 'player',
    name: 'Warden Kessa',
    tags: ['human', 'bodyguard'],
    faction: 'party',
    ruleProfileId: 'bulwark',
    stats: { might: 8, poise: 5, grit: 6 },
    resources: { hp: 30, maxHp: 30, stamina: 5 },
    zoneId: 'proving-grounds',
    statuses: [],
  };

  // The occultist reads hexweaver: attack → will (6). Same world, same
  // formulas, different mapping — that is the whole feature.
  const occultist: EntityState = {
    id: 'occultist',
    blueprintId: 'occultist',
    type: 'ally',
    name: 'Veyra the Occultist',
    tags: ['human', 'caster'],
    faction: 'party',
    ruleProfileId: 'hexweaver',
    stats: { will: 6, focus: 6, grit: 4 },
    resources: { hp: 20, maxHp: 20, stamina: 5 },
    zoneId: 'proving-grounds',
    statuses: [],
  };

  // The golem has no profile: it resolves through the world mapping
  // (attack → mass), untouched by the party's profiles.
  const golem: EntityState = {
    id: 'golem',
    blueprintId: 'golem',
    type: 'enemy',
    name: 'Proving Golem',
    tags: ['construct'],
    stats: { mass: 4, instinct: 2, shell: 8 },
    resources: { hp: 30, maxHp: 30, stamina: 5 },
    zoneId: 'proving-grounds',
    statuses: [],
  };

  const grounds: ZoneState = {
    id: 'proving-grounds',
    roomId: 'proving-grounds',
    name: 'Proving Grounds',
    tags: ['outdoor'],
    neighbors: [],
  };

  engine.store.addZone(grounds);
  engine.store.addEntity(warden);
  engine.store.addEntity(occultist);
  engine.store.addEntity(golem);
  engine.store.state.playerId = 'warden';
  engine.store.setPlayerLocation('proving-grounds');

  return engine;
}

// Lint the set, then let both archetypes strike in the same world: the
// warden's damage derives from might (8), the occultist's from will (6).
const { bulwark, hexweaver } = buildPartyProfiles();
const cleanSet = validateProfileSet([bulwark, hexweaver]);
void cleanSet; // .ok === true — no cross-profile errors
const collidingSet = validateProfileSet([bulwark, buildIroncladRival()]);
void collidingSet; // .ok === false — duplicate ability id 'shield-rush'
const _world = createSharedProfilesWorld();
void _world;
