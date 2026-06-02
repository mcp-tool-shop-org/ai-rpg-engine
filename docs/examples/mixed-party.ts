/**
 * Mixed-Party Composition Example
 *
 * Two playstyles — a brute fighter and a cunning mystic — coexisting
 * in the same game. The stat mapping is shared (as it must be), but
 * each entity emphasizes different stats to create distinct play feels.
 *
 * This proves that "playstyle" is an entity-level concern, not a
 * game-level lock. One stat mapping supports many archetypes.
 *
 * Inspired by: Fantasy (simple combat), Ronin (dual protector roles)
 */

import { Engine } from '@ai-rpg-engine/core';
import type { GameManifest, EntityState, ZoneState } from '@ai-rpg-engine/core';
import {
  traversalCore, statusCore, buildCombatStack,
  createPerceptionFilter,
  createSimulationInspector,
} from '@ai-rpg-engine/modules';

export function createMixedPartyGame(seed = 42): Engine {
  const manifest: GameManifest = {
    id: 'mixed-party',
    title: 'Mixed Party',
    version: '1.0.0',
    engineVersion: '1.0.0',
    ruleset: 'mixed-party',
    modules: ['traversal-core', 'status-core', 'combat-core'],
    contentPacks: ['mixed-party'],
  };

  // One stat mapping, two playstyles.
  // "Power" drives damage. "Finesse" drives hit chance. "Grit" drives defense.
  // The fighter stacks power+grit. The mystic stacks finesse+grit.
  // buildCombatStack already bundles cognition-core. Configure it through the
  // stack's `cognition` option rather than adding a second createCognitionCore()
  // to the module list (that would register the module id twice and throw).
  const combat = buildCombatStack({
    statMapping: { attack: 'power', precision: 'finesse', resolve: 'grit' },
    playerId: 'fighter',
    engagement: {
      backlineTags: ['caster'],         // mystic stays backline
      protectorTags: ['bodyguard'],     // fighter protects
    },
    biasTags: ['beast', 'undead'],
    cognition: { decay: { baseRate: 0.02, pruneThreshold: 0.05, instabilityFactor: 0.5 } },
  });

  const engine = new Engine({
    manifest,
    seed,
    modules: [
      traversalCore,
      statusCore,
      ...combat.modules,
      createPerceptionFilter(),
      createSimulationInspector(),
    ],
  });

  // --- Entities ---
  // All three share zoneId 'forest-clearing' and carry stamina so combat
  // resolves rather than being rejected for zone/stamina reasons.

  // The fighter: high power + grit, low finesse. Bodyguard role means
  // they intercept attacks aimed at the mystic.
  const fighter: EntityState = {
    id: 'fighter',
    blueprintId: 'fighter',
    type: 'player',
    name: 'Iron Valk',
    tags: ['human', 'bodyguard'],
    stats: { power: 8, finesse: 3, grit: 6 },
    resources: { hp: 35, maxHp: 35, stamina: 5 },
    zoneId: 'forest-clearing',
    statuses: [],
  };

  // The mystic: high finesse, low power. Caster tag keeps them backline.
  // They hit more often but deal less damage per strike.
  const mystic: EntityState = {
    id: 'mystic',
    blueprintId: 'mystic',
    type: 'ally',
    name: 'Sera of the Veil',
    tags: ['human', 'caster', 'companion:scholar'],
    stats: { power: 2, finesse: 8, grit: 5 },
    resources: { hp: 18, maxHp: 18, stamina: 5 },
    zoneId: 'forest-clearing',
    statuses: [],
  };

  // Enemy: a beast that attacks whoever has weaker interception cover.
  const wolf: EntityState = {
    id: 'dire-wolf',
    blueprintId: 'dire-wolf',
    type: 'enemy',
    name: 'Dire Wolf',
    tags: ['beast'],
    stats: { power: 5, finesse: 6, grit: 3 },
    resources: { hp: 15, maxHp: 15, stamina: 5 },
    zoneId: 'forest-clearing',
    statuses: [],
  };

  const clearing: ZoneState = {
    id: 'forest-clearing',
    roomId: 'forest-clearing',
    name: 'Forest Clearing',
    tags: ['outdoor'],
    neighbors: [],
  };

  engine.store.addZone(clearing);
  engine.store.addEntity(fighter);
  engine.store.addEntity(mystic);
  engine.store.addEntity(wolf);
  engine.store.state.playerId = 'fighter';
  engine.store.setPlayerLocation('forest-clearing');

  // The fighter intercepts attacks targeting the mystic (bodyguard + protectorTags).
  // The mystic stays backline (caster tag + backlineTags).
  // Same stat mapping, two distinct combat feels.
  return engine;
}

const _mixedParty = createMixedPartyGame();
void _mixedParty;
